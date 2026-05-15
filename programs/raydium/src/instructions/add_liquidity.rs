use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    self, Mint, MintTo, TokenAccount, TokenInterface, TransferChecked,
};

use crate::state::constants::*;
use crate::state::errors::AmmError;
use crate::state::events::LiquidityChangeEvent;
use crate::state::pool::PoolState;
use crate::state::utils::calc_add;

pub fn add_liquidity(
    ctx: Context<AddLiquidity>,
    amount_a: u64,
    amount_b: u64,
    max_amt_a: u64,
    max_amt_b: u64,
) -> Result<()> {
    let (mint_a, mint_b, vault_a, vault_b, user_ata_a, user_ata_b, prog_a, prog_b, amt_a_in, amt_b_in) = 
        if ctx.accounts.token_a_mint.key() < ctx.accounts.token_b_mint.key() {
            (
                &ctx.accounts.token_a_mint, &ctx.accounts.token_b_mint, 
                &ctx.accounts.vault_a, &ctx.accounts.vault_b,
                &ctx.accounts.user_ata_a, &ctx.accounts.user_ata_b,
                &ctx.accounts.token_program_a, &ctx.accounts.token_program_b,
                amount_a, amount_b
            )
        } else {
            (
                &ctx.accounts.token_b_mint, &ctx.accounts.token_a_mint, 
                &ctx.accounts.vault_b, &ctx.accounts.vault_a,
                &ctx.accounts.user_ata_b, &ctx.accounts.user_ata_a,
                &ctx.accounts.token_program_b, &ctx.accounts.token_program_a,
                amount_b, amount_a
            )
        };

    let pool = &ctx.accounts.pool;
    require!(pool.status == 2, AmmError::PoolNotInitialized);

    let (final_a, final_b, lp_amount) = calc_add(
        amt_a_in,
        amt_b_in,
        pool.reserve_a,
        pool.reserve_b,
        pool.lp_supply,
    )?;

    // Slippage checks relative to the provided max amounts
    // Note: if user passed them unsorted, we should probably check against the correct ones.
    // However, usually max_amt_a refers to token_a_mint.
    let (max_a, max_b) = if ctx.accounts.token_a_mint.key() < ctx.accounts.token_b_mint.key() {
        (max_amt_a, max_amt_b)
    } else {
        (max_amt_b, max_amt_a)
    };
    require!(final_a <= max_a, AmmError::ExceedsMaxTokenA);
    require!(final_b <= max_b, AmmError::ExceedsMaxTokenB);

    // Transfer token A: user → vault_a
    token_interface::transfer_checked(
        CpiContext::new(
            prog_a.to_account_info(),
            TransferChecked {
                from: user_ata_a.to_account_info(),
                mint: mint_a.to_account_info(),
                to: vault_a.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        final_a,
        mint_a.decimals,
    )?;

    // Transfer token B: user → vault_b
    token_interface::transfer_checked(
        CpiContext::new(
            prog_b.to_account_info(),
            TransferChecked {
                from: user_ata_b.to_account_info(),
                mint: mint_b.to_account_info(),
                to: vault_b.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        final_b,
        mint_b.decimals,
    )?;

    // Mint LP tokens to user
    let pool_key = ctx.accounts.pool.key();
    let seeds = &[AUTHORITY_SEED, pool_key.as_ref(), &[ctx.bumps.authority]];
    let signer = &[&seeds[..]];

    token_interface::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.lp_mint.to_account_info(),
                to: ctx.accounts.user_lp_ata.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
            signer,
        ),
        lp_amount,
    )?;

    let pool = &mut ctx.accounts.pool;
    pool.reserve_a = pool.reserve_a.checked_add(final_a).ok_or(AmmError::MathOverflow)?;
    pool.reserve_b = pool.reserve_b.checked_add(final_b).ok_or(AmmError::MathOverflow)?;
    pool.lp_supply = pool.lp_supply.checked_add(lp_amount).ok_or(AmmError::MathOverflow)?;

    emit!(LiquidityChangeEvent {
        pool: ctx.accounts.pool.key(),
        user: ctx.accounts.user.key(),
        lp_amount,
        amount_a: final_a,
        amount_b: final_b,
        is_add: true,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
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

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = lp_mint,
        associated_token::authority = user,
        associated_token::token_program = token_program,
    )]
    pub user_lp_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: PDA authority — only used as a signer seed
    #[account(seeds = [AUTHORITY_SEED, pool.key().as_ref()], bump)]
    pub authority: UncheckedAccount<'info>,

    #[account(address = pool.token_program_a)]
    pub token_program_a: Interface<'info, TokenInterface>,
    #[account(address = pool.token_program_b)]
    pub token_program_b: Interface<'info, TokenInterface>,
    /// Standard SPL token program for LP mint operations
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}
