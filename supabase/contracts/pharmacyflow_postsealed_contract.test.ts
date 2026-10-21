/**
 * Static contract check only. It never connects to PostgreSQL or executes SQL.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), 'utf8');
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const foundation = read('foundation/pharmacyflow_foundation_v1.sql');
const registration = read('post_sealed/pharmacyflow_registration_and_tenant_rls.sql');
const sales = read('post_sealed/pharmacyflow_unified_sales_commit.sql');
const financial = read('post_sealed/pharmacyflow_financial_inventory_corrections.sql');

for (const table of [
  'pharmacies', 'branches', 'products', 'inventory_batches', 'sales',
  'sale_items', 'purchases', 'purchase_items', 'customers', 'suppliers',
  'staff', 'expenses', 'sync_queue'
]) {
  assert(foundation.includes(`CREATE TABLE public.${table}`), `Foundation table missing: ${table}`);
}
assert(!foundation.includes('CREATE TABLE public.stock_ledger'), 'Foundation must not duplicate M-5 ledger');
assert(!foundation.includes('CREATE TABLE public.sync_journal'), 'Foundation must not duplicate M-6 journal');
assert(registration.includes('CREATE TRIGGER on_auth_user_created'), 'Auth trigger attachment missing');
assert(registration.includes('REVOKE INSERT, UPDATE, DELETE ON public.sales, public.sale_items'), 'Direct sale write containment missing');
assert(sales.includes('CREATE OR REPLACE FUNCTION public.rpc_commit_sale_v1'), 'Unified RPC missing');
assert(sales.includes('jsonb_array_elements(p_items)'), 'Unified RPC must process every sale item');
assert(sales.includes('FOR UPDATE'), 'Unified RPC must lock inventory rows');
assert(sales.includes('INSERT INTO public.stock_ledger'), 'Unified RPC must append stock ledger entries');
assert(financial.includes('refund_amount_minor BIGINT'), 'Minor-unit refund correction missing');

console.log('PharmacyFlow post-sealed static contract checks passed.');
