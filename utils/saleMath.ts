export interface PricedSaleLine {
  quantity: number;
  unitPriceKobo: number;
}

export function lineTotalKobo(line: PricedSaleLine): number {
  if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
    throw new Error('INVALID_QUANTITY');
  }
  if (!Number.isInteger(line.unitPriceKobo) || line.unitPriceKobo < 0) {
    throw new Error('INVALID_UNIT_PRICE');
  }
  return Math.round(line.quantity * line.unitPriceKobo);
}

export function saleTotalKobo(lines: PricedSaleLine[]): number {
  return lines.reduce((sum, line) => sum + lineTotalKobo(line), 0);
}

/**
 * Allocates a receipt-level payment across its lines without creating or
 * losing a kobo. Earlier lines are settled first; the remaining lines carry
 * the debt. The allocation is deterministic for local and sync replay.
 */
export function allocatePaymentKobo(
  lineTotals: number[],
  requestedPaidKobo: number,
): number[] {
  const cleanTotals = lineTotals.map(total => {
    if (!Number.isInteger(total) || total < 0) {
      throw new Error('INVALID_LINE_TOTAL');
    }
    return total;
  });
  const receiptTotal = cleanTotals.reduce((sum, total) => sum + total, 0);
  let remaining = Math.min(
    Math.max(Math.round(requestedPaidKobo || 0), 0),
    receiptTotal,
  );
  return cleanTotals.map(total => {
    const allocated = Math.min(total, remaining);
    remaining -= allocated;
    return allocated;
  });
}
