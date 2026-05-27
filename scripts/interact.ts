import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Raydium } from "../target/types/raydium";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";

const POOL_SEED = Buffer.from("pool");
const VAULT_A_SEED = Buffer.from("vault_a");
const VAULT_B_SEED = Buffer.from("vault_b");
const LP_MINT_SEED = Buffer.from("lp_mint");
const AUTHORITY_SEED = Buffer.from("authority");
const AMM_CONFIG_SEED = Buffer.from("amm_config");

const WALLET_MAP: Record<string, string> = {};

function scanWallets() {
  const files = fs.readdirSync(process.cwd()).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const filePath = path.join(process.cwd(), file);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (Array.isArray(content) && content.length === 64) {
        // Simple trick: we can't easily run execSync here without making main async earlier
        // but we can just use Keypair.fromSecretKey to get the address
        const kp = Keypair.fromSecretKey(new Uint8Array(content));
        WALLET_MAP[kp.publicKey.toBase58()] = filePath;
      }
    } catch (e) { /* skip */ }
  }
}

async function main() {
  scanWallets();
  const connection = new anchor.web3.Connection("https://api.devnet.solana.com", "confirmed");
  
  let user: Keypair;
  const requestedAddr = process.env.USER_ADDR;
  
  if (requestedAddr && WALLET_MAP[requestedAddr]) {
    const keyData = JSON.parse(fs.readFileSync(WALLET_MAP[requestedAddr], "utf-8"));
    user = Keypair.fromSecretKey(new Uint8Array(keyData));
    console.log(`   Using requested wallet: ${requestedAddr} (${path.basename(WALLET_MAP[requestedAddr])})`);
  } else if (process.env.ANCHOR_WALLET) {
    const walletPath = path.resolve(process.env.ANCHOR_WALLET);
    const keyData = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
    user = Keypair.fromSecretKey(new Uint8Array(keyData));
  } else {
    const tempProvider = anchor.AnchorProvider.env();
    user = (tempProvider.wallet as anchor.Wallet).payer;
  }

  const wallet = new anchor.Wallet(user);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  // Manually load IDL since we are bypassing anchor.workspace
  const idlPath = path.resolve(__dirname, "../target/idl/raydium.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const programId = new PublicKey(idl.address);
  const program = new anchor.Program(idl, provider) as Program<Raydium>;

  console.log("   Active Wallet:", user.publicKey.toBase58());

  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "help") {
    printHelp();
    return;
  }

  switch (command) {
    case "setup":
      await handleSetup(provider, program, user);
      break;
    case "config":
      await handleCreateConfig(program, user, args.slice(1));
      break;
    case "update_config":
      await handleUpdateConfig(program, user, args.slice(1));
      break;
    case "update_pool_status":
      await handleUpdatePoolStatus(program, user, args.slice(1));
      break;
    case "transfer_admin":
      await handleTransferAdmin(program, user, args.slice(1));
      break;
    case "init":
      await handleInit(program, user, args.slice(1));
      break;
    case "add":
      await handleAddLiquidity(program, user, args.slice(1));
      break;
    case "remove":
      await handleRemoveLiquidity(program, user, args.slice(1));
      break;
    case "swap_in":
      await handleSwapIn(program, user, args.slice(1));
      break;
    case "swap_out":
      await handleSwapOut(program, user, args.slice(1));
      break;
    case "collect":
      await handleCollectFees(program, user, args.slice(1));
      break;
    case "status":
      await handleStatus(program, args.slice(1));
      break;
    case "show_config":
      await handleShowConfig(program, args.slice(1));
      break;
    default:
      console.log(`Unknown command: ${command}`);
      printHelp();
  }
}

