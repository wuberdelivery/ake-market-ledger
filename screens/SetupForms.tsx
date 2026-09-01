// ============================================================
// AKE LEDGER — SetupForms: ProductFormScreen + CustomerFormScreen
// Product photos: captured via react-native-image-picker with
// maxWidth/maxHeight/quality set at capture time, so the saved
// file is ALREADY the ~20KB thumbnail. No separate resize step,
// no full-size photo ever written — storage stays tiny by design.
//   npm i react-native-image-picker
// ============================================================

import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, Image, StyleSheet, ScrollView,
} from 'react-native';
import { launchCamera } from 'react-native-image-picker';
import { colors, spacing, radius, touch } from '../ui/theme';
import { t } from '../i18n/labels';
import type { Language } from '../models/types';
import { createProduct, createCustomer, SellUnitInput } from '../db/setupRepository';

// ------------------------------------------------------------
// Product form
// ------------------------------------------------------------
interface ProductFormProps {
  language: Language;
  onSaved: () => void;
  onCancel: () => void;
}

export function ProductFormScreen({ language: lang, onSaved, onCancel }: ProductFormProps) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [mode, setMode] = useState<'COUNTED' | 'BULK'>('COUNTED');
  // sell units the trader has added (cup, mudu...). Empty = simple 1:1.
  const [units, setUnits] = useState<SellUnitInput[]>([]);
  // unit builder row
  const [uLabel, setULabel] = useState('');
  const [uPerBase, setUPerBase] = useState('');   // how many of this unit fit in ONE base (e.g. 40 cups per bag)
  const [uPrice, setUPrice] = useState('');

  const takePhoto = async () => {
    const res = await launchCamera({
      mediaType: 'photo', maxWidth: 400, maxHeight: 400,
      quality: 0.7, saveToPhotos: false,
    });
    const uri = res.assets?.[0]?.uri;
    if (uri) setPhoto(uri);
  };

  const addUnit = () => {
    const per = parseFloat(uPerBase || '0');   // e.g. 40 cups per bag
    const pr = parseInt(uPrice || '0', 10) * 100;
    if (!uLabel.trim() || per <= 0 || pr <= 0) return;
    setUnits(prev => [...prev, {
      unitLabel: uLabel.trim(),
      basePerUnit: 1 / per,        // 1 cup = 1/40 bag
      sellingPriceKobo: pr,
      isDefault: prev.length === 0,
    }]);
    setULabel(''); setUPerBase(''); setUPrice('');
  };

  const canSave = name.trim().length >= 2 &&
    (mode === 'BULK'
      ? parseInt(cost || '0', 10) > 0
      : parseInt(price || '0', 10) > 0 || units.length > 0);

  const save = () => {
    createProduct({
      name: name.trim(),
      unitLabel: unit.trim() || 'unit',
      costPriceKobo: parseInt(cost || '0', 10) * 100,
      sellingPriceKobo: parseInt(price || '0', 10) * 100,
      stockQuantity: parseFloat(stock || '0'),
      photoPath: photo,
      voiceAliases: [name.trim().toLowerCase()],
      stockMode: mode,
      sellUnits: units.length ? units : undefined,
    });
    onSaved();
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.md }}>
      <Header title={`＋ ${t(lang, 'btn.money_in')} 📦`} onBack={onCancel} />

      <Pressable style={styles.photoBox} onPress={takePhoto}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.photo} />
        ) : (
          <Text style={styles.photoHint}>📷</Text>
        )}
      </Pressable>

      <Field value={name} onChange={setName}
        placeholder={lang === 'yo' ? 'Orúkọ ọjà (f.a. Iresi Derica)' : 'Product name'} />

      {/* stock mode toggle */}
      <View style={styles.modeRow}>
        <Pressable style={[styles.modeBtn, mode === 'COUNTED' && styles.modeActive]}
          onPress={() => setMode('COUNTED')}>
          <Text style={[styles.modeText, mode === 'COUNTED' && styles.modeTextActive]}>
            📦 {t(lang, 'mode.counted')}
          </Text>
        </Pressable>
        <Pressable style={[styles.modeBtn, mode === 'BULK' && styles.modeActive]}
          onPress={() => setMode('BULK')}>
          <Text style={[styles.modeText, mode === 'BULK' && styles.modeTextActive]}>
            💰 {t(lang, 'mode.bulk')}
          </Text>
        </Pressable>
      </View>

      {mode === 'BULK' ? (
        <>
          <Field value={cost} onChange={s => setCost(s.replace(/[^0-9]/g, ''))}
            placeholder={lang === 'yo' ? '₦ Iye ẹrù (load cost)' : `₦ ${t(lang, 'bulk.load_cost')}`} numeric />
          <Text style={styles.hintText}>
            {lang === 'yo' ? 'Ẹ ó máa tẹ owó tí ó bá wọlé nígbà títà' : 'You will log money as it comes in from sales'}
          </Text>
        </>
      ) : (
        <>
          <Field value={unit} onChange={setUnit}
            placeholder={lang === 'yo' ? `${t(lang, 'unit.base')} (apo/carton)` : `${t(lang, 'unit.base')} (bag/carton)`} />
          <Field value={cost} onChange={s => setCost(s.replace(/[^0-9]/g, ''))}
            placeholder={lang === 'yo' ? '₦ Iye tí ẹ fi rà á (per bag)' : '₦ Cost price (per base unit)'} numeric />
          <Field value={stock} onChange={s => setStock(s.replace(/[^0-9.]/g, ''))}
            placeholder={lang === 'yo' ? 'Mélòó ló wà lórí àtẹ?' : 'How many in stock?'} numeric />

          {/* Option 1: simple single price */}
          <Field value={price} onChange={s => setPrice(s.replace(/[^0-9]/g, ''))}
            placeholder={lang === 'yo' ? `₦ Iye títà (per ${unit || 'unit'})` : `₦ Selling price (per ${unit || 'unit'})`} numeric />

          {/* Option 2: break-bulk sell units */}
          <Text style={styles.sectionLabel}>{t(lang, 'unit.sell_by')} ({t(lang, 'unit.add_unit')})</Text>
          {units.map((u, i) => (
            <View key={i} style={styles.unitChip}>
              <Text style={styles.unitChipText}>
                {u.unitLabel} · ₦{(u.sellingPriceKobo / 100).toLocaleString('en-NG')} · {Math.round(1 / u.basePerUnit)}/{unit || 'base'}
              </Text>
              <Pressable onPress={() => setUnits(units.filter((_, j) => j !== i))}>
                <Text style={styles.removeX}>✕</Text>
              </Pressable>
            </View>
          ))}
          <View style={styles.unitBuilder}>
            <Field value={uLabel} onChange={setULabel}
              placeholder={lang === 'yo' ? 'Ìwọ̀n (cup)' : 'Unit (cup)'} />
            <Field value={uPerBase} onChange={s => setUPerBase(s.replace(/[^0-9.]/g, ''))}
              placeholder={lang === 'yo' ? `Mélòó / ${unit || 'apo'}` : `How many per ${unit || 'bag'}`} numeric />
            <Field value={uPrice} onChange={s => setUPrice(s.replace(/[^0-9]/g, ''))}
              placeholder={lang === 'yo' ? '₦ Iye kọ̀ọ̀kan' : '₦ Price each'} numeric />
            <Pressable style={styles.addUnitBtn} onPress={addUnit}>
              <Text style={styles.addUnitText}>＋ {t(lang, 'unit.add_unit')}</Text>
            </Pressable>
          </View>
        </>
      )}

      <Pressable
        style={[styles.saveBtn, !canSave && { backgroundColor: colors.disabled }]}
        disabled={!canSave}
        onPress={save}
      >
        <Text style={styles.saveText}>✔</Text>
      </Pressable>
    </ScrollView>
  );
}

