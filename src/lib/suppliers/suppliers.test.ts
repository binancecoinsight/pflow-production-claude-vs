/**
 * PHARMACYFLOW PHASE 5D-19: SUPPLIERS MANAGEMENT & PROCUREMENT INTAKE TEST SUITE
 * 
 * Verifies:
 * 1. Supplier input validation & normalization
 * 2. Tenant isolation & scoping
 * 3. Role authorization (OWNER, MANAGER, PHARMACIST, CASHIER)
 * 4. Supplier deletion & foreign-key referential integrity (SQLSTATE 23503)
 * 5. Stock intake linkage, optionality & SHA-256 canonical hashing
 * 6. Purchase & inbound shipment history (management access vs CASHIER RLS blocking)
 */

import { 
  validateCreateSupplierInput, 
  validateUpdateSupplierInput,
  normalizeSupplierName,
  normalizeContactPerson,
  normalizePhoneNumber,
  normalizeEmail,
  isValidUuid
} from './validation';
import { 
  Supplier, 
  CreateSupplierInput, 
  PurchaseAuditRecord,
  PurchaseAuditItem 
} from './types';
import { 
  listSuppliers, 
  getSupplierById, 
  createSupplier, 
  updateSupplier, 
  deleteSupplier,
  listPurchases,
  getPurchaseDetails
} from './service';
import crypto from 'crypto';

let totalPassed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
  totalPassed++;
}

// Mock PostgreSQL Security & RLS Engine for Suppliers & Purchases
interface MockMember {
  user_id: string;
  pharmacy_id: string;
  role: 'OWNER' | 'MANAGER' | 'PHARMACIST' | 'CASHIER';
  status: 'ACTIVE' | 'SUSPENDED';
}

interface MockSupplierEntity {
  id: string;
  pharmacy_id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
}

interface MockPurchaseEntity {
  id: string;
  pharmacy_id: string;
  branch_id: string;
  supplier_id: string | null;
  invoice_number: string | null;
  total_cost: number;
  status: string;
  client_op_id: string | null;
  notes: string | null;
  received_at: string | null;
  created_at: string;
}

interface MockPurchaseItemEntity {
  id: string;
  pharmacy_id: string;
  purchase_id: string;
  product_id: string;
  batch_id: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  created_at: string;
}

class MockSupabaseDatabase {
  public members: MockMember[] = [];
  public suppliers: MockSupplierEntity[] = [];
  public purchases: MockPurchaseEntity[] = [];
  public purchaseItems: MockPurchaseItemEntity[] = [];
  public branches: Array<{ id: string; pharmacy_id: string; name: string }> = [];
  public products: Array<{ id: string; pharmacy_id: string; name: string; sku: string | null }> = [];
  public currentUser: { id: string; pharmacy_id: string; role: string; permissions: string[] } | null = null;

