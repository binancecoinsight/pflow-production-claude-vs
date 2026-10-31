import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

let passed = 0;
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
};
const read = (path) => readFileSync(path, 'utf8');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const sharedExpiry = read('src/lib/inventory/expiry.ts');
const policy = read('src/lib/inventory/expiryAttention.ts');
const panel = read('src/components/inventory/ExpiryAttentionPanel.tsx');
const inventory = read('src/components/inventory/InventoryView.tsx');

assert(sha256(sharedExpiry) === '02033d8a21c2d123ef8bc99a002dcd8bd5f748989f9b273434f50131d345a18d', 'shared POS and batch-selection expiry parser remains byte-unchanged');
assert(!policy.includes("from './expiry'"), 'attention policy owns strict calendar parsing without changing shared operational behavior');
assert(policy.includes('day > daysInMonth[month - 1]'), 'strict parser rejects impossible Gregorian dates');
assert(policy.includes('daysUntilExpiry <= 0') && policy.includes('daysUntilExpiry > 90'), 'same-day expired and inclusive 90-day boundary are explicit');
assert(policy.includes("coverage: 'unknown'"), 'invalid or unbound evidence fails closed as unknown');
assert(policy.indexOf('if (!productCollectionValid || !batchCollectionValid || !batchGroupsValid)') < policy.indexOf('for (const product of products)'), 'runtime collections are validated before iteration');
assert(policy.includes('if (!isProductEvidence(product)') && policy.includes('if (!isBatchEvidence(batch))'), 'runtime rows are validated before derivation property access');
assert(policy.includes("batch.pharmacy_id !== binding.pharmacyId") && policy.includes('batch.product_id !== mapProductId'), 'batch tenant and product associations are validated');
assert(policy.includes('batch.branch_id !== binding.branchId'), 'rows are filtered to the current coherent branch');
assert(policy.includes('Number.isInteger(value.projected_stock)'), 'projected quantities require valid integers');
assert(policy.includes('Object.freeze(result.rows.map'), 'derived rows are immutable allowlisted objects');

assert(panel.includes('Cached, projected branch quantities only'), 'panel labels cached projected quantity limitations');
assert(panel.includes('not authoritative stock') && panel.includes('does not confirm that stock is safe to sell'), 'panel makes no authoritative or safe-to-sell claim');
assert(panel.includes('No matching expiry items in the loaded cache') && panel.includes('not confirmation that the branch has no expiry risk'), 'empty state is cache-scoped and non-reassuring');
assert(panel.includes('Partial cache coverage') && panel.includes('search_subset') && panel.includes('product_limit_reached'), 'panel explains search and product-limit coverage gaps');
assert(panel.includes('snapshot_generation_mismatch'), 'panel explains incompatible snapshot-generation evidence');
assert(panel.includes("result.coverage === 'unknown'") && panel.includes('No safety conclusion is available'), 'unknown evidence has a distinct fail-closed view');
assert(panel.indexOf('{loadError ? (') < panel.indexOf(') : isLoading ? ('), 'completed cache-read failure takes precedence over transitional loading');
assert(panel.includes('Server status') && panel.includes('Expiry (time-derived)'), 'server status and time-derived classification remain distinct');
assert(!/cost_price|selling_price|reorder|low.stock/i.test(panel), 'panel does not expose prices or implement low-stock behavior');

assert(inventory.includes('catalogRequestGenerationRef'), 'production cache loader uses a request generation guard');
assert(inventory.includes('catalogRequestGenerationRef.current === requestGeneration'), 'publication requires the current catalog generation');
assert(inventory.indexOf('const fresh = await checkCatalogFreshness(pharmacyId);') < inventory.indexOf('setProducts(prods);'), 'records and freshness resolve before coherent publication');
assert(inventory.includes('loadedCatalogQuery !== searchQuery.trim()'), 'old searched subsets are suppressed during query transitions');
assert(inventory.indexOf('setCatalogReadError(false);') < inventory.indexOf('prods = await searchProducts'), 'retry clears completed read error before awaiting cache access');
assert(inventory.includes('deriveExpiryAttentionWorkspace({'), 'attention binding is derived from the production coherent workspace');
assert(inventory.includes("key={expiryAttentionBinding ? expiryAttentionWorkspaceKey(expiryAttentionBinding) : 'expiry-attention-unavailable'}"), 'panel instance is keyed to the coherent workspace');
assert(inventory.includes('products={products}') && inventory.includes('batchesMap={batchesMap}') && inventory.includes('freshness={freshness}'), 'panel consumes only already-loaded cache and freshness state');
assert(!panel.includes('supabase') && !panel.includes('indexedDB') && !panel.includes('fetch('), 'panel performs no datastore, RPC, or network access');
assert(inventory.includes('<ProductList') && inventory.includes('canSeeCostPrice={canSeeCostPrice}'), 'existing product list and cost visibility wiring remain intact');
assert(inventory.includes('<StockIntakeModal') && inventory.includes('<StockAdjustmentModal') && inventory.includes('<StockTransferDispatchModal'), 'existing inventory mutation controls remain present');

console.log(`Inventory expiry attention wiring tests: ${passed} passed`);
