// ============================================================
// AKE LEDGER — SaleScreen (green button flow, manual/photo path)
// One decision per step, always answerable with a thumb:
//   Step 1: WHICH product?  → photo grid
//   Step 2: HOW MANY?       → giant stepper + pad
//   Step 3: PAID HOW MUCH?  → defaults to full price (1 tap for
//           the 90% case); partial pay auto-flags ONÍGBÈSÈ and
//           requires picking the customer.
//   Step 4: big spoken/visual confirm → save
// ============================================================

import React, { useMemo, useState } from 'react';
import {
  View, Text, Pressable, Image, FlatList, StyleSheet,
} from 'react-native';
import { colors, spacing, radius, touch } from '../ui/theme';
import NumberPad from '../ui/NumberPad';
import { t } from '../i18n/labels';
import type { Language, Product, Customer, ProductUnit } from '../models/types';
import { InputMethod } from '../models/types';
import { recordSale, recordBulkSale } from '../db/ledgerRepository';

type Step = 'PRODUCT' | 'UNIT' | 'BULK' | 'QUANTITY' | 'PAYMENT' | 'CUSTOMER' | 'DONE';

interface Props {
  language: Language;
  userId: string;
  products: Product[];       // active products, photo-first ordering
  customers: Customer[];
  onAddProduct: () => void;  // "+" tile in the grid
  onAddCustomer: () => void; // "+" row in the debtor picker
  onFinished: (txId: string) => void; // navigate home + TTS confirmation
  onCancel: () => void;
}

function naira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}

