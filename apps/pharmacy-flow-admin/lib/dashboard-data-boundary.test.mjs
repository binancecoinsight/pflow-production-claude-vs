import {
  createAdminLoadingState,
  getAdminControlReadiness,
  loadAdminPharmacyData,
} from './admin-data-readiness.ts';

let passed = 0;
let failed = 0;

function assert(condition, description) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${description}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${description}`);
  }
}

const missingClient = await loadAdminPharmacyData(() => null);
assert(missingClient.status === 'error' && missingClient.reason === 'missing_client', 'missing client fails closed');
assert(missingClient.records.length === 0, 'missing client returns no fabricated records');

const rejectedResult = await loadAdminPharmacyData(async () => ({ data: null, error: { message: 'network detail' } }));
assert(rejectedResult.status === 'error' && rejectedResult.reason === 'query_rejected', 'returned query error fails closed');

const thrownResult = await loadAdminPharmacyData(async () => { throw new Error('connection detail'); });
assert(thrownResult.status === 'error' && thrownResult.reason === 'query_rejected', 'thrown query error fails closed');
assert(!('message' in thrownResult) || !thrownResult.message.includes('connection detail'), 'internal query details are not exposed');

const emptyResult = await loadAdminPharmacyData(async () => ({ data: [], error: null }));
assert(emptyResult.status === 'empty', 'successful empty result is distinct from failure');
assert(emptyResult.records.length === 0, 'empty result does not receive demo accounts');

const partialResult = await loadAdminPharmacyData(async () => ({
  data: [
    { id: 'pharmacy-1', name: 'Verified Name', subscription_plan: 'STARTER', created_at: '2026-10-01T00:00:00Z', customer_count: 99 },
    { id: 'pharmacy-2' },
    { name: 'Name Without Identifier' },
  ],
  error: null,
}));
assert(partialResult.status === 'ready' && partialResult.records.length === 3, 'successful partial records remain visible');
if (partialResult.status === 'ready') {
  assert(partialResult.records[0].name === 'Verified Name', 'returned pharmacy name is preserved');
  assert(partialResult.records[1].name === null, 'missing name remains unavailable');
  assert(partialResult.records[2].id === null, 'missing identifier remains unavailable');
  assert(partialResult.records[0].subscriptionPlan === 'STARTER', 'allowlisted subscription plan is preserved');
  assert(partialResult.records[0].createdAt === '2026-10-01T00:00:00Z', 'allowlisted creation evidence is preserved');
  assert(!('customer_count' in partialResult.records[0]), 'non-allowlisted source fields are discarded');
  assert(!('daily_sales' in partialResult.records[0]), 'financial activity is not fabricated as zero');
}

let releaseDelayedQuery;
const delayed = loadAdminPharmacyData(() => new Promise((resolve) => { releaseDelayedQuery = resolve; }));
const beforeRelease = await Promise.race([delayed.then(() => 'resolved'), Promise.resolve('pending')]);
assert(beforeRelease === 'pending', 'delayed query does not report readiness before resolution');
releaseDelayedQuery({ data: [], error: null });
assert((await delayed).status === 'empty', 'delayed query resolves through the same empty state');

const loadingControls = getAdminControlReadiness(createAdminLoadingState());
assert(loadingControls.refreshEnabled === false, 'refresh control is disabled while loading');
assert(loadingControls.operationalMutationsEnabled === false, 'operational mutations are disabled while loading');
assert(getAdminControlReadiness(partialResult).operationalMutationsEnabled === false, 'operational mutations remain disabled even when reads succeed');

console.log(`Admin data readiness: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
