import React, {useEffect, useMemo, useState} from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {colors, spacing, radius, touch} from '../ui/theme';
import NumberPad from '../ui/NumberPad';
import {t} from '../i18n/labels';
import type {Customer, Language, Product, ProductUnit} from '../models/types';
import {InputMethod} from '../models/types';
import {recordBulkSale, recordSaleBatch} from '../db/ledgerRepository';
import {
  clearSaleDraft,
  loadSaleDraft,
  saveSaleDraft,
} from '../db/saleDraftRepository';
import type {SaleIntent} from '../voice/yorubaIntentParser';

type Step =
  | 'PRODUCT'
  | 'UNIT'
  | 'BULK'
  | 'QUANTITY'
  | 'CART'
  | 'PAYMENT'
  | 'CUSTOMER';

interface CartLine {
  id: string;
  product: Product;
  sellUnit: ProductUnit | null;
  quantity: number;
  unitPriceKobo: number;
}

interface Props {
  language: Language;
  userId: string;
  products: Product[];
  customers: Customer[];
  initialIntent?: SaleIntent | null;
  onAddProduct: () => void;
  onAddCustomer: () => void;
  onFinished: (txId: string) => void;
  onCancel: () => void;
}

function naira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-NG', {maximumFractionDigits: 0})}`;
}

function linePrice(product: Product, unit: ProductUnit | null): number {
  return unit?.sellingPriceKobo ?? product.sellingPriceKobo;
}

function defaultUnit(product: Product): ProductUnit | null {
  return (
    product.units?.find(unit => unit.isDefault) ?? product.units?.[0] ?? null
  );
}