export default function SaleScreen({
  language: lang, userId, products, customers,
  onAddProduct, onAddCustomer, onFinished, onCancel,
}: Props) {
  const [step, setStep] = useState<Step>('PRODUCT');
  const [product, setProduct] = useState<Product | null>(null);
  const [sellUnit, setSellUnit] = useState<ProductUnit | null>(null);
  const [qty, setQty] = useState(1);
  const [paidStr, setPaidStr] = useState('');       // naira digits typed
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [bulkAmountStr, setBulkAmountStr] = useState(''); // BULK mode money entry

  const unitPriceKobo = sellUnit ? sellUnit.sellingPriceKobo
    : product ? product.sellingPriceKobo : 0;
  const totalKobo = Math.round(unitPriceKobo * qty);
  const paidKobo = paidStr === '' ? totalKobo : parseInt(paidStr || '0', 10) * 100;
  const isDebt = paidKobo < totalKobo;

  // When a product is chosen: BULK → bulk money screen; multi-unit → unit
  // picker; single-unit → straight to quantity.
  const chooseProduct = (p: Product) => {
    setProduct(p);
    if (p.stockMode === 'BULK') { setBulkAmountStr(''); setStep('BULK'); return; }
    const units = p.units ?? [];
    if (units.length > 1) { setSellUnit(null); setStep('UNIT'); }
    else { setSellUnit(units[0] ?? null); setQty(1); setStep('QUANTITY'); }
  };

  const save = () => {
    if (!product) return;
    const tx = recordSale({
      productId: product.id,
      userId,
      quantity: qty,
      amountPaidKobo: paidKobo,
      customerId: customer?.id,
      sellUnitId: sellUnit?.id,
      inputMethod: InputMethod.PHOTO_PICKER,
    });
    onFinished(tx.id);
  };

  const saveBulk = () => {
    if (!product) return;
    const amt = parseInt(bulkAmountStr || '0', 10) * 100;
    if (amt <= 0) return;
    const txId = recordBulkSale(product.id, userId, amt, customer?.id);
    onFinished(txId);
  };

  // ---------- Step 1: photo grid ----------
  if (step === 'PRODUCT') {
    return (
      <View style={styles.screen}>
        <Header title={t(lang, 'btn.money_in')} color={colors.moneyIn} onBack={onCancel} />
        <FlatList
          data={products}
          numColumns={3}
          keyExtractor={p => p.id}
          contentContainerStyle={{ padding: spacing.sm }}
          renderItem={({ item }) => (
            <Pressable
              style={styles.tile}
              onPress={() => chooseProduct(item)}
            >
              {item.photoPath ? (
                <Image source={{ uri: item.photoPath }} style={styles.tileImg} />
              ) : (
                <View style={[styles.tileImg, styles.tileNoImg]}>
                  <Text style={{ fontSize: 34 }}>📦</Text>
                </View>
              )}
              <Text style={styles.tileName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.tilePrice}>{naira(item.sellingPriceKobo)}</Text>
              {item.stockQuantity <= item.lowStockLevel && (
                <Text style={styles.lowStock}>⚠ {t(lang, 'label.low_stock')}</Text>
              )}
            </Pressable>
          )}
          ListFooterComponent={
            <Pressable style={[styles.tile, styles.addTile]} onPress={onAddProduct}>
              <View style={[styles.tileImg, styles.tileNoImg]}>
                <Text style={{ fontSize: 40 }}>＋</Text>
              </View>
              <Text style={styles.tileName}>📷</Text>
            </Pressable>
          }
        />
      </View>
    );
  }

  // ---------- Step 1b: unit picker (multi-unit products) ----------
  if (step === 'UNIT' && product) {
    const units = product.units ?? [];
    return (
      <View style={styles.screen}>
        <Header title={product.name} color={colors.moneyIn} onBack={() => setStep('PRODUCT')} />
        <Text style={styles.unitPrompt}>{t(lang, 'unit.sell_by')}</Text>
        <FlatList
          data={units}
          keyExtractor={u => u.id}
          contentContainerStyle={{ padding: spacing.sm }}
          renderItem={({ item }) => (
            <Pressable
              style={styles.unitRow}
              onPress={() => { setSellUnit(item); setQty(1); setStep('QUANTITY'); }}
            >
              <Text style={styles.unitLabel}>{item.unitLabel}</Text>
              <Text style={styles.unitPrice}>
                ₦{(item.sellingPriceKobo / 100).toLocaleString('en-NG')}
              </Text>
            </Pressable>
          )}
        />
      </View>
    );
  }

  // ---------- Step 1c: BULK money entry (truck of yam) ----------
  if (step === 'BULK' && product) {
    const bulkAmt = parseInt(bulkAmountStr || '0', 10) * 100;
    const recovered = product.bulkRecoveredKobo + bulkAmt;
    const loadProfit = recovered - product.bulkCostKobo;
    return (
      <View style={styles.screen}>
        <Header title={product.name} color={colors.moneyIn} onBack={() => setStep('PRODUCT')} />
        <View style={styles.bulkInfo}>
          <Text style={styles.bulkLine}>
            {t(lang, 'bulk.load_cost')}: ₦{(product.bulkCostKobo / 100).toLocaleString('en-NG')}
          </Text>
          <Text style={styles.bulkLine}>
            {t(lang, 'bulk.recovered')}: ₦{(product.bulkRecoveredKobo / 100).toLocaleString('en-NG')}
          </Text>
          <Text style={[styles.bulkProfit, { color: loadProfit >= 0 ? colors.profit : colors.loss }]}>
            {t(lang, 'bulk.profit')}: {loadProfit < 0 ? '−' : ''}₦{Math.abs(loadProfit / 100).toLocaleString('en-NG')}
          </Text>
        </View>
        <View style={styles.amountBox}>
          <Text style={styles.amountText}>₦{(bulkAmt / 100).toLocaleString('en-NG')}</Text>
        </View>
        <NumberPad
          onKey={d => setBulkAmountStr(s => (s + d).slice(0, 9))}
          onBackspace={() => setBulkAmountStr(s => s.slice(0, -1))}
          doneLabel="✔"
          doneEnabled={bulkAmt > 0}
          onDone={saveBulk}
        />
      </View>
    );
  }

  // ---------- Step 2: quantity ----------
  if (step === 'QUANTITY' && product) {
    return (
      <View style={styles.screen}>
        <Header title={product.name} color={colors.moneyIn}
          onBack={() => setStep((product.units?.length ?? 0) > 1 ? 'UNIT' : 'PRODUCT')} />
        <View style={styles.center}>
          <View style={styles.stepperRow}>
            <BigStep label="−" onPress={() => setQty(q => Math.max(1, q - 1))} />
            <Text style={styles.qtyText}>{qty}</Text>
            <BigStep label="+" onPress={() => setQty(q => q + 1)} />
          </View>
          <Text style={styles.unitText}>{sellUnit?.unitLabel ?? product.unitLabel}</Text>
          <Text style={styles.totalText}>{naira(totalKobo)}</Text>
        </View>
        <BigButton
          label="→"
          color={colors.moneyIn}
          onPress={() => { setPaidStr(''); setStep('PAYMENT'); }}
        />
      </View>
    );
  }

  // ---------- Step 3: payment ----------
  if (step === 'PAYMENT' && product) {
    return (
      <View style={styles.screen}>
        <Header
          title={`${product.name} × ${qty}`}
          color={colors.moneyIn}
          onBack={() => setStep('QUANTITY')}
        />
        <View style={styles.payBox}>
          <Text style={styles.payLabel}>
            {isDebt ? t(lang, 'label.debt') : t(lang, 'label.paid')}
          </Text>
          <Text style={[styles.payValue, isDebt && { color: colors.debtTag }]}>
            {naira(paidKobo)} / {naira(totalKobo)}
          </Text>
          {isDebt && (
            <Text style={styles.debtNote}>
              {t(lang, 'label.debtors')}: {naira(totalKobo - paidKobo)}
            </Text>
          )}
        </View>
        <NumberPad
          onKey={d => setPaidStr(s => (s + d).slice(0, 9))}
          onBackspace={() => setPaidStr(s => s.slice(0, -1))}
          doneLabel={isDebt ? '→ 👤' : '✔'}
          onDone={() => (isDebt ? setStep('CUSTOMER') : save())}
        />
      </View>
    );
  }

  // ---------- Step 3b: pick the debtor (required for debt) ----------
  if (step === 'CUSTOMER') {
    return (
      <View style={styles.screen}>
        <Header title={t(lang, 'label.debtors')} color={colors.moneyOut} onBack={() => setStep('PAYMENT')} />
        <FlatList
          data={customers}
          keyExtractor={c => c.id}
          renderItem={({ item }) => (
            <Pressable
              style={styles.customerRow}
              onPress={() => { setCustomer(item); }}
            >
              <Text style={styles.customerName}>
                {customer?.id === item.id ? '✔ ' : ''}{item.name}
              </Text>
              <Text style={styles.customerPhone}>{item.phoneNumber ?? ''}</Text>
            </Pressable>
          )}
          ListFooterComponent={
            <Pressable style={styles.customerRow} onPress={onAddCustomer}>
              <Text style={[styles.customerName, { color: colors.moneyIn }]}>＋ 👤</Text>
            </Pressable>
          }
        />
        <BigButton
          label="✔"
          color={customer ? colors.moneyIn : colors.disabled}
          onPress={() => customer && save()}
        />
      </View>
    );
  }

  return null;
}

