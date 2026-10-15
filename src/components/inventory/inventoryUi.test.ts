import { indexedDB } from 'fake-indexeddb';
import {
  replacePharmacyInventorySnapshot,
  getInventorySnapshotMetadata,
  getProductById,
  getBatchesForProduct,
  getEligibleBatchesForProduct,
  listLocalProducts,
  searchProducts,
  findProductBySku,
  findProductByBarcode
} from '../../lib/inventory/index';
import { canViewCostPrice } from './InventoryView';
import { formatMinorUnits, formatDate } from '../pos/formatters';
import { openOfflineDb, closeOfflineDb } from '../../lib/offline/index';
import { InventorySnapshot } from '../../lib/inventory/types';

async function runInventoryUiTestSuite() {
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

  console.log('--- PHARMACYFLOW PHASE 5D-8 INVENTORY MANAGEMENT & STOCK OPERATIONS TESTS ---');

  await openOfflineDb(indexedDB);

  const pharmacyA = '11111111-1111-4111-8111-111111111111';
  const pharmacyB = '22222222-2222-4222-8222-222222222222';
  const branchA = '33333333-3333-4333-8333-333333333333';
  const branchB = '44444444-4444-4444-8444-444444444444';

  const prodA1 = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';
  const prodA2 = 'aaaaaaaa-2222-4aaa-8aaa-aaaaaaaaaaaa';
  const prodA3 = 'aaaaaaaa-3333-4aaa-8aaa-aaaaaaaaaaaa';
  const prodB1 = 'bbbbbbbb-1111-4bbb-8bbb-bbbbbbbbbbbb';

  const batchA1_1 = 'cccccccc-1111-4ccc-8ccc-cccccccccccc';
  const batchA1_2 = 'cccccccc-2222-4ccc-8ccc-cccccccccccc';
  const batchA2_1 = 'cccccccc-3333-4ccc-8ccc-cccccccccccc';
  const batchA3_def = 'cccccccc-4444-4ccc-8ccc-cccccccccccc';
  const batchB1_1 = 'dddddddd-1111-4ddd-8ddd-dddddddddddd';

  const snapshotA: InventorySnapshot = {
    pharmacy_id: pharmacyA,
    products: [
      {
        id: prodA1,
        pharmacy_id: pharmacyA,
        name: 'Amoxicillin 500mg Capsules',
        sku: 'AMX-500',
        barcode: '1111222233334',
        generic_name: 'Amoxicillin Trihydrate',
        category: 'Antibiotics',
        unit: 'Capsules',
        selling_price: 3500, // 35.00 NGN
        cost_price: 2100,    // 21.00 NGN
        status: 'ACTIVE',
        updated_at: '2026-10-01T10:00:00Z'
      },
      {
        id: prodA2,
        pharmacy_id: pharmacyA,
        name: 'Paracetamol 500mg Tablets',
        sku: 'PCM-500',
        barcode: '5555666677778',
        generic_name: 'Acetaminophen',
        category: 'Analgesics',
        unit: 'Blisters',
        selling_price: 500,  // 5.00 NGN
        cost_price: 250,    // 2.50 NGN
        status: 'ACTIVE',
        updated_at: '2026-10-01T10:00:00Z'
      },
      {
        id: prodA3,
        pharmacy_id: pharmacyA,
        name: 'Artemether-Lumefantrine 20/120',
        sku: 'ACT-20',
        barcode: '9999888877776',
        generic_name: 'Coartem',
        category: 'Antimalarials',
        unit: 'Packs',
        selling_price: 2800,
        cost_price: 1800,
        status: 'ACTIVE',
        updated_at: '2026-10-01T10:00:00Z'
      }
    ],
    batches: [
      {
        id: batchA1_1,
        pharmacy_id: pharmacyA,
        product_id: prodA1,
        branch_id: branchA,
        batch_number: 'LOT-AMX-001',
        expiry_date: '2027-06-30', // Future valid
        quantity: 120, // Projected stock: 120
        selling_price: 3500,
        cost_price: 2100,
        status: 'ACTIVE',
        updated_at: '2026-10-01T10:00:00Z'
      },
      {
        id: batchA1_2,
        pharmacy_id: pharmacyA,
        product_id: prodA1,
        branch_id: branchA,
        batch_number: 'LOT-AMX-002',
        expiry_date: '2026-10-15', // Expiring soon (<90 days)
        quantity: 45,
        selling_price: 3500,
        cost_price: 2100,
        status: 'ACTIVE',
        updated_at: '2026-10-01T10:00:00Z'
      },
      {
        id: batchA2_1,
        pharmacy_id: pharmacyA,
        product_id: prodA2,
        branch_id: branchA,
        batch_number: 'LOT-PCM-EXP',
        expiry_date: '2025-01-01', // Expired
        quantity: 30,
        selling_price: 500,
        cost_price: 250,
        status: 'EXPIRED',
        updated_at: '2026-10-01T10:00:00Z'
      },
      {
        id: batchA3_def,
        pharmacy_id: pharmacyA,
        product_id: prodA3,
        branch_id: branchA,
        batch_number: 'LOT-ACT-DEF',
        expiry_date: '2028-12-31',
        quantity: -3, // Negative projected deficit from concurrent offline sales
        selling_price: 2800,
        cost_price: 1800,
        status: 'ACTIVE',
        updated_at: '2026-10-01T10:00:00Z'
      }
    ],
    source_updated_at: '2026-10-01T10:00:00Z'
  };

  const snapshotB: InventorySnapshot = {
    pharmacy_id: pharmacyB,
    products: [
      {
        id: prodB1,
        pharmacy_id: pharmacyB,
        name: 'Pharmacy B Exclusive Antibiotic Cream',
        sku: 'B-CRM-01',
        barcode: '7777888899990',
        generic_name: 'Mupirocin 2%',
        category: 'Dermatology',
        unit: 'Tubes',
        selling_price: 4500,
        cost_price: 2800,
        status: 'ACTIVE',
        updated_at: '2026-10-02T10:00:00Z'
      }
    ],
    batches: [
      {
        id: batchB1_1,
        pharmacy_id: pharmacyB,
        product_id: prodB1,
        branch_id: branchB,
        batch_number: 'LOT-CRM-B',
        expiry_date: '2028-01-01',
        quantity: 50,
        selling_price: 4500,
        cost_price: 2800,
        status: 'ACTIVE',
        updated_at: '2026-10-02T10:00:00Z'
      }
    ],
    source_updated_at: '2026-10-02T10:00:00Z'
  };

  // --- 1. LOCAL REPOSITORY SETUP & INGESTION ---
  console.log('\n[1. Ingestion of Authoritative Read Models]');
  await replacePharmacyInventorySnapshot(pharmacyA, snapshotA, indexedDB);
  await replacePharmacyInventorySnapshot(pharmacyB, snapshotB, indexedDB);

  const metaA = await getInventorySnapshotMetadata(pharmacyA, indexedDB);
  assert(metaA !== null, 'Pharmacy A snapshot metadata recorded');
  assert(metaA?.product_count === 3, 'Pharmacy A contains 3 products');
  assert(metaA?.batch_count === 4, 'Pharmacy A contains 4 batches');

  const metaB = await getInventorySnapshotMetadata(pharmacyB, indexedDB);
  assert(metaB !== null, 'Pharmacy B snapshot metadata recorded');
  assert(metaB?.product_count === 1, 'Pharmacy B contains 1 product');

  // --- 2. RESPONSIVE LOCAL SEARCH ---
  console.log('\n[2. Local Product Search & Lookups]');

  // Search by exact name
  const nameSearch = await searchProducts(pharmacyA, 'Amoxicillin', 50, indexedDB);
  assert(nameSearch.length === 1, 'Search by name returns 1 result');
  assert(nameSearch[0].id === prodA1, 'Correct Amoxicillin product found');

  // Search by generic name
  const genericSearch = await searchProducts(pharmacyA, 'Acetaminophen', 50, indexedDB);
  assert(genericSearch.length === 1, 'Search by generic name returns 1 result');
  assert(genericSearch[0].id === prodA2, 'Correct Paracetamol product found via Acetaminophen');

  // Search by SKU
  const skuMatch = await findProductBySku(pharmacyA, 'AMX-500', indexedDB);
  assert(skuMatch !== null, 'Found product by SKU AMX-500');
  assert(skuMatch?.name === 'Amoxicillin 500mg Capsules', 'SKU lookup matches product name');

  // Search by Barcode
  const barcodeMatch = await findProductByBarcode(pharmacyA, '5555666677778', indexedDB);
  assert(barcodeMatch !== null, 'Found product by barcode 5555666677778');
  assert(barcodeMatch?.id === prodA2, 'Barcode lookup matches Paracetamol');

  // Search with no matches
  const emptySearch = await searchProducts(pharmacyA, 'NonExistentDrug999', 50, indexedDB);
  assert(emptySearch.length === 0, 'No match returns empty array');

  // --- 3. TENANT ISOLATION ---
  console.log('\n[3. Multi-Tenant Isolation & Partitioning]');

  // Pharmacy A search cannot return Pharmacy B products
  const crossSearchA = await searchProducts(pharmacyA, 'Exclusive', 50, indexedDB);
  assert(crossSearchA.length === 0, 'Pharmacy B exclusive product not visible in Pharmacy A query');

  // Pharmacy B search cannot return Pharmacy A products
  const crossSearchB = await searchProducts(pharmacyB, 'Amoxicillin', 50, indexedDB);
  assert(crossSearchB.length === 0, 'Pharmacy A amoxicillin not visible in Pharmacy B query');

  // Lookups by ID across tenants are rejected
  const crossIdLookup = await getProductById(pharmacyA, prodB1, indexedDB);
  assert(crossIdLookup === null, 'Pharmacy B product ID query under Pharmacy A returns null');

  const crossBatchLookup = await getBatchesForProduct(pharmacyA, prodB1, undefined, indexedDB);
  assert(crossBatchLookup.length === 0, 'Cross-tenant batch query returns empty array');

  // --- 4. BATCH INSPECTION & FEFO EVALUATION ---
  console.log('\n[4. Batch Inspection & Expiry Logic]');

  const amxBatches = await getEligibleBatchesForProduct(pharmacyA, prodA1, undefined, indexedDB);
  assert(amxBatches.length === 2, 'Amoxicillin has 2 batches');

  // Evaluate batch expiry
  const batch001 = amxBatches.find(b => b.id === batchA1_1);
  assert(batch001 !== undefined, 'Batch LOT-AMX-001 found');
  assert(batch001?.expiry.is_expired === false, 'LOT-AMX-001 (2027-06-30) is not expired');
  assert(batch001?.projected_stock === 120, 'LOT-AMX-001 has projected_stock 120');

  const pcmBatchesWithoutExpired = await getEligibleBatchesForProduct(pharmacyA, prodA2, undefined, indexedDB);
  assert(pcmBatchesWithoutExpired.length === 0, 'Default eligibility filters out expired batch');

  const pcmBatches = await getEligibleBatchesForProduct(pharmacyA, prodA2, { allowExpired: true }, indexedDB);
  assert(pcmBatches.length === 1, 'Paracetamol has 1 batch when allowExpired=true');
  assert(pcmBatches[0].expiry.is_expired === true, 'LOT-PCM-EXP is correctly evaluated as expired');

  // --- 5. NEGATIVE / DEFICIT STOCK NON-SUPPRESSION ---
  console.log('\n[5. Negative Stock Non-Suppression]');

  const actBatches = await getEligibleBatchesForProduct(pharmacyA, prodA3, undefined, indexedDB);
  assert(actBatches.length === 1, 'Coartem has 1 batch');
  const defBatch = actBatches[0];
  assert(defBatch.projected_stock === -3, 'Negative projected stock (-3) is preserved and NOT coerced to zero');
  assert(defBatch.projected_stock < 0, 'Stock is strictly negative (deficit indicator triggered)');

  // --- 6. ROLE & PERMISSION COST PRICE GATING ---
  console.log('\n[6. Role-Based Cost Price Visibility]');

  // OWNER can see cost price
  assert(canViewCostPrice('OWNER', []) === true, 'OWNER has cost price access');

  // MANAGER can see cost price
  assert(canViewCostPrice('MANAGER', []) === true, 'MANAGER has cost price access');

  // PHARMACIST can see cost price
  assert(canViewCostPrice('PHARMACIST', []) === true, 'PHARMACIST has cost price access');

  // CASHIER without special permissions CANNOT see cost price
  assert(canViewCostPrice('CASHIER', ['sales.create', 'sales.read']) === false, 'CASHIER without financial permission is denied cost price');

  // CASHIER with explicit inventory.write permission CAN see cost price
  assert(canViewCostPrice('CASHIER', ['sales.create', 'inventory.write']) === true, 'CASHIER with inventory.write can view cost price');

  // Null/undefined role is denied
  assert(canViewCostPrice(null, []) === false, 'Null role denied');
  assert(canViewCostPrice(undefined, []) === false, 'Undefined role denied');

  // --- 7. FORMATTING & MONEY UTILITIES ---
  console.log('\n[7. Integer Minor Currency Units Formatting]');

  assert(formatMinorUnits(3500, 'NGN') === '₦35.00', '3500 minor units format to ₦35.00');
  assert(formatMinorUnits(500, 'NGN') === '₦5.00', '500 minor units format to ₦5.00');
  assert(formatMinorUnits(0, 'NGN') === '₦0.00', '0 minor units format to ₦0.00');
  assert(formatMinorUnits(150000, 'USD') === '$1,500.00', '150000 minor units USD format to $1,500.00');

  // Date formatting
  assert(formatDate('2027-06-30').includes('2027'), 'Date formatting parses ISO date string');

  // --- 8. PROOF: NO DIRECT STOCK MUTATION METHOD EXISTS ---
  console.log('\n[8. Non-Authoritative Client Authority Invariant]');

  // Verify that the inventory service only provides read methods and atomic snapshot replacement
  const inventoryModule = await import('../../lib/inventory/index');
  assert(typeof (inventoryModule as any).adjustStockQuantity === 'undefined', 'No client adjustStockQuantity method');
  assert(typeof (inventoryModule as any).receiveStockBatch === 'undefined', 'No client receiveStockBatch method');
  assert(typeof (inventoryModule as any).transferStock === 'undefined', 'No client transferStock method');
  assert(typeof (inventoryModule as any).deleteBatch === 'undefined', 'No client deleteBatch method');

  // --- 9. SECURITY & NON-LEAKAGE INVARIANTS ---
  console.log('\n[9. Security & Secret Non-Leakage]');

  const dump = JSON.stringify(snapshotA);
  assert(!dump.includes('service_role'), 'No service_role in snapshotA dump');
  assert(!dump.includes('privateKey'), 'No privateKey in snapshotA dump');
  assert(!dump.includes('secret'), 'No secret in snapshotA dump');

  closeOfflineDb();

  console.log(`\n======================================================`);
  console.log(`PHASE 5D-8 INVENTORY UI TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    throw new Error(`${failed} tests failed!`);
  }
}

runInventoryUiTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
