import React, {useCallback, useEffect, useState} from 'react';
import {SafeAreaView, StatusBar, StyleSheet} from 'react-native';
import {getDb, initDatabase} from './db/database';
import {
  getActiveUserId,
  getAppLanguage,
  isSessionLocked,
  setActiveUserId,
  setAppLanguage,
  setSessionLocked,
} from './db/settingsRepository';
import {startSyncEngine} from './sync/syncEngine';
import {buildEndOfDaySummary, getLowStock} from './utils/insights';
import {speak} from './voice/voiceRouter';
import type {SaleIntent} from './voice/yorubaIntentParser';
import HomeScreen from './screens/HomeScreen';
import SaleScreen from './screens/SaleScreen';
import ExpenseScreen from './screens/ExpenseScreen';
import LedgerScreen from './screens/LedgerScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import {CustomerFormScreen, ProductFormScreen} from './screens/SetupForms';
import VoiceSaleScreen from './screens/VoiceSaleScreen';
import SummaryScreen from './screens/SummaryScreen';
import RestockScreen from './screens/RestockScreen';
import ShareSummary from './screens/ShareSummary';
import type {PeriodData} from './screens/SummaryScreen';
import HelperLoginScreen from './screens/HelperLoginScreen';
import SettingsScreen from './screens/SettingsScreen';
import HistoryScreen from './screens/HistoryScreen';
import {colors} from './ui/theme';
import type {
  Customer,
  CustomerDebt,
  DailyNetProfit,
  Language,
  Product,
} from './models/types';

type Screen =
  | 'ONBOARDING'
  | 'HOME'
  | 'SALE'
  | 'VOICE_SALE'
  | 'EXPENSE'
  | 'LEDGER'
  | 'HISTORY'
  | 'SETTINGS'
  | 'ADD_PRODUCT'
  | 'ADD_CUSTOMER'
  | 'SUMMARY'
  | 'RESTOCK'
  | 'HELPER_LOGIN'
  | 'SHARE_SUMMARY';

