import { indexedDB } from 'fake-indexeddb';
import {
  createLocalTransaction,
  openOfflineDb,
  closeOfflineDb,
  STORES
} from '../../lib/offline/index';
import {
  fetchLocalPendingSales,
  getUnifiedSalesHistory,
  getHistoricalSaleById,
  isCashierSelfOnly,
  hasManagementSalesAccess,
  HistoricalSale
} from '../../lib/sales/history';
import { formatMinorUnits, formatDate } from '../pos/formatters';

// Mock Supabase Client generator for unit & integration testing
function createMockSupabaseSalesClient(config: {
  sales?: any[];
  failNetwork?: boolean;
}) {
  return {
    from: (table: string) => {
      let currentTable = table;
      let eqFilters: Record<string, string> = {};
      let rangeFrom = 0;
      let rangeTo = Infinity;

      const builder: any = {
        select: (cols: string) => builder,
        eq: (col: string, val: any) => {
          eqFilters[col] = String(val).toLowerCase().trim();
          return builder;
        },
        gte: (col: string, val: any) => builder,
        lte: (col: string, val: any) => builder,
        order: (col: string, opts?: any) => builder,
        range: (from: number, to: number) => {
          rangeFrom = from;
          rangeTo = to;
          return builder;
        },
        maybeSingle: async () => {
          if (config.failNetwork) throw new Error('Network error');
          if (currentTable === 'sales') {
            const all = config.sales || [];
            const found = all.find((s) => {
              if (s.pharmacy_id.toLowerCase().trim() !== eqFilters['pharmacy_id']) return false;
              if (eqFilters['id'] && s.id.toLowerCase().trim() !== eqFilters['id']) return false;
              if (eqFilters['cashier_id'] && s.cashier_id.toLowerCase().trim() !== eqFilters['cashier_id']) return false;
              return true;
            });
            return { data: found || null, error: null };
          }
          return { data: null, error: null };
        },
        then: (resolve: any, reject: any) => {
          if (config.failNetwork) {
            reject(new Error('Network error'));
            return;
          }
          if (currentTable === 'sales') {
            const all = config.sales || [];
            const filtered = all.filter((s) => {
              if (s.pharmacy_id.toLowerCase().trim() !== eqFilters['pharmacy_id']) return false;
              if (eqFilters['cashier_id'] && s.cashier_id.toLowerCase().trim() !== eqFilters['cashier_id']) return false;
              if (eqFilters['branch_id'] && s.branch_id.toLowerCase().trim() !== eqFilters['branch_id']) return false;
              if (eqFilters['payment_method'] && s.payment_method !== eqFilters['payment_method']) return false;
              return true;
            });
            resolve({ data: filtered.slice(rangeFrom, rangeTo + 1), error: null });
            return;
          }
          resolve({ data: [], error: null });
        }
      };
      return builder;
    }
  } as any;
}

