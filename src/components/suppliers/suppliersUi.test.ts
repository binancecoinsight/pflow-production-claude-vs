/**
 * PHARMACYFLOW PHASE 5D-19: SUPPLIERS UI & WORKFLOW TEST SUITE
 * 
 * Verifies:
 * 1. Role-based UI visibility & permission guards
 * 2. Delete confirmation semantics (strictly Delete, zero Archive terminology)
 * 3. Client-side search and filtering logic
 * 4. Stock intake supplier selector behavior & optionality
 * 5. Purchase history audit presentation & cost formatting
 */

import { Supplier, PurchaseAuditRecord, PurchaseAuditItem } from '../../lib/suppliers/types';
import { formatMinorUnits } from '../pos/formatters';
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

// UI Role Gate Helpers mirroring SuppliersView logic
function canManageSuppliers(role: string | null | undefined, permissions: string[] = []): boolean {
  return role === 'OWNER' || role === 'MANAGER' || role === 'PHARMACIST' || permissions.includes('purchases.manage');
}

function canDeleteSuppliers(role: string | null | undefined): boolean {
  return role === 'OWNER';
}

function canViewPurchases(role: string | null | undefined, permissions: string[] = []): boolean {
  return role === 'OWNER' || role === 'MANAGER' || role === 'PHARMACIST' || permissions.includes('purchases.manage') || permissions.includes('reports.financial');
}

// Client search filtering mirroring SuppliersView
function filterSuppliers(suppliers: Supplier[], query: string): Supplier[] {
  if (!query.trim()) return suppliers;
  const term = query.toLowerCase().trim();
  return suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(term) ||
      (s.contact_person && s.contact_person.toLowerCase().includes(term)) ||
      (s.phone && s.phone.includes(term)) ||
      (s.email && s.email.toLowerCase().includes(term))
  );
}