function printHelp() {
  console.log(`
Usage: anchor run interact <command> [args]

Commands:
  setup                               - Full flow: Config, Mints, Init, Liquidity, Swap, Status
  config <index> <trade> <prot> <fund>- Create a new AMM config with specified fees (in bps)
  update_config <index> <trade> <prot> <fund> <disablePool:true|false> - Update config fees
  update_pool_status <mintA> <mintB> <status:0-3> - Update pool status
  transfer_admin <newAdmin>             - Transfer admin ownership of ALL configs to newAdmin
  init <mintA> <mintB> <amtA> <amtB> [configIndex] - Initialize a pool for the given mints
  add <mintA> <mintB> <amtA> <amtB>    - Add liquidity to an existing pool
  remove <mintA> <mintB> <lpAmt>      - Remove liquidity from an existing pool
  swap_in <mintA> <mintB> <in> <a2b> [min]  - Swap Exact In (a2b: true/false)
  swap_out <mintA> <mintB> <out> <a2b> [max]- Swap Exact Out (a2b: true/false)
  collect <mintA> <mintB> <p/f> <amtA> [amtB]  - Collect protocol (p) or fund (f) fees
  status <mintA> <mintB>              - Show pool reserves and LP supply
  show_config <index>                 - Show AMM config details
    `);
}

async function handleCreateConfig(program: Program<Raydium>, user: Keypair, args: string[]) {
  if (args.length < 4) { console.log("Usage: config <index> <tradeFee> <protocolFee> <fundFee>"); return; }
  const index = parseInt(args[0]);
  const tradeFee = new anchor.BN(args[1]);
  const protocolFee = new anchor.BN(args[2]);
  const fundFee = new anchor.BN(args[3]);

  const [ammConfig] = PublicKey.findProgramAddressSync([AMM_CONFIG_SEED, new anchor.BN(index).toArrayLike(Buffer, "le", 2)], program.programId);

  const tx = await program.methods
    .createConfig(index, tradeFee, protocolFee, fundFee)
    .accounts({
      owner: user.publicKey,
      ammConfig,
      protocolOwner: user.publicKey,
      fundOwner: user.publicKey,
      systemProgram: SystemProgram.programId,
    } as any)
    .rpc();
  console.log(`   Config created (Index ${index}):`, tx);
}

async function handleUpdateConfig(program: Program<Raydium>, user: Keypair, args: string[]) {
  if (args.length < 5) { console.log("Usage: update_config <index> <trade> <prot> <fund> <disablePool>"); return; }
  const index = parseInt(args[0]);
  const tradeFee = args[1] === "null" ? null : new anchor.BN(args[1]);
  const protocolFee = args[2] === "null" ? null : new anchor.BN(args[2]);
  const fundFee = args[3] === "null" ? null : new anchor.BN(args[3]);
  const disablePool = args[4] === "true";

  const [ammConfig] = PublicKey.findProgramAddressSync([AMM_CONFIG_SEED, new anchor.BN(index).toArrayLike(Buffer, "le", 2)], program.programId);

  const tx = await program.methods
    .updateConfig(index, tradeFee, protocolFee, fundFee, disablePool)
    .accounts({
      owner: user.publicKey,
      ammConfig,
    } as any)
    .rpc();
  console.log(`   Config updated (Index ${index}):`, tx);
}

async function handleUpdatePoolStatus(program: Program<Raydium>, user: Keypair, args: string[]) {
  if (args.length < 3) { console.log("Usage: update_pool_status <mintA> <mintB> <status>"); return; }
  const mintA = new PublicKey(args[0]);
  const mintB = new PublicKey(args[1]);
  const status = parseInt(args[2]);

  const pool = getPoolPda(program.programId, mintA, mintB);
  const poolState = await program.account.poolState.fetch(pool);

  const configAccount = await program.account.ammConfig.fetch(poolState.ammconfig);
  const tx = await program.methods
    .updatePoolStatus(configAccount.index, status)
    .accounts({
      owner: user.publicKey,
      ammConfig: poolState.ammconfig,
      pool,
    } as any)
    .rpc();
  console.log(`   Pool status updated to ${status}:`, tx);
}

