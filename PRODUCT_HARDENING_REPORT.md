# Ake Ledger 1.1 Product Hardening Report

Date: 11 October 2026
Release: Android `1.1.4` (`versionCode 8`)

## Root causes reproduced

1. **One-item sales:** the old `SaleScreen` held one product, one unit, and one quantity. `recordSale()` inserted exactly one transaction and the schema had no receipt/group identifier.
2. **Unreliable Yoruba numbers:** the parser used a small exact-word dictionary and a short money window. It missed diacritic/ASR spelling variation, thousands, hundreds, comma-formatted digits, currency-before-amount phrases, English number words, and some additive compounds.
3. **Voice correction was lost:** `VoiceSaleScreen` passed an intent to its manual fallback, but `App.tsx` ignored the argument, so recognized product/quantity/amount did not reach editable fields.
4. **User attribution could change silently:** the dashboard refresh selected the owner on every refresh, even after a helper logged in.
5. **Language and logout were hidden:** language was available only during onboarding and user switching depended on a long press.
6. **Corrections did not fully leave reports:** reversals were appended, but reporting views did not exclude the reversed original transaction.
7. **Only the first product saved:** QuickSQLite's `transaction()` returns a Promise and schedules its callback, but synchronous repositories did not await it. `nextDeviceSeq()` therefore returned `0` before incrementing; the first product used an outbox key ending in `0`, and later products collided with that unique key and rolled back.
8. **Successful voice responses looked empty:** the gateway returned HTTP 200 for the device recordings, but low-confidence or incomplete results were redirected to manual entry before Voice Sale visibly displayed the transcript.
9. **The physical phone recorded digital silence:** gateway diagnostics on four genuine 3–7 second recordings measured both RMS and peak amplitude as exactly zero. The device accepted Android `VOICE_RECOGNITION` at 16 kHz but wrote silent AAC; the former English inference path then hallucinated unrelated text from that silence.

## Implemented changes

### Multi-item sales and data integrity

- Added schema migration v3 with `sale_groups`, nullable group/line columns on existing transactions, and indexes. Existing rows remain valid and no table is destructively rebuilt.
- Added `recordSaleBatch()`. Receipt metadata, all immutable line transactions, exact payment allocation, stock deltas, and one sync outbox event commit in one SQLite transaction.
- Added an editable cart: add, search, select unit, change quantity, override the receipt-time unit price, edit/remove lines, view line/receipt totals, enter payment, and assign a customer for debt.
- Added per-user local sale drafts. An interrupted sale or add-product/customer detour can resume without exposing one user's draft to another.
- Kept money as integer kobo. Payment allocation is deterministic and cannot create or lose a kobo; overpayment is capped at the receipt total.
- Bulk money-only products remain a separate flow because they use load-recovery accounting rather than counted stock.

### Voice and Yoruba parsing

- Added a visible microphone button on Home. Recording starts only through explicit press-and-hold and is never continuous.
- Added distinct ready, listening, processing, fallback, transcript-review, retry, edit, save, and cancel states.
- Cancel now aborts an active transcription request as well as the recorder.
- Recognized speech, interpreted product/quantity, total, paid amount, and debt balance are visible before saving.
- Low-confidence/incomplete recognition now opens the manual cart with the transcript and recognized fields prefilled for correction.
- Expanded deterministic number handling for diacritics, common ASR spellings, 0–19 Yoruba words, tens, hundreds, thousands, millions, additive compounds, digits with commas, currency before/after amount, and Nigerian-English number words.
- Product matching now considers saved voice aliases as well as product names.
- Voice Sale accepts product-first shorthand without an explicit sale verb because listening starts only after a deliberate Voice Sale action. It uses conservative typo-tolerant matching for saved custom names (for example, spoken `Indomie` can match saved `Indomine carton`) but rejects a lone generic unit such as `carton`. Review remains mandatory and nothing is saved automatically.
- Incomplete or low-confidence recognition now stays on a visible Voice Sale review screen showing the exact ASR transcript and which fields need correction. The trader can retry or open prefilled editable fields; a successful server response no longer appears to produce nothing.
- Android recording now uses the library's standard `MIC`/AAC/MPEG-4 device defaults rather than forcing `VOICE_RECOGNITION` at 16 kHz. The gateway resamples to 16 kHz, rejects silent/very quiet recordings, applies voice-activity filtering, and runs Nigerian English through the official model's INT8 runtime.

### Inventory, unrestricted products, and camera recovery

- Added a visible **Items & stock** screen on Home with search, current quantities, New item, and Restock actions. Product creation is no longer buried inside a sale.
- Counted products now require only a name. Opening stock, cost, selling price, and photo are optional; a missing selling price can be entered on the sale line. Custom names are always accepted.
- Added 21 common market-item suggestions in all four app languages, including Beans/Ẹ̀wà/Wake/Agwa and Indomie/noodles spelling variants. The app refreshes suggestions from `GET /api/v1/catalog`, caches them, and always has the same built-in catalog when the server/network is unavailable. Catalog entries never guess prices or stock.
- Fixed Android camera handling by requesting runtime permission and surfacing denial/errors. Added a gallery picker and made it explicit that a photo is optional and does not identify the item.
- Added New item and search directly to Restock, so an item can be created and immediately stocked.
- Replaced unawaited QuickSQLite Promise transactions with explicit synchronous atomic transactions, matching the repository API. Sequence allocation and each product/outbox write now finish before the screen refreshes, so the second and later products no longer reuse the first product's outbox key. The same repair protects sales, expenses, restocks, customers, settings, and corrections.

