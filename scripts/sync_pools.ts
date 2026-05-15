import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import { Raydium } from "../target/types/raydium";

async function main() {
  const connection = new anchor.web3.Connection("https://api.devnet.solana.com", "confirmed");
  const idlPath = path.resolve(__dirname, "../target/idl/raydium.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const programId = new PublicKey(idl.address);
  
  // Empty wallet for read-only
  const provider = new anchor.AnchorProvider(connection, {} as any, { commitment: "confirmed" });
  const program = new anchor.Program(idl, provider) as Program<Raydium>;

  console.log("🔍 Fetching all pools from program:", programId.toBase58());
  
  const allPools = await program.account.poolState.all();
  console.log(`✅ Found ${allPools.length} pools on-chain.`);

  const POOL_SEED = Buffer.from("pool");
  const VAULT_A_SEED = Buffer.from("vault_a");
  const VAULT_B_SEED = Buffer.from("vault_b");
  const LP_MINT_SEED = Buffer.from("lp_mint");
  const AUTHORITY_SEED = Buffer.from("authority");

  const poolEntries = allPools.map(p => {
    const pool = p.publicKey;
    const state = p.account;

    const [authority] = PublicKey.findProgramAddressSync([AUTHORITY_SEED, pool.toBuffer()], programId);
    const [vaultA] = PublicKey.findProgramAddressSync([VAULT_A_SEED, pool.toBuffer()], programId);
    const [vaultB] = PublicKey.findProgramAddressSync([VAULT_B_SEED, pool.toBuffer()], programId);

    return {
      pool: pool.toBase58(),
      ammConfig: state.ammconfig.toBase58(),
      configIndex: 1, // Defaulting to 1 as per project convention
      tokenAMint: state.mintA.toBase58(),
      tokenBMint: state.mintB.toBase58(),
      lpMint: state.lpMint.toBase58(),
      authority: authority.toBase58(),
      vaultA: vaultA.toBase58(),
      vaultB: vaultB.toBase58(),
      programId: programId.toBase58(),
      initializedAt: new Date().toISOString(),
    };
  });

  const filePath = path.resolve(__dirname, "../raydium-web/src/assets/data/pools.json");
  const publicPath = path.resolve(__dirname, "../raydium-web/public/pools.json");

  [filePath, publicPath].forEach(p => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(poolEntries, null, 2));
    console.log(`💾 Updated ${path.relative(process.cwd(), p)}`);
  });

  console.log("\n✨ Sync complete!");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
