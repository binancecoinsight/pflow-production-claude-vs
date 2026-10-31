import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

let passed = 0;
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
};
const read = (path) => readFileSync(path, 'utf8');
const hash = (path) => createHash('sha256').update(read(path)).digest('hex');

const service = read('src/lib/inventory/service.ts');
const validation = read('src/lib/inventory/validation.ts');
const integration = read('src/lib/inventory/inventoryWorkflowIntegration.test.ts');
const responseContracts = read('src/lib/inventory/inventoryMutationResponseContracts.test.ts');
const sync = read('src/lib/inventory/sync.ts');

for (const signature of [
  "client.rpc('rpc_receive_inventory_stock'",
  "client.rpc('rpc_adjust_inventory_stock'",
  "client.rpc('rpc_dispatch_stock_transfer'",
  "client.rpc('rpc_receive_stock_transfer'",
]) assert(service.includes(signature), `${signature} remains the production RPC boundary`);

assert(service.includes('isNonNegativeSafeInteger(row.total_items)'), 'mutation result counts require safe integers');
assert(service.includes('isValidRpcTimestamp(row.processed_at)'), 'intake result timestamp is validated');
assert(service.includes("row.status !== 'DISPATCHED' && row.status !== 'RECEIVED'"), 'dispatch accepts only sealed fresh and lifecycle-advanced replay statuses');
assert(service.includes("row.status !== 'RECEIVED'"), 'receive response status fails closed');
assert(!service.includes("status: row.status || 'DISPATCHED'"), 'dispatch evidence is not defaulted');
assert(!service.includes('Number(row.previous_quantity)'), 'adjustment quantities are not coerced');
assert(service.includes('row.total_cost !== calculatedTotal'), 'intake total cost must match sealed arithmetic');
assert(service.includes('row.adjustment_quantity !== expectedDelta'), 'adjustment signed delta must match the request direction');
assert(service.includes('data.length === 1 ? data[0] : null'), 'RPC table response cardinality must be exactly one when returned as an array');
assert(validation.includes('Duplicate product id:'), 'snapshot rejects duplicate product identities');
assert(validation.includes('Duplicate batch id:'), 'snapshot rejects duplicate batch identities');
assert(validation.includes('quantity must be a safe integer'), 'snapshot rejects unsafe batch quantities');
assert(validation.includes('outside the snapshot'), 'snapshot rejects orphan batch product associations');
assert(sync.includes('pharmacy_id: p.pharmacy_id'), 'snapshot mapping preserves product tenant evidence for validation');
assert(sync.includes('pharmacy_id: b.pharmacy_id'), 'snapshot mapping preserves batch tenant evidence for validation');

for (const phrase of [
  'missing batch evidence remains unknown rather than zero',
  'invalid dates make expiry evidence unavailable',
  'workspace switching suppresses stale product-detail publication',
  'malformed RPC success rows fail closed without coercion',
  'overlapping refresh requests share one tenant-scoped flight',
  'inventory workflows preserve the complete sync queue item',
]) assert(integration.includes(phrase), `integrated evidence covers: ${phrase}`);

for (const phrase of [
  'dispatch exact replay remains valid after transfer lifecycle advances to RECEIVED',
  'multiple rows',
  'rejection occurs before refresh/publication',
  'intake contract-inconsistent cost arithmetic',
  'adjustment inconsistent arithmetic',
  'receive wrong transfer identity',
]) assert(responseContracts.includes(phrase), `response-contract matrix covers: ${phrase}`);

