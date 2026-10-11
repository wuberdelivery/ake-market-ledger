// ============================================================
// AKE LEDGER — Ledger Repository (Phase 1)
// Every business write is ONE atomic SQLite transaction that:
//   1. inserts the immutable transaction row
//   2. applies the stock delta (if any)
//   3. appends the delta event to sync_outbox
// UI updates instantly from local state; sync happens later.
// ============================================================

import {getDb, nextDeviceSeq, getDeviceId, transactionSync} from './database';
import {
  InputMethod,
  PaymentStatus,
  Transaction,
  TransactionCategory,
  TransactionType,
  uuidv4,
} from '../models/types';
import {allocatePaymentKobo, lineTotalKobo} from '../utils/saleMath';

// Simple deterministic idempotency key (stable across retries because
// it is computed once at write time and stored). sha256 would be ideal;
// this stays dependency-free for Phase 1.
function idempotencyKey(
  deviceId: string,
  aggregate: string,
  action: string,
  seq: number,
): string {
  return `${deviceId}:${aggregate}:${action}:${seq}`;
}

export interface RecordSaleInput {
  productId: string;
  userId: string;
  quantity: number;
  amountPaidKobo: number;
  customerId?: string;
  sellUnitId?: string;
  inputMethod?: InputMethod;
  voiceConfidence?: number;
  note?: string;
}

export interface RecordSaleLineInput {
  productId: string;
  quantity: number;
  sellUnitId?: string;
  unitPriceKobo?: number; // optional receipt-time override; product price is unchanged
}

export interface RecordSaleBatchInput {
  userId: string;
  items: RecordSaleLineInput[];
  amountPaidKobo: number;
  customerId?: string;
  inputMethod?: InputMethod;
  voiceConfidence?: number;
  note?: string;
}

export interface RecordedSaleGroup {
  id: string;
  receiptNumber: string;
  totalAmountKobo: number;
  amountPaidKobo: number;
  status: PaymentStatus;
  transactions: Transaction[];
}

export interface RecordExpenseInput {
  userId: string;
  totalAmountKobo: number;
  category?: TransactionCategory.EXPENSE | TransactionCategory.RESTOCK;
  expenseType?: string;
  productId?: string;
  quantity?: number;
  note?: string;
  inputMethod?: InputMethod;
}

interface ResolvedSaleLine {
  productId: string;
  quantity: number;
  sellUnitId: string | null;
  sellUnitLabel: string | null;
  unitPriceKobo: number;
  baseConsumed: number;
  lineTotalKobo: number;
}

