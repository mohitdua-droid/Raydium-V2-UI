import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '../theme/colors';
import { LinearGradient } from 'expo-linear-gradient';

export type TabType = 'Swap' | 'Liquidity' | 'Portfolio';

interface HeaderProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onConnectWallet: () => void;
  connectedWallet: string | null;
}

export const Header: React.FC<HeaderProps> = ({ 
  activeTab, 
  onTabChange, 
  onConnectWallet,
  connectedWallet 
}) => {
  const tabs: TabType[] = ['Swap', 'Liquidity', 'Portfolio'];

  return (
    <View style={styles.container}>
      <View style={styles.leftSection}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <LinearGradient
              colors={['#00d4c8', '#a78bfa']}
              style={styles.logoGradient}
            >
              <Text style={styles.logoText}>R</Text>
            </LinearGradient>
          </View>
          <Text style={styles.logoSubscript}>test</Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.activeTab]}
              onPress={() => onTabChange(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                {tab}
              </Text>
              {activeTab === tab && (
                <LinearGradient
                  colors={['#00d4c8', '#a78bfa']}
                  style={styles.activeIndicator}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.rightSection}>
        <TouchableOpacity 
          style={[styles.connectBtn, connectedWallet && styles.connectedBtn]}
          onPress={onConnectWallet}
        >
          {connectedWallet ? (
            <Text style={styles.connectedBtnText}>{connectedWallet} Connected</Text>
          ) : (
            <LinearGradient
              colors={['#00d4c8', '#a78bfa']}
              style={styles.connectGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.connectBtnText}>Connect Wallet</Text>
            </LinearGradient>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(11,14,23,0.85)',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    zIndex: 100,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoContainer: {
    position: 'relative',
    marginRight: 24,
  },
  logoCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(0,212,200,0.4)',
    overflow: 'hidden',
  },
  logoGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    color: '#0b0e17',
    fontWeight: 'bold',
    fontSize: 18,
  },
  logoSubscript: {
    position: 'absolute',
    bottom: -4,
    right: -12,
    color: colors.accentTeal,
    fontSize: 10,
    fontWeight: 'bold',
  },
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    position: 'relative',
  },
  activeTab: {
    // Styles for active tab container if needed
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    color: colors.textPrimary,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    width: '60%',
    height: 2,
    borderRadius: 2,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  connectGradient: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  connectBtnText: {
    color: '#0b0e17',
    fontWeight: 'bold',
    fontSize: 14,
  },
  connectedBtn: {
    backgroundColor: 'rgba(0,212,200,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,212,200,0.3)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  connectedBtnText: {
    color: colors.accentTeal,
    fontWeight: 'bold',
    fontSize: 14,
  },
});