async function handleTransferAdmin(program: Program<Raydium>, user: Keypair, args: string[]) {
  if (args.length < 1) { console.log("Usage: transfer_admin <newAdmin>"); return; }
  const newAdmin = new PublicKey(args[0]);

  // Fetch every ammConfig account owned by this program
  const allConfigs = await program.account.ammConfig.all();
  if (allConfigs.length === 0) {
    console.log("   No ammConfig accounts found on-chain.");
    return;
  }

  console.log(`   Found ${allConfigs.length} config(s). Transferring all to ${newAdmin.toBase58()}...`);

  for (const { publicKey: ammConfig, account } of allConfigs) {
    const index = account.index;
    try {
      const tx = await program.methods
        .transferAdmin(index, newAdmin)
        .accounts({
          owner: user.publicKey,
          ammConfig,
        } as any)
        .rpc();
      console.log(`   ✔ Config index ${index} transferred. Tx: ${tx}`);
    } catch (err: any) {
      console.error(`   ✘ Failed to transfer config index ${index}: ${err.message}`);
    }
  }

  console.log(`\n✅ Admin transfer complete. All configs now owned by ${newAdmin.toBase58()}`);
}

async function handleSetup(provider: anchor.AnchorProvider, program: Program<Raydium>, user: Keypair) {
  console.log("\n🚀 Starting Full Setup Flow...");

  const configIndex = Math.floor(Math.random() * 1000);
  const [ammConfig] = PublicKey.findProgramAddressSync([AMM_CONFIG_SEED, new anchor.BN(configIndex).toArrayLike(Buffer, "le", 2)], program.programId);

  // 1. Create Config
  console.log(`\n1. Creating AMM Config (Index ${configIndex})...`);
  await handleCreateConfig(program, user, [configIndex.toString(), "2500", "300", "100"]);

  // 2. Create Mints
  console.log("\n2. Creating new mints...");
  const mint1 = await createMint(provider.connection, user, user.publicKey, null, 6);
  const mint2 = await createMint(provider.connection, user, user.publicKey, null, 6);

  let tokenAMint: PublicKey, tokenBMint: PublicKey;
  if (mint1.toBuffer().compare(mint2.toBuffer()) < 0) {
    tokenAMint = mint1; tokenBMint = mint2;
  } else {
    tokenAMint = mint2; tokenBMint = mint1;
  }
  console.log(`   Mints: A=${tokenAMint.toBase58()}, B=${tokenBMint.toBase58()}`);

  // 3. Setup ATAs and Mint Tokens
  console.log("\n3. Setting up ATAs and minting initial tokens...");
  const userAtaA = (await getOrCreateAssociatedTokenAccount(provider.connection, user, tokenAMint, user.publicKey)).address;
  const userAtaB = (await getOrCreateAssociatedTokenAccount(provider.connection, user, tokenBMint, user.publicKey)).address;
  await mintTo(provider.connection, user, tokenAMint, userAtaA, user, 10_000_000_000n);
  await mintTo(provider.connection, user, tokenBMint, userAtaB, user, 10_000_000_000n);
  console.log("   User funded with 10,000 tokens of each.");

  // 4. Initialize Pool
  console.log("\n4. Initializing Pool...");
  const amountA = new anchor.BN(1_000_000_000);
  const amountB = new anchor.BN(2_000_000_000);
  await runInit(program, user, tokenAMint, tokenBMint, ammConfig, amountA, amountB);

  // 5. Swap
  console.log("\n5. Executing Swap (100 A -> B)...");
  const swapIn = new anchor.BN(100_000_000);
  await runSwap(program, user, tokenAMint, tokenBMint, ammConfig, swapIn);

  // 6. Final Status
  console.log("\n6. Final Pool Status:");
  await runStatus(program, tokenAMint, tokenBMint);

  console.log("\n✅ Setup complete!");
}

