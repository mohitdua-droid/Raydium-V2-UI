use anchor_lang::prelude::*;

#[event]
pub struct CreateConfigEvent {
    pub config_index: u16,
    pub admin: Pubkey,
    pub trade_fees_bps: u64,
    pub protocol_fees_bps: u64,
    pub fund_fees_bps: u64,
}

#[event]
pub struct UpdateConfigEvent {
    pub config_index: u16,
    pub trade_fees_bps: u64,
    pub protocol_fees_bps: u64,
    pub fund_fees_bps: u64,
    pub disable_pool: bool,
}

#[event]
pub struct InitializePoolEvent {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub mint_a: Pubkey,
    pub mint_b: Pubkey,
    pub lp_mint: Pubkey,
    pub amount_a: u64,
    pub amount_b: u64,
}

#[event]
pub struct UpdatePoolStatusEvent {
    pub pool: Pubkey,
    pub old_status: u8,
    pub new_status: u8,
}

#[event]
pub struct TransferAdminEvent {
    pub config_index: u16,
    pub old_admin: Pubkey,
    pub new_admin: Pubkey,
}

#[event]
pub struct LiquidityChangeEvent {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub lp_amount: u64,
    pub amount_a: u64,
    pub amount_b: u64,
    pub is_add: bool,
}

#[event]
pub struct CollectProtocolFeeEvent {
    pub pool: Pubkey,
    pub amount_a: u64,
    pub amount_b: u64,
    pub receiver: Pubkey,
}

#[event]
pub struct CollectFundFeeEvent {
    pub pool: Pubkey,
    pub amount_a: u64,
    pub amount_b: u64,
    pub receiver: Pubkey,
}

#[event]
pub struct SwapEvent {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub amount_in: u64,
    pub amount_out: u64,
    pub a_to_b: bool,
    pub trade_fee: u64,
    pub protocol_fee: u64,
    pub fund_fee: u64,
}
