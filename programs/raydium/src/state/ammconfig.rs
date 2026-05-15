use anchor_lang::prelude::*;
#[account]
pub struct AmmConfig {
    pub index: u16,
    pub admin: Pubkey,
    pub protocol_owner: Pubkey,
    pub fund_owner: Pubkey,
    pub trade_fees_bps: u64,
    pub protocol_fees_bps: u64,
    pub fund_fees_bps: u64,
    pub disable_pool: bool,
    pub bump: u8,
}

impl AmmConfig {
    pub const LEN: usize = 8 + 2 + (3 * 32) + (3 * 8) + 1 + 1;
    pub const FEE_RATE_DENOMINATOR: u64 = 1_000_000;
}
