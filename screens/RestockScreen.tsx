// ============================================================
// AKE LEDGER — RestockScreen (Fi ọjà kún)
// Pick a counted product → how many added → total cost → save.
// Adds stock and logs the purchase cost (RESTOCK, excluded from
// profit since cost-of-goods is charged per sale).
// ============================================================

import React, { useState } from 'react';
import { View, Text, Pressable, Image, FlatList, StyleSheet } from 'react-native';
import { colors, spacing, radius, touch } from '../ui/theme';
import NumberPad from '../ui/NumberPad';
import { t } from '../i18n/labels';
import type { Language, Product } from '../models/types';
import { restockProduct } from '../db/setupRepository';

interface Props {
  language: Language;
  userId: string;
  products: Product[];
  onFinished: () => void;
  onCancel: () => void;
}

type Step = 'PICK' | 'QTY' | 'COST';

export default function RestockScreen({ language: lang, userId, products, onFinished, onCancel }: Props) {
  const [step, setStep] = useState<Step>('PICK');
  const [product, setProduct] = useState<Product | null>(null);
  const [qtyStr, setQtyStr] = useState('');
  const [costStr, setCostStr] = useState('');

  const counted = products.filter(p => p.stockMode === 'COUNTED');

  const save = () => {
    if (!product) return;
    const qty = parseFloat(qtyStr || '0');
    const cost = parseInt(costStr || '0', 10) * 100;
    if (qty <= 0) return;
    restockProduct(product.id, userId, qty, cost);
    onFinished();
  };

  if (step === 'PICK') {
    return (
      <View style={styles.screen}>
        <Header title={t(lang, 'restock.title')} onBack={onCancel} />
        <FlatList
          data={counted}
          numColumns={3}
          keyExtractor={p => p.id}
          contentContainerStyle={{ padding: spacing.sm }}
          renderItem={({ item }) => (
            <Pressable style={styles.tile} onPress={() => { setProduct(item); setQtyStr(''); setStep('QTY'); }}>
              {item.photoPath ? (
                <Image source={{ uri: item.photoPath }} style={styles.tileImg} />
              ) : (
                <View style={[styles.tileImg, styles.tileNoImg]}><Text style={{ fontSize: 34 }}>📦</Text></View>
              )}
              <Text style={styles.tileName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.tileStock}>{item.stockQuantity} {item.baseUnit}</Text>
            </Pressable>
          )}
        />
      </View>
    );
  }

  if (step === 'QTY' && product) {
    return (
      <View style={styles.screen}>
        <Header title={product.name} onBack={() => setStep('PICK')} />
        <View style={styles.amountBox}>
          <Text style={styles.label}>{t(lang, 'restock.title')} ({product.baseUnit})</Text>
          <Text style={styles.amountText}>{qtyStr || '0'}</Text>
        </View>
        <NumberPad
          onKey={d => setQtyStr(s => (s + d).slice(0, 6))}
          onBackspace={() => setQtyStr(s => s.slice(0, -1))}
          doneLabel="→"
          doneEnabled={parseFloat(qtyStr || '0') > 0}
          onDone={() => { setCostStr(''); setStep('COST'); }}
        />
      </View>
    );
  }

  if (step === 'COST' && product) {
    return (
      <View style={styles.screen}>
        <Header title={product.name} onBack={() => setStep('QTY')} />
        <View style={styles.amountBox}>
          <Text style={styles.label}>{lang === 'yo' ? 'Iye tí ẹ fi rà á' : 'Total cost'}</Text>
          <Text style={styles.amountText}>₦{(parseInt(costStr || '0', 10)).toLocaleString('en-NG')}</Text>
        </View>
        <NumberPad
          onKey={d => setCostStr(s => (s + d).slice(0, 9))}
          onBackspace={() => setCostStr(s => s.slice(0, -1))}
          doneLabel="✔"
          onDone={save}
        />
      </View>
    );
  }
  return null;
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={[styles.header, { backgroundColor: colors.moneyOut }]}>
      <Pressable style={styles.backBtn} onPress={onBack}><Text style={styles.backText}>←</Text></Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  backBtn: { width: touch.min, height: touch.min - 16, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.white, fontSize: 30, fontWeight: '800' },
  headerTitle: { color: colors.white, fontSize: 24, fontWeight: '800', flex: 1 },
  tile: { flex: 1 / 3, margin: 6, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 8, alignItems: 'center' },
  tileImg: { width: 80, height: 80, borderRadius: radius.sm },
  tileNoImg: { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  tileName: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 6 },
  tileStock: { fontSize: 13, color: colors.inkSoft },
  amountBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 18, color: colors.inkSoft, marginBottom: spacing.sm },
  amountText: { fontSize: 52, fontWeight: '800', color: colors.moneyOut },
});
