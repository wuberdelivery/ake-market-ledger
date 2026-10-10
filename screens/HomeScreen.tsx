import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {colors, radius, spacing, touch, type} from '../ui/theme';
import {t} from '../i18n/labels';
import type {Language} from '../models/types';

interface Props {
  language: Language;
  todayNetProfitKobo: number | null;
  role?: 'OWNER' | 'HELPER';
  userName?: string;
  lowStock?: {id: string; name: string}[];
  onSpeakSummary?: () => void;
  onMoneyIn: () => void;
  onMoneyInVoice: () => void;
  onMoneyOut: () => void;
  onLedger: () => void;
  onSettings: () => void;
}

function naira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-NG', {maximumFractionDigits: 0})}`;
}

export default function HomeScreen({
  language,
  todayNetProfitKobo,
  role = 'OWNER',
  userName,
  lowStock = [],
  onSpeakSummary,
  onMoneyIn,
  onMoneyInVoice,
  onMoneyOut,
  onLedger,
  onSettings,
}: Props) {
  const isHelper = role === 'HELPER';
  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <View style={styles.welcome}>
          <Text style={styles.welcomeLabel}>
            {t(language, 'home.signed_in')}
          </Text>
          <Text style={styles.welcomeName} numberOfLines={1}>
            {userName ||
              (isHelper
                ? t(language, 'settings.helper')
                : t(language, 'settings.owner'))}
          </Text>
        </View>
        <Pressable
          style={styles.settingsButton}
          onPress={onSettings}
          accessibilityLabel={t(language, 'settings.title')}>
          <Text style={styles.settingsIcon}>⚙</Text>
        </Pressable>
      </View>

      {!isHelper && lowStock.length > 0 ? (
        <View style={styles.lowStockBanner}>
          <Text style={styles.lowStockText} numberOfLines={1}>
            ⚠ {t(language, 'lowstock.title')}:{' '}
            {lowStock.map(item => item.name).join(', ')}
          </Text>
        </View>
      ) : null}

      <View style={styles.peek}>
        {isHelper ? (
          <Text style={styles.helperNote}>
            {t(language, 'home.helper_note')}
          </Text>
        ) : (
          <Pressable onPress={onSpeakSummary}>
            <Text style={styles.peekLabel}>
              {t(language, 'label.net_profit')} 🔊
            </Text>
            <Text
              style={[
                styles.peekValue,
                {
                  color:
                    todayNetProfitKobo == null
                      ? colors.inkSoft
                      : todayNetProfitKobo >= 0
                        ? colors.profit
                        : colors.loss,
                },
              ]}>
              {todayNetProfitKobo == null ? '—' : naira(todayNetProfitKobo)}
            </Text>
          </Pressable>
        )}
      </View>

      <View style={styles.saleRow}>
        <Pressable
          style={({pressed}) => [
            styles.saleDoor,
            {backgroundColor: pressed ? colors.moneyInPressed : colors.moneyIn},
          ]}
          onPress={onMoneyIn}
          accessibilityRole="button">
          <Text style={styles.saleIcon}>🟢 ➕</Text>
          <Text style={styles.saleText}>{t(language, 'btn.money_in')}</Text>
          <Text style={styles.saleHint}>{t(language, 'sale.tap_items')}</Text>
        </Pressable>
        <Pressable
          style={styles.voiceButton}
          onPress={onMoneyInVoice}
          accessibilityRole="button"
          accessibilityLabel={t(language, 'voice.start')}>
          <View style={styles.micCircle}>
            <Text style={styles.micIcon}>🎤</Text>
          </View>
          <Text style={styles.voiceText}>{t(language, 'voice.start')}</Text>
          <Text style={styles.voiceHint}>{t(language, 'voice.tap_once')}</Text>
        </Pressable>
      </View>

      {!isHelper ? (
        <>
          <Pressable
            style={({pressed}) => [
              styles.door,
              {
                backgroundColor: pressed
                  ? colors.moneyOutPressed
                  : colors.moneyOut,
              },
            ]}
            onPress={onMoneyOut}>
            <Text style={styles.doorIcon}>🔴 ➖</Text>
            <Text style={styles.doorText}>{t(language, 'btn.money_out')}</Text>
          </Pressable>

          <Pressable
            style={({pressed}) => [
              styles.door,
              {backgroundColor: pressed ? colors.ledgerPressed : colors.ledger},
            ]}
            onPress={onLedger}>
            <Text style={styles.doorIcon}>📒</Text>
            <Text style={[styles.doorText, styles.darkText]}>
              {t(language, 'btn.ledger')}
            </Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.helperPrivacy}>
          <Text style={styles.helperPrivacyIcon}>🔒</Text>
          <Text style={styles.helperPrivacyText}>
            {t(language, 'home.helper_privacy')}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  topBar: {flexDirection: 'row', alignItems: 'center', minHeight: 54},
  welcome: {flex: 1},
  welcomeLabel: {fontSize: 12, color: colors.inkSoft},
  welcomeName: {fontSize: 18, fontWeight: '800', color: colors.ink},
  settingsButton: {
    width: touch.min,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIcon: {fontSize: 26, color: colors.ink},
  peek: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
    minHeight: 58,
    justifyContent: 'center',
  },
  peekLabel: {...type.label, color: colors.inkSoft, textAlign: 'center'},
  peekValue: {...type.money, textAlign: 'center', fontSize: 36},
  helperNote: {color: colors.inkSoft, fontSize: 15, textAlign: 'center'},
  lowStockBanner: {
    backgroundColor: '#FFF3E0',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.warning,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  lowStockText: {fontSize: 14, fontWeight: '700', color: colors.warning},
  saleRow: {flex: 1.25, flexDirection: 'row', gap: spacing.sm, minHeight: 150},
  saleDoor: {
    flex: 1.55,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    padding: spacing.sm,
  },
  saleIcon: {fontSize: 34, marginBottom: 5},
  saleText: {
    fontSize: 27,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center',
  },
  saleHint: {fontSize: 12, color: '#DFF5E4', marginTop: 4, textAlign: 'center'},
  voiceButton: {
    flex: 1,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.moneyIn,
    backgroundColor: colors.surface,
    padding: spacing.sm,
  },
  micCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#EAF7ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micIcon: {fontSize: 30},
  voiceText: {
    color: colors.moneyIn,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 7,
    textAlign: 'center',
  },
  voiceHint: {
    color: colors.inkSoft,
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  door: {
    flex: 1,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 112,
    elevation: 3,
  },
  doorIcon: {fontSize: 34, marginBottom: 4},
  doorText: {fontSize: 27, fontWeight: '800', color: colors.white},
  darkText: {color: colors.ink},
  helperPrivacy: {
    flex: 1,
    minHeight: 112,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  helperPrivacyIcon: {fontSize: 26},
  helperPrivacyText: {
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
