// ============================================================
// AKE LEDGER — syncEngine.ts (client side)
// Drains the outbox to the server whenever network allows.
// Rules enforced here:
//   • strict sequence order (per-device vector)
//   • batches of 50, marked PROCESSING to prevent double-send
//   • exponential backoff + jitter on failure
//   • retry_count >= 10 → QUARANTINED (never silently dropped)
//   • server corrections applied atomically on ack
//   • respects sync_wifi_only setting
// Trigger sources: NetInfo connectivity events, app foreground,
// and a periodic headless task (react-native-background-fetch).
//   npm i @react-native-community/netinfo
// ============================================================

import NetInfo from '@react-native-community/netinfo';
import { getDb, getDeviceId } from '../db/database';

const SYNC_URL = 'https://api.akeledger.wuberrides.com.ng/api/v1/ledger/sync'; // TODO: config
const BATCH_SIZE = 50;
const MAX_RETRIES = 10;
const BASE_DELAY_MS = 2000;
const TIMEOUT_MS = 15000;

let isSyncing = false;
let backoffTimer: ReturnType<typeof setTimeout> | null = null;

// ------------------------------------------------------------
// Wiring: call once from App after initDatabase()
// ------------------------------------------------------------
export function startSyncEngine(getAuthToken: () => string | null): void {
  NetInfo.addEventListener(state => {
    if (state.isConnected) void trySync(getAuthToken);
  });
  void trySync(getAuthToken); // opportunistic on boot
}

export async function trySync(getAuthToken: () => string | null): Promise<void> {
  if (isSyncing) return;
  const token = getAuthToken();
  if (!token) return; // not registered with server yet — fully offline mode

  const net = await NetInfo.fetch();
  if (!net.isConnected) return;

  const wifiOnly = getSetting('sync_wifi_only') === '1';
  if (wifiOnly && net.type !== 'wifi') return;

  isSyncing = true;
  try {
    // Loop until outbox drained or a batch fails
    // (each iteration re-reads, so events written mid-sync are picked up)
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const sent = await syncOneBatch(token);
      if (!sent) break;
    }
  } finally {
    isSyncing = false;
  }
}

// ------------------------------------------------------------
// One batch round-trip. Returns true if a batch was fully acked.
// ------------------------------------------------------------
async function syncOneBatch(token: string): Promise<boolean> {
  const db = getDb();

  const r = db.execute(
    `SELECT event_id, idempotency_key, aggregate_type, aggregate_id,
            action, payload, sequence_version
       FROM sync_outbox
      WHERE sync_status IN ('PENDING','FAILED')
      ORDER BY sequence_version ASC
      LIMIT ?`,
    [BATCH_SIZE]
  );

  const events: any[] = [];
  for (let i = 0; i < (r.rows?.length ?? 0); i++) events.push(r.rows!.item(i));
  if (events.length === 0) return false;

  const ids = events.map(e => e.event_id);
  const ph = ids.map(() => '?').join(',');

  db.execute(
    `UPDATE sync_outbox SET sync_status='PROCESSING' WHERE event_id IN (${ph})`,
    ids
  );

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(SYNC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        device_id: getDeviceId(),
        batch: events.map(e => ({
          event_id: e.event_id,
          idempotency_key: e.idempotency_key,
          aggregate_type: e.aggregate_type,
          aggregate_id: e.aggregate_id,
          action: e.action,
          payload: JSON.parse(e.payload),
          sequence_version: e.sequence_version,
        })),
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.status === 200) {
      const body = await res.json();
      applyServerAck(body, ids);
      return true;
    }

    // 4xx on the whole batch usually means one poison event — quarantine
    // the batch head so the rest can flow, rather than blocking forever.
    if (res.status >= 400 && res.status < 500) {
      markFailed(ids, `HTTP ${res.status}`, /*poisonHead*/ true);
    } else {
      markFailed(ids, `HTTP ${res.status}`, false); // 5xx: server's problem, retry
    }
    scheduleBackoff();
    return false;
  } catch (err: any) {
    // Network drop / timeout — normal life in the market
    markFailed(ids, String(err?.message ?? err), false);
    scheduleBackoff();
    return false;
  }
}

