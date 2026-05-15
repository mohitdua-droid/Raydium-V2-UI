import { useState, useEffect } from 'react';
import './styles/index.css';
import { Header } from './components/Header';
import type { TabType } from './components/Header';
import { WalletModal } from './components/WalletModal';
import { SwapScreen } from './screens/SwapScreen';
import { LiquidityScreen } from './screens/LiquidityScreen';
import { AdminScreen } from './screens/AdminScreen';
import { PortfolioScreen } from './screens/PortfolioScreen';
import { CheckCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('Swap');
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [connectedWallet, setConnectedWallet] = useState<string | null>(null);
  const [fullAddress, setFullAddress] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ address: string; walletName: string; type: 'connected' | 'disconnected' } | null>(null);
  const [swapParams, setSwapParams] = useState<{ tokenA: string; tokenB: string } | null>(null);

  const handleConnect = (address: string, walletName: string = 'Wallet') => {
    const shortened = `${address.slice(0, 4)}...${address.slice(-4)}`;
    setConnectedWallet(shortened);
    setFullAddress(address);
    setIsWalletModalOpen(false);
    
    // Trigger notification
    setNotification({ address, walletName, type: 'connected' });
  };

  const handleDisconnect = () => {
    if (connectedWallet) {
      setNotification({ address: connectedWallet, walletName: 'Wallet', type: 'disconnected' });
    }
    setConnectedWallet(null);
  };

  const handleSwapFromLiquidity = (tokenA: string, tokenB: string) => {
    setSwapParams({ tokenA, tokenB });
    setActiveTab('Swap');
  };

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const renderScreen = () => {
    switch (activeTab) {
      case 'Swap':
        return (
          <SwapScreen 
            connectedWallet={connectedWallet} 
            fullAddress={fullAddress}
            onConnectWallet={() => setIsWalletModalOpen(true)} 
            initialTokenA={swapParams?.tokenA}
            initialTokenB={swapParams?.tokenB}
          />
        );
      case 'Liquidity':
        return (
          <LiquidityScreen 
            onSwap={handleSwapFromLiquidity} 
            connectedWallet={connectedWallet}
            fullAddress={fullAddress}
            onConnectWallet={() => setIsWalletModalOpen(true)}
          />
        );
      case 'Portfolio':
        return <PortfolioScreen fullAddress={fullAddress} onTabChange={setActiveTab} />;
      case 'Admin':
        return (
          <AdminScreen 
            connectedWallet={connectedWallet}
            fullAddress={fullAddress}
            onConnectWallet={() => setIsWalletModalOpen(true)}
          />
        );
      default:
        return (
          <SwapScreen 
            connectedWallet={connectedWallet} 
            fullAddress={fullAddress}
            onConnectWallet={() => setIsWalletModalOpen(true)} 
          />
        );
    }
  };

  return (
    <div className="app">
      <Header 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        onConnectWallet={() => setIsWalletModalOpen(true)}
        onDisconnectWallet={handleDisconnect}
        connectedWallet={connectedWallet}
      />
      
      <main className="main-content">
        {renderScreen()}
      </main>

      <WalletModal 
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
        onConnect={(addr, name) => handleConnect(addr, name)}
      />

      {/* Notification Pop-up */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            className="connection-notification"
            initial={{ opacity: 0, x: 100, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <motion.div 
              className="notification-header-bar"
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: 3, ease: "linear" }}
            />
            <div className="notification-content">
              <div className="notification-icon-container">
                {notification.type === 'connected' ? (
                  <CheckCircle size={24} color="#00d4c8" />
                ) : (
                  <div className="notification-disconnect-icon">
                    <X size={20} color="#ff4b4b" />
                  </div>
                )}
              </div>
              <div className="notification-text">
                <h3>
                  {notification.type === 'connected' 
                    ? `${notification.walletName} wallet connected` 
                    : 'Wallet disconnected successfully'}
                </h3>
                <p>Wallet</p>
                <div className="notification-address">{notification.address}</div>
              </div>
              <button className="notification-close" onClick={() => setNotification(null)}>
                <X size={20} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
