use crate::state::ammconfig::AmmConfig;
use crate::state::constants::*;
use crate::state::errors::AmmError;
use crate::state::events::SwapEvent;
use crate::state::pool::PoolState;
use crate::state::utils::{calc_swap_exact_in, calc_swap_exact_out};

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

pub fn swap_exact_in(
    ctx: Context<Swap>,
    amount_in: u64,
    min_amount_out: u64,
    a_to_b: bool,
) -> Result<()> {
    let pool = &ctx.accounts.pool;
    let config = &ctx.accounts.amm_config;

    require!(pool.status == 2, AmmError::PoolNotInitialized);

    let (res_in, res_out) = if a_to_b {
        (pool.reserve_a, pool.reserve_b)
    } else {
        (pool.reserve_b, pool.reserve_a)
    };

    let result = calc_swap_exact_in(
        amount_in,
        res_in,
        res_out,
        config.trade_fees_bps,
        config.protocol_fees_bps,
        config.fund_fees_bps,
    )?;

    require!(
        result.amount_out >= min_amount_out,
        AmmError::SlippageToleranceMet
    );

    let (token_in, token_out, vault_in, vault_out, program_in, program_out, user_ata_in, user_ata_out) = if a_to_b {
        (
            &ctx.accounts.token_a, &ctx.accounts.token_b, 
            &ctx.accounts.vault_a, &ctx.accounts.vault_b,
            &ctx.accounts.token_program_a, &ctx.accounts.token_program_b,
            &ctx.accounts.user_ata_a, &ctx.accounts.user_ata_b
        )
    } else {
        (
            &ctx.accounts.token_b, &ctx.accounts.token_a, 
            &ctx.accounts.vault_b, &ctx.accounts.vault_a,
            &ctx.accounts.token_program_b, &ctx.accounts.token_program_a,
            &ctx.accounts.user_ata_b, &ctx.accounts.user_ata_a
        )
    };

    // Transfer input token: user → vault_in
    token_interface::transfer_checked(
        CpiContext::new(
            program_in.to_account_info(),
            TransferChecked {
                from: user_ata_in.to_account_info(),
                mint: token_in.to_account_info(),
                to: vault_in.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount_in,
        token_in.decimals,
    )?;

    let pool_key = pool.key();
    let seeds = &[AUTHORITY_SEED, pool_key.as_ref(), &[ctx.bumps.authority]];
    let signer = &[&seeds[..]];

    // Transfer output token: vault_out → user
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            program_out.to_account_info(),
            TransferChecked {
                from: vault_out.to_account_info(),
                mint: token_out.to_account_info(),
                to: user_ata_out.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
            signer,
        ),
        result.amount_out,
        token_out.decimals,
    )?;

    let pool = &mut ctx.accounts.pool;

    let lp_portion_in = amount_in
        .checked_sub(result.protocol_fee)
        .ok_or(AmmError::MathOverflow)?
        .checked_sub(result.fund_fee)
        .ok_or(AmmError::MathOverflow)?;

    if a_to_b {
        pool.reserve_a = pool.reserve_a.checked_add(lp_portion_in).ok_or(AmmError::MathOverflow)?;
        pool.reserve_b = pool.reserve_b.checked_sub(result.amount_out).ok_or(AmmError::MathOverflow)?;
        pool.protocol_fees_a = pool.protocol_fees_a.checked_add(result.protocol_fee).ok_or(AmmError::MathOverflow)?;
        pool.fund_fees_a = pool.fund_fees_a.checked_add(result.fund_fee).ok_or(AmmError::MathOverflow)?;
    } else {
        pool.reserve_b = pool.reserve_b.checked_add(lp_portion_in).ok_or(AmmError::MathOverflow)?;
        pool.reserve_a = pool.reserve_a.checked_sub(result.amount_out).ok_or(AmmError::MathOverflow)?;
        pool.protocol_fees_b = pool.protocol_fees_b.checked_add(result.protocol_fee).ok_or(AmmError::MathOverflow)?;
        pool.fund_fees_b = pool.fund_fees_b.checked_add(result.fund_fee).ok_or(AmmError::MathOverflow)?;
    }

    emit!(SwapEvent {
        pool: ctx.accounts.pool.key(),
        user: ctx.accounts.user.key(),
        amount_in,
        amount_out: result.amount_out,
        a_to_b,
        trade_fee: result.trade_fee,
        protocol_fee: result.protocol_fee,
        fund_fee: result.fund_fee,
    });

    Ok(())
}

pub fn swap_exact_out(
    ctx: Context<Swap>,
    amount_out: u64,
    max_amount_in: u64,
    a_to_b: bool,
) -> Result<()> {
    let pool = &ctx.accounts.pool;
    let config = &ctx.accounts.amm_config;

    require!(pool.status == 2, AmmError::PoolNotInitialized);

    let (res_in, res_out) = if a_to_b {
        (pool.reserve_a, pool.reserve_b)
    } else {
        (pool.reserve_b, pool.reserve_a)
    };

    let result = calc_swap_exact_out(
        amount_out,
        res_in,
        res_out,
        config.trade_fees_bps,
        config.protocol_fees_bps,
        config.fund_fees_bps,
    )?;

    require!(
        result.amount_in <= max_amount_in,
        AmmError::SlippageToleranceMet
    );

    let (token_in, token_out, vault_in, vault_out, program_in, program_out, user_ata_in, user_ata_out) = if a_to_b {
        (
            &ctx.accounts.token_a, &ctx.accounts.token_b, 
            &ctx.accounts.vault_a, &ctx.accounts.vault_b,
            &ctx.accounts.token_program_a, &ctx.accounts.token_program_b,
            &ctx.accounts.user_ata_a, &ctx.accounts.user_ata_b
        )
    } else {
        (
            &ctx.accounts.token_b, &ctx.accounts.token_a, 
            &ctx.accounts.vault_b, &ctx.accounts.vault_a,
            &ctx.accounts.token_program_b, &ctx.accounts.token_program_a,
            &ctx.accounts.user_ata_b, &ctx.accounts.user_ata_a
        )
    };

    // Transfer input token: user → vault_in
    token_interface::transfer_checked(
        CpiContext::new(
            program_in.to_account_info(),
            TransferChecked {
                from: user_ata_in.to_account_info(),
                mint: token_in.to_account_info(),
                to: vault_in.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        result.amount_in,
        token_in.decimals,
    )?;

    let pool_key = pool.key();
    let seeds = &[AUTHORITY_SEED, pool_key.as_ref(), &[ctx.bumps.authority]];
    let signer = &[&seeds[..]];

    // Transfer output token: vault_out → user
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            program_out.to_account_info(),
            TransferChecked {
                from: vault_out.to_account_info(),
                mint: token_out.to_account_info(),
                to: user_ata_out.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
            signer,
        ),
        amount_out,
        token_out.decimals,
    )?;

    let pool = &mut ctx.accounts.pool;

    let lp_portion_in = result.amount_in
        .checked_sub(result.protocol_fee)
        .ok_or(AmmError::MathOverflow)?
        .checked_sub(result.fund_fee)
        .ok_or(AmmError::MathOverflow)?;

    if a_to_b {
        pool.reserve_a = pool.reserve_a.checked_add(lp_portion_in).ok_or(AmmError::MathOverflow)?;
        pool.reserve_b = pool.reserve_b.checked_sub(amount_out).ok_or(AmmError::MathOverflow)?;
        pool.protocol_fees_a = pool.protocol_fees_a.checked_add(result.protocol_fee).ok_or(AmmError::MathOverflow)?;
        pool.fund_fees_a = pool.fund_fees_a.checked_add(result.fund_fee).ok_or(AmmError::MathOverflow)?;
    } else {
        pool.reserve_b = pool.reserve_b.checked_add(lp_portion_in).ok_or(AmmError::MathOverflow)?;
        pool.reserve_a = pool.reserve_a.checked_sub(amount_out).ok_or(AmmError::MathOverflow)?;
        pool.protocol_fees_b = pool.protocol_fees_b.checked_add(result.protocol_fee).ok_or(AmmError::MathOverflow)?;
        pool.fund_fees_b = pool.fund_fees_b.checked_add(result.fund_fee).ok_or(AmmError::MathOverflow)?;
    }

    emit!(SwapEvent {
        pool: ctx.accounts.pool.key(),
        user: ctx.accounts.user.key(),
        amount_in: result.amount_in,
        amount_out,
        a_to_b,
        trade_fee: result.trade_fee,
        protocol_fee: result.protocol_fee,
        fund_fee: result.fund_fee,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        constraint = amm_config.key() == pool.ammconfig @ AmmError::InvalidFeeConfig
    )]
    pub amm_config: Account<'info, AmmConfig>,

    #[account(
        mut,
        seeds = [
            POOL_SEED, 
            if token_a.key() < token_b.key() { token_a.to_account_info().key.as_ref() } else { token_b.to_account_info().key.as_ref() },
            if token_a.key() < token_b.key() { token_b.to_account_info().key.as_ref() } else { token_a.to_account_info().key.as_ref() }
        ],
        bump = pool.pool_bump,
    )]
    pub pool: Box<Account<'info, PoolState>>,

    pub token_a: Box<InterfaceAccount<'info, Mint>>,
    pub token_b: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut, seeds = [VAULT_A_SEED, pool.key().as_ref()], bump)]
    pub vault_a: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, seeds = [VAULT_B_SEED, pool.key().as_ref()], bump)]
    pub vault_b: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, token::mint = token_a, token::authority = user)]
    pub user_ata_a: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = token_b,
        associated_token::authority = user,
        associated_token::token_program = token_program_b,
    )]
    pub user_ata_b: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: PDA authority — signer only
    #[account(seeds = [AUTHORITY_SEED, pool.key().as_ref()], bump)]
    pub authority: UncheckedAccount<'info>,

    #[account(address = pool.token_program_a)]
    pub token_program_a: Interface<'info, TokenInterface>,
    #[account(address = pool.token_program_b)]
    pub token_program_b: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}
