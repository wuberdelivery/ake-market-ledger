// ============================================================
// AKE LEDGER — setupRepository.ts
// Writes for onboarding & management screens. Same discipline as
// the ledger: every write is atomic and appends an outbox event.
// ============================================================

import { getDb, nextDeviceSeq, getDeviceId } from './database';
import { uuidv4 } from '../models/types';
import type { Language } from '../models/types';
import { hashPin, makeSalt } from '../utils/hash';

function outboxRow(
  tx: any, aggregate: string, aggregateId: string,
  action: 'CREATE' | 'UPDATE' | 'DEACTIVATE' | 'DEBIT' | 'CREDIT' | 'STOCK_DELTA',
  payload: object, seq: number, now: string
) {
  tx.execute(
    `INSERT INTO sync_outbox
      (event_id, idempotency_key, aggregate_type, aggregate_id, action,
       payload, sequence_version, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      uuidv4(),
      `${getDeviceId()}:${aggregate}:${action}:${seq}`,
      aggregate, aggregateId, action, JSON.stringify(payload), seq, now,
    ]
  );
}

// ------------------------------------------------------------
// Owner / Helper accounts
// ------------------------------------------------------------
export function createOwner(displayName: string, language: Language, pin?: string): string {
  const db = getDb();
  const now = new Date().toISOString();
  const seq = nextDeviceSeq();
  const id = uuidv4();
  const salt = pin ? makeSalt() : null;
  const pinHash = pin && salt ? hashPin(pin, salt) : null;

  db.transaction(tx => {
    tx.execute(
      `INSERT INTO users (id, display_name, role, pin_hash, pin_salt, language, is_active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,1,?,?)`,
      [id, displayName, 'OWNER', pinHash, salt, language, now, now]
    );
    tx.execute(
      `INSERT INTO app_settings (key, value) VALUES ('language', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [language]
    );
    outboxRow(tx, 'USER', id, 'CREATE',
      { user_id: id, name: displayName, role: 'OWNER', language, created_at: now }, seq, now);
  });
  return id;
}

export function createHelper(displayName: string, pin: string): string {
  const db = getDb();
  const now = new Date().toISOString();
  const seq = nextDeviceSeq();
  const id = uuidv4();
  const salt = makeSalt();

  db.transaction(tx => {
    tx.execute(
      `INSERT INTO users (id, display_name, role, pin_hash, pin_salt, language, is_active, created_at, updated_at)
       SELECT ?, ?, 'HELPER', ?, ?, value, 1, ?, ? FROM app_settings WHERE key='language'`,
      [id, displayName, hashPin(pin, salt), salt, now, now]
    );
    outboxRow(tx, 'USER', id, 'CREATE',
      { user_id: id, name: displayName, role: 'HELPER', created_at: now }, seq, now);
  });
  return id;
}

// ------------------------------------------------------------
// Products
// ------------------------------------------------------------
export interface SellUnitInput {
  unitLabel: string;         // "cup", "mudu", "half bag"
  basePerUnit: number;       // base units per 1 sell unit (cup = 0.025)
  sellingPriceKobo: number;  // price per sell unit
  isDefault?: boolean;
}

export interface ProductInput {
  name: string;
  unitLabel: string;         // base/purchase unit label ("bag","carton")
  costPriceKobo: number;     // cost per base unit (or whole-load cost in BULK)
  sellingPriceKobo: number;  // simple/default price per base unit
  stockQuantity: number;     // base units in stock
  lowStockLevel?: number;
  photoPath?: string | null;
  voiceAliases?: string[];
  stockMode?: 'COUNTED' | 'BULK';
  sellUnits?: SellUnitInput[];  // break-bulk units (cups, modules)
}

export function createProduct(p: ProductInput): string {
  const db = getDb();
  const now = new Date().toISOString();
  const seq = nextDeviceSeq();
  const id = uuidv4();
  const mode = p.stockMode ?? 'COUNTED';

  db.transaction(tx => {
    tx.execute(
      `INSERT INTO products
        (id, name, voice_aliases, photo_path, photo_synced, unit_label,
         base_unit, stock_mode, stock_quantity, low_stock_level,
         cost_price_kobo, selling_price_kobo, bulk_cost_kobo,
         is_active, created_at, updated_at)
       VALUES (?,?,?,?,0,?,?,?,?,?,?,?,?,1,?,?)`,
      [
        id, p.name, JSON.stringify(p.voiceAliases ?? [p.name.toLowerCase()]),
        p.photoPath ?? null, p.unitLabel, p.unitLabel, mode,
        p.stockQuantity, p.lowStockLevel ?? 0,
        p.costPriceKobo, p.sellingPriceKobo,
        mode === 'BULK' ? p.costPriceKobo : 0,
        now, now,
      ]
    );

    // Sell units: either the ones provided, or a 1:1 default matching base.
    const units: SellUnitInput[] = (p.sellUnits && p.sellUnits.length)
      ? p.sellUnits
      : [{ unitLabel: p.unitLabel, basePerUnit: 1, sellingPriceKobo: p.sellingPriceKobo, isDefault: true }];

    units.forEach((u, i) => {
      tx.execute(
        `INSERT INTO product_units
          (id, product_id, unit_label, base_per_unit, selling_price_kobo,
           is_default, sort_order, is_active, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,1,?,?)`,
        [
          uuidv4(), id, u.unitLabel, u.basePerUnit, u.sellingPriceKobo,
          u.isDefault || (i === 0 && !units.some(x => x.isDefault)) ? 1 : 0,
          i, now, now,
        ]
      );
    });

    outboxRow(tx, 'PRODUCT', id, 'CREATE', {
      product_id: id, name: p.name, unit: p.unitLabel, stock_mode: mode,
      stock: p.stockQuantity, cost_kobo: p.costPriceKobo,
      price_kobo: p.sellingPriceKobo, created_at: now,
    }, seq, now);
  });
  return id;
}

