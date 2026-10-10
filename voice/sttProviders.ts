// ============================================================
// AKE LEDGER — official N-ATLaS ASR client
//
// Audio is uploaded to the AKE VPS gateway. The gateway holds the gated
// Hugging Face token and runs the official language-specific NCAIR/Awarri
// ASR model; no provider credential is bundled in the Android app.
// ============================================================

import type { Language } from '../models/types';
import { N_ATLAS_ASR_BASE_URL, N_ATLAS_CLIENT_TOKEN } from './config';

export interface SttResult {
  transcript: string;
  model: string;
  processingMs?: number;
  raw?: unknown;
}

interface TranscribeArgs {
  audioPath: string;
  language: Language;
  timeoutMs?: number;
}

export class SttError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'SttError';
    this.status = status;
  }
}

export async function transcribe({
  audioPath,
  language,
  timeoutMs = 120000,
}: TranscribeArgs): Promise<SttResult> {
  const uri = audioPath.startsWith('file://') ? audioPath : `file://${audioPath}`;
  const form = new FormData();
  form.append('audio', {
    uri,
    type: 'audio/mp4',
    name: 'market-sale.m4a',
  } as any);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers: Record<string, string> = {};
  if (N_ATLAS_CLIENT_TOKEN) {
    headers.Authorization = `Bearer ${N_ATLAS_CLIENT_TOKEN}`;
  }

  try {
    const base = N_ATLAS_ASR_BASE_URL.replace(/\/$/, '');
    const response = await fetch(
      `${base}/api/v1/transcribe?language=${encodeURIComponent(language)}`,
      {
        method: 'POST',
        headers,
        body: form,
        signal: controller.signal,
      },
    );

    let body: any = null;
    try {
      body = await response.json();
    } catch {
      // Preserve a useful generic error when a proxy returns HTML.
    }

    if (!response.ok) {
      const detail = typeof body?.detail === 'string'
        ? body.detail
        : `N-ATLaS voice service returned ${response.status}.`;
      throw new SttError(detail, response.status);
    }

    const transcript = String(body?.text ?? body?.transcript ?? '').trim();
    if (!transcript) {
      throw new SttError('No speech was recognized. Please try again.', 422);
    }

    return {
      transcript,
      model: String(body?.model ?? 'N-ATLaS ASR'),
      processingMs: typeof body?.processing_ms === 'number'
        ? body.processing_ms
        : undefined,
      raw: body,
    };
  } catch (error: any) {
    if (error instanceof SttError) {
      throw error;
    }
    if (error?.name === 'AbortError') {
      throw new SttError('Voice processing timed out. Please retry.', 408);
    }
    throw new SttError(
      'Could not reach the N-ATLaS voice service. Check the connection and retry.',
    );
  } finally {
    clearTimeout(timer);
  }
}
