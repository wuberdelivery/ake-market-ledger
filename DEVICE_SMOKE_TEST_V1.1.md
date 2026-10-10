# Ake Ledger 1.1 Physical-Phone Smoke Test

Use a phone that already has v1.0.2 if possible. Do not clear app data.

## 1. Upgrade and data preservation

1. Install `AKE-Market-Ledger-1.1.0-v4.apk` over the existing app.
2. Open Ake Ledger.
3. Confirm the existing owner, products, customers, stock, expenses, and totals remain present.
4. If any existing data is missing, stop and do not record new production transactions.

## 2. Multi-item receipt

1. Tap **Money In**.
2. Add product A, set quantity 2, and change its unit price.
3. Tap **Add another item** and add product B, quantity 3.
4. Edit product A, then remove/re-add product B once.
5. Confirm every line total and the receipt total.
6. Enter a partial payment, select a customer, and save.
7. Confirm Home profit/stock and Ledger debt changed exactly once.

## 3. Draft recovery

1. Start another two-item sale.
2. Exit with **Keep & exit**.
3. Reopen Money In and confirm both lines, prices, quantities, and payment are restored.
4. Discard the draft and confirm it does not return.

## 4. Voice review (genuine Yoruba speech)

1. Tap the visible **Voice sale** button.
2. Hold the microphone and speak one genuine sale; release when finished.
3. Confirm Listening and Processing states are clear.
4. Confirm the exact transcript, interpreted product/quantity, total, paid amount, and balance are displayed.
5. Use **Review & edit**, correct one field, and save.
6. Test airplane mode or service failure and confirm Retry and manual entry remain available.
7. Start processing once more, tap cancel, and confirm the app returns without saving.

## 5. Settings and users

1. Open the visible gear.
2. Change language to each of English, Yoruba, Hausa, and Igbo; confirm Home and the sale flow update without changing data.
3. Use **Switch user**, record a helper sale, and confirm it is attributed to that helper.
4. Confirm the helper cannot see profit, expense, debt, or history.
5. Use **Log out and lock app**, then sign back in.

## 6. History and correction

1. Open Ledger → Transaction history.
2. Search by product/customer and try Today/7 days/category filters.
3. Open the new grouped sale and tap **Correct this entry**.
4. Confirm it is marked Reversed and the original remains visible.
5. Confirm all sale stock is restored, the debt disappears, and profit/sales count no longer include the receipt.

Record the phone model, Android version, observed result, and any screenshot/error. Genuine interactions may be added to `VALIDATION_LOG.md` only with truthful participant and consent information.
