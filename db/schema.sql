-- ============================================================
-- AKE LEDGER — Phase 1 Local Database Schema (SQLite)
-- Offline-first trader bookkeeping engine
-- Money: ALL amounts stored as INTEGER kobo (₦1 = 100 kobo).
-- Language: schema + enums are language-neutral (English codes).
--           Yoruba/Hausa/Igbo/English labels live in the i18n layer.
-- ============================================================

PRAGMA journal_mode = WAL;          -- concurrent read while writing
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;        -- safe with WAL, faster on cheap flash

-- ------------------------------------------------------------
-- 0. SCHEMA VERSIONING (migration runner reads this)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO schema_meta (key, value) VALUES ('schema_version', '1');

-- ------------------------------------------------------------
-- 1. USERS / ROLES  (Oga + Ìrànwọ́ helper PINs)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,                 -- UUID v4
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'OWNER'
                CHECK (role IN ('OWNER','HELPER')),
  pin_hash      TEXT,                             -- salted hash, NULL = no PIN yet
  pin_salt      TEXT,
  language      TEXT NOT NULL DEFAULT 'yo'
                CHECK (language IN ('en','yo','ha','ig')),
  is_active     INTEGER NOT NULL DEFAULT 1,       -- soft-disable helpers
  created_at    TEXT NOT NULL,                    -- ISO 8601, device local
  updated_at    TEXT NOT NULL
);

-- HELPER permissions are enforced in app code:
--   HELPER can INSERT transactions; cannot view profit, edit/delete,
--   or see cost_price. Keep cost_price out of helper query paths.

-- ------------------------------------------------------------
-- 2. PRODUCTS (Ojà)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id                TEXT PRIMARY KEY,             -- UUID v4
  name              TEXT NOT NULL,                -- "Iresi (Derica)"
  voice_aliases     TEXT,                         -- JSON array of spoken names for ASR intent matching: ["iresi","rice","resi"]
  photo_path        TEXT,                         -- local file URI, thumbnail 200x200
  photo_synced      INTEGER NOT NULL DEFAULT 0,   -- future optional backup flag
  unit_label        TEXT NOT NULL DEFAULT 'unit', -- "apo","carton","derica","bottle"
  stock_quantity    REAL NOT NULL DEFAULT 0,      -- REAL: traders sell half-bags
  low_stock_level   REAL NOT NULL DEFAULT 0,      -- threshold for "Ọjà ti fẹ́ tán" alert
  cost_price_kobo   INTEGER NOT NULL DEFAULT 0,   -- what oga paid (hidden from HELPER)
  selling_price_kobo INTEGER NOT NULL DEFAULT 0,
  is_active         INTEGER NOT NULL DEFAULT 1,   -- soft delete (history must survive)
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_active ON products (is_active, name);

-- ------------------------------------------------------------
-- 3. CUSTOMERS (Oníbàárà)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id            TEXT PRIMARY KEY,                 -- UUID v4
  name          TEXT NOT NULL,
  phone_number  TEXT,                             -- E.164 preferred (+234...); needed for debt reminders
  note          TEXT,                             -- "stall 14, ojoo market"
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_name  ON customers (is_active, name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone_number);

-- ------------------------------------------------------------
-- 4. TRANSACTIONS (Kòkárí) — immutable event rows
--    Corrections are new reversal rows, never UPDATEs to amounts.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id                TEXT PRIMARY KEY,             -- UUID v4 (client-generated)
  product_id        TEXT REFERENCES products(id),
  customer_id       TEXT REFERENCES customers(id),
  user_id           TEXT NOT NULL REFERENCES users(id),  -- who logged it (oga/helper)
  type              TEXT NOT NULL
                    CHECK (type IN ('INFLOW','OUTFLOW')),          -- OWÓWỌLÉ / OWÓTAJÁ
  category          TEXT NOT NULL DEFAULT 'SALE'
                    CHECK (category IN ('SALE','RESTOCK','EXPENSE','DEBT_PAYMENT','REVERSAL')),
  quantity          REAL NOT NULL DEFAULT 0,
  total_amount_kobo INTEGER NOT NULL,
  amount_paid_kobo  INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL
                    CHECK (status IN ('PAID','DEBT')),             -- SAN TÁN / ONÍGBÈSÈ
  expense_type      TEXT
                    CHECK (expense_type IS NULL OR expense_type IN
                      ('TRANSPORT','FUEL','RENT','SALARY','LEVY','UTILITIES','FEEDING','OTHER')),
  input_method      TEXT NOT NULL DEFAULT 'MANUAL'
                    CHECK (input_method IN ('VOICE_ONLINE','VOICE_OFFLINE','MANUAL','PHOTO_PICKER')),
  voice_confidence  REAL,                          -- ASR confidence if voice-entered
  note              TEXT,
  reversal_of       TEXT REFERENCES transactions(id),  -- set on REVERSAL rows
  created_at        TEXT NOT NULL,                -- device timestamp (display only)
  device_seq        INTEGER NOT NULL              -- monotonic per-device ordering
);

