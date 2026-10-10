import React, {useMemo, useState} from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {Language} from '../models/types';
import {TransactionCategory} from '../models/types';
import {
  LedgerEntry,
  listLedgerEntries,
  reverseLedgerEntry,
} from '../db/ledgerRepository';
import {t} from '../i18n/labels';
import {colors, radius, spacing, touch} from '../ui/theme';

type CategoryFilter = 'ALL' | 'SALE' | 'EXPENSE' | 'RESTOCK' | 'DEBT_PAYMENT';
type DateFilter = 'ALL' | 'TODAY' | 'WEEK';

interface Props {
  language: Language;
  userId: string;
  onBack: () => void;
  onChanged: () => void;
}

function naira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-NG', {maximumFractionDigits: 0})}`;
}

function isInPeriod(value: string, period: DateFilter): boolean {
  if (period === 'ALL') return true;
  const date = new Date(value);
  const now = new Date();
  if (period === 'TODAY') {
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  }
  return date.getTime() >= now.getTime() - 7 * 24 * 60 * 60 * 1000;
}

function categoryLabel(
  language: Language,
  category: TransactionCategory,
): string {
  const keys: Record<string, string> = {
    SALE: 'history.sale',
    EXPENSE: 'history.expense',
    RESTOCK: 'history.restock',
    DEBT_PAYMENT: 'history.debt_payment',
  };
  return t(language, keys[category] ?? 'history.entry');
}

