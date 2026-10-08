// ============================================================
// AKE LEDGER — Database bootstrap & migration runner
// Driver: react-native-quick-sqlite (JSI, fast on low-end Androids)
//   npm i react-native-quick-sqlite react-native-get-random-values
// ============================================================

import { open, QuickSQLiteConnection } from 'react-native-quick-sqlite';
import { uuidv4 } from '../models/types';

const DB_NAME = 'ake_ledger.db';
let db: QuickSQLiteConnection | null = null;

// ------------------------------------------------------------
// Migrations: append-only list. NEVER edit a shipped migration —
// add a new one. Version stored in schema_meta.schema_version.
// Migration 1 mirrors schema.sql (kept inline so the app is
// self-contained and needs no asset file reads at boot).
// ------------------------------------------------------------
const MIGRATIONS: { version: number; statements: string[] }[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,

      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, display_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'OWNER' CHECK (role IN ('OWNER','HELPER')),
        pin_hash TEXT, pin_salt TEXT,
        language TEXT NOT NULL DEFAULT 'yo' CHECK (language IN ('en','yo','ha','ig')),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`,

      `CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY, name TEXT NOT NULL,
        voice_aliases TEXT, photo_path TEXT,
        photo_synced INTEGER NOT NULL DEFAULT 0,
        unit_label TEXT NOT NULL DEFAULT 'unit',
        stock_quantity REAL NOT NULL DEFAULT 0,
        low_stock_level REAL NOT NULL DEFAULT 0,
        cost_price_kobo INTEGER NOT NULL DEFAULT 0,
        selling_price_kobo INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`,
      `CREATE INDEX IF NOT EXISTS idx_products_active ON products (is_active, name);`,

      `CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY, name TEXT NOT NULL,
        phone_number TEXT, note TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`,
      `CREATE INDEX IF NOT EXISTS idx_customers_name ON customers (is_active, name);`,
      `CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone_number);`,

      `CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        product_id TEXT REFERENCES products(id),
        customer_id TEXT REFERENCES customers(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        type TEXT NOT NULL CHECK (type IN ('INFLOW','OUTFLOW')),
        category TEXT NOT NULL DEFAULT 'SALE'
          CHECK (category IN ('SALE','RESTOCK','EXPENSE','DEBT_PAYMENT','REVERSAL')),
        quantity REAL NOT NULL DEFAULT 0,
        total_amount_kobo INTEGER NOT NULL,
        amount_paid_kobo INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK (status IN ('PAID','DEBT')),
        expense_type TEXT CHECK (expense_type IS NULL OR expense_type IN
          ('TRANSPORT','FUEL','RENT','SALARY','LEVY','UTILITIES','FEEDING','OTHER')),
        input_method TEXT NOT NULL DEFAULT 'MANUAL'
          CHECK (input_method IN ('VOICE_ONLINE','VOICE_OFFLINE','MANUAL','PHOTO_PICKER')),
        voice_confidence REAL, note TEXT,
        reversal_of TEXT REFERENCES transactions(id),
        created_at TEXT NOT NULL,
        device_seq INTEGER NOT NULL);`,
      `CREATE INDEX IF NOT EXISTS idx_tx_day ON transactions (created_at);`,
      `CREATE INDEX IF NOT EXISTS idx_tx_product ON transactions (product_id, created_at);`,
      `CREATE INDEX IF NOT EXISTS idx_tx_customer ON transactions (customer_id, status);`,
      `CREATE INDEX IF NOT EXISTS idx_tx_seq ON transactions (device_seq);`,

      `CREATE VIEW IF NOT EXISTS v_customer_debts AS
        SELECT c.id AS customer_id, c.name AS customer_name,
               c.phone_number AS phone_number,
               SUM(CASE WHEN t.category IN ('SALE')
                        THEN t.total_amount_kobo - t.amount_paid_kobo
                        WHEN t.category = 'DEBT_PAYMENT'
                        THEN -t.amount_paid_kobo ELSE 0 END) AS balance_kobo,
               MAX(t.created_at) AS last_activity_at
        FROM customers c
        JOIN transactions t ON t.customer_id = c.id
        GROUP BY c.id
        HAVING balance_kobo > 0;`,

      `CREATE VIEW IF NOT EXISTS v_daily_summary AS
        SELECT DATE(t.created_at) AS day,
               SUM(CASE WHEN t.type='INFLOW' THEN t.amount_paid_kobo ELSE 0 END) AS cash_in_kobo,
               SUM(CASE WHEN t.type='OUTFLOW' THEN t.total_amount_kobo ELSE 0 END) AS cash_out_kobo,
               SUM(CASE WHEN t.category='SALE'
                        THEN t.total_amount_kobo -
                             CAST(t.quantity * IFNULL(p.cost_price_kobo,0) AS INTEGER)
                        ELSE 0 END) AS gross_profit_kobo,
               COUNT(CASE WHEN t.category='SALE' THEN 1 END) AS sales_count
        FROM transactions t
        LEFT JOIN products p ON p.id = t.product_id
        GROUP BY DATE(t.created_at);`,

      `CREATE TABLE IF NOT EXISTS fixed_costs (
        id TEXT PRIMARY KEY, name TEXT NOT NULL,
        cost_type TEXT NOT NULL
          CHECK (cost_type IN ('RENT','SALARY','LEVY','UTILITIES','OTHER')),
        amount_kobo INTEGER NOT NULL,
        period TEXT NOT NULL CHECK (period IN ('DAILY','WEEKLY','MONTHLY','YEARLY')),
        start_date TEXT NOT NULL, end_date TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`,

      `CREATE VIEW IF NOT EXISTS v_fixed_cost_daily AS
        SELECT id, name, cost_type,
          CAST(ROUND(CASE period
            WHEN 'DAILY' THEN amount_kobo
            WHEN 'WEEKLY' THEN amount_kobo / 7.0
            WHEN 'MONTHLY' THEN amount_kobo / 30.0
            WHEN 'YEARLY' THEN amount_kobo / 365.0
          END) AS INTEGER) AS daily_kobo
        FROM fixed_costs
        WHERE is_active = 1 AND (end_date IS NULL OR end_date >= DATE('now'));`,

      `CREATE VIEW IF NOT EXISTS v_daily_net_profit AS
        SELECT d.day, d.cash_in_kobo, d.cash_out_kobo, d.gross_profit_kobo,
          IFNULL(e.expenses_kobo,0) AS variable_expenses_kobo,
          IFNULL((SELECT SUM(daily_kobo) FROM v_fixed_cost_daily),0) AS fixed_daily_kobo,
          d.gross_profit_kobo - IFNULL(e.expenses_kobo,0)
            - IFNULL((SELECT SUM(daily_kobo) FROM v_fixed_cost_daily),0) AS net_profit_kobo,
          d.sales_count
        FROM v_daily_summary d
        LEFT JOIN (
          SELECT DATE(created_at) AS day, SUM(total_amount_kobo) AS expenses_kobo
          FROM transactions WHERE type='OUTFLOW' AND category='EXPENSE'
          GROUP BY DATE(created_at)
        ) e ON e.day = d.day;`,

      `CREATE VIEW IF NOT EXISTS v_expense_breakdown AS
        SELECT DATE(created_at) AS day, IFNULL(expense_type,'OTHER') AS expense_type,
          SUM(total_amount_kobo) AS total_kobo, COUNT(*) AS entries
        FROM transactions WHERE type='OUTFLOW' AND category='EXPENSE'
        GROUP BY DATE(created_at), IFNULL(expense_type,'OTHER');`,

      `CREATE TABLE IF NOT EXISTS debt_reminders (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id),
        channel TEXT NOT NULL CHECK (channel IN ('SMS','WHATSAPP')),
        balance_kobo INTEGER NOT NULL,
        language TEXT NOT NULL DEFAULT 'yo',
        sent_at TEXT NOT NULL);`,
      `CREATE INDEX IF NOT EXISTS idx_reminders_customer ON debt_reminders (customer_id, sent_at);`,

      `CREATE TABLE IF NOT EXISTS sync_outbox (
        event_id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        aggregate_type TEXT NOT NULL
          CHECK (aggregate_type IN ('TRANSACTION','PRODUCT','CUSTOMER','USER','REMINDER','FIXED_COST')),
        aggregate_id TEXT NOT NULL,
        action TEXT NOT NULL
          CHECK (action IN ('CREATE','UPDATE','DEACTIVATE','DEBIT','CREDIT','STOCK_DELTA')),
        payload TEXT NOT NULL,
        sequence_version INTEGER NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'PENDING'
          CHECK (sync_status IN ('PENDING','PROCESSING','FAILED','QUARANTINED')),
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL);`,
      `CREATE INDEX IF NOT EXISTS idx_outbox_pending ON sync_outbox (sync_status, sequence_version);`,

      `CREATE TABLE IF NOT EXISTS device_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
      `CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
      `INSERT OR IGNORE INTO app_settings (key, value) VALUES
        ('language','yo'),('voice_enabled','1'),('tts_enabled','1'),
        ('eod_summary_enabled','1'),('eod_summary_time','19:00'),
        ('sync_wifi_only','0'),('photo_backup','0'),('stt_provider','n-atlas');`,
    ],
  },
  {
    version: 2,
    statements: [
      // --- products: stock mode + base unit + bulk tracking ---
      `ALTER TABLE products ADD COLUMN stock_mode TEXT NOT NULL DEFAULT 'COUNTED';`,
      `ALTER TABLE products ADD COLUMN base_unit TEXT NOT NULL DEFAULT 'unit';`,
      `ALTER TABLE products ADD COLUMN bulk_cost_kobo INTEGER NOT NULL DEFAULT 0;`,
      `ALTER TABLE products ADD COLUMN bulk_recovered_kobo INTEGER NOT NULL DEFAULT 0;`,
      // seed base_unit from the existing unit_label for old rows
      `UPDATE products SET base_unit = unit_label WHERE base_unit = 'unit';`,

      // --- sell units (break-bulk) ---
      `CREATE TABLE IF NOT EXISTS product_units (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id),
        unit_label TEXT NOT NULL,
        base_per_unit REAL NOT NULL,
        selling_price_kobo INTEGER NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL);`,
      `CREATE INDEX IF NOT EXISTS idx_product_units ON product_units (product_id, is_active, sort_order);`,

      // For every existing product, create a default sell unit == base unit
      // (1:1) so old products keep working unchanged.
      `INSERT INTO product_units
        (id, product_id, unit_label, base_per_unit, selling_price_kobo,
         is_default, sort_order, is_active, created_at, updated_at)
       SELECT
         lower(hex(randomblob(16))), id, unit_label, 1.0, selling_price_kobo,
         1, 0, 1, created_at, updated_at
       FROM products;`,

      // --- transactions: record which sell unit was used ---
      `ALTER TABLE transactions ADD COLUMN sell_unit_id TEXT REFERENCES product_units(id);`,
      `ALTER TABLE transactions ADD COLUMN sell_unit_label TEXT;`,
      `ALTER TABLE transactions ADD COLUMN sell_unit_count REAL;`,

      // widen sync_outbox aggregate types to include PRODUCT_UNIT
      // (SQLite CHECK can't be altered; enforcement moves to app code —
      //  the existing rows and constraints remain valid)

      // --- period summary views (week / month / year) ---
      // Profit here uses base-unit cost: quantity is already stored in
      // base units, so quantity * cost_price_kobo is the cost of goods,
      // whether sold as a whole bag or as cups.
      `CREATE VIEW IF NOT EXISTS v_period_summary AS
        SELECT
          DATE(t.created_at) AS day,
          strftime('%Y-%W', t.created_at) AS week,
          strftime('%Y-%m', t.created_at) AS month,
          strftime('%Y', t.created_at) AS year,
          SUM(CASE WHEN t.type='INFLOW' THEN t.amount_paid_kobo ELSE 0 END) AS cash_in_kobo,
          SUM(CASE WHEN t.type='OUTFLOW' AND t.category='EXPENSE'
                   THEN t.total_amount_kobo ELSE 0 END) AS expenses_kobo,
          SUM(CASE WHEN t.category='SALE'
                   THEN t.total_amount_kobo -
                        CAST(t.quantity * IFNULL(p.cost_price_kobo,0) AS INTEGER)
                   ELSE 0 END) AS gross_profit_kobo,
          COUNT(CASE WHEN t.category='SALE' THEN 1 END) AS sales_count
        FROM transactions t
        LEFT JOIN products p ON p.id = t.product_id
        GROUP BY DATE(t.created_at);`,

      // Rollups by week/month/year (net = gross − variable expenses;
      // fixed-cost burden is added per-period in the app so the divisor
      // matches the number of days in the chosen range).
      `CREATE VIEW IF NOT EXISTS v_weekly_summary AS
        SELECT week,
          SUM(cash_in_kobo) AS cash_in_kobo,
          SUM(expenses_kobo) AS expenses_kobo,
          SUM(gross_profit_kobo) AS gross_profit_kobo,
          SUM(gross_profit_kobo) - SUM(expenses_kobo) AS net_before_fixed_kobo,
          SUM(sales_count) AS sales_count,
          MIN(day) AS from_day, MAX(day) AS to_day
        FROM v_period_summary GROUP BY week;`,

      `CREATE VIEW IF NOT EXISTS v_monthly_summary AS
        SELECT month,
          SUM(cash_in_kobo) AS cash_in_kobo,
          SUM(expenses_kobo) AS expenses_kobo,
          SUM(gross_profit_kobo) AS gross_profit_kobo,
          SUM(gross_profit_kobo) - SUM(expenses_kobo) AS net_before_fixed_kobo,
          SUM(sales_count) AS sales_count,
          MIN(day) AS from_day, MAX(day) AS to_day
        FROM v_period_summary GROUP BY month;`,

      `CREATE VIEW IF NOT EXISTS v_yearly_summary AS
        SELECT year,
          SUM(cash_in_kobo) AS cash_in_kobo,
          SUM(expenses_kobo) AS expenses_kobo,
          SUM(gross_profit_kobo) AS gross_profit_kobo,
          SUM(gross_profit_kobo) - SUM(expenses_kobo) AS net_before_fixed_kobo,
          SUM(sales_count) AS sales_count,
          MIN(day) AS from_day, MAX(day) AS to_day
        FROM v_period_summary GROUP BY year;`,
    ],
  },
];

// ------------------------------------------------------------
// Bootstrap
// ------------------------------------------------------------
export function getDb(): QuickSQLiteConnection {
  if (!db) throw new Error('Database not initialized — call initDatabase() first');
  return db;
}

export async function initDatabase(): Promise<QuickSQLiteConnection> {
  if (db) return db;
  db = open({ name: DB_NAME });

  db.execute('PRAGMA journal_mode = WAL;');
  db.execute('PRAGMA foreign_keys = ON;');
  db.execute('PRAGMA synchronous = NORMAL;');

  runMigrations(db);
  ensureDeviceIdentity(db);
  return db;
}

function currentVersion(conn: QuickSQLiteConnection): number {
  try {
    const r = conn.execute(
      `SELECT value FROM schema_meta WHERE key='schema_version'`
    );
    return r.rows?.length ? parseInt(r.rows.item(0).value, 10) : 0;
  } catch {
    return 0; // schema_meta doesn't exist yet — fresh install
  }
}

function runMigrations(conn: QuickSQLiteConnection): void {
  const from = currentVersion(conn);
  const pending = MIGRATIONS.filter(m => m.version > from).sort(
    (a, b) => a.version - b.version
  );
  for (const m of pending) {
    conn.transaction(tx => {
      for (const stmt of m.statements) tx.execute(stmt);
      tx.execute(
        `INSERT INTO schema_meta (key, value) VALUES ('schema_version', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [String(m.version)]
      );
    });
  }
}

// Assigns a stable per-install device id + monotonic sequence counter.
function ensureDeviceIdentity(conn: QuickSQLiteConnection): void {
  conn.execute(
    `INSERT OR IGNORE INTO device_state (key, value) VALUES ('device_id', ?)`,
    [`DEV-${uuidv4()}`]
  );
  conn.execute(
    `INSERT OR IGNORE INTO device_state (key, value) VALUES ('seq_counter', '0')`
  );
}

// Atomically increments and returns the next device sequence number.
// Used for both transactions.device_seq and sync_outbox.sequence_version.
export function nextDeviceSeq(): number {
  const conn = getDb();
  let next = 0;
  conn.transaction(tx => {
    const r = tx.execute(`SELECT value FROM device_state WHERE key='seq_counter'`);
    next = parseInt(r.rows!.item(0).value, 10) + 1;
    tx.execute(`UPDATE device_state SET value=? WHERE key='seq_counter'`, [
      String(next),
    ]);
  });
  return next;
}

export function getDeviceId(): string {
  const r = getDb().execute(`SELECT value FROM device_state WHERE key='device_id'`);
  return r.rows!.item(0).value as string;
}