// ------------------------------------------------------------
// 1. Record one receipt containing one or more sale lines.
// The receipt, immutable lines, stock deltas, and outbox event commit in ONE
// SQLite transaction. A failure on any line rolls the entire sale back.
// ------------------------------------------------------------
export function recordSaleBatch(
  input: RecordSaleBatchInput,
): RecordedSaleGroup {
  if (!input.items.length || input.items.length > 50) {
    throw new Error('INVALID_SALE_ITEMS');
  }

  const db = getDb();
  const now = new Date().toISOString();
  const seq = nextDeviceSeq();
  const deviceId = getDeviceId();
  const groupId = uuidv4();
  const receiptNumber = `AKE-${now.slice(0, 10).replace(/-/g, '')}-${String(
    seq,
  ).padStart(6, '0')}`;
  let created: RecordedSaleGroup | null = null;

  transactionSync(db, tx => {
    const resolved: ResolvedSaleLine[] = [];
    const consumedByProduct = new Map<string, number>();

    input.items.forEach(item => {
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        throw new Error('INVALID_QUANTITY');
      }
      const pr = tx.execute(
        `SELECT id, stock_quantity, selling_price_kobo, stock_mode
           FROM products WHERE id=? AND is_active=1`,
        [item.productId],
      );
      if (!pr.rows?.length) throw new Error('PRODUCT_NOT_FOUND');
      const product = pr.rows.item(0);
      if (product.stock_mode === 'BULK') {
        throw new Error('BULK_REQUIRES_MONEY_FLOW');
      }

      let unitPriceKobo = Number(product.selling_price_kobo);
      let basePerUnit = 1;
      let sellUnitId: string | null = item.sellUnitId ?? null;
      let sellUnitLabel: string | null = null;
      const ur = item.sellUnitId
        ? tx.execute(
            `SELECT id, unit_label, base_per_unit, selling_price_kobo
               FROM product_units
              WHERE product_id=? AND id=? AND is_active=1 LIMIT 1`,
            [item.productId, item.sellUnitId],
          )
        : tx.execute(
            `SELECT id, unit_label, base_per_unit, selling_price_kobo
               FROM product_units
              WHERE product_id=? AND is_active=1
              ORDER BY is_default DESC, sort_order ASC LIMIT 1`,
            [item.productId],
          );
      if (item.sellUnitId && !ur.rows?.length) {
        throw new Error('SELL_UNIT_NOT_FOUND');
      }
      if (ur.rows?.length) {
        const unit = ur.rows.item(0);
        sellUnitId = unit.id;
        sellUnitLabel = unit.unit_label;
        basePerUnit = Number(unit.base_per_unit);
        unitPriceKobo = Number(unit.selling_price_kobo);
      }
      if (item.unitPriceKobo !== undefined) {
        if (!Number.isInteger(item.unitPriceKobo) || item.unitPriceKobo < 0) {
          throw new Error('INVALID_UNIT_PRICE');
        }
        unitPriceKobo = item.unitPriceKobo;
      }

      const baseConsumed = item.quantity * basePerUnit;
      const priorConsumed = consumedByProduct.get(item.productId) ?? 0;
      if (
        priorConsumed + baseConsumed >
        Number(product.stock_quantity) + 0.0001
      ) {
        throw new Error('OUT_OF_STOCK');
      }
      consumedByProduct.set(item.productId, priorConsumed + baseConsumed);
      resolved.push({
        productId: item.productId,
        quantity: item.quantity,
        sellUnitId,
        sellUnitLabel,
        unitPriceKobo,
        baseConsumed,
        lineTotalKobo: lineTotalKobo({quantity: item.quantity, unitPriceKobo}),
      });
    });

    const lineTotals = resolved.map(line => line.lineTotalKobo);
    const totalAmountKobo = lineTotals.reduce((sum, value) => sum + value, 0);
    const allocations = allocatePaymentKobo(lineTotals, input.amountPaidKobo);
    const amountPaidKobo = allocations.reduce((sum, value) => sum + value, 0);
    const status =
      amountPaidKobo >= totalAmountKobo
        ? PaymentStatus.PAID
        : PaymentStatus.DEBT;
    if (status === PaymentStatus.DEBT && !input.customerId) {
      throw new Error('DEBT_REQUIRES_CUSTOMER');
    }

    tx.execute(
      `INSERT INTO sale_groups
        (id, receipt_number, customer_id, total_amount_kobo,
         amount_paid_kobo, status, note, created_by, created_at,
         device_id, device_seq, input_method, voice_confidence)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        groupId,
        receiptNumber,
        input.customerId ?? null,
        totalAmountKobo,
        amountPaidKobo,
        status,
        input.note ?? null,
        input.userId,
        now,
        deviceId,
        seq,
        input.inputMethod ?? InputMethod.MANUAL,
        input.voiceConfidence ?? null,
      ],
    );

    const transactions: Transaction[] = [];
    resolved.forEach((line, index) => {
      const txId = uuidv4();
      const lineStatus =
        allocations[index] >= line.lineTotalKobo
          ? PaymentStatus.PAID
          : PaymentStatus.DEBT;
      tx.execute(
        `INSERT INTO transactions
          (id, product_id, customer_id, user_id, type, category, quantity,
           total_amount_kobo, amount_paid_kobo, status, input_method,
           voice_confidence, note, sell_unit_id, sell_unit_label,
           sell_unit_count, sale_group_id, sale_line_index, created_at, device_seq)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          txId,
          line.productId,
          input.customerId ?? null,
          input.userId,
          TransactionType.INFLOW,
          TransactionCategory.SALE,
          line.baseConsumed,
          line.lineTotalKobo,
          allocations[index],
          lineStatus,
          input.inputMethod ?? InputMethod.MANUAL,
          input.voiceConfidence ?? null,
          input.note ?? null,
          line.sellUnitId,
          line.sellUnitLabel,
          line.quantity,
          groupId,
          index,
          now,
          seq,
        ],
      );
      transactions.push({
        id: txId,
        productId: line.productId,
        customerId: input.customerId ?? null,
        userId: input.userId,
        type: TransactionType.INFLOW,
        category: TransactionCategory.SALE,
        quantity: line.baseConsumed,
        totalAmountKobo: line.lineTotalKobo,
        amountPaidKobo: allocations[index],
        status: lineStatus,
        inputMethod: input.inputMethod ?? InputMethod.MANUAL,
        voiceConfidence: input.voiceConfidence ?? null,
        note: input.note ?? null,
        reversalOf: null,
        sellUnitId: line.sellUnitId,
        sellUnitLabel: line.sellUnitLabel,
        sellUnitCount: line.quantity,
        saleGroupId: groupId,
        saleLineIndex: index,
        createdAt: now,
        deviceSeq: seq,
      });
    });

    consumedByProduct.forEach((quantity, productId) => {
      tx.execute(
        `UPDATE products
            SET stock_quantity=stock_quantity-?, updated_at=?
          WHERE id=?`,
        [quantity, now, productId],
      );
    });

    tx.execute(
      `INSERT INTO sync_outbox
        (event_id, idempotency_key, aggregate_type, aggregate_id, action,
         payload, sequence_version, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        uuidv4(),
        idempotencyKey(deviceId, 'TRANSACTION', 'CREDIT', seq),
        'TRANSACTION',
        groupId,
        'CREDIT',
        JSON.stringify({
          sale_group_id: groupId,
          receipt_number: receiptNumber,
          customer_id: input.customerId ?? null,
          user_id: input.userId,
          total_kobo: totalAmountKobo,
          paid_kobo: amountPaidKobo,
          status,
          lines: resolved.map((line, index) => ({
            transaction_id: transactions[index].id,
            product_id: line.productId,
            quantity_delta: -line.baseConsumed,
            sell_unit_id: line.sellUnitId,
            sell_unit_label: line.sellUnitLabel,
            sell_unit_count: line.quantity,
            total_kobo: line.lineTotalKobo,
            paid_kobo: allocations[index],
          })),
          created_at: now,
        }),
        seq,
        now,
      ],
    );

    created = {
      id: groupId,
      receiptNumber,
      totalAmountKobo,
      amountPaidKobo,
      status,
      transactions,
    };
  });

  return created!;
}

// Compatibility for voice and other existing one-line callers.
export function recordSale(input: RecordSaleInput): Transaction {
  return recordSaleBatch({
    userId: input.userId,
    customerId: input.customerId,
    amountPaidKobo: input.amountPaidKobo,
    inputMethod: input.inputMethod,
    voiceConfidence: input.voiceConfidence,
    note: input.note,
    items: [
      {
        productId: input.productId,
        quantity: input.quantity,
        sellUnitId: input.sellUnitId,
      },
    ],
  }).transactions[0];
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
  note?: string,
): string {
  const db = getDb();
  const now = new Date().toISOString();
  const seq = nextDeviceSeq();
  const deviceId = getDeviceId();
  const txId = uuidv4();

  transactionSync(db, tx => {
    tx.execute(
      `INSERT INTO transactions
        (id, product_id, customer_id, user_id, type, category, quantity,
         total_amount_kobo, amount_paid_kobo, status, input_method,
         note, created_at, device_seq)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        txId,
        productId,
        customerId ?? null,
        userId,
        TransactionType.INFLOW,
        TransactionCategory.SALE,
        0,
        amountKobo,
        amountKobo,
        PaymentStatus.PAID,
        InputMethod.MANUAL,
        note ?? null,
        now,
        seq,
      ],
    );
    // accumulate recovered money on the product
    tx.execute(
      `UPDATE products
          SET bulk_recovered_kobo = bulk_recovered_kobo + ?, updated_at = ?
        WHERE id = ?`,
      [amountKobo, now, productId],
    );
    tx.execute(
      `INSERT INTO sync_outbox
        (event_id, idempotency_key, aggregate_type, aggregate_id, action,
         payload, sequence_version, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        uuidv4(),
        idempotencyKey(deviceId, 'TRANSACTION', 'CREDIT', seq),
        'TRANSACTION',
        txId,
        'CREDIT',
        JSON.stringify({
          tx_id: txId,
          product_id: productId,
          customer_id: customerId ?? null,
          category: 'SALE',
          bulk: true,
          total_kobo: amountKobo,
          paid_kobo: amountKobo,
          status: 'PAID',
          created_at: now,
        }),
        seq,
        now,
      ],
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

  transactionSync(db, tx => {
    tx.execute(
      `INSERT INTO transactions
        (id, product_id, customer_id, user_id, type, category, quantity,
         total_amount_kobo, amount_paid_kobo, status, expense_type,
         input_method, note, created_at, device_seq)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        txId,
        input.productId ?? null,
        null,
        input.userId,
        TransactionType.OUTFLOW,
        category,
        input.quantity ?? 0,
        input.totalAmountKobo,
        input.totalAmountKobo,
        PaymentStatus.PAID,
        input.expenseType ?? null,
        input.inputMethod ?? InputMethod.MANUAL,
        input.note ?? null,
        now,
        seq,
      ],
    );

    // RESTOCK adds inventory
    if (
      category === TransactionCategory.RESTOCK &&
      input.productId &&
      input.quantity
    ) {
      tx.execute(
        `UPDATE products
            SET stock_quantity = stock_quantity + ?, updated_at = ?
          WHERE id = ?`,
        [input.quantity, now, input.productId],
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
        'TRANSACTION',
        txId,
        'DEBIT',
        JSON.stringify({
          tx_id: txId,
          category,
          product_id: input.productId ?? null,
          quantity_delta:
            category === TransactionCategory.RESTOCK ? input.quantity ?? 0 : 0,
          total_kobo: input.totalAmountKobo,
          created_at: now,
        }),
        seq,
        now,
      ],
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
  note?: string,
): string {
  const db = getDb();
  const now = new Date().toISOString();
  const seq = nextDeviceSeq();
  const deviceId = getDeviceId();
  const txId = uuidv4();

  transactionSync(db, tx => {
    tx.execute(
      `INSERT INTO transactions
        (id, customer_id, user_id, type, category, quantity,
         total_amount_kobo, amount_paid_kobo, status, input_method,
         note, created_at, device_seq)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        txId,
        customerId,
        userId,
        TransactionType.INFLOW,
        TransactionCategory.DEBT_PAYMENT,
        0,
        amountKobo,
        amountKobo,
        PaymentStatus.PAID,
        InputMethod.MANUAL,
        note ?? null,
        now,
        seq,
      ],
    );

    tx.execute(
      `INSERT INTO sync_outbox
        (event_id, idempotency_key, aggregate_type, aggregate_id, action,
         payload, sequence_version, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        uuidv4(),
        idempotencyKey(deviceId, 'TRANSACTION', 'CREDIT', seq),
        'TRANSACTION',
        txId,
        'CREDIT',
        JSON.stringify({
          tx_id: txId,
          customer_id: customerId,
          category: 'DEBT_PAYMENT',
          paid_kobo: amountKobo,
          created_at: now,
        }),
        seq,
        now,
      ],
    );
  });

  return txId;
}

