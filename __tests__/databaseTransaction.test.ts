import {describe, expect, it} from '@jest/globals';
import {transactionSync} from '../db/transactionSync';

describe('transactionSync', () => {
  it('runs the write before returning and commits it', () => {
    const statements: string[] = [];
    const connection = {
      execute: (sql: string) => {
        statements.push(sql);
        return {};
      },
    };
    let completed = false;

    transactionSync(connection as any, tx => {
      tx.execute('INSERT INTO products (id) VALUES (?)', ['second-product']);
      completed = true;
    });

    expect(completed).toBe(true);
    expect(statements).toEqual([
      'BEGIN IMMEDIATE TRANSACTION',
      'INSERT INTO products (id) VALUES (?)',
      'COMMIT',
    ]);
  });

  it('rolls back and preserves the original error', () => {
    const statements: string[] = [];
    const connection = {
      execute: (sql: string) => {
        statements.push(sql);
        return {};
      },
    };

    expect(() =>
      transactionSync(connection as any, () => {
        throw new Error('duplicate outbox key');
      }),
    ).toThrow('duplicate outbox key');
    expect(statements).toEqual(['BEGIN IMMEDIATE TRANSACTION', 'ROLLBACK']);
  });
});