async function handleInit(program: Program<Raydium>, user: Keypair, args: string[]) {
  if (args.length < 4) { console.log("Usage: init <mintA> <mintB> <amtA> <amtB> [configIndex]"); return; }
  const mintA = new PublicKey(args[0]);
  const mintB = new PublicKey(args[1]);
  const amtA = new anchor.BN(args[2]);
  const amtB = new anchor.BN(args[3]);
  const configIndex = parseInt(args[4] || "0");

  const [ammConfig] = PublicKey.findProgramAddressSync([AMM_CONFIG_SEED, new anchor.BN(configIndex).toArrayLike(Buffer, "le", 2)], program.programId);

  await runInit(program, user, mintA, mintB, ammConfig, amtA, amtB);
  await runStatus(program, mintA, mintB);
}

function getSortedMints(mint0: PublicKey, mint1: PublicKey): [PublicKey, PublicKey] {
  return mint0.toBuffer().compare(mint1.toBuffer()) < 0 ? [mint0, mint1] : [mint1, mint0];
}

function getPoolPda(programId: PublicKey, mint0: PublicKey, mint1: PublicKey) {
  const [a, b] = getSortedMints(mint0, mint1);
  return PublicKey.findProgramAddressSync([POOL_SEED, a.toBuffer(), b.toBuffer()], programId)[0];
}

function getLpMintPda(programId: PublicKey, mint0: PublicKey, mint1: PublicKey) {
  const [a, b] = getSortedMints(mint0, mint1);
  return PublicKey.findProgramAddressSync([LP_MINT_SEED, a.toBuffer(), b.toBuffer()], programId)[0];
}




async function runInit(program: Program<Raydium>, user: Keypair, tokenAMint: PublicKey, tokenBMint: PublicKey, ammConfig: PublicKey, amtA: anchor.BN, amtB: anchor.BN) {
  const pool = getPoolPda(program.programId, tokenAMint, tokenBMint);
  const [authority] = PublicKey.findProgramAddressSync([AUTHORITY_SEED, pool.toBuffer()], program.programId);
  const [vaultA] = PublicKey.findProgramAddressSync([VAULT_A_SEED, pool.toBuffer()], program.programId);
  const [vaultB] = PublicKey.findProgramAddressSync([VAULT_B_SEED, pool.toBuffer()], program.programId);
  const lpMint = getLpMintPda(program.programId, tokenAMint, tokenBMint);

  // Use getOrCreateAssociatedTokenAccount instead of getAssociatedTokenAddressSync
  // This creates the ATA on-chain if it doesn't exist yet
  const connection = program.provider.connection;

  console.log("   Ensuring ATAs exist...");
  
  // Dynamically detect program ID for each mint
  const mintAAccount = await connection.getAccountInfo(tokenAMint);
  const mintBAccount = await connection.getAccountInfo(tokenBMint);
  
  const programIdA = mintAAccount?.owner || TOKEN_PROGRAM_ID;
  const programIdB = mintBAccount?.owner || TOKEN_PROGRAM_ID;

  console.log(`   Detected Program A: ${programIdA.toBase58()}`);
  console.log(`   Detected Program B: ${programIdB.toBase58()}`);

  const userAtaAAccount = await getOrCreateAssociatedTokenAccount(
    connection, user, tokenAMint, user.publicKey,
    false, "confirmed", {}, programIdA
  );
  const userAtaBAccount = await getOrCreateAssociatedTokenAccount(
    connection, user, tokenBMint, user.publicKey,
    false, "confirmed", {}, programIdB
  );
  const userLpAta = getAssociatedTokenAddressSync(lpMint, user.publicKey); // LP mint uses regular TOKEN_PROGRAM

  const userAtaA = userAtaAAccount.address;
  const userAtaB = userAtaBAccount.address;

  console.log(`   --- Balance Check ---`);
  console.log(`   Token A (${tokenAMint.toBase58()}):`);
  console.log(`     Program: ${programIdA.toBase58()}`);
  console.log(`     ATA: ${userAtaA.toBase58()}`);
  console.log(`     Amount (raw): ${userAtaAAccount.amount}`);
  console.log(`     Required (raw): ${amtA.toString()}`);
  
  console.log(`   Token B (${tokenBMint.toBase58()}):`);
  console.log(`     Program: ${programIdB.toBase58()}`);
  console.log(`     ATA: ${userAtaB.toBase58()}`);
  console.log(`     Amount (raw): ${userAtaBAccount.amount}`);
  console.log(`     Required (raw): ${amtB.toString()}`);
  console.log(`   ----------------------`);

  if (BigInt(userAtaAAccount.amount.toString()) < BigInt(amtA.toString())) {
    console.error("❌ ERROR: Insufficient Token A funds in ATA");
  }
  if (BigInt(userAtaBAccount.amount.toString()) < BigInt(amtB.toString())) {
    console.error("❌ ERROR: Insufficient Token B funds in ATA");
  }

  const tx = await program.methods
    .initializePool(amtA, amtB)
    .accounts({
      pool, ammconfig: ammConfig, user: user.publicKey, tokenAMint, tokenBMint,
      vaultA, vaultB, lpMint, userAtaA, userAtaB, userLpAta, authority,
      systemProgram: SystemProgram.programId,
      tokenProgramA: programIdA,
      tokenProgramB: programIdB,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    } as any)
    .rpc();
  console.log("   Pool initialized:", tx);
}

