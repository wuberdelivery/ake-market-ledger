// ============================================================
// AKE LEDGER — VoiceSaleScreen
// The selling-point flow:
//   hold 🎤 → speak → confirmation card + spoken playback →
//   👍 commits via recordSale()  /  👎 discards  /
//   missing pieces → jumps into the manual flow pre-filled.
// Offline or STT failure → drops the trader into the photo
// picker with a friendly note, never a dead end.
// ============================================================

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing, radius, touch } from '../ui/theme';
import { t } from '../i18n/labels';
import type { Language, Product, Customer } from '../models/types';
import { InputMethod } from '../models/types';
import { recordSale } from '../db/ledgerRepository';
import {
  startRecording, stopRecordingAndProcess, cancelRecording,
  speak, buildConfirmationSpeech, VoiceResult,
} from '../voice/voiceRouter';
import type { SaleIntent } from '../voice/yorubaIntentParser';

type Phase = 'READY' | 'RECORDING' | 'PROCESSING' | 'CONFIRM' | 'FALLBACK';

interface Props {
  language: Language;
  userId: string;
  products: Product[];
  customers: Customer[];
  sttApiKey: string | null;
  sttProvider?: 'spitch' | 'whisper' | 'elevenlabs';
  onFinished: (txId: string) => void;
  onManualFallback: (prefill?: SaleIntent) => void; // route to SaleScreen
  onCancel: () => void;
}

