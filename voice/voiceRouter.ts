// ============================================================
// AKE LEDGER — voiceRouter.ts
//   record → official N-ATLaS ASR gateway → local intent parser
//          ↘ service failure → retry/manual fallback (never a dead end)
// plus system TTS speak-back for the confirmation loop.
// ============================================================

import {
  PermissionsAndroid,
  Platform,
} from 'react-native';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import Tts from 'react-native-tts';
import type { Language, Product } from '../models/types';
import { parseSaleIntent, SaleIntent } from './yorubaIntentParser';
import { SttError, transcribe } from './sttProviders';

const STT_TIMEOUT_MS = 120000; // CPU inference may cold-start the model.
const recorder = new AudioRecorderPlayer();

export type VoiceResult =
  | {
      kind: 'INTENT';
      intent: SaleIntent;
      transcript: string;
      model: string;
      online: true;
    }
  | {
      kind: 'OFFLINE_FALLBACK';
      reason: 'no_network' | 'timeout' | 'stt_error';
      message: string;
    }
  | { kind: 'EMPTY' };

let currentPath: string | null = null;

async function ensureMicrophonePermission(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  const alreadyGranted = await PermissionsAndroid.check(permission);
  if (alreadyGranted) {
    return;
  }

  const result = await PermissionsAndroid.request(permission, {
    title: 'Microphone access',
    message: 'AKE Ledger needs the microphone to record a spoken sale.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
  if (result !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new Error('Microphone permission is required for voice sales.');
  }
}

// ------------------------------------------------------------
// Recording control (press-and-hold semantics)
// ------------------------------------------------------------
export async function startRecording(): Promise<void> {
  await ensureMicrophonePermission();
  // AAC/m4a is small and is decoded in memory by the VPS gateway.
  currentPath = await recorder.startRecorder(undefined, {
    AudioEncoderAndroid: 3,        // AAC
    AudioSourceAndroid: 6,         // VOICE_RECOGNITION (noise-tuned)
    OutputFormatAndroid: 2,        // MPEG_4
    AudioSamplingRateAndroid: 16000,
    AudioEncodingBitRateAndroid: 32000,
  } as any);
}

export async function stopRecordingAndProcess(
  language: Language,
  products: Product[],
): Promise<VoiceResult> {
  if (!currentPath) {
    return { kind: 'EMPTY' };
  }

  let path: string;
  try {
    path = await recorder.stopRecorder();
  } catch {
    currentPath = null;
    return { kind: 'EMPTY' };
  }
  currentPath = null;
  if (!path) {
    return { kind: 'EMPTY' };
  }

  try {
    const { transcript, model } = await transcribe({
      audioPath: path,
      language,
      timeoutMs: STT_TIMEOUT_MS,
    });
    if (!transcript.trim()) {
      return { kind: 'EMPTY' };
    }

    // Intent parsing remains local: fast, deterministic and auditable.
    const intent = parseSaleIntent(transcript, products);
    return { kind: 'INTENT', intent, transcript, model, online: true };
  } catch (error: any) {
    const sttError = error instanceof SttError ? error : null;
    const reason = sttError?.status === 408
      ? 'timeout'
      : sttError?.status === null
        ? 'no_network'
        : 'stt_error';
    return {
      kind: 'OFFLINE_FALLBACK',
      reason,
      message: sttError?.message
        ?? 'N-ATLaS could not process the recording. Please retry.',
    };
  }
}

export async function cancelRecording(): Promise<void> {
  if (!currentPath) {
    return;
  }
  try {
    await recorder.stopRecorder();
  } catch {
    // Recorder was already stopped.
  }
  currentPath = null;
}

// ------------------------------------------------------------
// TTS speak-back
// ------------------------------------------------------------
const TTS_LOCALE: Record<Language, string> = {
  yo: 'yo-NG', ha: 'ha-NG', ig: 'ig-NG', en: 'en-NG',
};

export async function speak(text: string, language: Language): Promise<void> {
  try {
    await Tts.setDefaultLanguage(TTS_LOCALE[language]);
  } catch {
    // If a language voice is absent, the system default still provides audio.
  }
  Tts.speak(text);
}

export function buildConfirmationSpeech(
  intent: SaleIntent,
  language: Language,
  totalKobo: number,
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
