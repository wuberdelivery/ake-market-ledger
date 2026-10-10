/**
 * Deterministic tests for the safety-critical voice-to-ledger parser.
 * Native database/audio behavior is verified by the Android build and device
 * smoke test; Jest cannot load JSI modules such as quick-sqlite.
 */

import { describe, expect, it } from '@jest/globals';
import { parseSaleIntent } from '../voice/yorubaIntentParser';
import type { Product } from '../models/types';

const rice = {
  id: 'rice-1',
  name: 'Rice',
  voiceAliases: ['rice', 'iresi', 'apo iresi'],
  sellingPriceKobo: 500000,
} as Product;

describe('voice sale intent parser', () => {
  it('parses a Yoruba sale without confusing the amount with quantity', () => {
    const result = parseSaleIntent(
      'Mo ta apo iresi meji, o san egberun mewa',
      [rice],
    );

    expect(result.productId).toBe('rice-1');
    expect(result.quantity).toBe(2);
    expect(result.amountPaidKobo).toBe(1_000_000);
    expect(result.paymentStatus).toBe('PAID');
    expect(result.missing).toEqual([]);
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('parses Nigerian English sale wording', () => {
    const result = parseSaleIntent(
      'Sold two bags of rice, paid 5000 naira',
      [rice],
    );

    expect(result.productId).toBe('rice-1');
    expect(result.quantity).toBe(2);
    expect(result.amountPaidKobo).toBe(500_000);
    expect(result.paymentStatus).toBe('DEBT');
  });

  it('refuses to invent a product that was not recognized', () => {
    const result = parseSaleIntent('Mo ta nkan meji', [rice]);

    expect(result.productId).toBeNull();
    expect(result.missing).toContain('product');
  });
});
