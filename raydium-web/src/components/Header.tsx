import React, { useState, useRef, useEffect } from 'react';
import { LogOut, ChevronDown } from 'lucide-react';

export type TabType = 'Swap' | 'Liquidity' | 'Portfolio' | 'Admin';

interface HeaderProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onConnectWallet: () => void;
  onDisconnectWallet: () => void;
  connectedWallet: string | null;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  onConnectWallet,
  onDisconnectWallet,
  connectedWallet
}) => {
  const tabs: TabType[] = ['Swap', 'Liquidity', 'Portfolio', 'Admin'];
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="header">
      <div className="header-left">
        <nav className="nav-tabs">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => onTabChange(tab)}
            >
              {tab === 'Admin' ? 'Admin controls 🔒' : tab}
            </button>
          ))}
        </nav>
      </div>

      <div className="header-right">

        <div className="wallet-container" ref={dropdownRef}>
          <button
            className={`connect-btn ${connectedWallet ? 'connected' : ''}`}
            onClick={connectedWallet ? () => setShowDropdown(!showDropdown) : onConnectWallet}
          >
            {connectedWallet ? (
              <div className="connected-btn-content">
                <span>{connectedWallet}</span>
                <ChevronDown size={14} className={showDropdown ? 'rotate' : ''} />
              </div>
            ) : 'Connect Wallet'}
          </button>

          {connectedWallet && showDropdown && (
            <div className="wallet-dropdown">
              <button className="dropdown-item" onClick={() => {
                onDisconnectWallet();
                setShowDropdown(false);
              }}>
                <LogOut size={16} />
                <span>Disconnect</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