// ------------------------------------------------------------
// 4. Searchable history and immutable correction.
// A grouped receipt is reversed as one atomic operation so stock, money, and
// reporting can never end up with only half of the sale corrected.
// ------------------------------------------------------------
export interface LedgerEntry {
  id: string;
  receiptNumber: string | null;
  category: TransactionCategory;
  type: TransactionType;
  totalAmountKobo: number;
  amountPaidKobo: number;
  status: PaymentStatus;
  customerName: string | null;
  details: string;
  itemCount: number;
  createdAt: string;
  inputMethod: InputMethod;
  isReversed: boolean;
  note: string | null;
}

export function listLedgerEntries(limit = 150): LedgerEntry[] {
  const db = getDb();
  const result = db.execute(
    `SELECT
       COALESCE(t.sale_group_id, t.id) AS entry_id,
       sg.receipt_number,
       t.category,
       t.type,
       SUM(t.total_amount_kobo) AS total_amount_kobo,
       SUM(t.amount_paid_kobo) AS amount_paid_kobo,
       CASE WHEN SUM(t.amount_paid_kobo) >= SUM(t.total_amount_kobo)
            THEN 'PAID' ELSE 'DEBT' END AS entry_status,
       c.name AS customer_name,
       GROUP_CONCAT(
         CASE WHEN p.name IS NOT NULL
              THEN p.name || ' ×' || printf('%g', IFNULL(t.sell_unit_count, t.quantity))
                   || CASE WHEN t.sell_unit_label IS NOT NULL
                           THEN ' ' || t.sell_unit_label ELSE '' END
              WHEN t.expense_type IS NOT NULL THEN t.expense_type
              ELSE t.category END,
         ', '
       ) AS details,
       COUNT(*) AS item_count,
       MIN(t.created_at) AS created_at,
       MIN(t.input_method) AS input_method,
       MAX(CASE WHEN EXISTS (
         SELECT 1 FROM transactions r WHERE r.reversal_of=t.id
       ) THEN 1 ELSE 0 END) AS is_reversed,
       MAX(t.note) AS note
     FROM transactions t
     LEFT JOIN sale_groups sg ON sg.id=t.sale_group_id
     LEFT JOIN products p ON p.id=t.product_id
     LEFT JOIN customers c ON c.id=t.customer_id
     WHERE t.category <> 'REVERSAL'
     GROUP BY COALESCE(t.sale_group_id, t.id)
     ORDER BY MIN(t.created_at) DESC
     LIMIT ?`,
    [Math.max(1, Math.min(limit, 500))],
  );

  const entries: LedgerEntry[] = [];
  for (let index = 0; index < (result.rows?.length ?? 0); index += 1) {
    const row = result.rows!.item(index);
    entries.push({
      id: row.entry_id,
      receiptNumber: row.receipt_number ?? null,
      category: row.category as TransactionCategory,
      type: row.type as TransactionType,
      totalAmountKobo: Number(row.total_amount_kobo),
      amountPaidKobo: Number(row.amount_paid_kobo),
      status: row.entry_status as PaymentStatus,
      customerName: row.customer_name ?? null,
      details: row.details ?? row.category,
      itemCount: Number(row.item_count),
      createdAt: row.created_at,
      inputMethod: row.input_method as InputMethod,
      isReversed: Boolean(row.is_reversed),
      note: row.note ?? null,
    });
  }
  return entries;
}

