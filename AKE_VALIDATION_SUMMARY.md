# AKE Market Ledger — Validation Evidence Summary

**Date:** 12 October 2026 (WAT)  
**Release:** Android 1.1.4 (version code 8)  
**ASR service:** 1.2.3  
**Device:** Motorola Moto G 5G / Android 13

## Executive result

A consented physical-phone field session used 10 anonymous participant codes and generated **50 server-verified Voice Sale requests**. The language mix was **26 English, 14 Yoruba, and 10 Igbo**. The official NCAIR model routing returned **49 HTTP 200 responses**, while one Igbo attempt was safely rejected with HTTP 422 because no usable speech was recognized.

The result should not be described as 50 successful transcriptions. Detailed client transcript/error evidence exists for 14 interactions; 36 response transcripts were not captured and were not invented. Nine interactions have visible transcript-and-interpretation screens suitable for limited quality scoring.

## Official model evidence

- English: `NCAIR1/NigerianAccentedEnglish`
- Yoruba: `NCAIR1/Yoruba-ASR`
- Igbo: `NCAIR1/Igbo-ASR`
- Runtime for these requests: CTranslate2 INT8
- Server audio retention: none

## Limited captured quality sample (n=9)

- Acceptable/relevant transcript: **4/9 (44.4%)**
- Correct product, quantity and amount before editing: **2/9 (22.2%)**
- Correction required: **8/9 (88.9%)**
- Observed recovery to a correct review state: **1/9 (11.1%)**

These figures apply only to the nine visible result screens. They are not extrapolated to the other requests.

## Safety and recovery observations

- Uncertain interpretations displayed **Needs correction** and required explicit review.
- Incorrect amount/quantity results were not silently saved.
- The no-speech request returned HTTP 422 rather than hallucinated transaction text.
- Four client timeouts displayed **Retry** and **Enter manually** while the server later recorded HTTP 200.
- Genuine post-repair Igbo transcripts were returned on the physical phone, establishing that the fixed Igbo route runs; Igbo quantity/amount parsing still commonly required correction.

## Limitations disclosed for submission

1. Detailed client transcripts are unavailable for 36 of 50 requests because the privacy-preserving server does not retain them and the facilitator did not capture every result screen.
2. The visible quality sample is small and performed poorly; failures remain in the evidence.
3. Final saved-sale completion is not evidenced in the supplied field-session screenshots.
4. Latency was not measured consistently and is not claimed.
5. Yoruba mobile client timeout behavior remains visible even when the server eventually completes.

## Evidence files

- `AKE_Real_User_Validation_50.xlsx`
- `AKE_Server_Request_Evidence_2026-10-12.csv`
- `VALIDATION_LOG.md`
- Supplied screenshots and screen recordings
