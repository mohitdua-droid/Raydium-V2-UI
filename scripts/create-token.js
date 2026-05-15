#!/usr/bin/env node

/**
 * SPL Token 2022 Creator & Minter (Devnet)
 * Usage:
 *   node create-token.js --symbol MYTOKEN --decimals 9 --amount 1000000
 *   node create-token.js --symbol USDC --decimals 6 --amount 500000 --name "My USDC"
 *
 * Options:
 *   --symbol     Token symbol (required)
 *   --decimals   Token decimals (default: 9)
 *   --amount     Amount to mint (in whole tokens, default: 1000000)
 *   --name       Token name (optional, defaults to symbol)
 *   --keypair    Path to keypair file (optional, uses default Solana CLI keypair if omitted)
 */

const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} = require("@solana/web3.js");

const {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializeMetadataPointerInstruction,
  getMintLen,
  ExtensionType,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TYPE_SIZE,
  LENGTH_SIZE,
} = require("@solana/spl-token");

const {
  createInitializeInstruction,
  pack,
} = require("@solana/spl-token-metadata");

const fs = require("fs");
const path = require("path");
const os = require("os");

// ─── Parse CLI args ───────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    symbol: null,
    decimals: 9,
    amount: 1_000_000,
    name: null,
    keypair: null,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--symbol":   opts.symbol   = args[++i]; break;
      case "--decimals": opts.decimals = parseInt(args[++i], 10); break;
      case "--amount":   opts.amount   = parseFloat(args[++i]); break;
      case "--name":     opts.name     = args[++i]; break;
      case "--keypair":  opts.keypair  = args[++i]; break;
      default:
        console.warn(`Unknown argument: ${args[i]}`);
    }
  }

  if (!opts.symbol) {
    console.error("❌  --symbol is required. Example: --symbol MYTOKEN");
    process.exit(1);
  }

  opts.name = opts.name || opts.symbol;
  return opts;
}

// ─── Load keypair ─────────────────────────────────────────────────────────────
function loadKeypair(keypairPath) {
  const resolved =
    keypairPath ||
    path.join(os.homedir(), ".config", "solana", "id.json");

  if (!fs.existsSync(resolved)) {
    console.error(`❌  Keypair file not found: ${resolved}`);
    console.error(
      "   Run `solana-keygen new` to create one, or pass --keypair <path>"
    );
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(resolved, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

// ─── Airdrop if balance is low ────────────────────────────────────────────────
async function ensureFunded(connection, payer) {
  const balance = await connection.getBalance(payer.publicKey);
  console.log(
    `💰  Payer balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`
  );

  if (balance < 0.1 * LAMPORTS_PER_SOL) {
    console.log("⏳  Balance low — requesting airdrop of 2 SOL…");
    const sig = await connection.requestAirdrop(
      payer.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig, "confirmed");
    console.log("✅  Airdrop confirmed");
  }
}

// ─── Update mintaddresses.json ────────────────────────────────────────────────
function saveMintAddress(entry) {
  const file = path.resolve("mintaddresses.json");
  let existing = [];

  if (fs.existsSync(file)) {
    try {
      existing = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!Array.isArray(existing)) existing = [existing];
    } catch {
      existing = [];
    }
  }

  existing.push(entry);
  fs.writeFileSync(file, JSON.stringify(existing, null, 2));
  console.log(`📄  Mint address saved → ${file}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs();
  console.log("\n🚀  SPL Token 2022 Creator");
  console.log(`   Symbol:   ${opts.symbol}`);
  console.log(`   Name:     ${opts.name}`);
  console.log(`   Decimals: ${opts.decimals}`);
  console.log(`   Amount:   ${opts.amount.toLocaleString()} tokens\n`);

  // Connection
  const connection = new Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );

  // Keypairs
  const payer = loadKeypair(opts.keypair);
  const mintKeypair = Keypair.generate();
  console.log(`🔑  Payer:      ${payer.publicKey.toBase58()}`);
  console.log(`🪙  Mint pubkey: ${mintKeypair.publicKey.toBase58()}\n`);

  await ensureFunded(connection, payer);

  // ── Build metadata ──────────────────────────────────────────────────────────
  const metadata = {
    mint: mintKeypair.publicKey,
    name: opts.name,
    symbol: opts.symbol,
    uri: "",          // no off-chain URI for devnet test tokens
    additionalMetadata: [],
  };

  // ── Calculate space for mint + metadata pointer + metadata ─────────────────
  const mintLen = getMintLen([ExtensionType.MetadataPointer]);
  const metadataLen =
    TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;

  const mintLamports = await connection.getMinimumBalanceForRentExemption(
    mintLen + metadataLen
  );

  // ── Build transaction ───────────────────────────────────────────────────────
  const tx = new Transaction().add(
    // 1. Create mint account
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),

    // 2. Initialize MetadataPointer extension (points to itself)
    createInitializeMetadataPointerInstruction(
      mintKeypair.publicKey,
      payer.publicKey,
      mintKeypair.publicKey,   // metadata stored in the mint account itself
      TOKEN_2022_PROGRAM_ID
    ),

    // 3. Initialize the mint
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      opts.decimals,
      payer.publicKey,
      payer.publicKey,
      TOKEN_2022_PROGRAM_ID
    ),

    // 4. Initialize on-chain metadata
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mintKeypair.publicKey,
      updateAuthority: payer.publicKey,
      mint: mintKeypair.publicKey,
      mintAuthority: payer.publicKey,
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadata.uri,
    })
  );

  console.log("⏳  Creating mint account…");
  const createSig = await sendAndConfirmTransaction(
    connection,
    tx,
    [payer, mintKeypair],
    { commitment: "confirmed" }
  );
  console.log(`✅  Mint created. Tx: ${createSig}`);

  // ── Get / create ATA ────────────────────────────────────────────────────────
  console.log("⏳  Getting associated token account…");
  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mintKeypair.publicKey,
    payer.publicKey,
    false,
    "confirmed",
    {},
    TOKEN_2022_PROGRAM_ID
  );
  console.log(`✅  ATA: ${ata.address.toBase58()}`);

  // ── Mint tokens ─────────────────────────────────────────────────────────────
  const rawAmount = BigInt(Math.round(opts.amount * 10 ** opts.decimals));
  console.log(`⏳  Minting ${opts.amount.toLocaleString()} ${opts.symbol}…`);
  const mintSig = await mintTo(
    connection,
    payer,
    mintKeypair.publicKey,
    ata.address,
    payer,
    rawAmount,
    [],
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID
  );
  console.log(`✅  Minted. Tx: ${mintSig}`);

  // ── Save results ─────────────────────────────────────────────────────────────
  const entry = {
    symbol: opts.symbol,
    name: opts.name,
    decimals: opts.decimals,
    mintAddress: mintKeypair.publicKey.toBase58(),
    ata: ata.address.toBase58(),
    minted: opts.amount,
    network: "devnet",
    createdAt: new Date().toISOString(),
    createTx: createSig,
    mintTx: mintSig,
  };

  saveMintAddress(entry);

  console.log("\n🎉  Done!");
  console.log(`   Mint address : ${entry.mintAddress}`);
  console.log(`   ATA          : ${entry.ata}`);
  console.log(
    `   Explorer     : https://explorer.solana.com/address/${entry.mintAddress}?cluster=devnet\n`
  );
}

main().catch((err) => {
  console.error("\n❌  Error:", err.message || err);
  process.exit(1);
});
