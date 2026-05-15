const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3001;

app.use(cors());
app.use(bodyParser.json());

const MINT_PATHS = [
  path.join(__dirname, 'raydium-web/src/assets/data/mintaddresses.json'),
  path.join(__dirname, 'raydium-web/public/mintaddresses.json'),
  path.join(__dirname, 'scripts/mintaddresses.json')
];

app.post('/api/save-token', (req, res) => {
  const newToken = req.body;
  
  try {
    MINT_PATHS.forEach(p => {
      let tokens = [];
      if (fs.existsSync(p)) {
        tokens = JSON.parse(fs.readFileSync(p, 'utf-8'));
      }
      
      if (!tokens.find(t => t.mintAddress === newToken.mintAddress)) {
        tokens.push({
          ...newToken,
          network: 'devnet',
          createdAt: new Date().toISOString()
        });
        fs.writeFileSync(p, JSON.stringify(tokens, null, 2));
        console.log(`✅ Token ${newToken.symbol} saved to ${path.relative(__dirname, p)}`);
      }
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving token:', err);
    res.status(500).json({ error: err.message });
  }
});

const POOL_PATHS = [
  path.join(__dirname, 'raydium-web/src/assets/data/pools.json'),
  path.join(__dirname, 'raydium-web/public/pools.json')
];

app.post('/api/save-pool', (req, res) => {
  const newPool = req.body;
  
  try {
    POOL_PATHS.forEach(p => {
      let pools = [];
      if (fs.existsSync(p)) {
        pools = JSON.parse(fs.readFileSync(p, 'utf-8'));
      }
      
      if (!pools.find(pool => pool.pool === newPool.pool)) {
        pools.push({
          ...newPool,
          initializedAt: new Date().toISOString()
        });
        fs.writeFileSync(p, JSON.stringify(pools, null, 2));
        console.log(`✅ Pool ${newPool.pool} saved to ${path.relative(__dirname, p)}`);
      }
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving pool:', err);
    res.status(500).json({ error: err.message });
  }
});

const WALLET_MAP = {};

// Helper to pre-scan wallets in the root
const scanWallets = () => {
  const { execSync } = require('child_process');
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const filePath = path.join(__dirname, file);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (Array.isArray(content) && content.length === 64) {
        const addr = execSync(`solana address -k ${file}`).toString().trim();
        WALLET_MAP[addr] = `./${file}`;
        console.log(`📌 Mapped wallet ${addr} to ${file}`);
      }
    } catch (e) { /* skip */ }
  }
};
scanWallets();

const { Connection, PublicKey: SolanaPublicKey } = require('@solana/web3.js');
const connection = new Connection('https://api.devnet.solana.com');

app.get('/api/token-info/:address', async (req, res) => {
  try {
    const mint = new SolanaPublicKey(req.params.address);
    const info = await connection.getParsedAccountInfo(mint);
    
    if (info.value && info.value.data && info.value.data.parsed) {
      const decimals = info.value.data.parsed.info.decimals;
      res.json({ decimals });
    } else {
      res.status(404).json({ error: 'Token not found or not parsed' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/init-pool', (req, res) => {
  const { mintA, mintB, amtA, amtB, configIndex, userAddress } = req.body;
  
  const walletPath = WALLET_MAP[userAddress];
  if (!walletPath) {
    return res.status(400).json({ error: `No local keypair found for address ${userAddress}. Please ensure the .json file is in the project root.` });
  }

  const cmd = `USER_ADDR=${userAddress} npx ts-node scripts/interact.ts init ${mintA} ${mintB} ${amtA} ${amtB} ${configIndex || 1}`;
  console.log(`Executing for ${userAddress}: ${cmd}`);
  
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      return res.status(500).json({ error: error.message, stderr, stdout });
    }
    console.log(stdout);
    res.json({ success: true, stdout });
  });
});

app.post('/api/update-pool-status', (req, res) => {
  const { poolId, status } = req.body;
  
  let mintA = "";
  let mintB = "";
  try {
    const pools = JSON.parse(fs.readFileSync(POOL_PATHS[0], 'utf-8'));
    const pool = pools.find(p => p.pool === poolId);
    if (pool) {
      mintA = pool.tokenAMint;
      mintB = pool.tokenBMint;
    }
  } catch (e) {
    console.error("Error reading pools for update:", e);
  }

  if (!mintA || !mintB) {
    return res.status(404).json({ error: "Pool not found in local data" });
  }

  // Provide environment variables to the script so it can initialize the Anchor provider correctly
  const cmd = `ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=/home/duamo/.config/solana/id.json npx ts-node scripts/interact.ts update_pool_status ${mintA} ${mintB} ${status}`;
  console.log(`🚀 Executing Admin Status Update (Signed by Deployer): ${cmd}`);
  
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Status update failed: ${error.message}`);
      return res.status(500).json({ error: error.message, stderr, stdout });
    }
    
    try {
      POOL_PATHS.forEach(p => {
        if (fs.existsSync(p)) {
          let pools = JSON.parse(fs.readFileSync(p, 'utf-8'));
          pools = pools.map(pool => {
            if (pool.pool === poolId) {
              return { ...pool, status: parseInt(status) };
            }
            return pool;
          });
          fs.writeFileSync(p, JSON.stringify(pools, null, 2));
          console.log(`✅ Updated ${poolId} status to ${status} in ${path.relative(__dirname, p)}`);
        }
      });
      res.json({ success: true, stdout });
    } catch (err) {
      console.error('Error updating pools.json:', err);
      res.status(500).json({ error: "On-chain success, but failed to update local JSON", stdout });
    }
  });
});

app.post('/api/remove-liquidity', (req, res) => {
  const { mintA, mintB, lpAmount, userAddress } = req.body;
  
  const walletPath = WALLET_MAP[userAddress];
  if (!walletPath) {
    return res.status(400).json({ error: `No local keypair found for address ${userAddress}. Please ensure the .json file is in the project root.` });
  }

  // Convert lpAmount to raw (9 decimals)
  const rawLp = Math.floor(parseFloat(lpAmount) * 1e9).toString();

  const cmd = `ANCHOR_PROVIDER_URL=https://api.devnet.solana.com USER_ADDR=${userAddress} npx ts-node scripts/interact.ts remove ${mintA} ${mintB} ${rawLp}`;
  console.log(`🚀 Executing Remove Liquidity for ${userAddress}: ${cmd}`);
  
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Remove liquidity failed: ${error.message}`);
      return res.status(500).json({ error: error.message, stderr, stdout });
    }
    console.log(stdout);
    res.json({ success: true, stdout });
  });
});

app.post('/api/create-config', (req, res) => {
  const { index, tradeFee, protocolFee, fundFee } = req.body;
  
  const cmd = `ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=/home/duamo/.config/solana/id.json npx ts-node scripts/interact.ts config ${index} ${tradeFee} ${protocolFee} ${fundFee}`;
  console.log(`🚀 Executing Create Config (Index ${index}): ${cmd}`);
  
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Create config failed: ${error.message}`);
      return res.status(500).json({ error: error.message, stderr, stdout });
    }
    console.log(stdout);
    res.json({ success: true, stdout });
  });
});

