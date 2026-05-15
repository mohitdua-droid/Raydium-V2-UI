import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, ChevronDown, Info, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  TransactionMessage
} from '@solana/web3.js';
import { Program, AnchorProvider, BN, type Idl } from '@coral-xyz/anchor';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID
} from '@solana/spl-token';
import idl from '../assets/idl/raydium.json';

const POOL_SEED = Buffer.from("pool");
const VAULT_A_SEED = Buffer.from("vault_a");
const VAULT_B_SEED = Buffer.from("vault_b");
const LP_MINT_SEED = Buffer.from("lp_mint");
const AUTHORITY_SEED = Buffer.from("authority");
const AMM_CONFIG_SEED = Buffer.from("amm_config");

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
  mintAddress: string;
  decimals: number;
  balance?: string;
}

interface CreatePoolModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectedWallet?: string | null;
  fullAddress?: string | null;
  onConnectWallet?: () => void;
  configIndex?: number;
}

export const CreatePoolModal: React.FC<CreatePoolModalProps> = ({
  isOpen,
  onClose,
  connectedWallet,
  fullAddress,
  onConnectWallet,
  configIndex: propConfigIndex
}) => {
  const configIndex = propConfigIndex || 1;
  const [baseToken, setBaseToken] = useState<Token | null>(null);
  const [quoteToken, setQuoteToken] = useState<Token | null>(null);
  const [baseAmount, setBaseAmount] = useState('');
  const [quoteAmount, setQuoteAmount] = useState('');
  const [isTokenSelectOpen, setIsTokenSelectOpen] = useState(false);
  const [selectingSide, setSelectingSide] = useState<'base' | 'quote' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [tokens, setTokens] = useState<Token[]>([]);
  const [isInitializing, setIsInitializing] = useState(false);
  const [newTokensToSave, setNewTokensToSave] = useState<Token[]>([]);
  const [manualSymbol, setManualSymbol] = useState('');
  const [manualName, setManualName] = useState('');
  const [showManualAdd, setShowManualAdd] = useState(false);

  useEffect(() => {
    const fetchTokensAndBalances = async () => {
      try {
        const response = await fetch('/mintaddresses.json?t=' + Date.now());
        const data = await response.json();

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
        } else {
          setTokens(data);
        }
      } catch (error) {
        console.error('Error fetching tokens:', error);
      }
    };
    if (isOpen) fetchTokensAndBalances();
  }, [isOpen, fullAddress]);

  // Auto-fill manual symbol and name
  useEffect(() => {
    if (showManualAdd && searchQuery.length >= 32 && !manualSymbol && !manualName) {
      const prefix = searchQuery.slice(0, 5);
      setManualSymbol(prefix);
      setManualName(prefix);
    }
    // If user clears the search query or it's too short, reset manual states
    if (searchQuery.length < 32 && (manualSymbol || manualName)) {
      setManualSymbol('');
      setManualName('');
    }
  }, [showManualAdd, searchQuery]);

  const initialPrice = useMemo(() => {
    if (!baseAmount || !quoteAmount || parseFloat(baseAmount) === 0) return '0';
    return (parseFloat(quoteAmount) / parseFloat(baseAmount)).toString();
  }, [baseAmount, quoteAmount]);

  const filteredTokens = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const filtered = tokens.filter(t =>
      t.symbol.toLowerCase().includes(query) ||
      t.mintAddress.toLowerCase().includes(query)
    );

    // Check if it looks like a mint address and isn't found
    if (filtered.length === 0 && searchQuery.length >= 32) {
      setShowManualAdd(true);
    } else {
      setShowManualAdd(false);
    }

    return filtered;
  }, [searchQuery, tokens]);

  const handleSelectToken = (token: Token) => {
    if (selectingSide === 'base') setBaseToken(token);
    else if (selectingSide === 'quote') setQuoteToken(token);

    setIsTokenSelectOpen(false);
    setSelectingSide(null);
    setSearchQuery('');
    setShowManualAdd(false);
  };

  const handleAddManualToken = async () => {
    let decimals = 9;
    try {
      const res = await fetch(`http://localhost:3001/api/token-info/${searchQuery}`);
      const data = await res.json();
      if (data.decimals !== undefined) decimals = data.decimals;
    } catch (e) {
      console.warn("Failed to fetch decimals from backend, falling back to 9", e);
    }

    const newToken: Token = {
      symbol: manualSymbol,
      name: manualName,
      mintAddress: searchQuery,
      decimals,
      balance: "0"
    };
    setTokens([...tokens, newToken]);
    setNewTokensToSave([...newTokensToSave, newToken]);
    setSearchQuery('');
    setShowManualAdd(false);
    setManualSymbol('');
    setManualName('');
  };

  const handleInitializePool = async () => {
    if (!baseToken || !quoteToken || !baseAmount || !quoteAmount || !fullAddress) return;

    setIsInitializing(true);
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

      // 1. Save any new tokens to mintaddresses.json (Metadata only)
      for (const token of newTokensToSave) {
        await fetch('http://localhost:3001/api/save-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(token),
        });
      }

      // 2. Prepare transaction accounts
      const mintA = new PublicKey(baseToken.mintAddress);
      const mintB = new PublicKey(quoteToken.mintAddress);
      const [tokenAMint, tokenBMint] = mintA.toBuffer().compare(mintB.toBuffer()) < 0
        ? [mintA, mintB] : [mintB, mintA];

      const [ammConfig] = PublicKey.findProgramAddressSync(
        [AMM_CONFIG_SEED, new BN(configIndex).toArrayLike(Buffer, "le", 2)],
        program.programId
      );

      const pool = PublicKey.findProgramAddressSync(
        [POOL_SEED, tokenAMint.toBuffer(), tokenBMint.toBuffer()],
        program.programId
      )[0];

      const [authority] = PublicKey.findProgramAddressSync([AUTHORITY_SEED, pool.toBuffer()], program.programId);
      const [vaultA] = PublicKey.findProgramAddressSync([VAULT_A_SEED, pool.toBuffer()], program.programId);
      const [vaultB] = PublicKey.findProgramAddressSync([VAULT_B_SEED, pool.toBuffer()], program.programId);
      const [lpMint] = PublicKey.findProgramAddressSync(
        [LP_MINT_SEED, tokenAMint.toBuffer(), tokenBMint.toBuffer()],
        program.programId
      );

      // Detect token programs
      const mintAAccount = await connection.getAccountInfo(tokenAMint);
      const mintBAccount = await connection.getAccountInfo(tokenBMint);
      const programIdA = mintAAccount?.owner || TOKEN_PROGRAM_ID;
      const programIdB = mintBAccount?.owner || TOKEN_PROGRAM_ID;

      const userAtaA = getAssociatedTokenAddressSync(tokenAMint, wallet.publicKey, false, programIdA);
      const userAtaB = getAssociatedTokenAddressSync(tokenBMint, wallet.publicKey, false, programIdB);
      const userLpAta = getAssociatedTokenAddressSync(lpMint, wallet.publicKey);

      const amtARaw = toRawAmount(tokenAMint.equals(mintA) ? baseAmount : quoteAmount, tokenAMint.equals(mintA) ? baseToken.decimals : quoteToken.decimals);
      const amtBRaw = toRawAmount(tokenBMint.equals(mintB) ? quoteAmount : baseAmount, tokenBMint.equals(mintB) ? quoteToken.decimals : baseToken.decimals);

      // 3. Send transaction via wallet
      const tx = await program.methods
        .initializePool(amtARaw, amtBRaw)
        .accounts({
          pool,
          ammconfig: ammConfig,
          user: wallet.publicKey,
          tokenAMint,
          tokenBMint,
          vaultA,
          vaultB,
          lpMint,
          userAtaA,
          userAtaB,
          userLpAta,
          authority,
          systemProgram: SystemProgram.programId,
          tokenProgramA: programIdA,
          tokenProgramB: programIdB,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        } as any)
        .rpc();

      console.log('Pool initialized successfully, tx:', tx);

      // 4. Save pool info to pools.json so it appears in the Liquidity list
      await fetch('http://localhost:3001/api/save-pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pool: pool.toBase58(),
          ammConfig: ammConfig.toBase58(),
          configIndex,
          tokenAMint: tokenAMint.toBase58(),
          tokenBMint: tokenBMint.toBase58(),
          lpMint: lpMint.toBase58(),
          authority: authority.toBase58(),
          vaultA: vaultA.toBase58(),
          vaultB: vaultB.toBase58(),
          programId: program.programId.toBase58(),
        }),
      });

      onClose();
    } catch (err: any) {
      console.error('Error during initialization:', err);
      alert('Error: ' + (err.message || 'Unknown error'));
    } finally {
      setIsInitializing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <motion.div
        className="create-pool-card"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className="modal-header">
          <h2>Initialize CPMM pool</h2>
          <button onClick={onClose}><X size={20} /></button>
        </div>

        <div className="create-pool-body">
          <div className="section-title">Initial liquidity</div>

          {/* Base Token Box */}
          <div className="token-box create-box">
            <div className="token-box-label">
              <span>Base token</span>
              <div className="balance-info">
                <span>{baseToken?.balance || '0'}</span>
                <button
                  className="max-btn"
                  disabled={!baseToken}
                  onClick={() => setBaseAmount(baseToken?.balance || '0')}
                >
                  Max
                </button>
                <button
                  className="half-btn"
                  disabled={!baseToken}
                  onClick={() => setBaseAmount((parseFloat(baseToken?.balance || '0') / 2).toString())}
                >
                  50%
                </button>
              </div>
            </div>
            <div className="token-input-row">
              <button className="token-select large" onClick={() => { setSelectingSide('base'); setIsTokenSelectOpen(true); }}>
                {baseToken ? (
                  <>
                    <div className={`token-icon ${baseToken.symbol.toLowerCase()}`}>{baseToken.symbol[0]}</div>
                    <span>{baseToken.symbol}</span>
                  </>
                ) : (
                  <>
                    <div className="token-icon-empty" />
                    <span className="placeholder">Select token</span>
                  </>
                )}
                <ChevronDown size={18} />
              </button>
              <input
                type="number"
                placeholder="0.00"
                value={baseAmount}
                onChange={(e) => setBaseAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="swap-arrow-container static">
            <div className="plus-icon"><Plus size={20} /></div>
          </div>

          {/* Quote Token Box */}
          <div className="token-box create-box">
            <div className="token-box-label">
              <span>Quote token</span>
              <div className="balance-info">
                <span>{quoteToken?.balance || '0'}</span>
                <button
                  className="max-btn"
                  disabled={!quoteToken}
                  onClick={() => setQuoteAmount(quoteToken?.balance || '0')}
                >
                  Max
                </button>
                <button
                  className="half-btn"
                  disabled={!quoteToken}
                  onClick={() => setQuoteAmount((parseFloat(quoteToken?.balance || '0') / 2).toString())}
                >
                  50%
                </button>
              </div>
            </div>
            <div className="token-input-row">
              <button className="token-select large" onClick={() => { setSelectingSide('quote'); setIsTokenSelectOpen(true); }}>
                {quoteToken ? (
                  <>
                    <div className={`token-icon ${quoteToken.symbol.toLowerCase()}`}>{quoteToken.symbol[0]}</div>
                    <span>{quoteToken.symbol}</span>
                  </>
                ) : (
                  <>
                    <div className="token-icon-empty" />
                    <span className="placeholder">Select token</span>
                  </>
                )}
                <ChevronDown size={18} />
              </button>
              <input
                type="number"
                placeholder="0.00"
                value={quoteAmount}
                onChange={(e) => setQuoteAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="initial-price-section">
            <div className="section-label">
              Initial price
              <span className="info-tooltip-wrapper">
                <Info size={14} />
                <span className="info-tooltip-bubble">
                  Initial price is set by the ratio of tokens deposited for initial liquidity.
                </span>
              </span>
            </div>
            <div className="price-input-container">
              <input type="text" readOnly value={initialPrice} />
              <span className="price-unit">/{baseToken?.symbol || 'SOL'}</span>
            </div>
            {baseToken && quoteToken && (
              <div className="current-price-info">
                Current price: 1 {baseToken.symbol} ≈ {initialPrice} {quoteToken.symbol}
              </div>
            )}
          </div>

          {!connectedWallet ? (
            <button className="swap-cta create-pool-cta" onClick={onConnectWallet}>
              Connect Wallet
            </button>
          ) : (
            <button
              className="swap-cta create-pool-cta"
              disabled={!baseToken || !quoteToken || !baseAmount || !quoteAmount || isInitializing}
              onClick={handleInitializePool}
            >
              {isInitializing ? 'Processing...' : 'Initialize Pool'}
            </button>
          )}
        </div>
      </motion.div>

      {/* Token Select Sub-modal */}
      <AnimatePresence>
        {isTokenSelectOpen && (
          <div className="modal-overlay z-2000">
            <motion.div
              className="token-select-modal"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
            >
              <div className="modal-header">
                <h2>Select a token</h2>
                <button onClick={() => setIsTokenSelectOpen(false)}><X size={20} /></button>
              </div>

              <div className="search-container">
                <Search size={18} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search by token or paste address"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="popular-tokens">
                <div className="popular-label">Popular tokens</div>
                <div className="popular-list">
                  {tokens.slice(0, 3).map(t => (
                    <button key={t.mintAddress} className="popular-item" onClick={() => handleSelectToken(t)}>
                      <div className={`token-icon-xs ${t.symbol.toLowerCase()}`}>{t.symbol[0]}</div>
                      {t.symbol}
                    </button>
                  ))}
                </div>
              </div>

              <div className="token-list-header">
                <span>Token</span>
                <span>Balance/Address</span>
              </div>

              <div className="token-list-scroll">
                {filteredTokens.map(t => (
                  <button key={t.mintAddress} className="token-list-item" onClick={() => handleSelectToken(t)}>
                    <div className="token-item-left">
                      <div className={`token-icon-sm ${t.symbol.toLowerCase()}`}>{t.symbol[0]}</div>
                      <div className="token-item-names">
                        <div className="token-item-symbol">{t.symbol}</div>
                        <div className="token-item-name">{t.name}</div>
                      </div>
                    </div>
                    <div className="token-item-right">
                      <div className="token-item-balance">{t.balance || '0'}</div>
                      <div className="token-item-address">{t.mintAddress.slice(0, 6)}...{t.mintAddress.slice(-6)}</div>
                    </div>
                  </button>
                ))}

                {showManualAdd && (
                  <div className="manual-add-container">
                    <div className="manual-inputs">
                      <div className="manual-row">
                        <label>Symbol:</label>
                        <input
                          type="text"
                          placeholder="Enter symbol"
                          value={manualSymbol}
                          onChange={(e) => setManualSymbol(e.target.value)}
                        />
                      </div>
                      <div className="manual-row">
                        <label>Name:</label>
                        <input
                          type="text"
                          placeholder="Enter name"
                          value={manualName}
                          onChange={(e) => setManualName(e.target.value)}
                        />
                      </div>
                    </div>
                    <button className="add-user-token-btn" onClick={handleAddManualToken}>
                      Add User Token
                    </button>
                  </div>
                )}
              </div>

              <div className="token-modal-footer">
                Can't find the token you're looking for? Try entering the mint address or check token list settings below.
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
