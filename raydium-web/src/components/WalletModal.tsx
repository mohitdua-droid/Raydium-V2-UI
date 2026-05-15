import React from 'react';
import { X, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (address: string, walletName: string) => void;
}

declare global {
  interface Window {
    solana?: any;
    ethereum?: any;
  }
}

export const WalletModal: React.FC<WalletModalProps> = ({ isOpen, onClose, onConnect }) => {
  
  const connectPhantom = async () => {
    try {
      const { solana } = window;
      if (solana?.isPhantom) {
        const response = await solana.connect();
        const address = response.publicKey.toString();
        onConnect(address, 'Phantom');
      } else {
        window.open('https://phantom.app/', '_blank');
      }
    } catch (err) {
      console.error("Phantom connection error:", err);
    }
  };

  const connectMetaMask = async () => {
    try {
      const { ethereum } = window;
      if (ethereum) {
        const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
        if (accounts.length > 0) {
          onConnect(accounts[0], 'MetaMask');
        }
      } else {
        window.open('https://metamask.io/', '_blank');
      }
    } catch (err) {
      console.error("MetaMask connection error:", err);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="modal-overlay" onClick={onClose}>
          <motion.div 
            className="modal-content"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Connect Wallet</h2>
              <button className="close-btn" onClick={onClose}>
                <X size={20} />
              </button>
            </div>
            <p className="modal-subtitle">Choose your preferred wallet to continue</p>

            <div className="wallet-list">
              <button className="wallet-item" onClick={connectPhantom}>
                <div className="wallet-icon-container phantom">
                  <img src="/assets/phantom-logo.png" alt="Phantom" width="32" height="32" />
                </div>
                <div className="wallet-info">
                  <span className="wallet-name">Phantom</span>
                  <span className="wallet-desc">Solana's most popular wallet</span>
                </div>
                <ChevronRight size={18} className="arrow" />
              </button>

              <button className="wallet-item" onClick={connectMetaMask}>
                <div className="wallet-icon-container metamask">
                  <img src="/assets/metamask-logo.svg" alt="MetaMask" width="32" height="32" />
                </div>
                <div className="wallet-info">
                  <span className="wallet-name">MetaMask</span>
                  <span className="wallet-desc">Connect via EVM bridge</span>
                </div>
                <ChevronRight size={18} className="arrow" />
              </button>
            </div>

            <p className="modal-footer">
              By connecting, you agree to our <a href="#">Terms of Service</a>
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
