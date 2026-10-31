import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

let passed = 0;
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
};
const read = (path) => readFileSync(path, 'utf8');
const hash = (text) => createHash('sha256').update(text).digest('hex');

const coordinator = read('src/lib/inventory/productDetailLoad.ts');
const inventoryView = read('src/components/inventory/InventoryView.tsx');
const regression = read('src/lib/inventory/productDetailLoad.test.ts');

assert(coordinator.includes('token.generation !== this.generation'), 'publication requires current request generation');
assert(coordinator.includes('left.workspaceKey === right.workspaceKey'), 'publication requires current coherent workspace');
assert(coordinator.includes('left.pharmacyId === right.pharmacyId'), 'publication requires current pharmacy');
assert(coordinator.includes('left.productId === right.productId'), 'publication requires current selected product');
assert((coordinator.match(/publishIfCurrent\(token, options\.currentBinding/g)?.length ?? 0) >= 5, 'loading, success, invalid evidence, error and finally use the same publication boundary');
assert(coordinator.includes('(batch as Record<string, unknown>).pharmacy_id === binding.pharmacyId'), 'batch pharmacy association is checked before success publication');
assert(coordinator.includes('(batch as Record<string, unknown>).product_id === binding.productId'), 'batch product association is checked before success publication');
assert(coordinator.includes('Object.freeze([...batches])'), 'published evidence is immutable at the coordinator boundary');

assert(inventoryView.includes('await runProductDetailLoad({'), 'InventoryView uses the production coordinator orchestration');
assert(inventoryView.includes('currentBinding: currentProductDetailBinding'), 'InventoryView supplies a live binding getter');
assert(inventoryView.includes('product.pharmacy_id !== workspace.pharmacyId'), 'selected product association fails closed');
assert(inventoryView.includes('productDetailCoordinatorRef.current?.invalidate()'), 'replacement/close/workspace invalidation advances generation');
assert(inventoryView.includes('onClose={invalidateProductDetail}'), 'modal close invalidates pending detail work');
assert(inventoryView.includes('[coherentWorkspaceKey, invalidateProductDetail]'), 'coherent workspace changes invalidate detail work');
assert(inventoryView.includes('productDetailCoordinatorRef.current?.dispose()'), 'unmount permanently disposes pending detail work');
assert(inventoryView.match(/getEligibleBatchesForProduct\(/g)?.length === 1, 'detail correction adds no datastore query');
assert(inventoryView.includes("{ allowExpired: true }"), 'existing detail eligibility query behavior is preserved');
assert(!inventoryView.includes("console.error('[InventoryView] Error reading batches:'"), 'raw detail-read errors are not retained or rendered');

for (const requiredCase of [
  'A resolves before B',
  'B resolves before A',
  'A -> B -> A',
  'stale success',
  'stale failure',
  'Close then reopen',
  'workspace change',
  'Unmount disposal',
  'association fails closed',
]) {
  assert(regression.includes(requiredCase), `deferred regression includes ${requiredCase}`);
}

const preservedHashes = new Map([
  ['src/lib/inventory/expiry.ts', '7fb287f2c76daece42242f8caec10c2da586283ab7a9304f9d4fc3f60cd73470'],
  ['src/lib/inventory/validation.ts', 'dc71cb192fc8044b9f86aa3f3127a7dbc605867ccb424396a97968bd1638a156'],
  ['src/lib/inventory/service.ts', 'e513241b416cd3f6f93f20fbdef69b08316aef2b67b67150973cd05b8247e9ff'],
  ['src/lib/pos/cart.ts', '9e30054b25420ba5e9fb6582d9441c55c5f158307bb1ea310dcfad3271bc3710'],
  ['src/lib/pos/orchestrator.ts', 'c11edc1c7bbbf91b9326530441af63cdf7f06625d8a0d11cc4ffb45181dd5a6c'],
  ['src/components/inventory/ProductDetailModal.tsx', 'fb91eae81b6b4055c6da49629f357a440b9ff7e722062f54acb209ca18a003d7'],
  ['src/lib/inventory/expiryAttention.ts', 'f739830808c633cfea9b7b75cf5525a79020bc30943436ea9cadb99251d1146c'],
]);
for (const [path, expected] of preservedHashes) {
  assert(hash(read(path)) === expected, `${path} preserves its accepted shared-expiry hash`);
}

console.log(`Product-detail publication wiring assertions: ${passed} passed`);
