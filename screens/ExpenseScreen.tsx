// ============================================================
// AKE LEDGER — ExpenseScreen (red button flow)
// Two taps and a number: WHAT was it? → HOW MUCH? → done.
// Restock is separate (it goes through product picker so stock
// updates) — this screen is for pure money-out expenses.
// ============================================================

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList } from 'react-native';
import { colors, spacing, radius, touch } from '../ui/theme';
import NumberPad from '../ui/NumberPad';
import { t } from '../i18n/labels';
import type { Language } from '../models/types';
import { ExpenseType, InputMethod, TransactionCategory } from '../models/types';
import { recordExpense } from '../db/ledgerRepository';

interface Props {
  language: Language;
  userId: string;
  onFinished: (txId: string) => void;
  onCancel: () => void;
  onRestock: () => void; // route to product picker restock flow
}

const EXPENSE_ICONS: { type: ExpenseType; icon: string }[] = [
  { type: ExpenseType.TRANSPORT, icon: '🚌' },
  { type: ExpenseType.FUEL, icon: '⛽' },
  { type: ExpenseType.FEEDING, icon: '🍲' },
  { type: ExpenseType.LEVY, icon: '🧾' },
  { type: ExpenseType.UTILITIES, icon: '💡' },
  { type: ExpenseType.SALARY, icon: '👷' },
  { type: ExpenseType.RENT, icon: '🏠' },
  { type: ExpenseType.OTHER, icon: '📦' },
];

export default function ExpenseScreen({
  language: lang, userId, onFinished, onCancel, onRestock,
}: Props) {
  const [expType, setExpType] = useState<ExpenseType | null>(null);
  const [amountStr, setAmountStr] = useState('');
  const amountKobo = parseInt(amountStr || '0', 10) * 100;

  const save = () => {
    if (!expType || amountKobo <= 0) return;
    const txId = recordExpense({
      userId,
      totalAmountKobo: amountKobo,
      category: TransactionCategory.EXPENSE,
      expenseType: expType,
      inputMethod: InputMethod.MANUAL,
    });
    onFinished(txId);
  };

  // Step 1: what kind of spend?
  if (!expType) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { backgroundColor: colors.moneyOut }]}>
          <Pressable style={styles.backBtn} onPress={onCancel}>
            <Text style={styles.backText}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{t(lang, 'btn.money_out')}</Text>
        </View>

        <FlatList
          data={EXPENSE_ICONS}
          numColumns={2}
          keyExtractor={e => e.type}
          contentContainerStyle={{ padding: spacing.sm }}
          renderItem={({ item }) => (
            <Pressable style={styles.tile} onPress={() => setExpType(item.type)}>
              <Text style={styles.tileIcon}>{item.icon}</Text>
              <Text style={styles.tileLabel}>{t(lang, `expense.${item.type}`)}</Text>
            </Pressable>
          )}
          ListFooterComponent={
            <Pressable style={[styles.tile, styles.restockTile]} onPress={onRestock}>
              <Text style={styles.tileIcon}>🛒</Text>
              <Text style={styles.tileLabel}>+ Ojà (Restock)</Text>
            </Pressable>
          }
        />
      </View>
    );
  }

  // Step 2: how much?
  return (
    <View style={styles.screen}>
      <View style={[styles.header, { backgroundColor: colors.moneyOut }]}>
        <Pressable style={styles.backBtn} onPress={() => setExpType(null)}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>
          {EXPENSE_ICONS.find(e => e.type === expType)?.icon}{' '}
          {t(lang, `expense.${expType}`)}
        </Text>
      </View>

      <View style={styles.amountBox}>
        <Text style={styles.amountText}>
          ₦{(amountKobo / 100).toLocaleString('en-NG')}
        </Text>
      </View>

      <NumberPad
        onKey={d => setAmountStr(s => (s + d).slice(0, 9))}
        onBackspace={() => setAmountStr(s => s.slice(0, -1))}
        doneLabel="✔"
        doneEnabled={amountKobo > 0}
        onDone={save}
      />
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
  backText: { color: colors.white, fontSize: 30, fontWeight: '800' },
  headerTitle: { color: colors.white, fontSize: 24, fontWeight: '800', flex: 1 },

  tile: {
    flex: 1, margin: 6, borderRadius: radius.md, minHeight: touch.gridTile,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', padding: spacing.sm,
  },
  restockTile: { borderColor: colors.moneyIn, borderWidth: 2 },
  tileIcon: { fontSize: 40 },
  tileLabel: { fontSize: 16, fontWeight: '700', color: colors.ink, marginTop: 6, textAlign: 'center' },

  amountBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  amountText: { fontSize: 52, fontWeight: '800', color: colors.moneyOut },
});
