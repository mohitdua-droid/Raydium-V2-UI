use crate::state::ammconfig::AmmConfig;
use crate::state::constants::{ADMIN_PUBKEY, AMM_CONFIG_SEED};
use crate::state::errors::AmmError;
use crate::state::events::CreateConfigEvent;
use anchor_lang::prelude::*;

pub fn create_config(
    ctx: Context<CreateConfig>,
    index: u16,
    trade_fee_rate: u64,
    protocol_fee_rate: u64,
    fund_fee_rate: u64,
) -> Result<()> {
    let denom = AmmConfig::FEE_RATE_DENOMINATOR;

    require!(trade_fee_rate < denom, AmmError::InvalidFeeRate);
    require!(
        protocol_fee_rate
            .checked_add(fund_fee_rate)
            .ok_or(AmmError::MathOverflow)?
            <= trade_fee_rate,
        AmmError::InvalidFeeRate
    );

    let config = &mut ctx.accounts.amm_config;
    config.bump = ctx.bumps.amm_config;
    config.disable_pool = false;
    config.index = index;
    config.admin = ctx.accounts.owner.key();
    config.trade_fees_bps = trade_fee_rate;
    config.protocol_fees_bps = protocol_fee_rate;
    config.fund_fees_bps = fund_fee_rate;
    config.protocol_owner = ctx.accounts.protocol_owner.key();
    config.fund_owner = ctx.accounts.fund_owner.key();

    emit!(CreateConfigEvent {
        config_index: index,
        admin: ctx.accounts.owner.key(),
        trade_fees_bps: trade_fee_rate,
        protocol_fees_bps: protocol_fee_rate,
        fund_fees_bps: fund_fee_rate,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(index: u16)]
pub struct CreateConfig<'info> {
    #[account(
        mut,
        constraint = owner.key() == ADMIN_PUBKEY @ AmmError::UnauthorizedProtocolOwner
    )]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        seeds = [AMM_CONFIG_SEED, &index.to_le_bytes()],
        bump,
        space = AmmConfig::LEN,
    )]
    pub amm_config: Account<'info, AmmConfig>,
    // ...
    /// CHECK: stored as a pubkey only
    pub protocol_owner: UncheckedAccount<'info>,

    /// CHECK: stored as a pubkey only
    pub fund_owner: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
