// ============================================================
// AKE LEDGER — HomeScreen: The Three-Button Rule
// No menus. No settings icon competing for attention.
// Three doors, color-coded, each ~1/4 of the screen tall.
// Long-press green = voice capture (Phase 3 hook).
// ============================================================

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, radius, type, touch } from '../ui/theme';
import { t } from '../i18n/labels';
import type { Language } from '../models/types';

interface Props {
  language: Language;
  todayNetProfitKobo: number | null; // null until first entry today
  role?: 'OWNER' | 'HELPER';         // HELPER never sees profit
  lowStock?: { id: string; name: string }[];
  onSpeakSummary?: () => void;       // end-of-day spoken summary
  onMoneyIn: () => void;             // tap → photo picker sale flow
  onMoneyInVoice: () => void;        // long-press → voice capture
  onMoneyOut: () => void;
  onLedger: () => void;
  onSwitchUser?: () => void;         // helper/owner switch
}

function naira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}

export default function HomeScreen({
  language, todayNetProfitKobo, role = 'OWNER', lowStock = [], onSpeakSummary,
  onMoneyIn, onMoneyInVoice, onMoneyOut, onLedger, onSwitchUser,
}: Props) {
  const lang = language;
  const isHelper = role === 'HELPER';
  return (
    <View style={styles.screen}>
      {/* Low-stock banner (owner only) */}
      {!isHelper && lowStock.length > 0 && (
        <View style={styles.lowStockBanner}>
          <Text style={styles.lowStockText} numberOfLines={1}>
            ⚠ {t(lang, 'lowstock.title')}: {lowStock.map(x => x.name).join(', ')}
          </Text>
        </View>
      )}

      {/* Profit peek — OWNER only. Helpers must not see the oga's numbers. */}
      <View style={styles.peek}>
        {isHelper ? (
          <Pressable style={styles.switchBtn} onPress={onSwitchUser}>
            <Text style={styles.switchText}>🧑‍🔧 {t(lang, 'helper.login')}</Text>
          </Pressable>
        ) : (
          <>
            <Pressable onPress={onSpeakSummary} onLongPress={onSwitchUser}>
              <Text style={styles.peekLabel}>{t(lang, 'label.net_profit')} 🔊</Text>
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
                ]}
              >
                {todayNetProfitKobo == null ? '—' : naira(todayNetProfitKobo)}
              </Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Door 1 — GREEN: money in */}
      <Pressable
        style={({ pressed }) => [
          styles.door,
          { backgroundColor: pressed ? colors.moneyInPressed : colors.moneyIn },
        ]}
        onPress={onMoneyIn}
        onLongPress={onMoneyInVoice}
        delayLongPress={350}
      >
        <Text style={styles.doorIcon}>🟢 ➕</Text>
        <Text style={styles.doorText}>{t(lang, 'btn.money_in')}</Text>
        <Text style={styles.doorHint}>{t(lang, 'prompt.hold_and_speak')} 🎤</Text>
      </Pressable>

      {/* Door 2 — RED: money out */}
      <Pressable
        style={({ pressed }) => [
          styles.door,
          { backgroundColor: pressed ? colors.moneyOutPressed : colors.moneyOut },
        ]}
        onPress={onMoneyOut}
      >
        <Text style={styles.doorIcon}>🔴 ➖</Text>
        <Text style={styles.doorText}>{t(lang, 'btn.money_out')}</Text>
      </Pressable>

      {/* Door 3 — YELLOW: the ledger */}
      <Pressable
        style={({ pressed }) => [
          styles.door,
          { backgroundColor: pressed ? colors.ledgerPressed : colors.ledger },
        ]}
        onPress={onLedger}
      >
        <Text style={styles.doorIcon}>📒</Text>
        <Text style={[styles.doorText, { color: colors.ink }]}>
          {t(lang, 'btn.ledger')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.md,
    gap: spacing.md,
  },
  peek: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  peekLabel: { ...type.label, color: colors.inkSoft },
  peekValue: { ...type.money },
  switchBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  switchText: { fontSize: 16, fontWeight: '700', color: colors.ink },
  lowStockBanner: { backgroundColor: '#FFF3E0', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.warning, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  lowStockText: { fontSize: 14, fontWeight: '700', color: colors.warning },
  door: {
    flex: 1,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touch.bigButton,
    elevation: 3,
  },
  doorIcon: { fontSize: 40, marginBottom: 6 },
  doorText: { fontSize: 30, fontWeight: '800', color: colors.white },
  doorHint: { fontSize: 14, color: '#DFF5E4', marginTop: 6 },
});