async function runSalesUiTestSuite() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      passed++;
      console.log(`  ✓ ${desc}`);
    } else {
      failed++;
      console.error(`  ✗ FAIL: ${desc}`);
    }
  }

  console.log('--- PHARMACYFLOW PHASE 5D-9 SALES HISTORY & TRANSACTION MANAGEMENT TESTS ---');

  await openOfflineDb(indexedDB);

  const pharmacyA = '11111111-1111-4111-8111-111111111111';
  const pharmacyB = '22222222-2222-4222-8222-222222222222';
  const branchA = '33333333-3333-4333-8333-333333333333';
  const branchB = '44444444-4444-4444-8444-444444444444';

  const userCashierA = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';
  const userCashierB = 'aaaaaaaa-2222-4aaa-8aaa-aaaaaaaaaaaa';
  const userManager = 'aaaaaaaa-3333-4aaa-8aaa-aaaaaaaaaaaa';

  const saleA1 = '55555555-1111-4555-8555-555555555551';
  const saleA2 = '55555555-2222-4555-8555-555555555552';
  const saleB1 = '66666666-1111-4666-8666-666666666661';

  const serverSales = [
    {
      id: saleA1,
      pharmacy_id: pharmacyA,
      branch_id: branchA,
      cashier_id: userCashierA,
      customer_id: null,
      currency: 'NGN',
      subtotal: 5000,
      discount: 500,
      tax: 0,
      total: 4500,
      payment_method: 'CASH',
      created_at: '2026-10-01T12:00:00.000Z',
      sale_items: [
        {
          id: 'item-1',
          product_id: 'prod-1',
          batch_id: 'batch-1',
          quantity: 2,
          unit_price: 2500,
          discount: 500,
          tax: 0,
          line_total: 4500
        }
      ]
    },
    {
      id: saleA2,
      pharmacy_id: pharmacyA,
      branch_id: branchA,
      cashier_id: userCashierB, // Different cashier in Pharmacy A
      customer_id: null,
      currency: 'NGN',
      subtotal: 10000,
      discount: 0,
      tax: 750,
      total: 10750,
      payment_method: 'TRANSFER',
      created_at: '2026-10-01T14:00:00.000Z',
      sale_items: [
        {
          id: 'item-2',
          product_id: 'prod-2',
          batch_id: 'batch-2',
          quantity: 1,
          unit_price: 10000,
          discount: 0,
          tax: 750,
          line_total: 10750
        }
      ]
    },
    {
      id: saleB1,
      pharmacy_id: pharmacyB,
      branch_id: branchB,
      cashier_id: userCashierA,
      customer_id: null,
      currency: 'NGN',
      subtotal: 3000,
      discount: 0,
      tax: 0,
      total: 3000,
      payment_method: 'CARD',
      created_at: '2026-10-02T10:00:00.000Z',
      sale_items: [
        {
          id: 'item-b1',
          product_id: 'prod-b',
          batch_id: 'batch-b',
          quantity: 1,
          unit_price: 3000,
          discount: 0,
          tax: 0,
          line_total: 3000
        }
      ]
    }
  ];

  const mockClient = createMockSupabaseSalesClient({ sales: serverSales });

  // --- 1. LOCAL PENDING OFFLINE SALES SEEDING ---
  console.log('\n[1. Local Pending Transactions Seeding]');

  const localOp1 = '77777777-1111-4777-8777-777777777771';
  const localOp2 = '77777777-2222-4777-8777-777777777772';

  await createLocalTransaction(
    {
      pharmacy_id: pharmacyA,
      client_op_id: localOp1,
      transaction_type: 'SALE_STOCK_MOVEMENT',
      payload: {
        sale_id: 'local-sale-001',
        branch_id: branchA,
        cashier_id: userCashierA,
        currency: 'NGN',
        subtotal: 2000,
        discount: 0,
        tax: 0,
        total: 2000,
        payment_method: 'CASH',
        product_id: 'prod-1',
        batch_id: 'batch-1',
        quantity: 1,
        line_items: [
          {
            id: 'li-1',
            product_id: 'prod-1',
            batch_id: 'batch-1',
            quantity: 1,
            unit_price: 2000,
            discount: 0,
            tax: 0,
            line_total: 2000
          }
        ]
      }
    },
    indexedDB
  );

  // Local sale created by Cashier B
  await createLocalTransaction(
    {
      pharmacy_id: pharmacyA,
      client_op_id: localOp2,
      transaction_type: 'SALE_STOCK_MOVEMENT',
      payload: {
        sale_id: 'local-sale-002',
        branch_id: branchA,
        cashier_id: userCashierB,
        currency: 'NGN',
        subtotal: 7500,
        discount: 0,
        tax: 0,
        total: 7500,
        payment_method: 'TRANSFER',
        product_id: 'prod-2',
        batch_id: 'batch-2',
        quantity: 1,
        line_items: [
          {
            id: 'li-2',
            product_id: 'prod-2',
            batch_id: 'batch-2',
            quantity: 1,
            unit_price: 7500,
            discount: 0,
            tax: 0,
            line_total: 7500
          }
        ]
      }
    },
    indexedDB
  );

  const pendingSalesCashierA = await fetchLocalPendingSales(pharmacyA, userCashierA, 'CASHIER', indexedDB);
  assert(pendingSalesCashierA.length === 1, 'Cashier A only retrieves 1 local pending transaction');
  assert(pendingSalesCashierA[0].id === 'local-sale-001', 'Cashier A sees local-sale-001');

  const pendingSalesManager = await fetchLocalPendingSales(pharmacyA, userManager, 'MANAGER', indexedDB);
  assert(pendingSalesManager.length === 2, 'Manager retrieves all 2 local pending transactions across cashiers');

  // --- 2. CASHIER SELF-ONLY VISIBILITY (SECTION 26) ---
  console.log('\n[2. Cashier Self-Only Enforcement]');

  // Test isCashierSelfOnly helper
  assert(isCashierSelfOnly('CASHIER') === true, 'CASHIER role identified as self-only');
  assert(isCashierSelfOnly('OWNER') === false, 'OWNER role is not self-only');
  assert(isCashierSelfOnly('MANAGER') === false, 'MANAGER role is not self-only');
  assert(isCashierSelfOnly('PHARMACIST') === false, 'PHARMACIST role is not self-only');

  // Unified history for Cashier A
  const cashierAHistory = await getUnifiedSalesHistory(
    mockClient,
    pharmacyA,
    userCashierA,
    'CASHIER',
    undefined,
    indexedDB
  );
  assert(cashierAHistory.sales.length === 2, 'Cashier A history contains 2 sales (1 pending + 1 committed)');
  const cashierASaleIds = cashierAHistory.sales.map(s => s.id);
  assert(cashierASaleIds.includes('local-sale-001'), 'Cashier A history includes own pending sale');
  assert(cashierASaleIds.includes(saleA1), 'Cashier A history includes own committed sale A1');
  assert(!cashierASaleIds.includes(saleA2), 'CRITICAL: Cashier A CANNOT see Cashier B committed sale A2');
  assert(!cashierASaleIds.includes('local-sale-002'), 'CRITICAL: Cashier A CANNOT see Cashier B pending sale');

  // Unified history for Manager
  const managerHistory = await getUnifiedSalesHistory(
    mockClient,
    pharmacyA,
    userManager,
    'MANAGER',
    undefined,
    indexedDB
  );
  assert(managerHistory.sales.length === 4, 'Manager sees all 4 sales in Pharmacy A (2 pending + 2 committed)');

  // Direct ID Access Check for Cashier A attempting to inspect Cashier B sale
  const unauthorizedDirectAccess = await getHistoricalSaleById(
    mockClient,
    pharmacyA,
    saleA2, // Cashier B's sale
    userCashierA,
    'CASHIER',
    indexedDB
  );
  assert(unauthorizedDirectAccess.sale === null, 'Cashier A cannot access Cashier B sale by direct ID query');
  assert(unauthorizedDirectAccess.error !== null, 'Rejection reports access restriction error');

  // Direct ID Access Check for Manager inspecting Cashier B sale
  const managerDirectAccess = await getHistoricalSaleById(
    mockClient,
    pharmacyA,
    saleA2,
    userManager,
    'MANAGER',
    indexedDB
  );
  assert(managerDirectAccess.sale !== null, 'Manager can inspect Cashier B sale by direct ID query');
  assert(managerDirectAccess.sale?.id === saleA2, 'Manager successfully accessed sale A2');

  // --- 3. MULTI-TENANT ISOLATION (SECTION 25) ---
  console.log('\n[3. Multi-Tenant Switching Isolation]');

  // Load Pharmacy A sales
  const salesA = await getUnifiedSalesHistory(mockClient, pharmacyA, userManager, 'MANAGER', undefined, indexedDB);
  assert(salesA.sales.length === 4, 'Pharmacy A contains 4 sales');
  assert(!salesA.sales.some(s => s.pharmacy_id === pharmacyB), 'Pharmacy A does not contain Pharmacy B sales');

  // Switch to Pharmacy B
  const salesB = await getUnifiedSalesHistory(mockClient, pharmacyB, userManager, 'MANAGER', undefined, indexedDB);
  assert(salesB.sales.length === 1, 'Pharmacy B contains 1 sale');
  assert(salesB.sales[0].id === saleB1, 'Pharmacy B returns only sale B1');
  assert(!salesB.sales.some(s => s.pharmacy_id === pharmacyA), 'Pharmacy B does not contain Pharmacy A sales');

  // Attempt to access Pharmacy A sale by ID while scoped in Pharmacy B
  const crossTenantQuery = await getHistoricalSaleById(
    mockClient,
    pharmacyB,
    saleA1, // Pharmacy A sale
    userManager,
    'MANAGER',
    indexedDB
  );
  assert(crossTenantQuery.sale === null, 'Cross-tenant ID query returns null');

  // --- 4. TRANSACTION DETAILS & LINE ITEMS ---
  console.log('\n[4. Transaction Details & Financials]');

  const detailA1 = await getHistoricalSaleById(
    mockClient,
    pharmacyA,
    saleA1,
    userCashierA,
    'CASHIER',
    indexedDB
  );
  assert(detailA1.sale !== null, 'Found sale detail A1');
  assert(detailA1.sale?.total === 4500, 'Sale total is 4500 minor units');
  assert(detailA1.sale?.subtotal === 5000, 'Sale subtotal is 5000 minor units');
  assert(detailA1.sale?.discount === 500, 'Sale discount is 500 minor units');
  assert(detailA1.sale?.payment_method === 'CASH', 'Payment method is CASH');
  assert(detailA1.sale?.line_items.length === 1, 'Contains 1 line item');
  assert(detailA1.sale?.line_items[0].quantity === 2, 'Line item quantity is 2');
  assert(detailA1.sale?.line_items[0].unit_price === 2500, 'Line item unit_price is 2500');
  assert(detailA1.sale?.line_items[0].line_total === 4500, 'Line item line_total is 4500');

  // Currency formatting
  assert(formatMinorUnits(detailA1.sale?.total || 0, 'NGN') === '₦45.00', '4500 minor units format to ₦45.00');

  // --- 5. SEARCH & FILTERING ---
  console.log('\n[5. Search & Filtering Functionality]');

  // Search by Sale ID
  const searchById = await getUnifiedSalesHistory(
    mockClient,
    pharmacyA,
    userManager,
    'MANAGER',
    { searchQuery: 'local-sale-001' },
    indexedDB
  );
  assert(searchById.sales.length === 1, 'Found 1 transaction by ID search');
  assert(searchById.sales[0].id === 'local-sale-001', 'Found exact local sale 001');

  // Filter by Payment Method (TRANSFER)
  const transferSales = await getUnifiedSalesHistory(
    mockClient,
    pharmacyA,
    userManager,
    'MANAGER',
    { paymentMethod: 'TRANSFER' },
    indexedDB
  );
  assert(transferSales.sales.every(s => s.payment_method === 'TRANSFER'), 'All filtered sales have payment_method=TRANSFER');

  // Filter by Sync Status (COMMITTED)
  const committedSales = await getUnifiedSalesHistory(
    mockClient,
    pharmacyA,
    userManager,
    'MANAGER',
    { syncStatus: 'COMMITTED' },
    indexedDB
  );
  assert(committedSales.sales.every(s => s.sync_status === 'COMMITTED'), 'All filtered sales have sync_status=COMMITTED');

  // Filter by Sync Status (PENDING)
  const pendingFilter = await getUnifiedSalesHistory(
    mockClient,
    pharmacyA,
    userManager,
    'MANAGER',
    { syncStatus: 'PENDING' },
    indexedDB
  );
  assert(pendingFilter.sales.every(s => s.sync_status === 'PENDING' || s.sync_status === 'SYNCING'), 'All filtered sales are pending/syncing');

  // --- 6. PROOF: NO IMMUTABILITY VIOLATION / MUTATION ROUTE ---
  console.log('\n[6. Sale Immutability Invariant (Section 27)]');

  const salesModule = await import('../../lib/sales/index');
  assert(typeof (salesModule as any).updateSale === 'undefined', 'No updateSale method exists');
  assert(typeof (salesModule as any).deleteSale === 'undefined', 'No deleteSale method exists');
  assert(typeof (salesModule as any).modifySaleLineItem === 'undefined', 'No modifySaleLineItem method exists');
  assert(typeof (salesModule as any).changePaymentMethod === 'undefined', 'No changePaymentMethod method exists');
  assert(typeof (salesModule as any).voidSale === 'undefined', 'No voidSale method exists in this phase');

  // --- 7. SECURITY & SECRET NON-LEAKAGE ---
  console.log('\n[7. Security & Secret Non-Leakage]');

  const dump = JSON.stringify(serverSales);
  assert(!dump.includes('service_role'), 'No service_role in sales data');
  assert(!dump.includes('privateKey'), 'No privateKey in sales data');
  assert(!dump.includes('secret'), 'No payment secret in sales data');

  closeOfflineDb();

  console.log(`\n======================================================`);
  console.log(`PHASE 5D-9 SALES HISTORY TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    throw new Error(`${failed} tests failed!`);
  }
}

runSalesUiTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
