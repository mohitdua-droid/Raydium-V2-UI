use crate::state::ammconfig::AmmConfig;
use crate::state::constants::AMM_CONFIG_SEED;
use crate::state::errors::AmmError;
use crate::state::events::TransferAdminEvent;
use anchor_lang::prelude::*;

pub fn transfer_admin(ctx: Context<TransferAdmin>, _index: u16, new_admin: Pubkey) -> Result<()> {
    require!(
        ctx.accounts.amm_config.admin.key() == ctx.accounts.owner.key(),
        AmmError::Unauthorized
    );
    let config = &mut ctx.accounts.amm_config;
    let old_admin = config.admin;
    config.admin = new_admin;

    emit!(TransferAdminEvent {
        config_index: _index,
        old_admin,
        new_admin,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(index: u16)]
pub struct TransferAdmin<'info> {
    #[account(
        constraint = owner.key() == amm_config.admin @ AmmError::UnauthorizedProtocolOwner
    )]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [AMM_CONFIG_SEED, index.to_le_bytes().as_ref()],
        bump = amm_config.bump
    )]
    pub amm_config: Account<'info, AmmConfig>,
}
