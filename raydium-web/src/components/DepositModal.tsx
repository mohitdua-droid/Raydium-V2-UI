import React, { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { 
  Connection, 
  PublicKey, 
  SystemProgram 
} from '@solana/web3.js';
import { Program, AnchorProvider, BN, type Idl } from '@coral-xyz/anchor';
import { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID
} from '@solana/spl-token';
import idl from '../assets/idl/raydium.json';

const VAULT_A_SEED = Buffer.from("vault_a");
const VAULT_B_SEED = Buffer.from("vault_b");
const LP_MINT_SEED = Buffer.from("lp_mint");
const AUTHORITY_SEED = Buffer.from("authority");


interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  pool: any; // The pool object from LiquidityScreen
  connectedWallet: string | null;
  fullAddress: string | null;
  onConnectWallet: () => void;
}

const toRawAmount = (amount: string, decimals: number): BN => {
  if (!amount) return new BN(0);
  const [integers, fractions = ""] = amount.split(".");
  const paddedFractions = fractions.padEnd(decimals, "0").slice(0, decimals);
  const combined = integers + paddedFractions;
  const clean = combined.replace(/^0+/, "") || "0";
  return new BN(clean);
};

export const DepositModal: React.FC<DepositModalProps> = ({ 
  isOpen, 
  onClose, 
  pool,
  connectedWallet,
  fullAddress,
  onConnectWallet
}) => {
  const [baseAmount, setBaseAmount] = useState('');
  const [quoteAmount, setQuoteAmount] = useState('');
  const [isDepositing, setIsDepositing] = useState(false);
  const [poolState, setPoolState] = useState<any>(null);
  const [baseBalance, setBaseBalance] = useState('0');
  const [quoteBalance, setQuoteBalance] = useState('0');

  useEffect(() => {
    if (isOpen && pool) {
      fetchData();
    }
  }, [isOpen, pool, fullAddress]);

  const fetchData = async () => {
    try {
      const connection = new Connection("https://api.devnet.solana.com", "confirmed");
      const provider = new AnchorProvider(connection, {} as any, { commitment: "confirmed" });
      const program = new Program(idl as Idl, provider);

      // Fetch Pool State
      const state: any = await (program.account as any).poolState.fetch(new PublicKey(pool.id));
      setPoolState(state);

      // Fetch Balances
      if (fullAddress) {
        const userPubkey = new PublicKey(fullAddress);
        
        // Fetch both legacy and 2022 token accounts
        const [tokenAccounts, token2022Accounts] = await Promise.all([
          connection.getParsedTokenAccountsByOwner(userPubkey, { programId: TOKEN_PROGRAM_ID }),
          connection.getParsedTokenAccountsByOwner(userPubkey, { programId: TOKEN_2022_PROGRAM_ID })
        ]);

        const allAccounts = [...tokenAccounts.value, ...token2022Accounts.value];
        
        const findBalance = (mintAddr: string) => {
          const acc = allAccounts.find(a => a.account.data.parsed.info.mint === mintAddr);
          return acc?.account.data.parsed.info.tokenAmount.uiAmountString || "0";
        };

        setBaseBalance(findBalance(pool.tokenA.mint));
        setQuoteBalance(findBalance(pool.tokenB.mint));
      }

    } catch (e) {
      console.error("Error fetching deposit data:", e);
    }
  };

  const handleBaseChange = (val: string) => {
    setBaseAmount(val);
    if (!poolState || !val || isNaN(parseFloat(val)) || parseFloat(val) <= 0) {
      setQuoteAmount('');
      return;
    }

    const resA = parseFloat(poolState.reserveA.toString()) / Math.pow(10, pool.tokenA.decimals);
    const resB = parseFloat(poolState.reserveB.toString()) / Math.pow(10, pool.tokenB.decimals);
    
    if (resA > 0) {
      const calculated = (parseFloat(val) * resB) / resA;
      setQuoteAmount(calculated.toFixed(Math.min(pool.tokenB.decimals, 5)));
    }
  };

  const handleQuoteChange = (val: string) => {
    setQuoteAmount(val);
    if (!poolState || !val || isNaN(parseFloat(val)) || parseFloat(val) <= 0) {
      setBaseAmount('');
      return;
    }

    const resA = parseFloat(poolState.reserveA.toString()) / Math.pow(10, pool.tokenA.decimals);
    const resB = parseFloat(poolState.reserveB.toString()) / Math.pow(10, pool.tokenB.decimals);
    
    if (resB > 0) {
      const calculated = (parseFloat(val) * resA) / resB;
      setBaseAmount(calculated.toFixed(Math.min(pool.tokenA.decimals, 5)));
    }
  };

  const calculateRatio = () => {
    if (!baseAmount || !quoteAmount || parseFloat(baseAmount) === 0 || parseFloat(quoteAmount) === 0) {
      return "0% / 0%";
    }
    const total = parseFloat(baseAmount) + parseFloat(quoteAmount);
    if (total === 0) return "0% / 0%";
    const p1 = (parseFloat(baseAmount) / total * 100).toFixed(1);
    const p2 = (parseFloat(quoteAmount) / total * 100).toFixed(1);
    return `${p1}% / ${p2}%`;
  };

  const handleDeposit = async () => {
    if (!baseAmount || !quoteAmount || !fullAddress || !poolState) return;

    setIsDepositing(true);
    try {
      const { solana } = window;
      if (!solana) throw new Error("Wallet not connected");

      const connection = new Connection("https://api.devnet.solana.com", "confirmed");
      const wallet = {
        publicKey: new PublicKey(fullAddress),
        signTransaction: solana.signTransaction.bind(solana),
        signAllTransactions: solana.signAllTransactions.bind(solana),
      };
      const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
      const program = new Program(idl as Idl, provider);

      const amountA = toRawAmount(baseAmount, pool.tokenA.decimals);
      const amountB = toRawAmount(quoteAmount, pool.tokenB.decimals);

      // Max amounts (add 1% slippage buffer for simplicity)
      const maxA = amountA.muln(101).divn(100);
      const maxB = amountB.muln(101).divn(100);

      const poolPubkey = new PublicKey(pool.id);
      const [authority] = PublicKey.findProgramAddressSync([AUTHORITY_SEED, poolPubkey.toBuffer()], program.programId);
      const [vaultA] = PublicKey.findProgramAddressSync([VAULT_A_SEED, poolPubkey.toBuffer()], program.programId);
      const [vaultB] = PublicKey.findProgramAddressSync([VAULT_B_SEED, poolPubkey.toBuffer()], program.programId);
      
      const mintA = new PublicKey(pool.tokenA.mint);
      const mintB = new PublicKey(pool.tokenB.mint);
      
      const [lpMint] = PublicKey.findProgramAddressSync(
        [LP_MINT_SEED, mintA.toBuffer(), mintB.toBuffer()], 
        program.programId
      );

      const userAtaA = getAssociatedTokenAddressSync(mintA, wallet.publicKey, false, poolState.tokenProgramA);
      const userAtaB = getAssociatedTokenAddressSync(mintB, wallet.publicKey, false, poolState.tokenProgramB);
      const userLpAta = getAssociatedTokenAddressSync(lpMint, wallet.publicKey);

      const tx = await program.methods
        .addLiquidity(amountA, amountB, maxA, maxB)
        .accounts({
          pool: poolPubkey,
          tokenAMint: mintA,
          tokenBMint: mintB,
          vaultA,
          vaultB,
          lpMint,
          userAtaA,
          userAtaB,
          userLpAta,
          user: wallet.publicKey,
          authority,
          tokenProgramA: poolState.tokenProgramA,
          tokenProgramB: poolState.tokenProgramB,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        } as any)
        .rpc();

      console.log('Deposit successful, tx:', tx);
      alert('Deposit successful!');
      onClose();
    } catch (err: any) {
      console.error('Error during deposit:', err);
      alert('Error: ' + (err.message || 'Unknown error'));
    } finally {
      setIsDepositing(false);
    }
  };

  if (!isOpen || !pool) return null;

  return (
    <div className="modal-overlay">
      <motion.div
        className="create-pool-card"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{ maxWidth: '480px' }}
      >
        <div className="modal-header">
          <h2>Add Deposit Amount</h2>
          <div className="header-right">
            <button onClick={onClose} className="close-modal-btn"><X size={20} /></button>
          </div>
        </div>

        <div className="create-pool-body">
          {/* Token A Box */}
          <div className="token-box create-box" style={{ padding: '12px 16px', marginBottom: '4px' }}>
            <div className="token-box-label">
              <div className="token-label-left">
                <div className={`token-icon-sm ${pool.tokenA.symbol.toLowerCase()}`}>{pool.tokenA.symbol[0]}</div>
                <span>{pool.tokenA.symbol}</span>
              </div>
              <div className="balance-info">
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginRight: '4px' }}>
                  Balance: {baseBalance}
                </span>
                <button className="max-btn" onClick={() => handleBaseChange(baseBalance)}>Max</button>
                <button className="half-btn" onClick={() => handleBaseChange((parseFloat(baseBalance)/2).toString())}>50%</button>
              </div>
            </div>
            <div className="token-input-row">
              <input
                type="number"
                placeholder="0"
                value={baseAmount}
                onChange={(e) => handleBaseChange(e.target.value)}
                className="deposit-input"
              />
            </div>
          </div>

          <div className="swap-arrow-container static">
            <div className="plus-icon"><Plus size={20} /></div>
          </div>

          {/* Token B Box */}
          <div className="token-box create-box" style={{ padding: '12px 16px', marginBottom: '4px' }}>
            <div className="token-box-label">
              <div className="token-label-left">
                <div className={`token-icon-sm ${pool.tokenB.symbol.toLowerCase()}`}>{pool.tokenB.symbol[0]}</div>
                <span>{pool.tokenB.symbol}</span>
              </div>
              <div className="balance-info">
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginRight: '4px' }}>
                  Balance: {quoteBalance}
                </span>
                <button className="max-btn" onClick={() => handleQuoteChange(quoteBalance)}>Max</button>
                <button className="half-btn" onClick={() => handleQuoteChange((parseFloat(quoteBalance)/2).toString())}>50%</button>
              </div>
            </div>
            <div className="token-input-row">
              <input
                type="number"
                placeholder="0"
                value={quoteAmount}
                onChange={(e) => handleQuoteChange(e.target.value)}
                className="deposit-input"
              />
            </div>
          </div>

          <div className="deposit-summary" style={{ textAlign: 'right' }}>
            <div className="summary-row" style={{ justifyContent: 'flex-end', gap: '8px', fontSize: '14px' }}>
              <span>Deposit Ratio</span>
              <span className="summary-value" style={{ fontSize: '14px' }}>{calculateRatio()}</span>
            </div>
          </div>

          <button 
            className="swap-cta create-pool-cta" 
            disabled={connectedWallet ? (isDepositing || !baseAmount || !quoteAmount) : false}
            onClick={connectedWallet ? handleDeposit : onConnectWallet}
          >
            {connectedWallet ? (isDepositing ? 'Depositing...' : 'Deposit') : 'Connect Wallet'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
