# AKE Market Ledger — 3–5 Minute Demo Script

## 0:00–0:25 — Problem

“Many Nigerian micro-merchants still track sales mentally or on paper. Typing is slow during a busy market day, and general speech systems often fail on Nigerian languages and accents. AKE Market Ledger is a voice-first, offline-first ledger built around official N-ATLaS ASR.”

## 0:25–0:55 — Architecture and proof

Briefly show the repository architecture and the gateway health response. Point to the exact model mapping, for example `yo → NCAIR1/Yoruba-ASR`. State that the Hugging Face credential is retained on the VPS and raw audio is processed in memory without retention.

## 0:55–2:10 — Live voice sale

1. Open AKE Ledger and show an existing product such as Rice with price and stock.
2. Tap the voice money-in action.
3. Show “N-ATLaS • NCAIR / Awarri” on screen.
4. Hold the microphone and say a tested phrase, for example: “Mo ta apo iresi meji, o san ẹgbẹrun mẹwa.”
5. Release and show processing.
6. Show the returned transcript, official model identifier, product, quantity, total and paid/debt status.
7. Tap thumbs-up and show the sale in the ledger and changed stock/profit.

Do not rely on an untested phrase during the final recording. Warm the model first and confirm network connectivity.

## 2:10–2:50 — Safety and offline behavior

1. Demonstrate that a low-confidence or failed voice request provides Retry and Enter manually.
2. Disable connectivity and record a manual sale.
3. Explain that SQLite bookkeeping remains functional offline; only cloud voice transcription needs a connection.
4. Mention that every interpreted transaction requires user confirmation before money or stock is changed.

## 2:50–3:35 — Local relevance and validation

Show Yoruba/Hausa/Igbo/English language selection and the real-user validation summary. Report only measured results: participant count, successful transcripts, correct intents, recovery rate and median latency. Do not call simulated prompts real-user interactions.

## 3:35–4:10 — Impact and close

Explain the benefit: faster daily records, visible customer debts, low-stock alerts and true profit after expenses. Close with the attribution:

“N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy and is powered by Awarri Technologies. AKE Market Ledger turns that Nigerian language infrastructure into an accessible financial tool for market traders.”

## Before recording

- Warm the exact language model with one test request.
- Put the phone on Do Not Disturb.
- Use a quiet location but include a short realistic-noise demonstration if it has been tested.
- Keep a manual-entry recovery ready; do not hide failures.
- Capture the health endpoint/model identifier as integration evidence.
- Keep the final video between 3 and 5 minutes.
