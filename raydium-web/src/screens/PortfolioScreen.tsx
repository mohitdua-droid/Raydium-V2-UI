import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { ExternalLink, ChevronRight } from 'lucide-react';
import { Program, AnchorProvider, type Idl } from '@coral-xyz/anchor';
import idl from '../assets/idl/raydium.json';

import { useState, useEffect } from 'react';

interface PortfolioAsset {
  symbol: string;
  mint: string;
  balance: string;
  amountA?: string;
  amountB?: string;
  valueUsd: string;
  percentage: string;
  color?: string;
}

interface PortfolioScreenProps {
  fullAddress?: string | null;
  onTabChange?: (tab: 'Swap' | 'Liquidity' | 'Portfolio' | 'Admin') => void;
}

export const PortfolioScreen: React.FC<PortfolioScreenProps> = ({
  fullAddress,
  onTabChange
}) => {
  const [activeAssetTab, setActiveAssetTab] = useState<'pool' | 'token'>('pool');
  const [poolAssets, setPoolAssets] = useState<PortfolioAsset[]>([]);
  const [tokenAssets, setTokenAssets] = useState<PortfolioAsset[]>([]);
  const [idleAssets, setIdleAssets] = useState<PortfolioAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchPortfolioData = async () => {
    if (!fullAddress) return;
    setIsLoading(true);
    try {
      const connection = new Connection("https://api.devnet.solana.com", "confirmed");
      const provider = new AnchorProvider(connection, (window as any).solana || {}, { commitment: "confirmed" });
      const program = new Program(idl as Idl, provider);

      // 1. Fetch Tokens
      const tokensRes = await fetch('/mintaddresses.json?t=' + Date.now());
      const tokensData = await tokensRes.json();

      // 2. Fetch Pools for LP checks
      const onChainPools = await (program.account as any).poolState.all();

      const colors = ['#a78bfa', '#00d4c8', '#8bb2ff', '#f472b6', '#fbbf24'];

      // Fetch normal token balances
      const tokenBalances = await Promise.all(tokensData.map(async (t: any, idx: number) => {
        let balance = "0";
        try {
          const userAta = getAssociatedTokenAddressSync(new PublicKey(t.mintAddress), new PublicKey(fullAddress));
          const balanceInfo = await connection.getTokenAccountBalance(userAta);
          balance = balanceInfo.value.uiAmountString || "0";
        } catch (e) {
          // No ATA
        }
        return {
          symbol: t.symbol,
          mint: t.mintAddress,
          balance,
          valueUsd: "0",
          percentage: "0",
          color: colors[idx % colors.length]
        };
      }));

      // Fetch LP balances and calculate pool assets
      const lpAssets = await Promise.all(onChainPools.map(async (p: any, idx: number) => {
        const poolAccount = p.account;
        const lpMintStr = poolAccount.lpMint.toBase58();
        const tokenAMintStr = poolAccount.mintA.toBase58();
        const tokenBMintStr = poolAccount.mintB.toBase58();

        let lpBalance = "0";
        let amountA = "0";
        let amountB = "0";

        try {
          const userAta = getAssociatedTokenAddressSync(new PublicKey(lpMintStr), new PublicKey(fullAddress));
          const balanceInfo = await connection.getTokenAccountBalance(userAta);
          lpBalance = balanceInfo.value.uiAmountString || "0";

          if (parseFloat(lpBalance) > 0) {
            const totalLpSupply = poolAccount.lpSupply.toString();

            // Share calculation: (userLp / totalLp) * reserves
            // LP mint decimals is 6 based on the program's initialize_pool instruction
            const share = parseFloat(lpBalance) / (parseInt(totalLpSupply) / 1e6);

            const tokenA = tokensData.find((t: any) => t.mintAddress === tokenAMintStr);
            const tokenB = tokensData.find((t: any) => t.mintAddress === tokenBMintStr);

            amountA = ((parseInt(poolAccount.reserveA.toString()) / Math.pow(10, tokenA?.decimals || 9)) * share).toFixed(2);
            amountB = ((parseInt(poolAccount.reserveB.toString()) / Math.pow(10, tokenB?.decimals || 9)) * share).toFixed(2);
          }
        } catch (e) { }

        const tokenA = tokensData.find((t: any) => t.mintAddress === tokenAMintStr);
        const tokenB = tokensData.find((t: any) => t.mintAddress === tokenBMintStr);

        return {
          symbol: `${tokenA?.symbol || '?'}-${tokenB?.symbol || '?'}`,
          mint: lpMintStr,
          tokenAMint: tokenAMintStr,
          tokenBMint: tokenBMintStr,
          balance: lpBalance,
          amountA,
          amountB,
          valueUsd: "0",
          percentage: "0",
          color: colors[idx % colors.length]
        };
      }));

      // 3. Aggregate token assets from LP positions
      const aggTokenMap = new Map<string, { symbol: string, balance: number, color: string }>();
      lpAssets.forEach((lp: any) => {
        if (parseFloat(lp.balance) > 0) {
          const symA = lp.symbol.split('-')[0];
          const symB = lp.symbol.split('-')[1];

          const curA = aggTokenMap.get(lp.tokenAMint) || { symbol: symA, balance: 0, color: lp.color };
          aggTokenMap.set(lp.tokenAMint, { ...curA, balance: curA.balance + parseFloat(lp.amountA) });

          const curB = aggTokenMap.get(lp.tokenBMint) || { symbol: symB, balance: 0, color: lp.color };
          aggTokenMap.set(lp.tokenBMint, { ...curB, balance: curB.balance + parseFloat(lp.amountB) });
        }
      });

      const aggregatedTokenAssets: PortfolioAsset[] = Array.from(aggTokenMap.entries()).map(([mint, data]) => ({
        symbol: data.symbol,
        mint,
        balance: data.balance.toFixed(2),
        valueUsd: "0",
        percentage: "0",
        color: data.color
      }));

      setIdleAssets(tokenBalances.filter(a => parseFloat(a.balance) > 0));
      setPoolAssets(lpAssets.filter(a => parseFloat(a.balance) > 0));
      setTokenAssets(aggregatedTokenAssets);

    } catch (err) {
      console.error('Error fetching portfolio:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPortfolioData();
  }, [fullAddress]);

  if (!fullAddress) {
    return (
      <div className="portfolio-page">
        <div className="admin-locked-container">
          <div className="locked-content">
            <div className="lock-icon-large">🔒</div>
            <h2>Connect Wallet</h2>
            <p>Please connect your wallet to view your portfolio.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="portfolio-page">
      <div className="liquidity-header-section">
        <div className="header-text">
          <h1 className="gradient-text">My Portfolio</h1>
        </div>
      </div>

      <div className="portfolio-section-label">Wallet Overview</div>

      <div className="portfolio-overview">
        <div className="portfolio-card">
          <div className="portfolio-card-tabs">
            <button
              className={`portfolio-card-tab ${activeAssetTab === 'pool' ? 'active' : ''}`}
              onClick={() => setActiveAssetTab('pool')}
            >
              Assets by pool
            </button>
            <button
              className={`portfolio-card-tab ${activeAssetTab === 'token' ? 'active' : ''}`}
              onClick={() => setActiveAssetTab('token')}
            >
              Assets by token
            </button>
          </div>

          <div className="asset-list">
            {isLoading ? (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px' }}>
                <div className="refresh-spinner-small" style={{ margin: '0 auto 12px' }}></div>
                Loading assets...
              </div>
            ) : (activeAssetTab === 'pool' ? poolAssets : tokenAssets).length > 0 ? (
              (activeAssetTab === 'pool' ? poolAssets : tokenAssets).map((asset) => (
                <div key={asset.mint} className="asset-item">
                  <div className="asset-token-info">
                    <div className="dot" style={{ backgroundColor: asset.color }}></div>
                    <span>{asset.symbol}</span>
                  </div>
                  <div className="asset-values" style={{ display: 'flex', gap: '12px' }}>
                    {activeAssetTab === 'pool' ? (
                      <>
                        <span style={{ width: '120px', textAlign: 'right', fontFamily: 'monospace' }}>{asset.amountA}</span>
                        <span style={{ width: '120px', textAlign: 'right', fontFamily: 'monospace' }}>{asset.amountB}</span>
                      </>
                    ) : (
                      <span style={{ width: '120px', textAlign: 'right', fontFamily: 'monospace' }}>{parseFloat(asset.balance).toFixed(2)}</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px' }}>
                No assets found in pools
              </div>
            )}
          </div>
        </div>

        <div className="portfolio-card">
          <div className="portfolio-card-tabs">
            <span className="portfolio-card-tab active">Idle tokens</span>
          </div>

          <div className="idle-tokens-card">
            <div style={{ flex: 1 }}>
              <div className="asset-list">
                {idleAssets.slice(0, 3).map((asset) => (
                  <div key={asset.mint} className="asset-item">
                    <div className="asset-token-info">
                      <div className={`token-icon-xs ${asset.symbol.toLowerCase()}`} style={{ width: '16px', height: '16px', fontSize: '8px' }}>
                        {asset.symbol[0]}
                      </div>
                      <span style={{ fontWeight: 600 }}>{asset.symbol}</span>
                    </div>
                    <span style={{ fontFamily: 'monospace' }}>{parseFloat(asset.balance).toFixed(2)}</span>
                  </div>
                ))}
                <button
                  className="pools-link-btn"
                  onClick={() => onTabChange?.('Liquidity')}
                >
                  <span>Pools</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="asset-detail-section">
        <div className="portfolio-section-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          Asset Detail
        </div>

        <div className="pools-table-container" style={{ marginTop: '20px' }}>
          <table className="pools-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Balance</th>
                <th>Value</th>
                <th>Type</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tokenAssets.map(asset => (
                <tr key={asset.mint} className="pool-row">
                  <td>
                    <div className="pool-info">
                      <div className={`token-icon-sm ${asset.symbol.toLowerCase()}`}>
                        {asset.symbol[0]}
                      </div>
                      <span className="pool-name-text">{asset.symbol}</span>
                    </div>
                  </td>
                  <td>{parseFloat(asset.balance).toFixed(4)}</td>
                  <td>$0</td>
                  <td><span className="status-badge" style={{ background: 'rgba(167, 139, 250, 0.1)', color: 'var(--accent-purple)' }}>Wallet</span></td>
                  <td><ExternalLink size={16} color="var(--text-muted)" /></td>
                </tr>
              ))}
              {poolAssets.map(asset => (
                <tr key={asset.mint} className="pool-row">
                  <td>
                    <div className="pool-info">
                      <div className="pool-icons" style={{ width: '40px' }}>
                        <div className="token-icon-xs" style={{ background: '#a78bfa' }}>LP</div>
                      </div>
                      <span className="pool-name-text">{asset.symbol}</span>
                    </div>
                  </td>
                  <td>{parseFloat(asset.balance).toFixed(4)}</td>
                  <td>$0</td>
                  <td><span className="status-badge" style={{ background: 'rgba(0, 212, 200, 0.1)', color: 'var(--accent-teal)' }}>Pool</span></td>
                  <td><ExternalLink size={16} color="var(--text-muted)" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        .portfolio-section-label {
          font-size: 18px;
          font-weight: 700;
          margin-top: 40px;
          color: var(--text-primary);
        }
        .pools-link-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          background: rgba(0, 212, 200, 0.1);
          color: var(--accent-teal);
          padding: 4px 10px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          margin-top: 8px;
          width: fit-content;
          border: 1px solid rgba(0, 212, 200, 0.2);
        }
        .pools-link-btn:hover {
          background: rgba(0, 212, 200, 0.2);
        }
        .refresh-spinner-small {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255,255,255,0.1);
          border-top-color: var(--accent-teal);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
      `}} />
    </div>
  );
};