CREATE INDEX IF NOT EXISTS idx_tx_day      ON transactions (created_at);
CREATE INDEX IF NOT EXISTS idx_tx_product  ON transactions (product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tx_customer ON transactions (customer_id, status);
CREATE INDEX IF NOT EXISTS idx_tx_seq      ON transactions (device_seq);

-- ------------------------------------------------------------
-- 5. DEBTS ledger view helper (Àwọn tó ń jẹ ọ lówó)
--    Outstanding balance per customer, derived — never stored.
-- ------------------------------------------------------------
CREATE VIEW IF NOT EXISTS v_customer_debts AS
SELECT
  c.id            AS customer_id,
  c.name          AS customer_name,
  c.phone_number  AS phone_number,
  SUM(CASE WHEN t.category IN ('SALE')
           THEN t.total_amount_kobo - t.amount_paid_kobo
           WHEN t.category = 'DEBT_PAYMENT'
           THEN -t.amount_paid_kobo
           ELSE 0 END) AS balance_kobo,
  MAX(t.created_at)    AS last_activity_at
FROM customers c
JOIN transactions t ON t.customer_id = c.id
GROUP BY c.id
HAVING balance_kobo > 0;

-- Daily dashboard view (Èrè lónìí / Owó Ìta)
CREATE VIEW IF NOT EXISTS v_daily_summary AS
SELECT
  DATE(t.created_at)                                        AS day,
  SUM(CASE WHEN t.type='INFLOW'  THEN t.amount_paid_kobo ELSE 0 END) AS cash_in_kobo,
  SUM(CASE WHEN t.type='OUTFLOW' THEN t.total_amount_kobo ELSE 0 END) AS cash_out_kobo,
  SUM(CASE WHEN t.category='SALE'
           THEN t.total_amount_kobo -
                CAST(t.quantity * IFNULL(p.cost_price_kobo,0) AS INTEGER)
           ELSE 0 END)                                      AS gross_profit_kobo,
  COUNT(CASE WHEN t.category='SALE' THEN 1 END)             AS sales_count
FROM transactions t
LEFT JOIN products p ON p.id = t.product_id
GROUP BY DATE(t.created_at);

-- ------------------------------------------------------------
-- 5b. FIXED COSTS (Owó tí kò yẹ̀ — rent, salaries, dues)
--     Recurring obligations amortized to a per-day burden so the
--     dashboard can show TRUE net profit, not feel-good profit.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fixed_costs (
  id           TEXT PRIMARY KEY,               -- UUID v4
  name         TEXT NOT NULL,                  -- "Shop rent", "Sule salary"
  cost_type    TEXT NOT NULL
               CHECK (cost_type IN ('RENT','SALARY','LEVY','UTILITIES','OTHER')),
  amount_kobo  INTEGER NOT NULL,               -- amount per period
  period       TEXT NOT NULL
               CHECK (period IN ('DAILY','WEEKLY','MONTHLY','YEARLY')),
  start_date   TEXT NOT NULL,                  -- ISO date
  end_date     TEXT,                           -- NULL = still running
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

-- Daily burden per fixed cost (₦/day equivalent)
CREATE VIEW IF NOT EXISTS v_fixed_cost_daily AS
SELECT
  id, name, cost_type,
  CAST(ROUND(CASE period
    WHEN 'DAILY'   THEN amount_kobo
    WHEN 'WEEKLY'  THEN amount_kobo / 7.0
    WHEN 'MONTHLY' THEN amount_kobo / 30.0
    WHEN 'YEARLY'  THEN amount_kobo / 365.0
  END) AS INTEGER) AS daily_kobo
FROM fixed_costs
WHERE is_active = 1
  AND (end_date IS NULL OR end_date >= DATE('now'));

-- TRUE net profit per day:
--   gross profit (sales − cost of goods)
--   − variable expenses logged that day (transport, fuel, feeding...)
--   − amortized fixed-cost burden (rent/salaries/dues per day)
CREATE VIEW IF NOT EXISTS v_daily_net_profit AS
SELECT
  d.day,
  d.cash_in_kobo,
  d.cash_out_kobo,
  d.gross_profit_kobo,
  IFNULL(e.expenses_kobo, 0)                               AS variable_expenses_kobo,
  IFNULL((SELECT SUM(daily_kobo) FROM v_fixed_cost_daily),0) AS fixed_daily_kobo,
  d.gross_profit_kobo
    - IFNULL(e.expenses_kobo, 0)
    - IFNULL((SELECT SUM(daily_kobo) FROM v_fixed_cost_daily),0)
                                                           AS net_profit_kobo,
  d.sales_count
FROM v_daily_summary d
LEFT JOIN (
  SELECT DATE(created_at) AS day, SUM(total_amount_kobo) AS expenses_kobo
  FROM transactions
  WHERE type = 'OUTFLOW' AND category = 'EXPENSE'
  GROUP BY DATE(created_at)
) e ON e.day = d.day;

-- Expense breakdown by type (for "where is my money going?" screen)
CREATE VIEW IF NOT EXISTS v_expense_breakdown AS
SELECT
  DATE(created_at)              AS day,
  IFNULL(expense_type,'OTHER')  AS expense_type,
  SUM(total_amount_kobo)        AS total_kobo,
  COUNT(*)                      AS entries
FROM transactions
WHERE type = 'OUTFLOW' AND category = 'EXPENSE'
GROUP BY DATE(created_at), IFNULL(expense_type,'OTHER');

-- ------------------------------------------------------------
-- 6. DEBT REMINDERS LOG (SMS/WhatsApp nudges)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS debt_reminders (
  id           TEXT PRIMARY KEY,
  customer_id  TEXT NOT NULL REFERENCES customers(id),
  channel      TEXT NOT NULL CHECK (channel IN ('SMS','WHATSAPP')),
  balance_kobo INTEGER NOT NULL,                  -- balance at time of sending
  language     TEXT NOT NULL DEFAULT 'yo',
  sent_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reminders_customer ON debt_reminders (customer_id, sent_at);

-- ------------------------------------------------------------
-- 7. SYNC OUTBOX (Event-Sourced Delta Queue)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_outbox (
  event_id         TEXT PRIMARY KEY,              -- UUID v4
  idempotency_key  TEXT NOT NULL UNIQUE,          -- sha256(device_id + aggregate + action + payload + seq)
  aggregate_type   TEXT NOT NULL
                   CHECK (aggregate_type IN ('TRANSACTION','PRODUCT','CUSTOMER','USER','REMINDER','FIXED_COST')),
  aggregate_id     TEXT NOT NULL,
  action           TEXT NOT NULL
                   CHECK (action IN ('CREATE','UPDATE','DEACTIVATE','DEBIT','CREDIT','STOCK_DELTA')),
  payload          TEXT NOT NULL,                 -- JSON delta only, never full state
  sequence_version INTEGER NOT NULL,              -- device-monotonic vector counter
  sync_status      TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK (sync_status IN ('PENDING','PROCESSING','FAILED','QUARANTINED')),
  retry_count      INTEGER NOT NULL DEFAULT 0,
  last_error       TEXT,
  created_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON sync_outbox (sync_status, sequence_version);

-- Device-level monotonic counters (device_seq + sequence_version source)
CREATE TABLE IF NOT EXISTS device_state (
  key   TEXT PRIMARY KEY,                          -- 'device_id' | 'seq_counter'
  value TEXT NOT NULL
);

-- ------------------------------------------------------------
-- 8. APP SETTINGS (per-install)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('language',            'yo'),
  ('voice_enabled',       '1'),
  ('tts_enabled',         '1'),
  ('eod_summary_enabled', '1'),      -- end-of-day spoken summary
  ('eod_summary_time',    '19:00'),
  ('sync_wifi_only',      '0'),
  ('photo_backup',        '0');      -- off in v1 (photos stay on device)