export function reverseLedgerEntry(
  entryId: string,
  userId: string,
  reason?: string,
): string[] {
  const db = getDb();
  const now = new Date().toISOString();
  const seq = nextDeviceSeq();
  const deviceId = getDeviceId();
  const reversalIds: string[] = [];

  transactionSync(db, tx => {
    const result = tx.execute(
      `SELECT t.*, p.stock_mode, p.stock_quantity
         FROM transactions t
         LEFT JOIN products p ON p.id=t.product_id
        WHERE (t.id=? OR t.sale_group_id=?) AND t.category <> 'REVERSAL'
        ORDER BY IFNULL(t.sale_line_index, 0)`,
      [entryId, entryId],
    );
    if (!result.rows?.length) throw new Error('TX_NOT_FOUND');

    for (let index = 0; index < result.rows.length; index += 1) {
      const orig = result.rows.item(index);
      const prior = tx.execute(
        `SELECT 1 FROM transactions WHERE reversal_of=? LIMIT 1`,
        [orig.id],
      );
      if (prior.rows?.length) throw new Error('ALREADY_REVERSED');
      if (
        orig.category === 'RESTOCK' &&
        orig.product_id &&
        Number(orig.stock_quantity) - Number(orig.quantity) < -0.0001
      ) {
        throw new Error('REVERSAL_WOULD_NEGATIVE_STOCK');
      }
    }

    for (let index = 0; index < result.rows.length; index += 1) {
      const orig = result.rows.item(index);
      const reversalId = uuidv4();
      reversalIds.push(reversalId);
      const reversedType = orig.type === 'INFLOW' ? 'OUTFLOW' : 'INFLOW';
      tx.execute(
        `INSERT INTO transactions
          (id, product_id, customer_id, user_id, type, category, quantity,
           total_amount_kobo, amount_paid_kobo, status, input_method,
           note, reversal_of, sale_group_id, sale_line_index,
           created_at, device_seq)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          reversalId,
          orig.product_id,
          orig.customer_id,
          userId,
          reversedType,
          'REVERSAL',
          orig.quantity,
          orig.total_amount_kobo,
          orig.amount_paid_kobo,
          'PAID',
          InputMethod.MANUAL,
          reason ?? 'Correction',
          orig.id,
          orig.sale_group_id,
          orig.sale_line_index,
          now,
          seq,
        ],
      );

      if (orig.product_id && orig.category === 'SALE') {
        if (orig.stock_mode === 'BULK') {
          tx.execute(
            `UPDATE products
                SET bulk_recovered_kobo=MAX(0, bulk_recovered_kobo-?), updated_at=?
              WHERE id=?`,
            [orig.total_amount_kobo, now, orig.product_id],
          );
        } else if (orig.quantity) {
          tx.execute(
            `UPDATE products
                SET stock_quantity=stock_quantity+?, updated_at=? WHERE id=?`,
            [orig.quantity, now, orig.product_id],
          );
        }
      } else if (
        orig.product_id &&
        orig.category === 'RESTOCK' &&
        orig.quantity
      ) {
        tx.execute(
          `UPDATE products
              SET stock_quantity=stock_quantity-?, updated_at=? WHERE id=?`,
          [orig.quantity, now, orig.product_id],
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
        'TRANSACTION',
        entryId,
        'CREATE',
        JSON.stringify({
          reversed_entry_id: entryId,
          reversal_ids: reversalIds,
          reason: reason ?? null,
          created_at: now,
        }),
        seq,
        now,
      ],
    );
  });

  return reversalIds;
}

export function reverseTransaction(
  originalTxId: string,
  userId: string,
  reason?: string,
): string {
  return reverseLedgerEntry(originalTxId, userId, reason)[0];
}
