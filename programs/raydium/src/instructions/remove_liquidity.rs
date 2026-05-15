use crate::state::constants::*;
use crate::state::errors::AmmError;
use crate::state::events::LiquidityChangeEvent;
use crate::state::pool::PoolState;
use crate::state::utils::calc_remove;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    self, Burn, Mint, TokenAccount, TokenInterface, TransferChecked,
};

pub fn remove_liquidity(
    ctx: Context<RemoveLiquidity>,
    lp_burn: u64,
    min_amount_a: u64,
    min_amount_b: u64,
) -> Result<()> {
    require_gt!(lp_burn, 0, AmmError::ZeroAmount);

    let pool = &ctx.accounts.pool;
    require!(pool.status == 2, AmmError::PoolNotInitialized);
    require!(pool.lp_supply >= lp_burn, AmmError::InsufficientLiquidity);
    require!(
        ctx.accounts.user_lp_ata.amount >= lp_burn,
        AmmError::InsufficientLiquidity
    );

    let (final_a, final_b) = calc_remove(lp_burn, pool.lp_supply, pool.reserve_a, pool.reserve_b)?;

    let (mint_a, mint_b, vault_a, vault_b, user_ata_a, user_ata_b, prog_a, prog_b) = 
        if ctx.accounts.token_a_mint.key() < ctx.accounts.token_b_mint.key() {
            (
                &ctx.accounts.token_a_mint, &ctx.accounts.token_b_mint, 
                &ctx.accounts.vault_a, &ctx.accounts.vault_b,
                &ctx.accounts.user_ata_a, &ctx.accounts.user_ata_b,
                &ctx.accounts.token_program_a, &ctx.accounts.token_program_b
            )
        } else {
            (
                &ctx.accounts.token_b_mint, &ctx.accounts.token_a_mint, 
                &ctx.accounts.vault_b, &ctx.accounts.vault_a,
                &ctx.accounts.user_ata_b, &ctx.accounts.user_ata_a,
                &ctx.accounts.token_program_b, &ctx.accounts.token_program_a
            )
        };

    // Slippage checks
    let (min_a, min_b) = if ctx.accounts.token_a_mint.key() < ctx.accounts.token_b_mint.key() {
        (min_amount_a, min_amount_b)
    } else {
        (min_amount_b, min_amount_a)
    };
    require!(final_a >= min_a, AmmError::BelowMinTokenA);
    require!(final_b >= min_b, AmmError::BelowMinTokenB);
    require_gt!(final_a, 0, AmmError::ZeroAmount);
    require_gt!(final_b, 0, AmmError::ZeroAmount);

    let pool_key = pool.key();
    let seeds = &[AUTHORITY_SEED, pool_key.as_ref(), &[ctx.bumps.authority]];
    let signer = &[&seeds[..]];

    // Transfer token A: vault_a → user
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            prog_a.to_account_info(),
            TransferChecked {
                from: vault_a.to_account_info(),
                mint: mint_a.to_account_info(),
                to: user_ata_a.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
            signer,
        ),
        final_a,
        mint_a.decimals,
    )?;

    // Transfer token B: vault_b → user
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            prog_b.to_account_info(),
            TransferChecked {
                from: vault_b.to_account_info(),
                mint: mint_b.to_account_info(),
                to: user_ata_b.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
            signer,
        ),
        final_b,
        mint_b.decimals,
    )?;

    // Burn LP tokens from user
    token_interface::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.lp_mint.to_account_info(),
                from: ctx.accounts.user_lp_ata.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        lp_burn,
    )?;

    let pool = &mut ctx.accounts.pool;
    pool.reserve_a = pool
        .reserve_a
        .checked_sub(final_a)
        .ok_or(AmmError::MathOverflow)?;
    pool.reserve_b = pool
        .reserve_b
        .checked_sub(final_b)
        .ok_or(AmmError::MathOverflow)?;
    pool.lp_supply = pool
        .lp_supply
        .checked_sub(lp_burn)
        .ok_or(AmmError::MathOverflow)?;

    emit!(LiquidityChangeEvent {
        pool: ctx.accounts.pool.key(),
        user: ctx.accounts.user.key(),
        lp_amount: lp_burn,
        amount_a: final_a,
        amount_b: final_b,
        is_add: false,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct RemoveLiquidity<'info> {
    #[account(
        mut,
        seeds = [
            POOL_SEED, 
            if token_a_mint.key() < token_b_mint.key() { token_a_mint.to_account_info().key.as_ref() } else { token_b_mint.to_account_info().key.as_ref() },
            if token_a_mint.key() < token_b_mint.key() { token_b_mint.to_account_info().key.as_ref() } else { token_a_mint.to_account_info().key.as_ref() }
        ],
        bump = pool.pool_bump
    )]
    pub pool: Box<Account<'info, PoolState>>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_a_mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_b_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut, seeds = [VAULT_A_SEED, pool.key().as_ref()], bump)]
    pub vault_a: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, seeds = [VAULT_B_SEED, pool.key().as_ref()], bump)]
    pub vault_b: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut, 
        seeds = [
            LP_MINT_SEED, 
            if token_a_mint.key() < token_b_mint.key() { token_a_mint.to_account_info().key.as_ref() } else { token_b_mint.to_account_info().key.as_ref() },
            if token_a_mint.key() < token_b_mint.key() { token_b_mint.to_account_info().key.as_ref() } else { token_a_mint.to_account_info().key.as_ref() }
        ], 
        bump
    )]
    pub lp_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut, token::mint = token_a_mint, token::authority = user)]
    pub user_ata_a: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, token::mint = token_b_mint, token::authority = user)]
    pub user_ata_b: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, token::mint = lp_mint, token::authority = user)]
    pub user_lp_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: PDA authority derived from seeds
    #[account(seeds = [AUTHORITY_SEED, pool.key().as_ref()], bump)]
    pub authority: UncheckedAccount<'info>,

    #[account(address = pool.token_program_a)]
    pub token_program_a: Interface<'info, TokenInterface>,
    #[account(address = pool.token_program_b)]
    pub token_program_b: Interface<'info, TokenInterface>,
    /// Standard SPL token program for LP burn
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}
