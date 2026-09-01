// ============================================================
// AKE LEDGER — sttProviders.ts
// One interface, three backends. The trader/owner picks a provider
// (stored in app_settings 'stt_provider'), pastes the matching key
// (app_settings 'stt_api_key'), and voiceRouter calls transcribe()
// without caring which service answers.
//
// Benchmark plan: record 20-30 real market phrases, run each through
// all three by flipping the setting, keep whichever wins on Yoruba.
// ============================================================

import type { Language } from '../models/types';

export type SttProvider = 'spitch' | 'whisper' | 'elevenlabs';

export interface SttResult {
  transcript: string;
  raw?: any;
}

// Language codes each provider expects
const LANG_CODE: Record<SttProvider, Record<Language, string>> = {
  spitch:     { yo: 'yo',    ha: 'ha',    ig: 'ig',    en: 'en' },
  whisper:    { yo: 'yo',    ha: 'ha',    ig: 'ig',    en: 'en' },
  elevenlabs: { yo: 'yor',   ha: 'hau',   ig: 'ibo',   en: 'eng' }, // ISO-639-3
};

interface TranscribeArgs {
  provider: SttProvider;
  apiKey: string;
  audioPath: string;      // local file uri
  language: Language;
  timeoutMs?: number;
}

// ------------------------------------------------------------
// Public entry — routes to the chosen provider
// ------------------------------------------------------------
export async function transcribe(args: TranscribeArgs): Promise<SttResult> {
  const uri = args.audioPath.startsWith('file://')
    ? args.audioPath : `file://${args.audioPath}`;
  const timeout = args.timeoutMs ?? 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    switch (args.provider) {
      case 'spitch':     return await spitch(args, uri, controller.signal);
      case 'whisper':    return await whisper(args, uri, controller.signal);
      case 'elevenlabs': return await elevenlabs(args, uri, controller.signal);
      default: throw new Error(`Unknown STT provider: ${args.provider}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------
// 1. Spitch (Nigerian STT) — https://docs.spi-tch.com
//    Endpoint shape may evolve; confirm against their live docs.
// ------------------------------------------------------------
async function spitch(a: TranscribeArgs, uri: string, signal: AbortSignal): Promise<SttResult> {
  const form = new FormData();
  form.append('language', LANG_CODE.spitch[a.language]);
  form.append('audio', { uri, type: 'audio/m4a', name: 'sale.m4a' } as any);

  const res = await fetch('https://api.spi-tch.com/v1/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${a.apiKey}` },
    body: form,
    signal,
  });
  if (!res.ok) throw new Error(`Spitch ${res.status}`);
  const body = await res.json();
  return { transcript: body.text ?? body.transcript ?? '', raw: body };
}

// ------------------------------------------------------------
// 2. OpenAI Whisper — https://api.openai.com/v1/audio/transcriptions
// ------------------------------------------------------------
async function whisper(a: TranscribeArgs, uri: string, signal: AbortSignal): Promise<SttResult> {
  const form = new FormData();
  form.append('model', 'whisper-1');
  form.append('language', LANG_CODE.whisper[a.language]);
  form.append('file', { uri, type: 'audio/m4a', name: 'sale.m4a' } as any);

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${a.apiKey}` },
    body: form,
    signal,
  });
  if (!res.ok) throw new Error(`Whisper ${res.status}`);
  const body = await res.json();
  return { transcript: body.text ?? '', raw: body };
}

// ------------------------------------------------------------
// 3. ElevenLabs Scribe — https://api.elevenlabs.io/v1/speech-to-text
// ------------------------------------------------------------
async function elevenlabs(a: TranscribeArgs, uri: string, signal: AbortSignal): Promise<SttResult> {
  const form = new FormData();
  form.append('model_id', 'scribe_v1');
  form.append('language_code', LANG_CODE.elevenlabs[a.language]);
  form.append('file', { uri, type: 'audio/m4a', name: 'sale.m4a' } as any);

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': a.apiKey },
    body: form,
    signal,
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);
  const body = await res.json();
  return { transcript: body.text ?? '', raw: body };
}