export default function VoiceSaleScreen({
  language: lang, userId, products, customers, sttApiKey, sttProvider = 'spitch',
  onFinished, onManualFallback, onCancel,
}: Props) {
  const [phase, setPhase] = useState<Phase>('READY');
  const [intent, setIntent] = useState<SaleIntent | null>(null);
  const [transcript, setTranscript] = useState('');

  const product = intent?.productId
    ? products.find(p => p.id === intent.productId) ?? null : null;
  const totalKobo = product && intent?.quantity
    ? Math.round(product.sellingPriceKobo * intent.quantity) : 0;

  const beginHold = async () => {
    setPhase('RECORDING');
    await startRecording();
  };

  const endHold = async () => {
    setPhase('PROCESSING');
    const result: VoiceResult = await stopRecordingAndProcess(lang, products, sttApiKey, sttProvider);

    if (result.kind === 'INTENT') {
      setTranscript(result.transcript);
      setIntent(result.intent);

      if (result.intent.missing.length > 0 || result.intent.confidence < 0.6) {
        // Understood partially — hand to manual flow pre-filled rather
        // than guessing with someone's money.
        onManualFallback(result.intent);
        return;
      }
      setPhase('CONFIRM');
      const p = products.find(x => x.id === result.intent.productId)!;
      const total = Math.round(p.sellingPriceKobo * (result.intent.quantity ?? 1));
      void speak(buildConfirmationSpeech(result.intent, lang, total), lang);
    } else if (result.kind === 'OFFLINE_FALLBACK') {
      setPhase('FALLBACK');
    } else {
      setPhase('READY'); // empty recording — try again
    }
  };

  const commit = () => {
    if (!intent?.productId || !intent.quantity) return;
    // Voice-stated amount wins; otherwise full price (PAID default)
    const paid = intent.amountPaidKobo ?? totalKobo;
    // Match spoken customer hint against saved customers (debt case)
    let customerId: string | undefined;
    if (intent.paymentStatus === 'DEBT' || paid < totalKobo) {
      const hint = intent.customerHint?.toLowerCase();
      customerId = hint
        ? customers.find(c => c.name.toLowerCase().includes(hint))?.id
        : undefined;
      if (!customerId) {
        // Debt with no matched customer → manual flow enforces the pick
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
      note: transcript.slice(0, 200),
    });
    onFinished(tx.id);
  };

  // ---------- RECORD / PROCESS ----------
  if (phase === 'READY' || phase === 'RECORDING' || phase === 'PROCESSING') {
    return (
      <View style={styles.screen}>
        <Pressable style={styles.close} onPress={() => { void cancelRecording(); onCancel(); }}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>

        <Text style={styles.hint}>{t(lang, 'prompt.hold_and_speak')}</Text>

        {phase === 'PROCESSING' ? (
          <View style={styles.micBtn}>
            <ActivityIndicator size="large" color={colors.white} />
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
          "Mo ta apo iresi meji, o san ẹgbẹrun mẹwa"
        </Text>
      </View>
    );
  }

  // ---------- CONFIRM ----------
  if (phase === 'CONFIRM' && intent && product) {
    const paid = intent.amountPaidKobo ?? totalKobo;
    const isDebt = intent.paymentStatus === 'DEBT' || paid < totalKobo;
    return (
      <View style={styles.screen}>
        <View style={styles.card}>
          <Text style={styles.cardProduct}>{product.name}</Text>
          <Text style={styles.cardQty}>× {intent.quantity}</Text>
          <Text style={styles.cardTotal}>
            ₦{(totalKobo / 100).toLocaleString('en-NG')}
          </Text>
          <Text style={[styles.cardStatus, { color: isDebt ? colors.debtTag : colors.paidTag }]}>
            {isDebt ? t(lang, 'label.debt') : t(lang, 'label.paid')}
          </Text>
          <Text style={styles.cardTranscript}>"{transcript}"</Text>
        </View>

        <View style={styles.decisionRow}>
          <Pressable
            style={[styles.decisionBtn, { backgroundColor: colors.moneyOut }]}
            onPress={() => { setIntent(null); setPhase('READY'); }}
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

  // ---------- OFFLINE FALLBACK ----------
  return (
    <View style={styles.screen}>
      <Text style={styles.fallbackIcon}>📵</Text>
      <Text style={styles.fallbackText}>
        {lang === 'yo'
          ? 'Kò sí nẹ́tíwọ̀ọ̀kì — ẹ lo àwòrán dípò rẹ̀'
          : 'No network — use the picture entry instead'}
      </Text>
      <Pressable
        style={[styles.fallbackBtn]}
        onPress={() => onManualFallback()}
      >
        <Text style={styles.fallbackBtnText}>📷 →</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1, backgroundColor: colors.moneyIn,
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
  },
  close: { position: 'absolute', top: spacing.lg, right: spacing.lg, width: touch.min, height: touch.min - 16, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.white, fontSize: 28, fontWeight: '800' },
  hint: { color: colors.white, fontSize: 24, fontWeight: '800', marginBottom: spacing.xl, textAlign: 'center' },
  micBtn: {
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: colors.moneyInPressed,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: colors.white,
  },
  micActive: { backgroundColor: colors.moneyOut, transform: [{ scale: 1.12 }] },
  micIcon: { fontSize: 64 },
  example: { color: '#DFF5E4', fontSize: 15, marginTop: spacing.xl, textAlign: 'center', fontStyle: 'italic' },

  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, alignItems: 'center', width: '100%',
  },
  cardProduct: { fontSize: 26, fontWeight: '800', color: colors.ink },
  cardQty: { fontSize: 40, fontWeight: '800', color: colors.ink, marginVertical: 4 },
  cardTotal: { fontSize: 36, fontWeight: '800', color: colors.moneyIn },
  cardStatus: { fontSize: 20, fontWeight: '800', marginTop: 6 },
  cardTranscript: { fontSize: 13, color: colors.inkSoft, marginTop: spacing.md, fontStyle: 'italic', textAlign: 'center' },

  decisionRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xl },
  decisionBtn: {
    width: 120, height: 96, borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center',
  },
  decisionIcon: { fontSize: 44 },

  fallbackIcon: { fontSize: 64 },
  fallbackText: { color: colors.white, fontSize: 20, fontWeight: '700', textAlign: 'center', marginVertical: spacing.lg },
  fallbackBtn: {
    backgroundColor: colors.white, borderRadius: radius.md,
    paddingHorizontal: spacing.xl, height: touch.min + 8,
    alignItems: 'center', justifyContent: 'center',
  },
  fallbackBtnText: { fontSize: 30 },
});
