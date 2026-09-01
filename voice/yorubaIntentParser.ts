// ============================================================
// AKE LEDGER — yorubaIntentParser.ts
// Turns ASR text like "mo ta apo iresi meji o san egberun mewa"
// into a structured sale intent for recordSale().
//
// Design principles:
//  • Tone-mark agnostic: ASR output is unreliable about diacritics,
//    so everything is normalized (méjì → meji) before matching.
//  • Constrained domain: we only parse numbers, money words, product
//    aliases, and payment keywords — not open Yoruba. That's what
//    makes offline/imperfect ASR usable.
//  • Never guesses silently: returns confidence + missing fields so
//    the UI can ask ("Mélòó?") instead of logging wrong data.
// ============================================================

import type { Product } from '../models/types';

export interface SaleIntent {
  productId: string | null;
  productName: string | null;
  quantity: number | null;
  amountPaidKobo: number | null; // null = not stated → default full price
  paymentStatus: 'PAID' | 'DEBT' | null;
  customerHint: string | null;   // words after "fun" (for/to <name>)
  confidence: number;            // 0..1
  missing: ('product' | 'quantity')[];
  raw: string;
  normalized: string;
}

// ------------------------------------------------------------
// Normalization: strip tone marks / diacritics, lowercase
// ------------------------------------------------------------
export function normalizeYoruba(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // combining marks (á à ā …)
    .replace(/ẹ/g, 'e').replace(/ọ/g, 'o').replace(/ṣ/g, 's')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ------------------------------------------------------------
// Yoruba numbers (normalized forms). Covers 1–20, tens, and the
// money words; compounds handled by the amount parser below.
// ------------------------------------------------------------
const UNITS: Record<string, number> = {
  'okan': 1, 'kan': 1, 'eni': 1,
  'meji': 2, 'eji': 2,
  'meta': 3, 'eta': 3,
  'merin': 4, 'erin': 4,
  'marun': 5, 'marun un': 5, 'arun': 5,
  'mefa': 6, 'efa': 6,
  'meje': 7, 'eje': 7,
  'mejo': 8, 'ejo': 8,
  'mesan': 9, 'esan': 9,
  'mewa': 10, 'ewa': 10,
  'mokanla': 11, 'mejila': 12, 'metala': 13, 'merinla': 14, 'medogun': 15,
  'merindilogun': 16, 'metadilogun': 17, 'mejidilogun': 18, 'mokandilogun': 19,
  'ogun': 20, 'ogbon': 30,
  'ogoji': 40, 'aadota': 50, 'ogota': 60, 'aadorin': 70,
  'ogorin': 80, 'aadorun': 90,
};

// Money multipliers
const MONEY_WORDS: Record<string, number> = {
  'ogorun': 100, 'orun': 100,        // hundred
  'egberun': 1000, 'egbewa': 2000,   // thousand / two thousand (old count)
  'oke': 1000,                        // slang: oke kan = ₦1000 (some areas use for higher)
  'milionu': 1000000, 'million': 1000000,
};

// English digits/words often slip into market speech — accept them
const ENGLISH_NUMS: Record<string, number> = {
  'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
  'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'hundred': 100, 'thousand': 1000, 'k': 1000,
};

function wordToNumber(w: string): number | null {
  if (/^\d+$/.test(w)) return parseInt(w, 10);
  if (/^\d+k$/.test(w)) return parseInt(w, 10) * 1000;
  const direct = UNITS[w] ?? ENGLISH_NUMS[w];
  if (direct !== undefined) return direct;
  // Tone-mark stripping leaves elongated vowels: mẹ́wàá → "mewaa".
  // Collapse consecutive duplicate letters and retry.
  const collapsed = w.replace(/(.)\1+/g, '$1');
  return UNITS[collapsed] ?? ENGLISH_NUMS[collapsed] ?? null;
}

// ------------------------------------------------------------
// Amount parser: finds money expressions and returns kobo.
// Handles: "egberun mewa" (1000×10=10,000), "ogorun meji" (200),
// "5000 naira", "10k", "egberun kan ati ogorun marun" → 1,500
// ------------------------------------------------------------
export function parseAmountKobo(normalized: string): number | null {
  const tokens = normalized.split(' ');
  let totalNaira = 0;
  let found = false;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const mult = MONEY_WORDS[t] ?? (ENGLISH_NUMS[t] >= 100 ? ENGLISH_NUMS[t] : undefined);

    if (mult !== undefined) {
      // multiplier word: look right for count (yoruba style: egberun mewa)
      // then left (english style: ten thousand)
      const right = i + 1 < tokens.length ? wordToNumber(tokens[i + 1]) : null;
      const left = i - 1 >= 0 ? wordToNumber(tokens[i - 1]) : null;
      let count = 1;
      if (right !== null && right < 100) { count = right; i++; }
      else if (left !== null && left < 100 && !found) { count = left; totalNaira -= left; }
      totalNaira += mult * count;
      found = true;
    } else if (/^\d{3,}$/.test(t) || /^\d+k$/.test(t)) {
      // bare figures ≥100 or "10k" are money ("o san 5000")
      totalNaira += wordToNumber(t)!;
      found = true;
    } else if (t === 'naira' || t === 'kobo') {
      found = found || totalNaira > 0;
    }
  }

  return found && totalNaira > 0 ? Math.round(totalNaira * 100) : null;
}

