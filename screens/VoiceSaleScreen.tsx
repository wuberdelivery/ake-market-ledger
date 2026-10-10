// ============================================================
// AKE LEDGER — VoiceSaleScreen
//   hold 🎤 → official N-ATLaS transcription → confirmation → save
// Failures remain recoverable: retry voice or continue manually.
// ============================================================

import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, spacing, radius, touch } from '../ui/theme';
import { t } from '../i18n/labels';
import type { Language, Product, Customer } from '../models/types';
import { InputMethod } from '../models/types';
import { recordSale } from '../db/ledgerRepository';
import {
  startRecording,
  stopRecordingAndProcess,
  cancelRecording,
  speak,
  buildConfirmationSpeech,
  VoiceResult,
} from '../voice/voiceRouter';
import type { SaleIntent } from '../voice/yorubaIntentParser';

type Phase = 'READY' | 'RECORDING' | 'PROCESSING' | 'CONFIRM' | 'FALLBACK';

interface Props {
  language: Language;
  userId: string;
  products: Product[];
  customers: Customer[];
  onFinished: (txId: string) => void;
  onManualFallback: (prefill?: SaleIntent) => void;
  onCancel: () => void;
}

export default function VoiceSaleScreen({
  language: lang,
  userId,
  products,
  customers,
  onFinished,
  onManualFallback,
  onCancel,
}: Props) {
  const [phase, setPhase] = useState<Phase>('READY');
  const [intent, setIntent] = useState<SaleIntent | null>(null);
  const [transcript, setTranscript] = useState('');
  const [model, setModel] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const startPromise = useRef<Promise<boolean> | null>(null);

  const product = intent?.productId
    ? products.find(p => p.id === intent.productId) ?? null
    : null;
  const totalKobo = product && intent?.quantity
    ? Math.round(product.sellingPriceKobo * intent.quantity)
    : 0;

  const beginHold = () => {
    setErrorMessage('');
    setPhase('RECORDING');
    startPromise.current = startRecording()
      .then(() => true)
      .catch((error: any) => {
        setErrorMessage(
          error?.message ?? 'Microphone access is required for voice sales.',
        );
        setPhase('FALLBACK');
        return false;
      });
  };

  const endHold = async () => {
    const started = await startPromise.current;
    startPromise.current = null;
    if (!started) {
      return;
    }

    setPhase('PROCESSING');
    const result: VoiceResult = await stopRecordingAndProcess(lang, products);

    if (result.kind === 'INTENT') {
      setTranscript(result.transcript);
      setIntent(result.intent);
      setModel(result.model);

      if (result.intent.missing.length > 0 || result.intent.confidence < 0.6) {
        // Never guess with a trader's money. Continue with editable fields.
        onManualFallback(result.intent);
        return;
      }
      setPhase('CONFIRM');
      const matchedProduct = products.find(x => x.id === result.intent.productId)!;
      const total = Math.round(
        matchedProduct.sellingPriceKobo * (result.intent.quantity ?? 1),
      );
      speak(buildConfirmationSpeech(result.intent, lang, total), lang);
      return;
    }

    if (result.kind === 'OFFLINE_FALLBACK') {
      setErrorMessage(result.message);
      setPhase('FALLBACK');
      return;
    }

    setErrorMessage(
      lang === 'yo'
        ? 'A kò gbọ́ ohùn kankan. Ẹ tún gbìyànjú.'
        : 'No speech was recognized. Please try again.',
    );
    setPhase('FALLBACK');
  };

  const commit = () => {
    if (!intent?.productId || !intent.quantity) {
      return;
    }
    const paid = intent.amountPaidKobo ?? totalKobo;
    let customerId: string | undefined;
    if (intent.paymentStatus === 'DEBT' || paid < totalKobo) {
      const hint = intent.customerHint?.toLowerCase();
      customerId = hint
        ? customers.find(c => c.name.toLowerCase().includes(hint))?.id
        : undefined;
      if (!customerId) {
        onManualFallback(intent);
        return;
      }
    }
    const tx = recordSale({
      productId: intent.productId,
      userId,
      quantity: intent.quantity,
      amountPaidKobo: Math.min(paid, totalKobo),
      customerId,
      inputMethod: InputMethod.VOICE_ONLINE,
      voiceConfidence: intent.confidence,
      note: `${transcript} [${model}]`.slice(0, 200),
    });
    onFinished(tx.id);
  };

  if (phase === 'READY' || phase === 'RECORDING' || phase === 'PROCESSING') {
    return (
      <View style={styles.screen}>
        <Pressable
          style={styles.close}
          onPress={() => {
            cancelRecording();
            onCancel();
          }}
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>

        <Text style={styles.provider}>N-ATLaS • NCAIR / Awarri</Text>
        <Text style={styles.hint}>{t(lang, 'prompt.hold_and_speak')}</Text>

        {phase === 'PROCESSING' ? (
          <View style={styles.micBtn}>
            <ActivityIndicator size="large" color={colors.white} />
            <Text style={styles.processingText}>N-ATLaS</Text>
          </View>
        ) : (
          <Pressable
            style={[styles.micBtn, phase === 'RECORDING' && styles.micActive]}
            onPressIn={beginHold}
            onPressOut={endHold}
          >
            <Text style={styles.micIcon}>🎤</Text>
          </Pressable>
        )}

        <Text style={styles.example}>
          “Mo ta apo iresi meji, o san ẹgbẹrun mẹwa”
        </Text>
      </View>
    );
  }

  if (phase === 'CONFIRM' && intent && product) {
    const paid = intent.amountPaidKobo ?? totalKobo;
    const isDebt = intent.paymentStatus === 'DEBT' || paid < totalKobo;
    return (
      <View style={styles.screen}>
        <Text style={styles.provider}>✓ {model}</Text>
        <View style={styles.card}>
          <Text style={styles.cardProduct}>{product.name}</Text>
          <Text style={styles.cardQty}>× {intent.quantity}</Text>
          <Text style={styles.cardTotal}>
            ₦{(totalKobo / 100).toLocaleString('en-NG')}
          </Text>
          <Text
            style={[
              styles.cardStatus,
              { color: isDebt ? colors.debtTag : colors.paidTag },
            ]}
          >
            {isDebt ? t(lang, 'label.debt') : t(lang, 'label.paid')}
          </Text>
          <Text style={styles.cardTranscript}>“{transcript}”</Text>
        </View>

        <View style={styles.decisionRow}>
          <Pressable
            style={[styles.decisionBtn, { backgroundColor: colors.moneyOut }]}
            onPress={() => {
              setIntent(null);
              setPhase('READY');
            }}
          >
            <Text style={styles.decisionIcon}>👎</Text>
          </Pressable>
          <Pressable
            style={[styles.decisionBtn, { backgroundColor: colors.moneyIn }]}
            onPress={commit}
          >
            <Text style={styles.decisionIcon}>👍</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.fallbackIcon}>🎙️</Text>
      <Text style={styles.fallbackText}>{errorMessage}</Text>
      <View style={styles.fallbackActions}>
        <Pressable
          style={styles.retryBtn}
          onPress={() => {
            setErrorMessage('');
            setPhase('READY');
          }}
        >
          <Text style={styles.retryText}>
            {lang === 'yo' ? 'Tún gbìyànjú' : 'Try again'}
          </Text>
        </Pressable>
        <Pressable
          style={styles.manualBtn}
          onPress={() => onManualFallback(intent ?? undefined)}
        >
          <Text style={styles.manualText}>
            {lang === 'yo' ? 'Tẹ̀ ẹ́ lọ́wọ́' : 'Enter manually'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.moneyIn,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  close: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    width: touch.min,
    height: touch.min - 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: colors.white, fontSize: 28, fontWeight: '800' },
  provider: {
    color: '#DFF5E4',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  hint: {
    color: colors.white,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  micBtn: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.moneyInPressed,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.white,
  },
  micActive: { backgroundColor: colors.moneyOut, transform: [{ scale: 1.12 }] },
  micIcon: { fontSize: 64 },
  processingText: { color: colors.white, fontWeight: '800', marginTop: 8 },
  example: {
    color: '#DFF5E4',
    fontSize: 15,
    marginTop: spacing.xl,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    width: '100%',
  },
  cardProduct: { fontSize: 26, fontWeight: '800', color: colors.ink },
  cardQty: { fontSize: 40, fontWeight: '800', color: colors.ink, marginVertical: 4 },
  cardTotal: { fontSize: 36, fontWeight: '800', color: colors.moneyIn },
  cardStatus: { fontSize: 20, fontWeight: '800', marginTop: 6 },
  cardTranscript: {
    fontSize: 13,
    color: colors.inkSoft,
    marginTop: spacing.md,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  decisionRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xl },
  decisionBtn: {
    width: 120,
    height: 96,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  decisionIcon: { fontSize: 44 },
  fallbackIcon: { fontSize: 64 },
  fallbackText: {
    color: colors.white,
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'center',
    marginVertical: spacing.lg,
  },
  fallbackActions: { width: '100%', gap: spacing.md },
  retryBtn: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    minHeight: touch.min + 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  retryText: { color: colors.moneyIn, fontSize: 18, fontWeight: '800' },
  manualBtn: {
    borderColor: colors.white,
    borderWidth: 2,
    borderRadius: radius.md,
    minHeight: touch.min + 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  manualText: { color: colors.white, fontSize: 18, fontWeight: '800' },
});
