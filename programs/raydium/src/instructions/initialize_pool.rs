use crate::state::ammconfig::AmmConfig;
use crate::state::constants::*;
use crate::state::errors::AmmError;
use crate::state::events::InitializePoolEvent;
use crate::state::pool::PoolState;
use crate::state::utils::calc_add;

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    self, Mint, MintTo, TokenAccount, TokenInterface, TransferChecked,
};

pub fn initialize_pool(ctx: Context<InitializePool>, amt_a: u64, amt_b: u64) -> Result<()> {
    require_keys_neq!(
        ctx.accounts.token_a_mint.key(),
        ctx.accounts.token_b_mint.key(),
        AmmError::IdenticalMints
    );

    require_gt!(amt_a, 0, AmmError::ZeroAmount);
    require_gt!(amt_b, 0, AmmError::ZeroAmount);

    let (_final_a, _final_b, lp_amt) = calc_add(amt_a, amt_b, 0, 0, 0)?;

    // Transfer token A: user → vault_a
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program_a.to_account_info(),
            TransferChecked {
                from: ctx.accounts.user_ata_a.to_account_info(),
                mint: ctx.accounts.token_a_mint.to_account_info(),
                to: ctx.accounts.vault_a.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amt_a,
        ctx.accounts.token_a_mint.decimals,
    )?;

    // Transfer token B: user → vault_b
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program_b.to_account_info(),
            TransferChecked {
                from: ctx.accounts.user_ata_b.to_account_info(),
                mint: ctx.accounts.token_b_mint.to_account_info(),
                to: ctx.accounts.vault_b.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amt_b,
        ctx.accounts.token_b_mint.decimals,
    )?;

    // Mint LP tokens to user
    let key = ctx.accounts.pool.key();
    let seeds = &[AUTHORITY_SEED, key.as_ref(), &[ctx.bumps.authority]];
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
        lp_amt,
    )?;

    let pool = &mut ctx.accounts.pool;
    pool.pool_bump = ctx.bumps.pool;
    pool.authority_bump = ctx.bumps.authority;
    pool.status = 1;
    pool.lp_mint = ctx.accounts.lp_mint.key();
    pool.ammconfig = ctx.accounts.ammconfig.key();
    pool.lp_supply = lp_amt;

    if ctx.accounts.token_a_mint.key() < ctx.accounts.token_b_mint.key() {
        pool.mint_a = ctx.accounts.token_a_mint.key();
        pool.mint_b = ctx.accounts.token_b_mint.key();
        pool.vault_a = ctx.accounts.vault_a.key();
        pool.vault_b = ctx.accounts.vault_b.key();
        pool.token_program_a = ctx.accounts.token_program_a.key();
        pool.token_program_b = ctx.accounts.token_program_b.key();
        pool.reserve_a = amt_a;
        pool.reserve_b = amt_b;
    } else {
        pool.mint_a = ctx.accounts.token_b_mint.key();
        pool.mint_b = ctx.accounts.token_a_mint.key();
        pool.vault_a = ctx.accounts.vault_b.key();
        pool.vault_b = ctx.accounts.vault_a.key();
        pool.token_program_a = ctx.accounts.token_program_b.key();
        pool.token_program_b = ctx.accounts.token_program_a.key();
        pool.reserve_a = amt_b;
        pool.reserve_b = amt_a;
    }

    pool.fund_fees_a = 0;
    pool.fund_fees_b = 0;
    pool.protocol_fees_a = 0;
    pool.protocol_fees_b = 0;

    emit!(InitializePoolEvent {
        pool: pool.key(),
        user: ctx.accounts.user.key(),
        mint_a: pool.mint_a,
        mint_b: pool.mint_b,
        lp_mint: pool.lp_mint,
        amount_a: amt_a,
        amount_b: amt_b,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(
        init,
        payer = user,
        seeds = [
            POOL_SEED, 
            if token_a_mint.key() < token_b_mint.key() { token_a_mint.to_account_info().key.as_ref() } else { token_b_mint.to_account_info().key.as_ref() },
            if token_a_mint.key() < token_b_mint.key() { token_b_mint.to_account_info().key.as_ref() } else { token_a_mint.to_account_info().key.as_ref() }
        ],
        bump,
        space = PoolState::LEN
    )]
    pub pool: Box<Account<'info, PoolState>>,

    #[account(
        constraint = !ammconfig.disable_pool @ AmmError::DisabledCreatePool
    )]
    pub ammconfig: Box<Account<'info, AmmConfig>>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_a_mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_b_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init,
        payer = user,
        seeds = [VAULT_A_SEED, pool.key().as_ref()],
        bump,
        token::mint = token_a_mint,
        token::authority = authority,
        token::token_program = token_program_a,
    )]
    pub vault_a: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init,
        payer = user,
        seeds = [VAULT_B_SEED, pool.key().as_ref()],
        bump,
        token::mint = token_b_mint,
        token::authority = authority,
        token::token_program = token_program_b,
    )]
    pub vault_b: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init,
        payer = user,
        seeds = [
            LP_MINT_SEED, 
            if token_a_mint.key() < token_b_mint.key() { token_a_mint.to_account_info().key.as_ref() } else { token_b_mint.to_account_info().key.as_ref() },
            if token_a_mint.key() < token_b_mint.key() { token_b_mint.to_account_info().key.as_ref() } else { token_a_mint.to_account_info().key.as_ref() }
        ],
        bump,
        mint::decimals = 6,
        mint::authority = authority,
        mint::token_program = token_program,
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

    /// CHECK: PDA authority
    #[account(seeds = [AUTHORITY_SEED, pool.key().as_ref()], bump)]
    pub authority: UncheckedAccount<'info>,

    /// Token program for mint_a (SPL Token or Token-2022)
    pub token_program_a: Interface<'info, TokenInterface>,
    /// Token program for mint_b (SPL Token or Token-2022)
    pub token_program_b: Interface<'info, TokenInterface>,
    /// Token program for the LP mint (standard SPL Token)
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}
