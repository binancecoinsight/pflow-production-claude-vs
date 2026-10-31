import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

let passed = 0;
function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  passed += 1;
}

const read = (path) => readFileSync(path, 'utf8');
const hash = (text) => createHash('sha256').update(text).digest('hex');

// Load target sources
const migration = read('supabase/migrations/20261029000035_server_authoritative_entitlement_v1.sql');
const capabilities = read('src/lib/subscription/capabilities.ts');
const lifecycle = read('src/lib/subscription/lifecycle.ts');
const enforcement = read('src/lib/subscription/entitlementEnforcement.ts');
const adapter = read('src/lib/subscription/entitlementAdapter.ts');

// ----------------------------------------------------------------------------
// SUITE 1: SQL Migration Security, Structure & Preconditions
// ----------------------------------------------------------------------------
assert(migration.includes("information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscriptions'"), 'precondition checks subscriptions table');
assert(migration.includes("information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscription_plans'"), 'precondition checks subscription_plans table');
assert(migration.includes("information_schema.tables WHERE table_schema = 'public' AND table_name = 'pharmacy_entitlement_anchors'"), 'precondition checks pharmacy_entitlement_anchors uniqueness');

assert(migration.includes('CREATE TABLE public.pharmacy_entitlement_anchors'), 'creates pharmacy_entitlement_anchors audit ledger');
assert(migration.includes('ALTER TABLE public.pharmacy_entitlement_anchors ENABLE ROW LEVEL SECURITY;'), 'enables RLS on pharmacy_entitlement_anchors');
assert(migration.includes('ALTER TABLE public.pharmacy_entitlement_anchors FORCE ROW LEVEL SECURITY;'), 'forces RLS on pharmacy_entitlement_anchors');
assert(migration.includes('REVOKE INSERT, UPDATE, DELETE ON public.pharmacy_entitlement_anchors FROM authenticated, anon, public;'), 'revokes table mutations from public, anon, authenticated');
assert(migration.includes('public.is_pharmacy_member(pharmacy_id)'), 'anchors select policy enforces pharmacy membership');
assert(migration.includes('CREATE TRIGGER trg_subscriptions_entitlement_anchor'), 'migration wires trigger on subscriptions to populate anchors');
assert(migration.includes('rpc_record_entitlement_anchor_v1'), 'migration exports rpc_record_entitlement_anchor_v1 for platform admin audit records');

// ----------------------------------------------------------------------------
// SUITE 2: Server-Authoritative RPC (rpc_get_effective_entitlement_v1)
// ----------------------------------------------------------------------------
assert(migration.includes('CREATE OR REPLACE FUNCTION public.rpc_get_effective_entitlement_v1(p_pharmacy_id UUID)'), 'defines rpc_get_effective_entitlement_v1');
assert(migration.includes('SECURITY DEFINER'), 'rpc_get_effective_entitlement_v1 runs as SECURITY DEFINER');
assert(migration.includes('SET search_path = pg_catalog, public, pg_temp'), 'rpc_get_effective_entitlement_v1 enforces safe search_path');
assert(migration.includes('public.is_pharmacy_member(p_pharmacy_id) OR public.is_platform_admin(\'ADMIN\')'), 'verifies caller membership or platform admin');
assert(migration.includes("timezone('utc', now())"), 'derives time strictly from PostgreSQL UTC clock');
assert(migration.includes("'state', 'UNKNOWN'"), 'missing or malformed subscription fails closed to UNKNOWN');
assert(migration.includes("'historical_reads_allowed', TRUE"), 'unconditionally permits historical reads across all states');
assert(migration.includes("INTERVAL '7 days'"), 'implements approved 7-day grace period window');
assert(migration.includes('GRANT EXECUTE ON FUNCTION public.rpc_get_effective_entitlement_v1(UUID) TO authenticated;'), 'grants execute to authenticated role');
assert(migration.includes('REVOKE EXECUTE ON FUNCTION public.rpc_get_effective_entitlement_v1(UUID) FROM public, anon;'), 'revokes execute from public and anon');

// ----------------------------------------------------------------------------
// SUITE 3: Operation-Level Enforcement Guard (assert_pharmacy_mutation_entitled_v1)
// ----------------------------------------------------------------------------
assert(migration.includes('CREATE OR REPLACE FUNCTION public.assert_pharmacy_mutation_entitled_v1'), 'defines assert_pharmacy_mutation_entitled_v1');
assert(migration.includes('AUTH_REQUIRED: Unauthenticated caller.'), 'assertion enforces caller authentication before replay check');
assert(migration.includes('Unauthorized: Caller is not an authorized member of pharmacy'), 'assertion enforces caller pharmacy membership before replay check');
assert(migration.includes('p_operation_id IS NOT NULL'), 'inspects operation_id for replay reconciliation');
assert(migration.includes('public.sales WHERE id = p_operation_id'), 'verifies previously accepted sales for replay preservation');
assert(migration.includes('public.sync_journal WHERE client_op_id = p_operation_id'), 'verifies previously accepted operations in sync_journal');
assert(migration.includes('public.purchases WHERE (client_op_id = p_operation_id'), 'verifies previously accepted purchases for replay preservation');
assert(!migration.includes('sync_idempotency_log'), 'migration contains zero StoreFlow sync_idempotency_log schema references');
assert(migration.includes('ERRCODE = \'P0001\''), 'raises explicit P0001 exception on entitlement violation');
assert(migration.includes('ENTITLEMENT_EXPIRED'), 'includes ENTITLEMENT_EXPIRED code in detail payload');
assert(migration.includes('ENTITLEMENT_UNKNOWN'), 'includes ENTITLEMENT_UNKNOWN code in detail payload');
assert(migration.includes('GRANT EXECUTE ON FUNCTION public.assert_pharmacy_mutation_entitled_v1(UUID, TEXT, UUID) TO authenticated;'), 'grants assertion execute to authenticated');
assert(migration.includes('REVOKE EXECUTE ON FUNCTION public.assert_pharmacy_mutation_entitled_v1(UUID, TEXT, UUID) FROM public, anon;'), 'revokes assertion execute from public and anon');

