import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, SafeAreaView, Image } from 'react-native';
import { colors } from '../theme/colors';

const phantomLogo = require('../../assets/phantom-logo.png');

interface WalletModalProps {
  visible: boolean;
  onClose: () => void;
  onConnect: (walletName: string) => void;
}

export const WalletModal: React.FC<WalletModalProps> = ({ visible, onClose, onConnect }) => {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Connect Wallet</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>Choose your preferred wallet to continue</Text>

          <View style={styles.walletOptions}>
            <TouchableOpacity 
              style={styles.walletOption}
              onPress={() => onConnect('Phantom')}
            >
              <View style={[styles.iconPlaceholder, { backgroundColor: '#534bb1' }]}>
                <Image source={phantomLogo} style={styles.walletLogo} resizeMode="contain" />
              <Text style={styles.arrow}>→</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.walletOption}
              onPress={() => onConnect('MetaMask')}
            >
              <View style={[styles.iconPlaceholder, { backgroundColor: '#f6851b40', borderColor: '#f6851b', borderWidth: 1 }]}>
                <Text style={styles.iconText}>🦊</Text>
              </View>
              <View style={styles.walletInfo}>
                <Text style={styles.walletName}>MetaMask</Text>
                <Text style={styles.walletDesc}>Connect via EVM bridge</Text>
              </View>
              <Text style={styles.arrow}>→</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footerNote}>
            By connecting, you agree to our <Text style={styles.link}>Terms of Service</Text>
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.bgSurface,
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.borderHover,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  closeText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 24,
  },
  walletOptions: {
    gap: 12,
  },
  walletOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  walletLogo: {
    width: 32,
    height: 32,
  },
  iconText: {
    fontSize: 24,
  },
  walletInfo: {
    flex: 1,
  },
  walletName: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  walletDesc: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  arrow: {
    color: colors.textMuted,
    fontSize: 18,
  },
  footerNote: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
  },
  link: {
    color: colors.accentTeal,
  },
});
