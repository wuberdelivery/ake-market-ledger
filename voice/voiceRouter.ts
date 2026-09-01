// ============================================================
// AKE LEDGER — voiceRouter.ts
// The hybrid voice pipeline:
//   record → network pre-flight → cloud STT (4s timeout)
//          ↘ offline/failure → guided manual fallback
// plus TTS speak-back for the confirmation loop.
//
// Deps:
//   npm i react-native-audio-recorder-player react-native-tts
//
// Cloud STT: the endpoint below is written against Spitch's
// Nigerian speech API shape (Yoruba/Hausa/Igbo). OpenAI Whisper
// API also handles Yoruba acceptably as a fallback provider —
// benchmark both with real market recordings before launch.
// ============================================================

import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import Tts from 'react-native-tts';
import NetInfo from '@react-native-community/netinfo';
import type { Language, Product } from '../models/types';
import { parseSaleIntent, SaleIntent } from './yorubaIntentParser';
import { transcribe, SttProvider } from './sttProviders';

const STT_TIMEOUT_MS = 8000; // strict: market wifi lies about being connected

const recorder = new AudioRecorderPlayer();

export type VoiceResult =
  | { kind: 'INTENT'; intent: SaleIntent; transcript: string; online: true }
  | { kind: 'OFFLINE_FALLBACK'; reason: 'no_network' | 'timeout' | 'stt_error' }
  | { kind: 'EMPTY' };

// ------------------------------------------------------------
// Recording control (press-and-hold semantics)
// ------------------------------------------------------------
let currentPath: string | null = null;

export async function startRecording(): Promise<void> {
  // AAC/m4a: small files, accepted by every cloud STT
  currentPath = await recorder.startRecorder(undefined, {
    AudioEncoderAndroid: 3,        // AAC
    AudioSourceAndroid: 6,         // VOICE_RECOGNITION source (noise-tuned)
    OutputFormatAndroid: 2,        // MPEG_4
    AudioSamplingRateAndroid: 16000,
    AudioEncodingBitRateAndroid: 32000,
  } as any);
}

export async function stopRecordingAndProcess(
  language: Language,
  products: Product[],
  sttApiKey: string | null,
  sttProvider: SttProvider = 'spitch'
): Promise<VoiceResult> {
  const path = await recorder.stopRecorder();
  currentPath = null;
  if (!path) return { kind: 'EMPTY' };

  // 1. Network pre-flight — hardware check first, it's instant
  const net = await NetInfo.fetch();
  if (!net.isConnected || !sttApiKey) {
    return { kind: 'OFFLINE_FALLBACK', reason: 'no_network' };
  }

  // 2. Cloud STT via the selected provider (Spitch / Whisper / ElevenLabs)
  try {
    const { transcript } = await transcribe({
      provider: sttProvider,
      apiKey: sttApiKey,
      audioPath: path,
      language,
      timeoutMs: STT_TIMEOUT_MS,
    });
    if (!transcript.trim()) return { kind: 'EMPTY' };

    // 3. Intent parsing (local, instant, works on imperfect transcripts)
    const intent = parseSaleIntent(transcript, products);
    return { kind: 'INTENT', intent, transcript, online: true };
  } catch (e: any) {
    return {
      kind: 'OFFLINE_FALLBACK',
      reason: e?.name === 'AbortError' ? 'timeout' : 'stt_error',
    };
  }
}

export async function cancelRecording(): Promise<void> {
  try { await recorder.stopRecorder(); } catch { /* not recording */ }
  currentPath = null;
}

// ------------------------------------------------------------
// TTS speak-back (the confirmation voice)
// System TTS: recent Google Speech Services include Yoruba; where
// the device lacks a Yoruba voice, Tts falls back to the default
// engine — the confirmation SCREEN always shows the same info
// visually, so voice is enhancement, never a dependency.
// ------------------------------------------------------------
const TTS_LOCALE: Record<Language, string> = {
  yo: 'yo-NG', ha: 'ha-NG', ig: 'ig-NG', en: 'en-NG',
};

export async function speak(text: string, language: Language): Promise<void> {
  try {
    await Tts.setDefaultLanguage(TTS_LOCALE[language]);
  } catch { /* voice not installed — use device default */ }
  Tts.speak(text);
}

export function buildConfirmationSpeech(
  intent: SaleIntent,
  language: Language,
  totalKobo: number
): string {
  const naira = (k: number) => `${Math.round(k / 100).toLocaleString('en-NG')} naira`;
  if (language === 'yo') {
    const qty = intent.quantity ?? 1;
    const status = intent.paymentStatus === 'DEBT' ? 'Onígbèsè ni.' : 'Ó san tán.';
    return `${intent.productName}, ${qty}. ${naira(totalKobo)}. ${status} Ṣé kí n fi sí àkọsílẹ̀?`;
  }
  const status = intent.paymentStatus === 'DEBT' ? 'On credit.' : 'Fully paid.';
  return `${intent.productName}, ${intent.quantity ?? 1}. ${naira(totalKobo)}. ${status} Should I record it?`;
}
