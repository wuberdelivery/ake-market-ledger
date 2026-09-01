// ============================================================
// AKE LEDGER — Ledger Repository (Phase 1)
// Every business write is ONE atomic SQLite transaction that:
//   1. inserts the immutable transaction row
//   2. applies the stock delta (if any)
//   3. appends the delta event to sync_outbox
// UI updates instantly from local state; sync happens later.
// ============================================================

import { getDb, nextDeviceSeq, getDeviceId } from './database';
import {
  InputMethod,
  PaymentStatus,
  Transaction,
  TransactionCategory,
  TransactionType,
  uuidv4,
} from '../models/types';

// Simple deterministic idempotency key (stable across retries because
// it is computed once at write time and stored). sha256 would be ideal;
// this stays dependency-free for Phase 1.
function idempotencyKey(
  deviceId: string,
  aggregate: string,
  action: string,
  seq: number
): string {
  return `${deviceId}:${aggregate}:${action}:${seq}`;
}

export interface RecordSaleInput {
  productId: string;
  userId: string;
  quantity: number;         // number of SELL UNITS (e.g. 3 cups)
  amountPaidKobo: number;
  customerId?: string;
  sellUnitId?: string;      // which sell unit; omitted = product default unit
  inputMethod?: InputMethod;
  voiceConfidence?: number;
  note?: string;
}

export interface RecordExpenseInput {
  userId: string;
  totalAmountKobo: number;
  category?: TransactionCategory.EXPENSE | TransactionCategory.RESTOCK;
  expenseType?: string; // ExpenseType — TRANSPORT/FUEL/RENT/SALARY/LEVY/UTILITIES/FEEDING/OTHER
  productId?: string;   // set for RESTOCK
  quantity?: number;    // stock added on RESTOCK
  note?: string;
  inputMethod?: InputMethod;
}

// ------------------------------------------------------------
// 1. Record a sale (Títà Ojà — green button)
// ------------------------------------------------------------
export function recordSale(input: RecordSaleInput): Transaction {
  const db = getDb();
  const now = new Date().toISOString();
  const seq = nextDeviceSeq();
  const deviceId = getDeviceId();
  const txId = uuidv4();

  let created: Transaction | null = null;

  db.transaction(tx => {
    // Load product inside the transaction for a consistent read
    const pr = tx.execute(
      `SELECT id, name, stock_quantity, selling_price_kobo, stock_mode
         FROM products WHERE id = ? AND is_active = 1`,
      [input.productId]
    );
    if (!pr.rows?.length) throw new Error('PRODUCT_NOT_FOUND');
    const product = pr.rows.item(0);

    // Resolve the sell unit: explicit, else the product's default unit.
    // basePerUnit tells us how many BASE units each sold unit consumes.
    let unitPriceKobo = product.selling_price_kobo;
    let basePerUnit = 1;
    let sellUnitId: string | null = input.sellUnitId ?? null;
    let sellUnitLabel: string | null = null;

    const ur = tx.execute(
      `SELECT id, unit_label, base_per_unit, selling_price_kobo, is_default
         FROM product_units
        WHERE product_id = ? AND is_active = 1
        ORDER BY (id = ?) DESC, is_default DESC, sort_order ASC
        LIMIT 1`,
      [input.productId, sellUnitId ?? '']
    );
    if (ur.rows?.length) {
      const u = ur.rows.item(0);
      sellUnitId = u.id;
      sellUnitLabel = u.unit_label;
      basePerUnit = u.base_per_unit;
      unitPriceKobo = u.selling_price_kobo;
    }

    const totalKobo = Math.round(unitPriceKobo * input.quantity);
    const paidKobo = Math.min(input.amountPaidKobo, totalKobo); // overpay guard
    const status =
      paidKobo >= totalKobo ? PaymentStatus.PAID : PaymentStatus.DEBT;

    if (status === PaymentStatus.DEBT && !input.customerId) {
      throw new Error('DEBT_REQUIRES_CUSTOMER');
    }

    // Stock is held in BASE units; a sale of N sell-units removes
    // N * basePerUnit base units (3 cups × 0.025 bag = 0.075 bag).
    const baseConsumed = input.quantity * basePerUnit;
    const newStock = product.stock_quantity - baseConsumed;
    if (product.stock_mode === 'COUNTED' && newStock < -0.0001) {
      throw new Error('OUT_OF_STOCK');
    }

    // 1) immutable transaction row (records the sell unit for history)
    tx.execute(
      `INSERT INTO transactions
        (id, product_id, customer_id, user_id, type, category, quantity,
         total_amount_kobo, amount_paid_kobo, status, input_method,
         voice_confidence, note, sell_unit_id, sell_unit_label,
         sell_unit_count, created_at, device_seq)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        txId, input.productId, input.customerId ?? null, input.userId,
        TransactionType.INFLOW, TransactionCategory.SALE, baseConsumed,
        totalKobo, paidKobo, status,
        input.inputMethod ?? InputMethod.MANUAL,
        input.voiceConfidence ?? null, input.note ?? null,
        sellUnitId, sellUnitLabel, input.quantity, now, seq,
      ]
    );

    // 2) stock delta (in base units)
    tx.execute(
      `UPDATE products SET stock_quantity = ?, updated_at = ? WHERE id = ?`,
      [newStock, now, input.productId]
    );

    // 3) outbox delta event (never the full state)
    tx.execute(
      `INSERT INTO sync_outbox
        (event_id, idempotency_key, aggregate_type, aggregate_id, action,
         payload, sequence_version, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        uuidv4(),
        idempotencyKey(deviceId, 'TRANSACTION', 'CREDIT', seq),
        'TRANSACTION', txId, 'CREDIT',
        JSON.stringify({
          tx_id: txId,
          product_id: input.productId,
          customer_id: input.customerId ?? null,
          user_id: input.userId,
          quantity_delta: -baseConsumed,
          sell_unit_label: sellUnitLabel,
          sell_unit_count: input.quantity,
          total_kobo: totalKobo,
          paid_kobo: paidKobo,
          status,
          created_at: now,
        }),
        seq, now,
      ]
    );

    created = {
      id: txId,
      productId: input.productId,
      customerId: input.customerId ?? null,
      userId: input.userId,
      type: TransactionType.INFLOW,
      category: TransactionCategory.SALE,
      quantity: baseConsumed,
      totalAmountKobo: totalKobo,
      amountPaidKobo: paidKobo,
      status,
      inputMethod: input.inputMethod ?? InputMethod.MANUAL,
      voiceConfidence: input.voiceConfidence ?? null,
      note: input.note ?? null,
      reversalOf: null,
      sellUnitId,
      sellUnitLabel,
      sellUnitCount: input.quantity,
      createdAt: now,
      deviceSeq: seq,
    };
  });

  return created!;
}