// ------------------------------------------------------------
// Quantity parser: small number nearest to the product mention,
// excluding tokens that belong to money expressions.
// ------------------------------------------------------------
function parseQuantity(tokens: string[], productIdx: number, moneySpan: Set<number>): number | null {
  let best: { qty: number; dist: number } | null = null;
  for (let i = 0; i < tokens.length; i++) {
    if (moneySpan.has(i)) continue;
    const n = wordToNumber(tokens[i]);
    if (n !== null && n >= 1 && n <= 99) {
      const dist = productIdx >= 0 ? Math.abs(i - productIdx) : i;
      if (!best || dist < best.dist) best = { qty: n, dist };
    }
  }
  return best?.qty ?? null;
}

// Mark token indexes that are part of money expressions so the
// quantity parser doesn't steal them ("egberun MEWA" ≠ qty 10).
function findMoneySpans(tokens: string[]): Set<number> {
  const span = new Set<number>();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const isMultWord = MONEY_WORDS[t] !== undefined
      || (ENGLISH_NUMS[t] !== undefined && ENGLISH_NUMS[t] >= 100);
    const isBareFigure = /^\d{3,}$/.test(t) || /^\d+k$/.test(t);

    if (isMultWord || isBareFigure || t === 'naira') span.add(i);

    // Only multiplier WORDS absorb neighbor counts ("egberun mewa",
    // "ten thousand"). Bare figures like "5000" stand alone — the
    // small number beside them is the QUANTITY ("marun 5000 naira").
    if (isMultWord) {
      const right = i + 1 < tokens.length ? wordToNumber(tokens[i + 1]) : null;
      if (right !== null && right < 100) span.add(i + 1);
      const left = i - 1 >= 0 ? wordToNumber(tokens[i - 1]) : null;
      if (left !== null && left < 100) span.add(i - 1);
    }
  }
  return span;
}

// ------------------------------------------------------------
// Product matcher: alias containment + light fuzzy (edit distance
// ≤1 per word) against name + voice_aliases.
// ------------------------------------------------------------
function editDistanceLe1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function matchProduct(
  tokens: string[], products: Product[]
): { product: Product | null; index: number; score: number } {
  let best: { product: Product; index: number; score: number } | null = null;

  for (const p of products) {
    const aliases = [p.name, ...(p.voiceAliases ?? [])]
      .map(normalizeYoruba)
      .filter(Boolean);

    for (const alias of aliases) {
      const aliasWords = alias.split(' ');
      for (let i = 0; i <= tokens.length - 1; i++) {
        // try to match alias words as a subsequence starting near i
        let matched = 0;
        for (const aw of aliasWords) {
          for (let j = i; j < Math.min(tokens.length, i + aliasWords.length + 2); j++) {
            if (editDistanceLe1(tokens[j], aw)) { matched++; break; }
          }
        }
        const score = matched / aliasWords.length;
        if (score >= 0.5 && (!best || score > best.score)) {
          best = { product: p, index: i, score };
        }
      }
    }
  }
  return best ?? { product: null, index: -1, score: 0 };
}

// ------------------------------------------------------------
// Payment status keywords
// ------------------------------------------------------------
const DEBT_WORDS = ['gbese', 'onigbese', 'je mi lowo', 'ko san', 'san die', 'ku', 'owo ku', 'credit'];
const PAID_WORDS = ['san tan', 'san pe', 'o san', 'ti san', 'paid', 'san gbogbo'];

function parsePaymentStatus(normalized: string): 'PAID' | 'DEBT' | null {
  for (const w of DEBT_WORDS) if (normalized.includes(w)) return 'DEBT';
  for (const w of PAID_WORDS) if (normalized.includes(w)) return 'PAID';
  return null;
}

// ------------------------------------------------------------
// Customer hint: words after "fun" (to/for) — "fun mama bola"
// ------------------------------------------------------------
function parseCustomerHint(tokens: string[]): string | null {
  const i = tokens.lastIndexOf('fun');
  if (i >= 0 && i + 1 < tokens.length) {
    const STOP = new Set(['ko', 'o', 'ti', 'san', 'gbese', 'onigbese', 'paid', 'credit']);
    const words: string[] = [];
    for (let j = i + 1; j < Math.min(tokens.length, i + 4); j++) {
      if (STOP.has(tokens[j]) || wordToNumber(tokens[j]) !== null) break;
      words.push(tokens[j]);
    }
    return words.length ? words.join(' ') : null;
  }
  return null;
}

// ------------------------------------------------------------
// MAIN ENTRY
// ------------------------------------------------------------
export function parseSaleIntent(asrText: string, products: Product[]): SaleIntent {
  const normalized = normalizeYoruba(asrText);
  const tokens = normalized.split(' ');

  const moneySpan = findMoneySpans(tokens);
  const { product, index: productIdx, score } = matchProduct(tokens, products);
  const quantity = parseQuantity(tokens, productIdx, moneySpan);
  const amountPaidKobo = parseAmountKobo(normalized);
  const paymentStatus = parsePaymentStatus(normalized)
    ?? (amountPaidKobo !== null ? null : 'PAID'); // no money words + no debt words → assume paid in full
  const customerHint = parseCustomerHint(tokens);

  const missing: SaleIntent['missing'] = [];
  if (!product) missing.push('product');
  if (quantity === null) missing.push('quantity');

  // Confidence: product match score weighted highest, then quantity presence
  const confidence =
    (product ? 0.55 * score : 0) +
    (quantity !== null ? 0.3 : 0) +
    (paymentStatus !== null || amountPaidKobo !== null ? 0.15 : 0);

  return {
    productId: product?.id ?? null,
    productName: product?.name ?? null,
    quantity,
    amountPaidKobo,
    paymentStatus,
    customerHint,
    confidence: Math.round(confidence * 100) / 100,
    missing,
    raw: asrText,
    normalized,
  };
}
