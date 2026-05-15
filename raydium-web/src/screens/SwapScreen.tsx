import { useState, useEffect } from 'react';
import { ArrowDown, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Connection,
  PublicKey,
  SystemProgram
} from '@solana/web3.js';
import { Program, AnchorProvider, BN, type Idl } from '@coral-xyz/anchor';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync
} from '@solana/spl-token';
import idl from '../assets/idl/raydium.json';

const POOL_SEED = Buffer.from("pool");
const VAULT_A_SEED = Buffer.from("vault_a");
const VAULT_B_SEED = Buffer.from("vault_b");
const AUTHORITY_SEED = Buffer.from("authority");

const toRawAmount = (amount: string, decimals: number): BN => {
  if (!amount) return new BN(0);
  const [integers, fractions = ""] = amount.split(".");
  const paddedFractions = fractions.padEnd(decimals, "0").slice(0, decimals);
  const combined = integers + paddedFractions;
  // Remove leading zeros but keep at least one zero if string is empty
  const clean = combined.replace(/^0+/, "") || "0";
  return new BN(clean);
};

interface Token {
  symbol: string;
  name: string;
  decimals: number;
  mintAddress: string;
  ata: string;
  minted: number;
  network: string;
  balance?: string;
}

declare global {
  interface Window {
    solana?: any;
  }
}

interface SwapScreenProps {
  connectedWallet: string | null;
  fullAddress: string | null;
  onConnectWallet: () => void;
  initialTokenA?: string;
  initialTokenB?: string;
}

