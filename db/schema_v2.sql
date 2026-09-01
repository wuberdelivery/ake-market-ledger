-- ============================================================
-- AKE LEDGER — Schema v2 additions
-- Adds: multi-unit selling (buy bag → sell cups) and bulk/no-count
-- stock (truck of yam tracked by money, not count).
-- This file documents v2; the runtime migration lives in database.ts.
-- ============================================================

-- ---- products: new columns (added via ALTER in migration) ----
-- stock_mode:  'COUNTED'  = normal item with a quantity
--              'BULK'     = tracked by money spent/recovered, no unit count
-- base_unit:   the purchase unit ("apo"/"bag"/"carton"/"load")
-- The existing unit_label / stock_quantity / prices keep working for
-- simple single-unit products (backward compatible).

-- For BULK products:
--   bulk_cost_kobo      = what the whole load cost
--   bulk_recovered_kobo = money taken so far from selling it down
--   (profit shows once recovered > cost; "finished" when trader marks it)

-- ------------------------------------------------------------
-- 2b. SELL UNITS (Ìwọ̀n títà) — the break-bulk table
--   One product (bag of rice) → many sell units (cup, mudu, half-bag)
--   Each sell unit knows how many BASE units it consumes.
--   e.g. base=bag(1). Cup = 0.025 bag (40 cups per bag).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_units (
  id                 TEXT PRIMARY KEY,          -- UUID v4
  product_id         TEXT NOT NULL REFERENCES products(id),
  unit_label         TEXT NOT NULL,             -- "derica","cup","mudu","half bag"
  base_per_unit      REAL NOT NULL,             -- base units consumed per 1 sell unit
                                                --   (cup = 0.025 bag; half-bag = 0.5)
  selling_price_kobo INTEGER NOT NULL,          -- price for ONE of this sell unit
  is_default         INTEGER NOT NULL DEFAULT 0,-- the unit shown first
  sort_order         INTEGER NOT NULL DEFAULT 0,
  is_active          INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_product_units ON product_units (product_id, is_active, sort_order);

-- transactions: new column sell_unit_id records WHICH unit was sold,
-- so history and receipts can say "3 cups" not "0.075 bags".
