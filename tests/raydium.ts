import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Raydium } from "../target/types/raydium";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import { expect } from "chai";

describe("raydium", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.raydium as Program<Raydium>;
  const user = (provider.wallet as anchor.Wallet).payer;

  let tokenAMint: anchor.web3.PublicKey;
  let tokenBMint: anchor.web3.PublicKey;

  let pool: anchor.web3.PublicKey;
  let vaultA: anchor.web3.PublicKey;
  let vaultB: anchor.web3.PublicKey;
  let lpMint: anchor.web3.PublicKey;
  let authority: anchor.web3.PublicKey;
  let ammConfig: anchor.web3.PublicKey;

  let userAtaA: anchor.web3.PublicKey;
  let userAtaB: anchor.web3.PublicKey;
  let userLpAta: anchor.web3.PublicKey;

  const INITIAL_MINT_AMOUNT = 10_000_000_000n; // 10,000 tokens (6 decimals)
  const CONFIG_INDEX = Math.floor(Math.random() * 1000);

  before(async () => {
    // Create mints
    const mint1 = await createMint(
      provider.connection,
      user,
      user.publicKey,
      null,
      6
    );
    const mint2 = await createMint(
      provider.connection,
      user,
      user.publicKey,
      null,
      6
    );

    // Ensure mintA < mintB
    if (mint1.toBuffer().compare(mint2.toBuffer()) < 0) {
      tokenAMint = mint1;
      tokenBMint = mint2;
    } else {
      tokenAMint = mint2;
      tokenBMint = mint1;
    }

    // Derive PDAs
    [pool] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), tokenAMint.toBuffer(), tokenBMint.toBuffer()],
      program.programId
    );

    [authority] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("authority"), pool.toBuffer()],
      program.programId
    );

    [vaultA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault_a"), pool.toBuffer()],
      program.programId
    );

    [vaultB] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault_b"), pool.toBuffer()],
      program.programId
    );

    [lpMint] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("lp_mint"), tokenAMint.toBuffer(), tokenBMint.toBuffer()],
      program.programId
    );

    [ammConfig] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("amm_config"), new anchor.BN(CONFIG_INDEX).toArrayLike(Buffer, "le", 2)],
      program.programId
    );

    // Setup User ATAs
    userAtaA = (await getOrCreateAssociatedTokenAccount(provider.connection, user, tokenAMint, user.publicKey)).address;
    userAtaB = (await getOrCreateAssociatedTokenAccount(provider.connection, user, tokenBMint, user.publicKey)).address;
    userLpAta = getAssociatedTokenAddressSync(lpMint, user.publicKey);

    // Mint tokens to user
    await mintTo(provider.connection, user, tokenAMint, userAtaA, user, INITIAL_MINT_AMOUNT);
    await mintTo(provider.connection, user, tokenBMint, userAtaB, user, INITIAL_MINT_AMOUNT);
  });

  it("0. Creates AMM config", async () => {
    await program.methods
      .createConfig(
        CONFIG_INDEX,
        new anchor.BN(2500), // 0.25% trade fee
        new anchor.BN(300),  // 0.03% protocol fee (12% of trade fee)
        new anchor.BN(100)   // 0.01% fund fee (4% of trade fee)
      )
      .accounts({
        owner: user.publicKey,
        ammConfig,
        protocolOwner: user.publicKey,
        fundOwner: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .rpc();

    const configAccount = await program.account.ammConfig.fetch(ammConfig);
    expect(configAccount.index).to.equal(CONFIG_INDEX);
  });

  it("1. Initializes the pool successfully", async () => {
    const amountA = new anchor.BN(1_000_000_000);
    const amountB = new anchor.BN(2_000_000_000);

    await program.methods
      .initializePool(amountA, amountB)
      .accounts({
        pool,
        ammconfig: ammConfig,
        user: user.publicKey,
        tokenAMint,
        tokenBMint,
        vaultA,
        vaultB,
        lpMint,
        userAtaA,
        userAtaB,
        userLpAta,
        authority,
        tokenProgramA: TOKEN_PROGRAM_ID,
        tokenProgramB: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      } as any)
      .rpc();

    const poolAccount = await program.account.poolState.fetch(pool);
    expect(poolAccount.status).to.equal(1); // 1 = Initialized, not open yet
  });

  it("1.1 Fails to open pool as non-admin (status 2)", async () => {
    const nonAdmin = anchor.web3.Keypair.generate();
    try {
      await program.methods
        .updatePoolStatus(CONFIG_INDEX, 2)
        .accounts({
          owner: nonAdmin.publicKey,
          ammConfig,
          pool,
        } as any)
        .signers([nonAdmin])
        .rpc();
      expect.fail("Should have failed");
    } catch (e: any) {
      expect(e.message).to.contain("UnauthorizedProtocolOwner");
    }
  });

  it("1.2 Admin opens pool for users (status 1 → 2)", async () => {
    // Status 0: Uninitialized | 1: Initialized | 2: Open | 3: Paused
    await program.methods
      .updatePoolStatus(CONFIG_INDEX, 2)
      .accounts({
        owner: user.publicKey,
        ammConfig,
        pool,
      } as any)
      .rpc();

    const poolAccount = await program.account.poolState.fetch(pool);
    expect(poolAccount.status).to.equal(2); // 2 = Open for users
  });

  it("2. Fails to initialize with identical mints", async () => {
    const [samePool] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), tokenAMint.toBuffer(), tokenAMint.toBuffer()],
      program.programId
    );
    const [sameVaultA] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("vault_a"), samePool.toBuffer()], program.programId);
    const [sameVaultB] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("vault_b"), samePool.toBuffer()], program.programId);
    const [sameLpMint] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("lp_mint"), tokenAMint.toBuffer(), tokenAMint.toBuffer()], program.programId);
    const [sameAuthority] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("authority"), samePool.toBuffer()], program.programId);
    const sameLpAta = getAssociatedTokenAddressSync(sameLpMint, user.publicKey);

    try {
      await program.methods
        .initializePool(new anchor.BN(100), new anchor.BN(100))
        .accounts({
          pool: samePool,
          ammconfig: ammConfig,
          user: user.publicKey,
          tokenAMint: tokenAMint,
          tokenBMint: tokenAMint,
          vaultA: sameVaultA,
          vaultB: sameVaultB,
          lpMint: sameLpMint,
          userAtaA: userAtaA,
          userAtaB: userAtaA,
          userLpAta: sameLpAta,
          authority: sameAuthority,
          tokenProgramA: TOKEN_PROGRAM_ID,
          tokenProgramB: TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        } as any)
        .rpc();
      expect.fail("Should have failed");
    } catch (e: any) {
      expect(e.message).to.contain("IdenticalMints");
    }
  });

  it("3. Adds liquidity successfully", async () => {
    const amountA = new anchor.BN(500_000_000);
    const amountB = new anchor.BN(1_000_000_000);

    await program.methods
      .addLiquidity(amountA, amountB, amountA, amountB)
      .accounts({
        pool,
        tokenAMint,
        tokenBMint,
        vaultA,
        vaultB,
        lpMint,
        userAtaA,
        userAtaB,
        userLpAta,
        user: user.publicKey,
        authority,
        tokenProgramA: TOKEN_PROGRAM_ID,
        tokenProgramB: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      } as any)
      .rpc();

    const poolAccount = await program.account.poolState.fetch(pool);
    expect(poolAccount.reserveA.toNumber()).to.equal(1_500_000_000);
    expect(poolAccount.reserveB.toNumber()).to.equal(3_000_000_000);
  });

  it("4. Fails to add liquidity with excessive slippage", async () => {
    try {
      await program.methods
        .addLiquidity(new anchor.BN(1000), new anchor.BN(1000), new anchor.BN(1), new anchor.BN(1))
        .accounts({
          pool,
          tokenAMint,
          tokenBMint,
          vaultA,
          vaultB,
          lpMint,
          userAtaA,
          userAtaB,
          userLpAta,
          user: user.publicKey,
          authority,
          tokenProgramA: TOKEN_PROGRAM_ID,
          tokenProgramB: TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        } as any)
        .rpc();
      expect.fail("Should have failed");
    } catch (e: any) {
      expect(e.message).to.contain("ExceedsMaxTokenA");
    }
  });

  it("5. Swaps Token A for B and generates fees", async () => {
    const amountIn = new anchor.BN(100_000_000);
    await program.methods
      .swapExactIn(amountIn, new anchor.BN(0), true)
      .accounts({
        user: user.publicKey,
        ammConfig,
        pool,
        vaultA,
        vaultB,
        userAtaA,
        userAtaB,
        authority,
        tokenA: tokenAMint,
        tokenB: tokenBMint,
        tokenProgramA: TOKEN_PROGRAM_ID,
        tokenProgramB: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      } as any)
      .rpc();

    const poolAccount = await program.account.poolState.fetch(pool);
    expect(poolAccount.protocolFeesA.toNumber()).to.be.gt(0);
    expect(poolAccount.fundFeesA.toNumber()).to.be.gt(0);
  });

  it("6. Fails to swap with high slippage (Exact In)", async () => {
    try {
      await program.methods
        .swapExactIn(new anchor.BN(1000), new anchor.BN(1000000), true)
        .accounts({
          user: user.publicKey,
          ammConfig,
          pool,
          vaultA,
          vaultB,
          userAtaA,
          userAtaB,
          authority,
          tokenA: tokenAMint,
          tokenB: tokenBMint,
          tokenProgramA: TOKEN_PROGRAM_ID,
          tokenProgramB: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        } as any)
        .rpc();
      expect.fail("Should have failed");
    } catch (e: any) {
      expect(e.message).to.contain("SlippageToleranceMet");
    }
  });

  it("7. Fails to swap with excessive max_in (Exact Out)", async () => {
    try {
      await program.methods
        .swapExactOut(new anchor.BN(1000), new anchor.BN(1), true)
        .accounts({
          user: user.publicKey,
          ammConfig,
          pool,
          vaultA,
          vaultB,
          userAtaA,
          userAtaB,
          authority,
          tokenA: tokenAMint,
          tokenB: tokenBMint,
          tokenProgramA: TOKEN_PROGRAM_ID,
          tokenProgramB: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        } as any)
        .rpc();
      expect.fail("Should have failed");
    } catch (e: any) {
      expect(e.message).to.contain("SlippageToleranceMet");
    }
  });

  it("8. Admin collects protocol fees", async () => {
    const poolAccountBefore = await program.account.poolState.fetch(pool);
    const amountToCollect = poolAccountBefore.protocolFeesA;

    await program.methods
      .collectProtocolFee(CONFIG_INDEX, amountToCollect, new anchor.BN(0))
      .accounts({
        owner: user.publicKey,
        ammConfig,
        pool,
        tokenAMint,
        tokenBMint,
        vaultA,
        vaultB,
        recipientAtaA: userAtaA,
        recipientAtaB: userAtaB,
        authority,
        tokenProgramA: TOKEN_PROGRAM_ID,
        tokenProgramB: TOKEN_PROGRAM_ID,
      } as any)
      .rpc();

    const poolAccountAfter = await program.account.poolState.fetch(pool);
    expect(poolAccountAfter.protocolFeesA.toNumber()).to.equal(0);
  });

  it("9. Fails to collect protocol fees as non-owner", async () => {
    const nonOwner = anchor.web3.Keypair.generate();
    try {
      await program.methods
        .collectProtocolFee(CONFIG_INDEX, new anchor.BN(1), new anchor.BN(0))
        .accounts({
          owner: nonOwner.publicKey,
          ammConfig,
          pool,
          tokenAMint: tokenAMint,
          tokenBMint: tokenBMint,
          vaultA: vaultA,
          vaultB: vaultB,
          recipientAtaA: userAtaA,
          recipientAtaB: userAtaB,
          authority: authority,
          tokenProgramA: TOKEN_PROGRAM_ID,
          tokenProgramB: TOKEN_PROGRAM_ID,
        } as any)
        .signers([nonOwner])
        .rpc();
      expect.fail("Should have failed");
    } catch (e: any) {
      expect(e.message).to.contain("UnauthorizedProtocolOwner");
    }
  });

  it("10. Admin collects fund fees", async () => {
    const poolAccountBefore = await program.account.poolState.fetch(pool);
    const amountToCollect = poolAccountBefore.fundFeesA;

    await program.methods
      .collectFundFee(CONFIG_INDEX, amountToCollect, new anchor.BN(0))
      .accounts({
        owner: user.publicKey,
        ammConfig,
        pool,
        tokenAMint,
        tokenBMint,
        vaultA,
        vaultB,
        recipientAtaA: userAtaA,
        recipientAtaB: userAtaB,
        authority,
        tokenProgramA: TOKEN_PROGRAM_ID,
        tokenProgramB: TOKEN_PROGRAM_ID,
      } as any)
      .rpc();

    const poolAccountAfter = await program.account.poolState.fetch(pool);
    expect(poolAccountAfter.fundFeesA.toNumber()).to.equal(0);
  });

  it("11. Fails to collect fund fees as non-owner", async () => {
    const nonOwner = anchor.web3.Keypair.generate();
    try {
      await program.methods
        .collectFundFee(CONFIG_INDEX, new anchor.BN(1), new anchor.BN(0))
        .accounts({
          owner: nonOwner.publicKey,
          ammConfig,
          pool,
          tokenAMint: tokenAMint,
          tokenBMint: tokenBMint,
          vaultA: vaultA,
          vaultB: vaultB,
          recipientAtaA: userAtaA,
          recipientAtaB: userAtaB,
          authority: authority,
          tokenProgramA: TOKEN_PROGRAM_ID,
          tokenProgramB: TOKEN_PROGRAM_ID,
        } as any)
        .signers([nonOwner])
        .rpc();
      expect.fail("Should have failed");
    } catch (e: any) {
      expect(e.message).to.contain("UnauthorizedFundOwner");
    }
  });

  it("12. Removes liquidity and burns LP", async () => {
    const userLpAccount = await provider.connection.getTokenAccountBalance(userLpAta);
    const lpToBurn = new anchor.BN(userLpAccount.value.amount);

    await program.methods
      .removeLiquidity(lpToBurn, new anchor.BN(0), new anchor.BN(0))
      .accounts({
        pool,
        user: user.publicKey,
        tokenAMint,
        tokenBMint,
        vaultA,
        vaultB,
        lpMint,
        userAtaA,
        userAtaB,
        userLpAta,
        authority,
        tokenProgramA: TOKEN_PROGRAM_ID,
        tokenProgramB: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      } as any)
      .rpc();

    const poolAccount = await program.account.poolState.fetch(pool);
    expect(poolAccount.lpSupply.toNumber()).to.equal(0);
  });

  it("13. Admin updates AMM config", async () => {
    const newTradeFee = new anchor.BN(3000); // 0.3%
    await program.methods
      .updateConfig(
        CONFIG_INDEX,
        newTradeFee,
        null,
        null,
        null
      )
      .accounts({
        owner: user.publicKey,
        ammConfig,
      } as any)
      .rpc();

    const configAccount = await program.account.ammConfig.fetch(ammConfig);
    expect(configAccount.tradeFeesBps.toNumber()).to.equal(3000);
  });

  it("14. Fails to update AMM config as non-admin", async () => {
    const nonAdmin = anchor.web3.Keypair.generate();
    try {
      await program.methods
        .updateConfig(CONFIG_INDEX, new anchor.BN(100), null, null, null)
        .accounts({
          owner: nonAdmin.publicKey,
          ammConfig,
        } as any)
        .signers([nonAdmin])
        .rpc();
      expect.fail("Should have failed");
    } catch (e: any) {
      expect(e.message).to.contain("UnauthorizedProtocolOwner");
    }
  });

  it("14.1 Fails to transfer admin as non-admin", async () => {
    const nonAdmin = anchor.web3.Keypair.generate();
    try {
      await program.methods
        .transferAdmin(CONFIG_INDEX, nonAdmin.publicKey)
        .accounts({
          owner: nonAdmin.publicKey,
          ammConfig,
        } as any)
        .signers([nonAdmin])
        .rpc();
      expect.fail("Should have failed");
    } catch (e: any) {
      expect(e.message).to.contain("UnauthorizedProtocolOwner");
    }
  });

  it("14.2 Fails to update pool status as non-admin", async () => {
    const nonAdmin = anchor.web3.Keypair.generate();
    try {
      await program.methods
        .updatePoolStatus(CONFIG_INDEX, 1)
        .accounts({
          owner: nonAdmin.publicKey,
          ammConfig,
          pool,
        } as any)
        .signers([nonAdmin])
        .rpc();
      expect.fail("Should have failed");
    } catch (e: any) {
      expect(e.message).to.contain("UnauthorizedProtocolOwner");
    }
  });

  it("14.3 Fails to collect protocol fees as non-admin/non-owner", async () => {
    const nonAdmin = anchor.web3.Keypair.generate();
    try {
      await program.methods
        .collectProtocolFee(CONFIG_INDEX, new anchor.BN(100), new anchor.BN(0))
        .accounts({
          owner: nonAdmin.publicKey,
          ammConfig,
          pool,
          tokenAMint,
          tokenBMint,
          vaultA,
          vaultB,
          recipientAtaA: userAtaA,
          recipientAtaB: userAtaB,
          authority,
          tokenProgramA: TOKEN_PROGRAM_ID,
          tokenProgramB: TOKEN_PROGRAM_ID,
        } as any)
        .signers([nonAdmin])
        .rpc();
      expect.fail("Should have failed");
    } catch (e: any) {
      expect(e.message).to.contain("UnauthorizedProtocolOwner");
    }
  });

  it("14.4 Admin transfers admin successfully", async () => {
    const newAdmin = anchor.web3.Keypair.generate();
    await program.methods
      .transferAdmin(CONFIG_INDEX, newAdmin.publicKey)
      .accounts({
        owner: user.publicKey,
        ammConfig,
      } as any)
      .rpc();

    let configAccount = await program.account.ammConfig.fetch(ammConfig);
    expect(configAccount.admin.toBase58()).to.equal(newAdmin.publicKey.toBase58());

    // Transfer back to the original user for subsequent tests
    await program.methods
      .transferAdmin(CONFIG_INDEX, user.publicKey)
      .accounts({
        owner: newAdmin.publicKey,
        ammConfig,
      } as any)
      .signers([newAdmin])
      .rpc();

    configAccount = await program.account.ammConfig.fetch(ammConfig);
    expect(configAccount.admin.toBase58()).to.equal(user.publicKey.toBase58());
  });

  it("14.5 Admin can update pool status through full lifecycle", async () => {
    // Pause the pool
    await program.methods
      .updatePoolStatus(CONFIG_INDEX, 3)
      .accounts({ owner: user.publicKey, ammConfig, pool } as any)
      .rpc();
    let poolAccount = await program.account.poolState.fetch(pool);
    expect(poolAccount.status).to.equal(3); // 3 = Paused

    // Re-open for users
    await program.methods
      .updatePoolStatus(CONFIG_INDEX, 2)
      .accounts({ owner: user.publicKey, ammConfig, pool } as any)
      .rpc();
    poolAccount = await program.account.poolState.fetch(pool);
    expect(poolAccount.status).to.equal(2); // 2 = Open
  });

  it("15. Admin collects more than available protocol fees (Caps at available)", async () => {
    // Large amounts to ensure non-zero fees even with rounding
    const amountA = new anchor.BN(10_000_000);
    const amountB = new anchor.BN(20_000_000);

    const mint1 = await createMint(provider.connection, user, user.publicKey, null, 6);
    const mint2 = await createMint(provider.connection, user, user.publicKey, null, 6);
    const [tokenA, tokenB] = mint1.toBuffer().compare(mint2.toBuffer()) < 0 ? [mint1, mint2] : [mint2, mint1];

    const [newPool] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("pool"), tokenA.toBuffer(), tokenB.toBuffer()], program.programId);
    const [newVaultA] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("vault_a"), newPool.toBuffer()], program.programId);
    const [newVaultB] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("vault_b"), newPool.toBuffer()], program.programId);
    const [newLpMint] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("lp_mint"), tokenA.toBuffer(), tokenB.toBuffer()], program.programId);
    const [newAuth] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("authority"), newPool.toBuffer()], program.programId);

    const ataA = (await getOrCreateAssociatedTokenAccount(provider.connection, user, tokenA, user.publicKey)).address;
    const ataB = (await getOrCreateAssociatedTokenAccount(provider.connection, user, tokenB, user.publicKey)).address;
    const lpAta = getAssociatedTokenAddressSync(newLpMint, user.publicKey);

    await mintTo(provider.connection, user, tokenA, ataA, user, 100_000_000);
    await mintTo(provider.connection, user, tokenB, ataB, user, 100_000_000);

    await program.methods
      .initializePool(amountA, amountB)
      .accounts({
        pool: newPool, ammconfig: ammConfig, user: user.publicKey, tokenAMint: tokenA, tokenBMint: tokenB,
        vaultA: newVaultA, vaultB: newVaultB, lpMint: newLpMint, userAtaA: ataA, userAtaB: ataB, userLpAta: lpAta,
        authority: newAuth, tokenProgramA: TOKEN_PROGRAM_ID, tokenProgramB: TOKEN_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .rpc();

    // Open newPool for users (status 1 → 2)
    await program.methods
      .updatePoolStatus(CONFIG_INDEX, 2)
      .accounts({ owner: user.publicKey, ammConfig, pool: newPool } as any)
      .rpc();

    // Large swap: 10,000,000 * 0.25% = 25,000. 12% of that is 3,000 protocol fees.
    await program.methods
      .swapExactIn(new anchor.BN(10_000_000), new anchor.BN(0), true)
      .accounts({
        user: user.publicKey, ammConfig, pool: newPool, vaultA: newVaultA, vaultB: newVaultB,
        userAtaA: ataA, userAtaB: ataB, authority: newAuth, tokenA, tokenB,
        tokenProgramA: TOKEN_PROGRAM_ID, tokenProgramB: TOKEN_PROGRAM_ID,
      } as any)
      .rpc();

    const poolAccount = await program.account.poolState.fetch(newPool);
    expect(poolAccount.protocolFeesA.toNumber()).to.be.gt(0);

    const giantRequest = new anchor.BN(1_000_000_000);
    await program.methods
      .collectProtocolFee(CONFIG_INDEX, giantRequest, new anchor.BN(0))
      .accounts({
        owner: user.publicKey, ammConfig, pool: newPool, tokenAMint: tokenA, tokenBMint: tokenB,
        vaultA: newVaultA, vaultB: newVaultB, recipientAtaA: ataA, recipientAtaB: ataB,
        authority: newAuth, tokenProgramA: TOKEN_PROGRAM_ID, tokenProgramB: TOKEN_PROGRAM_ID,
      } as any)
      .rpc();

    const poolAccountAfter = await program.account.poolState.fetch(newPool);
    expect(poolAccountAfter.protocolFeesA.toNumber()).to.equal(0);

    // Also verify Fund Fee capping works
    expect(poolAccount.fundFeesA.toNumber()).to.be.gt(0);
    await program.methods
      .collectFundFee(CONFIG_INDEX, giantRequest, new anchor.BN(0))
      .accounts({
        owner: user.publicKey, ammConfig, pool: newPool, tokenAMint: tokenA, tokenBMint: tokenB,
        vaultA: newVaultA, vaultB: newVaultB, recipientAtaA: ataA, recipientAtaB: ataB,
        authority: newAuth, tokenProgramA: TOKEN_PROGRAM_ID, tokenProgramB: TOKEN_PROGRAM_ID,
      } as any)
      .rpc();

    const poolAccountFinal = await program.account.poolState.fetch(newPool);
    expect(poolAccountFinal.fundFeesA.toNumber()).to.equal(0);
  });

  it("16. Fails to remove liquidity due to slippage", async () => {
    // Re-add liquidity first so we have something to remove
    await program.methods
      .addLiquidity(new anchor.BN(10_000_000), new anchor.BN(20_000_000), new anchor.BN(10_000_000), new anchor.BN(20_000_000))
      .accounts({
        pool, tokenAMint, tokenBMint, vaultA, vaultB, lpMint, userAtaA, userAtaB, userLpAta,
        user: user.publicKey, authority, tokenProgramA: TOKEN_PROGRAM_ID, tokenProgramB: TOKEN_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .rpc();

    try {
      await program.methods
        .removeLiquidity(new anchor.BN(1000), new anchor.BN(1_000_000), new anchor.BN(1_000_000))
        .accounts({
          pool, user: user.publicKey, tokenAMint, tokenBMint, vaultA, vaultB, lpMint,
          userAtaA, userAtaB, userLpAta, authority,
          tokenProgramA: TOKEN_PROGRAM_ID, tokenProgramB: TOKEN_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .rpc();
      expect.fail("Should have failed");
    } catch (e: any) {
      expect(e.error.errorCode.code).to.equal("BelowMinTokenA");
    }
  });

  it("17. Fails to remove liquidity if user has 0 LP tokens", async () => {
    const poorUser = anchor.web3.Keypair.generate();
    const sig = await provider.connection.requestAirdrop(poorUser.publicKey, 1_000_000_000);
    await provider.connection.confirmTransaction(sig);

    const poorUserLpAta = getAssociatedTokenAddressSync(lpMint, poorUser.publicKey);

    try {
      await program.methods
        .removeLiquidity(new anchor.BN(100), new anchor.BN(0), new anchor.BN(0))
        .accounts({
          pool, user: poorUser.publicKey, tokenAMint, tokenBMint, vaultA, vaultB, lpMint,
          userAtaA, userAtaB, userLpAta: poorUserLpAta, authority,
          tokenProgramA: TOKEN_PROGRAM_ID, tokenProgramB: TOKEN_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([poorUser])
        .rpc();
      expect.fail("Should have failed");
    } catch (e: any) {
      const code = e.error?.errorCode?.code || e.message;
      expect(code).to.be.oneOf(["AccountNotInitialized", "InsufficientLiquidity", "The program expected this account to be already initialized"]);
    }
  });
});
