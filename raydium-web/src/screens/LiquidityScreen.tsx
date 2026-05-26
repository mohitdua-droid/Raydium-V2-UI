import { useState, useEffect } from 'react';
import { Search, RefreshCcw, ArrowLeftRight, Info, ChevronUp, ChevronDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Program, AnchorProvider, type Idl } from '@coral-xyz/anchor';
import idl from '../assets/idl/raydium.json';
// import poolsData from '../assets/data/pools.json';

import { CreatePoolModal } from '../components/CreatePoolModal';
import { DepositModal } from '../components/DepositModal';
import { WithdrawModal } from '../components/WithdrawModal';

interface TokenInfo {
  symbol: string;
  name: string;
  mint: string;
}

interface Pool {
  id: string;
  tokenA: TokenInfo;
  tokenB: TokenInfo;
  liquidity: string;
  volume24h: string;
  fees24h: string;
  apr24h: string;
  status: string;
  configIndex: number;
  lpMint: string;
  userLpBalance: string;
}

interface LiquidityScreenProps {
  onSwap?: (tokenA: string, tokenB: string) => void;
  connectedWallet?: string | null;
  fullAddress?: string | null;
  onConnectWallet?: () => void;
}

export const LiquidityScreen: React.FC<LiquidityScreenProps> = ({
  onSwap,
  connectedWallet,
  fullAddress,
  onConnectWallet
}) => {
  const [pools, setPools] = useState<Pool[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [selectedConfigIndex, setSelectedConfigIndex] = useState(1);
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null);

  const fetchPoolData = async () => {
    setIsLoading(true);
    try {
      const connection = new Connection("https://api.devnet.solana.com", "confirmed");
      const provider = new AnchorProvider(connection, {} as any, { commitment: "confirmed" });
      const program = new Program(idl as Idl, provider);

      const tokensRes = await fetch('/mintaddresses.json?t=' + Date.now());
      const tokensData = await tokensRes.json();
      const symbolMap = new Map<string, string>(tokensData.map((m: any) => [m.mintAddress, m.symbol]));
      const mintDecimalsMap = new Map<string, number>(tokensData.map((m: any) => [m.mintAddress, m.decimals]));

      const poolsRes = await fetch('/pools.json?t=' + Date.now());
      const poolsJson = await poolsRes.json();

      const loadedPools: Pool[] = await Promise.all(poolsJson.map(async (p: any) => {
        let reserveA = "0";
        let reserveB = "0";
        let status = p.status || 1;

        try {
          const poolAccount: any = await (program.account as any).poolState.fetch(p.pool);
          reserveA = poolAccount.reserveA.toString();
          reserveB = poolAccount.reserveB.toString();
          status = poolAccount.status || 1;
        } catch (e) {
          console.warn(`Could not fetch state for pool ${p.pool}`, e);
        }

        let userLpBalance = "0";
        if (fullAddress && p.lpMint) {
          try {
            const userAta = getAssociatedTokenAddressSync(new PublicKey(p.lpMint), new PublicKey(fullAddress));
            const balanceInfo = await connection.getTokenAccountBalance(userAta);
            userLpBalance = parseFloat(balanceInfo.value.uiAmountString || "0").toFixed(2);
          } catch (e) {
            // No ATA found means 0 balance
          }
        }

        const decA = mintDecimalsMap.get(p.tokenAMint) || 9;
        const decB = mintDecimalsMap.get(p.tokenBMint) || 9;
        const valA = (parseInt(reserveA) / Math.pow(10, decA)).toFixed(5);
        const valB = (parseInt(reserveB) / Math.pow(10, decB)).toFixed(5);

        return {
          id: p.pool,
          tokenA: {
            symbol: symbolMap.get(p.tokenAMint) || p.tokenAMint.slice(0, 4),
            name: symbolMap.get(p.tokenAMint) || "Unknown",
            mint: p.tokenAMint,
            decimals: decA
          },
          tokenB: {
            symbol: symbolMap.get(p.tokenBMint) || p.tokenBMint.slice(0, 4),
            name: symbolMap.get(p.tokenBMint) || "Unknown",
            mint: p.tokenBMint,
            decimals: decB
          },
          liquidity: `(${valA}/${valB})`,
          volume24h: "0",
          fees24h: "0",
          apr24h: "0",
          status: status.toString(),
          configIndex: p.configIndex,
          lpMint: p.lpMint,
          userLpBalance: userLpBalance
        };
      }));

      setPools(loadedPools);
    } catch (err) {
      console.error('Error fetching pools:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPoolData();
  }, []);

  const poolsInCurrentConfig = pools.filter(p => p.configIndex === selectedConfigIndex);

  const filteredPools = poolsInCurrentConfig.filter(pool =>
    pool.tokenA.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pool.tokenB.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pool.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="liquidity-page">
      <div className="liquidity-header-section">
        <div className="header-text">
          <h1 className="gradient-text">Liquidity Pools</h1>
          <p className="subtitle">Provide liquidity, earn yield.</p>
        </div>
      </div>

      <div className="liquidity-controls">
        <div className="filter-tabs">
          <button className="filter-tab active">All</button>

          <div className="config-selector-inline">
            <div className="config-input-wrapper">
              <input
                type="number"
                value={selectedConfigIndex}
                onChange={(e) => setSelectedConfigIndex(parseInt(e.target.value) || 0)}
                className="config-index-input"
              />
              <div className="config-spinner-btns">
                <button onClick={() => setSelectedConfigIndex(prev => prev + 1)} className="spin-btn"><ChevronUp size={12} /></button>
                <button onClick={() => setSelectedConfigIndex(prev => Math.max(0, prev - 1))} className="spin-btn"><ChevronDown size={12} /></button>
              </div>
            </div>
          </div>
        </div>

        <div className="search-and-actions">
          <div className="search-bar">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="refresh-btn" onClick={fetchPoolData} disabled={isLoading}>
            <RefreshCcw size={18} className={isLoading ? "spin" : ""} />
          </button>
          <button className="create-pool-btn" onClick={() => setIsCreateModalOpen(true)}>
            <span>Create</span>
          </button>
        </div>
      </div>

      <div className="pools-table-container">
        <table className="pools-table">
          <thead>
            <tr>
              <th className="th-pool">Pools</th>
              <th className="th-liq">Liquidity</th>
              <th className="th-vol">Volume 24H</th>
              <th className="th-fees">Fees 24H</th>
              <th className="th-apr">APR 24H</th>
              <th className="th-status">
                <div className="header-with-info">
                  Pool State
                  <sup className="tooltip-container">
                    <Info size={11} className="info-icon" />
                    <div className="tooltip-content">
                      <p>1: Initialized but not ready for trade</p>
                      <p>2: Ready for trades</p>
                      <p>3: Paused / Inactive</p>
                    </div>
                  </sup>
                </div>
              </th>
              <th className="th-config">Config Index</th>
              <th className="th-balance">My Balance</th>
              <th className="th-actions"></th>
            </tr>
          </thead>
          <tbody>
            {filteredPools.length > 0 ? (
              filteredPools.map((pool) => (
                <motion.tr
                  key={pool.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="pool-row"
                >
                  <td className="td-pool">
                    <div className="pool-info">
                      <div className="pool-icons">
                        <div className={`token-icon-sm ${pool.tokenA.symbol.toLowerCase()}`}>
                          {pool.tokenA.symbol[0]}
                        </div>
                        <div className={`token-icon-sm ${pool.tokenB.symbol.toLowerCase()} overlap`}>
                          {pool.tokenB.symbol[0]}
                        </div>
                      </div>
                      <div className="pool-names">
                        <span className="pool-name-text">{pool.tokenA.symbol}-{pool.tokenB.symbol}</span>
                      </div>
                    </div>
                  </td>
                  <td className="td-liq">{pool.liquidity}</td>
                  <td className="td-vol">{pool.volume24h}</td>
                  <td className="td-fees">{pool.fees24h}</td>
                  <td className="td-apr">
                    <div className="apr-cell">
                      <span className="apr-value">{pool.apr24h}</span>
                    </div>
                  </td>
                  <td className="td-status">
                    <div className="status-cell">
                      <span className="status-badge initialized">{pool.status}</span>
                    </div>
                  </td>
                  <td className="td-config">
                    <span className="config-index">{pool.configIndex}</span>
                  </td>
                  <td className="td-balance">
                    <div className="balance-cell">
                      <span className={`balance-value ${parseFloat(pool.userLpBalance) > 0 ? 'has-balance' : ''}`}>
                        {pool.userLpBalance} LP
                      </span>
                    </div>
                  </td>
                  <td className="td-actions">
                    <div className="action-buttons">
                      <button
                        className="swap-icon-btn"
                        onClick={() => onSwap?.(pool.tokenA.mint, pool.tokenB.mint)}
                        title="Swap"
                      >
                        <ArrowLeftRight size={16} />
                      </button>
                      <button
                        className="deposit-btn"
                        onClick={() => {
                          setSelectedPool(pool);
                          setIsDepositModalOpen(true);
                        }}
                      >
                        Deposit
                      </button>
                      {fullAddress && (
                        <button
                          className="deposit-btn withdraw-btn-styled"
                          onClick={() => {
                            setSelectedPool(pool);
                            setIsWithdrawModalOpen(true);
                          }}
                        >
                          Withdraw
                        </button>
                      )}
                    </div>
                  </td>
                </motion.tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  {isLoading ? "Loading pools..." : "No pools found. Create a pool to get started."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CreatePoolModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          fetchPoolData();
        }}
        connectedWallet={connectedWallet}
        fullAddress={fullAddress}
        onConnectWallet={onConnectWallet}
        configIndex={selectedConfigIndex}
      />

      <DepositModal
        isOpen={isDepositModalOpen}
        onClose={() => {
          setIsDepositModalOpen(false);
          setSelectedPool(null);
          fetchPoolData();
        }}
        pool={selectedPool}
        connectedWallet={connectedWallet || null}
        fullAddress={fullAddress || null}
        onConnectWallet={onConnectWallet ? onConnectWallet : () => { }}
      />
      <WithdrawModal
        isOpen={isWithdrawModalOpen}
        onClose={() => {
          setIsWithdrawModalOpen(false);
          fetchPoolData();
        }}
        pool={selectedPool}
        fullAddress={fullAddress || null}
      />
    </div>
  );
};
