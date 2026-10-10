import {describe, expect, it} from '@jest/globals';
import {parseSaleIntent, parseYorubaNumber} from '../voice/yorubaIntentParser';
import {Product} from '../models/types';

const products = [
  {
    id: 'rice',
    name: 'Iresi',
    voiceAliases: ['iresi', 'apo iresi'],
    sellingPriceKobo: 600000,
  } as Product,
  {
    id: 'beans',
    name: 'Ewa',
    voiceAliases: ['ewa'],
    sellingPriceKobo: 250000,
  } as Product,
];

describe('parseYorubaNumber', () => {
  it.each([
    ['méjì', 2],
    ['mẹ́ẹ̀dógún', 15],
    ['ogún àti márùn', 25],
    ['ọgọ́rùn-ún márùn', 500],
    ['ẹgbẹ̀rún méjì àti àádọ́ta', 2050],
    ['méjì ẹgbẹ̀rún àti igba', 2200],
    ['2,500', 2500],
  ])('parses %s as %i', (spoken, expected) => {
    expect(parseYorubaNumber(spoken)).toBe(expected);
  });
});

describe('parseSaleIntent', () => {
  it('parses a digit sale phrase', () => {
    const intent = parseSaleIntent('Ta Iresi 2 ni 12000 naira', products);
    expect(intent.productId).toBe('rice');
    expect(intent.quantity).toBe(2);
    expect(intent.amountPaidKobo).toBe(1200000);
    expect(intent.requiresReview).toBe(true);
  });

  it('parses Yoruba quantity and a compound amount', () => {
    const intent = parseSaleIntent(
      'Ta ìrẹsì méjì ní ẹgbẹ̀rún márùn-ún naira',
      products,
    );
    expect(intent.productId).toBe('rice');
    expect(intent.quantity).toBe(2);
    expect(intent.amountPaidKobo).toBe(500000);
  });

  it('accepts naira before the spoken amount', () => {
    const intent = parseSaleIntent(
      'Ta ewa meta fun naira egberun meji',
      products,
    );
    expect(intent.productId).toBe('beans');
    expect(intent.quantity).toBe(3);
    expect(intent.amountPaidKobo).toBe(200000);
  });

  it('does not mistake a small amount for the quantity', () => {
    const intent = parseSaleIntent('Ta Iresi meji ni aadota naira', products);
    expect(intent.quantity).toBe(2);
    expect(intent.amountPaidKobo).toBe(5000);
  });

  it('flags unknown intents and never marks them ready to save', () => {
    const intent = parseSaleIntent('Fi Iresi kun ile itaja', products);
    expect(intent.reason).toBe('UNSUPPORTED_INTENT');
    expect(intent.requiresReview).toBe(true);
    expect(intent.confidence).toBe(0);
  });
});