app.post('/api/pool-details', (req, res) => {
  const { mintA, mintB } = req.body;
  
  const cmd = `ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=/home/duamo/.config/solana/id.json npx ts-node scripts/interact.ts status ${mintA} ${mintB}`;
  console.log(`🚀 Fetching Pool Details: ${cmd}`);
  
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Fetching details failed: ${error.message}`);
      return res.status(500).json({ error: error.message, stderr, stdout });
    }
    
    // Parse the stdout to extract fees
    const details = {
      poolId: (stdout.match(/Pool:\s+([A-Za-z0-9]+)/) || [])[1],
      protocolFeesA: (stdout.match(/Protocol Fee A:\s+(\d+)/) || [])[1],
      protocolFeesB: (stdout.match(/Protocol Fee B:\s+(\d+)/) || [])[1],
      fundFeesA: (stdout.match(/Fund Fee A:\s+(\d+)/) || [])[1],
      fundFeesB: (stdout.match(/Fund Fee B:\s+(\d+)/) || [])[1],
    };
    
    res.json({ success: true, details, stdout });
  });
});

app.post('/api/collect-fees', (req, res) => {
  const { mintA, mintB, type, amtA, amtB } = req.body;
  
  const cmd = `ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=/home/duamo/.config/solana/id.json npx ts-node scripts/interact.ts collect ${mintA} ${mintB} ${type} ${amtA} ${amtB}`;
  console.log(`🚀 Executing Fee Collection (${type}): ${cmd}`);
  
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Fee collection failed: ${error.message}`);
      return res.status(500).json({ error: error.message, stderr, stdout });
    }
    console.log(stdout);
    res.json({ success: true, stdout });
  });
});

// ── Transfer Admin ─────────────────────────────────────────────────────────────
// Runs transfer_admin via the deployer keypair (signs on-chain), then updates
// the DEPLOYER_ADDRESS constant in AdminScreen.tsx to the new admin address so
// the UI immediately recognises the new owner.
app.post('/api/transfer-admin', (req, res) => {
  const { newAdmin } = req.body;
  if (!newAdmin) {
    return res.status(400).json({ error: 'newAdmin address is required' });
  }

  const cmd = `ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=/home/duamo/.config/solana/id.json npx ts-node scripts/interact.ts transfer_admin ${newAdmin}`;
  console.log(`🚀 Executing Admin Transfer → ${newAdmin}: ${cmd}`);

  exec(cmd, { timeout: 120000 }, (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Admin transfer failed: ${error.message}`);
      console.error(stderr);
      return res.status(500).json({ error: error.message, stderr, stdout });
    }

    console.log(stdout);

    // ── Update DEPLOYER_ADDRESS in AdminScreen.tsx ────────────────────────────
    const adminScreenPath = path.join(__dirname, 'raydium-web/src/screens/AdminScreen.tsx');
    try {
      let src = fs.readFileSync(adminScreenPath, 'utf-8');
      // Replace the hardcoded DEPLOYER_ADDRESS value with the new admin
      src = src.replace(
        /const DEPLOYER_ADDRESS\s*=\s*"[A-Za-z0-9]{32,44}"/,
        `const DEPLOYER_ADDRESS = "${newAdmin}"`
      );
      fs.writeFileSync(adminScreenPath, src, 'utf-8');
      console.log(`✅ Updated DEPLOYER_ADDRESS to ${newAdmin} in AdminScreen.tsx`);
    } catch (fsErr) {
      console.error('⚠️  On-chain transfer succeeded but failed to update AdminScreen.tsx:', fsErr.message);
      // Still return success — the on-chain transfer worked
    }

    res.json({ success: true, stdout, newAdmin });
  });
});

app.listen(port, () => {
  console.log(`🚀 Dev server running at http://localhost:${port}`);
});
