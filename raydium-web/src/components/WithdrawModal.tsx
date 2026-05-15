import React, { useState, useEffect } from 'react';
import { X, ArrowDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { 
  Connection, 
  PublicKey 
} from '@solana/web3.js';
import { Program, AnchorProvider, type Idl } from '@coral-xyz/anchor';
import { 
  getAssociatedTokenAddressSync
} from '@solana/spl-token';
import idl from '../assets/idl/raydium.json';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  pool: any;
  fullAddress: string | null;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({ 
  isOpen, 
  onClose, 
  pool,
  fullAddress
}) => {
  const [lpAmount, setLpAmount] = useState('');
  const [tokenAEstimate, setTokenAEstimate] = useState('0');
  const [tokenBEstimate, setTokenBEstimate] = useState('0');
  const [lpBalance, setLpBalance] = useState('0');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [poolState, setPoolState] = useState<any>(null);

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

      // Fetch LP Balance
      if (fullAddress && pool.lpMint) {
        try {
          const userPubkey = new PublicKey(fullAddress);
          const lpMintPubkey = new PublicKey(pool.lpMint);
          const userLpAta = getAssociatedTokenAddressSync(lpMintPubkey, userPubkey);
          const balanceInfo = await connection.getTokenAccountBalance(userLpAta);
          setLpBalance(balanceInfo.value.uiAmountString || "0");
        } catch (e) {
          setLpBalance("0");
        }
      }
    } catch (e) {
      console.error("Error fetching withdraw data:", e);
    }
  };

  const handleLpChange = (val: string) => {
    setLpAmount(val);
    if (!poolState || !val || isNaN(parseFloat(val)) || parseFloat(val) <= 0) {
      setTokenAEstimate('0');
      setTokenBEstimate('0');
      return;
    }

    const requestedLp = parseFloat(val);
    const totalLp = parseFloat(poolState.lpSupply.toString()) / 1e9; // LP usually 9 decimals
    const resA = parseFloat(poolState.reserveA.toString()) / Math.pow(10, pool.tokenA.decimals);
    const resB = parseFloat(poolState.reserveB.toString()) / Math.pow(10, pool.tokenB.decimals);

    if (totalLp > 0) {
      const share = requestedLp / totalLp;
      setTokenAEstimate((resA * share).toFixed(pool.tokenA.decimals));
      setTokenBEstimate((resB * share).toFixed(pool.tokenB.decimals));
    }
  };

  const handleWithdraw = async () => {
    if (!lpAmount || !fullAddress || !pool) return;

    setIsWithdrawing(true);
    try {
      const response = await fetch('http://localhost:3001/api/remove-liquidity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mintA: pool.tokenA.mint,
          mintB: pool.tokenB.mint,
          lpAmount,
          userAddress: fullAddress
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to remove liquidity");
      }

      console.log("Withdraw successful:", result.stdout);
      alert(`Withdrawal of ${lpAmount} LP successful!`);
      onClose();
    } catch (err: any) {
      console.error("Error during withdraw:", err);
      alert("Withdrawal failed: " + (err.message || String(err)));
    } finally {
      setIsWithdrawing(false);
    }
  };

  if (!isOpen || !pool) return null;

  return (
    <div className="modal-overlay">
      <motion.div
        className="create-pool-card"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{ maxWidth: '440px' }}
      >
        <div className="modal-header">
          <h2>Withdraw Liquidity</h2>
          <div className="header-right">
            <button onClick={onClose} className="close-modal-btn"><X size={20} /></button>
          </div>
        </div>

        <div className="create-pool-body">
          {/* LP Amount Box */}
          <div className="token-box create-box" style={{ padding: '16px', marginBottom: '20px', border: '1px solid var(--accent-teal)' }}>
            <div className="token-box-label">
              <span style={{ color: 'var(--text-main)', fontWeight: '600' }}>LP Amt.</span>
              <div className="balance-info">
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginRight: '8px' }}>
                  Balance: {lpBalance}
                </span>
                <button className="max-btn" onClick={() => handleLpChange(lpBalance)}>Max</button>
              </div>
            </div>
            <div className="token-input-row" style={{ marginTop: '12px' }}>
              <input
                type="number"
                placeholder="0.00"
                value={lpAmount}
                onChange={(e) => handleLpChange(e.target.value)}
                className="deposit-input"
                style={{ fontSize: '24px', textAlign: 'right' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px', color: 'var(--text-secondary)' }}>
            <ArrowDown size={20} />
          </div>

          {/* Token Estimates Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '30px' }}>
            <div className="token-box create-box" style={{ padding: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                {pool.tokenA.symbol} amt:
              </div>
              <div style={{ fontSize: '16px', fontWeight: '500', color: 'var(--text-main)' }}>
                {tokenAEstimate}
              </div>
            </div>
            <div className="token-box create-box" style={{ padding: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                {pool.tokenB.symbol} amt:
              </div>
              <div style={{ fontSize: '16px', fontWeight: '500', color: 'var(--text-main)' }}>
                {tokenBEstimate}
              </div>
            </div>
          </div>

          <button 
            className="swap-cta create-pool-cta" 
            disabled={isWithdrawing || !lpAmount || parseFloat(lpAmount) <= 0 || parseFloat(lpAmount) > parseFloat(lpBalance)}
            onClick={handleWithdraw}
            style={{ 
              background: 'linear-gradient(90deg, var(--accent-teal), #00A3FF)',
              boxShadow: '0 4px 15px rgba(0, 212, 200, 0.2)'
            }}
          >
            {isWithdrawing ? 'Withdrawing...' : (parseFloat(lpAmount) > parseFloat(lpBalance) ? 'Insufficient Balance' : 'Withdraw')}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
