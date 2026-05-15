use anchor_lang::prelude::*;

#[account]
pub struct PoolState {
    pub ammconfig: Pubkey,
    pub pool_bump: u8,
    pub authority_bump: u8,
    pub status: u8,
    pub mint_a: Pubkey,
    pub mint_b: Pubkey,
    pub vault_a: Pubkey,
    pub vault_b: Pubkey,
    pub lp_mint: Pubkey,
    pub token_program_a: Pubkey,
    pub token_program_b: Pubkey,
    pub lp_supply: u64,
    pub reserve_a: u64,
    pub reserve_b: u64,
    pub protocol_fees_a: u64,
    pub protocol_fees_b: u64,
    pub fund_fees_a: u64,
    pub fund_fees_b: u64,
}

impl PoolState {
    pub const LEN: usize = 8
        + 32
        + 1 + 1 + 1
        + (32 * 7)
        + (8 * 7)
        + 16;
}
