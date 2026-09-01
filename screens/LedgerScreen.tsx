// ============================================================
// AKE LEDGER — LedgerScreen (yellow button: Àkọsílẹ̀)
// Two things a trader actually wants to know, nothing else:
//   1. "Am I REALLY making money?" — the honest waterfall:
//      gross → minus today's spends → minus rent/salary share → NET
//   2. "Who is owing me?" — debtors, biggest first, with a
//      one-tap WhatsApp/SMS reminder per person.
// ============================================================

import React from 'react';
import {
  View, Text, Pressable, StyleSheet, SectionList, Linking,
} from 'react-native';
import { colors, spacing, radius, touch } from '../ui/theme';
import { t } from '../i18n/labels';
import type { Language, DailyNetProfit, CustomerDebt } from '../models/types';
import { uuidv4 } from '../models/types';
import { getDb } from '../db/database';

interface Props {
  language: Language;
  today: DailyNetProfit | null;
  debtors: CustomerDebt[];          // from v_customer_debts, sorted desc
  onSummary: () => void;            // open weekly/monthly/yearly summary
  onBack: () => void;
}

function naira(kobo: number): string {
  const sign = kobo < 0 ? '−' : '';
  return `${sign}₦${Math.abs(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}

export default function LedgerScreen({ language: lang, today, debtors, onSummary, onBack }: Props) {
  const sendReminder = (d: CustomerDebt) => {
    if (!d.phoneNumber) return;
    const msg = t(lang, 'reminder.debt_sms', {
      product: '', // per-customer aggregate; keep generic
      amount: naira(d.balanceKobo),
    }).replace('  ', ' ');
    const wa = `whatsapp://send?phone=${d.phoneNumber.replace('+', '')}&text=${encodeURIComponent(msg)}`;
    Linking.canOpenURL(wa).then(ok => {
      if (ok) {
        Linking.openURL(wa);
      } else {
        Linking.openURL(`sms:${d.phoneNumber}?body=${encodeURIComponent(msg)}`);
      }
      // Log the nudge for history
      getDb().execute(
        `INSERT INTO debt_reminders (id, customer_id, channel, balance_kobo, language, sent_at)
         VALUES (?,?,?,?,?,?)`,
        [uuidv4(), d.customerId, ok ? 'WHATSAPP' : 'SMS', d.balanceKobo, lang, new Date().toISOString()]
      );
    });
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { backgroundColor: colors.ledger }]}>
        <Pressable style={styles.backBtn} onPress={onBack}>
          <Text style={[styles.backText, { color: colors.ink }]}>←</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.ink }]}>
          {t(lang, 'btn.ledger')}
        </Text>
        <Pressable style={styles.summaryBtn} onPress={onSummary}>
          <Text style={styles.summaryBtnText}>📊 {t(lang, 'summary.title')}</Text>
        </Pressable>
      </View>

      <SectionList
        sections={[{ title: 'debtors', data: debtors }]}
        keyExtractor={d => d.customerId}
        ListHeaderComponent={
          <View style={styles.card}>
            {/* The honest profit waterfall */}
            <Row label={t(lang, 'label.sales_today')} value={today ? naira(today.cashInKobo) : '—'} />
            <Row label={t(lang, 'label.gross_profit')} value={today ? naira(today.grossProfitKobo) : '—'} />
            <Row
              label={`− ${t(lang, 'btn.money_out')}`}
              value={today ? naira(-today.variableExpensesKobo) : '—'}
              muted
            />
            <Row
              label={`− ${t(lang, 'label.fixed_costs')}`}
              value={today ? naira(-today.fixedDailyKobo) : '—'}
              muted
            />
            <View style={styles.divider} />
            <View style={styles.netRow}>
              <Text style={styles.netLabel}>{t(lang, 'label.net_profit')}</Text>
              <Text
                style={[
                  styles.netValue,
                  { color: today && today.netProfitKobo < 0 ? colors.loss : colors.profit },
                ]}
              >
                {today ? naira(today.netProfitKobo) : '—'}
              </Text>
            </View>
          </View>
        }
        renderSectionHeader={() => (
          <Text style={styles.sectionTitle}>
            {t(lang, 'label.debtors')} ({debtors.length})
          </Text>
        )}
        renderItem={({ item }) => (
          <View style={styles.debtRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.debtName}>{item.customerName}</Text>
              <Text style={styles.debtAmount}>{naira(item.balanceKobo)}</Text>
            </View>
            {item.phoneNumber && (
              <Pressable style={styles.remindBtn} onPress={() => sendReminder(item)}>
                <Text style={styles.remindText}>💬</Text>
              </Pressable>
            )}
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>✔ {t(lang, 'label.paid')}</Text>
        }
      />
    </View>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, muted && { color: colors.inkSoft }]}>{label}</Text>
      <Text style={[styles.rowValue, muted && { color: colors.inkSoft }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
  },
  backBtn: { width: touch.min, height: touch.min - 16, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 30, fontWeight: '800' },
  headerTitle: { fontSize: 24, fontWeight: '800', flex: 1 },
  summaryBtn: { paddingHorizontal: spacing.sm, paddingVertical: 6, backgroundColor: colors.surface, borderRadius: radius.sm },
  summaryBtnText: { fontSize: 14, fontWeight: '700', color: colors.ink },

  card: {
    margin: spacing.md, padding: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { fontSize: 17, color: colors.ink },
  rowValue: { fontSize: 17, fontWeight: '700', color: colors.ink },
  divider: { height: 2, backgroundColor: colors.border, marginVertical: spacing.sm },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  netLabel: { fontSize: 20, fontWeight: '800', color: colors.ink },
  netValue: { fontSize: 34, fontWeight: '800' },

  sectionTitle: {
    fontSize: 18, fontWeight: '800', color: colors.ink,
    paddingHorizontal: spacing.md, paddingTop: spacing.sm,
  },
  debtRow: {
    flexDirection: 'row', alignItems: 'center',
    minHeight: touch.min, paddingHorizontal: spacing.md,
    borderBottomWidth: 1, borderColor: colors.border,
  },
  debtName: { fontSize: 19, fontWeight: '700', color: colors.ink },
  debtAmount: { fontSize: 17, fontWeight: '800', color: colors.debtTag },
  remindBtn: {
    width: touch.min, height: touch.min - 12, borderRadius: radius.sm,
    backgroundColor: colors.moneyIn, alignItems: 'center', justifyContent: 'center',
  },
  remindText: { fontSize: 26 },
  empty: { textAlign: 'center', padding: spacing.xl, fontSize: 20, color: colors.profit, fontWeight: '700' },
});
