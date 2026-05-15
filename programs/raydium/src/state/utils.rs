use crate::state::constants::FEE_RATE_DENOMINATOR;
use crate::state::errors::AmmError;
use anchor_lang::prelude::*;

pub struct SwapResult {
    pub amount_out: u64,
    pub amount_in: u64,
    pub trade_fee: u64,
    pub lp_fee: u64,
    pub protocol_fee: u64,
    pub fund_fee: u64,
}

pub fn calc_add(
    amount_a: u64,
    amount_b: u64,
    reserve_a: u64,
    reserve_b: u64,
    lp_supply: u64,
) -> Result<(u64, u64, u64)> {
    require!(amount_a > 0 && amount_b > 0, AmmError::ZeroAmount);

    if lp_supply == 0 {
        let product = (amount_a as u128)
            .checked_mul(amount_b as u128)
            .ok_or(AmmError::MathOverflow)?;
        let lp_mint = u64::try_from(integer_sqrt(product)).map_err(|_| AmmError::MathOverflow)?;
        require!(lp_mint > 0, AmmError::InsufficientLiquidityMinted);
        return Ok((amount_a, amount_b, lp_mint));
    }

    require!(reserve_a > 0 && reserve_b > 0, AmmError::EmptyReserves);

    let optimal_b = (amount_a as u128)
        .checked_mul(reserve_b as u128)
        .ok_or(AmmError::MathOverflow)?
        .checked_div(reserve_a as u128)
        .ok_or(AmmError::MathOverflow)?;

    let (final_a, final_b) = if optimal_b <= amount_b as u128 {
        (
            amount_a,
            u64::try_from(optimal_b).map_err(|_| AmmError::MathOverflow)?,
        )
    } else {
        let optimal_a = (amount_b as u128)
            .checked_mul(reserve_a as u128)
            .ok_or(AmmError::MathOverflow)?
            .checked_div(reserve_b as u128)
            .ok_or(AmmError::MathOverflow)?;
        (
            u64::try_from(optimal_a).map_err(|_| AmmError::MathOverflow)?,
            amount_b,
        )
    };

    let lp_from_a = (final_a as u128)
        .checked_mul(lp_supply as u128)
        .ok_or(AmmError::MathOverflow)?
        .checked_div(reserve_a as u128)
        .ok_or(AmmError::MathOverflow)?;

    let lp_from_b = (final_b as u128)
        .checked_mul(lp_supply as u128)
        .ok_or(AmmError::MathOverflow)?
        .checked_div(reserve_b as u128)
        .ok_or(AmmError::MathOverflow)?;

    let lp_mint = u64::try_from(lp_from_a.min(lp_from_b)).map_err(|_| AmmError::MathOverflow)?;
    require!(lp_mint > 0, AmmError::InsufficientLiquidityMinted);
    Ok((final_a, final_b, lp_mint))
}

pub fn calc_remove(lp_burn: u64, lp_supply: u64, res_a: u64, res_b: u64) -> Result<(u64, u64)> {
    let amt_a = (lp_burn as u128)
        .checked_mul(res_a as u128)
        .ok_or(AmmError::MathOverflow)?
        .checked_div(lp_supply as u128)
        .ok_or(AmmError::MathOverflow)?;
    let amt_b = (lp_burn as u128)
        .checked_mul(res_b as u128)
        .ok_or(AmmError::MathOverflow)?
        .checked_div(lp_supply as u128)
        .ok_or(AmmError::MathOverflow)?;
    Ok((
        u64::try_from(amt_a).map_err(|_| AmmError::MathOverflow)?,
        u64::try_from(amt_b).map_err(|_| AmmError::MathOverflow)?,
    ))
}

pub fn integer_sqrt(n: u128) -> u128 {
    if n <= 1 {
        return n;
    }
    let mut x = n;
    let mut y = (x + 1) >> 1;
    while y < x {
        x = y;
        y = (x + n / x) >> 1;
    }
    x
}

fn split_fees(
    trade_fee_amount: u128,
    trade_fee_rate: u64,
    protocol_fee_rate: u64,
    fund_fee_rate: u64,
) -> Result<(u64, u64, u64)> {
    // Protocol and fund fees are a slice of trade_fee_amount, expressed in the same
    // denominator as trade_fee_rate (bps). Scale them relative to trade_fee_rate.
    // e.g. trade=2500 (0.25%), protocol=300 (0.03%) -> protocol gets 300/2500 = 12% of trade fee.
    // Default distribution: LP gets 84%, protocol owner gets 12%, treasury fund gets 4%.
    if trade_fee_rate == 0 {
        return Ok((0, 0, 0));
    }
    let trade_fee_rate_u128 = trade_fee_rate as u128;

    let protocol_fee = trade_fee_amount
        .checked_mul(protocol_fee_rate as u128)
        .ok_or(AmmError::MathOverflow)?
        .checked_div(trade_fee_rate_u128)
        .ok_or(AmmError::MathOverflow)?;

    let fund_fee = trade_fee_amount
        .checked_mul(fund_fee_rate as u128)
        .ok_or(AmmError::MathOverflow)?
        .checked_div(trade_fee_rate_u128)
        .ok_or(AmmError::MathOverflow)?;

    let lp_fee = trade_fee_amount
        .checked_sub(protocol_fee)
        .ok_or(AmmError::MathOverflow)?
        .checked_sub(fund_fee)
        .ok_or(AmmError::MathOverflow)?;

    Ok((
        u64::try_from(lp_fee).map_err(|_| AmmError::MathOverflow)?,
        u64::try_from(protocol_fee).map_err(|_| AmmError::MathOverflow)?,
        u64::try_from(fund_fee).map_err(|_| AmmError::MathOverflow)?,
    ))
}

