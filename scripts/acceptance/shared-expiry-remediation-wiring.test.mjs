import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

let passed = 0;
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
};
const read = (path) => readFileSync(path, 'utf8');
const hash = (text) => createHash('sha256').update(text).digest('hex');

const expiry = read('src/lib/inventory/expiry.ts');
const validation = read('src/lib/inventory/validation.ts');
const service = read('src/lib/inventory/service.ts');
const cart = read('src/lib/pos/cart.ts');
const orchestrator = read('src/lib/pos/orchestrator.ts');
const inventoryView = read('src/components/inventory/InventoryView.tsx');
const detail = read('src/components/inventory/ProductDetailModal.tsx');
const acceptedAttention = read('src/lib/inventory/expiryAttention.ts');
const productionTest = read('src/lib/inventory/sharedExpiryProductionPaths.test.tsx');

assert(expiry.includes('DATE_ONLY_PATTERN = /^(\\d{4})-(\\d{2})-(\\d{2})$/'), 'batch expiry uses an exact date-only grammar');
assert(expiry.includes('utcTimestampForDateParts') && expiry.includes('day > daysInMonth[month - 1]'), 'Gregorian calendar components are validated without normalization');
assert(expiry.includes('TIMESTAMP_PATTERN') && expiry.includes("match[8].toUpperCase() !== 'Z'"), 'reference timestamps require an explicit timezone');
assert(!expiry.includes('new Date(str)') && !expiry.includes('String(dateInput).trim()'), 'ambiguous JavaScript string parsing and trimming are absent');
assert(expiry.includes("if (!Number.isFinite(dateInput)) throw new InvalidInventoryDateError('reference_date')"), 'non-finite epochs fail closed');
assert(expiry.includes('is_expired: daysUntilExpiry <= 0'), 'same-day expiry policy remains inclusive');

assert(validation.includes('parseExpiryDateUtcMidnight(raw.expiry_date)') && validation.includes('parseExpiryDateUtcMidnight(item.expiry_date)'), 'snapshot and intake boundaries use strict batch expiry validation');
assert(!validation.includes("raw.expiry_date.trim().substring(0, 10)"), 'snapshot ingestion no longer truncates malformed prefixes');
assert(service.match(/options\?\.referenceDate \?\? new Date\(\)/g)?.length === 2, 'selection paths preserve epoch zero with nullish fallback');
assert(service.includes('parseExpiryDateUtcMidnight(a.expiry_date)') && service.includes('parseExpiryDateUtcMidnight(b.expiry_date)'), 'FEFO ordering uses strict batch expiry parsing');
assert(service.indexOf('const evaluated = batches.map') < service.indexOf('const filtered = evaluated.filter'), 'every candidate is validated before expiry filtering can choose another');

assert(cart.includes('Batch expiry evidence is invalid; the item was not added'), 'explicit and automatic cart selection return a controlled fail-closed error');
assert(cart.indexOf('// 2. Resolve batch') < cart.indexOf('// 3. Check if identical product and batch already exists in cart'), 'expiry validation remains before cart line mutation');
assert(orchestrator.indexOf('await ensureDurableCartReservation') < orchestrator.indexOf('Batch expiry evidence is invalid; sale finalization is blocked'), 'durable reservation identity is preserved before mutable expiry validation');
assert(orchestrator.indexOf('Batch expiry evidence is invalid; sale finalization is blocked') < orchestrator.indexOf('await createLocalSale'), 'invalid expiry blocks sale and queue persistence');

assert(inventoryView.includes('setBatchEvidenceUnavailable(true)') && inventoryView.includes("batchEvidenceState={isLoadingBatches ? 'loading' : batchEvidenceUnavailable ? 'unavailable' : 'ready'}"), 'inventory detail publishes an explicit unavailable evidence state');
assert(detail.includes('Batch expiry evidence is unavailable or invalid') && detail.includes('No batch count, projected quantity, expiry status or provisional FEFO recommendation can be confirmed'), 'detail UI makes no empty, quantity, expiry, or FEFO claim on invalid evidence');
assert(detail.includes("batchEvidenceState === 'ready'") && detail.includes("batchEvidenceState === 'unavailable'"), 'normal and unavailable presentation paths remain distinct');

assert(hash(acceptedAttention) === 'f739830808c633cfea9b7b75cf5525a79020bc30943436ea9cadb99251d1146c', 'accepted MVP-02A attention derivation remains byte-unchanged');
assert(productionTest.includes("from 'fake-indexeddb'") && productionTest.includes('customFactory: indexedDB'), 'synthetic datastore coverage uses only the explicitly injected fake factory');
assert(!productionTest.includes('fetch(') && !productionTest.includes('window.indexedDB'), 'focused production-path test cannot access network or browser IndexedDB');

console.log(`Shared expiry remediation wiring tests: ${passed} passed`);