// ----------------------------------------------------------------------------
// SUITE 4: Helper Function Backward Compatibility
// ----------------------------------------------------------------------------
assert(migration.includes('CREATE OR REPLACE FUNCTION public.is_subscription_active(p_pharmacy_id UUID)'), 'updates is_subscription_active helper');
assert(migration.includes("(current_period_end + INTERVAL '7 days') > timezone('utc', now())"), 'is_subscription_active includes 7-day grace window');

// ----------------------------------------------------------------------------
// SUITE 5: Client TypeScript Contracts & Enforcement Architecture
// ----------------------------------------------------------------------------
assert(capabilities.includes('reconcilePreviouslyAcceptedOperations: true'), 'capabilities preserves previously accepted offline reconciliation');
assert(capabilities.includes('viewHistoricalRecords: true'), 'capabilities preserves historical record viewing');
assert(capabilities.includes('reviewDurableCheckout: true'), 'capabilities preserves durable checkout review');
assert(capabilities.includes('acknowledgeDurableCheckout: true'), 'capabilities preserves durable checkout acknowledgment');
assert(capabilities.includes('state === \'TRIAL\' || state === \'ACTIVE\' || state === \'GRACE\''), 'allows mutations only for TRIAL, ACTIVE, GRACE');

assert(lifecycle.includes('resolveAuthoritativeEntitlement'), 'lifecycle exports resolveAuthoritativeEntitlement');
assert(lifecycle.includes('historicalReadAllowed: true'), 'lifecycle unconditionally preserves historical reads');
assert(lifecycle.includes('authoritative = false'), 'lifecycle defaults authoritative to false for advisory client checks');
assert(capabilities.includes('readonly authoritative: boolean'), 'capabilities models authoritative vs advisory distinction');

assert(enforcement.includes('EntitlementViolationError'), 'exports EntitlementViolationError');
assert(enforcement.includes('ReplayAuthorization'), 'requires evidence-bearing replay authorization');
assert(enforcement.includes('consumeReplayAuthorization(replay.currentRequest, replay.authorization)'), 'binds replay authorization consumption to the complete current request');
assert(enforcement.includes('isMutationOperation'), 'classifies mutation vs read/recovery operations');

assert(adapter.includes('createRpcEntitlementAdapter'), 'exports createRpcEntitlementAdapter');
assert(adapter.includes('createOfflineFallbackEntitlementAdapter'), 'exports createOfflineFallbackEntitlementAdapter');
assert(adapter.includes('rpc_get_effective_entitlement_v2'), 'adapter calls corrected effective-entitlement evaluator');
assert(adapter.includes('Promise.race'), 'adapter applies a bounded timeout');
assert(adapter.includes('Entitlement service was unavailable or timed out.'), 'adapter handles failures with a sanitized reason');

// ----------------------------------------------------------------------------
// SUITE 6: Protected Source Hashes Preservation
// ----------------------------------------------------------------------------
const preservedHashes = new Map([
  ['src/lib/inventory/expiry.ts', '7fb287f2c76daece42242f8caec10c2da586283ab7a9304f9d4fc3f60cd73470'],
  ['src/lib/inventory/validation.ts', '7c7bb6df87ff7bb781de9aee7a7439c11ebcdce2c91e6a30dd64ff4e120f5217'],
  ['src/lib/inventory/service.ts', '3bb0bc0fd47007a12553ad75767fab821bb0dc9acfb6ee20776e0c5151b40137'],
  ['src/lib/pos/cart.ts', '9e30054b25420ba5e9fb6582d9441c55c5f158307bb1ea310dcfad3271bc3710'],
  ['src/lib/pos/orchestrator.ts', 'c11edc1c7bbbf91b9326530441af63cdf7f06625d8a0d11cc4ffb45181dd5a6c'],
  ['src/lib/inventory/productDetailLoad.ts', '75ccbcc91c00e81c744600bd97b1b2a082b33621b70ef5316af8b8f2bcf91829'],
  ['src/components/inventory/ProductDetailModal.tsx', 'fb91eae81b6b4055c6da49629f357a440b9ff7e722062f54acb209ca18a003d7'],
]);

for (const [path, expected] of preservedHashes) {
  assert(hash(read(path)) === expected, `${path} preserves its accepted hash`);
}

// ----------------------------------------------------------------------------
// SUITE 7: Historical Manifest Preservation
// ----------------------------------------------------------------------------
const historicalHandoff = read('docs/development/MVP02B_BRANCH_STOCK_ATTENTION_LOCAL_HANDOFF_2026-10-28.sha256');
assert(hash(historicalHandoff) === '36455dc073cbd3dcc8805e4c105fdb06dbc245a1205b7aadbef34e348fae2ca5', 'MVP02B historical handoff manifest is preserved');

console.log(`Server-authoritative entitlement wiring assertions: ${passed} passed`);
