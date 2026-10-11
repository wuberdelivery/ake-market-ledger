import React, {useMemo, useState} from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {Language, Product} from '../models/types';
import {t} from '../i18n/labels';
import {colors, radius, spacing, touch} from '../ui/theme';

interface Props {
  language: Language;
  products: Product[];
  onAddProduct: () => void;
  onRestock: () => void;
  onBack: () => void;
}

function naira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-NG', {maximumFractionDigits: 0})}`;
}

export default function InventoryScreen({
  language,
  products,
  onAddProduct,
  onRestock,
  onBack,
}: Props) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter(
      product =>
        !term ||
        product.name.toLowerCase().includes(term) ||
        product.voiceAliases.some(alias => alias.toLowerCase().includes(term)),
    );
  }, [products, search]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{t(language, 'inventory.title')}</Text>
          <Text style={styles.subtitle}>
            {t(language, 'inventory.subtitle')}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.addButton} onPress={onAddProduct}>
          <Text style={styles.addButtonText}>
            + {t(language, 'inventory.new_item')}
          </Text>
        </Pressable>
        <Pressable style={styles.restockButton} onPress={onRestock}>
          <Text style={styles.restockText}>
            ↥ {t(language, 'restock.title')}
          </Text>
        </Pressable>
      </View>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={t(language, 'inventory.search')}
        placeholderTextColor={colors.inkSoft}
        style={styles.search}
      />

      <ScrollView contentContainerStyle={styles.list}>
        {!filtered.length ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyTitle}>
              {t(language, 'inventory.empty')}
            </Text>
            <Text style={styles.emptyNote}>
              {t(language, 'inventory.empty_note')}
            </Text>
            <Pressable style={styles.emptyButton} onPress={onAddProduct}>
              <Text style={styles.emptyButtonText}>
                + {t(language, 'inventory.new_item')}
              </Text>
            </Pressable>
          </View>
        ) : (
          filtered.map(product => {
            const low =
              product.stockMode === 'COUNTED' &&
              product.stockQuantity <= product.lowStockLevel;
            return (
              <View key={product.id} style={styles.card}>
                {product.photoPath ? (
                  <Image
                    source={{uri: product.photoPath}}
                    style={styles.image}
                  />
                ) : (
                  <View style={[styles.image, styles.noImage]}>
                    <Text style={styles.boxIcon}>📦</Text>
                  </View>
                )}
                <View style={styles.cardCopy}>
                  <Text style={styles.name}>{product.name}</Text>
                  {product.stockMode === 'BULK' ? (
                    <Text style={styles.meta}>
                      {t(language, 'mode.bulk')} ·{' '}
                      {t(language, 'bulk.recovered')}{' '}
                      {naira(product.bulkRecoveredKobo)}
                    </Text>
                  ) : (
                    <Text style={[styles.stock, low && styles.lowStock]}>
                      {product.stockQuantity.toLocaleString('en-NG', {
                        maximumFractionDigits: 3,
                      })}{' '}
                      {product.baseUnit}
                      {low ? ` · ${t(language, 'label.low_stock')}` : ''}
                    </Text>
                  )}
                  <Text style={styles.meta}>
                    {t(language, 'unit.price_per_unit')}:{' '}
                    {product.sellingPriceKobo > 0
                      ? naira(product.sellingPriceKobo)
                      : t(language, 'inventory.set_at_sale')}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bg},
  header: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.sm,
  },
  backButton: {
    width: touch.min,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {fontSize: 30, color: colors.white, fontWeight: '800'},
  headerCopy: {flex: 1},
  title: {fontSize: 23, color: colors.white, fontWeight: '900'},
  subtitle: {fontSize: 12, color: '#D8D8D8', marginTop: 1},
  actions: {flexDirection: 'row', gap: spacing.sm, padding: spacing.sm},
  addButton: {
    flex: 1,
    minHeight: 60,
    borderRadius: radius.md,
    backgroundColor: colors.moneyIn,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  addButtonText: {
    fontSize: 17,
    color: colors.white,
    fontWeight: '900',
    textAlign: 'center',
  },
  restockButton: {
    flex: 1,
    minHeight: 60,
    borderRadius: radius.md,
    backgroundColor: colors.moneyOut,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  restockText: {
    fontSize: 17,
    color: colors.white,
    fontWeight: '900',
    textAlign: 'center',
  },
  search: {
    minHeight: 52,
    marginHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    fontSize: 17,
    color: colors.ink,
  },
  list: {padding: spacing.sm, paddingBottom: spacing.xxl},
  card: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  image: {width: 72, height: 72, borderRadius: radius.sm},
  noImage: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  boxIcon: {fontSize: 30},
  cardCopy: {flex: 1, marginLeft: spacing.md},
  name: {fontSize: 19, fontWeight: '900', color: colors.ink},
  stock: {fontSize: 16, color: colors.moneyIn, fontWeight: '800', marginTop: 3},
  lowStock: {color: colors.warning},
  meta: {fontSize: 13, color: colors.inkSoft, marginTop: 3},
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.md,
  },
  emptyIcon: {fontSize: 52},
  emptyTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: colors.ink,
    marginTop: spacing.md,
  },
  emptyNote: {
    fontSize: 15,
    color: colors.inkSoft,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: spacing.xs,
  },
  emptyButton: {
    minHeight: 58,
    marginTop: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.moneyIn,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyButtonText: {fontSize: 17, fontWeight: '900', color: colors.white},
});