const preserved = new Map([
  ['src/lib/inventory/expiry.ts', '7fb287f2c76daece42242f8caec10c2da586283ab7a9304f9d4fc3f60cd73470'],
  ['src/lib/inventory/stockAttention.ts', 'd26b3fbaf814c185f92ba1c724a670f1d6b13d245ee63e0130b62defc2aad6e4'],
  ['src/lib/inventory/expiryAttention.ts', 'f739830808c633cfea9b7b75cf5525a79020bc30943436ea9cadb99251d1146c'],
  ['src/lib/inventory/productDetailLoad.ts', '75ccbcc91c00e81c744600bd97b1b2a082b33621b70ef5316af8b8f2bcf91829'],
  ['src/lib/pos/cart.ts', '9e30054b25420ba5e9fb6582d9441c55c5f158307bb1ea310dcfad3271bc3710'],
  ['src/lib/pos/orchestrator.ts', 'c11edc1c7bbbf91b9326530441af63cdf7f06625d8a0d11cc4ffb45181dd5a6c'],
  ['src/lib/pos/drafts.ts', '9d4dacfa461aaa75db3c433a2bbd17b1fcae138596d802fb2d793ff1efae0f7b'],
  ['src/lib/offline/db.ts', '08370cea83ff2f10824a7fcdbde04fb08596c9a4fafef59e001ddcc0d2264ef1'],
  ['src/components/inventory/InventoryView.tsx', '6e8ca1aed4d4afb296fec31833a04aaae228b75a06bca2b1de6bed8b7943d685'],
  ['src/components/inventory/ProductList.tsx', '6a47c9966dfc9f6ed3d86d6f30f6ee0058686737f958dc6cdfbb3d273ea1b43d'],
]);
for (const [path, expected] of preserved) assert(hash(path) === expected, `${path} preserves its reviewed hash`);
assert(hash('docs/development/MVP02B_RENDERING_BOUNDARY_CORRECTION_PF-SUP-2026-10-28-04.sha256') === '19ca575734b771d4f8600df9b33c6bbb065062f102c5aab45ac299b3f3ad43c5', 'accepted MVP-02B correction manifest is preserved');

const untouchedEntitlementHashes = new Map([
  ['supabase/migrations/20261029000035_server_authoritative_entitlement_v1.sql', '46a285069ea3a29b4e8c73ea3e8148f890b6e692df7581ce9c8ac8ebb5d8fb64'],
  ['src/lib/subscription/capabilities.ts', 'cbbd646821f81d10cd61c8bab828708d2debfcc6b0a7bace9481dd803586d96a'],
  ['src/lib/subscription/lifecycle.ts', '8407064d17eb9e2587a42728f4c581f52625cfe9734e121f954647bbb2cca9ad'],
  ['src/lib/subscription/lifecycle.test.ts', '7aaaefb9a2ab82e2efa38ea9057367a7fece79ded8e11f5ed4517b3b2ce40638'],
  ['src/lib/subscription/capabilityBoundary.ts', 'ebbe8bebc14a16f7ee1e4c0430cb38bf89adaa5ad91afb1b307a61a78cc93692'],
  ['src/lib/subscription/capabilityBoundary.test.ts', '9f2810596edfd547b11824fe44b5193861c249c0da6555f42c4f5dc371702c6a'],
  ['src/lib/subscription/entitlementEnforcement.ts', '10ad05879adcf1604ca95640565fe4f22e74739cecfa354d300c406266461f5c'],
  ['src/lib/subscription/entitlement.test.ts', 'e66a51db1a31c69c4d4284ef8175508749066b7dfe50e3454a5f407cb7ff8410'],
  ['src/lib/subscription/index.ts', '931e6fd7b53ff2bbc4fd4014e109a09f9171f59c92b1756c97ccbfcbd8bccfd0'],
  ['scripts/acceptance/entitlement-wiring.test.mjs', '5ec11c9f1bf718c2c82359f77925b0581e7b3802e20bcd6edb4043dd8eb08bc6'],
  ['scripts/acceptance/tsconfig.entitlement.json', '247a41cd149793dea8390a6dfd33ab5c8fec52d7883008a822b1f8a9d7df1d4b'],
]);
for (const [path, expected] of untouchedEntitlementHashes) {
  assert(hash(path) === expected, `${path} remains byte-preserved outside inventory authorization`);
}

const sealedInventorySqlHashes = new Map([
  ['supabase/migrations/20261006000013_m13_inventory_receiving.sql', '90be244f52dd60028e39d5d9c3ddcac06c8fe7a75fa68fcec2ffa2e337903c7b'],
  ['supabase/migrations/20261007000014_m14_inventory_adjustments.sql', '7267ddcfd355ae930608f39e574fb58a7876aac8aae835e082a86644fa2b8def'],
  ['supabase/migrations/20261007000015_m15_stock_transfers.sql', '1dc28fb8b3f01b08ce662abf709974c60cc11ba7189f2355ddfa09b95e8fc201'],
]);
for (const [path, expected] of sealedInventorySqlHashes) {
  assert(hash(path) === expected, `${path} preserves the inspected sealed RPC contract`);
}

console.log(`MVP-02-CLOSE wiring assertions: ${passed} passed`);
