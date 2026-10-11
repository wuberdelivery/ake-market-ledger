import type {QuickSQLiteConnection} from 'react-native-quick-sqlite';

/**
 * Run a fully synchronous SQLite transaction.
 *
 * QuickSQLite.transaction() returns a Promise and schedules its callback. The
 * repository layer intentionally exposes synchronous writes, so using that API
 * without awaiting it allowed callers to continue before inserts or sequence
 * allocation had happened. Explicit BEGIN/COMMIT keeps the existing repository
 * contract and makes errors observable by the calling screen.
 */
export function transactionSync<T>(
  conn: QuickSQLiteConnection,
  work: (tx: QuickSQLiteConnection) => T,
): T {
  conn.execute('BEGIN IMMEDIATE TRANSACTION');
  try {
    const result = work(conn);
    conn.execute('COMMIT');
    return result;
  } catch (error) {
    try {
      conn.execute('ROLLBACK');
    } catch {
      // Preserve the original database error if rollback itself fails.
    }
    throw error;
  }
}
