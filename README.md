# AKE Market Ledger

> Voice-first, offline-first bookkeeping for Nigerian micro-merchants, powered by the official N-ATLaS speech-recognition models.

## What it does

AKE Market Ledger is a React Native Android/iOS application for recording multi-item sales, expenses, stock and customer debt. Core bookkeeping uses an on-device SQLite database and remains available offline. Voice sales require connectivity to the project's secure ASR gateway; if voice processing fails, the trader can retry or continue with editable manual entry without losing access to the ledger.

Version 1.1 adds a visible Items & stock area, unrestricted custom products, online/offline market suggestions, corrected camera/gallery handling, atomic grouped receipts, an editable cart and recoverable per-user drafts, searchable transaction history with immutable correction, reversal-aware reports, visible voice activation, persistent language Settings, and explicit user switching/logout. Schema migration v3 preserves existing rows; it only adds receipt metadata and nullable links.

Configured official voice-model mappings:

- Yoruba (`NCAIR1/Yoruba-ASR`)
- Hausa (`NCAIR1/Hausa-ASR`)
- Igbo (`NCAIR1/Igbo-ASR`)
- Nigerian-accented English (`NCAIR1/NigerianAccentedEnglish`)

These mappings are not an accuracy claim. The current deployment has been performance-verified end to end only for the official Yoruba model. Hausa, Igbo, and Nigerian-accented English voice paths remain unverified until genuine speech is tested; manual bookkeeping remains available for every app language.

## Genuine N-ATLaS integration

The mobile client records an AAC/M4A clip and sends it to the project gateway over HTTPS. The gateway:

1. validates request size and duration;
2. decodes audio in memory to mono 16 kHz;
3. selects the official NCAIR ASR model for the chosen language;
4. returns the transcript and exact model identifier; and
5. immediately discards the audio waveform.

The transcript is converted locally into a constrained sale intent. The trader must confirm the product, quantity, amount and payment status before the SQLite ledger is updated.

`NCAIR1/N-ATLaS` is an 8B text-generation LLM and is **not** used as an audio endpoint. Voice input uses the official language-specific N-ATLaS ASR repositories listed above.

> **Attribution:** N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy and is powered by Awarri Technologies. The ASR models are published by the National Centre for Artificial Intelligence and Robotics (NCAIR) in partnership with Awarri Technologies.

## Architecture

```text
Android/iOS app
  ├─ microphone permission + native AAC recorder
  ├─ HTTPS multipart upload
  ├─ deterministic local sale-intent parser
  └─ local SQLite ledger (offline-first)
              │
              ▼
https://wuber.com.ng/ake-ledger/
  └─ FastAPI ASR gateway (single process, loopback behind Nginx)
       ├─ in-memory audio decode; no audio retention
       ├─ request size/duration/rate limits
       └─ lazy-load one official N-ATLaS ASR model at a time
```

Important source paths:

- `screens/VoiceSaleScreen.tsx` — voice UX, confirmation and recovery
- `voice/voiceRouter.ts` — microphone permission, recording and intent routing
- `voice/sttProviders.ts` — typed HTTPS client for the N-ATLaS gateway
- `voice/yorubaIntentParser.ts` — deterministic constrained intent parser
- `server/app.py` — official N-ATLaS model gateway
- `db/database.ts` — local schema and migrations
- `db/ledgerRepository.ts` — transaction writes and stock/debt invariants

## Mobile development

Prerequisites: Node.js 18+, JDK 17 and the Android SDK.

```bash
npm ci
npm run typecheck
npm test -- --runInBand
npm run check:migration
npm run lint

# Android debug build
export ANDROID_HOME="$HOME/Android/Sdk"
export JAVA_HOME=/path/to/jdk17
cd android
./gradlew assembleDebug
```

Release signing values are read from the operator's private Gradle properties and are never committed.

Current signed Android release:

- APK: `https://wuber.com.ng/storage/ake-ledger/AKE-Market-Ledger-1.1.1-v5.apk`
- QR: `https://wuber.com.ng/storage/ake-ledger/AKE-Market-Ledger-1.1.1-APK-QR.png`
- SHA-256: `ce4c405266bc4903b37fb125e53e3f2a9da54f9e3172047bb01d13a9ff5621ba`

See `PRODUCT_HARDENING_REPORT.md` and `DEVICE_SMOKE_TEST_V1.1.md` for implementation decisions, verified checks, and the remaining physical-phone gate.

## VPS deployment

The gateway is designed for Ubuntu 24.04 with Python 3.12, Nginx and PM2. A CPU VPS with 8–12 GB RAM can keep one Whisper Small model resident. It does not require a GPU for a short demonstration, although a GPU or managed inference endpoint is recommended at scale.

Before deployment, sign in to Hugging Face, accept the terms for each required NCAIR model, and create a fine-grained read token.

```bash
bash server/setup_vps.sh
cp server/.env.example server/.env
chmod 600 server/.env
# Edit HF_TOKEN locally on the server; never commit it.

pm2 start server/ecosystem.config.cjs
pm2 save
bash server/install_nginx.sh   # prompts for sudo
curl https://wuber.com.ng/ake-ledger/health
```

See `server/README.md` for the endpoint contract.

## Privacy and safety

- Raw voice audio is decoded in memory and not written to application storage.
- The Hugging Face credential exists only in `server/.env` on the VPS.
- The APK contains no N-ATLaS provider credential.
- The service accepts clips no longer than 31 seconds and no larger than 8 MB.
- The user sees and confirms the interpreted transaction before it is committed.
- Low-confidence or incomplete intents fall back to editable manual entry.
- The local ledger works without network access; only cloud voice transcription requires connectivity.

## Validation

NAIC Voice-First Access requires at least 50 documented **real-user interactions**. Synthetic parser tests are useful engineering evidence but do not replace that requirement. `VALIDATION_LOG.md` is the evidence template and must contain truthful, consent-safe results from actual sessions before submission.

## License and model terms

Review and comply with the terms displayed in each gated NCAIR model repository. The published model terms include attribution and active-user limitations. Commercial or larger-scale use may require a separate agreement with Awarri Technologies/NCAIR.
