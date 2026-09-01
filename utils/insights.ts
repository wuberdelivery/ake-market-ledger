// ============================================================
// AKE LEDGER — insights.ts
// Small read-only helpers: low-stock list and the end-of-day
// spoken summary text (fed to TTS). No writes.
// ============================================================

import { getDb } from '../db/database';
import { t } from '../i18n/labels';
import type { Language } from '../models/types';

export interface LowStockItem {
  id: string;
  name: string;
  stockQuantity: number;
  baseUnit: string;
}

// Products at or below their low-stock threshold (COUNTED mode only)
export function getLowStock(): LowStockItem[] {
  const r = getDb().execute(
    `SELECT id, name, stock_quantity, base_unit
       FROM products
      WHERE is_active=1 AND stock_mode='COUNTED'
        AND low_stock_level > 0
        AND stock_quantity <= low_stock_level
      ORDER BY stock_quantity ASC`
  );
  const out: LowStockItem[] = [];
  for (let i = 0; i < (r.rows?.length ?? 0); i++) {
    const x = r.rows!.item(i);
    out.push({ id: x.id, name: x.name, stockQuantity: x.stock_quantity, baseUnit: x.base_unit });
  }
  return out;
}

// Build the end-of-day spoken summary in the trader's language.
// e.g. (yo) "Lónìí, ẹ ta ọjà ₦45,200. Èrè gidi ni ₦12,300. Ènìyàn 3 jẹ yín lówó."
export function buildEndOfDaySummary(language: Language): string | null {
  const db = getDb();
  const r = db.execute(
    `SELECT * FROM v_daily_net_profit WHERE day = DATE('now','localtime')`
  );
  if (!r.rows?.length) return null;
  const x = r.rows.item(0);

  const dr = db.execute(`SELECT COUNT(*) AS n FROM v_customer_debts`);
  const debtors = dr.rows?.length ? dr.rows.item(0).n : 0;

  const naira = (k: number) =>
    `${Math.round(k / 100).toLocaleString('en-NG')}`;

  if (language === 'yo') {
    return `Lónìí, ẹ ta ọjà ₦${naira(x.cash_in_kobo)}. `
      + `Èrè gidi ni ₦${naira(x.net_profit_kobo)}. `
      + (debtors > 0 ? `Ènìyàn ${debtors} jẹ yín lówó.` : `Kò sí onígbèsè.`);
  }
  if (language === 'ha') {
    return `Yau kun sayar da ₦${naira(x.cash_in_kobo)}. `
      + `Ainihin riba ₦${naira(x.net_profit_kobo)}. `
      + (debtors > 0 ? `Mutane ${debtors} suna bin ku bashi.` : `Babu mai bin bashi.`);
  }
  if (language === 'ig') {
    return `Taa unu rere ₦${naira(x.cash_in_kobo)}. `
      + `Ezi uru bụ ₦${naira(x.net_profit_kobo)}. `
      + (debtors > 0 ? `Mmadụ ${debtors} ji unu ụgwọ.` : `O nweghị onye ji ụgwọ.`);
  }
  return `Today you sold ₦${naira(x.cash_in_kobo)}. `
    + `Real profit is ₦${naira(x.net_profit_kobo)}. `
    + (debtors > 0 ? `${debtors} people owe you.` : `No one owes you.`);
}