export function updateProduct(id: string, p: Partial<ProductInput>): void {
  const db = getDb();
  const now = new Date().toISOString();
  const seq = nextDeviceSeq();

  db.transaction(tx => {
    const sets: string[] = ['updated_at = ?'];
    const vals: any[] = [now];
    if (p.name !== undefined) { sets.push('name = ?'); vals.push(p.name); }
    if (p.unitLabel !== undefined) { sets.push('unit_label = ?'); vals.push(p.unitLabel); }
    if (p.costPriceKobo !== undefined) { sets.push('cost_price_kobo = ?'); vals.push(p.costPriceKobo); }
    if (p.sellingPriceKobo !== undefined) { sets.push('selling_price_kobo = ?'); vals.push(p.sellingPriceKobo); }
    if (p.lowStockLevel !== undefined) { sets.push('low_stock_level = ?'); vals.push(p.lowStockLevel); }
    if (p.photoPath !== undefined) { sets.push('photo_path = ?'); vals.push(p.photoPath); }
    if (p.voiceAliases !== undefined) { sets.push('voice_aliases = ?'); vals.push(JSON.stringify(p.voiceAliases)); }
    vals.push(id);
    tx.execute(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`, vals);

    const { photoPath, voiceAliases, ...syncable } = p;
    outboxRow(tx, 'PRODUCT', id, 'UPDATE',
      { product_id: id, changes: syncable, updated_at: now }, seq, now);
  });
}

// ------------------------------------------------------------
// Customers
// ------------------------------------------------------------
export function createCustomer(name: string, phoneNumber?: string, note?: string): string {
  const db = getDb();
  const now = new Date().toISOString();
  const seq = nextDeviceSeq();
  const id = uuidv4();

  db.transaction(tx => {
    tx.execute(
      `INSERT INTO customers (id, name, phone_number, note, is_active, created_at, updated_at)
       VALUES (?,?,?,?,1,?,?)`,
      [id, name, phoneNumber ?? null, note ?? null, now, now]
    );
    outboxRow(tx, 'CUSTOMER', id, 'CREATE',
      { customer_id: id, name, phone: phoneNumber ?? null, created_at: now }, seq, now);
  });
  return id;
}

// ------------------------------------------------------------
// Restock: add stock to an existing product + log the cost as an
// expense (RESTOCK category, which is excluded from profit since
// cost-of-goods is charged per sale).
// ------------------------------------------------------------
export function restockProduct(
  productId: string,
  userId: string,
  quantityAdded: number,
  totalCostKobo: number
): void {
  const db = getDb();
  const now = new Date().toISOString();
  const seq = nextDeviceSeq();
  const txId = uuidv4();

  db.transaction(tx => {
    tx.execute(
      `UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ?`,
      [quantityAdded, now, productId]
    );
    tx.execute(
      `INSERT INTO transactions
        (id, product_id, user_id, type, category, quantity,
         total_amount_kobo, amount_paid_kobo, status, input_method,
         created_at, device_seq)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        txId, productId, userId, 'OUTFLOW', 'RESTOCK', quantityAdded,
        totalCostKobo, totalCostKobo, 'PAID', 'MANUAL', now, seq,
      ]
    );
    outboxRow(tx, 'TRANSACTION', txId, 'DEBIT', {
      tx_id: txId, product_id: productId, category: 'RESTOCK',
      quantity_delta: quantityAdded, total_kobo: totalCostKobo, created_at: now,
    }, seq, now);
  });
}

// ------------------------------------------------------------
// Verify a helper/owner PIN for login
// ------------------------------------------------------------
export function verifyUserPin(userId: string, pin: string): boolean {
  const r = getDb().execute(
    `SELECT pin_hash, pin_salt FROM users WHERE id=? AND is_active=1`, [userId]
  );
  if (!r.rows?.length) return false;
  const { pin_hash, pin_salt } = r.rows.item(0);
  if (!pin_hash || !pin_salt) return true; // no PIN set = open
  return hashPin(pin, pin_salt) === pin_hash;
}

export function listUsers(): { id: string; name: string; role: string; hasPin: boolean }[] {
  const r = getDb().execute(
    `SELECT id, display_name, role, pin_hash FROM users WHERE is_active=1 ORDER BY role='OWNER' DESC, display_name`
  );
  const out: any[] = [];
  for (let i = 0; i < (r.rows?.length ?? 0); i++) {
    const u = r.rows!.item(i);
    out.push({ id: u.id, name: u.display_name, role: u.role, hasPin: !!u.pin_hash });
  }
  return out;
}
export function createFixedCost(
  name: string,
  costType: 'RENT' | 'SALARY' | 'LEVY' | 'UTILITIES' | 'OTHER',
  amountKobo: number,
  period: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
): string {
  const db = getDb();
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const seq = nextDeviceSeq();
  const id = uuidv4();

  db.transaction(tx => {
    tx.execute(
      `INSERT INTO fixed_costs
        (id, name, cost_type, amount_kobo, period, start_date, end_date, is_active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,NULL,1,?,?)`,
      [id, name, costType, amountKobo, period, today, now, now]
    );
    outboxRow(tx, 'FIXED_COST', id, 'CREATE', {
      fixed_cost_id: id, name, cost_type: costType,
      amount_kobo: amountKobo, period, start_date: today, created_at: now,
    }, seq, now);
  });
  return id;
}
