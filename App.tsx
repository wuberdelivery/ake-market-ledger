// ============================================================
// AKE LEDGER — App.tsx (navigation shell)
// Deliberately no navigation library in v1: four screens, one
// state switch. Fewer deps = smaller APK = faster on cheap phones.
// Loads dashboard data from the SQL views after every write.
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { initDatabase, getDb } from './db/database';
import { startSyncEngine } from './sync/syncEngine';
import { getLowStock, buildEndOfDaySummary } from './utils/insights';
import { speak } from './voice/voiceRouter';
import HomeScreen from './screens/HomeScreen';
import SaleScreen from './screens/SaleScreen';
import ExpenseScreen from './screens/ExpenseScreen';
import LedgerScreen from './screens/LedgerScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import { ProductFormScreen, CustomerFormScreen } from './screens/SetupForms';
import VoiceSaleScreen from './screens/VoiceSaleScreen';
import SummaryScreen from './screens/SummaryScreen';
import RestockScreen from './screens/RestockScreen';
import ShareSummary from './screens/ShareSummary';
import type { PeriodData } from './screens/SummaryScreen';
import HelperLoginScreen from './screens/HelperLoginScreen';
import { colors } from './ui/theme';
import type {
  Language, Product, Customer, DailyNetProfit, CustomerDebt,
} from './models/types';

type Screen =
  | 'ONBOARDING' | 'HOME' | 'SALE' | 'VOICE_SALE' | 'EXPENSE' | 'LEDGER'
  | 'ADD_PRODUCT' | 'ADD_CUSTOMER' | 'SUMMARY' | 'RESTOCK' | 'HELPER_LOGIN' | 'SHARE_SUMMARY';

export default function App() {
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>('HOME');
  const [language, setLanguage] = useState<Language>('yo');
  const [userId, setUserId] = useState<string>('');
  const [role, setRole] = useState<'OWNER' | 'HELPER'>('OWNER');
  const [shareData, setShareData] = useState<PeriodData | null>(null);
  const [shopName, setShopName] = useState<string>('');
  const [lowStock, setLowStock] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [today, setToday] = useState<DailyNetProfit | null>(null);
  const [debtors, setDebtors] = useState<CustomerDebt[]>([]);

  const refresh = useCallback(() => {
    const db = getDb();

    const lr = db.execute(`SELECT value FROM app_settings WHERE key='language'`);
    if (lr.rows?.length) setLanguage(lr.rows.item(0).value as Language);

    const ur = db.execute(
      `SELECT id FROM users WHERE role='OWNER' AND is_active=1 LIMIT 1`
    );
    if (ur.rows?.length) setUserId(ur.rows.item(0).id);
    const sr = db.execute(`SELECT display_name FROM users WHERE role='OWNER' AND is_active=1 LIMIT 1`);
    if (sr.rows?.length) setShopName(sr.rows.item(0).display_name);

    const pr = db.execute(
      `SELECT * FROM products WHERE is_active=1 ORDER BY name`
    );
    const prods = rowsToArray(pr).map(mapProduct);
    // attach sell units to each product
    for (const prod of prods) {
      const uq = db.execute(
        `SELECT * FROM product_units WHERE product_id=? AND is_active=1 ORDER BY is_default DESC, sort_order`,
        [prod.id]
      );
      prod.units = rowsToArray(uq).map((u: any) => ({
        id: u.id, productId: u.product_id, unitLabel: u.unit_label,
        basePerUnit: u.base_per_unit, sellingPriceKobo: u.selling_price_kobo,
        isDefault: !!u.is_default, sortOrder: u.sort_order, isActive: !!u.is_active,
        createdAt: u.created_at, updatedAt: u.updated_at,
      }));
    }
    setProducts(prods);

    const cr = db.execute(
      `SELECT * FROM customers WHERE is_active=1 ORDER BY name`
    );
    setCustomers(rowsToArray(cr).map(mapCustomer));

    const tr = db.execute(
      `SELECT * FROM v_daily_net_profit WHERE day = DATE('now','localtime')`
    );
    setToday(tr.rows?.length ? mapDaily(tr.rows.item(0)) : null);

    const dr = db.execute(
      `SELECT * FROM v_customer_debts ORDER BY balance_kobo DESC`
    );
    setDebtors(rowsToArray(dr).map(mapDebt));

    setLowStock(getLowStock().map(x => ({ id: x.id, name: x.name })));
  }, []);

  useEffect(() => {
    initDatabase().then(() => {
      const ur = getDb().execute(
        `SELECT id FROM users WHERE role='OWNER' AND is_active=1 LIMIT 1`
      );
      if (!ur.rows?.length) {
        setScreen('ONBOARDING'); // fresh install — run the wizard
      } else {
        refresh();
      }
      // Sync runs silently in the background whenever network allows.
      // Token is set once the trader registers with the server (optional —
      // the app is fully functional offline-only until then).
      startSyncEngine(() => {
        const tr = getDb().execute(
          `SELECT value FROM app_settings WHERE key='api_token'`
        );
        return tr.rows?.length ? tr.rows.item(0).value : null;
      });
      setReady(true);
    });
  }, [refresh]);

  if (!ready) return null; // splash handled natively

  const goHome = () => { refresh(); setScreen('HOME'); };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar backgroundColor={colors.bg} barStyle="dark-content" />

      {screen === 'ONBOARDING' && (
        <OnboardingScreen onComplete={goHome} />
      )}

      {screen === 'HOME' && (
        <HomeScreen
          language={language}
          todayNetProfitKobo={today?.netProfitKobo ?? null}
          role={role}
          lowStock={lowStock}
          onSpeakSummary={() => {
            const txt = buildEndOfDaySummary(language);
            if (txt) void speak(txt, language);
          }}
          onMoneyIn={() => setScreen('SALE')}
          onMoneyInVoice={() => setScreen('VOICE_SALE')}
          onMoneyOut={() => setScreen('EXPENSE')}
          onLedger={() => setScreen('LEDGER')}
          onSwitchUser={() => setScreen('HELPER_LOGIN')}
        />
      )}

      {screen === 'VOICE_SALE' && (
        <VoiceSaleScreen
          language={language}
          userId={userId}
          products={products}
          customers={customers}
          sttApiKey={(() => {
            const r = getDb().execute(`SELECT value FROM app_settings WHERE key='stt_api_key'`);
            return r.rows?.length ? r.rows.item(0).value : null;
          })()}
          sttProvider={(() => {
            const r = getDb().execute(`SELECT value FROM app_settings WHERE key='stt_provider'`);
            return (r.rows?.length ? r.rows.item(0).value : 'spitch') as any;
          })()}
          onFinished={goHome}
          onManualFallback={() => setScreen('SALE')}
          onCancel={goHome}
        />
      )}

      {screen === 'SALE' && (
        <SaleScreen
          language={language}
          userId={userId}
          products={products}
          customers={customers}
          onAddProduct={() => setScreen('ADD_PRODUCT')}
          onAddCustomer={() => setScreen('ADD_CUSTOMER')}
          onFinished={() => {
            // Phase 3 hook: TTS speaks the confirmation here.
            goHome();
          }}
          onCancel={goHome}
        />
      )}

      {screen === 'ADD_PRODUCT' && (
        <ProductFormScreen
          language={language}
          onSaved={() => { refresh(); setScreen('SALE'); }}
          onCancel={() => setScreen('SALE')}
        />
      )}

      {screen === 'ADD_CUSTOMER' && (
        <CustomerFormScreen
          language={language}
          onSaved={() => { refresh(); setScreen('SALE'); }}
          onCancel={() => setScreen('SALE')}
        />
      )}

      {screen === 'EXPENSE' && (
        <ExpenseScreen
          language={language}
          userId={userId}
          onFinished={goHome}
          onCancel={goHome}
          onRestock={() => setScreen('RESTOCK')}
        />
      )}

      {screen === 'SHARE_SUMMARY' && shareData && (
        <ShareSummary
          language={language}
          shopName={shopName}
          data={shareData}
          onDone={() => setScreen('SUMMARY')}
        />
      )}

      {screen === 'RESTOCK' && (
        <RestockScreen
          language={language}
          userId={userId}
          products={products}
          onFinished={goHome}
          onCancel={goHome}
        />
      )}

      {screen === 'HELPER_LOGIN' && (
        <HelperLoginScreen
          language={language}
          onLogin={(uid, r) => { setUserId(uid); setRole(r); goHome(); }}
          onCancel={goHome}
        />
      )}

      {screen === 'SUMMARY' && (
        <SummaryScreen
          language={language}
          onBack={() => setScreen('LEDGER')}
          onShare={(d) => { setShareData(d); setScreen('SHARE_SUMMARY'); }}
        />
      )}

      {screen === 'LEDGER' && (
        <LedgerScreen
          language={language}
          today={today}
          debtors={debtors}
          onSummary={() => setScreen('SUMMARY')}
          onBack={goHome}
        />
      )}
    </SafeAreaView>
  );
}