// ---------- small shared pieces ----------

function Header({ title, color, onBack }: { title: string; color: string; onBack: () => void }) {
  return (
    <View style={[styles.header, { backgroundColor: color }]}>
      <Pressable style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backText}>←</Text>
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
    </View>
  );
}

function BigStep({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.stepBtn} onPress={onPress}>
      <Text style={styles.stepText}>{label}</Text>
    </Pressable>
  );
}

function BigButton({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <Pressable style={[styles.bigBtn, { backgroundColor: color }]} onPress={onPress}>
      <Text style={styles.bigBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  unitPrompt: { fontSize: 20, fontWeight: '700', color: colors.inkSoft, textAlign: 'center', paddingVertical: spacing.md },
  unitRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 64, paddingHorizontal: spacing.md, marginHorizontal: spacing.sm, marginVertical: 4, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  unitLabel: { fontSize: 22, fontWeight: '700', color: colors.ink },
  unitPrice: { fontSize: 20, fontWeight: '800', color: colors.moneyIn },
  bulkInfo: { padding: spacing.md, alignItems: 'center' },
  bulkLine: { fontSize: 16, color: colors.inkSoft, marginVertical: 2 },
  bulkProfit: { fontSize: 20, fontWeight: '800', marginTop: 6 },
  amountBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  amountText: { fontSize: 48, fontWeight: '800', color: colors.moneyIn },
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
  },
  backBtn: {
    width: touch.min, height: touch.min - 16,
    alignItems: 'center', justifyContent: 'center',
  },
  backText: { color: colors.white, fontSize: 30, fontWeight: '800' },
  headerTitle: { color: colors.white, fontSize: 24, fontWeight: '800', flex: 1 },

  tile: {
    flex: 1 / 3, margin: 6, borderRadius: radius.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    padding: 8, alignItems: 'center',
  },
  tileImg: { width: touch.gridTile - 24, height: touch.gridTile - 24, borderRadius: radius.sm },
  tileNoImg: { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  tileName: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 6 },
  tilePrice: { fontSize: 14, color: colors.inkSoft },
  lowStock: { fontSize: 11, color: colors.warning, marginTop: 2 },
  addTile: { borderStyle: 'dashed', borderColor: colors.moneyIn, borderWidth: 2, maxWidth: '33%' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  stepBtn: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepText: { fontSize: 44, fontWeight: '800', color: colors.ink },
  qtyText: { fontSize: 72, fontWeight: '800', color: colors.ink, minWidth: 110, textAlign: 'center' },
  unitText: { fontSize: 20, color: colors.inkSoft, marginTop: 4 },
  totalText: { fontSize: 40, fontWeight: '800', color: colors.moneyIn, marginTop: spacing.lg },

  payBox: { alignItems: 'center', paddingVertical: spacing.lg, flex: 1, justifyContent: 'center' },
  payLabel: { fontSize: 20, fontWeight: '700', color: colors.inkSoft },
  payValue: { fontSize: 38, fontWeight: '800', color: colors.moneyIn, marginTop: 6 },
  debtNote: { fontSize: 18, color: colors.debtTag, marginTop: 8, fontWeight: '700' },

  customerRow: {
    minHeight: touch.min, paddingHorizontal: spacing.md,
    justifyContent: 'center', borderBottomWidth: 1, borderColor: colors.border,
  },
  customerName: { fontSize: 20, fontWeight: '700', color: colors.ink },
  customerPhone: { fontSize: 14, color: colors.inkSoft },

  bigBtn: {
    height: touch.min + 8, margin: spacing.md, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  bigBtnText: { color: colors.white, fontSize: 28, fontWeight: '800' },
});