async function handleAddLiquidity(program: Program<Raydium>, user: Keypair, args: string[]) {
  if (args.length < 4) { console.log("Usage: add <mintA> <mintB> <amtA> <amtB>"); return; }
  const tokenAMint = new PublicKey(args[0]);
  const tokenBMint = new PublicKey(args[1]);
  const amountA = new anchor.BN(args[2]);
  const amountB = new anchor.BN(args[3]);
  await runAddLiquidity(program, user, tokenAMint, tokenBMint, amountA, amountB);
  await runStatus(program, tokenAMint, tokenBMint);
}

async function runAddLiquidity(program: Program<Raydium>, user: Keypair, tokenAMint: PublicKey, tokenBMint: PublicKey, amountA: anchor.BN, amountB: anchor.BN) {
  const pool = getPoolPda(program.programId, tokenAMint, tokenBMint);
  const poolState = await program.account.poolState.fetch(pool);
  const [authority] = PublicKey.findProgramAddressSync([AUTHORITY_SEED, pool.toBuffer()], program.programId);
  const [vaultA] = PublicKey.findProgramAddressSync([VAULT_A_SEED, pool.toBuffer()], program.programId);
  const [vaultB] = PublicKey.findProgramAddressSync([VAULT_B_SEED, pool.toBuffer()], program.programId);
  const lpMint = getLpMintPda(program.programId, tokenAMint, tokenBMint);

  const userAtaA = getAssociatedTokenAddressSync(tokenAMint, user.publicKey, false, poolState.tokenProgramA);
  const userAtaB = getAssociatedTokenAddressSync(tokenBMint, user.publicKey, false, poolState.tokenProgramB);
  const userLpAta = getAssociatedTokenAddressSync(lpMint, user.publicKey);

  const tx = await program.methods
    .addLiquidity(amountA, amountB, amountA, amountB) // max slippage 0 for simplicity
    .accounts({
      pool, tokenAMint, tokenBMint, vaultA, vaultB, lpMint, userAtaA, userAtaB, userLpAta,
      user: user.publicKey, authority,
      tokenProgramA: poolState.tokenProgramA,
      tokenProgramB: poolState.tokenProgramB,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    } as any)
    .rpc();
  console.log("   Liquidity added:", tx);
}

