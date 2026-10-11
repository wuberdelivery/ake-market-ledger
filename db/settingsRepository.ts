import {getDb, transactionSync} from './database';
import type {Language} from '../models/types';

export function getAppLanguage(): Language {
  const result = getDb().execute(
    `SELECT value FROM app_settings WHERE key='language'`,
  );
  const value = result.rows?.length ? result.rows.item(0).value : 'en';
  return ['en', 'yo', 'ha', 'ig'].includes(value) ? (value as Language) : 'en';
}

export function setAppLanguage(language: Language, userId?: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  transactionSync(db, tx => {
    tx.execute(
      `INSERT INTO app_settings (key, value) VALUES ('language', ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      [language],
    );
    if (userId) {
      tx.execute(`UPDATE users SET language=?, updated_at=? WHERE id=?`, [
        language,
        now,
        userId,
      ]);
    }
  });
}

export function isSessionLocked(): boolean {
  const result = getDb().execute(
    `SELECT value FROM app_settings WHERE key='session_locked'`,
  );
  return result.rows?.length ? result.rows.item(0).value === '1' : false;
}

export function getActiveUserId(): string | null {
  const result = getDb().execute(
    `SELECT value FROM app_settings WHERE key='active_user_id'`,
  );
  return result.rows?.length ? result.rows.item(0).value : null;
}

export function setActiveUserId(userId: string): void {
  getDb().execute(
    `INSERT INTO app_settings (key, value) VALUES ('active_user_id', ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [userId],
  );
}

export function setSessionLocked(locked: boolean): void {
  getDb().execute(
    `INSERT INTO app_settings (key, value) VALUES ('session_locked', ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [locked ? '1' : '0'],
  );
}
