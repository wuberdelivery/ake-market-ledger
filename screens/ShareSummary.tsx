// ============================================================
// AKE LEDGER — ShareSummary.tsx
// Renders a clean branded summary card, captures it as a PNG with
// react-native-view-shot, and opens the system share sheet (which
// includes WhatsApp). Doubles as informal proof-of-income later.
//   npm i react-native-view-shot
// Uses RN's built-in Share (no extra dep needed for sharing).
// ============================================================

import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Share, Platform } from 'react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { colors, spacing, radius } from '../ui/theme';
import { t } from '../i18n/labels';
import type { Language } from '../models/types';
import type { PeriodData } from './SummaryScreen';

interface Props {
  language: Language;
  shopName: string;
  data: PeriodData;
  onDone: () => void;
}

function naira(kobo: number): string {
  const sign = kobo < 0 ? '−' : '';
  return `${sign}₦${Math.abs(Math.round(kobo / 100)).toLocaleString('en-NG')}`;
}

export default function ShareSummary({ language: lang, shopName, data, onDone }: Props) {
  const shotRef = useRef<ViewShot>(null);

  useEffect(() => {
    // Give the view a tick to render, then capture + share
    const timer = setTimeout(share, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const periodLabel =
    data.label === 'today' ? t(lang, 'label.today')
    : data.label === 'week' ? t(lang, 'label.this_week')
    : data.label === 'month' ? t(lang, 'label.this_month')
    : t(lang, 'label.this_year');

  const share = async () => {
    try {
      const uri = await captureRef(shotRef, { format: 'png', quality: 0.95 });
      await Share.share(
        Platform.OS === 'ios'
          ? { url: uri }
          : { url: uri, message: `${shopName} — ${periodLabel}` }
      );
    } catch {
      /* user cancelled or capture failed — no-op */
    } finally {
      onDone();
    }
  };

  return (
    <View style={styles.stage}>
      <ViewShot ref={shotRef} style={styles.card}>
        {/* Brand header */}
        <View style={styles.brandRow}>
          <Text style={styles.brand}>AKE Ledger</Text>
          <Text style={styles.brandSub}>Aje · Kasuwa · Ego</Text>
        </View>

        <Text style={styles.shop}>{shopName}</Text>
        <Text style={styles.period}>{periodLabel}</Text>

        <View style={styles.divider} />

        <Row label={t(lang, 'label.sales_today')} value={naira(data.cashInKobo)} />
        <Row label={t(lang, 'label.gross_profit')} value={naira(data.grossProfitKobo)} />
        <Row label={t(lang, 'btn.money_out')} value={naira(-data.expensesKobo)} muted />
        <Row label={t(lang, 'label.fixed_costs')} value={naira(-data.fixedKobo)} muted />

        <View style={styles.divider} />

        <View style={styles.netRow}>
          <Text style={styles.netLabel}>{t(lang, 'label.net_profit')}</Text>
          <Text style={[styles.netValue, { color: data.netProfitKobo < 0 ? colors.loss : colors.profit }]}>
            {naira(data.netProfitKobo)}
          </Text>
        </View>

        <Text style={styles.footer}>
          {data.salesCount} {t(lang, 'label.sales_today').toLowerCase()}
        </Text>
      </ViewShot>
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
  stage: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: {
    width: 340, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 2, borderColor: colors.ledger,
  },
  brandRow: { alignItems: 'center', marginBottom: spacing.sm },
  brand: { fontSize: 26, fontWeight: '900', color: colors.moneyIn },
  brandSub: { fontSize: 12, color: colors.inkSoft, letterSpacing: 2 },
  shop: { fontSize: 22, fontWeight: '800', color: colors.ink, textAlign: 'center', marginTop: spacing.sm },
  period: { fontSize: 15, color: colors.inkSoft, textAlign: 'center' },
  divider: { height: 2, backgroundColor: colors.border, marginVertical: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  rowLabel: { fontSize: 16, color: colors.ink },
  rowValue: { fontSize: 16, fontWeight: '700', color: colors.ink },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  netLabel: { fontSize: 19, fontWeight: '800', color: colors.ink },
  netValue: { fontSize: 30, fontWeight: '900' },
  footer: { fontSize: 12, color: colors.inkSoft, textAlign: 'center', marginTop: spacing.md },
});
