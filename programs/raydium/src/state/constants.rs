pub const POOL_SEED: &[u8] = b"pool";
pub const AUTHORITY_SEED: &[u8] = b"authority";
pub const VAULT_A_SEED: &[u8] = b"vault_a";
pub const VAULT_B_SEED: &[u8] = b"vault_b";
pub const LP_MINT_SEED: &[u8] = b"lp_mint";
pub const AMM_CONFIG_SEED: &[u8] = b"amm_config";
pub const FEE_RATE_DENOMINATOR: u64 = 1_000_000;

// LP gets 84%, protocol owner gets 12%, and the rest (4%) goes to treasury fund
// from 0.25%, LP gets 0.21%, protocol owner gets 0.03%, and the rest (0.01%) goes to treasury fund

pub const ADMIN_PUBKEY: anchor_lang::prelude::Pubkey =
    anchor_lang::prelude::pubkey!("5G6cQpvn7eCLYyqMk6nN4KCPaH4hV9BBae5upF2VRofZ");

pub const FUND_OWNER_PUBKEY: anchor_lang::prelude::Pubkey =
    anchor_lang::prelude::pubkey!("5G6cQpvn7eCLYyqMk6nN4KCPaH4hV9BBae5upF2VRofZ");

pub const PROTOCOL_OWNER_PUBKEY: anchor_lang::prelude::Pubkey =
    anchor_lang::prelude::pubkey!("5G6cQpvn7eCLYyqMk6nN4KCPaH4hV9BBae5upF2VRofZ");
