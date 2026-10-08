const fs = require('fs');

const content = `import type { Language } from '../models/types';

export type SttProvider = 'spitch' | 'whisper' | 'elevenlabs' | 'n-atlas';

export interface SttResult {
  transcript: string;
  raw?: any;
}

const LANG_CODE: Record<SttProvider, Record<Language, string>> = {
  spitch:     { yo: 'yo',    ha: 'ha',    ig: 'ig',    en: 'en' },
  whisper:    { yo: 'yo',    ha: 'ha',    ig: 'ig',    en: 'en' },
  elevenlabs: { yo: 'yor',   ha: 'hau',   ig: 'ibo',   en: 'eng' },
  'n-atlas':  { yo: 'yo',    ha: 'ha',    ig: 'ig',    en: 'en' },
};

interface TranscribeArgs {
  provider: SttProvider;
  apiKey: string;
  audioPath: string;
  language: Language;
}

export async function transcribe(args: TranscribeArgs): Promise<SttResult> {
  const { provider, apiKey, audioPath, language } = args;
  const langCode = LANG_CODE[provider][language] || 'en';

  const uri = audioPath.startsWith('file://') ? audioPath : \`file://\${audioPath}\`;
  const form = new FormData();
  form.append('audio', { uri, type: 'audio/m4a', name: 'market_prompt.m4a' } as any);
  form.append('language', langCode);

  let transcript = '';

  if (provider === 'n-atlas') {
    const endpoint = 'https://api.ncair.nitda.gov.ng/n-atlas/v1/audio/transcriptions';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': \`Bearer \${apiKey}\` },
      body: form,
    });

    if (!res.ok) {
      throw new Error(\`N-ATLAS API request failed with status \${res.status}\`);
    }

    const data = await res.json();
    transcript = data.transcript || data.text || '';
  }

  return { transcript };
}
`;

fs.writeFileSync('./voice/sttProviders.ts', content);
console.log('Successfully updated sttProviders.ts!');