export default function HistoryScreen({
  language,
  userId,
  onBack,
  onChanged,
}: Props) {
  const [entries, setEntries] = useState<LedgerEntry[]>(() =>
    listLedgerEntries(),
  );
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('ALL');
  const [period, setPeriod] = useState<DateFilter>('ALL');
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter(
      entry =>
        (category === 'ALL' || entry.category === category) &&
        isInPeriod(entry.createdAt, period) &&
        (!term ||
          [entry.details, entry.customerName, entry.receiptNumber]
            .filter(Boolean)
            .some(value => String(value).toLowerCase().includes(term))),
    );
  }, [entries, search, category, period]);

  const reverse = (entry: LedgerEntry) => {
    if (entry.isReversed) return;
    Alert.alert(
      t(language, 'history.correct_title'),
      t(language, 'history.correct_note'),
      [
        {text: t(language, 'action.cancel'), style: 'cancel'},
        {
          text: t(language, 'history.reverse'),
          style: 'destructive',
          onPress: () => {
            try {
              reverseLedgerEntry(
                entry.id,
                userId,
                'Corrected from transaction history',
              );
              setEntries(listLedgerEntries());
              onChanged();
              setError('');
            } catch (caught) {
              const code = caught instanceof Error ? caught.message : '';
              setError(
                code === 'REVERSAL_WOULD_NEGATIVE_STOCK'
                  ? t(language, 'history.stock_error')
                  : t(language, 'history.reverse_error'),
              );
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={onBack}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t(language, 'history.title')}</Text>
          <Text style={styles.subtitle}>{t(language, 'history.subtitle')}</Text>
        </View>
      </View>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={t(language, 'history.search')}
        placeholderTextColor={colors.inkSoft}
        style={styles.search}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}>
        {(['ALL', 'TODAY', 'WEEK'] as DateFilter[]).map(item => (
          <Chip
            key={item}
            selected={period === item}
            label={t(language, `history.period_${item.toLowerCase()}`)}
            onPress={() => setPeriod(item)}
          />
        ))}
      </ScrollView>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}>
        {(
          [
            'ALL',
            'SALE',
            'EXPENSE',
            'RESTOCK',
            'DEBT_PAYMENT',
          ] as CategoryFilter[]
        ).map(item => (
          <Chip
            key={item}
            selected={category === item}
            label={
              item === 'ALL'
                ? t(language, 'history.all_types')
                : categoryLabel(language, item as TransactionCategory)
            }
            onPress={() => setCategory(item)}
          />
        ))}
      </ScrollView>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <ScrollView contentContainerStyle={styles.list}>
        {!filtered.length ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📒</Text>
            <Text style={styles.emptyTitle}>
              {t(language, 'history.empty')}
            </Text>
            <Text style={styles.emptyNote}>
              {t(language, 'history.empty_note')}
            </Text>
          </View>
        ) : (
          filtered.map(entry => (
            <View
              key={entry.id}
              style={[styles.card, entry.isReversed && styles.reversedCard]}>
              <View style={styles.cardTop}>
                <View style={styles.categoryWrap}>
                  <View
                    style={[
                      styles.dot,
                      {
                        backgroundColor:
                          entry.type === 'INFLOW'
                            ? colors.moneyIn
                            : colors.moneyOut,
                      },
                    ]}
                  />
                  <Text style={styles.category}>
                    {categoryLabel(language, entry.category)}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.amount,
                    {
                      color:
                        entry.type === 'INFLOW'
                          ? colors.moneyIn
                          : colors.moneyOut,
                    },
                  ]}>
                  {entry.type === 'OUTFLOW' ? '−' : ''}
                  {naira(entry.totalAmountKobo)}
                </Text>
              </View>
              <Text style={styles.details}>{entry.details}</Text>
              {entry.customerName ? (
                <Text style={styles.customer}>👤 {entry.customerName}</Text>
              ) : null}
              {entry.amountPaidKobo < entry.totalAmountKobo ? (
                <Text style={styles.debt}>
                  {t(language, 'history.paid')} {naira(entry.amountPaidKobo)} ·{' '}
                  {t(language, 'sale.balance')}{' '}
                  {naira(entry.totalAmountKobo - entry.amountPaidKobo)}
                </Text>
              ) : null}
              <View style={styles.metaRow}>
                <Text style={styles.meta}>
                  {new Date(entry.createdAt).toLocaleString()}
                </Text>
                <Text style={styles.meta}>
                  {entry.inputMethod.startsWith('VOICE') ? '🎙 ' : ''}
                  {entry.receiptNumber ?? ''}
                </Text>
              </View>
              {entry.isReversed ? (
                <View style={styles.reversedBadge}>
                  <Text style={styles.reversedText}>
                    ↩ {t(language, 'history.reversed')}
                  </Text>
                </View>
              ) : (
                <Pressable
                  style={styles.correctButton}
                  onPress={() => reverse(entry)}>
                  <Text style={styles.correctText}>
                    {t(language, 'history.correct')}
                  </Text>
                </Pressable>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bg},
  header: {
    minHeight: 72,
    backgroundColor: colors.ledger,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  back: {
    width: touch.min,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {color: colors.ink, fontSize: 30, fontWeight: '800'},
  headerText: {flex: 1},
  title: {color: colors.ink, fontSize: 23, fontWeight: '900'},
  subtitle: {color: colors.inkSoft, fontSize: 12, marginTop: 1},
  search: {
    margin: spacing.sm,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.ink,
    paddingHorizontal: spacing.md,
    fontSize: 17,
  },
  chips: {
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  chip: {
    height: 42,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: 21,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {backgroundColor: colors.ink, borderColor: colors.ink},
  chipText: {color: colors.ink, fontSize: 14, fontWeight: '700'},
  chipTextSelected: {color: colors.white},
  list: {padding: spacing.sm, paddingBottom: spacing.xxl},
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  reversedCard: {opacity: 0.62},
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryWrap: {flexDirection: 'row', alignItems: 'center'},
  dot: {width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm},
  category: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.inkSoft,
    textTransform: 'uppercase',
  },
  amount: {fontSize: 21, fontWeight: '900'},
  details: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    marginTop: spacing.sm,
    lineHeight: 24,
  },
  customer: {fontSize: 14, color: colors.inkSoft, marginTop: 4},
  debt: {
    fontSize: 14,
    color: colors.moneyOut,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  meta: {flex: 1, fontSize: 11, color: colors.inkSoft},
  correctButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.moneyOut,
    marginTop: spacing.md,
  },
  correctText: {color: colors.moneyOut, fontSize: 14, fontWeight: '800'},
  reversedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.sm,
    marginTop: spacing.md,
  },
  reversedText: {color: colors.inkSoft, fontSize: 13, fontWeight: '800'},
  empty: {alignItems: 'center', paddingVertical: spacing.xxl},
  emptyIcon: {fontSize: 50},
  emptyTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: colors.ink,
    marginTop: spacing.md,
  },
  emptyNote: {
    fontSize: 15,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: spacing.xs,
    maxWidth: 290,
  },
  error: {
    color: colors.moneyOut,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    padding: spacing.sm,
  },
});