// ------------------------------------------------------------
// Customer form
// ------------------------------------------------------------
interface CustomerFormProps {
  language: Language;
  onSaved: () => void;
  onCancel: () => void;
}

export function CustomerFormScreen({ language: lang, onSaved, onCancel }: CustomerFormProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const save = () => {
    // Normalize common Nigerian formats to E.164 so WhatsApp links work
    let normalized: string | undefined = phone.replace(/[\s-]/g, '');
    if (/^0\d{10}$/.test(normalized)) normalized = `+234${normalized.slice(1)}`;
    else if (/^234\d{10}$/.test(normalized)) normalized = `+${normalized}`;
    else if (normalized === '') normalized = undefined;

    createCustomer(name.trim(), normalized);
    onSaved();
  };

  return (
    <View style={[styles.screen, { padding: spacing.md }]}>
      <Header title={`＋ 👤`} onBack={onCancel} />
      <Field value={name} onChange={setName}
        placeholder={lang === 'yo' ? 'Orúkọ oníbàárà' : 'Customer name'} />
      <Field value={phone} onChange={setPhone}
        placeholder={lang === 'yo' ? 'Nọ́mbà fóònù (08012345678)' : 'Phone (08012345678)'}
        numeric />
      <Pressable
        style={[styles.saveBtn, name.trim().length < 2 && { backgroundColor: colors.disabled }]}
        disabled={name.trim().length < 2}
        onPress={save}
      >
        <Text style={styles.saveText}>✔</Text>
      </Pressable>
    </View>
  );
}