### Settings, language, access, and history

- Added an always-visible Settings button with post-onboarding English, Yoruba, Hausa, and Igbo selection. The choice persists and does not modify ledger data.
- Added visible Switch user and Log out/lock controls.
- Preserved the selected active user across refreshes, fixing helper sale attribution.
- Helpers can record sales but do not see owner profit, expense, debt, or history screens.
- Added searchable/filterable transaction history by text, date, and category.
- Added immutable correction: a grouped receipt reverses atomically; original records remain visible and are marked reversed.
- Rebuilt profit, expense, cash, sale-count, and customer-debt views so linked reversals remove the original effects.

## Significant technical choices

- **Receipt group plus immutable transaction lines:** keeps existing transaction/reporting architecture and sync model while adding multi-item receipts without rewriting historical data.
- **Receipt-level payment allocated line-by-line:** preserves the existing per-transaction debt model and produces exact aggregate balances.
- **Reversal instead of editing/deleting:** maintains an audit trail and permits stock/money/debt reports to be recomputed safely.
- **Pure math/parser tests plus migration simulation:** QuickSQLite is a native JSI module and does not load in Jest. Native persistence is therefore covered by pure invariant tests, a real SQLite migration check, release build, and device smoke test.
- **No supplier subsystem added:** the current architecture has no supplier entity and adding one before the deadline would enlarge scope without improving the highest-frequency sale/expense/stock flows.

## Verification completed

- `npm run typecheck` — passed.
- `npm test -- --runInBand` — 4 suites, 25 tests passed, including synchronous commit/rollback behavior, custom `Indomine carton`, product-first `Indomie one carton five thousand naira`, generic-unit rejection, and explicit non-sale rejection.
- `npm run lint` — 0 errors (legacy/style warnings remain).
- `python3 scripts/check_schema_v3.py` — passed fresh v1→v2→v3 schema, grouped receipt totals, one-receipt sale count, partial debt, profit, and reversal exclusion.
- Android `assembleRelease` and `bundleRelease` — passed on the deployment VPS.
- APK identity — `com.akeledger`, version `1.1.4`, code `8`.
- APK signing verification — passed APK Signature Scheme v1 and v2.
- Public HTTPS APK download — HTTP 200 and downloaded SHA-256 matched the release artifact.
- Public catalog endpoint — HTTP 200; 21 suggestions, Beans and Indomie/noodles aliases present, custom products explicitly allowed.

## Release artifacts

- APK: `https://wuber.com.ng/storage/ake-ledger/AKE-Market-Ledger-1.1.4-v8.apk`
- APK QR: `https://wuber.com.ng/storage/ake-ledger/AKE-Market-Ledger-1.1.4-APK-QR.png`
- AAB: `https://wuber.com.ng/storage/ake-ledger/AKE-Market-Ledger-1.1.4-v8.aab`
- Checksums: `https://wuber.com.ng/storage/ake-ledger/SHA256SUMS-1.1.4.txt`
- APK SHA-256: `c1abb6050f3e16ff4c4067f35867e7b29a79c8883d3c1f05fd5164b586a148d3`
- AAB SHA-256: `5f65b79a5fd62daa81aebf59217b5e709f1d918fd5dc1d1a4bf0510cf2c31949`

## Physical-phone result for v1.1.4

- On 11 October 2026, a genuine Nigerian English Voice Sale recording from the test phone reached the gateway with 8.21 seconds of non-silent audio (RMS `0.14193`, peak `0.87793`) and returned HTTP 200 through the official Nigerian-accented English model's INT8 runtime.
- The displayed transcript was `tolled two cartons of indomin a n11,000`. Although ASR spelling was imperfect, conservative alias matching correctly opened editable review for **Indomie noodles × 2**, **₦11,000**, full payment. Nothing was saved automatically.
- This confirms the v1.1.4 microphone path, upload, official English ASR inference, typo-tolerant product matching, quantity/amount extraction, and review fallback on that physical phone.
- A later physical-phone screenshot shows four separate persisted inventory entries (Honey Beans, Indomie noodles, Rice, and Tin tomatoes), confirming that the first-product-only transaction collision is repaired and multiple products can be added.

## Remaining validation and speech limitations

- The user still needs to complete the wider smoke test: an arbitrary non-catalog custom product through Voice Sale, a two-item partial-payment sale, restart/draft recovery, language switching, user switching, reversal, and genuine spoken Yoruba. Igbo also requires a fresh genuine-speech retest after the live v1.2.3 decoding repair.
- One successful genuine English interaction establishes functionality, not general speech accuracy. Synthetic tones verify infrastructure only and must not be represented as speech accuracy evidence.
- Yoruba parsing is deterministic and intentionally constrained; it is not a general Yoruba-language understanding model. Regional wording, ASR substitutions, and complex traditional number forms may still need manual correction.
- The gateway has mappings for official Yoruba, Hausa, Igbo, and Nigerian-accented English ASR repositories, but this deployment has been performance-verified only with the official Yoruba model. Other voice-language paths must be treated as unverified until tested end to end; manual bookkeeping remains available.
- The required formal validation log remains at 0/50 because participant consent/metadata has not yet been recorded. The physical interaction above is valid engineering evidence but must not be counted toward the challenge threshold without the required consent-safe documentation.
- Hausa/Igbo translations are implementation drafts and require native-speaker review before making quality claims.
