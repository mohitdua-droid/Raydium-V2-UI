use anchor_lang::prelude::*;

#[account]
pub struct SwapFees {
    pub trade_fee: u64,

    pub protocol_fee: u64,
    pub fund_fee: u64,
    pub lp_fee: u64,

    pub amount_in_after_fee: u64,
}

impl SwapFees {
    pub const LEN: usize = 8 + (5 * 8);
}
