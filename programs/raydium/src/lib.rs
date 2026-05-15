use anchor_lang::prelude::*;
use solana_security_txt::security_txt;

pub mod instructions;
pub mod state;

use crate::instructions::*;

security_txt! {
    name: "raydium-cp-swap",
    project_url: "https://raydium.io",
    contacts: "link:https://immunefi.com/bounty/raydium",
    policy: "https://immunefi.com/bounty/raydium",
    source_code: "https://github.com/raydium-io/raydium-cp-swap",
    preferred_languages: "en",
    auditors: "https://github.com/raydium-io/raydium-docs/blob/master/audit/MadShield%20Q1%202024/raydium-cp-swap-v-1.0.0.pdf"
}

declare_id!("3xVEDAESdq1vsxieFZbW5bct7sQ3DtbUY4Ha7ZY6QcDz");

#[program]
pub mod raydium {
    use super::*;

    pub fn initialize_pool(ctx: Context<InitializePool>, amt_a: u64, amt_b: u64) -> Result<()> {
        instructions::initialize_pool::initialize_pool(ctx, amt_a, amt_b)
    }

    pub fn add_liquidity(
        ctx: Context<AddLiquidity>,
        amount_a: u64,
        amount_b: u64,
        max_amt_a: u64,
        max_amt_b: u64,
    ) -> Result<()> {
        instructions::add_liquidity::add_liquidity(ctx, amount_a, amount_b, max_amt_a, max_amt_b)
    }

    pub fn remove_liquidity(
        ctx: Context<RemoveLiquidity>,
        lp_burn: u64,
        min_amt_a: u64,
        min_amt_b: u64,
    ) -> Result<()> {
        instructions::remove_liquidity::remove_liquidity(ctx, lp_burn, min_amt_a, min_amt_b)
    }

    pub fn swap_exact_in(
        ctx: Context<Swap>,
        amount_in: u64,
        min_amount_out: u64,
        a_to_b: bool,
    ) -> Result<()> {
        instructions::swap::swap_exact_in(ctx, amount_in, min_amount_out, a_to_b)
    }

    pub fn swap_exact_out(
        ctx: Context<Swap>,
        amount_out: u64,
        max_amount_in: u64,
        a_to_b: bool,
    ) -> Result<()> {
        instructions::swap::swap_exact_out(ctx, amount_out, max_amount_in, a_to_b)
    }

    pub fn create_config(
        ctx: Context<CreateConfig>,
        index: u16,
        trade_fee_rate: u64,
        protocol_fee_rate: u64,
        fund_fee_rate: u64,
    ) -> Result<()> {
        instructions::admin::create_config::create_config(
            ctx,
            index,
            trade_fee_rate,
            protocol_fee_rate,
            fund_fee_rate,
        )
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        index: u16,
        trade_fee_rate: Option<u64>,
        protocol_fee_rate: Option<u64>,
        fund_fee_rate: Option<u64>,
        disable_create_pool: Option<bool>,
    ) -> Result<()> {
        instructions::admin::update_config::update_config(
            ctx,
            index,
            trade_fee_rate,
            protocol_fee_rate,
            fund_fee_rate,
            disable_create_pool,
        )
    }

    pub fn collect_protocol_fee(
        ctx: Context<CollectProtocolFee>,
        index: u16,
        amount_a_requested: u64,
        amount_b_requested: u64,
    ) -> Result<()> {
        instructions::admin::collect_protocol_fee::collect_protocol_fee(
            ctx,
            index,
            amount_a_requested,
            amount_b_requested,
        )
    }

    pub fn collect_fund_fee(
        ctx: Context<CollectFundFee>,
        index: u16,
        amount_a_requested: u64,
        amount_b_requested: u64,
    ) -> Result<()> {
        instructions::admin::collect_fund_fee::collect_fund_fee(
            ctx,
            index,
            amount_a_requested,
            amount_b_requested,
        )
    }

    pub fn update_pool_status(
        ctx: Context<UpdatePoolStatus>,
        index: u16,
        status: u8,
    ) -> Result<()> {
        instructions::admin::update_pool_status::update_pool_status(ctx, index, status)
    }

    pub fn transfer_admin(
        ctx: Context<TransferAdmin>,
        index: u16,
        new_admin: Pubkey,
    ) -> Result<()> {
        instructions::admin::transfer_admin::transfer_admin(ctx, index, new_admin)
    }
}
