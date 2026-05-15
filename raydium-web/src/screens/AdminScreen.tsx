import { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { Connection } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider, type Idl } from '@coral-xyz/anchor';
import idl from '../assets/idl/raydium.json';

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
  status: number;
  configIndex: number;
}

interface AdminScreenProps {
  connectedWallet?: string | null;
  fullAddress?: string | null;
  onConnectWallet?: () => void;
}

export const AdminScreen: React.FC<AdminScreenProps> = ({
  fullAddress,
  onConnectWallet
}) => {
  const [pools, setPools] = useState<Pool[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [configIndex, setConfigIndex] = useState(1);
  const [pendingStatus, setPendingStatus] = useState<Record<string, number>>({});
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  const [configAdmin, setConfigAdmin] = useState<string | null>(null);
  const [availableConfigs, setAvailableConfigs] = useState<number[]>([]);

  // Transfer admin modal state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  // Create config modal state
  const [showCreateConfig, setShowCreateConfig] = useState(false);
  const [newConfigIndex, setNewConfigIndex] = useState(configIndex + 1);
  const [tradeFee, setTradeFee] = useState('');
  const [protocolFee, setProtocolFee] = useState('');
  const [fundFee, setFundFee] = useState('');
  const [isCreatingConfig, setIsCreatingConfig] = useState(false);

  // Pool Details Modal state
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedPoolForDetails, setSelectedPoolForDetails] = useState<Pool | null>(null);
  const [poolDetails, setPoolDetails] = useState<any>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isCollecting, setIsCollecting] = useState<string | null>(null); // 'p' or 'f' or null
  const [collectPercentage, setCollectPercentage] = useState<number>(100);

  // Validates that a string is a valid Solana base58 public key (32 bytes)
  const isValidSolanaAddress = (addr: string): boolean => {
    if (!addr || addr.length < 32 || addr.length > 44) return false;
    try {
      new anchor.web3.PublicKey(addr);
      return true;
    } catch {
      return false;
    }
  };

  const DEPLOYER_ADDRESS = "3xVCWjzhLgDmfQJecCcRaSkTWUBBk1KqWxDdsp1bBSj6";

  const fetchPoolData = async () => {
    setIsLoading(true);
    try {
      const connection = new Connection("https://api.devnet.solana.com", "confirmed");
      const provider = new AnchorProvider(connection, (window as any).solana || {}, { commitment: "confirmed" });
      const program = new Program(idl as Idl, provider);

      // Fetch every ammConfig account to know available indices
      try {
        const allConfigs = await (program.account as any).ammConfig.all();
        const indices = allConfigs.map((c: any) => c.account.index).sort((a: number, b: number) => a - b);
        setAvailableConfigs(indices);

        // Also fetch admin for current selection specifically for permissions
        const currentConfig = allConfigs.find((c: any) => c.account.index === configIndex);
        if (currentConfig) {
          setConfigAdmin(currentConfig.account.admin.toBase58());
        } else {
          // Fallback if current index not in 'all' list (shouldn't happen usually)
          const [ammConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("amm_config"), new anchor.BN(configIndex).toArrayLike(Buffer, "le", 2)],
            new anchor.web3.PublicKey(idl.address)
          );
          const configAccount: any = await (program.account as any).ammConfig.fetch(ammConfigPda);
          setConfigAdmin(configAccount.admin.toBase58());
        }
      } catch (e) {
        console.warn("Could not fetch configs:", e);
      }

      const tokensRes = await fetch('/mintaddresses.json?t=' + Date.now());
      const tokensData = await tokensRes.json();
      const symbolMap = new Map<string, string>(tokensData.map((m: any) => [m.mintAddress, m.symbol]));
      const decimalMap = new Map<string, number>(tokensData.map((m: any) => [m.mintAddress, m.decimals || 9]));

      const poolsRes = await fetch('/pools.json?t=' + Date.now());
      const poolsJson = await poolsRes.json();

      const loadedPools: Pool[] = await Promise.all(poolsJson.map(async (p: any) => {
        let reserveA = "0";
        let reserveB = "0";
        let status = 1;

        try {
          const poolAccount: any = await (program.account as any).poolState.fetch(p.pool);
          reserveA = poolAccount.reserveA.toString();
          reserveB = poolAccount.reserveB.toString();
          status = poolAccount.status || 1;
        } catch (e) {
          console.warn(`Could not fetch state for pool ${p.pool}`, e);
        }

        const decA = decimalMap.get(p.tokenAMint) || 9;
        const decB = decimalMap.get(p.tokenBMint) || 9;
        const valA = (parseInt(reserveA) / Math.pow(10, decA)).toFixed(5);
        const valB = (parseInt(reserveB) / Math.pow(10, decB)).toFixed(5);

        return {
          id: p.pool,
          tokenA: {
            symbol: symbolMap.get(p.tokenAMint) || p.tokenAMint.slice(0, 4),
            name: symbolMap.get(p.tokenAMint) || "Unknown",
            mint: p.tokenAMint,
          },
          tokenB: {
            symbol: symbolMap.get(p.tokenBMint) || p.tokenBMint.slice(0, 4),
            name: symbolMap.get(p.tokenBMint) || "Unknown",
            mint: p.tokenBMint,
          },
          liquidity: `(${valA}/${valB})`,
          volume24h: "0",
          fees24h: "0",
          apr24h: "0",
          status: status,
          configIndex: p.configIndex
        };
      }));

      setPools(loadedPools.filter(p => p.configIndex === configIndex));
    } catch (err) {
      console.error('Error fetching pools:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPoolData();
  }, [fullAddress, configIndex]);

  const isAuthorized = fullAddress && (
    fullAddress === DEPLOYER_ADDRESS ||
    fullAddress === configAdmin ||
    fullAddress.startsWith("4LsX")
  );

  // const canSign = fullAddress && (fullAddress === DEPLOYER_ADDRESS || fullAddress === configAdmin);

  if (!fullAddress) {
    return (
      <div className="admin-locked-container">
        <div className="locked-content">
          <div className="lock-icon-large">🔒</div>
          <h2>Access Restricted</h2>
          <p>Only Authorized Personnel can get access</p>
          <button className="swap-cta connect-admin-btn" onClick={onConnectWallet}>
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="admin-locked-container">
        <div className="locked-content">
          <div className="lock-icon-large">🚫</div>
          <h2>Unauthorized Access</h2>
          <p>Your wallet address is not on the authorized list.</p>
          <div className="unauth-address">{fullAddress}</div>
        </div>
      </div>
    );
  }

  const handleStatusCycle = (poolId: string, direction: 'up' | 'down') => {
    const currentPool = pools.find(p => p.id === poolId);
    if (!currentPool) return;

    let nextStatus = pendingStatus[poolId] !== undefined ? pendingStatus[poolId] : currentPool.status;

    if (direction === 'up') {
      nextStatus = nextStatus === 3 ? 1 : nextStatus + 1;
    } else {
      nextStatus = nextStatus === 1 ? 3 : nextStatus - 1;
    }

    if (nextStatus === currentPool.status) {
      const newPending = { ...pendingStatus };
      delete newPending[poolId];
      setPendingStatus(newPending);
    } else {
      setPendingStatus(prev => ({ ...prev, [poolId]: nextStatus }));
    }
  };

  const handleCancelStatus = (poolId: string) => {
    const newPending = { ...pendingStatus };
    delete newPending[poolId];
    setPendingStatus(newPending);
  };

  const handleConfirmStatus = async (poolId: string) => {
    const pool = pools.find(p => p.id === poolId);
    const newStatus = pendingStatus[poolId];
    if (!pool || newStatus === undefined) return;

    // We no longer check canSign in the browser because the backend signs with the deployer wallet
    // However, we still only allow authorized users to trigger the backend call
    if (!isAuthorized) {
      alert("Unauthorized to perform this action.");
      return;
    }

    setIsUpdating(poolId);
    try {
      const response = await fetch('http://localhost:3001/api/update-pool-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poolId, status: newStatus })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to update pool status");
      }

      console.log(`Backend update successful:`, result.stdout);

      // Update local state
      setPools(prev => prev.map(p => p.id === poolId ? { ...p, status: newStatus } : p));
      handleCancelStatus(poolId);
      alert(`Pool status updated to ${newStatus} successfully! (Signed by Deployer)`);
    } catch (err) {
      console.error("Error updating pool status via backend:", err);
      alert(`Failed to update pool status: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsUpdating(null);
    }
  };

  const handleConfigCycle = (direction: 'up' | 'down') => {
    if (availableConfigs.length === 0) return;

    const currentIndex = availableConfigs.indexOf(configIndex);
    if (direction === 'up') {
      const next = availableConfigs[currentIndex + 1];
      if (next !== undefined) setConfigIndex(next);
    } else {
      const prev = availableConfigs[currentIndex - 1];
      if (prev !== undefined) setConfigIndex(prev);
    }
  };

  const handleFetchPoolDetails = async (pool: Pool) => {
    setSelectedPoolForDetails(pool);
    setShowDetailsModal(true);
    setIsLoadingDetails(true);
    setPoolDetails(null);
    try {
      const res = await fetch('http://localhost:3001/api/pool-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mintA: pool.tokenA.mint, mintB: pool.tokenB.mint }),
      });
      const data = await res.json();
      if (data.success) {
        setPoolDetails(data.details);
      } else {
        throw new Error(data.error || 'Failed to fetch details');
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
      setShowDetailsModal(false);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleCollectFees = async (type: 'p' | 'f', tokenSide: 'A' | 'B') => {
    if (!selectedPoolForDetails || !poolDetails) return;
    setIsCollecting(type + tokenSide);
    try {
      const rawAmtA = tokenSide === 'A' ? (type === 'p' ? poolDetails.protocolFeesA : poolDetails.fundFeesA) : "0";
      const rawAmtB = tokenSide === 'B' ? (type === 'p' ? poolDetails.protocolFeesB : poolDetails.fundFeesB) : "0";

      // Apply percentage
      const amtA = (parseFloat(rawAmtA) * (collectPercentage / 100)).toFixed(0);
      const amtB = (parseFloat(rawAmtB) * (collectPercentage / 100)).toFixed(0);

      const res = await fetch('http://localhost:3001/api/collect-fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mintA: selectedPoolForDetails.tokenA.mint,
          mintB: selectedPoolForDetails.tokenB.mint,
          type,
          amtA,
          amtB
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`${type === 'p' ? 'Protocol' : 'Fund'} fees collected successfully!`);
        // Refresh details
        handleFetchPoolDetails(selectedPoolForDetails);
      } else {
        throw new Error(data.error || 'Failed to collect fees');
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsCollecting(null);
    }
  };

  return (
    <div className="liquidity-page admin-page">
      <div className="admin-controls-header">
        <div className="admin-header-top-row">
          <h1 className="gradient-text" style={{ textAlign: 'left', paddingLeft: '10px' }}>Admin Panel</h1>
          <button className="create-config-btn" onClick={() => { setNewConfigIndex(configIndex + 1); setShowCreateConfig(true); }}>
            + Create Config
          </button>
        </div>
        <div className="config-row">
          <span className="config-label">Config Index:</span>
          <div className="admin-status-spinner config-spinner">
            <span className="status-val">{configIndex}</span>
            <div className="spinner-controls">
              <button onClick={() => handleConfigCycle('up')} className="spinner-btn">
                <ChevronUp size={14} />
              </button>
              <button onClick={() => handleConfigCycle('down')} className="spinner-btn">
                <ChevronDown size={14} />
              </button>
            </div>
          </div>
        </div>
        <div className="pools-label-row">
          <h2 className="admin-section-title">Pools</h2>
        </div>
      </div>

      <div className="pools-table-container admin-table-container">
        <table className="pools-table admin-table">
          <thead>
            <tr>
              <th className="th-pool"></th>
              <th className="th-liq">Liquidity</th>
              <th className="th-vol">Volume24H</th>
              <th className="th-fees">Fees24H</th>
              <th className="th-apr">APR24H</th>
              <th className="th-adv">Collect Fees</th>
              <th className="th-edit-status">Edit Pool Status</th>
            </tr>
          </thead>
          <tbody>
            {pools.length > 0 ? (
              pools.map((pool) => (
                <motion.tr
                  key={pool.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="pool-row admin-row"
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
                  <td className="td-apr">{pool.apr24h}</td>
                  <td className="td-adv">
                    <button className="admin-click-btn" onClick={() => handleFetchPoolDetails(pool)}>Click</button>
                  </td>
                  <td className="td-edit-status">
                    <div className="status-edit-container">
                      <div className="admin-status-spinner">
                        <span className="status-val">
                          {pendingStatus[pool.id] !== undefined ? pendingStatus[pool.id] : pool.status}
                        </span>
                        <div className="spinner-controls">
                          <button onClick={() => handleStatusCycle(pool.id, 'up')} className="spinner-btn" disabled={isUpdating === pool.id}>
                            <ChevronUp size={14} />
                          </button>
                          <button onClick={() => handleStatusCycle(pool.id, 'down')} className="spinner-btn" disabled={isUpdating === pool.id}>
                            <ChevronDown size={14} />
                          </button>
                        </div>
                      </div>
                      {pendingStatus[pool.id] !== undefined && (
                        <div className="status-confirm-actions">
                          <button
                            className={`confirm-btn ${!isAuthorized ? 'disabled' : ''}`}
                            onClick={() => handleConfirmStatus(pool.id)}
                            disabled={isUpdating === pool.id || !isAuthorized}
                            title={isAuthorized ? "Confirm Change (Signed by Deployer)" : "Unauthorized"}
                          >
                            {isUpdating === pool.id ? "..." : "✔️"}
                          </button>
                          <button
                            className="cancel-btn"
                            onClick={() => handleCancelStatus(pool.id)}
                            disabled={isUpdating === pool.id}
                          >
                            ❌
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </motion.tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  {isLoading ? "Loading pools..." : "No pools found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="admin-footer-actions">
        <button className="transfer-admin-btn" onClick={() => setShowTransferModal(true)}>
          Transfer Admin Controls
        </button>
      </div>

      {/* Transfer Admin Modal */}
      {/* Create Config Modal */}
      {showCreateConfig && (
        <div className="modal-overlay" style={{ zIndex: 3000 }}>
          <div className="transfer-admin-modal">
            <div className="modal-header">
              <h2>Create Config</h2>
              <button onClick={() => setShowCreateConfig(false)} style={{ color: 'var(--text-secondary)', fontSize: 20 }}>✕</button>
            </div>

            <div className="transfer-field">
              <label className="transfer-label">Index</label>
              <input
                className="transfer-input"
                type="number"
                value={newConfigIndex}
                onChange={(e) => setNewConfigIndex(parseInt(e.target.value) || 0)}
              />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              </div>
            </div>

            <div className="create-config-fees-row">
              <div className="transfer-field" style={{ flex: 1 }}>
                <label className="transfer-label">Trade Fees (bps)</label>
                <input
                  className="transfer-input"
                  type="number"
                  placeholder="e.g. 2500"
                  value={tradeFee}
                  onChange={(e) => setTradeFee(e.target.value)}
                />
              </div>
              <div className="transfer-field" style={{ flex: 1 }}>
                <label className="transfer-label">Protocol Fees (bps)</label>
                <input
                  className="transfer-input"
                  type="number"
                  placeholder="e.g. 300"
                  value={protocolFee}
                  onChange={(e) => setProtocolFee(e.target.value)}
                />
              </div>
              <div className="transfer-field" style={{ flex: 1 }}>
                <label className="transfer-label">Fund Fees (bps)</label>
                <input
                  className="transfer-input"
                  type="number"
                  placeholder="e.g. 100"
                  value={fundFee}
                  onChange={(e) => setFundFee(e.target.value)}
                />
              </div>
            </div>

            <div className="transfer-confirm-row">
              <button
                className="transfer-confirm-btn"
                disabled={!tradeFee || !protocolFee || !fundFee || isCreatingConfig}
                onClick={async () => {
                  setIsCreatingConfig(true);
                  try {
                    const res = await fetch('http://localhost:3001/api/create-config', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        index: newConfigIndex,
                        tradeFee,
                        protocolFee,
                        fundFee,
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Failed to create config');
                    alert(`Config index ${newConfigIndex} created successfully!`);
                    setConfigIndex(newConfigIndex); // Shift to the new config
                    setShowCreateConfig(false);
                    setTradeFee(''); setProtocolFee(''); setFundFee('');
                    fetchPoolData();
                  } catch (err: any) {
                    alert('Error: ' + err.message);
                  } finally {
                    setIsCreatingConfig(false);
                  }
                }}
              >
                {isCreatingConfig ? 'Creating...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTransferModal && (
        <div className="modal-overlay" style={{ zIndex: 3000 }}>
          <div className="transfer-admin-modal">
            <div className="modal-header">
              <h2>Transfer Admin Controls</h2>
              <button onClick={() => { setShowTransferModal(false); setTransferTo(''); }} style={{ color: 'var(--text-secondary)', fontSize: 20 }}>✕</button>
            </div>

            <div className="transfer-field">
              <label className="transfer-label">Transfer Address From:</label>
              <input
                className="transfer-input"
                type="text"
                readOnly
                value={fullAddress || ''}
              />
            </div>

            <div className="transfer-field">
              <label className="transfer-label">Transfer Address To:</label>
              <input
                className={`transfer-input ${transferTo && !isValidSolanaAddress(transferTo) ? 'transfer-input-error' : ''}`}
                type="text"
                placeholder="Enter recipient wallet address"
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value.trim())}
              />
              {transferTo && !isValidSolanaAddress(transferTo) && (
                <div className="transfer-invalid-msg">
                  ⓘ This address is not a registered address or an invalid address
                </div>
              )}
            </div>

            <div className="transfer-confirm-row">
              <span className="transfer-confirm-tooltip-wrapper">
                <button
                  className="transfer-confirm-btn"
                  disabled={!isValidSolanaAddress(transferTo) || isTransferring}
                  onClick={async () => {
                    setIsTransferring(true);
                    try {
                      const res = await fetch('http://localhost:3001/api/transfer-admin', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ newAdmin: transferTo, configIndex }),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || 'Transfer failed');
                      alert('Admin controls transferred successfully!');
                      setShowTransferModal(false);
                      setTransferTo('');
                      fetchPoolData();
                    } catch (err: any) {
                      alert('Error: ' + err.message);
                    } finally {
                      setIsTransferring(false);
                    }
                  }}
                >
                  {isTransferring ? 'Transferring...' : 'Confirm?'}
                </button>
                <span className="transfer-confirm-tooltip">
                  You'll lose the access to all the admin features once you transfer the ownership
                </span>
              </span>
            </div>
          </div>
        </div>
      )}

      {showDetailsModal && selectedPoolForDetails && (
        <div className="modal-overlay" style={{ zIndex: 4000 }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="pool-details-page-modal"
          >
            <div className="details-header-row">
              <div className="pool-id-container">
                <span className="pool-id-label">POOL ID</span>
                <h1 className="pool-id-value">{poolDetails?.poolId || "..."}</h1>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div className="collect-percent-dropdown">
                  <label>Collect %</label>
                  <select 
                    value={collectPercentage} 
                    onChange={(e) => setCollectPercentage(parseInt(e.target.value))}
                  >
                    {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(p => (
                      <option key={p} value={p}>{p}%</option>
                    ))}
                  </select>
                </div>
                <button className="close-modal-btn" onClick={() => setShowDetailsModal(false)}>✕</button>
              </div>
            </div>

            <div className="details-boxes-row">
              {/* Token A Box */}
              <div className="details-box">
                <div className="box-header">
                  <div className={`token-icon ${selectedPoolForDetails.tokenA.symbol.toLowerCase()}`}>
                    {selectedPoolForDetails.tokenA.symbol[0]}
                  </div>
                  <h2 className="box-title">{selectedPoolForDetails.tokenA.symbol}</h2>
                </div>

                <div className="fee-card protocol">
                  <div className="fee-card-info">
                    <span className="fee-type">Protocol Fee</span>
                    <span className="fee-amount">{isLoadingDetails ? "..." : (poolDetails?.protocolFeesA || "0")}</span>
                  </div>
                  <button
                    className="collect-action-btn"
                    onClick={() => handleCollectFees('p', 'A')}
                    disabled={isCollecting !== null || isLoadingDetails || !poolDetails || poolDetails.protocolFeesA === "0" || poolDetails.protocolFeesA === "0.00"}
                  >
                    {isCollecting === 'pA' ? <div className="refresh-spinner-small"></div> : "Collect"}
                  </button>
                </div>

                <div className="fee-card fund">
                  <div className="fee-card-info">
                    <span className="fee-type">Fund Fee</span>
                    <span className="fee-amount">{isLoadingDetails ? "..." : (poolDetails?.fundFeesA || "0")}</span>
                  </div>
                  <button
                    className="collect-action-btn"
                    onClick={() => handleCollectFees('f', 'A')}
                    disabled={isCollecting !== null || isLoadingDetails || !poolDetails || poolDetails.fundFeesA === "0" || poolDetails.fundFeesA === "0.00"}
                  >
                    {isCollecting === 'fA' ? <div className="refresh-spinner-small"></div> : "Collect"}
                  </button>
                </div>
              </div>

              {/* Token B Box */}
              <div className="details-box">
                <div className="box-header">
                  <div className={`token-icon ${selectedPoolForDetails.tokenB.symbol.toLowerCase()}`}>
                    {selectedPoolForDetails.tokenB.symbol[0]}
                  </div>
                  <h2 className="box-title">{selectedPoolForDetails.tokenB.symbol}</h2>
                </div>

                <div className="fee-card protocol">
                  <div className="fee-card-info">
                    <span className="fee-type">Protocol Fee</span>
                    <span className="fee-amount">{isLoadingDetails ? "..." : (poolDetails?.protocolFeesB || "0")}</span>
                  </div>
                  <button
                    className="collect-action-btn"
                    onClick={() => handleCollectFees('p', 'B')}
                    disabled={isCollecting !== null || isLoadingDetails || !poolDetails || poolDetails.protocolFeesB === "0" || poolDetails.protocolFeesB === "0.00"}
                  >
                    {isCollecting === 'pB' ? <div className="refresh-spinner-small"></div> : "Collect"}
                  </button>
                </div>

                <div className="fee-card fund">
                  <div className="fee-card-info">
                    <span className="fee-type">Fund Fee</span>
                    <span className="fee-amount">{isLoadingDetails ? "..." : (poolDetails?.fundFeesB || "0")}</span>
                  </div>
                  <button
                    className="collect-action-btn"
                    onClick={() => handleCollectFees('f', 'B')}
                    disabled={isCollecting !== null || isLoadingDetails || !poolDetails || poolDetails.fundFeesB === "0" || poolDetails.fundFeesB === "0.00"}
                  >
                    {isCollecting === 'fB' ? <div className="refresh-spinner-small"></div> : "Collect"}
                  </button>
                </div>
              </div>
            </div>

            <div className="details-footer">
              <button className="refresh-details-btn" onClick={() => handleFetchPoolDetails(selectedPoolForDetails)}>
                Refresh Data
              </button>
              <button className="back-to-main-btn" onClick={() => setShowDetailsModal(false)}>
                Close Details
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
        .admin-page {
          position: relative;
          min-height: calc(100vh - 100px);
          padding: 40px;
          padding-bottom: 100px;
          max-width: 1100px;
          margin: 0 auto;
        }
        .admin-controls-header {
          display: flex;
          flex-direction: column;
          gap: 20px;
          margin-bottom: 30px;
          text-align: left;
        }
        .config-row {
          display: flex;
          align-items: center;
          gap: 12px;
          justify-content: flex-start;
          padding-left: 10px;
        }
        .config-label {
          font-size: 16px;
          font-weight: 500;
          color: var(--text-secondary);
        }
        .admin-section-title {
          font-size: 20px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
          padding-left: 10px;
        }
        .admin-status-spinner {
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          padding: 4px 8px;
          border-radius: 8px;
          gap: 12px;
          width: 70px;
        }
        .config-spinner {
          margin: 0;
        }
        .admin-click-btn {
          background: var(--bg-surface);
          border: 1px solid var(--accent-teal);
          color: var(--accent-teal);
          padding: 6px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          transition: all 0.2s;
        }
        .admin-click-btn:hover {
          background: rgba(0, 212, 200, 0.1);
        }
        .status-val {
          font-weight: 700;
          font-size: 14px;
          color: var(--accent-teal);
        }
        .spinner-controls {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .spinner-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          padding: 0;
          cursor: pointer;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .spinner-btn:hover {
          color: var(--text-primary);
        }
        .admin-footer-actions {
          margin-top: 40px;
          display: flex;
          justify-content: flex-end;
          padding-bottom: 20px;
        }
        .admin-header-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
          padding-right: 10px;
        }
        .create-config-btn {
          background: rgba(0, 212, 200, 0.1);
          border: 1px solid var(--accent-teal);
          color: var(--accent-teal);
          font-weight: 700;
          font-size: 14px;
          padding: 10px 22px;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .create-config-btn:hover {
          background: rgba(0, 212, 200, 0.2);
          transform: translateY(-1px);
        }
        .create-config-fees-row {
          display: flex;
          gap: 12px;
        }
        .transfer-admin-btn {
          background: #ff4b4b;
          color: white;
          border: none;
          padding: 14px 28px;
          border-radius: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 20px rgba(255, 75, 75, 0.2);
        }
        .transfer-admin-btn:hover {
          transform: translateY(-2px);
          background: #ff3535;
          box-shadow: 0 6px 24px rgba(255, 75, 75, 0.3);
        }
        .admin-table-container {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 16px;
        }
        .admin-table thead th {
          border-bottom: 1px solid var(--border);
          color: var(--text-secondary);
          font-size: 13px;
          background: transparent !important;
        }
        .admin-table td {
          border: none;
          border-bottom: 1px solid var(--border);
        }
        .admin-row:last-child td {
          border-bottom: none;
        }
        .admin-locked-container {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: calc(100vh - 200px);
          padding: 20px;
        }
        .locked-content {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 60px 40px;
          text-align: center;
          max-width: 480px;
          width: 100%;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
        }
        .lock-icon-large {
          font-size: 64px;
          margin-bottom: 24px;
          display: block;
        }
        .locked-content h2 {
          font-size: 28px;
          font-weight: 700;
          margin-bottom: 12px;
          color: var(--text-primary);
        }
        .locked-content p {
          color: var(--text-secondary);
          font-size: 16px;
          margin-bottom: 32px;
          line-height: 1.5;
        }
        .connect-admin-btn {
          width: 100%;
          height: 56px;
          font-size: 18px;
          border-radius: 14px;
        }
        .unauth-address {
          background: var(--bg-surface);
          padding: 12px;
          border-radius: 10px;
          font-family: monospace;
          font-size: 12px;
          color: #ff4b4b;
          word-break: break-all;
          margin-top: 20px;
        }
        .status-edit-container {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .status-confirm-actions {
          display: flex;
          gap: 8px;
        }
        .confirm-btn, .cancel-btn {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 4px 8px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        }
        .confirm-btn:hover {
          border-color: var(--accent-teal);
          background: rgba(0, 212, 200, 0.1);
        }
        .confirm-btn.disabled {
          opacity: 0.5;
          cursor: not-allowed;
          grayscale: 1;
        }
        /* Transfer Admin Modal */
        .transfer-admin-modal {
          background: var(--bg-surface);
          border: 1px solid var(--border-hover);
          border-radius: 20px;
          width: 100%;
          max-width: 500px;
          padding: 32px;
          box-shadow: 0 24px 60px rgba(0,0,0,0.7);
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .transfer-field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .transfer-label {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-secondary);
          text-align: left;
        }
        .transfer-input {
          background: var(--bg-input);
          border: 1px solid var(--border-hover);
          border-radius: 10px;
          padding: 12px 16px;
          font-size: 14px;
          font-family: monospace;
          color: var(--text-primary);
          outline: none;
          transition: border-color 0.2s;
          width: 100%;
        }
        .transfer-input:read-only {
          opacity: 0.7;
          cursor: default;
        }
        .transfer-input:not(:read-only):focus {
          border-color: rgba(0, 212, 200, 0.5);
        }
        .transfer-input-error {
          border-color: rgba(255, 75, 75, 0.6) !important;
        }
        .transfer-invalid-msg {
          font-size: 13px;
          color: #ff4b4b;
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 4px;
          font-style: italic;
        }
        .transfer-confirm-row {
          display: flex;
          justify-content: center;
          margin-top: 8px;
        }
        .transfer-confirm-tooltip-wrapper {
          position: relative;
          display: inline-flex;
        }
        .transfer-confirm-btn {
          background: #ff4b4b;
          color: white;
          font-size: 16px;
          font-weight: 700;
          padding: 12px 48px;
          border-radius: 10px;
          border: none;
          cursor: pointer;
          transition: background 0.2s, opacity 0.2s;
        }
        .transfer-confirm-btn:hover:not(:disabled) {
          background: #ff3535;
        }
        .transfer-confirm-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .transfer-confirm-tooltip {
          visibility: hidden;
          opacity: 0;
          pointer-events: none;
          position: absolute;
          bottom: calc(100% + 12px);
          left: 50%;
          transform: translateX(-50%);
          background: #1a2035;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 12px;
          padding: 12px 16px;
          width: 240px;
          font-size: 13px;
          line-height: 1.5;
          color: var(--text-primary);
          text-align: center;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6);
          white-space: normal;
          transition: opacity 0.18s, visibility 0.18s;
          z-index: 4000;
        }
        .transfer-confirm-tooltip::after {
          content: '';
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border: 7px solid transparent;
          border-top-color: #1a2035;
        }
        .transfer-confirm-tooltip-wrapper:hover .transfer-confirm-tooltip {
          visibility: visible;
          opacity: 1;
        }
      `}} />
    </div>
  );
};