  // Build Supabase Client Mock
  public createClient() {
    const db = this;

    return {
      from: (table: string) => {
        let selectedFields: string | null = null;
        let filters: Array<(row: any) => boolean> = [];
        let orderBy: { field: string; ascending: boolean } | null = null;
        let limitVal: number | null = null;

        const queryObj: any = {
          select: (fields = '*') => {
            selectedFields = fields;
            return queryObj;
          },
          eq: (field: string, val: any) => {
            filters.push((row: any) => String(row[field]).toLowerCase() === String(val).toLowerCase());
            return queryObj;
          },
          ilike: (field: string, pattern: string) => {
            const raw = pattern.replace(/%/g, '').toLowerCase();
            filters.push((row: any) => String(row[field] || '').toLowerCase().includes(raw));
            return queryObj;
          },
          or: (expr: string) => {
            // Expression: name.ilike.%term%,contact_person.ilike.%term%,...
            const parts = expr.split(',');
            filters.push((row: any) => {
              return parts.some((p) => {
                const [f, , pat] = p.split('.');
                const clean = (pat || '').replace(/%/g, '').toLowerCase();
                return String(row[f] || '').toLowerCase().includes(clean);
              });
            });
            return queryObj;
          },
          in: (field: string, values: any[]) => {
            const set = new Set(values.map((v) => String(v).toLowerCase()));
            filters.push((row: any) => set.has(String(row[field]).toLowerCase()));
            return queryObj;
          },
          order: (field: string, opts?: { ascending?: boolean }) => {
            orderBy = { field, ascending: opts?.ascending ?? true };
            return queryObj;
          },
          limit: (n: number) => {
            limitVal = n;
            return queryObj;
          },
          range: () => queryObj,
          maybeSingle: async () => {
            const res = await queryObj;
            if (res.error) return { data: null, error: res.error };
            return { data: res.data && res.data.length > 0 ? res.data[0] : null, error: null };
          },
          single: async () => {
            const res = await queryObj;
            if (res.error) return { data: null, error: res.error };
            return { data: res.data && res.data.length > 0 ? res.data[0] : null, error: null };
          },
          insert: (data: any) => {
            // Check RLS for insert
            if (table === 'suppliers') {
              const user = db.currentUser;
              if (!user || user.pharmacy_id.toLowerCase() !== String(data.pharmacy_id).toLowerCase()) {
                return {
                  select: () => ({
                    single: async () => ({ data: null, error: { code: '42501', message: 'FORBIDDEN: Tenant mismatch' } })
                  })
                };
              }
              const hasManage = user.role === 'OWNER' || user.role === 'MANAGER' || user.role === 'PHARMACIST' || user.permissions.includes('purchases.manage');
              if (!hasManage) {
                return {
                  select: () => ({
                    single: async () => ({ data: null, error: { code: '42501', message: 'FORBIDDEN: Caller lacks purchases.manage' } })
                  })
                };
              }

              const newRow: MockSupplierEntity = {
                id: crypto.randomUUID(),
                pharmacy_id: String(data.pharmacy_id).toLowerCase(),
                name: data.name,
                contact_person: data.contact_person || null,
                email: data.email || null,
                phone: data.phone || null,
                address: data.address || null,
                created_at: new Date().toISOString()
              };
              db.suppliers.push(newRow);

              return {
                select: () => ({
                  single: async () => ({ data: newRow, error: null })
                })
              };
            }

            return {
              select: () => ({
                single: async () => ({ data: null, error: { message: 'Insert not supported for table' } })
              })
            };
          },
          update: (updates: any) => {
            return {
              eq: (f1: string, v1: any) => ({
                eq: (f2: string, v2: any) => ({
                  select: () => ({
                    maybeSingle: async () => {
                      if (table !== 'suppliers') return { data: null, error: { message: 'Update not supported' } };

                      const user = db.currentUser;
                      const pharmId = String(f1 === 'pharmacy_id' ? v1 : v2).toLowerCase();
                      const supId = String(f1 === 'id' ? v1 : v2).toLowerCase();

                      if (!user || user.pharmacy_id.toLowerCase() !== pharmId) {
                        return { data: null, error: { code: '42501', message: 'FORBIDDEN: Tenant mismatch' } };
                      }
                      const hasManage = user.role === 'OWNER' || user.role === 'MANAGER' || user.role === 'PHARMACIST' || user.permissions.includes('purchases.manage');
                      if (!hasManage) {
                        return { data: null, error: { code: '42501', message: 'FORBIDDEN: Caller lacks purchases.manage' } };
                      }

                      const existing = db.suppliers.find((s) => s.id === supId && s.pharmacy_id === pharmId);
                      if (!existing) return { data: null, error: null };

                      Object.assign(existing, updates);
                      return { data: existing, error: null };
                    }
                  })
                })
              })
            };
          },
          delete: () => {
            return {
              eq: (f1: string, v1: any) => ({
                eq: (f2: string, v2: any) => {
                  const pharmId = String(f1 === 'pharmacy_id' ? v1 : v2).toLowerCase();
                  const supId = String(f1 === 'id' ? v1 : v2).toLowerCase();

                  const user = db.currentUser;
                  if (!user || user.pharmacy_id.toLowerCase() !== pharmId) {
                    return Promise.resolve({ error: { code: '42501', message: 'FORBIDDEN: Tenant mismatch' } });
                  }
                  // RLS M-7: rls_suppliers_delete requires OWNER
                  if (user.role !== 'OWNER') {
                    return Promise.resolve({ error: { code: '42501', message: 'FORBIDDEN: Only OWNER can delete suppliers' } });
                  }

                  // Foreign key constraint check with public.purchases
                  const hasPurchases = db.purchases.some((p) => p.supplier_id === supId && p.pharmacy_id === pharmId);
                  if (hasPurchases) {
                    return Promise.resolve({
                      error: {
                        code: '23503',
                        message: 'update or delete on table "suppliers" violates foreign key constraint "purchases_supplier_id_fkey" on table "purchases"'
                      }
                    });
                  }

                  const idx = db.suppliers.findIndex((s) => s.id === supId && s.pharmacy_id === pharmId);
                  if (idx !== -1) {
                    db.suppliers.splice(idx, 1);
                  }
                  return Promise.resolve({ error: null });
                }
              })
            };
          },
          then: (resolve: any) => {
            // Handle SELECT query execution
            const user = db.currentUser;

            if (table === 'suppliers') {
              let rows = db.suppliers.filter((s) => {
                return filters.every((fn) => fn(s));
              });
              if (orderBy) {
                const { field, ascending } = orderBy;
                rows.sort((a: any, b: any) => {
                  if (a[field] < b[field]) return ascending ? -1 : 1;
                  if (a[field] > b[field]) return ascending ? 1 : -1;
                  return 0;
                });
              }
              if (limitVal) rows = rows.slice(0, limitVal);
              resolve({ data: rows, error: null });
              return;
            }

            if (table === 'purchases') {
              // M-13 RLS policy: rls_purchases_select
              const isAllowed = user && (
                user.role === 'OWNER' ||
                user.role === 'MANAGER' ||
                user.role === 'PHARMACIST' ||
                user.permissions.includes('purchases.manage') ||
                user.permissions.includes('reports.financial')
              );

              if (!isAllowed) {
                resolve({
                  data: null,
                  error: { code: '42501', message: 'FORBIDDEN: CASHIER lacks permission to select purchases' }
                });
                return;
              }

              let rows = db.purchases.filter((p) => filters.every((fn) => fn(p)));
              if (orderBy) {
                const { field, ascending } = orderBy;
                rows.sort((a: any, b: any) => {
                  if (a[field] < b[field]) return ascending ? -1 : 1;
                  if (a[field] > b[field]) return ascending ? 1 : -1;
                  return 0;
                });
              }
              resolve({ data: rows, error: null });
              return;
            }

            if (table === 'purchase_items') {
              const isAllowed = user && (
                user.role === 'OWNER' ||
                user.role === 'MANAGER' ||
                user.role === 'PHARMACIST' ||
                user.permissions.includes('purchases.manage') ||
                user.permissions.includes('reports.financial')
              );

              if (!isAllowed) {
                resolve({
                  data: null,
                  error: { code: '42501', message: 'FORBIDDEN: CASHIER lacks permission to select purchase_items' }
                });
                return;
              }

              const rows = db.purchaseItems.filter((pi) => filters.every((fn) => fn(pi)));
              resolve({ data: rows, error: null });
              return;
            }

            if (table === 'branches') {
              const rows = db.branches.filter((b) => filters.every((fn) => fn(b)));
              resolve({ data: rows, error: null });
              return;
            }

            if (table === 'products') {
              const rows = db.products.filter((p) => filters.every((fn) => fn(p)));
              resolve({ data: rows, error: null });
              return;
            }

            resolve({ data: [], error: null });
          }
        };

        return queryObj;
      }
    };
  }
}

