use anchor_lang::prelude::*;

#[error_code]
pub enum AmmError {
    #[msg("Pool already initialized")]
    PoolAlreadyInitialized,

    #[msg("Pool is not initialized")]
    PoolNotInitialized,

    #[msg("Mints must be in canonical order: mint_a pubkey < mint_b pubkey")]
    InvalidMintOrder,

    #[msg("Token A and Token B cannot be the same mint")]
    IdenticalMints,

    #[msg("Fee numerator must be less than denominator")]
    InvalidFeeConfig,

    #[msg("Pool is currently paused")]
    PoolPaused,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Zero amount")]
    ZeroAmount,

    #[msg("Empty reserves")]
    EmptyReserves,

    #[msg("Insufficient liquidity")]
    InsufficientLiquidity,

    #[msg("Insufficient liquidity minted")]
    InsufficientLiquidityMinted,

    #[msg("Slippage tolerance not met")]
    SlippageToleranceMet,

    #[msg("Insufficient output amount")]
    InsufficientOutputAmount,

    #[msg("Insufficient input amount")]
    InsufficientInputAmount,

    #[msg("User is disabled to create pool")]
    DisabledCreatePool,

    #[msg("Fee rate is Invalid")]
    InvalidFeeRate,

    #[msg("You are NOT the protocol owner")]
    UnauthorizedProtocolOwner,

    #[msg("You are NOT the fund owner")]
    UnauthorizedFundOwner,

    #[msg("You have no fees to collect")]
    NoFeesToCollect,

    #[msg("You are not the admin of this code")]
    Unauthorized,

    #[msg("Slippage Alert !!!")]
    ExceedsMaxTokenA,
    #[msg("Slippage Alert !!!")]
    ExceedsMaxTokenB,
    #[msg("Slippage Alert !!!")]
    BelowMinTokenA,
    #[msg("Slippage Alert !!!")]
    BelowMinTokenB,
}