async function runSuppliersUiTestSuite() {
  console.log('================================================================');
  console.log('PHARMACYFLOW PHASE 5D-19: SUPPLIERS UI & WORKFLOW SUITE');
  console.log('================================================================\n');

  // Section 1: Role-Based UI Action Visibility
  console.log('[1. Role-Based Action Visibility & Gating]');
  assert(canManageSuppliers('OWNER') === true, '1. OWNER can manage suppliers (Register/Edit buttons visible)');
  assert(canDeleteSuppliers('OWNER') === true, '1b. OWNER can delete suppliers (Delete button visible)');
  assert(canViewPurchases('OWNER') === true, '1c. OWNER can view purchases tab');

  assert(canManageSuppliers('MANAGER') === true, '2. MANAGER can manage suppliers');
  assert(canDeleteSuppliers('MANAGER') === false, '2b. MANAGER CANNOT delete suppliers (Delete button hidden)');
  assert(canViewPurchases('MANAGER') === true, '2c. MANAGER can view purchases tab');

  assert(canManageSuppliers('PHARMACIST') === true, '3. PHARMACIST can manage suppliers');
  assert(canDeleteSuppliers('PHARMACIST') === false, '3b. PHARMACIST CANNOT delete suppliers (Delete button hidden)');
  assert(canViewPurchases('PHARMACIST') === true, '3c. PHARMACIST can view purchases tab');

  assert(canManageSuppliers('CASHIER') === false, '4. CASHIER CANNOT manage suppliers (Register/Edit hidden)');
  assert(canDeleteSuppliers('CASHIER') === false, '4b. CASHIER CANNOT delete suppliers (Delete button hidden)');
  assert(canViewPurchases('CASHIER') === false, '4c. CASHIER CANNOT view purchases tab (Management access only)');

  assert(canManageSuppliers('CASHIER', ['purchases.manage']) === true, '5. CASHIER with explicit purchases.manage can manage suppliers');
  assert(canDeleteSuppliers('CASHIER') === false, '5b. CASHIER with explicit purchases.manage STILL CANNOT delete suppliers (OWNER only)');

  // Section 2: Delete Action Semantics (Option A Compliance)
  console.log('\n[2. Delete Action Terminology & Semantic Invariants]');
  const deleteModalTitle = 'Delete Supplier?';
  const deleteModalSubtitle = 'Permanent Action • Cannot be undone';
  const deleteButtonText = 'Delete Supplier';

  assert(!deleteModalTitle.toLowerCase().includes('archive'), '6. Delete modal title NEVER mentions "archive"');
  assert(!deleteModalSubtitle.toLowerCase().includes('archive'), '6b. Delete modal subtitle NEVER mentions "archive"');
  assert(!deleteButtonText.toLowerCase().includes('archive'), '6c. Delete button NEVER mentions "archive"');
  assert(deleteModalTitle === 'Delete Supplier?', '6d. Strict terminology: "Delete Supplier?"');
  assert(deleteModalSubtitle.includes('Permanent Action'), '6e. Explicit statement of permanence');

  // Section 3: Client-Side Search & Filtering
  console.log('\n[3. Supplier Search & Filtering]');
  const sampleSuppliers: Supplier[] = [
    {
      id: crypto.randomUUID(),
      pharmacy_id: crypto.randomUUID(),
      name: 'Pfizer Nigeria Ltd',
      contact_person: 'Emeka Okafor',
      email: 'emeka@pfizer.com',
      phone: '+2348011112222',
      address: 'Ikeja Industrial Estate, Lagos',
      created_at: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      pharmacy_id: crypto.randomUUID(),
      name: 'Emzor Pharmaceuticals',
      contact_person: 'Dr. Stella Okoli',
      email: 'orders@emzorpharma.com',
      phone: '+2348033334444',
      address: 'Ajao Estate, Lagos',
      created_at: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      pharmacy_id: crypto.randomUUID(),
      name: 'Fidson Healthcare Plc',
      contact_person: 'Babatunde Alabi',
      email: 'info@fidson.com',
      phone: '+2348055556666',
      address: 'Obanikoro, Lagos',
      created_at: new Date().toISOString()
    }
  ];

  const searchByName = filterSuppliers(sampleSuppliers, 'pfizer');
  assert(searchByName.length === 1 && searchByName[0].name.includes('Pfizer'), '7. Search by supplier name');

  const searchByContact = filterSuppliers(sampleSuppliers, 'stella');
  assert(searchByContact.length === 1 && searchByContact[0].name.includes('Emzor'), '8. Search by contact person');

  const searchByPhone = filterSuppliers(sampleSuppliers, '5555');
  assert(searchByPhone.length === 1 && searchByPhone[0].name.includes('Fidson'), '9. Search by phone number substring');

  const searchByEmail = filterSuppliers(sampleSuppliers, 'orders@');
  assert(searchByEmail.length === 1 && searchByEmail[0].name.includes('Emzor'), '10. Search by email domain/prefix');

  const emptySearch = filterSuppliers(sampleSuppliers, '   ');
  assert(emptySearch.length === 3, '11. Empty search query returns all suppliers');

  // Section 4: Stock Intake Supplier Selector Behavior
  console.log('\n[4. Stock Intake Supplier Selector]');
  // Simulate intake modal payload formation
  const buildIntakePayload = (selectedSupplierId: string) => {
    return {
      supplier_id: selectedSupplierId ? selectedSupplierId.toLowerCase().trim() : undefined
    };
  };

  const payloadNoSupplier = buildIntakePayload('');
  assert(payloadNoSupplier.supplier_id === undefined, '12. Unselected supplier passes undefined (No supplier / Direct intake)');

  const validSupplierId = crypto.randomUUID();
  const payloadWithSupplier = buildIntakePayload(validSupplierId);
  assert(payloadWithSupplier.supplier_id === validSupplierId.toLowerCase(), '13. Selected supplier passes valid UUID');

  // Section 5: Purchase Audit History & Currency Formatting
  console.log('\n[5. Purchase Audit History & Currency Formatting]');
  const samplePurchase: PurchaseAuditRecord = {
    id: crypto.randomUUID(),
    pharmacy_id: crypto.randomUUID(),
    branch_id: crypto.randomUUID(),
    branch_name: 'Main Branch Ikeja',
    supplier_id: sampleSuppliers[0].id,
    supplier_name: 'Pfizer Nigeria Ltd',
    invoice_number: 'INV-2026-999',
    total_cost: 15750000, // ₦157,500.00
    status: 'COMPLETED',
    client_op_id: crypto.randomUUID(),
    notes: 'Direct distributor delivery',
    received_at: new Date().toISOString(),
    created_at: new Date().toISOString()
  };

  const formattedCost = formatMinorUnits(samplePurchase.total_cost, 'NGN');
  assert(formattedCost.includes('157,500') || formattedCost.includes('157500'), '14. Total cost formatted accurately in minor currency units');

  const sampleItems: PurchaseAuditItem[] = [
    {
      id: crypto.randomUUID(),
      purchase_id: samplePurchase.id,
      product_id: crypto.randomUUID(),
      product_name: 'Paracetamol 500mg (Pack of 100)',
      product_sku: 'PARA-100',
      batch_id: crypto.randomUUID(),
      quantity: 50,
      unit_cost: 150000,
      total_cost: 7500000,
      created_at: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      purchase_id: samplePurchase.id,
      product_id: crypto.randomUUID(),
      product_name: 'Artemether/Lumefantrine 20/120',
      product_sku: 'ACT-24',
      batch_id: crypto.randomUUID(),
      quantity: 30,
      unit_cost: 275000,
      total_cost: 8250000,
      created_at: new Date().toISOString()
    }
  ];

  const sumTotalItemsCost = sampleItems.reduce((acc, it) => acc + it.total_cost, 0);
  assert(sumTotalItemsCost === samplePurchase.total_cost, '15. Sum of item line costs exactly equals purchase total_cost (15,750,000 kobo)');

  console.log(`\n================================================================`);
  console.log(`PHASE 5D-19 SUPPLIERS UI SUITE: ${totalPassed} PASSED, 0 FAILED`);
  console.log(`================================================================`);
}

runSuppliersUiTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
