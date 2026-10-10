# AKE Market Ledger — Real-User Validation Log

**NAIC problem statement:** Voice-First Access

**Target service:** Official N-ATLaS ASR models published by NCAIR/Awarri

**Required threshold:** At least 50 documented real-user interactions

> Integrity note: synthetic prompts, developer simulations and automated parser tests must be reported separately. They do not count as real-user interactions. Do not record names, phone numbers or raw voice clips in this public repository without explicit consent.

## Method

For every interaction, record a pseudonymous participant code, date, setting, language, device/network condition, expected transaction, exact ASR transcript, parsed result, correction required and outcome. A successful test must exercise the working application and official N-ATLaS ASR model—not a typed transcript or mocked response.

Suggested consent statement: “We are testing a voice bookkeeping application. Your short recording will be processed for transcription and will not be retained by our server. May we record the anonymous result of this test?”

## Summary — complete after testing

| Metric | Result |
|---|---:|
| Real interactions completed | **0 / 50 — replace with verified count** |
| Unique participants | **Not yet documented** |
| Yoruba interactions | 0 |
| Hausa interactions | 0 |
| Igbo interactions | 0 |
| Nigerian English interactions | 0 |
| Exact transcript success | Not yet calculated |
| Correct sale intent before editing | Not yet calculated |
| Successful manual recovery | Not yet calculated |
| Median end-to-end latency | Not yet calculated |

## Interaction evidence

Fill all 50 rows. Add rows if one person performs multiple clearly distinct interactions; report the number of unique participants separately.

| ID | Date/time (WAT) | Participant code | Language | Setting/noise | Expected product / qty / payment | ASR transcript | Model ID | Parsed correctly? | Correction/retry | Latency | Final outcome |
|---:|---|---|---|---|---|---|---|---|---|---:|---|
| 01 | | | | | | | | | | | |
| 02 | | | | | | | | | | | |
| 03 | | | | | | | | | | | |
| 04 | | | | | | | | | | | |
| 05 | | | | | | | | | | | |
| 06 | | | | | | | | | | | |
| 07 | | | | | | | | | | | |
| 08 | | | | | | | | | | | |
| 09 | | | | | | | | | | | |
| 10 | | | | | | | | | | | |
| 11 | | | | | | | | | | | |
| 12 | | | | | | | | | | | |
| 13 | | | | | | | | | | | |
| 14 | | | | | | | | | | | |
| 15 | | | | | | | | | | | |
| 16 | | | | | | | | | | | |
| 17 | | | | | | | | | | | |
| 18 | | | | | | | | | | | |
| 19 | | | | | | | | | | | |
| 20 | | | | | | | | | | | |
| 21 | | | | | | | | | | | |
| 22 | | | | | | | | | | | |
| 23 | | | | | | | | | | | |
| 24 | | | | | | | | | | | |
| 25 | | | | | | | | | | | |
| 26 | | | | | | | | | | | |
| 27 | | | | | | | | | | | |
| 28 | | | | | | | | | | | |
| 29 | | | | | | | | | | | |
| 30 | | | | | | | | | | | |
| 31 | | | | | | | | | | | |
| 32 | | | | | | | | | | | |
| 33 | | | | | | | | | | | |
| 34 | | | | | | | | | | | |
| 35 | | | | | | | | | | | |
| 36 | | | | | | | | | | | |
| 37 | | | | | | | | | | | |
| 38 | | | | | | | | | | | |
| 39 | | | | | | | | | | | |
| 40 | | | | | | | | | | | |
| 41 | | | | | | | | | | | |
| 42 | | | | | | | | | | | |
| 43 | | | | | | | | | | | |
| 44 | | | | | | | | | | | |
| 45 | | | | | | | | | | | |
| 46 | | | | | | | | | | | |
| 47 | | | | | | | | | | | |
| 48 | | | | | | | | | | | |
| 49 | | | | | | | | | | | |
| 50 | | | | | | | | | | | |

## Engineering tests (do not count toward the 50)

Automated tests under `__tests__/` verify deterministic parsing, including Yoruba quantity/amount separation, Nigerian English phrasing and safe rejection of unknown products. Record API health checks and device/build checks in the release notes, not as real-user validation.
