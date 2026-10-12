# NAIC 2026 Submission Answers — AKE Market Ledger

> Copy these answers into the Innovation & Enterprise application. Replace the team placeholders and upload your valid ID/CAC document before final submission.

## Application track

**Innovation & Enterprise**

## Problem statement

**02 — Voice-First Access**

## Project name

**AKE Market Ledger**

## One-line description

An offline-first Android market ledger that turns explicit Nigerian-language voice input into a reviewable, correctable sale draft instead of silently saving uncertain financial transactions.

## Problem

Many Nigerian micro-retailers and market traders rely on memory or paper because typing every sale is slow, difficult during busy trading, and inaccessible to users with limited digital literacy. Missing records make stock, cash, debt and profit harder to understand. A useful solution must work on an affordable Android phone, tolerate intermittent connectivity, preserve existing data, and never treat uncertain speech as an automatically approved financial transaction.

## Solution

AKE Market Ledger is a working Android bookkeeping application for market traders. The trader deliberately presses and holds the microphone, speaks a sale, and sees the recognized speech together with the interpreted product, quantity and payment. Correct results proceed to payment review; uncertain results show “Needs correction” and open editable fields. Nothing is silently saved from speech.

The application also supports unrestricted inventory items, stock adjustments, photos/gallery, multi-item sales, partial payments and customer debt, drafts, multiple local users, immutable reversals, transaction history and offline manual bookkeeping. Existing local records are retained through versioned SQLite migrations.

## N-ATLAS integration

The Android application sends a deliberately recorded voice clip to the project’s private ASR gateway with the selected language. The gateway decodes and resamples audio to 16 kHz, measures signal quality, applies voice-activity filtering, and routes speech to the corresponding official NCAIR model:

- English — `NCAIR1/NigerianAccentedEnglish`
- Yoruba — `NCAIR1/Yoruba-ASR`
- Igbo — `NCAIR1/Igbo-ASR`
- Hausa — `NCAIR1/Hausa-ASR`

English, Yoruba and Igbo use CPU-optimized CTranslate2 INT8 runtimes in the current deployment. The official Igbo model is decoded without forcing an unsupported base-Whisper `ig` token. The service returns the transcript and model identifier; it does not retain the recording.

A deterministic on-device parser then performs conservative saved-product matching and extracts quantity/payment where confidence permits. Misspellings such as “Indomine” may match a saved Indomie product, while generic words such as “carton” alone are rejected. Every interpretation remains visible and editable before saving.

Live health endpoint: https://wuber.com.ng/ake-ledger/health

## Real-world validation

A consented physical-phone field session on 12 October 2026 used 10 anonymous participant codes and produced 50 server-verified Voice Sale requests:

- 26 English
- 14 Yoruba
- 10 Igbo
- 49 HTTP 200 responses
- 1 safe HTTP 422 no-speech rejection

The service used official NCAIR model routes and retained no audio. Detailed displayed transcript/error evidence is available for 14 interactions. Nine have visible transcript-and-interpretation results: 4/9 transcripts were acceptable/relevant, 2/9 intents were correct before editing, and 8/9 required correction. These limited-sample figures are disclosed rather than extrapolated to all 50 requests. Four Yoruba interactions timed out on the client while the server later completed; Retry and Enter manually remained available. Incorrect Igbo/English quantities or payments were presented for correction rather than silently saved.

Validation workbook: https://wuber.com.ng/storage/ake-ledger/AKE-Market-Ledger-Validation-50.xlsx

Validation summary: https://wuber.com.ng/storage/ake-ledger/AKE-Market-Ledger-Validation-Summary.md

Per-interaction log: https://wuber.com.ng/storage/ake-ledger/AKE-Market-Ledger-Validation-Log.md

Privacy-safe server evidence: https://wuber.com.ng/storage/ake-ledger/AKE-Market-Ledger-Server-Evidence-2026-10-12.csv

## Working artefact

Signed Android APK: https://wuber.com.ng/storage/ake-ledger/AKE-Market-Ledger-1.1.4-v8.apk

APK QR code: https://wuber.com.ng/storage/ake-ledger/AKE-Market-Ledger-1.1.4-APK-QR.png

Android App Bundle: https://wuber.com.ng/storage/ake-ledger/AKE-Market-Ledger-1.1.4-v8.aab

Repository: https://github.com/wuberdelivery/ake-market-ledger

Submission commit on `main`: `f03eec5`

APK SHA-256: `c1abb6050f3e16ff4c4067f35867e7b29a79c8883d3c1f05fd5164b586a148d3`

## Demonstration video

https://wuber.com.ng/storage/ake-ledger/AKE-Market-Ledger-NAIC-2026-Demo.mp4

Duration: 3 minutes 49 seconds. The video preserves actual processing, recognition, correction and timeout behavior rather than presenting edited failures as successes.

## Technical architecture

- React Native Android application
- Local versioned SQLite ledger; offline manual operation
- Explicit press-and-hold microphone recording
- HTTPS FastAPI ASR gateway
- Official language-specific NCAIR Whisper repositories
- CTranslate2 INT8 inference for deployed English, Yoruba and Igbo routes
- Signal telemetry and VAD-based quiet/no-speech rejection
- Deterministic, conservative on-device intent parsing
- Review/edit/payment confirmation before transaction persistence
- Privacy-preserving non-retention of voice recordings

Setup, architecture and operational details are in the repository README and product hardening report.

## Privacy and safety

Recording starts only through deliberate user action and is never continuous. Audio is transmitted over HTTPS for transcription and is not retained by the service. Ledger data remains on the device. Uncertain product, quantity or money values are displayed for review and correction. Silent/unusable speech is rejected. The validation material uses anonymous participant codes and contains no participant names, phone numbers or stored voice clips.

## Impact

The product reduces the typing burden of daily bookkeeping while preserving user control over financial records. It is intended for market traders and micro-retailers who need quick stock, sales, debt and cash records on a low-cost Android phone. Manual bookkeeping remains available offline when voice connectivity is unavailable.

## Scalability and sustainability

The gateway uses quantized CPU inference to reduce deployment cost. Product catalogs are cached locally and custom products do not depend on a central catalog. The architecture can scale the ASR tier independently from the offline ledger. Any deployment beyond the active-user allowance in the official NCAIR model terms will obtain the appropriate commercial licence rather than bypassing those conditions.

## Current limitations

- Hausa is configured but was not physically exercised in the supplied field session.
- Client result screens were not captured for 36 of the 50 server-verified requests, so overall transcript accuracy is not claimed.
- Most visible speech interpretations required correction, especially quantity/payment and Igbo number wording.
- Four Yoruba client requests timed out before the server response arrived.
- The supplied validation screenshots do not prove final saving of a test voice sale.

## Team profile — complete before submission

**Team member 1:** [FULL LEGAL NAME] — [ROLE] — [AFFILIATION]

**Team member 2:** [FULL LEGAL NAME] — [ROLE] — [AFFILIATION]

Additional members, if any: [NAMES, ROLES, AFFILIATIONS]

Team location: [CITY/STATE, NIGERIA]

Contact email: [EMAIL]

Contact phone: [PHONE]

## Required registration/identity document

Upload one of the following in the portal:

- Valid government-issued ID for an individual application; or
- CAC certificate for a registered organisation.

Do not submit until the team profile and identity/registration upload are complete.