async function handleRemoveLiquidity(program: Program<Raydium>, user: Keypair, args: string[]) {
  if (args.length < 3) { console.log("Usage: remove <mintA> <mintB> <lpAmt>"); return; }
  const tokenAMint = new PublicKey(args[0]);
  const tokenBMint = new PublicKey(args[1]);
  const lpAmount = new anchor.BN(args[2]);

  const pool = getPoolPda(program.programId, tokenAMint, tokenBMint);
  const poolState = await program.account.poolState.fetch(pool);
  const [authority] = PublicKey.findProgramAddressSync([AUTHORITY_SEED, pool.toBuffer()], program.programId);
  const [vaultA] = PublicKey.findProgramAddressSync([VAULT_A_SEED, pool.toBuffer()], program.programId);
  const [vaultB] = PublicKey.findProgramAddressSync([VAULT_B_SEED, pool.toBuffer()], program.programId);
  const lpMint = getLpMintPda(program.programId, tokenAMint, tokenBMint);

  const userAtaA = getAssociatedTokenAddressSync(tokenAMint, user.publicKey, false, poolState.tokenProgramA);
  const userAtaB = getAssociatedTokenAddressSync(tokenBMint, user.publicKey, false, poolState.tokenProgramB);
  const userLpAta = getAssociatedTokenAddressSync(lpMint, user.publicKey);

  const tx = await program.methods
    .removeLiquidity(lpAmount, new anchor.BN(0), new anchor.BN(0))
    .accounts({
      pool, user: user.publicKey, tokenAMint, tokenBMint, vaultA, vaultB, lpMint, userAtaA, userAtaB, userLpAta, authority,
      tokenProgramA: poolState.tokenProgramA,
      tokenProgramB: poolState.tokenProgramB,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    } as any)
    .rpc();
  console.log("   Liquidity removed:", tx);
  await runStatus(program, tokenAMint, tokenBMint);
}

async function handleSwapIn(program: Program<Raydium>, user: Keypair, args: string[]) {
  if (args.length < 4) { console.log("Usage: swap_in <mintA> <mintB> <amtIn> <a2b: true|false> [minOut]"); return; }
  const tokenAMint = new PublicKey(args[0]);
  const tokenBMint = new PublicKey(args[1]);
  const amountIn = new anchor.BN(args[2]);
  const aToB = args[3] === "true";
  const minOut = new anchor.BN(args[4] || "0");

  const pool = getPoolPda(program.programId, tokenAMint, tokenBMint);
  const poolState = await program.account.poolState.fetch(pool);
  const [authority] = PublicKey.findProgramAddressSync([AUTHORITY_SEED, pool.toBuffer()], program.programId);
  const [vaultA] = PublicKey.findProgramAddressSync([VAULT_A_SEED, pool.toBuffer()], program.programId);
  const [vaultB] = PublicKey.findProgramAddressSync([VAULT_B_SEED, pool.toBuffer()], program.programId);

  const userAtaA = getAssociatedTokenAddressSync(tokenAMint, user.publicKey, false, poolState.tokenProgramA);
  const userAtaB = getAssociatedTokenAddressSync(tokenBMint, user.publicKey, false, poolState.tokenProgramB);

  const tx = await program.methods
    .swapExactIn(amountIn, minOut, aToB)
    .accounts({
      user: user.publicKey, ammConfig: poolState.ammconfig, pool, vaultA, vaultB, userAtaA, userAtaB, authority,
      tokenA: tokenAMint, tokenB: tokenBMint,
      tokenProgramA: poolState.tokenProgramA,
      tokenProgramB: poolState.tokenProgramB,
      systemProgram: SystemProgram.programId,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    } as any)
    .rpc();
  console.log("   Swap In completed:", tx);
  await runStatus(program, tokenAMint, tokenBMint);
}