export default function App() {
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>('HOME');
  const [language, setLanguage] = useState<Language>('yo');
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('');
  const [role, setRole] = useState<'OWNER' | 'HELPER'>('OWNER');
  const [loginCanCancel, setLoginCanCancel] = useState(false);
  const [salePrefill, setSalePrefill] = useState<SaleIntent | null>(null);
  const [shareData, setShareData] = useState<PeriodData | null>(null);
  const [shopName, setShopName] = useState('');
  const [lowStock, setLowStock] = useState<{id: string; name: string}[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [today, setToday] = useState<DailyNetProfit | null>(null);
  const [debtors, setDebtors] = useState<CustomerDebt[]>([]);

  const refresh = useCallback(() => {
    const db = getDb();
    setLanguage(getAppLanguage());

    const ownerResult = db.execute(
      `SELECT display_name FROM users WHERE role='OWNER' AND is_active=1 LIMIT 1`,
    );
    if (ownerResult.rows?.length) {
      setShopName(ownerResult.rows.item(0).display_name);
    }

    const productResult = db.execute(
      `SELECT * FROM products WHERE is_active=1 ORDER BY name`,
    );
    const loadedProducts = rowsToArray(productResult).map(mapProduct);
    for (const product of loadedProducts) {
      const unitResult = db.execute(
        `SELECT * FROM product_units
          WHERE product_id=? AND is_active=1
          ORDER BY is_default DESC, sort_order`,
        [product.id],
      );
      product.units = rowsToArray(unitResult).map((unit: any) => ({
        id: unit.id,
        productId: unit.product_id,
        unitLabel: unit.unit_label,
        basePerUnit: unit.base_per_unit,
        sellingPriceKobo: unit.selling_price_kobo,
        isDefault: !!unit.is_default,
        sortOrder: unit.sort_order,
        isActive: !!unit.is_active,
        createdAt: unit.created_at,
        updatedAt: unit.updated_at,
      }));
    }
    setProducts(loadedProducts);

    const customerResult = db.execute(
      `SELECT * FROM customers WHERE is_active=1 ORDER BY name`,
    );
    setCustomers(rowsToArray(customerResult).map(mapCustomer));

    const todayResult = db.execute(
      `SELECT * FROM v_daily_net_profit WHERE day=DATE('now','localtime')`,
    );
    setToday(
      todayResult.rows?.length ? mapDaily(todayResult.rows.item(0)) : null,
    );

    const debtResult = db.execute(
      `SELECT * FROM v_customer_debts ORDER BY balance_kobo DESC`,
    );
    setDebtors(rowsToArray(debtResult).map(mapDebt));
    setLowStock(getLowStock().map(item => ({id: item.id, name: item.name})));
  }, []);

  const activateUser = useCallback(
    (id: string, requestedRole?: 'OWNER' | 'HELPER') => {
      const result = getDb().execute(
        `SELECT display_name, role FROM users WHERE id=? AND is_active=1 LIMIT 1`,
        [id],
      );
      if (!result.rows?.length) return false;
      const user = result.rows.item(0);
      setUserId(id);
      setUserName(user.display_name);
      setRole(requestedRole ?? user.role);
      setActiveUserId(id);
      return true;
    },
    [],
  );

  useEffect(() => {
    initDatabase().then(() => {
      const ownerResult = getDb().execute(
        `SELECT id FROM users WHERE role='OWNER' AND is_active=1 LIMIT 1`,
      );
      if (!ownerResult.rows?.length) {
        setScreen('ONBOARDING');
      } else {
        refresh();
        const activeId = getActiveUserId();
        const ownerId = ownerResult.rows.item(0).id;
        if (!activateUser(activeId ?? ownerId)) {
          activateUser(ownerId, 'OWNER');
        }
        if (isSessionLocked()) {
          setLoginCanCancel(false);
          setScreen('HELPER_LOGIN');
        } else {
          setScreen('HOME');
        }
      }

      startSyncEngine(() => {
        const tokenResult = getDb().execute(
          `SELECT value FROM app_settings WHERE key='api_token'`,
        );
        return tokenResult.rows?.length ? tokenResult.rows.item(0).value : null;
      });
      setReady(true);
    });
  }, [activateUser, refresh]);

  if (!ready) return null;

  const goHome = () => {
    refresh();
    setScreen('HOME');
  };

  const completeOnboarding = () => {
    const ownerResult = getDb().execute(
      `SELECT id FROM users WHERE role='OWNER' AND is_active=1 LIMIT 1`,
    );
    if (ownerResult.rows?.length) {
      activateUser(ownerResult.rows.item(0).id, 'OWNER');
      setSessionLocked(false);
    }
    goHome();
  };

  const login = (id: string, selectedRole: 'OWNER' | 'HELPER') => {
    if (!activateUser(id, selectedRole)) return;
    setSessionLocked(false);
    setLoginCanCancel(true);
    goHome();
  };

  const openManualSale = (intent?: SaleIntent) => {
    setSalePrefill(intent ?? null);
    setScreen('SALE');
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar backgroundColor={colors.bg} barStyle="dark-content" />

      {screen === 'ONBOARDING' ? (
        <OnboardingScreen onComplete={completeOnboarding} />
      ) : null}

      {screen === 'HOME' ? (
        <HomeScreen
          language={language}
          todayNetProfitKobo={today?.netProfitKobo ?? null}
          role={role}
          userName={userName}
          lowStock={lowStock}
          onSpeakSummary={() => {
            const text = buildEndOfDaySummary(language);
            if (text) void speak(text, language);
          }}
          onMoneyIn={() => openManualSale()}
          onMoneyInVoice={() => setScreen('VOICE_SALE')}
          onMoneyOut={() => role === 'OWNER' && setScreen('EXPENSE')}
          onLedger={() => role === 'OWNER' && setScreen('LEDGER')}
          onSettings={() => setScreen('SETTINGS')}
        />
      ) : null}

      {screen === 'SETTINGS' ? (
        <SettingsScreen
          language={language}
          userName={userName}
          userRole={role}
          onLanguageChange={nextLanguage => {
            setAppLanguage(nextLanguage, userId);
            setLanguage(nextLanguage);
          }}
          onSwitchUser={() => {
            setLoginCanCancel(true);
            setScreen('HELPER_LOGIN');
          }}
          onLogout={() => {
            setSessionLocked(true);
            setLoginCanCancel(false);
            setScreen('HELPER_LOGIN');
          }}
          onBack={goHome}
        />
      ) : null}

      {screen === 'VOICE_SALE' ? (
        <VoiceSaleScreen
          language={language}
          userId={userId}
          products={products}
          customers={customers}
          onFinished={() => {
            setSalePrefill(null);
            goHome();
          }}
          onManualFallback={openManualSale}
          onCancel={goHome}
        />
      ) : null}

      {screen === 'SALE' ? (
        <SaleScreen
          language={language}
          userId={userId}
          products={products}
          customers={customers}
          initialIntent={salePrefill}
          onAddProduct={() => {
            setSalePrefill(null);
            setScreen('ADD_PRODUCT');
          }}
          onAddCustomer={() => {
            setSalePrefill(null);
            setScreen('ADD_CUSTOMER');
          }}
          onFinished={() => {
            setSalePrefill(null);
            goHome();
          }}
          onCancel={() => {
            setSalePrefill(null);
            goHome();
          }}
        />
      ) : null}

      {screen === 'ADD_PRODUCT' ? (
        <ProductFormScreen
          language={language}
          onSaved={() => {
            refresh();
            setScreen('SALE');
          }}
          onCancel={() => setScreen('SALE')}
        />
      ) : null}

      {screen === 'ADD_CUSTOMER' ? (
        <CustomerFormScreen
          language={language}
          onSaved={() => {
            refresh();
            setScreen('SALE');
          }}
          onCancel={() => setScreen('SALE')}
        />
      ) : null}

      {screen === 'EXPENSE' ? (
        <ExpenseScreen
          language={language}
          userId={userId}
          onFinished={goHome}
          onCancel={goHome}
          onRestock={() => setScreen('RESTOCK')}
        />
      ) : null}

      {screen === 'SHARE_SUMMARY' && shareData ? (
        <ShareSummary
          language={language}
          shopName={shopName}
          data={shareData}
          onDone={() => setScreen('SUMMARY')}
        />
      ) : null}

      {screen === 'RESTOCK' ? (
        <RestockScreen
          language={language}
          userId={userId}
          products={products}
          onFinished={goHome}
          onCancel={goHome}
        />
      ) : null}

      {screen === 'HELPER_LOGIN' ? (
        <HelperLoginScreen
          language={language}
          onLogin={login}
          onCancel={goHome}
          allowCancel={loginCanCancel}
        />
      ) : null}

      {screen === 'SUMMARY' ? (
        <SummaryScreen
          language={language}
          onBack={() => setScreen('LEDGER')}
          onShare={data => {
            setShareData(data);
            setScreen('SHARE_SUMMARY');
          }}
        />
      ) : null}

      {screen === 'LEDGER' ? (
        <LedgerScreen
          language={language}
          today={today}
          debtors={debtors}
          onSummary={() => setScreen('SUMMARY')}
          onHistory={() => setScreen('HISTORY')}
          onBack={goHome}
        />
      ) : null}

      {screen === 'HISTORY' ? (
        <HistoryScreen
          language={language}
          userId={userId}
          onChanged={refresh}
          onBack={() => setScreen('LEDGER')}
        />
      ) : null}
    </SafeAreaView>
  );
}

function rowsToArray(result: any): any[] {
  const output: any[] = [];
  for (let index = 0; index < (result.rows?.length ?? 0); index += 1) {
    output.push(result.rows.item(index));
  }
  return output;
}

function mapProduct(row: any): Product {
  return {
    id: row.id,
    name: row.name,
    voiceAliases: row.voice_aliases ? JSON.parse(row.voice_aliases) : [],
    photoPath: row.photo_path,
    photoSynced: !!row.photo_synced,
    unitLabel: row.unit_label,
    baseUnit: row.base_unit ?? row.unit_label,
    stockMode: (row.stock_mode ?? 'COUNTED') as any,
    stockQuantity: row.stock_quantity,
    lowStockLevel: row.low_stock_level,
    costPriceKobo: row.cost_price_kobo,
    sellingPriceKobo: row.selling_price_kobo,
    bulkCostKobo: row.bulk_cost_kobo ?? 0,
    bulkRecoveredKobo: row.bulk_recovered_kobo ?? 0,
    isActive: !!row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCustomer(row: any): Customer {
  return {
    id: row.id,
    name: row.name,
    phoneNumber: row.phone_number,
    note: row.note,
    isActive: !!row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDaily(row: any): DailyNetProfit {
  return {
    day: row.day,
    cashInKobo: row.cash_in_kobo,
    cashOutKobo: row.cash_out_kobo,
    grossProfitKobo: row.gross_profit_kobo,
    variableExpensesKobo: row.variable_expenses_kobo,
    fixedDailyKobo: row.fixed_daily_kobo,
    netProfitKobo: row.net_profit_kobo,
    salesCount: row.sales_count,
  };
}

function mapDebt(row: any): CustomerDebt {
  return {
    customerId: row.customer_id,
    customerName: row.customer_name,
    phoneNumber: row.phone_number,
    balanceKobo: row.balance_kobo,
    lastActivityAt: row.last_activity_at,
  };
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
});
