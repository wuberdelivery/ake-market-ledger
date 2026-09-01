// ============================================================
// AKE LEDGER — SummaryScreen (weekly / monthly / yearly)
// Tap a period, see the honest numbers for it. Net profit here
// subtracts the fixed-cost burden for the days in the range, so
// "this month you really made X" is TRUE, not gross.
// ============================================================

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { colors, spacing, radius, touch } from '../ui/theme';
import { t } from '../i18n/labels';
import type { Language } from '../models/types';
import { getDb } from '../db/database';

type Period = 'today' | 'week' | 'month' | 'year';

interface Props {
  language: Language;
  onBack: () => void;
  onShare: (summary: PeriodData) => void;
}

export interface PeriodData {
  label: string;
  cashInKobo: number;
  expensesKobo: number;
  grossProfitKobo: number;
  fixedKobo: number;
  netProfitKobo: number;
  salesCount: number;
  days: number;
}

function naira(kobo: number): string {
  const sign = kobo < 0 ? '−' : '';
  return `${sign}₦${Math.abs(Math.round(kobo / 100)).toLocaleString('en-NG')}`;
}

// Sum of amortized fixed-cost burden per day (kobo/day)
function fixedDailyKobo(): number {
  const r = getDb().execute(`SELECT IFNULL(SUM(daily_kobo),0) AS d FROM v_fixed_cost_daily`);
  return r.rows?.length ? r.rows.item(0).d : 0;
}

function loadPeriod(period: Period): PeriodData {
  const db = getDb();
  let row: any = null;
  let days = 1;
  let label = '';

  if (period === 'today') {
    const r = db.execute(
      `SELECT * FROM v_daily_net_profit WHERE day = DATE('now','localtime')`
    );
    if (r.rows?.length) {
      const x = r.rows.item(0);
      return {
        label: 'today',
        cashInKobo: x.cash_in_kobo, expensesKobo: x.variable_expenses_kobo,
        grossProfitKobo: x.gross_profit_kobo, fixedKobo: x.fixed_daily_kobo,
        netProfitKobo: x.net_profit_kobo, salesCount: x.sales_count, days: 1,
      };
    }
    return { label: 'today', cashInKobo: 0, expensesKobo: 0, grossProfitKobo: 0, fixedKobo: fixedDailyKobo(), netProfitKobo: -fixedDailyKobo(), salesCount: 0, days: 1 };
  }

  const view = period === 'week' ? 'v_weekly_summary'
             : period === 'month' ? 'v_monthly_summary'
             : 'v_yearly_summary';
  const keyCol = period === 'week' ? 'week' : period === 'month' ? 'month' : 'year';
  const keyExpr = period === 'week' ? `strftime('%Y-%W','now','localtime')`
                : period === 'month' ? `strftime('%Y-%m','now','localtime')`
                : `strftime('%Y','now','localtime')`;

  const r = db.execute(`SELECT * FROM ${view} WHERE ${keyCol} = ${keyExpr}`);
  if (r.rows?.length) row = r.rows.item(0);

  if (!row) {
    return { label: period, cashInKobo: 0, expensesKobo: 0, grossProfitKobo: 0, fixedKobo: 0, netProfitKobo: 0, salesCount: 0, days: 0 };
  }

  // count days elapsed in the period so far for the fixed-cost multiply
  const dr = db.execute(
    `SELECT CAST(julianday('now','localtime') - julianday(?) AS INTEGER)+1 AS d`,
    [row.from_day]
  );
  days = dr.rows?.length ? Math.max(1, dr.rows.item(0).d) : 1;
  const fixed = fixedDailyKobo() * days;

  return {
    label: period,
    cashInKobo: row.cash_in_kobo,
    expensesKobo: row.expenses_kobo,
    grossProfitKobo: row.gross_profit_kobo,
    fixedKobo: fixed,
    netProfitKobo: row.net_before_fixed_kobo - fixed,
    salesCount: row.sales_count,
    days,
  };
}

export default function SummaryScreen({ language: lang, onBack, onShare }: Props) {
  const [period, setPeriod] = useState<Period>('week');
  const data = loadPeriod(period);

  const periods: { key: Period; label: string }[] = [
    { key: 'today', label: t(lang, 'label.today') },
    { key: 'week', label: t(lang, 'label.this_week') },
    { key: 'month', label: t(lang, 'label.this_month') },
    { key: 'year', label: t(lang, 'label.this_year') },
  ];

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { backgroundColor: colors.ledger }]}>
        <Pressable style={styles.backBtn} onPress={onBack}>
          <Text style={[styles.backText, { color: colors.ink }]}>←</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.ink }]}>{t(lang, 'summary.title')}</Text>
      </View>

      {/* period tabs */}
      <View style={styles.tabs}>
        {periods.map(p => (
          <Pressable
            key={p.key}
            style={[styles.tab, period === p.key && styles.tabActive]}
            onPress={() => setPeriod(p.key)}
          >
            <Text style={[styles.tabText, period === p.key && styles.tabTextActive]}>
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <View style={styles.card}>
          <Row label={t(lang, 'label.sales_today')} value={naira(data.cashInKobo)} />
          <Row label={t(lang, 'label.gross_profit')} value={naira(data.grossProfitKobo)} />
          <Row label={`− ${t(lang, 'btn.money_out')}`} value={naira(-data.expensesKobo)} muted />
          <Row label={`− ${t(lang, 'label.fixed_costs')}`} value={naira(-data.fixedKobo)} muted />
          <View style={styles.divider} />
          <View style={styles.netRow}>
            <Text style={styles.netLabel}>{t(lang, 'label.net_profit')}</Text>
            <Text style={[styles.netValue, { color: data.netProfitKobo < 0 ? colors.loss : colors.profit }]}>
              {naira(data.netProfitKobo)}
            </Text>
          </View>
          <Text style={styles.salesCount}>
            {data.salesCount} {t(lang, 'label.sales_today').toLowerCase()} · {data.days} {t(lang, 'label.today').toLowerCase()}
          </Text>
        </View>

        <Pressable style={styles.shareBtn} onPress={() => onShare(data)}>
          <Text style={styles.shareText}>📤 {t(lang, 'share.receipt')}</Text>
        </Pressable>
      </ScrollView>
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
  header: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  backBtn: { width: touch.min, height: touch.min - 16, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 30, fontWeight: '800' },
  headerTitle: { fontSize: 24, fontWeight: '800', flex: 1 },

  tabs: { flexDirection: 'row', padding: spacing.sm, gap: 6 },
  tab: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  tabActive: { backgroundColor: colors.ledger, borderColor: colors.ledger },
  tabText: { fontSize: 14, fontWeight: '700', color: colors.inkSoft },
  tabTextActive: { color: colors.ink },

  card: { padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { fontSize: 17, color: colors.ink },
  rowValue: { fontSize: 17, fontWeight: '700', color: colors.ink },
  divider: { height: 2, backgroundColor: colors.border, marginVertical: spacing.sm },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  netLabel: { fontSize: 20, fontWeight: '800', color: colors.ink },
  netValue: { fontSize: 34, fontWeight: '800' },
  salesCount: { fontSize: 13, color: colors.inkSoft, marginTop: spacing.sm, textAlign: 'center' },

  shareBtn: { marginTop: spacing.lg, height: touch.min, borderRadius: radius.md, backgroundColor: colors.moneyIn, alignItems: 'center', justifyContent: 'center' },
  shareText: { color: colors.white, fontSize: 20, fontWeight: '800' },
});