// ------------------------------------------------------------
// Apply a successful server response atomically
// ------------------------------------------------------------
function applyServerAck(
  body: {
    processed_ids?: string[];
    conflict_corrections?: {
      product_id: string;
      actual_stock: number;
    }[];
  },
  sentIds: string[]
): void {
  const db = getDb();
  const processed = body.processed_ids ?? [];
  const corrections = body.conflict_corrections ?? [];

  db.transaction(tx => {
    if (processed.length > 0) {
      const ph = processed.map(() => '?').join(',');
      tx.execute(`DELETE FROM sync_outbox WHERE event_id IN (${ph})`, processed);
    }

    // Anything sent but not acked goes back to PENDING for the next pass
    const unacked = sentIds.filter(id => !processed.includes(id));
    if (unacked.length > 0) {
      const ph = unacked.map(() => '?').join(',');
      tx.execute(
        `UPDATE sync_outbox SET sync_status='PENDING' WHERE event_id IN (${ph})`,
        unacked
      );
    }

    // Server is the cross-device referee: apply stock corrections
    for (const c of corrections) {
      tx.execute(
        `UPDATE products SET stock_quantity = ?, updated_at = ? WHERE id = ?`,
        [c.actual_stock, new Date().toISOString(), c.product_id]
      );
    }
  });
}

// ------------------------------------------------------------
// Failure bookkeeping
// ------------------------------------------------------------
function markFailed(ids: string[], error: string, poisonHead: boolean): void {
  const db = getDb();
  const ph = ids.map(() => '?').join(',');

  db.transaction(tx => {
    tx.execute(
      `UPDATE sync_outbox
          SET sync_status = CASE
                WHEN retry_count + 1 >= ${MAX_RETRIES} THEN 'QUARANTINED'
                ELSE 'FAILED' END,
              retry_count = retry_count + 1,
              last_error = ?
        WHERE event_id IN (${ph})`,
      [error.slice(0, 500), ...ids]
    );
    if (poisonHead && ids.length > 0) {
      // Quarantine the first event immediately on a 4xx so it stops
      // blocking the queue; surfaced to owner for review.
      tx.execute(
        `UPDATE sync_outbox SET sync_status='QUARANTINED' WHERE event_id = ?`,
        [ids[0]]
      );
    }
  });
}

function scheduleBackoff(): void {
  if (backoffTimer) return;
  const db = getDb();
  const r = db.execute(
    `SELECT MAX(retry_count) AS rc FROM sync_outbox WHERE sync_status='FAILED'`
  );
  const rc = r.rows?.length ? (r.rows.item(0).rc ?? 0) : 0;
  const delay =
    Math.min(BASE_DELAY_MS * Math.pow(2, rc), 10 * 60 * 1000) + // cap 10 min
    Math.floor(Math.random() * 1000); // jitter
  backoffTimer = setTimeout(() => {
    backoffTimer = null;
    // trySync is re-entered via the stored token getter on next trigger;
    // simplest correct behavior: nudge NetInfo consumers
    void NetInfo.fetch();
  }, delay);
}

// ------------------------------------------------------------
// Owner-facing health check (for a small ⚠ badge on the ledger)
// ------------------------------------------------------------
export function getSyncHealth(): {
  pending: number; failed: number; quarantined: number;
} {
  const db = getDb();
  const r = db.execute(
    `SELECT
       SUM(CASE WHEN sync_status='PENDING' THEN 1 ELSE 0 END) AS p,
       SUM(CASE WHEN sync_status='FAILED' THEN 1 ELSE 0 END) AS f,
       SUM(CASE WHEN sync_status='QUARANTINED' THEN 1 ELSE 0 END) AS q
     FROM sync_outbox`
  );
  const row = r.rows?.length ? r.rows.item(0) : { p: 0, f: 0, q: 0 };
  return { pending: row.p ?? 0, failed: row.f ?? 0, quarantined: row.q ?? 0 };
}

function getSetting(key: string): string | null {
  const r = getDb().execute(`SELECT value FROM app_settings WHERE key=?`, [key]);
  return r.rows?.length ? r.rows.item(0).value : null;
}