// ------------------------------------------------------------
// 1b. Record a BULK sale (truck of yam: sell by money, no unit count)
//     Trader just enters how much money came in; we track it against
//     the load cost so profit appears once the load is recovered.
// ------------------------------------------------------------
export function recordBulkSale(
  productId: string,
  userId: string,
  amountKobo: number,
  customerId?: string,
  note?: string
): string {
  const db = getDb();
  const now = new Date().toISOString();
  const seq = nextDeviceSeq();
  const deviceId = getDeviceId();
  const txId = uuidv4();

  db.transaction(tx => {
    tx.execute(
      `INSERT INTO transactions
        (id, product_id, customer_id, user_id, type, category, quantity,
         total_amount_kobo, amount_paid_kobo, status, input_method,
         note, created_at, device_seq)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        txId, productId, customerId ?? null, userId,
        TransactionType.INFLOW, TransactionCategory.SALE, 0,
        amountKobo, amountKobo, PaymentStatus.PAID,
        InputMethod.MANUAL, note ?? null, now, seq,
      ]
    );
    // accumulate recovered money on the product
    tx.execute(
      `UPDATE products
          SET bulk_recovered_kobo = bulk_recovered_kobo + ?, updated_at = ?
        WHERE id = ?`,
      [amountKobo, now, productId]
    );
    tx.execute(
      `INSERT INTO sync_outbox
        (event_id, idempotency_key, aggregate_type, aggregate_id, action,
         payload, sequence_version, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        uuidv4(),
        idempotencyKey(deviceId, 'TRANSACTION', 'CREDIT', seq),
        'TRANSACTION', txId, 'CREDIT',
        JSON.stringify({
          tx_id: txId, product_id: productId, customer_id: customerId ?? null,
          category: 'SALE', bulk: true, total_kobo: amountKobo,
          paid_kobo: amountKobo, status: 'PAID', created_at: now,
        }),
        seq, now,
      ]
    );
  });
  return txId;
}

// ------------------------------------------------------------
// 2. Record money out (Owótajá — red button): expense or restock
// ------------------------------------------------------------
export function recordExpense(input: RecordExpenseInput): string {
  const db = getDb();
  const now = new Date().toISOString();
  const seq = nextDeviceSeq();
  const deviceId = getDeviceId();
  const txId = uuidv4();
  const category = input.category ?? TransactionCategory.EXPENSE;

  db.transaction(tx => {
    tx.execute(
      `INSERT INTO transactions
        (id, product_id, customer_id, user_id, type, category, quantity,
         total_amount_kobo, amount_paid_kobo, status, expense_type,
         input_method, note, created_at, device_seq)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        txId, input.productId ?? null, null, input.userId,
        TransactionType.OUTFLOW, category, input.quantity ?? 0,
        input.totalAmountKobo, input.totalAmountKobo, PaymentStatus.PAID,
        input.expenseType ?? null,
        input.inputMethod ?? InputMethod.MANUAL,
        input.note ?? null, now, seq,
      ]
    );

    // RESTOCK adds inventory
    if (category === TransactionCategory.RESTOCK && input.productId && input.quantity) {
      tx.execute(
        `UPDATE products
            SET stock_quantity = stock_quantity + ?, updated_at = ?
          WHERE id = ?`,
        [input.quantity, now, input.productId]
      );
    }

    tx.execute(
      `INSERT INTO sync_outbox
        (event_id, idempotency_key, aggregate_type, aggregate_id, action,
         payload, sequence_version, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        uuidv4(),
        idempotencyKey(deviceId, 'TRANSACTION', 'DEBIT', seq),
        'TRANSACTION', txId, 'DEBIT',
        JSON.stringify({
          tx_id: txId,
          category,
          product_id: input.productId ?? null,
          quantity_delta: category === TransactionCategory.RESTOCK ? (input.quantity ?? 0) : 0,
          total_kobo: input.totalAmountKobo,
          created_at: now,
        }),
        seq, now,
      ]
    );
  });

  return txId;
}