async function handleSwapOut(program: Program<Raydium>, user: Keypair, args: string[]) {
  if (args.length < 4) { console.log("Usage: swap_out <mintA> <mintB> <amtOut> <a2b: true|false> [maxIn]"); return; }
  const tokenAMint = new PublicKey(args[0]);
  const tokenBMint = new PublicKey(args[1]);
  const amountOut = new anchor.BN(args[2]);
  const aToB = args[3] === "true";
  const maxIn = new anchor.BN(args[4] || "0");

  const pool = getPoolPda(program.programId, tokenAMint, tokenBMint);
  const poolState = await program.account.poolState.fetch(pool);
  const [authority] = PublicKey.findProgramAddressSync([AUTHORITY_SEED, pool.toBuffer()], program.programId);
  const [vaultA] = PublicKey.findProgramAddressSync([VAULT_A_SEED, pool.toBuffer()], program.programId);
  const [vaultB] = PublicKey.findProgramAddressSync([VAULT_B_SEED, pool.toBuffer()], program.programId);

  const userAtaA = getAssociatedTokenAddressSync(tokenAMint, user.publicKey, false, poolState.tokenProgramA);
  const userAtaB = getAssociatedTokenAddressSync(tokenBMint, user.publicKey, false, poolState.tokenProgramB);

  const tx = await program.methods
    .swapExactOut(amountOut, maxIn.isZero() ? new anchor.BN("18446744073709551615") : maxIn, aToB)
    .accounts({
      user: user.publicKey, ammConfig: poolState.ammconfig, pool, vaultA, vaultB, userAtaA, userAtaB, authority,
      tokenA: tokenAMint, tokenB: tokenBMint,
      tokenProgramA: poolState.tokenProgramA,
      tokenProgramB: poolState.tokenProgramB,
      systemProgram: SystemProgram.programId,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    } as any)
    .rpc();
  console.log("   Swap Out completed:", tx);
  await runStatus(program, tokenAMint, tokenBMint);
}

async function runSwap(program: Program<Raydium>, user: Keypair, tokenAMint: PublicKey, tokenBMint: PublicKey, ammConfig: PublicKey, amountIn: anchor.BN) {
  const pool = getPoolPda(program.programId, tokenAMint, tokenBMint);
  const poolState = await program.account.poolState.fetch(pool);
  const [authority] = PublicKey.findProgramAddressSync([AUTHORITY_SEED, pool.toBuffer()], program.programId);
  const [vaultA] = PublicKey.findProgramAddressSync([VAULT_A_SEED, pool.toBuffer()], program.programId);
  const [vaultB] = PublicKey.findProgramAddressSync([VAULT_B_SEED, pool.toBuffer()], program.programId);

  const userAtaA = getAssociatedTokenAddressSync(tokenAMint, user.publicKey);
  const userAtaB = getAssociatedTokenAddressSync(tokenBMint, user.publicKey);

  const tx = await program.methods
    .swapExactIn(amountIn, new anchor.BN(0), true)
    .accounts({
      user: user.publicKey, ammConfig, pool, vaultA, vaultB, userAtaA, userAtaB, authority,
      tokenA: tokenAMint, tokenB: tokenBMint,
      tokenProgramA: poolState.tokenProgramA,
      tokenProgramB: poolState.tokenProgramB,
      systemProgram: SystemProgram.programId,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    } as any)
    .rpc();
  console.log("   Swap completed:", tx);
}


