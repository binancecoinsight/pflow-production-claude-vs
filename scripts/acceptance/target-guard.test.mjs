import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAcceptanceTarget, verifyAcceptanceTarget } from './target-guard.mjs';

const base = {
  PF_ACCEPTANCE_TARGET_ID: 'pharmacyflow-mvp-acceptance-20261023',
  PF_ACCEPTANCE_EXPECTED_TARGET_ID: 'pharmacyflow-mvp-acceptance-20261023',
  PF_ACCEPTANCE_DB_CONTAINER: 'supabase_db_pharmacyflow-mvp-acceptance-20261023',
  PF_ACCEPTANCE_EDGE_CONTAINER: 'supabase_edge_runtime_pharmacyflow-mvp-acceptance-20261023',
  PF_ACCEPTANCE_API_CONTAINER: 'supabase_kong_pharmacyflow-mvp-acceptance-20261023',
  PF_ACCEPTANCE_DB_PORT: '56322',
  PF_ACCEPTANCE_EXPECTED_DB_PORT: '56322',
  PF_ACCEPTANCE_API_URL: 'http://127.0.0.1:56321',
  PF_ACCEPTANCE_EXPECTED_API_URL: 'http://127.0.0.1:56321',
};

let externalCalls = 0;
for (const bad of [
  {},
  { ...base, PF_ACCEPTANCE_EXPECTED_TARGET_ID: 'different' },
  { ...base, PF_ACCEPTANCE_DB_CONTAINER: 'supabase_db_other' },
  { ...base, PF_ACCEPTANCE_API_URL: 'http://localhost:56321' },
  { ...base, PF_ACCEPTANCE_DB_PORT: '56323' },
  { ...base, PF_ACCEPTANCE_API_URL: 'http://127.0.0.1:56322' },
  { ...base, PF_ACCEPTANCE_API_URL: 'http://user:secret@127.0.0.1:56321' },
]) {
  assert.throws(() => verifyAcceptanceTarget(parseAcceptanceTarget(bad), () => { externalCalls += 1; return ''; }));
}
assert.equal(externalCalls, 0, 'invalid configuration fails before external inspection');

const target = parseAcceptanceTarget(base);
const fakeExec = (_file, args) => {
  externalCalls += 1;
  if (args[3].includes('Labels')) return JSON.stringify({ 'com.supabase.cli.project': target.targetId });
  if (args[1] === target.dbContainer) return JSON.stringify({ '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: target.dbPort }] });
  return JSON.stringify({ '8000/tcp': [{ HostIp: '127.0.0.1', HostPort: target.apiPort }] });
};
assert.equal(verifyAcceptanceTarget(target, fakeExec), target);
assert.equal(externalCalls, 5, 'database, Edge and API identities plus exact bindings are inspected');

const runners = [
  'scripts/run-refund-v2-local.ps1', 'scripts/run-refund-v2-concurrency.ps1',
  'scripts/run-edge001-disposable.mjs', 'scripts/run-edge002-disposable.mjs', 'scripts/run-edge003-disposable.mjs',
  'scripts/phase-b-acceptance/gate-b-concurrency.ps1',
];
for (const runner of runners) {
  const source = readFileSync(runner, 'utf8');
  assert(!source.includes('pflow-production_claude_vs') && !source.includes('pflow_refund_v2_edge_it') && !source.includes('55322'), `${runner} contains no legacy target routing`);
  assert(source.includes('target-guard'), `${runner} loads the shared target guard`);
}
const concurrencyHarness = readFileSync('scripts/acceptance/concurrency-harness.ps1', 'utf8');
for (const required of ['PF_RESULT', 'pf_acceptance_concurrency_barrier_', 'count(DISTINCT backend_pid)', 'ReadyTimeoutSeconds', 'ContentionTimeoutSeconds', 'CompletionTimeoutSeconds', "wait_event_type='Lock'", "query LIKE '%rpc_%'", 'pg_cancel_backend', 'pg_terminate_backend', 'database sessions remain active', 'obj_description', 'AllowSwappedOutcomes', 'exact outcome-set mismatch']) {
  assert(concurrencyHarness.includes(required), `deterministic concurrency harness contains ${required}`);
}
assert(!concurrencyHarness.includes('overlap=verified'), 'readiness alone cannot be printed as verified overlap');
for (const runner of ['scripts/run-refund-v2-concurrency.ps1', 'scripts/phase-b-acceptance/gate-b-concurrency.ps1']) {
  const source = readFileSync(runner, 'utf8');
  assert(source.includes('concurrency-harness.ps1') && source.includes('Invoke-DeterministicConcurrencyPair'), `${runner} uses the overlap barrier harness`);
  assert(source.includes('AllowSwapped'), `${runner} does not assume which ready backend wins contention`);
  assert(!source.includes('Start-Sleep -Milliseconds 750') && !source.includes('Start-Sleep -Milliseconds 1000'), `${runner} cannot qualify delayed sequential startup`);
}
console.log('Acceptance target guard tests: passed');
