import React, {useEffect, useMemo, useState} from 'react';
import {
  Image,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import {colors, radius, spacing, touch} from '../ui/theme';
import {t} from '../i18n/labels';
import type {Language} from '../models/types';
import {
  createCustomer,
  createProduct,
  SellUnitInput,
} from '../db/setupRepository';
import {
  cachedMarketCatalog,
  catalogDisplayName,
  MarketCatalogItem,
  refreshMarketCatalog,
} from '../services/productCatalog';

interface ProductFormProps {
  language: Language;
  onSaved: () => void;
  onCancel: () => void;
}

type CatalogSource = 'LOADING' | 'ONLINE' | 'OFFLINE';

export function ProductFormScreen({
  language: lang,
  onSaved,
  onCancel,
}: ProductFormProps) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('piece');
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [mode, setMode] = useState<'COUNTED' | 'BULK'>('COUNTED');
  const [units, setUnits] = useState<SellUnitInput[]>([]);
  const [uLabel, setULabel] = useState('');
  const [uPerBase, setUPerBase] = useState('');
  const [uPrice, setUPrice] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [catalog, setCatalog] = useState<MarketCatalogItem[]>(
    cachedMarketCatalog(),
  );
  const [catalogSource, setCatalogSource] = useState<CatalogSource>('LOADING');
  const [selectedCatalog, setSelectedCatalog] =
    useState<MarketCatalogItem | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const updateCatalog = async () => {
    setCatalogSource('LOADING');
    const result = await refreshMarketCatalog();
    setCatalog(result.items);
    setCatalogSource(result.source);
  };

  useEffect(() => {
    void updateCatalog();
  }, []);

  const suggestions = useMemo(() => {
    const search = name.trim().toLowerCase();
    const matches = catalog.filter(item => {
      if (!search) return true;
      const values = [...Object.values(item.names), ...item.aliases];
      return values.some(value => value.toLowerCase().includes(search));
    });
    return matches.slice(0, search ? 12 : 8);
  }, [catalog, name]);

  const chooseCatalogItem = (item: MarketCatalogItem) => {
    setSelectedCatalog(item);
    setName(catalogDisplayName(item, lang));
    setUnit(item.defaultUnit);
    setError('');
  };

  const handleImageResponse = (response: any) => {
    if (response.didCancel) return;
    if (response.errorCode) {
      setError(
        response.errorCode === 'permission'
          ? t(lang, 'product.camera_permission')
          : response.errorMessage || t(lang, 'product.camera_failed'),
      );
      return;
    }
    const uri = response.assets?.[0]?.uri;
    if (uri) {
      setPhoto(uri);
      setError('');
    }
  };

  const takePhoto = async () => {
    setError('');
    try {
      if (Platform.OS === 'android') {
        const permission = PermissionsAndroid.PERMISSIONS.CAMERA;
        const alreadyGranted = await PermissionsAndroid.check(permission);
        if (!alreadyGranted) {
          const result = await PermissionsAndroid.request(permission, {
            title: t(lang, 'product.camera_permission_title'),
            message: t(lang, 'product.camera_permission_note'),
            buttonPositive: t(lang, 'product.allow'),
            buttonNegative: t(lang, 'action.cancel'),
          });
          if (result !== PermissionsAndroid.RESULTS.GRANTED) {
            setError(t(lang, 'product.camera_permission'));
            return;
          }
        }
      }
      const response = await launchCamera({
        mediaType: 'photo',
        maxWidth: 600,
        maxHeight: 600,
        quality: 0.7,
        saveToPhotos: false,
      });
      handleImageResponse(response);
    } catch {
      setError(t(lang, 'product.camera_failed'));
    }
  };

  const choosePhoto = async () => {
    setError('');
    try {
      const response = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        maxWidth: 600,
        maxHeight: 600,
        quality: 0.7,
      });
      handleImageResponse(response);
    } catch {
      setError(t(lang, 'product.gallery_failed'));
    }
  };

  const addUnit = () => {
    const perBase = Number.parseFloat(uPerBase || '0');
    const sellingPriceKobo = Number.parseInt(uPrice || '0', 10) * 100;
    if (!uLabel.trim() || perBase <= 0 || sellingPriceKobo <= 0) {
      setError(t(lang, 'product.unit_error'));
      return;
    }
    setUnits(current => [
      ...current,
      {
        unitLabel: uLabel.trim(),
        basePerUnit: 1 / perBase,
        sellingPriceKobo,
        isDefault: current.length === 0,
      },
    ]);
    setULabel('');
    setUPerBase('');
    setUPrice('');
    setError('');
  };

  const save = () => {
    const cleanName = name.trim();
    if (cleanName.length < 2) {
      setError(t(lang, 'product.name_required'));
      return;
    }
    if (mode === 'BULK' && Number.parseInt(cost || '0', 10) <= 0) {
      setError(t(lang, 'product.bulk_cost_required'));
      return;
    }

    setSaving(true);
    setError('');
    try {
      const aliases = selectedCatalog
        ? [
            ...new Set([
              cleanName.toLowerCase(),
              ...Object.values(selectedCatalog.names).map(value =>
                value.toLowerCase(),
              ),
              ...selectedCatalog.aliases,
            ]),
          ]
        : [cleanName.toLowerCase()];
      createProduct({
        name: cleanName,
        unitLabel: unit.trim() || 'piece',
        costPriceKobo: Number.parseInt(cost || '0', 10) * 100,
        sellingPriceKobo: Number.parseInt(price || '0', 10) * 100,
        stockQuantity: Number.parseFloat(stock || '0'),
        photoPath: photo,
        voiceAliases: aliases,
        stockMode: mode,
        sellUnits: units.length ? units : undefined,
      });
      onSaved();
    } catch {
      setSaving(false);
      setError(t(lang, 'product.save_failed'));
    }
  };

  const bulkReady = mode !== 'BULK' || Number.parseInt(cost || '0', 10) > 0;
  const canSave = name.trim().length >= 2 && bulkReady && !saving;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <Header title={t(lang, 'product.new_title')} onBack={onCancel} />

      <View style={styles.catalogHeader}>
        <View style={{flex: 1}}>
          <Text style={styles.sectionTitle}>
            {t(lang, 'product.quick_pick')}
          </Text>
          <Text style={styles.catalogStatus}>
            {catalogSource === 'LOADING'
              ? t(lang, 'product.catalog_loading')
              : catalogSource === 'ONLINE'
                ? t(lang, 'product.catalog_online')
                : t(lang, 'product.catalog_offline')}
          </Text>
        </View>
        <Pressable style={styles.refreshButton} onPress={updateCatalog}>
          <Text style={styles.refreshText}>↻</Text>
        </Pressable>
      </View>

      <Text style={styles.helpText}>{t(lang, 'product.custom_allowed')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.suggestionRow}
        keyboardShouldPersistTaps="handled">
        {suggestions.map(item => (
          <Pressable
            key={item.id}
            style={[
              styles.suggestion,
              selectedCatalog?.id === item.id && styles.suggestionSelected,
            ]}
            onPress={() => chooseCatalogItem(item)}>
            <Text
              style={[
                styles.suggestionText,
                selectedCatalog?.id === item.id &&
                  styles.suggestionTextSelected,
              ]}>
              {catalogDisplayName(item, lang)}
            </Text>
            {item.names.en !== catalogDisplayName(item, lang) ? (
              <Text style={styles.suggestionEnglish}>{item.names.en}</Text>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>

      <LabeledField
        label={`${t(lang, 'product.name')} *`}
        value={name}
        onChange={value => {
          setName(value);
          if (
            selectedCatalog &&
            value !== catalogDisplayName(selectedCatalog, lang)
          ) {
            setSelectedCatalog(null);
          }
        }}
        placeholder={t(lang, 'product.name_example')}
      />

      <View style={styles.photoCard}>
        {photo ? (
          <Image source={{uri: photo}} style={styles.photo} />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={styles.photoIcon}>📷</Text>
            <Text style={styles.optionalText}>
              {t(lang, 'product.photo_optional')}
            </Text>
          </View>
        )}
        <View style={styles.photoActions}>
          <Pressable style={styles.photoButton} onPress={takePhoto}>
            <Text style={styles.photoButtonText}>
              📷 {t(lang, 'product.take_photo')}
            </Text>
          </Pressable>
          <Pressable style={styles.photoButton} onPress={choosePhoto}>
            <Text style={styles.photoButtonText}>
              🖼 {t(lang, 'product.choose_photo')}
            </Text>
          </Pressable>
          {photo ? (
            <Pressable onPress={() => setPhoto(null)}>
              <Text style={styles.removePhoto}>
                {t(lang, 'product.remove_photo')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <Text style={styles.sectionTitle}>{t(lang, 'product.stock_type')}</Text>
      <View style={styles.modeRow}>
        <Pressable
          style={[styles.modeButton, mode === 'COUNTED' && styles.modeActive]}
          onPress={() => setMode('COUNTED')}>
          <Text
            style={[
              styles.modeText,
              mode === 'COUNTED' && styles.modeTextActive,
            ]}>
            📦 {t(lang, 'mode.counted')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.modeButton, mode === 'BULK' && styles.modeActive]}
          onPress={() => setMode('BULK')}>
          <Text
            style={[styles.modeText, mode === 'BULK' && styles.modeTextActive]}>
            💰 {t(lang, 'mode.bulk')}
          </Text>
        </Pressable>
      </View>

      {mode === 'BULK' ? (
        <>
          <LabeledField
            label={`${t(lang, 'bulk.load_cost')} *`}
            value={cost}
            onChange={value => setCost(value.replace(/[^0-9]/g, ''))}
            placeholder="0"
            numeric
            money
          />
          <Text style={styles.helpText}>{t(lang, 'product.bulk_note')}</Text>
        </>
      ) : (
        <>
          <LabeledField
            label={t(lang, 'product.base_unit')}
            value={unit}
            onChange={setUnit}
            placeholder={t(lang, 'product.unit_example')}
          />
          <LabeledField
            label={t(lang, 'product.opening_stock')}
            value={stock}
            onChange={value => setStock(value.replace(/[^0-9.]/g, ''))}
            placeholder="0"
            numeric
          />
          <LabeledField
            label={t(lang, 'product.cost_optional')}
            value={cost}
            onChange={value => setCost(value.replace(/[^0-9]/g, ''))}
            placeholder="0"
            numeric
            money
          />
          <LabeledField
            label={t(lang, 'product.price_optional')}
            value={price}
            onChange={value => setPrice(value.replace(/[^0-9]/g, ''))}
            placeholder="0"
            numeric
            money
          />
          <Text style={styles.helpText}>{t(lang, 'product.price_note')}</Text>

          <Pressable
            style={styles.advancedToggle}
            onPress={() => setShowAdvanced(value => !value)}>
            <Text style={styles.advancedText}>
              {showAdvanced ? '−' : '+'} {t(lang, 'product.advanced_units')}
            </Text>
          </Pressable>
          {showAdvanced ? (
            <View style={styles.advancedCard}>
              {units.map((item, index) => (
                <View
                  key={`${item.unitLabel}-${index}`}
                  style={styles.unitChip}>
                  <Text style={styles.unitChipText}>
                    {item.unitLabel} · ₦
                    {(item.sellingPriceKobo / 100).toLocaleString('en-NG')}
                  </Text>
                  <Pressable
                    onPress={() =>
                      setUnits(current =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }>
                    <Text style={styles.removeX}>×</Text>
                  </Pressable>
                </View>
              ))}
              <LabeledField
                label={t(lang, 'product.sell_unit_name')}
                value={uLabel}
                onChange={setULabel}
                placeholder={t(lang, 'product.sell_unit_example')}
              />
              <LabeledField
                label={t(lang, 'product.units_per_base')}
                value={uPerBase}
                onChange={value => setUPerBase(value.replace(/[^0-9.]/g, ''))}
                placeholder="40"
                numeric
              />
              <LabeledField
                label={t(lang, 'product.sell_unit_price')}
                value={uPrice}
                onChange={value => setUPrice(value.replace(/[^0-9]/g, ''))}
                placeholder="0"
                numeric
                money
              />
              <Pressable style={styles.addUnitButton} onPress={addUnit}>
                <Text style={styles.addUnitText}>
                  + {t(lang, 'unit.add_unit')}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!canSave && !error ? (
        <Text style={styles.requirement}>
          {name.trim().length < 2
            ? t(lang, 'product.name_required')
            : t(lang, 'product.bulk_cost_required')}
        </Text>
      ) : null}
      <Pressable
        style={[styles.saveButton, !canSave && styles.disabledButton]}
        disabled={!canSave}
        onPress={save}>
        <Text style={styles.saveText}>
          {saving ? t(lang, 'product.saving') : `✓ ${t(lang, 'product.save')}`}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

interface CustomerFormProps {
  language: Language;
  onSaved: () => void;
  onCancel: () => void;
}

export function CustomerFormScreen({
  language: lang,
  onSaved,
  onCancel,
}: CustomerFormProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const save = () => {
    let normalized: string | undefined = phone.replace(/[\s-]/g, '');
    if (/^0\d{10}$/.test(normalized)) {
      normalized = `+234${normalized.slice(1)}`;
    } else if (/^234\d{10}$/.test(normalized)) {
      normalized = `+${normalized}`;
    } else if (normalized === '') {
      normalized = undefined;
    }
    createCustomer(name.trim(), normalized);
    onSaved();
  };

  return (
    <View style={[styles.screen, styles.customerContent]}>
      <Header title={`+ ${t(lang, 'sale.new_customer')}`} onBack={onCancel} />
      <LabeledField
        label={t(lang, 'customer.name')}
        value={name}
        onChange={setName}
        placeholder={t(lang, 'customer.name')}
      />
      <LabeledField
        label={t(lang, 'customer.phone_optional')}
        value={phone}
        onChange={setPhone}
        placeholder="08012345678"
        numeric
      />
      <Pressable
        style={[
          styles.saveButton,
          name.trim().length < 2 && styles.disabledButton,
        ]}
        disabled={name.trim().length < 2}
        onPress={save}>
        <Text style={styles.saveText}>✓ {t(lang, 'action.save')}</Text>
      </Pressable>
    </View>
  );
}

function Header({title, onBack}: {title: string; onBack: () => void}) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.backButton} onPress={onBack}>
        <Text style={styles.backText}>←</Text>
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
    </View>
  );
}

function LabeledField({
  label,
  value,
  onChange,
  placeholder,
  numeric,
  money,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  numeric?: boolean;
  money?: boolean;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        {money ? <Text style={styles.moneyPrefix}>₦</Text> : null}
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.inkSoft}
          keyboardType={numeric ? 'numeric' : 'default'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bg},
  content: {padding: spacing.md, paddingBottom: spacing.xxl},
  customerContent: {padding: spacing.md},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  backButton: {
    width: touch.min,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {fontSize: 30, fontWeight: '800', color: colors.ink},
  headerTitle: {fontSize: 24, fontWeight: '800', color: colors.ink, flex: 1},
  catalogHeader: {flexDirection: 'row', alignItems: 'center'},
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 3,
  },
  catalogStatus: {fontSize: 12, color: colors.inkSoft},
  refreshButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  refreshText: {fontSize: 25, color: colors.moneyIn, fontWeight: '800'},
  helpText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
    marginBottom: spacing.sm,
  },
  suggestionRow: {gap: spacing.sm, paddingVertical: spacing.sm},
  suggestion: {
    minHeight: 58,
    minWidth: 96,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionSelected: {
    borderColor: colors.moneyIn,
    borderWidth: 2,
    backgroundColor: '#EAF7ED',
  },
  suggestionText: {fontSize: 16, fontWeight: '800', color: colors.ink},
  suggestionTextSelected: {color: colors.moneyIn},
  suggestionEnglish: {fontSize: 11, color: colors.inkSoft, marginTop: 2},
  fieldWrap: {marginTop: spacing.sm},
  fieldLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 5,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  moneyPrefix: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    marginLeft: spacing.md,
  },
  input: {
    flex: 1,
    minHeight: 58,
    fontSize: 19,
    fontWeight: '600',
    color: colors.ink,
    paddingHorizontal: spacing.md,
  },
  photoCard: {
    flexDirection: 'row',
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  photo: {width: 105, height: 105, borderRadius: radius.sm},
  photoPlaceholder: {
    width: 105,
    height: 105,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xs,
  },
  photoIcon: {fontSize: 34},
  optionalText: {
    fontSize: 10,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: 3,
  },
  photoActions: {
    flex: 1,
    marginLeft: spacing.sm,
    gap: 5,
    justifyContent: 'center',
  },
  photoButton: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.moneyIn,
  },
  photoButtonText: {fontSize: 13, fontWeight: '800', color: colors.moneyIn},
  removePhoto: {
    fontSize: 12,
    color: colors.moneyOut,
    fontWeight: '700',
    textAlign: 'center',
    padding: 4,
  },
  modeRow: {flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm},
  modeButton: {
    flex: 1,
    minHeight: 60,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  modeActive: {backgroundColor: colors.moneyIn, borderColor: colors.moneyIn},
  modeText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
  modeTextActive: {color: colors.white},
  advancedToggle: {
    minHeight: 54,
    justifyContent: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.ledger,
    backgroundColor: '#FFF8DD',
  },
  advancedText: {fontSize: 16, fontWeight: '800', color: colors.ink},
  advancedCard: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unitChip: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
    marginBottom: 4,
  },
  unitChipText: {fontSize: 14, fontWeight: '700', color: colors.ink},
  removeX: {
    fontSize: 25,
    color: colors.moneyOut,
    paddingHorizontal: spacing.sm,
  },
  addUnitButton: {
    minHeight: 50,
    borderRadius: radius.sm,
    backgroundColor: colors.ledger,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  addUnitText: {fontSize: 16, fontWeight: '800', color: colors.ink},
  error: {
    fontSize: 14,
    color: colors.moneyOut,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: spacing.md,
  },
  requirement: {
    fontSize: 13,
    color: colors.warning,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: spacing.md,
  },
  saveButton: {
    minHeight: 68,
    borderRadius: radius.md,
    marginTop: spacing.md,
    backgroundColor: colors.moneyIn,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  disabledButton: {backgroundColor: colors.disabled},
  saveText: {color: colors.white, fontSize: 20, fontWeight: '800'},
});
