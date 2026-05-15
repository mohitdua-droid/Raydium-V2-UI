use crate::state::ammconfig::AmmConfig;
use crate::state::constants::{AMM_CONFIG_SEED, POOL_SEED};
use crate::state::errors::AmmError;
use crate::state::events::UpdatePoolStatusEvent;
use crate::state::pool::PoolState;
use anchor_lang::prelude::*;

pub fn update_pool_status(ctx: Context<UpdatePoolStatus>, _index: u16, status: u8) -> Result<()> {
    require!(
        ctx.accounts.amm_config.admin.key() == ctx.accounts.owner.key(),
        AmmError::Unauthorized
    );
    require!(status <= 3, AmmError::InvalidFeeRate); // Using InvalidFeeRate as a placeholder for range check

    let pool = &mut ctx.accounts.pool;
    let old_status = pool.status;
    pool.status = status;

    emit!(UpdatePoolStatusEvent {
        pool: pool.key(),
        old_status,
        new_status: status,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(index: u16)]
pub struct UpdatePoolStatus<'info> {
    #[account(
        constraint = owner.key() == amm_config.admin @ AmmError::UnauthorizedProtocolOwner
    )]
    pub owner: Signer<'info>,

    #[account(
        seeds = [AMM_CONFIG_SEED, index.to_le_bytes().as_ref()],
        bump = amm_config.bump
    )]
    pub amm_config: Account<'info, AmmConfig>,

    #[account(
        mut,
        seeds = [POOL_SEED, pool.mint_a.as_ref(), pool.mint_b.as_ref()],
        bump = pool.pool_bump,
        constraint = pool.ammconfig == amm_config.key() @ AmmError::InvalidFeeConfig
    )]
    pub pool: Account<'info, PoolState>,
}