// ---------- row mappers (snake_case SQL → camelCase models) ----------

function rowsToArray(r: any): any[] {
  const out: any[] = [];
  for (let i = 0; i < (r.rows?.length ?? 0); i++) out.push(r.rows.item(i));
  return out;
}

function mapProduct(r: any): Product {
  return {
    id: r.id, name: r.name,
    voiceAliases: r.voice_aliases ? JSON.parse(r.voice_aliases) : [],
    photoPath: r.photo_path, photoSynced: !!r.photo_synced,
    unitLabel: r.unit_label,
    baseUnit: r.base_unit ?? r.unit_label,
    stockMode: (r.stock_mode ?? 'COUNTED') as any,
    stockQuantity: r.stock_quantity,
    lowStockLevel: r.low_stock_level,
    costPriceKobo: r.cost_price_kobo, sellingPriceKobo: r.selling_price_kobo,
    bulkCostKobo: r.bulk_cost_kobo ?? 0,
    bulkRecoveredKobo: r.bulk_recovered_kobo ?? 0,
    isActive: !!r.is_active, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function mapCustomer(r: any): Customer {
  return {
    id: r.id, name: r.name, phoneNumber: r.phone_number, note: r.note,
    isActive: !!r.is_active, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function mapDaily(r: any): DailyNetProfit {
  return {
    day: r.day,
    cashInKobo: r.cash_in_kobo, cashOutKobo: r.cash_out_kobo,
    grossProfitKobo: r.gross_profit_kobo,
    variableExpensesKobo: r.variable_expenses_kobo,
    fixedDailyKobo: r.fixed_daily_kobo,
    netProfitKobo: r.net_profit_kobo,
    salesCount: r.sales_count,
  };
}

function mapDebt(r: any): CustomerDebt {
  return {
    customerId: r.customer_id, customerName: r.customer_name,
    phoneNumber: r.phone_number, balanceKobo: r.balance_kobo,
    lastActivityAt: r.last_activity_at,
  };
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
