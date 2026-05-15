import React, { useState } from 'react';
import { StyleSheet, View, StatusBar, SafeAreaView } from 'react-native';
import { colors } from './src/theme/colors';
import { Header, TabType } from './src/components/Header';
import { WalletModal } from './src/components/WalletModal';
import { SwapScreen } from './src/screens/SwapScreen';
import { LiquidityScreen } from './src/screens/LiquidityScreen';
import { PortfolioScreen } from './src/screens/PortfolioScreen';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('Swap');
  const [walletModalVisible, setWalletModalVisible] = useState(false);
  const [connectedWallet, setConnectedWallet] = useState<string | null>(null);

  const handleConnectWallet = (walletName: string) => {
    setConnectedWallet(walletName);
    setWalletModalVisible(false);
  };

  const renderScreen = () => {
    switch (activeTab) {
      case 'Swap':
        return <SwapScreen />;
      case 'Liquidity':
        return <LiquidityScreen />;
      case 'Portfolio':
        return <PortfolioScreen />;
      default:
        return <SwapScreen />;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgBase} />
      <SafeAreaView style={styles.safeArea}>
        <Header
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onConnectWallet={() => setWalletModalVisible(true)}
          connectedWallet={connectedWallet}
        />
        <View style={styles.content}>
          {renderScreen()}
        </View>
      </SafeAreaView>

      <WalletModal
        visible={walletModalVisible}
        onClose={() => setWalletModalVisible(false)}
        onConnect={handleConnectWallet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
