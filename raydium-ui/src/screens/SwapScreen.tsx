import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { colors } from '../theme/colors';
import { LinearGradient } from 'expo-linear-gradient';

export const SwapScreen = () => {
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.tabs}>
            <TouchableOpacity style={styles.activeTab}>
              <Text style={styles.activeTabText}>Buy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.inactiveTab}>
              <Text style={styles.inactiveTabText}>Sell</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.actions}>
            <View style={styles.slippageBadge}>
              <Text style={styles.slippageText}>0.5%</Text>
            </View>
          </View>
        </View>

        {/* From Box */}
        <View style={styles.tokenBox}>
          <View style={styles.tokenBoxHeader}>
            <Text style={styles.labelText}>From</Text>
            <View style={styles.metaBox}>
              <Text style={styles.balanceText}>0</Text>
              <TouchableOpacity style={styles.pill}><Text style={styles.pillText}>Max</Text></TouchableOpacity>
              <TouchableOpacity style={styles.pill}><Text style={styles.pillText}>50%</Text></TouchableOpacity>
            </View>
          </View>
          <View style={styles.tokenRow}>
            <TouchableOpacity style={styles.tokenSelectBtn}>
              <View style={[styles.tokenIcon, { backgroundColor: '#2775CA' }]}>
                <Text style={styles.tokenIconText}>$</Text>
              </View>
              <Text style={styles.tokenSymbol}>USDC</Text>
              <Text style={styles.chevron}>↓</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.amountInput}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={fromAmount}
              onChangeText={setFromAmount}
            />
          </View>
          <Text style={styles.usdValue}>— $0</Text>
        </View>

        {/* Swap Arrow */}
        <View style={styles.arrowContainer}>
          <TouchableOpacity style={styles.arrowBtn}>
            <Text style={styles.arrowIcon}>↓</Text>
          </TouchableOpacity>
        </View>

        {/* To Box */}
        <View style={styles.tokenBox}>
          <View style={styles.tokenBoxHeader}>
            <Text style={styles.labelText}>To</Text>
            <View style={styles.metaBox}>
              <Text style={styles.balanceText}>0</Text>
              <TouchableOpacity style={styles.pill}><Text style={styles.pillText}>Max</Text></TouchableOpacity>
              <TouchableOpacity style={styles.pill}><Text style={styles.pillText}>50%</Text></TouchableOpacity>
            </View>
          </View>
          <View style={styles.tokenRow}>
            <TouchableOpacity style={styles.tokenSelectBtn}>
              <LinearGradient colors={['#00d4c8', '#a78bfa']} style={styles.tokenIcon}>
                <Text style={styles.tokenIconText}>R</Text>
              </LinearGradient>
              <Text style={styles.tokenSymbol}>RAY</Text>
              <Text style={styles.chevron}>↓</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.amountInput}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={toAmount}
              editable={false}
            />
          </View>
          <Text style={styles.usdValue}>— $0</Text>
        </View>

        {/* Connect Wallet CTA */}
        <TouchableOpacity style={styles.ctaBtn}>
          <LinearGradient
            colors={['#00d4c8', '#a78bfa']}
            style={styles.ctaGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={styles.ctaText}>Connect Wallet</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 16,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.bgCard,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.bgInput,
    borderRadius: 8,
    padding: 4,
  },
  activeTab: {
    backgroundColor: colors.bgElevated,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  inactiveTab: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  activeTabText: {
    color: colors.textPrimary,
    fontWeight: 'bold',
    fontSize: 13,
  },
  inactiveTabText: {
    color: colors.textSecondary,
    fontWeight: 'bold',
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  slippageBadge: {
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  slippageText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  tokenBox: {
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
  },
  tokenBoxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  labelText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  metaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  balanceText: {
    color: colors.textMuted,
    fontSize: 11,
  },
  pill: {
    backgroundColor: 'rgba(0,212,200,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0,212,200,0.2)',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  pillText: {
    color: colors.accentTeal,
    fontSize: 10,
    fontWeight: 'bold',
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tokenSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  tokenIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tokenIconText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  tokenSymbol: {
    color: colors.textPrimary,
    fontWeight: 'bold',
    fontSize: 14,
  },
  chevron: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  amountInput: {
    flex: 1,
    textAlign: 'right',
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: 'bold',
    marginLeft: 16,
  },
  usdValue: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'right',
    marginTop: 8,
  },
  arrowContainer: {
    alignItems: 'center',
    marginVertical: 12,
  },
  arrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowIcon: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  ctaBtn: {
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  ctaGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: {
    color: '#0b0e17',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
