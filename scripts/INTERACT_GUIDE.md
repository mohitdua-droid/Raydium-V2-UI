# Raydium Interaction Script Guide

This guide explains how to use the `scripts/interact.ts` CLI to interact with your Raydium-like Solana program.

## Prerequisites

1.  **Local Validator**: Ensure your local Solana validator is running:
    ```bash
    solana-test-validator
    ```
2.  **Deployed Program**: Make sure your program is built and deployed:
    ```bash
    anchor build
    anchor deploy
    ```
3.  **Configured Wallet**: The script uses the provider configured in `Anchor.toml`. Ensure this wallet has enough SOL:
    ```bash
    solana airdrop 2
    ```

## How to Run

The script is a CLI tool. To pass commands and arguments through Anchor, you **must** use the `--` separator:

```bash
anchor run interact -- <command> [args]
```

## Available Commands

### 🚀 Setup (Full Flow)
The `setup` command is the fastest way to see the program in action. It automates the entire lifecycle:
- Creates a new **AMM Config** (Index 0).
- Creates two new mints (Token A & Token B).
- Funds the user with 10,000 of each token.
- Initializes a new liquidity pool with 1,000 A and 2,000 B.
- Performs a test swap of 100 Token A for Token B.
- Displays the final pool status, including accrued fees.

```bash
anchor run interact -- setup
```

### 🛠️ Individual Commands

**Create AMM Config**:
Initialize the protocol settings (fees, owners).
```bash
anchor run interact -- config <INDEX>
```

**Initialize a Pool**:
Requires initial liquidity amounts.
```bash
anchor run interact -- init <MINT_A> <MINT_B> <AMT_A> <AMT_B>
```

**Add Liquidity**:
```bash
anchor run interact -- add <MINT_A> <MINT_B> <AMOUNT_A> <AMOUNT_B>
```

**Remove Liquidity**:
```bash
anchor run interact -- remove <MINT_A> <MINT_B> <LP_AMOUNT>
```

**Swap (A to B)**:
```bash
anchor run interact -- swap <MINT_A> <MINT_B> <AMOUNT_IN>
```

**Collect Fees (Admin Only)**:
Collect protocol ('p') or fund ('f') fees.
```bash
# anchor run interact -- collect <MINT_A> <MINT_B> <p/f> <AMT_A> [AMT_B]
anchor run interact -- collect <MINT_A> <MINT_B> p 100
```

**Check Status**:
Shows reserves, fee accrual, and LP supply.
```bash
anchor run interact -- status <MINT_A> <MINT_B>
```

## Key Features

### Protocol Fees
The program now accrues **Protocol Fees** and **Fund Fees** on every swap. These are stored in the pool state and can be collected by the respective owners defined in the `AmmConfig`.

### Multi-Token Support
The script uses the `token_interface` to support both standard SPL tokens and Token-2022 mints. The interaction script automatically routes to the correct program based on the pool's state.

### Slippage Protection
- **Add Liquidity**: Current script uses a simple 1:1 ratio.
- **Swap**: Current script sets `min_amount_out` to `0` for demonstration. In production, calculate this value based on the constant product formula ($x * y = k$).

## Troubleshooting

- **"unexpected argument found"**: Ensure you are using the `--` separator (e.g., `anchor run interact -- setup`).
- **"AccountNotInitialized"**: You must `config` and `init` a pool before you can `add` liquidity or `swap`.
- **"UnauthorizedProtocolOwner"**: Ensure you are using the wallet that initialized the `AmmConfig` when collecting fees.
- **"InvalidMintOrder"**: The script handles sorting in `setup`, but manual commands require MINT_A < MINT_B.
