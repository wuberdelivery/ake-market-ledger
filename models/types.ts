// ============================================================
// AKE LEDGER — Phase 1 Domain Models (TypeScript / React Native)
// Enums are language-neutral codes; display labels come from i18n.
// ALL money values are INTEGER KOBO. Never use floats for money.
// ============================================================

export type Language = 'en' | 'yo' | 'ha' | 'ig';

export enum UserRole {
  OWNER = 'OWNER',   // Oga — full access
  HELPER = 'HELPER', // Ìrànwọ́ — can log sales only; no profit/cost visibility
}

export enum TransactionType {
  INFLOW = 'INFLOW',   // Owówọlé
  OUTFLOW = 'OUTFLOW', // Owótajá
}

export enum TransactionCategory {
  SALE = 'SALE',
  RESTOCK = 'RESTOCK',
  EXPENSE = 'EXPENSE',
  DEBT_PAYMENT = 'DEBT_PAYMENT', // customer paying down onígbèsè balance
  REVERSAL = 'REVERSAL',         // immutable correction row
}

export enum PaymentStatus {
  PAID = 'PAID', // San tán
  DEBT = 'DEBT', // Onígbèsè
}

export enum InputMethod {
  VOICE_ONLINE = 'VOICE_ONLINE',
  VOICE_OFFLINE = 'VOICE_OFFLINE',
  MANUAL = 'MANUAL',
  PHOTO_PICKER = 'PHOTO_PICKER',
}

export enum ExpenseType {
  TRANSPORT = 'TRANSPORT', // ọkọ̀ / transport fare
  FUEL = 'FUEL',           // petrol for gen
  RENT = 'RENT',
  SALARY = 'SALARY',       // shop boy / apprentice pay
  LEVY = 'LEVY',           // market association dues
  UTILITIES = 'UTILITIES', // NEPA, water
  FEEDING = 'FEEDING',
  OTHER = 'OTHER',
}

export enum FixedCostPeriod {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
}

export interface FixedCost {
  id: string;
  name: string;              // "Shop rent Bodija", "Sule salary"
  costType: ExpenseType.RENT | ExpenseType.SALARY | ExpenseType.LEVY
          | ExpenseType.UTILITIES | ExpenseType.OTHER;
  amountKobo: number;        // per period
  period: FixedCostPeriod;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DailyNetProfit {
  day: string;
  cashInKobo: number;
  cashOutKobo: number;
  grossProfitKobo: number;      // sales − cost of goods
  variableExpensesKobo: number; // transport, fuel, feeding... that day
  fixedDailyKobo: number;       // amortized rent/salary/levy burden
  netProfitKobo: number;        // the TRUE "Èrè gidi lónìí"
  salesCount: number;
}

export enum SyncStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  FAILED = 'FAILED',
  QUARANTINED = 'QUARANTINED', // retry_count exhausted — needs manual review
}

// ---------- Entities ----------

export interface User {
  id: string;
  displayName: string;
  role: UserRole;
  pinHash: string | null;
  pinSalt: string | null;
  language: Language;
  isActive: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string;
}

export enum StockMode {
  COUNTED = 'COUNTED', // normal: has a quantity (bags, cartons, pieces)
  BULK = 'BULK',       // truck of yam: tracked by money, no unit count
}

export interface ProductUnit {
  id: string;
  productId: string;
  unitLabel: string;        // "derica", "cup", "mudu", "half bag"
  basePerUnit: number;      // base units consumed per 1 of this unit (cup = 0.025 bag)
  sellingPriceKobo: number; // price for ONE of this sell unit
  isDefault: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  voiceAliases: string[];
  photoPath: string | null;
  photoSynced: boolean;
  unitLabel: string;         // legacy/simple label (kept for compatibility)
  baseUnit: string;          // the purchase unit: "bag","carton","load"
  stockMode: StockMode;
  stockQuantity: number;     // in BASE units (COUNTED mode)
  lowStockLevel: number;
  costPriceKobo: number;     // cost per BASE unit
  sellingPriceKobo: number;  // legacy default price
  bulkCostKobo: number;      // BULK: what the whole load cost
  bulkRecoveredKobo: number; // BULK: money taken so far
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  units?: ProductUnit[];     // loaded sell units (COUNTED mode)
}

export interface Customer {
  id: string;
  name: string;
  phoneNumber: string | null; // E.164; required to send debt reminders
  note: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  productId: string | null;
  customerId: string | null;
  userId: string;
  type: TransactionType;
  category: TransactionCategory;
  quantity: number;
  totalAmountKobo: number;
  amountPaidKobo: number;
  status: PaymentStatus;
  inputMethod: InputMethod;
  voiceConfidence: number | null;
  note: string | null;
  reversalOf: string | null;
  sellUnitId: string | null;    // which sell unit (cup/mudu) was used
  sellUnitLabel: string | null; // snapshot for history/receipts
  sellUnitCount: number | null; // how many of that unit (3 cups)
  createdAt: string;
  deviceSeq: number;
}

export interface CustomerDebt {
  customerId: string;
  customerName: string;
  phoneNumber: string | null;
  balanceKobo: number;
  lastActivityAt: string;
}

export interface DailySummary {
  day: string; // YYYY-MM-DD
  cashInKobo: number;
  cashOutKobo: number;
  grossProfitKobo: number;
  salesCount: number;
}

export interface SyncOutboxEvent {
  eventId: string;
  idempotencyKey: string;
  aggregateType: 'TRANSACTION' | 'PRODUCT' | 'CUSTOMER' | 'USER' | 'REMINDER' | 'FIXED_COST';
  aggregateId: string;
  action: 'CREATE' | 'UPDATE' | 'DEACTIVATE' | 'DEBIT' | 'CREDIT' | 'STOCK_DELTA';
  payload: string; // JSON delta
  sequenceVersion: number;
  syncStatus: SyncStatus;
  retryCount: number;
  lastError: string | null;
  createdAt: string;
}

// ---------- Money helpers (kobo <-> display) ----------

export const NAIRA = 100; // kobo per naira

export function toKobo(naira: number): number {
  // guard against float dust: 4999.999999 -> 500000
  return Math.round(naira * NAIRA);
}

export function formatNaira(kobo: number, withSymbol = true): string {
  const naira = kobo / NAIRA;
  const s = naira.toLocaleString('en-NG', {
    minimumFractionDigits: kobo % NAIRA === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return withSymbol ? `₦${s}` : s;
}

// ---------- ID + sequencing helpers ----------

export function uuidv4(): string {
  // RFC4122 v4 via crypto.getRandomValues (available in RN Hermes via polyfill
  // or react-native-get-random-values — import that once in index.js)
  const bytes = new Uint8Array(16);
  // @ts-ignore
  (global.crypto ?? require('react-native-get-random-values')).getRandomValues?.(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, b => b.toString(16).padStart(2, '0'));
  return `${h.slice(0,4).join('')}-${h.slice(4,6).join('')}-${h.slice(6,8).join('')}-${h.slice(8,10).join('')}-${h.slice(10).join('')}`;
}
