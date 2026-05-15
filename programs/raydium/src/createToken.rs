//Create Token and Mint Token. How would I get ATA's though?

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

#[program]
mod create_token {
    use super::*;
    pub fn create_token(ctx: Context<CreateToken>) -> Result<()> {
        Ok(())
    }
}