export const SwapScreen: React.FC<SwapScreenProps> = ({ connectedWallet, fullAddress, onConnectWallet, initialTokenA, initialTokenB }) => {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [fromToken, setFromToken] = useState<Token | null>(null);
  const [toToken, setToToken] = useState<Token | null>(null);
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [activeDropdown, setActiveDropdown] = useState<'from' | 'to' | null>(null);
  const [isSwapping, setIsSwapping] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [poolExists, setPoolExists] = useState(true);
  const [priceImpact, setPriceImpact] = useState<number | null>(null);
  const [lastTyped, setLastTyped] = useState<'from' | 'to'>('from');
  const [swapMode, setSwapMode] = useState<'exactIn' | 'exactOut'>('exactIn');

  const fetchTokensAndBalances = async () => {
    try {
      const response = await fetch('/mintaddresses.json?t=' + Date.now()); // Avoid caching
      const data: Token[] = await response.json();

      if (fullAddress) {
        const connection = new Connection("https://api.devnet.solana.com", "confirmed");
        const userPubkey = new PublicKey(fullAddress);

        const [tokenAccounts, token2022Accounts] = await Promise.all([
          connection.getParsedTokenAccountsByOwner(userPubkey, { programId: TOKEN_PROGRAM_ID }),
          connection.getParsedTokenAccountsByOwner(userPubkey, { programId: TOKEN_2022_PROGRAM_ID })
        ]);

        const allAccounts = [...tokenAccounts.value, ...token2022Accounts.value];

        const updatedTokens = data.map((token: any) => {
          const acc = allAccounts.find(a => a.account.data.parsed.info.mint === token.mintAddress);
          return {
            ...token,
            balance: acc?.account.data.parsed.info.tokenAmount.uiAmountString || "0"
          };
        });
        setTokens(updatedTokens);

        if (updatedTokens.length >= 2) {
          const foundA = initialTokenA ? updatedTokens.find(t => t.mintAddress === initialTokenA) : null;
          const foundB = initialTokenB ? updatedTokens.find(t => t.mintAddress === initialTokenB) : null;
          setFromToken(prev => prev || foundA || updatedTokens[0]);
          setToToken(prev => prev || foundB || updatedTokens[1]);
        }
      } else {
        setTokens(data);
        if (data.length >= 2) {
          const foundA = initialTokenA ? data.find(t => t.mintAddress === initialTokenA) : null;
          const foundB = initialTokenB ? data.find(t => t.mintAddress === initialTokenB) : null;
          setFromToken(prev => prev || foundA || data[0]);
          setToToken(prev => prev || foundB || data[1]);
        }
      }
    } catch (error) {
      console.error('Error fetching tokens:', error);
    }
  };

  useEffect(() => {
    fetchTokensAndBalances();
  }, [initialTokenA, initialTokenB, fullAddress]);

  useEffect(() => {
    const checkAndCalculate = async () => {
      if (!fromToken || !toToken) return;

      try {
        const connection = new Connection("https://api.devnet.solana.com", "confirmed");
        const provider = new AnchorProvider(connection, {} as any, { commitment: "confirmed" });
        const program = new Program(idl as Idl, provider);

        // In exactOut mode: fromToken = what you RECEIVE (top), toToken = what you PAY (bottom)
        // In exactIn mode:  fromToken = what you PAY (top),     toToken = what you RECEIVE (bottom)
        // Pool always sorts by mint address. We derive aToB from the PAY token perspective.
        const payToken = swapMode === 'exactOut' ? toToken : fromToken;
        const recvToken = swapMode === 'exactOut' ? fromToken : toToken;

        const mintPay = new PublicKey(payToken.mintAddress);
        const mintRecv = new PublicKey(recvToken.mintAddress);
        const [tokenAMint, tokenBMint] = mintPay.toBuffer().compare(mintRecv.toBuffer()) < 0
          ? [mintPay, mintRecv] : [mintRecv, mintPay];
        const aToB = mintPay.equals(tokenAMint); // true = paying A to receive B

        const pool = PublicKey.findProgramAddressSync(
          [POOL_SEED, tokenAMint.toBuffer(), tokenBMint.toBuffer()],
          program.programId
        )[0];

        const poolState: any = await (program.account as any).poolState.fetch(pool);
        setPoolExists(true);

        // reservePay / reserveRecv in human-readable units
        const resPay = aToB
          ? poolState.reserveA.toNumber() / Math.pow(10, payToken.decimals)
          : poolState.reserveB.toNumber() / Math.pow(10, payToken.decimals);
        const resRecv = aToB
          ? poolState.reserveB.toNumber() / Math.pow(10, recvToken.decimals)
          : poolState.reserveA.toNumber() / Math.pow(10, recvToken.decimals);

        if (resPay === 0 || resRecv === 0) return;

        if (swapMode === 'exactIn') {
          // ── Swap In ──────────────────────────────────────────────────────────
          // User types in top box (fromAmount = amount to pay). Calculate received.
          if (lastTyped === 'from') {
            if (!fromAmount || isNaN(parseFloat(fromAmount)) || parseFloat(fromAmount) <= 0) {
              setToAmount(''); setPriceImpact(null); return;
            }
            setIsCalculating(true);
            const amountIn = parseFloat(fromAmount);
            const amountInEffective = amountIn * 0.9975;
            const amountOut = (resRecv * amountInEffective) / (resPay + amountInEffective);
            const spotPrice = resRecv / resPay;
            const expectedOut = amountInEffective * spotPrice;
            setPriceImpact(((expectedOut - amountOut) / expectedOut) * 100);
            setToAmount(amountOut.toFixed(recvToken.decimals || 6));
          } else {
            // User typed in bottom box — back-calculate pay amount
            if (!toAmount || isNaN(parseFloat(toAmount)) || parseFloat(toAmount) <= 0) {
              setFromAmount(''); setPriceImpact(null); return;
            }
            setIsCalculating(true);
            const amountOut = parseFloat(toAmount);
            if (amountOut >= resRecv) {
              setFromAmount('Insufficient Liquidity'); setPriceImpact(100); return;
            }
            const amountIn = (resPay * amountOut) / (0.9975 * (resRecv - amountOut));
            const spotPrice = resRecv / resPay;
            const expectedOut = (amountIn * 0.9975) * spotPrice;
            setPriceImpact(((expectedOut - amountOut) / expectedOut) * 100);
            setFromAmount(amountIn.toFixed(payToken.decimals || 6));
          }
        } else {
          // ── Swap Out ─────────────────────────────────────────────────────────
          // Top box (fromAmount) = EXACT amount you want to RECEIVE.
          // Bottom box (toAmount) = how much you must PAY — calculated.
          if (!fromAmount || isNaN(parseFloat(fromAmount)) || parseFloat(fromAmount) <= 0) {
            setToAmount(''); setPriceImpact(null); return;
          }
          setIsCalculating(true);
          const amountOut = parseFloat(fromAmount); // top box = desired output
          if (amountOut >= resRecv) {
            setToAmount('Insufficient Liquidity'); setPriceImpact(100); return;
          }
          // dx = (resPay * amountOut) / (0.9975 * (resRecv - amountOut))
          const amountIn = (resPay * amountOut) / (0.9975 * (resRecv - amountOut));
          const spotPrice = resRecv / resPay;
          const expectedOut = (amountIn * 0.9975) * spotPrice;
          setPriceImpact(((expectedOut - amountOut) / expectedOut) * 100);
          setToAmount(amountIn.toFixed(payToken.decimals || 6)); // bottom box = required payment
        }
      } catch (e) {
        setPoolExists(false);
        setPriceImpact(null);
      } finally {
        setIsCalculating(false);
      }
    };

    const timer = setTimeout(checkAndCalculate, 500);
    return () => clearTimeout(timer);
  }, [fromAmount, toAmount, fromToken, toToken, lastTyped, swapMode]);

  const handleSwapOrder = () => {
    if (!fromToken || !toToken) return;
    const temp = fromToken;
    setFromToken(toToken);
    setToToken(temp);
  };

  const handleTokenSelect = (token: Token, side: 'from' | 'to') => {
    if (side === 'from') {
      if (toToken && token.mintAddress === toToken.mintAddress) {
        setToToken(fromToken);
      }
      setFromToken(token);
    } else {
      if (fromToken && token.mintAddress === fromToken.mintAddress) {
        setFromToken(toToken);
      }
      setToToken(token);
    }
    setActiveDropdown(null);
  };

  const handleSwap = async () => {
    if (!fromToken || !toToken || !fullAddress) return;

    const isFromInvalid = !fromAmount || isNaN(parseFloat(fromAmount)) || parseFloat(fromAmount) <= 0;
    const isToInvalid = !toAmount || isNaN(parseFloat(toAmount)) || parseFloat(toAmount) <= 0;

    if (isFromInvalid) {
      alert(swapMode === 'exactOut' ? "Please enter the amount you want to receive." : "Please enter a valid 'From' amount.");
      return;
    }
    if (isToInvalid) {
      alert(swapMode === 'exactOut' ? "Calculating required payment — please wait." : "Please enter a valid 'To' amount.");
      return;
    }

    setIsSwapping(true);
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

      // In exactOut: fromToken = token you RECEIVE (top), toToken = token you PAY (bottom)
      // In exactIn:  fromToken = token you PAY (top),     toToken = token you RECEIVE (bottom)
      const payToken = swapMode === 'exactOut' ? toToken : fromToken;
      const recvToken = swapMode === 'exactOut' ? fromToken : toToken;

      const mintPay = new PublicKey(payToken.mintAddress);
      const mintRecv = new PublicKey(recvToken.mintAddress);
      const [tokenAMint, tokenBMint] = mintPay.toBuffer().compare(mintRecv.toBuffer()) < 0
        ? [mintPay, mintRecv] : [mintRecv, mintPay];
      const aToB = mintPay.equals(tokenAMint); // true = paying A, receiving B

      const pool = PublicKey.findProgramAddressSync(
        [POOL_SEED, tokenAMint.toBuffer(), tokenBMint.toBuffer()],
        program.programId
      )[0];

      let poolState: any;
      try {
        poolState = await (program.account as any).poolState.fetch(pool);
      } catch (e) {
        throw new Error("Pool not found for this token pair. Please create it first in the Liquidity tab.");
      }

      const [authority] = PublicKey.findProgramAddressSync([AUTHORITY_SEED, pool.toBuffer()], program.programId);
      const [vaultA] = PublicKey.findProgramAddressSync([VAULT_A_SEED, pool.toBuffer()], program.programId);
      const [vaultB] = PublicKey.findProgramAddressSync([VAULT_B_SEED, pool.toBuffer()], program.programId);

      const userAtaA = getAssociatedTokenAddressSync(tokenAMint, wallet.publicKey, false, poolState.tokenProgramA);
      const userAtaB = getAssociatedTokenAddressSync(tokenBMint, wallet.publicKey, false, poolState.tokenProgramB);

      let tx;
      if (swapMode === 'exactIn') {
        // swapExactIn(amount_in, min_amount_out, a_to_b)
        const amountInRaw = toRawAmount(fromAmount, payToken.decimals);
        const amountOutRaw = toRawAmount(toAmount, recvToken.decimals);
        const minAmountOut = amountOutRaw.muln(99).divn(100); // 1% slippage

        tx = await program.methods
          .swapExactIn(amountInRaw, minAmountOut, aToB)
          .accounts({
            user: wallet.publicKey,
            ammConfig: poolState.ammconfig,
            pool, vaultA, vaultB, userAtaA, userAtaB, authority,
            tokenA: tokenAMint, tokenB: tokenBMint,
            tokenProgramA: poolState.tokenProgramA,
            tokenProgramB: poolState.tokenProgramB,
            systemProgram: SystemProgram.programId,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          } as any)
          .rpc();
      } else {
        // swapExactOut(amount_out, max_amount_in, a_to_b)
        // fromAmount = exact amount of recvToken the user wants to receive (top box)
        // toAmount   = estimated pay amount (bottom box) — add 1% slippage ceiling
        const amountOutRaw = toRawAmount(fromAmount, recvToken.decimals); // exact out
        const amountInRaw = toRawAmount(toAmount, payToken.decimals);  // estimated in
        const maxAmountIn = amountInRaw.muln(101).divn(100); // 1% slippage

        console.log(`swapExactOut: amount_out=${fromAmount} ${recvToken.symbol}, max_amount_in=${toAmount} ${payToken.symbol}, aToB=${aToB}`);

        tx = await program.methods
          .swapExactOut(amountOutRaw, maxAmountIn, aToB)
          .accounts({
            user: wallet.publicKey,
            ammConfig: poolState.ammconfig,
            pool, vaultA, vaultB, userAtaA, userAtaB, authority,
            tokenA: tokenAMint, tokenB: tokenBMint,
            tokenProgramA: poolState.tokenProgramA,
            tokenProgramB: poolState.tokenProgramB,
            systemProgram: SystemProgram.programId,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          } as any)
          .rpc();
      }

      console.log('Swap successful, tx:', tx);
      alert('Swap successful!');
      setFromAmount('');
      setToAmount('');
      fetchTokensAndBalances();
    } catch (err: any) {
      console.error('Error during swap:', err);
      alert('Error: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSwapping(false);
    }
  };

  const renderTokenDropdown = (side: 'from' | 'to') => (
    <AnimatePresence>
      {activeDropdown === side && (
        <>
          <div className="dropdown-overlay" onClick={() => setActiveDropdown(null)} />
          <motion.div
            className="token-dropdown"
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            {tokens.map((token) => (
              <button
                key={token.mintAddress}
                className="token-option"
                onClick={() => handleTokenSelect(token, side)}
              >
                <div className={`token-icon ${token.symbol.toLowerCase()}`}>
                  <span>{token.symbol[0]}</span>
                </div>
                <div className="token-option-info">
                  <span className="token-option-symbol">{token.symbol}</span>
                  <span className="token-option-name">{token.name}</span>
                </div>
                <div className="token-option-balance">{token.balance || '0'}</div>
              </button>
            ))}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (!fromToken || !toToken) {
    return <div className="swap-container"><div className="swap-card" style={{ padding: '40px', textAlign: 'center' }}>Loading tokens...</div></div>;
  }

  return (
    <div className="swap-container" style={{ flexDirection: 'column', alignItems: 'center' }}>
      <div className="swap-tabs-container">
        <button
          className={`swap-tab ${swapMode === 'exactIn' ? 'active' : ''}`}
          onClick={() => setSwapMode('exactIn')}
        >
          Swap In
        </button>
        <button
          className={`swap-tab ${swapMode === 'exactOut' ? 'active' : ''}`}
          onClick={() => setSwapMode('exactOut')}
        >
          Swap Out
        </button>
      </div>

      <motion.div
        className="swap-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Top Box: You PAY (exactIn) | You RECEIVE exactly (exactOut) */}
        <div className="token-box">
          <div className="token-box-label">
            <span>{swapMode === 'exactOut' ? 'From' : 'From'}</span>
            <div className="balance-info">
              <span>Balance: {fromToken?.balance || '0'}</span>
              <button
                className="max-btn"
                onClick={() => {
                  setFromAmount(fromToken?.balance || '0');
                  setLastTyped('from');
                }}
              >
                Max
              </button>
              <button
                className="half-btn"
                onClick={() => {
                  const bal = parseFloat(fromToken?.balance || '0');
                  setFromAmount((bal / 2).toString());
                  setLastTyped('from');
                }}
              >
                50%
              </button>
            </div>
          </div>
          <div className="token-input-row">
            <div className="token-select-container">
              <button
                className="token-select"
                onClick={() => setActiveDropdown(activeDropdown === 'from' ? null : 'from')}
              >
                <div className={`token-icon ${fromToken.symbol.toLowerCase()}`}>
                  <span>{fromToken.symbol[0]}</span>
                </div>
                <span className="token-name">{fromToken.symbol}</span>
                <ChevronDown size={16} className={activeDropdown === 'from' ? 'rotate-180' : ''} />
              </button>
              {renderTokenDropdown('from')}
            </div>
            <input
              type="number"
              placeholder="0.00"
              value={fromAmount}
              onChange={(e) => {
                setFromAmount(e.target.value);
                // In exactOut mode, top box is always the driver (desired output)
                setLastTyped('from');
              }}
            />
          </div>
          {/* <div className="usd-value">~$0</div> */}
        </div>

        {/* Arrow */}
        <div className="swap-arrow-container">
          <button className="swap-arrow-btn" onClick={handleSwapOrder}>
            <ArrowDown size={20} />
          </button>
        </div>

        {/* Bottom Box: You RECEIVE (exactIn) | You PAY (exactOut) */}
        <div className="token-box">
          <div className="token-box-label">
            <span>{swapMode === 'exactOut' ? 'To' : 'To'}</span>
            <div className="balance-info">
              <span>Balance: {swapMode === 'exactOut' ? (toToken?.balance || '0') : (toToken?.balance || '0')}</span>
            </div>
          </div>
          <div className="token-input-row">
            <div className="token-select-container">
              <button
                className="token-select"
                onClick={() => setActiveDropdown(activeDropdown === 'to' ? null : 'to')}
              >
                <div className={`token-icon ${toToken.symbol.toLowerCase()}`}>
                  <span>{toToken.symbol[0]}</span>
                </div>
                <span className="token-name">{toToken.symbol}</span>
                <ChevronDown size={16} className={activeDropdown === 'to' ? 'rotate-180' : ''} />
              </button>
              {renderTokenDropdown('to')}
            </div>
            <input
              type="number"
              placeholder="0.00"
              value={toAmount}
              readOnly
              style={{ opacity: 0.6, cursor: 'not-allowed' }}
            />
          </div>
          {/* <div className="usd-value">~$0</div> */}
        </div>

        {fromToken && toToken && toAmount && poolExists && (
          <motion.div
            className="swap-info-box"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="info-row">
              <span className="info-label">Rate</span>
              <span className="info-value">
                {swapMode === 'exactOut'
                  ? `1 ${toToken.symbol} ≈ ${(parseFloat(fromAmount) / parseFloat(toAmount)).toFixed(6)} ${fromToken.symbol}`
                  : `1 ${fromToken.symbol} ≈ ${(parseFloat(toAmount) / parseFloat(fromAmount)).toFixed(6)} ${toToken.symbol}`
                }
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Price Impact</span>
              <span className={`info-value impact ${priceImpact && priceImpact > 5 ? 'high-impact' : ''}`}>
                {priceImpact !== null ? (priceImpact < 0.01 ? '< 0.01%' : `${priceImpact.toFixed(2)}%`) : '-'}
              </span>
            </div>
          </motion.div>
        )}

        <button
          className="swap-cta"
          disabled={connectedWallet ? (isSwapping || !poolExists || !fromAmount || parseFloat(fromAmount) <= 0 || (swapMode === 'exactOut' && (!toAmount || parseFloat(toAmount) <= 0))) : false}
          onClick={connectedWallet ? handleSwap : onConnectWallet}
        >
          {!connectedWallet ? 'Connect Wallet' :
            isSwapping ? 'Swapping...' :
              !poolExists ? 'Insufficient Liquidity' : 'Swap'}
        </button>

      </motion.div>
    </div>
  );
};