async function handleCollectFees(program: Program<Raydium>, user: Keypair, args: string[]) {
  if (args.length < 4) { console.log("Usage: collect <mintA> <mintB> <p/f> <amtA> [amtB]"); return; }
  const tokenAMint = new PublicKey(args[0]);
  const tokenBMint = new PublicKey(args[1]);
  const type = args[2]; // 'p' for protocol, 'f' for fund
  const amtA = new anchor.BN(args[3]);
  const amtB = new anchor.BN(args[4] || "0");

  const pool = getPoolPda(program.programId, tokenAMint, tokenBMint);
  const poolState = await program.account.poolState.fetch(pool);
  const [authority] = PublicKey.findProgramAddressSync([AUTHORITY_SEED, pool.toBuffer()], program.programId);
  const [vaultA] = PublicKey.findProgramAddressSync([VAULT_A_SEED, pool.toBuffer()], program.programId);
  const [vaultB] = PublicKey.findProgramAddressSync([VAULT_B_SEED, pool.toBuffer()], program.programId);
  const userAtaAAcc = await getOrCreateAssociatedTokenAccount(program.provider.connection, user, tokenAMint, user.publicKey, false, "confirmed", {}, poolState.tokenProgramA);
  const userAtaBAcc = await getOrCreateAssociatedTokenAccount(program.provider.connection, user, tokenBMint, user.publicKey, false, "confirmed", {}, poolState.tokenProgramB);
  const userAtaA = userAtaAAcc.address;
  const userAtaB = userAtaBAcc.address;

  const accounts = {
    owner: user.publicKey, ammConfig: poolState.ammconfig, pool, tokenAMint, tokenBMint, vaultA, vaultB,
    recipientAtaA: userAtaA, recipientAtaB: userAtaB, authority,
    tokenProgramA: poolState.tokenProgramA, tokenProgramB: poolState.tokenProgramB,
  };

  const configAccount = await program.account.ammConfig.fetch(poolState.ammconfig);
  const tx = type === 'p'
    ? await program.methods.collectProtocolFee(configAccount.index, amtA, amtB).accounts(accounts as any).rpc()
    : await program.methods.collectFundFee(configAccount.index, amtA, amtB).accounts(accounts as any).rpc();

  console.log(`   Fees collected (${type === 'p' ? 'Protocol' : 'Fund'}):`, tx);
  await runStatus(program, tokenAMint, tokenBMint);
}

async function handleStatus(program: Program<Raydium>, args: string[]) {
  if (args.length < 2) { console.log("Usage: status <mintA> <mintB>"); return; }
  const tokenAMint = new PublicKey(args[0]);
  const tokenBMint = new PublicKey(args[1]);
  await runStatus(program, tokenAMint, tokenBMint);
}

async function runStatus(program: Program<Raydium>, tokenAMint: PublicKey, tokenBMint: PublicKey) {
  const pool = getPoolPda(program.programId, tokenAMint, tokenBMint);
  const poolState = await program.account.poolState.fetch(pool);

  console.log("   ------------------");
  console.log("   Pool: ", pool.toBase58());
  console.log("   Reserve A: ", poolState.reserveA.toString());
  console.log("   Reserve B: ", poolState.reserveB.toString());
  console.log("   Protocol Fee A: ", poolState.protocolFeesA.toString());
  console.log("   Protocol Fee B: ", poolState.protocolFeesB.toString());
  console.log("   Fund Fee A:     ", poolState.fundFeesA.toString());
  console.log("   Fund Fee B:     ", poolState.fundFeesB.toString());
  console.log("   LP Supply: ", poolState.lpSupply.toString());
  console.log("   ------------------");
}

async function handleShowConfig(program: Program<Raydium>, args: string[]) {
  if (args.length < 1) { console.log("Usage: show_config <index>"); return; }
  const index = parseInt(args[0]);
  const [ammConfig] = PublicKey.findProgramAddressSync([AMM_CONFIG_SEED, new anchor.BN(index).toArrayLike(Buffer, "le", 2)], program.programId);

  const config = await program.account.ammConfig.fetch(ammConfig);
  console.log("   --- AMM Config ---");
  console.log("   Index: ", config.index);
  console.log("   Admin: ", config.admin.toBase58());
  console.log("   Protocol Owner: ", config.protocolOwner.toBase58());
  console.log("   Fund Owner: ", config.fundOwner.toBase58());
  console.log("   Trade Fees (bps): ", config.tradeFeesBps.toString());
  console.log("   Protocol Fees (bps): ", config.protocolFeesBps.toString());
  console.log("   Fund Fees (bps): ", config.fundFeesBps.toString());
  console.log("   Disable Pool: ", config.disablePool);
  console.log("   ------------------");
}

main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