// ------------------------------------------------------------
// 3. Record a debt payment (onígbèsè paying down balance)
// ------------------------------------------------------------
export function recordDebtPayment(
  customerId: string,
  userId: string,
  amountKobo: number,
  note?: string
): string {
  const db = getDb();
  const now = new Date().toISOString();
  const seq = nextDeviceSeq();
  const deviceId = getDeviceId();
  const txId = uuidv4();

  db.transaction(tx => {
    tx.execute(
      `INSERT INTO transactions
        (id, customer_id, user_id, type, category, quantity,
         total_amount_kobo, amount_paid_kobo, status, input_method,
         note, created_at, device_seq)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        txId, customerId, userId,
        TransactionType.INFLOW, TransactionCategory.DEBT_PAYMENT, 0,
        amountKobo, amountKobo, PaymentStatus.PAID,
        InputMethod.MANUAL, note ?? null, now, seq,
      ]
    );

    tx.execute(
      `INSERT INTO sync_outbox
        (event_id, idempotency_key, aggregate_type, aggregate_id, action,
         payload, sequence_version, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        uuidv4(),
        idempotencyKey(deviceId, 'TRANSACTION', 'CREDIT', seq),
        'TRANSACTION', txId, 'CREDIT',
        JSON.stringify({
          tx_id: txId, customer_id: customerId,
          category: 'DEBT_PAYMENT', paid_kobo: amountKobo, created_at: now,
        }),
        seq, now,
      ]
    );
  });

  return txId;
}

// ------------------------------------------------------------
// 4. Reverse a mistaken entry (immutable correction, no deletes)
// ------------------------------------------------------------
export function reverseTransaction(
  originalTxId: string,
  userId: string,
  reason?: string
): string {
  const db = getDb();
  const now = new Date().toISOString();
  const seq = nextDeviceSeq();
  const deviceId = getDeviceId();
  const txId = uuidv4();

  db.transaction(tx => {
    const r = tx.execute(`SELECT * FROM transactions WHERE id = ?`, [originalTxId]);
    if (!r.rows?.length) throw new Error('TX_NOT_FOUND');
    const orig = r.rows.item(0);
    if (orig.category === 'REVERSAL') throw new Error('CANNOT_REVERSE_REVERSAL');

    // Opposite-direction row with same magnitude
    const reversedType = orig.type === 'INFLOW' ? 'OUTFLOW' : 'INFLOW';
    tx.execute(
      `INSERT INTO transactions
        (id, product_id, customer_id, user_id, type, category, quantity,
         total_amount_kobo, amount_paid_kobo, status, input_method,
         note, reversal_of, created_at, device_seq)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        txId, orig.product_id, orig.customer_id, userId,
        reversedType, 'REVERSAL', orig.quantity,
        orig.total_amount_kobo, orig.amount_paid_kobo, 'PAID',
        'MANUAL', reason ?? null, originalTxId, now, seq,
      ]
    );

    // Undo the stock effect of a SALE / RESTOCK
    if (orig.product_id && orig.quantity) {
      const stockDelta =
        orig.category === 'SALE' ? orig.quantity :
        orig.category === 'RESTOCK' ? -orig.quantity : 0;
      if (stockDelta !== 0) {
        tx.execute(
          `UPDATE products
              SET stock_quantity = stock_quantity + ?, updated_at = ?
            WHERE id = ?`,
          [stockDelta, now, orig.product_id]
        );
      }
    }

    tx.execute(
      `INSERT INTO sync_outbox
        (event_id, idempotency_key, aggregate_type, aggregate_id, action,
         payload, sequence_version, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        uuidv4(),
        idempotencyKey(deviceId, 'TRANSACTION', 'CREATE', seq),
        'TRANSACTION', txId, 'CREATE',
        JSON.stringify({ tx_id: txId, reversal_of: originalTxId, created_at: now }),
        seq, now,
      ]
    );
  });

  return txId;
}
