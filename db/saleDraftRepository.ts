import {getDb} from './database';

export interface SaleDraftItem {
  id: string;
  productId: string;
  sellUnitId: string | null;
  quantity: number;
  unitPriceKobo?: number;
}

export interface SaleDraft {
  items: SaleDraftItem[];
  paidNaira: string;
  customerId: string | null;
  voiceTranscript: string | null;
  updatedAt: string;
}

function key(userId: string): string {
  return `active_sale_draft:${userId}`;
}

export function loadSaleDraft(userId: string): SaleDraft | null {
  try {
    const result = getDb().execute(
      `SELECT value FROM app_settings WHERE key=?`,
      [key(userId)],
    );
    if (!result.rows?.length) {
      return null;
    }
    const parsed = JSON.parse(result.rows.item(0).value) as SaleDraft;
    return Array.isArray(parsed.items) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSaleDraft(
  userId: string,
  draft: Omit<SaleDraft, 'updatedAt'>,
): void {
  const value: SaleDraft = {...draft, updatedAt: new Date().toISOString()};
  getDb().execute(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [key(userId), JSON.stringify(value)],
  );
}

export function clearSaleDraft(userId: string): void {
  getDb().execute(`DELETE FROM app_settings WHERE key=?`, [key(userId)]);
}
