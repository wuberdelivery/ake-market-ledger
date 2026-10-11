# Ake Ledger 1.1 Physical-Phone Smoke Test

Use the existing physical-test phone. Install v1.1.4 over the current app; do not uninstall it or clear app data.

## 1. Upgrade and data preservation

1. Install `AKE-Market-Ledger-1.1.4-v8.apk` over the existing app.
2. Open Ake Ledger.
3. Confirm the existing owner, products, customers, stock, expenses, and totals remain present.
4. If any existing data is missing, stop and do not record new production transactions.

## 2. Products, catalog, camera, and stock

1. From Home, open **Items & stock**.
2. Tap **New item**, create `Test product two`, and save it without a price or photo. Confirm the form closes and it appears.
3. Immediately tap **New item** again, create `Test product three`, and confirm this second consecutive product also appears. If either save does nothing, stop and report it.
4. Add a completely custom item that is not in the suggestions. Confirm it also appears.
5. Turn on airplane mode, add another item, and confirm the screen says offline suggestions and still saves locally.
6. Turn connectivity back on, refresh suggestions, and confirm online suggestions load.
7. Add another item using **Take photo**; allow camera permission and confirm the preview. Also test **Choose photo**.
8. Tap **Add stock**, search a saved item, add quantity and cost, then verify the stock total.

## 3. Multi-item receipt

1. Tap **Money In**.
2. Add product A, set quantity 2, and change its unit price.
3. Tap **Add another item** and add product B, quantity 3.
4. Edit product A, then remove/re-add product B once.
5. Confirm every line total and the receipt total.
6. Enter a partial payment, select a customer, and save.
7. Confirm Home profit/stock and Ledger debt changed exactly once.

## 4. Draft recovery

1. Start another two-item sale.
2. Exit with **Keep & exit**.
3. Reopen Money In and confirm both lines, prices, quantities, and payment are restored.
4. Discard the draft and confirm it does not return.

## 5. Voice review (genuine Yoruba speech)

1. Tap the visible **Voice sale** button.
2. Confirm the custom product `Indomine carton` exists, then hold the microphone and say **“Indomie one carton five thousand naira”** without adding “sold” or “ta”; release when finished.
3. Confirm Listening and Processing states are clear.
4. Record the exact displayed ASR transcript and confirm the interpreted product is `Indomine carton`, quantity is 1, and paid amount is ₦5,000.
5. Say only **“carton”** and confirm the app does not guess a product from that generic unit.
6. Confirm the transcript, interpreted product/quantity, total, paid amount, and balance are displayed for review and nothing saves automatically.
7. Use **Review & edit**, correct one field, and save.
8. Test airplane mode or service failure and confirm Retry and manual entry remain available.
9. Start processing once more, tap cancel, and confirm the app returns without saving.

## 6. Settings and users

1. Open the visible gear.
2. Change language to each of English, Yoruba, Hausa, and Igbo; confirm Home and the sale flow update without changing data.
3. Use **Switch user**, record a helper sale, and confirm it is attributed to that helper.
4. Confirm the helper cannot see profit, expense, debt, or history.
5. Use **Log out and lock app**, then sign back in.

## 7. History and correction

1. Open Ledger → Transaction history.
2. Search by product/customer and try Today/7 days/category filters.
3. Open the new grouped sale and tap **Correct this entry**.
4. Confirm it is marked Reversed and the original remains visible.
5. Confirm all sale stock is restored, the debt disappears, and profit/sales count no longer include the receipt.

Record the phone model, Android version, observed result, and any screenshot/error. Genuine interactions may be added to `VALIDATION_LOG.md` only with truthful participant and consent information.
