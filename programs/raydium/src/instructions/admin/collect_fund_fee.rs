use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::state::ammconfig::AmmConfig;
use crate::state::constants::{
    AMM_CONFIG_SEED, AUTHORITY_SEED, POOL_SEED, VAULT_A_SEED, VAULT_B_SEED,
};
use crate::state::errors::AmmError;
use crate::state::events::CollectFundFeeEvent;
use crate::state::pool::PoolState;

pub fn collect_fund_fee(
    ctx: Context<CollectFundFee>,
    _index: u16,
    amount_a_requested: u64,
    amount_b_requested: u64,
) -> Result<()> {
    require!(
        ctx.accounts.amm_config.admin.key() == ctx.accounts.owner.key(),
        AmmError::Unauthorized
    );
    let pool = &ctx.accounts.pool;

    require!(
        pool.fund_fees_a > 0 || pool.fund_fees_b > 0,
        AmmError::NoFeesToCollect
    );

    let withdraw_a = amount_a_requested.min(pool.fund_fees_a);
    let withdraw_b = amount_b_requested.min(pool.fund_fees_b);

    require!(
        ctx.accounts.vault_a.amount >= withdraw_a,
        AmmError::InsufficientLiquidity
    );
    require!(
        ctx.accounts.vault_b.amount >= withdraw_b,
        AmmError::InsufficientLiquidity
    );

    let pool_key = pool.key();
    let seeds = &[AUTHORITY_SEED, pool_key.as_ref(), &[ctx.bumps.authority]];
    let signer = &[&seeds[..]];

    if withdraw_a > 0 {
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program_a.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault_a.to_account_info(),
                    mint: ctx.accounts.token_a_mint.to_account_info(),
                    to: ctx.accounts.recipient_ata_a.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
                signer,
            ),
            withdraw_a,
            ctx.accounts.token_a_mint.decimals,
        )?;
    }

    if withdraw_b > 0 {
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program_b.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault_b.to_account_info(),
                    mint: ctx.accounts.token_b_mint.to_account_info(),
                    to: ctx.accounts.recipient_ata_b.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
                signer,
            ),
            withdraw_b,
            ctx.accounts.token_b_mint.decimals,
        )?;
    }

    let pool = &mut ctx.accounts.pool;
    pool.fund_fees_a = pool
        .fund_fees_a
        .checked_sub(withdraw_a)
        .ok_or(AmmError::MathOverflow)?;
    pool.fund_fees_b = pool
        .fund_fees_b
        .checked_sub(withdraw_b)
        .ok_or(AmmError::MathOverflow)?;

    emit!(CollectFundFeeEvent {
        pool: ctx.accounts.pool.key(),
        amount_a: withdraw_a,
        amount_b: withdraw_b,
        receiver: ctx.accounts.owner.key(),
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(index: u16)]
pub struct CollectFundFee<'info> {
    #[account(
        constraint = owner.key() == amm_config.fund_owner || owner.key() == amm_config.admin @ AmmError::UnauthorizedFundOwner
    )]
    pub owner: Signer<'info>,

    #[account(
        constraint = amm_config.key() == pool.ammconfig @ AmmError::InvalidFeeConfig,
        seeds = [AMM_CONFIG_SEED, index.to_le_bytes().as_ref()],
        bump = amm_config.bump
    )]
    pub amm_config: Account<'info, AmmConfig>,

    #[account(
        mut,
        seeds = [POOL_SEED, pool.mint_a.as_ref(), pool.mint_b.as_ref()],
        bump = pool.pool_bump,
    )]
    pub pool: Box<Account<'info, PoolState>>,

    pub token_a_mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_b_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut, seeds = [VAULT_A_SEED, pool.key().as_ref()], bump)]
    pub vault_a: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, seeds = [VAULT_B_SEED, pool.key().as_ref()], bump)]
    pub vault_b: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, token::mint = token_a_mint, token::authority = owner)]
    pub recipient_ata_a: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, token::mint = token_b_mint, token::authority = owner)]
    pub recipient_ata_b: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: PDA authority — signer only
    #[account(seeds = [AUTHORITY_SEED, pool.key().as_ref()], bump)]
    pub authority: UncheckedAccount<'info>,

    #[account(address = pool.token_program_a)]
    pub token_program_a: Interface<'info, TokenInterface>,
    #[account(address = pool.token_program_b)]
    pub token_program_b: Interface<'info, TokenInterface>,
}