// ------------------------------------------------------------
// shared bits
// ------------------------------------------------------------
function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backText}>←</Text>
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
    </View>
  );
}

function Field({
  value, onChange, placeholder, numeric,
}: { value: string; onChange: (s: string) => void; placeholder: string; numeric?: boolean }) {
  return (
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.inkSoft}
      keyboardType={numeric ? 'numeric' : 'default'}
    />
  );
}

const styles = StyleSheet.create({
  modeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  modeBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, alignItems: 'center' },
  modeActive: { backgroundColor: colors.moneyIn, borderColor: colors.moneyIn },
  modeText: { fontSize: 15, fontWeight: '700', color: colors.ink },
  modeTextActive: { color: colors.white },
  hintText: { fontSize: 13, color: colors.inkSoft, marginBottom: spacing.sm, fontStyle: 'italic' },
  sectionLabel: { fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: spacing.md, marginBottom: spacing.sm },
  unitChip: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bg, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.moneyIn, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: 6 },
  unitChipText: { fontSize: 15, fontWeight: '600', color: colors.ink },
  removeX: { fontSize: 20, color: colors.moneyOut, fontWeight: '800', paddingHorizontal: 8 },
  unitBuilder: { backgroundColor: colors.bg, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
  addUnitBtn: { backgroundColor: colors.ledger, borderRadius: radius.sm, height: touch.min - 12, alignItems: 'center', justifyContent: 'center' },
  addUnitText: { fontSize: 16, fontWeight: '800', color: colors.ink },
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  backBtn: { width: touch.min, height: touch.min - 16, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 30, fontWeight: '800', color: colors.ink },
  headerTitle: { fontSize: 24, fontWeight: '800', color: colors.ink, flex: 1 },

  photoBox: {
    alignSelf: 'center', width: 140, height: 140,
    borderRadius: radius.md, borderWidth: 2, borderColor: colors.border,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  photo: { width: 136, height: 136, borderRadius: radius.md - 2 },
  photoHint: { fontSize: 48 },

  input: {
    borderWidth: 2, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.surface, fontSize: 20, fontWeight: '600',
    color: colors.ink, padding: spacing.md, marginBottom: spacing.sm,
    minHeight: touch.min - 8,
  },
  saveBtn: {
    height: touch.min + 8, borderRadius: radius.md, marginTop: spacing.md,
    backgroundColor: colors.moneyIn, alignItems: 'center', justifyContent: 'center',
  },
  saveText: { color: colors.white, fontSize: 28, fontWeight: '800' },
});