/// Exact-in: user provides `amt_in` of token A, receives token B.
/// effective_in = amt_in * (FEE_DENOM - trade_fee_rate) / FEE_DENOM
/// amount_out   = reserve_b - k / (reserve_a + effective_in)
/// trade_fee    = amt_in - effective_in
pub fn calc_swap_exact_in(
    amt_in: u64,
    reserve_a: u64,
    reserve_b: u64,
    trade_fee_rate: u64,
    protocol_fee_rate: u64,
    fund_fee_rate: u64,
) -> Result<SwapResult> {
    require!(
        amt_in > 0 && reserve_a > 0 && reserve_b > 0,
        AmmError::ZeroAmount
    );

    let denom = FEE_RATE_DENOMINATOR as u128;
    let effective_rate = denom - trade_fee_rate as u128;

    let effective_in = (amt_in as u128)
        .checked_mul(effective_rate)
        .ok_or(AmmError::MathOverflow)?
        .checked_div(denom)
        .ok_or(AmmError::MathOverflow)?;

    let trade_fee_raw = (amt_in as u128) - effective_in;

    let k = (reserve_a as u128)
        .checked_mul(reserve_b as u128)
        .ok_or(AmmError::MathOverflow)?;

    let new_reserve_a = (reserve_a as u128)
        .checked_add(effective_in)
        .ok_or(AmmError::MathOverflow)?;

    // Ceiling: new_reserve_b = ceil(k / new_reserve_a)
    // This ensures new_reserve_a * new_reserve_b >= k
    let new_reserve_b = k
        .checked_add(new_reserve_a.checked_sub(1).ok_or(AmmError::MathOverflow)?)
        .ok_or(AmmError::MathOverflow)?
        .checked_div(new_reserve_a)
        .ok_or(AmmError::MathOverflow)?;

    require!(
        new_reserve_b < reserve_b as u128,
        AmmError::InsufficientLiquidity
    );

    let out = (reserve_b as u128)
        .checked_sub(new_reserve_b)
        .ok_or(AmmError::MathOverflow)?;
    require!(out > 0, AmmError::InsufficientOutputAmount);

    let (lp_fee, protocol_fee, fund_fee) = split_fees(
        trade_fee_raw,
        trade_fee_rate as u64,
        protocol_fee_rate,
        fund_fee_rate,
    )?;

    Ok(SwapResult {
        amount_out: u64::try_from(out).map_err(|_| AmmError::MathOverflow)?,
        amount_in: amt_in,
        trade_fee: u64::try_from(trade_fee_raw).map_err(|_| AmmError::MathOverflow)?,
        lp_fee,
        protocol_fee,
        fund_fee,
    })
}

/// Exact-out: user wants exactly `amt_out` of token B, pays token A.
/// amt_in = ceil( reserve_a * amt_out * FEE_DENOM
///               / ((reserve_b - amt_out) * (FEE_DENOM - trade_fee_rate)) )
pub fn calc_swap_exact_out(
    amt_out: u64,
    reserve_a: u64,
    reserve_b: u64,
    trade_fee_rate: u64,
    protocol_fee_rate: u64,
    fund_fee_rate: u64,
) -> Result<SwapResult> {
    require!(
        amt_out > 0 && reserve_a > 0 && reserve_b > 0,
        AmmError::ZeroAmount
    );
    require!(
        (reserve_b as u128) > amt_out as u128,
        AmmError::InsufficientLiquidity
    );

    let denom = FEE_RATE_DENOMINATOR as u128;
    let effective_rate = denom - trade_fee_rate as u128;

    // 1. Calculate required effective_in = ceil( (reserve_a * amt_out) / (reserve_b - amt_out) )
    let reserve_b_after = (reserve_b as u128)
        .checked_sub(amt_out as u128)
        .ok_or(AmmError::MathOverflow)?;

    let numerator_eff = (amt_out as u128)
        .checked_mul(reserve_a as u128)
        .ok_or(AmmError::MathOverflow)?;

    // Ceiling division for effective_in
    let effective_in = numerator_eff
        .checked_add(reserve_b_after.checked_sub(1).ok_or(AmmError::MathOverflow)?)
        .ok_or(AmmError::MathOverflow)?
        .checked_div(reserve_b_after)
        .ok_or(AmmError::MathOverflow)?;

    // 2. Calculate required amt_in = ceil( (effective_in * denom) / effective_rate )
    let numerator_in = effective_in
        .checked_mul(denom)
        .ok_or(AmmError::MathOverflow)?;

    // Ceiling division for amt_in
    let amt_in = numerator_in
        .checked_add(effective_rate.checked_sub(1).ok_or(AmmError::MathOverflow)?)
        .ok_or(AmmError::MathOverflow)?
        .checked_div(effective_rate)
        .ok_or(AmmError::MathOverflow)?;

    let trade_fee_raw = amt_in - effective_in;

    let (lp_fee, protocol_fee, fund_fee) = split_fees(
        trade_fee_raw,
        trade_fee_rate as u64,
        protocol_fee_rate,
        fund_fee_rate,
    )?;

    Ok(SwapResult {
        amount_out: amt_out,
        amount_in: u64::try_from(amt_in).map_err(|_| AmmError::MathOverflow)?,
        trade_fee: u64::try_from(trade_fee_raw).map_err(|_| AmmError::MathOverflow)?,
        lp_fee,
        protocol_fee,
        fund_fee,
    })
}
