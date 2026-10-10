import {describe, expect, it} from '@jest/globals';
import {
  allocatePaymentKobo,
  lineTotalKobo,
  saleTotalKobo,
} from '../utils/saleMath';

describe('multi-item sale math', () => {
  it('calculates line and receipt totals in integer kobo', () => {
    expect(lineTotalKobo({quantity: 3, unitPriceKobo: 12550})).toBe(37650);
    expect(
      saleTotalKobo([
        {quantity: 2, unitPriceKobo: 500000},
        {quantity: 3, unitPriceKobo: 12550},
      ]),
    ).toBe(1_037_650);
  });

  it('allocates a partial payment without losing a kobo', () => {
    const allocation = allocatePaymentKobo([50000, 25000, 10000], 62001);
    expect(allocation).toEqual([50000, 12001, 0]);
    expect(allocation.reduce((sum, value) => sum + value, 0)).toBe(62001);
  });

  it('caps overpayment at the receipt total', () => {
    expect(allocatePaymentKobo([50000, 25000], 999999)).toEqual([50000, 25000]);
  });

  it('rejects invalid quantities and totals', () => {
    expect(() => lineTotalKobo({quantity: 0, unitPriceKobo: 100})).toThrow(
      'INVALID_QUANTITY',
    );
    expect(() => allocatePaymentKobo([-1], 0)).toThrow('INVALID_LINE_TOTAL');
  });
});
