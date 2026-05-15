use crate::state::ammconfig::AmmConfig;
use crate::state::constants::AMM_CONFIG_SEED;
use crate::state::errors::AmmError;
use crate::state::events::UpdateConfigEvent;
use anchor_lang::prelude::*;

pub fn update_config(
    ctx: Context<UpdateConfig>,
    _index: u16,
    trade_fee_rate: Option<u64>,
    protocol_fee_rate: Option<u64>,
    fund_fee_rate: Option<u64>,
    disable_create_pool: Option<bool>,
) -> Result<()> {
    require!(
        ctx.accounts.amm_config.admin.key() == ctx.accounts.owner.key(),
        AmmError::Unauthorized
    );
    let denom = AmmConfig::FEE_RATE_DENOMINATOR;
    let config = &mut ctx.accounts.amm_config;
    msg!("Runtime Owner: {:?}", ctx.accounts.owner.key());
    msg!("Runtime Admin: {:?}", config.admin);

    if let Some(v) = trade_fee_rate {
        require!(v < denom, AmmError::InvalidFeeRate);
        config.trade_fees_bps = v;
    }
    if let Some(v) = protocol_fee_rate {
        require!(v < denom, AmmError::InvalidFeeRate);
        config.protocol_fees_bps = v;
    }
    if let Some(v) = fund_fee_rate {
        require!(v < denom, AmmError::InvalidFeeRate);
        config.fund_fees_bps = v;
    }

    // Re-validate combined rates after any individual update
    require!(
        config
            .protocol_fees_bps
            .checked_add(config.fund_fees_bps)
            .ok_or(AmmError::MathOverflow)?
            <= config.trade_fees_bps,
        AmmError::InvalidFeeRate
    );

    if let Some(v) = disable_create_pool {
        config.disable_pool = v;
    }

    emit!(UpdateConfigEvent {
        config_index: _index,
        trade_fees_bps: config.trade_fees_bps,
        protocol_fees_bps: config.protocol_fees_bps,
        fund_fees_bps: config.fund_fees_bps,
        disable_pool: config.disable_pool,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(index: u16)]
pub struct UpdateConfig<'info> {
    #[account(
        constraint = owner.key() == amm_config.admin @ AmmError::UnauthorizedProtocolOwner,
    )]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [AMM_CONFIG_SEED, index.to_le_bytes().as_ref()],
        bump = amm_config.bump,
    )]
    pub amm_config: Account<'info, AmmConfig>,
}
