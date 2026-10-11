# Ake Ledger 1.1 Product Hardening Report

Date: 11 October 2026
Release: Android `1.1.3` (`versionCode 7`)

## Root causes reproduced

1. **One-item sales:** the old `SaleScreen` held one product, one unit, and one quantity. `recordSale()` inserted exactly one transaction and the schema had no receipt/group identifier.
2. **Unreliable Yoruba numbers:** the parser used a small exact-word dictionary and a short money window. It missed diacritic/ASR spelling variation, thousands, hundreds, comma-formatted digits, currency-before-amount phrases, English number words, and some additive compounds.
3. **Voice correction was lost:** `VoiceSaleScreen` passed an intent to its manual fallback, but `App.tsx` ignored the argument, so recognized product/quantity/amount did not reach editable fields.
4. **User attribution could change silently:** the dashboard refresh selected the owner on every refresh, even after a helper logged in.
5. **Language and logout were hidden:** language was available only during onboarding and user switching depended on a long press.
6. **Corrections did not fully leave reports:** reversals were appended, but reporting views did not exclude the reversed original transaction.
7. **Only the first product saved:** QuickSQLite's `transaction()` returns a Promise and schedules its callback, but synchronous repositories did not await it. `nextDeviceSeq()` therefore returned `0` before incrementing; the first product used an outbox key ending in `0`, and later products collided with that unique key and rolled back.
8. **Successful voice responses looked empty:** the gateway returned HTTP 200 for the device recordings, but low-confidence or incomplete results were redirected to manual entry before Voice Sale visibly displayed the transcript.

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
- APK identity — `com.akeledger`, version `1.1.3`, code `7`.
- APK signing verification — passed APK Signature Scheme v1 and v2.
- Public HTTPS APK download — HTTP 200 and downloaded SHA-256 matched the release artifact.
- Public catalog endpoint — HTTP 200; 21 suggestions, Beans and Indomie/noodles aliases present, custom products explicitly allowed.

## Release artifacts

- APK: `https://wuber.com.ng/storage/ake-ledger/AKE-Market-Ledger-1.1.3-v7.apk`
- APK QR: `https://wuber.com.ng/storage/ake-ledger/AKE-Market-Ledger-1.1.3-APK-QR.png`
- AAB: `https://wuber.com.ng/storage/ake-ledger/AKE-Market-Ledger-1.1.3-v7.aab`
- Checksums: `https://wuber.com.ng/storage/ake-ledger/SHA256SUMS-1.1.3.txt`
- APK SHA-256: `53bc680f21b9bf9777f51b55d9fe658cf2055e0c6f9c52a02f488168298d8e70`
- AAB SHA-256: `cc05de8d5b86fad1022bf0394bf5206089147280cf91cf3f082a548ef05b9fde`

## Remaining validation and speech limitations

- A physical-phone smoke test of this exact v7 build is still required, including upgrading over v6 with existing data, adding at least two new products consecutively, saying `Indomie one carton five thousand naira` for the saved custom `Indomine carton`, comparing the displayed transcript, a two-item partial-payment sale, restart/draft recovery, language switching, user switching, reversal, and genuine spoken Yoruba.
- Genuine spoken-audio accuracy has not yet been measured. Synthetic tones verify infrastructure only and must not be represented as speech accuracy evidence.
- Yoruba parsing is deterministic and intentionally constrained; it is not a general Yoruba-language understanding model. Regional wording, ASR substitutions, and complex traditional number forms may still need manual correction.
- The gateway has mappings for official Yoruba, Hausa, Igbo, and Nigerian-accented English ASR repositories, but this deployment has been performance-verified only with the official Yoruba model. Other voice-language paths must be treated as unverified until tested end to end; manual bookkeeping remains available.
- The required 50 real-user interactions remain at 0/50. Parser tests and generated audio do not count.
- Hausa/Igbo translations are implementation drafts and require native-speaker review before making quality claims.