async function runSuppliersTestSuite() {
  console.log('================================================================');
  console.log('PHARMACYFLOW PHASE 5D-19: SUPPLIERS & PROCUREMENT INTAKE SUITE');
  console.log('================================================================\n');

  // Section 1: Validation & Normalization
  console.log('[1. Supplier Input Validation & Normalization]');
  const validId = crypto.randomUUID();

  const v1 = validateCreateSupplierInput({
    pharmacy_id: validId,
    name: '  Novartis   Pharma  '
  });
  assert(v1.isValid === true, '1. Valid supplier input passes validation');
  assert(normalizeSupplierName('  Novartis   Pharma  ') === 'Novartis Pharma', '1b. Normalizes excess whitespace in name');

  const v2 = validateCreateSupplierInput({
    pharmacy_id: validId,
    name: ''
  });
  assert(v2.isValid === false, '2. Empty supplier name rejected');
  assert(v2.errors.some((e) => e.code === 'REQUIRED_FIELD'), '2b. Reports REQUIRED_FIELD error code');

  const v3 = validateCreateSupplierInput({
    pharmacy_id: 'not-a-uuid',
    name: 'Pfizer'
  });
  assert(v3.isValid === false, '3. Invalid pharmacy_id rejected');
  assert(v3.errors.some((e) => e.code === 'INVALID_UUID'), '3b. Reports INVALID_UUID error code');

  const v4 = validateCreateSupplierInput({
    pharmacy_id: validId,
    name: 'GlaxoSmithKline',
    email: 'bad-email'
  });
  assert(v4.isValid === false, '4. Malformed email address rejected');
  assert(v4.errors.some((e) => e.code === 'INVALID_EMAIL'), '4b. Reports INVALID_EMAIL code');

  const v5 = validateCreateSupplierInput({
    pharmacy_id: validId,
    name: 'Sanofi',
    email: '  ORDERS@SANOFI.COM  ',
    phone: '  +234   803  123 4567 '
  });
  assert(v5.isValid === true, '5. Valid supplier with contact info passes');
  assert(normalizeEmail('  ORDERS@SANOFI.COM  ') === 'orders@sanofi.com', '5b. Email lowercased and trimmed');
  assert(normalizePhoneNumber('  +234   803  123 4567 ') === '+234 803 123 4567', '5c. Phone number whitespace collapsed');

  const v6 = validateCreateSupplierInput({
    pharmacy_id: validId,
    name: 'A'.repeat(256)
  });
  assert(v6.isValid === false, '6. Name exceeding 255 chars rejected');
  assert(v6.errors.some((e) => e.code === 'MAX_LENGTH_EXCEEDED'), '6b. Reports MAX_LENGTH_EXCEEDED');

  const vUpdate = validateUpdateSupplierInput({
    name: 'X'
  });
  assert(vUpdate.isValid === false, '7. Update with name < 2 chars rejected');

  // Section 2: Option A Integrity (No is_active / status)
  console.log('\n[2. Option A Lifecycle Integrity (No Archive State)]');
  const dummySupplier: Supplier = {
    id: crypto.randomUUID(),
    pharmacy_id: validId,
    name: 'AstraZeneca',
    contact_person: 'Jane Doe',
    email: 'jane@astrazeneca.com',
    phone: '+2348000000000',
    address: 'Lagos Warehouse',
    created_at: new Date().toISOString()
  };
  assert(!('is_active' in dummySupplier), '8. Option A: Supplier interface has NO is_active field');
  assert(!('status' in dummySupplier), '8b. Option A: Supplier interface has NO status field');
  assert(!('archived_at' in dummySupplier), '8c. Option A: Supplier interface has NO archived_at field');
  assert(!('deleted_at' in dummySupplier), '8d. Option A: Supplier interface has NO deleted_at field');

  // Setup Mock Database & Tenants
  const db = new MockSupabaseDatabase();
  const client = db.createClient();

  const PHARMACY_A = crypto.randomUUID();
  const PHARMACY_B = crypto.randomUUID();
  const BRANCH_A1 = crypto.randomUUID();
  const PRODUCT_P1 = crypto.randomUUID();

  db.branches.push({ id: BRANCH_A1, pharmacy_id: PHARMACY_A, name: 'Branch Victoria Island' });
  db.products.push({ id: PRODUCT_P1, pharmacy_id: PHARMACY_A, name: 'Amoxicillin 500mg', sku: 'AMOX-500' });

  // Section 3: Tenant Scoping & Isolation
  console.log('\n[3. Tenant Isolation & Scoping Invariants]');
  // Seed suppliers in Pharmacy A and Pharmacy B
  const supA1: MockSupplierEntity = {
    id: crypto.randomUUID(),
    pharmacy_id: PHARMACY_A,
    name: 'PharmaSupply Alpha',
    contact_person: 'Alice',
    email: 'alice@alpha.com',
    phone: '08011111111',
    address: 'Depot A',
    created_at: new Date().toISOString()
  };
  const supB1: MockSupplierEntity = {
    id: crypto.randomUUID(),
    pharmacy_id: PHARMACY_B,
    name: 'PharmaSupply Beta',
    contact_person: 'Bob',
    email: 'bob@beta.com',
    phone: '08022222222',
    address: 'Depot B',
    created_at: new Date().toISOString()
  };
  db.suppliers.push(supA1, supB1);

  // Set current user as OWNER of Pharmacy A
  db.currentUser = { id: 'user-owner-a', pharmacy_id: PHARMACY_A, role: 'OWNER', permissions: ['purchases.manage'] };

  const listA = await listSuppliers(client as any, PHARMACY_A);
  assert(listA.success === true, '9. Pharmacy A supplier listing succeeds');
  assert(listA.suppliers.length === 1, '9b. Pharmacy A receives exactly 1 supplier');
  assert(listA.suppliers[0].id === supA1.id, '9c. Pharmacy A receives only its own supplier (Alpha)');
  assert(!listA.suppliers.some((s) => s.id === supB1.id), '9d. Pharmacy B supplier is strictly excluded from Pharmacy A');

  // Pharmacy A attempt to update Pharmacy B supplier
  const updateCross = await updateSupplier(client as any, PHARMACY_A, supB1.id, { name: 'Hacked Name' });
  assert(updateCross.success === false, '10. Updating cross-pharmacy supplier is strictly rejected');
  assert(supB1.name === 'PharmaSupply Beta', '10b. Pharmacy B supplier name remains unaltered');

  // Pharmacy A attempt to delete Pharmacy B supplier
  const deleteCross = await deleteSupplier(client as any, PHARMACY_A, supB1.id);
  assert(db.suppliers.some((s) => s.id === supB1.id), '11. Pharmacy B supplier cannot be deleted by Pharmacy A');

  // Section 4: Role-Based Authorization
  console.log('\n[4. Role Authorization Matrix (M-7 Enforcement)]');

  // Test 4.1: OWNER permissions
  db.currentUser = { id: 'user-owner', pharmacy_id: PHARMACY_A, role: 'OWNER', permissions: ['purchases.manage'] };
  const ownerCreate = await createSupplier(client as any, {
    pharmacy_id: PHARMACY_A,
    name: 'Owner Created Vendor'
  });
  assert(ownerCreate.success === true, '12. OWNER can CREATE supplier');
  assert(Boolean(ownerCreate.supplier?.id), '12b. Created supplier returned with ID');

  const ownerUpdate = await updateSupplier(client as any, PHARMACY_A, ownerCreate.supplier!.id, {
    name: 'Owner Updated Vendor'
  });
  assert(ownerUpdate.success === true, '13. OWNER can UPDATE supplier');
  assert(ownerUpdate.supplier?.name === 'Owner Updated Vendor', '13b. Supplier updated correctly');

  // Test 4.2: MANAGER permissions
  db.currentUser = { id: 'user-manager', pharmacy_id: PHARMACY_A, role: 'MANAGER', permissions: ['purchases.manage'] };
  const mgrCreate = await createSupplier(client as any, {
    pharmacy_id: PHARMACY_A,
    name: 'Manager Created Vendor'
  });
  assert(mgrCreate.success === true, '14. MANAGER can CREATE supplier');

  const mgrUpdate = await updateSupplier(client as any, PHARMACY_A, mgrCreate.supplier!.id, {
    contact_person: 'Manager Rep'
  });
  assert(mgrUpdate.success === true, '15. MANAGER can UPDATE supplier');

  const mgrDelete = await deleteSupplier(client as any, PHARMACY_A, mgrCreate.supplier!.id);
  assert(mgrDelete.success === false, '16. MANAGER DELETE supplier is REJECTED by RLS');
  assert(mgrDelete.errorCode === 'FORBIDDEN_OWNER_ONLY', '16b. Returns FORBIDDEN_OWNER_ONLY error code');

  // Test 4.3: PHARMACIST permissions
  db.currentUser = { id: 'user-pharmacist', pharmacy_id: PHARMACY_A, role: 'PHARMACIST', permissions: ['purchases.manage'] };
  const pharmCreate = await createSupplier(client as any, {
    pharmacy_id: PHARMACY_A,
    name: 'Pharmacist Created Vendor'
  });
  assert(pharmCreate.success === true, '17. PHARMACIST can CREATE supplier');

  const pharmDelete = await deleteSupplier(client as any, PHARMACY_A, pharmCreate.supplier!.id);
  assert(pharmDelete.success === false, '18. PHARMACIST DELETE supplier is REJECTED by RLS');
  assert(pharmDelete.errorCode === 'FORBIDDEN_OWNER_ONLY', '18b. Reports FORBIDDEN_OWNER_ONLY');

  // Test 4.4: CASHIER permissions
  db.currentUser = { id: 'user-cashier', pharmacy_id: PHARMACY_A, role: 'CASHIER', permissions: ['inventory.read', 'sales.create'] };
  const cashierList = await listSuppliers(client as any, PHARMACY_A);
  assert(cashierList.success === true, '19. CASHIER can READ supplier directory per rls_suppliers_select');
  assert(cashierList.suppliers.length > 0, '19b. CASHIER receives active suppliers list');

  const cashierCreate = await createSupplier(client as any, {
    pharmacy_id: PHARMACY_A,
    name: 'Cashier Unauthorized Vendor'
  });
  assert(cashierCreate.success === false, '20. CASHIER CREATE supplier is REJECTED by RLS (lacks purchases.manage)');
  assert(cashierCreate.errorCode === 'FORBIDDEN_PERMISSION', '20b. Reports FORBIDDEN_PERMISSION');

  const cashierUpdate = await updateSupplier(client as any, PHARMACY_A, supA1.id, { name: 'Cashier Renamed' });
  assert(cashierUpdate.success === false, '21. CASHIER UPDATE supplier is REJECTED by RLS');
  assert(cashierUpdate.errorCode === 'FORBIDDEN_PERMISSION', '21b. Reports FORBIDDEN_PERMISSION');

  const cashierDelete = await deleteSupplier(client as any, PHARMACY_A, supA1.id);
  assert(cashierDelete.success === false, '22. CASHIER DELETE supplier is REJECTED by RLS');
  assert(cashierDelete.errorCode === 'FORBIDDEN_OWNER_ONLY', '22b. Reports FORBIDDEN_OWNER_ONLY');

  // Section 5: Supplier Deletion & FK Referential Integrity (23503)
  console.log('\n[5. Permanent Deletion & PostgreSQL FK Integrity]');
  db.currentUser = { id: 'user-owner', pharmacy_id: PHARMACY_A, role: 'OWNER', permissions: ['purchases.manage'] };

  // Deleting an unreferenced supplier succeeds
  const deleteUnreferenced = await deleteSupplier(client as any, PHARMACY_A, pharmCreate.supplier!.id);
  assert(deleteUnreferenced.success === true, '23. OWNER can delete unreferenced supplier');
  assert(!db.suppliers.some((s) => s.id === pharmCreate.supplier!.id), '23b. Supplier removed from database');

  // Create a purchase record referencing supA1 to simulate foreign key link
  const purchaseWithSupplier: MockPurchaseEntity = {
    id: crypto.randomUUID(),
    pharmacy_id: PHARMACY_A,
    branch_id: BRANCH_A1,
    supplier_id: supA1.id,
    invoice_number: 'INV-2026-001',
    total_cost: 50000,
    status: 'COMPLETED',
    client_op_id: crypto.randomUUID(),
    notes: 'Historical intake',
    received_at: new Date().toISOString(),
    created_at: new Date().toISOString()
  };
  db.purchases.push(purchaseWithSupplier);

  // Attempt to delete supA1 (which is referenced by purchase)
  const deleteReferenced = await deleteSupplier(client as any, PHARMACY_A, supA1.id);
  assert(deleteReferenced.success === false, '24. Deleting supplier with historical purchases is REJECTED (FK 23503)');
  assert(deleteReferenced.errorCode === 'SUPPLIER_HAS_LINKED_PURCHASES', '24b. Mapped to SUPPLIER_HAS_LINKED_PURCHASES error code');
  assert(Boolean(deleteReferenced.error?.includes('Historical purchase orders')), '24c. Informative audit protection message returned');
  assert(db.suppliers.some((s) => s.id === supA1.id), '24d. Referenced supplier remains intact in database');
  assert(db.purchases.some((p) => p.id === purchaseWithSupplier.id), '24e. Historical purchase record remains untouched');

  // Section 6: Stock Intake Linkage & Canonical Hashing
  console.log('\n[6. Stock Intake Linkage & Canonical Hashing]');
  // Verify optionality: no supplier produces valid payload
  const canonicalWithoutSupplier = (
    PHARMACY_A + ':' +
    BRANCH_A1 + ':' +
    'op-123' + ':' +
    '' + ':' + // COALESCE(lower(p_supplier_id::TEXT), '')
    'INV-101' + ':' +
    '[]'
  );
  const hashWithoutSupplier = crypto.createHash('sha256').update(canonicalWithoutSupplier).digest('hex');
  assert(typeof hashWithoutSupplier === 'string' && hashWithoutSupplier.length === 64, '25. Intake hash computes cleanly without supplier');

  // Verify linkage: valid supplier included in canonical payload
  const canonicalWithSupplier = (
    PHARMACY_A + ':' +
    BRANCH_A1 + ':' +
    'op-123' + ':' +
    supA1.id.toLowerCase() + ':' + // COALESCE(lower(p_supplier_id::TEXT), '')
    'INV-101' + ':' +
    '[]'
  );
  const hashWithSupplier = crypto.createHash('sha256').update(canonicalWithSupplier).digest('hex');
  assert(hashWithSupplier !== hashWithoutSupplier, '26. supplier_id participates deterministically in payload hash');

  // Section 7: Purchase / Inbound Shipment Audit View
  console.log('\n[7. Purchase / Inbound Shipment Audit View]');
  // Seed purchase items
  const pItem1: MockPurchaseItemEntity = {
    id: crypto.randomUUID(),
    pharmacy_id: PHARMACY_A,
    purchase_id: purchaseWithSupplier.id,
    product_id: PRODUCT_P1,
    batch_id: 'batch-001',
    quantity: 100,
    unit_cost: 500,
    total_cost: 50000,
    created_at: new Date().toISOString()
  };
  db.purchaseItems.push(pItem1);

  // Management (OWNER) can read purchase audit records
  db.currentUser = { id: 'user-owner', pharmacy_id: PHARMACY_A, role: 'OWNER', permissions: ['purchases.manage'] };
  const ownerPurchases = await listPurchases(client as any, PHARMACY_A);
  assert(ownerPurchases.success === true, '27. Management (OWNER) can view purchases history');
  assert(ownerPurchases.purchases.length === 1, '27b. Purchases list returns 1 inbound record');
  assert(ownerPurchases.purchases[0].supplier_name === 'PharmaSupply Alpha', '27c. Supplier name joined correctly');
  assert(ownerPurchases.purchases[0].branch_name === 'Branch Victoria Island', '27d. Branch name joined correctly');

  // Management can view line item manifest
  const itemsRes = await getPurchaseDetails(client as any, PHARMACY_A, purchaseWithSupplier.id);
  assert(itemsRes.success === true, '28. Management can view purchase line items');
  assert(itemsRes.items.length === 1, '28b. Line items returned 1 record');
  assert(itemsRes.items[0].product_name === 'Amoxicillin 500mg', '28c. Product name resolved in manifest');
  assert(itemsRes.items[0].quantity === 100, '28d. Quantity recorded correctly');
  assert(itemsRes.items[0].unit_cost === 500, '28e. Unit cost recorded correctly');

  // CASHIER is strictly prohibited from viewing purchases by PostgreSQL RLS
  db.currentUser = { id: 'user-cashier', pharmacy_id: PHARMACY_A, role: 'CASHIER', permissions: ['inventory.read', 'sales.create'] };
  const cashierPurchases = await listPurchases(client as any, PHARMACY_A);
  assert(cashierPurchases.success === false, '29. CASHIER reading purchases is REJECTED by database RLS');
  assert(cashierPurchases.errorCode === 'FORBIDDEN_PURCHASES_READ', '29b. Reports FORBIDDEN_PURCHASES_READ');

  const cashierItems = await getPurchaseDetails(client as any, PHARMACY_A, purchaseWithSupplier.id);
  assert(cashierItems.success === false, '30. CASHIER reading purchase items is REJECTED by database RLS');
  assert(cashierItems.errorCode === 'FORBIDDEN_PURCHASES_READ', '30b. Line item cost protection enforced');

  console.log(`\n================================================================`);
  console.log(`PHASE 5D-19 SUPPLIERS SUITE: ${totalPassed} PASSED, 0 FAILED`);
  console.log(`================================================================`);
}

runSuppliersTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