export default function SaleScreen({
  language: lang,
  userId,
  products,
  customers,
  initialIntent,
  onAddProduct,
  onAddCustomer,
  onFinished,
  onCancel,
}: Props) {
  const restored = loadSaleDraft(userId);
  const initialProduct = initialIntent?.productId
    ? products.find(item => item.id === initialIntent.productId) ?? null
    : null;
  const initialCart = initialProduct
    ? [
        {
          id: `voice-${Date.now()}`,
          product: initialProduct,
          sellUnit: defaultUnit(initialProduct),
          quantity: initialIntent?.quantity ?? 1,
          unitPriceKobo: linePrice(initialProduct, defaultUnit(initialProduct)),
        },
      ]
    : (initialIntent ? [] : (restored?.items ?? [])).flatMap(item => {
        const product = products.find(
          candidate => candidate.id === item.productId,
        );
        if (!product || product.stockMode === 'BULK') return [];
        const unit = item.sellUnitId
          ? product.units?.find(
              candidate => candidate.id === item.sellUnitId,
            ) ?? null
          : defaultUnit(product);
        return [
          {
            id: item.id,
            product,
            sellUnit: unit,
            quantity: item.quantity,
            unitPriceKobo: item.unitPriceKobo ?? linePrice(product, unit),
          },
        ];
      });

  const [step, setStep] = useState<Step>(
    initialCart.length ? 'CART' : 'PRODUCT',
  );
  const [cart, setCart] = useState<CartLine[]>(initialCart);
  const [product, setProduct] = useState<Product | null>(null);
  const [sellUnit, setSellUnit] = useState<ProductUnit | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [unitPriceNaira, setUnitPriceNaira] = useState('0');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [paidStr, setPaidStr] = useState(
    initialIntent
      ? initialIntent.amountPaidKobo !== null
        ? String(Math.round(initialIntent.amountPaidKobo / 100))
        : ''
      : restored?.paidNaira ?? '',
  );
  const [customer, setCustomer] = useState<Customer | null>(() =>
    initialIntent
      ? null
      : customers.find(item => item.id === restored?.customerId) ?? null,
  );
  const [bulkAmountStr, setBulkAmountStr] = useState('');
  const [voiceTranscript] = useState<string | null>(
    initialIntent?.transcript ?? restored?.voiceTranscript ?? null,
  );
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const totalKobo = useMemo(
    () =>
      cart.reduce(
        (sum, line) => sum + Math.round(line.quantity * line.unitPriceKobo),
        0,
      ),
    [cart],
  );
  const requestedPaidKobo =
    paidStr === ''
      ? totalKobo
      : Math.max(0, Number.parseInt(paidStr || '0', 10) * 100);
  const paidKobo = Math.min(requestedPaidKobo, totalKobo);
  const isDebt = paidKobo < totalKobo;

  useEffect(() => {
    if (!cart.length && !voiceTranscript) {
      clearSaleDraft(userId);
      return;
    }
    saveSaleDraft(userId, {
      items: cart.map(line => ({
        id: line.id,
        productId: line.product.id,
        sellUnitId: line.sellUnit?.id ?? null,
        quantity: line.quantity,
        unitPriceKobo: line.unitPriceKobo,
      })),
      paidNaira: paidStr,
      customerId: customer?.id ?? null,
      voiceTranscript,
    });
  }, [cart, paidStr, customer, voiceTranscript, userId]);

  const filteredProducts = products.filter(item =>
    item.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const chooseProduct = (chosen: Product) => {
    setError('');
    if (chosen.stockMode === 'BULK') {
      if (cart.length) {
        Alert.alert(
          t(lang, 'sale.bulk_separate'),
          t(lang, 'sale.bulk_separate_note'),
        );
        return;
      }
      setProduct(chosen);
      setBulkAmountStr('');
      setStep('BULK');
      return;
    }
    setProduct(chosen);
    setQuantity(1);
    setEditingId(null);
    const units = chosen.units ?? [];
    if (units.length > 1) {
      setSellUnit(null);
      setStep('UNIT');
    } else {
      const unit = units[0] ?? null;
      setSellUnit(unit);
      setUnitPriceNaira(String(Math.round(linePrice(chosen, unit) / 100)));
      setStep('QUANTITY');
    }
  };

  const chooseUnit = (unit: ProductUnit) => {
    if (!product) return;
    setSellUnit(unit);
    setQuantity(1);
    setUnitPriceNaira(String(Math.round(linePrice(product, unit) / 100)));
    setStep('QUANTITY');
  };

  const addOrUpdateLine = () => {
    if (!product || quantity <= 0) return;
    const unitPriceKobo = Number.parseInt(unitPriceNaira || '0', 10) * 100;
    if (unitPriceKobo <= 0) {
      setError(t(lang, 'sale.price_required'));
      return;
    }
    const line: CartLine = {
      id: editingId ?? `line-${Date.now()}-${Math.random()}`,
      product,
      sellUnit,
      quantity,
      unitPriceKobo,
    };
    setCart(current => {
      if (editingId) {
        return current.map(item => (item.id === editingId ? line : item));
      }
      const duplicate = current.find(
        item =>
          item.product.id === product.id &&
          item.sellUnit?.id === sellUnit?.id &&
          item.unitPriceKobo === unitPriceKobo,
      );
      if (duplicate) {
        return current.map(item =>
          item.id === duplicate.id
            ? {...item, quantity: item.quantity + quantity}
            : item,
        );
      }
      return [...current, line];
    });
    setEditingId(null);
    setProduct(null);
    setStep('CART');
  };

  const editLine = (line: CartLine) => {
    setProduct(line.product);
    setSellUnit(line.sellUnit);
    setQuantity(line.quantity);
    setUnitPriceNaira(String(Math.round(line.unitPriceKobo / 100)));
    setEditingId(line.id);
    setStep('QUANTITY');
  };

  const removeLine = (lineId: string) => {
    setCart(current => current.filter(item => item.id !== lineId));
  };

  const save = () => {
    setError('');
    try {
      const result = recordSaleBatch({
        userId,
        customerId: customer?.id,
        amountPaidKobo: paidKobo,
        inputMethod: voiceTranscript
          ? InputMethod.VOICE_ONLINE
          : InputMethod.PHOTO_PICKER,
        voiceConfidence: initialIntent?.confidence,
        note: voiceTranscript
          ? `Recognized speech: ${voiceTranscript}`
          : undefined,
        items: cart.map(line => ({
          productId: line.product.id,
          sellUnitId: line.sellUnit?.id,
          quantity: line.quantity,
          unitPriceKobo: line.unitPriceKobo,
        })),
      });
      clearSaleDraft(userId);
      onFinished(result.id);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : 'SAVE_FAILED';
      const message =
        code === 'OUT_OF_STOCK'
          ? t(lang, 'label.out_of_stock')
          : code === 'DEBT_REQUIRES_CUSTOMER'
          ? t(lang, 'sale.customer_required')
          : t(lang, 'sale.save_failed');
      setError(message);
    }
  };

  const saveBulk = () => {
    if (!product) return;
    const amountKobo = Number.parseInt(bulkAmountStr || '0', 10) * 100;
    if (amountKobo <= 0) return;
    try {
      const txId = recordBulkSale(product.id, userId, amountKobo, customer?.id);
      clearSaleDraft(userId);
      onFinished(txId);
    } catch {
      setError(t(lang, 'sale.save_failed'));
    }
  };

  const leaveSale = () => {
    if (!cart.length) {
      onCancel();
      return;
    }
    Alert.alert(t(lang, 'sale.keep_draft'), t(lang, 'sale.keep_draft_note'), [
      {
        text: t(lang, 'sale.discard'),
        style: 'destructive',
        onPress: () => {
          clearSaleDraft(userId);
          onCancel();
        },
      },
      {text: t(lang, 'sale.keep_exit'), onPress: onCancel},
      {text: t(lang, 'action.cancel'), style: 'cancel'},
    ]);
  };

  if (step === 'PRODUCT') {
    return (
      <View style={styles.screen}>
        <Header
          title={t(lang, 'sale.add_item')}
          color={colors.moneyIn}
          onBack={() => (cart.length ? setStep('CART') : leaveSale())}
        />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t(lang, 'sale.search_products')}
          placeholderTextColor={colors.inkSoft}
          style={styles.search}
          autoCapitalize="none"
          accessibilityLabel={t(lang, 'sale.search_products')}
        />
        <FlatList
          data={filteredProducts}
          numColumns={3}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.grid}
          ListEmptyComponent={<Empty text={t(lang, 'sale.no_products')} />}
          renderItem={({item}) => (
            <Pressable
              style={styles.tile}
              onPress={() => chooseProduct(item)}
              accessibilityRole="button">
              {item.photoPath ? (
                <Image source={{uri: item.photoPath}} style={styles.tileImg} />
              ) : (
                <View style={[styles.tileImg, styles.tileNoImg]}>
                  <Text style={styles.boxIcon}>📦</Text>
                </View>
              )}
              <Text style={styles.tileName} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={styles.tilePrice}>
                {naira(item.sellingPriceKobo)}
              </Text>
              {item.stockMode !== 'BULK' &&
              item.stockQuantity <= item.lowStockLevel ? (
                <Text style={styles.lowStock}>
                  ⚠ {t(lang, 'label.low_stock')}
                </Text>
              ) : null}
            </Pressable>
          )}
          ListFooterComponent={
            <Pressable
              style={[styles.tile, styles.addTile]}
              onPress={() => {
                saveSaleDraft(userId, {
                  items: cart.map(line => ({
                    id: line.id,
                    productId: line.product.id,
                    sellUnitId: line.sellUnit?.id ?? null,
                    quantity: line.quantity,
                    unitPriceKobo: line.unitPriceKobo,
                  })),
                  paidNaira: paidStr,
                  customerId: customer?.id ?? null,
                  voiceTranscript,
                });
                onAddProduct();
              }}>
              <View style={[styles.tileImg, styles.tileNoImg]}>
                <Text style={styles.addIcon}>＋</Text>
              </View>
              <Text style={styles.tileName}>{t(lang, 'sale.new_product')}</Text>
            </Pressable>
          }
        />
      </View>
    );
  }

  if (step === 'UNIT' && product) {
    return (
      <View style={styles.screen}>
        <Header
          title={product.name}
          color={colors.moneyIn}
          onBack={() => setStep('PRODUCT')}
        />
        <Text style={styles.prompt}>{t(lang, 'unit.sell_by')}</Text>
        <FlatList
          data={product.units ?? []}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listPad}
          renderItem={({item}) => (
            <Pressable style={styles.unitRow} onPress={() => chooseUnit(item)}>
              <Text style={styles.unitLabel}>{item.unitLabel}</Text>
              <Text style={styles.unitPrice}>
                {naira(item.sellingPriceKobo)}
              </Text>
            </Pressable>
          )}
        />
      </View>
    );
  }

  if (step === 'QUANTITY' && product) {
    const itemTotal =
      quantity * Number.parseInt(unitPriceNaira || '0', 10) * 100;
    return (
      <View style={styles.screen}>
        <Header
          title={editingId ? t(lang, 'sale.edit_item') : product.name}
          color={colors.moneyIn}
          onBack={() => setStep(editingId ? 'CART' : 'PRODUCT')}
        />
        <ScrollView
          contentContainerStyle={styles.quantityBody}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.productHero}>{product.name}</Text>
          <View style={styles.stepperRow}>
            <BigStep
              label="−"
              onPress={() => setQuantity(value => Math.max(1, value - 1))}
            />
            <Text style={styles.qtyText}>{quantity}</Text>
            <BigStep
              label="+"
              onPress={() => setQuantity(value => value + 1)}
            />
          </View>
          <Text style={styles.unitText}>
            {sellUnit?.unitLabel ?? product.unitLabel}
          </Text>
          <Text style={styles.fieldLabel}>
            {t(lang, 'unit.price_per_unit')}
          </Text>
          <View style={styles.moneyInputRow}>
            <Text style={styles.nairaPrefix}>₦</Text>
            <TextInput
              value={unitPriceNaira}
              onChangeText={value =>
                setUnitPriceNaira(value.replace(/[^0-9]/g, '').slice(0, 9))
              }
              keyboardType="number-pad"
              selectTextOnFocus
              style={styles.moneyInput}
              accessibilityLabel={t(lang, 'unit.price_per_unit')}
            />
          </View>
          <Text style={styles.itemTotal}>{naira(itemTotal)}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
        <BigButton
          label={
            editingId
              ? t(lang, 'sale.update_item')
              : t(lang, 'sale.add_to_cart')
          }
          color={colors.moneyIn}
          onPress={addOrUpdateLine}
        />
      </View>
    );
  }

  if (step === 'CART') {
    return (
      <View style={styles.screen}>
        <Header
          title={t(lang, 'sale.current_sale')}
          color={colors.moneyIn}
          onBack={leaveSale}
        />
        {voiceTranscript ? (
          <View style={styles.voiceReview}>
            <Text style={styles.reviewLabel}>
              🎙 {t(lang, 'voice.recognized')}
            </Text>
            <Text style={styles.transcript}>“{voiceTranscript}”</Text>
            <Text style={styles.interpreted}>
              {t(lang, 'voice.interpreted')}:{' '}
              {cart.length
                ? cart
                    .map(line => `${line.product.name} × ${line.quantity}`)
                    .join(', ')
                : t(lang, 'voice.not_understood')}
              {' · '}
              {paidStr ? naira(paidKobo) : t(lang, 'sale.full_payment')}
            </Text>
            <Text style={styles.reviewHint}>
              {t(lang, 'voice.review_hint')}
            </Text>
          </View>
        ) : null}
        <ScrollView contentContainerStyle={styles.cartBody}>
          {!cart.length ? (
            <Empty text={t(lang, 'sale.empty_cart')} />
          ) : (
            cart.map(line => (
              <View key={line.id} style={styles.cartRow}>
                <Pressable
                  style={styles.cartMain}
                  onPress={() => editLine(line)}>
                  <Text style={styles.cartName}>{line.product.name}</Text>
                  <Text style={styles.cartMeta}>
                    {line.quantity}{' '}
                    {line.sellUnit?.unitLabel ?? line.product.unitLabel} ×{' '}
                    {naira(line.unitPriceKobo)}
                  </Text>
                  <Text style={styles.editHint}>
                    {t(lang, 'sale.tap_to_edit')}
                  </Text>
                </Pressable>
                <View style={styles.cartRight}>
                  <Text style={styles.cartTotal}>
                    {naira(line.quantity * line.unitPriceKobo)}
                  </Text>
                  <Pressable
                    style={styles.removeBtn}
                    onPress={() => removeLine(line.id)}
                    accessibilityLabel={t(lang, 'sale.remove_item')}>
                    <Text style={styles.removeText}>×</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
          <Pressable
            style={styles.addAnother}
            onPress={() => setStep('PRODUCT')}>
            <Text style={styles.addAnotherText}>
              ＋ {t(lang, 'sale.add_another')}
            </Text>
          </Pressable>
          <View style={styles.receiptTotalRow}>
            <Text style={styles.receiptTotalLabel}>
              {t(lang, 'sale.total')}
            </Text>
            <Text style={styles.receiptTotal}>{naira(totalKobo)}</Text>
          </View>
        </ScrollView>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <BigButton
          label={t(lang, 'sale.review_payment')}
          color={cart.length ? colors.moneyIn : colors.disabled}
          onPress={() => cart.length && setStep('PAYMENT')}
        />
      </View>
    );
  }

  if (step === 'PAYMENT') {
    return (
      <View style={styles.screen}>
        <Header
          title={t(lang, 'sale.payment')}
          color={colors.moneyIn}
          onBack={() => setStep('CART')}
        />
        <View style={styles.payBox}>
          <Text style={styles.payLabel}>
            {isDebt ? t(lang, 'label.debt') : t(lang, 'label.paid')}
          </Text>
          <Text style={[styles.payValue, isDebt && styles.debtColor]}>
            {naira(paidKobo)}
          </Text>
          <Text style={styles.payTotal}>
            {t(lang, 'sale.of_total')} {naira(totalKobo)}
          </Text>
          {isDebt ? (
            <Text style={styles.debtNote}>
              {t(lang, 'sale.balance')}: {naira(totalKobo - paidKobo)}
            </Text>
          ) : null}
          <Pressable style={styles.fullPayBtn} onPress={() => setPaidStr('')}>
            <Text style={styles.fullPayText}>{t(lang, 'sale.pay_full')}</Text>
          </Pressable>
        </View>
        <NumberPad
          onKey={digit => setPaidStr(value => (value + digit).slice(0, 9))}
          onBackspace={() => setPaidStr(value => value.slice(0, -1))}
          doneLabel={isDebt ? '→ 👤' : `✔ ${t(lang, 'action.save')}`}
          onDone={() => (isDebt ? setStep('CUSTOMER') : save())}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }

  if (step === 'CUSTOMER') {
    return (
      <View style={styles.screen}>
        <Header
          title={t(lang, 'sale.choose_customer')}
          color={colors.moneyOut}
          onBack={() => setStep('PAYMENT')}
        />
        <FlatList
          data={customers}
          keyExtractor={item => item.id}
          ListEmptyComponent={<Empty text={t(lang, 'sale.no_customers')} />}
          renderItem={({item}) => (
            <Pressable
              style={[
                styles.customerRow,
                customer?.id === item.id && styles.selectedRow,
              ]}
              onPress={() => setCustomer(item)}>
              <Text style={styles.customerName}>
                {customer?.id === item.id ? '✓ ' : ''}
                {item.name}
              </Text>
              <Text style={styles.customerPhone}>{item.phoneNumber ?? ''}</Text>
            </Pressable>
          )}
          ListFooterComponent={
            <Pressable style={styles.customerRow} onPress={onAddCustomer}>
              <Text style={[styles.customerName, styles.greenText]}>
                ＋ {t(lang, 'sale.new_customer')}
              </Text>
            </Pressable>
          }
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <BigButton
          label={`✔ ${t(lang, 'action.save')}`}
          color={customer ? colors.moneyIn : colors.disabled}
          onPress={() => customer && save()}
        />
      </View>
    );
  }

  if (step === 'BULK' && product) {
    const bulkAmount = Number.parseInt(bulkAmountStr || '0', 10) * 100;
    const loadProfit =
      product.bulkRecoveredKobo + bulkAmount - product.bulkCostKobo;
    return (
      <View style={styles.screen}>
        <Header
          title={product.name}
          color={colors.moneyIn}
          onBack={() => setStep('PRODUCT')}
        />
        <View style={styles.bulkInfo}>
          <Text style={styles.bulkLine}>
            {t(lang, 'bulk.load_cost')}: {naira(product.bulkCostKobo)}
          </Text>
          <Text style={styles.bulkLine}>
            {t(lang, 'bulk.recovered')}: {naira(product.bulkRecoveredKobo)}
          </Text>
          <Text
            style={[
              styles.bulkProfit,
              {color: loadProfit >= 0 ? colors.profit : colors.loss},
            ]}>
            {t(lang, 'bulk.profit')}: {loadProfit < 0 ? '−' : ''}
            {naira(Math.abs(loadProfit))}
          </Text>
        </View>
        <View style={styles.amountBox}>
          <Text style={styles.amountText}>{naira(bulkAmount)}</Text>
        </View>
        <NumberPad
          onKey={digit =>
            setBulkAmountStr(value => (value + digit).slice(0, 9))
          }
          onBackspace={() => setBulkAmountStr(value => value.slice(0, -1))}
          doneLabel="✔"
          doneEnabled={bulkAmount > 0}
          onDone={saveBulk}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }

  return null;
}

function Header({
  title,
  color,
  onBack,
}: {
  title: string;
  color: string;
  onBack: () => void;
}) {
  return (
    <View style={[styles.header, {backgroundColor: color}]}>
      <Pressable
        style={styles.backBtn}
        onPress={onBack}
        accessibilityRole="button">
        <Text style={styles.backText}>←</Text>
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

function BigStep({label, onPress}: {label: string; onPress: () => void}) {
  return (
    <Pressable style={styles.stepBtn} onPress={onPress}>
      <Text style={styles.stepText}>{label}</Text>
    </Pressable>
  );
}

function BigButton({
  label,
  color,
  onPress,
}: {
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.bigBtn, {backgroundColor: color}]}
      onPress={onPress}>
      <Text style={styles.bigBtnText}>{label}</Text>
    </Pressable>
  );
}

function Empty({text}: {text: string}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>🧺</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bg},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    minHeight: 64,
  },
  backBtn: {
    width: touch.min,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {color: colors.white, fontSize: 30, fontWeight: '800'},
  headerTitle: {color: colors.white, fontSize: 23, fontWeight: '800', flex: 1},
  search: {
    margin: spacing.sm,
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 18,
    paddingHorizontal: spacing.md,
  },
  grid: {padding: spacing.xs, paddingBottom: 80},
  tile: {
    flex: 1 / 3,
    minHeight: 142,
    margin: 5,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 7,
    alignItems: 'center',
  },
  tileImg: {width: 76, height: 70, borderRadius: radius.sm},
  tileNoImg: {
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxIcon: {fontSize: 32},
  addIcon: {fontSize: 40, color: colors.moneyIn},
  tileName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    marginTop: 5,
    textAlign: 'center',
  },
  tilePrice: {fontSize: 13, color: colors.inkSoft},
  lowStock: {
    fontSize: 10,
    color: colors.warning,
    marginTop: 2,
    textAlign: 'center',
  },
  addTile: {
    borderStyle: 'dashed',
    borderColor: colors.moneyIn,
    borderWidth: 2,
    maxWidth: '33%',
  },
  prompt: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.inkSoft,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  listPad: {padding: spacing.sm},
  unitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 68,
    paddingHorizontal: spacing.md,
    marginVertical: 5,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unitLabel: {fontSize: 22, fontWeight: '700', color: colors.ink},
  unitPrice: {fontSize: 20, fontWeight: '800', color: colors.moneyIn},
  quantityBody: {
    alignItems: 'center',
    padding: spacing.lg,
    flexGrow: 1,
    justifyContent: 'center',
  },
  productHero: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: spacing.lg,
  },
  stepperRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  stepBtn: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {fontSize: 40, fontWeight: '800', color: colors.ink},
  qtyText: {
    fontSize: 64,
    fontWeight: '800',
    color: colors.ink,
    minWidth: 100,
    textAlign: 'center',
  },
  unitText: {
    fontSize: 18,
    color: colors.inkSoft,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    alignSelf: 'stretch',
    fontSize: 15,
    fontWeight: '700',
    color: colors.inkSoft,
    marginBottom: 5,
  },
  moneyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    width: '100%',
  },
  nairaPrefix: {fontSize: 28, fontWeight: '800', color: colors.ink},
  moneyInput: {
    minHeight: 58,
    flex: 1,
    fontSize: 28,
    fontWeight: '800',
    color: colors.ink,
    paddingHorizontal: spacing.sm,
  },
  itemTotal: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.moneyIn,
    marginTop: spacing.md,
  },
  voiceReview: {
    margin: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.ledger,
    backgroundColor: '#FFF8DD',
  },
  reviewLabel: {fontSize: 15, color: colors.inkSoft, fontWeight: '700'},
  transcript: {
    fontSize: 18,
    color: colors.ink,
    fontWeight: '700',
    marginTop: 4,
  },
  interpreted: {fontSize: 16, color: colors.ink, marginTop: spacing.sm},
  reviewHint: {
    fontSize: 13,
    color: colors.warning,
    marginTop: spacing.sm,
    fontWeight: '700',
  },
  cartBody: {padding: spacing.sm, paddingBottom: spacing.md},
  cartRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    minHeight: 98,
  },
  cartMain: {flex: 1},
  cartName: {fontSize: 19, fontWeight: '800', color: colors.ink},
  cartMeta: {fontSize: 15, color: colors.inkSoft, marginTop: 4},
  editHint: {
    fontSize: 12,
    color: colors.moneyIn,
    marginTop: 5,
    fontWeight: '700',
  },
  cartRight: {alignItems: 'flex-end', justifyContent: 'space-between'},
  cartTotal: {fontSize: 18, fontWeight: '800', color: colors.moneyIn},
  removeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FDECEC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {fontSize: 28, color: colors.moneyOut, lineHeight: 31},
  addAnother: {
    minHeight: 62,
    borderRadius: radius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.moneyIn,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.sm,
  },
  addAnotherText: {fontSize: 18, color: colors.moneyIn, fontWeight: '800'},
  receiptTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  receiptTotalLabel: {fontSize: 20, color: colors.inkSoft, fontWeight: '700'},
  receiptTotal: {fontSize: 30, color: colors.ink, fontWeight: '900'},
  payBox: {
    alignItems: 'center',
    padding: spacing.lg,
    flex: 1,
    justifyContent: 'center',
  },
  payLabel: {fontSize: 19, fontWeight: '700', color: colors.inkSoft},
  payValue: {
    fontSize: 44,
    fontWeight: '900',
    color: colors.moneyIn,
    marginTop: 5,
  },
  payTotal: {fontSize: 18, color: colors.inkSoft, marginTop: 4},
  debtColor: {color: colors.debtTag},
  debtNote: {
    fontSize: 19,
    color: colors.debtTag,
    marginTop: spacing.sm,
    fontWeight: '800',
  },
  fullPayBtn: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    marginTop: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.moneyIn,
  },
  fullPayText: {color: colors.moneyIn, fontWeight: '800', fontSize: 16},
  customerRow: {
    minHeight: touch.min,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  selectedRow: {backgroundColor: '#EAF7ED'},
  customerName: {fontSize: 20, fontWeight: '700', color: colors.ink},
  customerPhone: {fontSize: 14, color: colors.inkSoft},
  greenText: {color: colors.moneyIn},
  bigBtn: {
    minHeight: 68,
    margin: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  bigBtnText: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  error: {
    color: colors.moneyOut,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  empty: {padding: spacing.xl, alignItems: 'center'},
  emptyIcon: {fontSize: 42},
  emptyText: {
    fontSize: 17,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  bulkInfo: {padding: spacing.md, alignItems: 'center'},
  bulkLine: {fontSize: 16, color: colors.inkSoft, marginVertical: 2},
  bulkProfit: {fontSize: 20, fontWeight: '800', marginTop: 6},
  amountBox: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  amountText: {fontSize: 48, fontWeight: '800', color: colors.moneyIn},
});
