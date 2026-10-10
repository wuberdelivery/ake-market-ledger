import {Product} from '../models/types';

export interface SaleIntent {
  intent: 'SALE';
  productId: string | null;
  productName: string;
  quantity: number;
  amountPaidKobo: number | null;
  transcript: string;
  confidence: number;
  amountConfidence?: number;
  paymentStatus: 'PAID' | 'DEBT';
  customerHint: string | null;
  missing: Array<'product' | 'quantity' | 'amount'>;
  requiresReview?: boolean;
  reason?: string;
}

const SALE_WORDS = new Set([
  'ta',
  'taa',
  'tita',
  'sale',
  'sell',
  'sold',
  'sayar',
  'sayarwa',
  'ere',
  'rere',
]);
const CURRENCY_WORDS = new Set(['naira', 'naria', 'nera', '₦', 'owo', 'kobo']);
const CONNECTORS = new Set([
  'ati',
  'le',
  'ni',
  'fun',
  'si',
  'pelu',
  'pẹlu',
  'and',
  'for',
  'at',
  'by',
  'mo',
  'o',
  'san',
  'paid',
  'apo',
  'bag',
  'bags',
  'of',
]);

const SMALL: Record<string, number> = {
  odo: 0,
  kan: 1,
  ikan: 1,
  okan: 1,
  enikan: 1,
  meji: 2,
  meta: 3,
  merin: 4,
  marun: 5,
  mefa: 6,
  meje: 7,
  mejo: 8,
  mesan: 9,
  mewa: 10,
  mokanla: 11,
  mokanlela: 11,
  mejila: 12,
  metala: 13,
  merinla: 14,
  meedogun: 15,
  medogun: 15,
  merindinlogun: 16,
  metadinlogun: 17,
  mejidinlogun: 18,
  mokandinlogun: 19,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  ogun: 20,
  ogbon: 30,
  ogoji: 40,
  aadota: 50,
  adota: 50,
  ogota: 60,
  aadorin: 70,
  adorin: 70,
  ogorin: 80,
  aadorun: 90,
  aadurun: 90,
  adurun: 90,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const DIRECT_HUNDREDS: Record<string, number> = {
  ogorun: 100,
  igba: 200,
  odunrun: 300,
  irinwo: 400,
  edegbeta: 500,
  egbeta: 600,
  eedegberin: 700,
  egberin: 800,
  eedegberun: 900,
};

const THOUSAND_WORDS = new Set(['egberun', 'eegberun']);
const MILLION_WORDS = new Set(['milionu', 'million']);

function stripMarks(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function canonicalToken(value: string): string {
  return stripMarks(value).replace(/[^a-z0-9₦]/g, '');
}

function tokenize(text: string): string[] {
  return stripMarks(text)
    .replace(/(\d),(?=\d)/g, '$1')
    .replace(/[^a-z0-9₦]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function numericTokenValue(token: string): number | null {
  const clean = canonicalToken(token);
  if (/^\d+$/.test(clean)) {
    return Number(clean);
  }
  return SMALL[clean] ?? TENS[clean] ?? DIRECT_HUNDREDS[clean] ?? null;
}

function isNumberWord(token: string): boolean {
  const clean = canonicalToken(token);
  return (
    numericTokenValue(clean) !== null ||
    THOUSAND_WORDS.has(clean) ||
    MILLION_WORDS.has(clean)
  );
}

function parseBelowThousand(tokens: string[]): number | null {
  const meaningful = tokens
    .map(canonicalToken)
    .filter(
      token =>
        token &&
        token !== 'ati' &&
        token !== 'le' &&
        token !== 'pelu' &&
        token !== 'un',
    );
  if (!meaningful.length) {
    return null;
  }

  let total = 0;
  for (let index = 0; index < meaningful.length; index += 1) {
    const token = meaningful[index];
    const direct = numericTokenValue(token);
    if (direct === null) {
      return null;
    }

    // Support both “ogorun marun” and “marun ogorun”.
    if (token === 'ogorun' && index + 1 < meaningful.length) {
      const coefficient = SMALL[meaningful[index + 1]];
      if (coefficient && coefficient < 10) {
        total += coefficient * 100;
        index += 1;
        continue;
      }
    }
    if (index + 1 < meaningful.length && meaningful[index + 1] === 'ogorun') {
      const coefficient = SMALL[token];
      if (coefficient && coefficient < 10) {
        total += coefficient * 100;
        index += 1;
        continue;
      }
    }
    total += direct;
  }
  return total;
}

function parseScale(
  tokens: string[],
  scaleWords: Set<string>,
  scale: number,
): number | null {
  const index = tokens.findIndex(token =>
    scaleWords.has(canonicalToken(token)),
  );
  if (index < 0) {
    return null;
  }

  const left = tokens
    .slice(0, index)
    .filter(token => canonicalToken(token) !== 'ati');
  let right = tokens.slice(index + 1);
  let coefficient: number | null = null;

  if (left.length) {
    coefficient = parseBelowThousand(left);
  } else if (right.length) {
    const next = numericTokenValue(right[0]);
    if (next !== null && next > 0 && next < 100) {
      coefficient = next;
      right = right.slice(1);
    }
  }
  if (coefficient === null) {
    coefficient = 1;
  }

  const tail = parseYorubaNumberTokens(right) ?? 0;
  return coefficient * scale + tail;
}

function parseYorubaNumberTokens(tokens: string[]): number | null {
  const clean = tokens
    .map(canonicalToken)
    .filter(
      token => token && !['ni', 'fun', 'si', 'for', 'at', 'by'].includes(token),
    );
  if (!clean.length) {
    return null;
  }

  const million = parseScale(clean, MILLION_WORDS, 1_000_000);
  if (million !== null) {
    return million;
  }
  const thousand = parseScale(clean, THOUSAND_WORDS, 1_000);
  if (thousand !== null) {
    return thousand;
  }
  return parseBelowThousand(clean);
}

export function parseYorubaNumber(input: string): number | null {
  return parseYorubaNumberTokens(tokenize(input));
}

interface NumberSpan {
  start: number;
  end: number;
  value: number;
}

function numberSpans(tokens: string[]): NumberSpan[] {
  const spans: NumberSpan[] = [];
  let index = 0;
  while (index < tokens.length) {
    if (!isNumberWord(tokens[index])) {
      index += 1;
      continue;
    }
    const start = index;
    let end = index + 1;
    while (
      end < tokens.length &&
      (isNumberWord(tokens[end]) ||
        ['ati', 'le', 'pelu'].includes(canonicalToken(tokens[end])))
    ) {
      end += 1;
    }
    let acceptedEnd = end;
    let value: number | null = null;
    while (acceptedEnd > start && value === null) {
      value = parseYorubaNumberTokens(tokens.slice(start, acceptedEnd));
      if (value === null) {
        acceptedEnd -= 1;
      }
    }
    if (value !== null) {
      spans.push({start, end: acceptedEnd, value});
      index = acceptedEnd;
    } else {
      index += 1;
    }
  }
  return spans;
}

function findAmountSpan(
  tokens: string[],
  spans: NumberSpan[],
): NumberSpan | null {
  const currencyIndexes = tokens
    .map((token, index) =>
      CURRENCY_WORDS.has(canonicalToken(token)) ? index : -1,
    )
    .filter(index => index >= 0);

  for (const currencyIndex of currencyIndexes) {
    const after = spans
      .filter(span => span.start > currencyIndex)
      .sort((a, b) => a.start - b.start)[0];
    // “naira ẹgbẹrun meji” puts the currency before the amount. Prefer an
    // immediately following number so an earlier quantity is not stolen.
    if (after && after.start - currencyIndex <= 2) {
      return after;
    }
    const before = spans
      .filter(span => span.end <= currencyIndex)
      .sort((a, b) => b.end - a.end)[0];
    if (before && currencyIndex - before.end <= 2) {
      return before;
    }
  }

  // “ni / fun / for 2500” is a common currency-less market utterance.
  const qualified = spans.filter(span => {
    const previous = canonicalToken(tokens[span.start - 1] ?? '');
    return ['ni', 'fun', 'for', 'at'].includes(previous) || span.value >= 100;
  });
  return qualified.length ? qualified[qualified.length - 1] : null;
}

function matchProduct(
  productText: string,
  products: Product[],
): Product | null {
  const search = stripMarks(productText).trim();
  if (!search) {
    return null;
  }
  const searchWords = search.split(/\s+/).filter(word => word.length > 1);
  const ranked = products
    .map(product => {
      const candidates = [product.name, ...(product.voiceAliases ?? [])]
        .map(stripMarks)
        .filter(Boolean);
      const score = Math.max(
        ...candidates.map(candidate => {
          if (candidate === search) return 100;
          if (search.includes(candidate) || candidate.includes(search))
            return 75;
          const candidateWords = candidate.split(/\s+/);
          return (
            searchWords.filter(word => candidateWords.includes(word)).length *
            12
          );
        }),
      );
      return {product, score};
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.score > 0 ? ranked[0].product : null;
}

export function parseSaleIntent(
  transcript: string,
  products: Product[],
): SaleIntent {
  const tokens = tokenize(transcript);
  if (!tokens.some(token => SALE_WORDS.has(canonicalToken(token)))) {
    return {
      intent: 'SALE',
      productId: null,
      productName: '',
      quantity: 1,
      amountPaidKobo: null,
      transcript,
      confidence: 0,
      paymentStatus: 'PAID',
      customerHint: null,
      missing: ['product', 'quantity', 'amount'],
      requiresReview: true,
      reason: 'UNSUPPORTED_INTENT',
    };
  }

  const spans = numberSpans(tokens);
  const amountSpan = findAmountSpan(tokens, spans);
  const quantitySpan = spans.find(
    span => span !== amountSpan && span.value > 0 && span.value <= 999,
  );
  const quantity = Math.max(1, Math.round(quantitySpan?.value ?? 1));

  const excluded = new Set<number>();
  [amountSpan, quantitySpan].forEach(span => {
    if (span) {
      for (let index = span.start; index < span.end; index += 1) {
        excluded.add(index);
      }
    }
  });

  const productText = tokens
    .filter((token, index) => {
      const clean = canonicalToken(token);
      return (
        !excluded.has(index) &&
        !SALE_WORDS.has(clean) &&
        !CURRENCY_WORDS.has(clean) &&
        !CONNECTORS.has(clean)
      );
    })
    .join(' ')
    .trim();
  const product = matchProduct(productText, products);

  const amountPaidKobo = amountSpan ? Math.round(amountSpan.value * 100) : null;
  let confidence = 0.46;
  if (product) confidence += 0.25;
  if (quantitySpan) confidence += 0.1;
  if (amountSpan) confidence += 0.12;
  if (tokens.some(token => CURRENCY_WORDS.has(canonicalToken(token))))
    confidence += 0.05;
  confidence = Math.min(confidence, 0.98);

  const expectedTotal = product
    ? (product.units?.find(unit => unit.isDefault)?.sellingPriceKobo ??
        product.sellingPriceKobo) * quantity
    : 0;
  const missing: Array<'product' | 'quantity' | 'amount'> = [];
  if (!product) missing.push('product');
  if (!quantitySpan) missing.push('quantity');
  if (!amountSpan) missing.push('amount');

  return {
    intent: 'SALE',
    productId: product?.id ?? null,
    productName: product?.name ?? productText,
    quantity,
    amountPaidKobo,
    transcript,
    confidence,
    amountConfidence: amountSpan ? (amountSpan.value >= 100 ? 0.9 : 0.72) : 0,
    paymentStatus:
      amountPaidKobo !== null && product && amountPaidKobo < expectedTotal
        ? 'DEBT'
        : 'PAID',
    customerHint: null,
    missing,
    requiresReview: true,
    reason: product ? undefined : 'PRODUCT_NOT_FOUND',
  };
}
