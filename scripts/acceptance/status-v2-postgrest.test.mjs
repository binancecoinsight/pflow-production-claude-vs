import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assertScenario, buildScenarios, invokeStatus, runStatusV2Postgrest, validateAccessToken, validateAnonKey, validateInputs,
} from './status-v2-postgrest.mjs';

const now = 1_800_000_000;
const issuer = 'http://127.0.0.1:56321/auth/v1';
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const targetId = 'pharmacyflow-mvp-acceptance-20261023';
const token = (sub, overrides = {}) => `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub, role: 'authenticated', aud: 'authenticated', iss: issuer, ref: targetId, iat: now - 30, exp: now + 600, ...overrides })}.signature`;
const anonToken = (overrides = {}) => `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role: 'anon', aud: 'authenticated', iss: issuer, ref: targetId, iat: now - 30, exp: now + 3600, ...overrides })}.signature`;
const subjects = {
  owner: 'b3000000-0000-4000-8000-000000000001', manager: 'b3000000-0000-4000-8000-000000000002', pharmacist: 'b3000000-0000-4000-8000-000000000003',
  cashierA: 'b3000000-0000-4000-8000-000000000004', cashierB: 'b3000000-0000-4000-8000-000000000005', inactive: 'b3000000-0000-4000-8000-000000000006',
  tenantB: 'b3000000-0000-4000-8000-000000000007', cashierC: 'b3000000-0000-4000-8000-000000000008',
};

assert.equal(validateAccessToken(token(subjects.owner), subjects.owner, issuer, targetId, now).sub, subjects.owner);
assert.equal(validateAccessToken(token(subjects.owner), subjects.owner, issuer, targetId, now).signatureVerified, false);
assert.throws(() => validateAccessToken('opaque', subjects.owner, issuer, targetId, now), /not a supported JWT/);
assert.throws(() => validateAccessToken(token(subjects.owner, { exp: now }), subjects.owner, issuer, targetId, now), /approved lifetime/);
assert.throws(() => validateAccessToken(token(subjects.owner, { exp: now + 901 }), subjects.owner, issuer, targetId, now), /approved lifetime/);
assert.throws(() => validateAccessToken(token(subjects.owner), subjects.manager, issuer, targetId, now), /wrong subject/);
assert.equal(validateAnonKey(anonToken(), issuer, targetId, now).claimsProvenance, 'DECODED_UNVERIFIED_PREFLIGHT');
assert.throws(() => validateAnonKey(token(subjects.owner, { role: 'service_role' }), issuer, targetId, now), /target-bound anon/);
assert.throws(() => validateAnonKey('sb_secret_not_allowed', issuer, targetId, now), /prohibited secret/);
assert.throws(() => validateAnonKey(anonToken({ ref: 'other-target' }), issuer, targetId, now), /target-bound anon/);

const target = { apiUrl: 'http://127.0.0.1:56321', targetId };
const hash = 'a'.repeat(64);
const env = {
  PF_ACCEPTANCE_ANON_KEY: anonToken(),
  PF_ACCEPTANCE_APPROVED_STATUS_V2_RUNNER_SHA256: hash,
  PF_ACCEPTANCE_APPROVED_STATUS_V2_MIGRATION_SHA256: hash,
  PF_STATUS_V2_TOKEN_OWNER_A: token(subjects.owner), PF_STATUS_V2_TOKEN_MANAGER_A: token(subjects.manager),
  PF_STATUS_V2_TOKEN_PHARMACIST_A: token(subjects.pharmacist), PF_STATUS_V2_TOKEN_CASHIER_A: token(subjects.cashierA),
  PF_STATUS_V2_TOKEN_CASHIER_B: token(subjects.cashierB), PF_STATUS_V2_TOKEN_INACTIVE_A: token(subjects.inactive),
  PF_STATUS_V2_TOKEN_CASHIER_TENANT_B: token(subjects.tenantB), PF_STATUS_V2_TOKEN_CASHIER_C: token(subjects.cashierC),
};
const validated = validateInputs(env, target, { runner: hash, migration: hash }, now);
assert.equal(Object.keys(validated.tokens).length, 8);
assert.throws(() => validateInputs({ ...env, PF_STATUS_V2_TOKEN_CASHIER_C: env.PF_STATUS_V2_TOKEN_CASHIER_A }, target, { runner: hash, migration: hash }, now), /wrong subject/);
assert.throws(() => validateInputs(env, target, { runner: 'b'.repeat(64), migration: hash }, now), /source hashes/);

const scenarios = buildScenarios(validated.tokens);
assert.equal(scenarios.length, 23);
assert.deepEqual(assertScenario(scenarios[0], { http: 401, body: { code: '42501', message: 'permission denied for function rpc_get_client_op_status_v2' } }), {
  id: 'POSTGREST-A01-anon-present', pass: true, http: 401, error_code: '42501', category: 'execute_denied',
});
assert.equal(assertScenario(scenarios[3], { http: 403, body: { code: '42501', message: 'OPERATION_STATUS_FORBIDDEN' } }).category, 'operation_forbidden');
assert.throws(() => assertScenario(scenarios[3], { http: 403, body: { code: '42501', message: 'different' } }), /unexpected/);

const ownSale = scenarios.find((scenario) => scenario.id === 'POSTGREST-A03-cashier-own-sale');
const ownSaleBody = {
  pharmacy_id: 'b1000000-0000-4000-8000-000000000001', client_op_id: ownSale.operation,
  outcome: 'CONFIRMED_COMMITTED', operation_kind: 'UNIFIED_SALE_V1', payload_hash: 'a'.repeat(64),
  sale_id: 'b8000000-0000-4000-8000-000000000001', checkout_intent_id: 'bb000000-0000-4000-8000-000000000011',
  response_status: 'COMMITTED', processed_at: '2026-10-23T10:00:01+00:00',
  record_id: 'b8000000-0000-4000-8000-000000000001', return_id: null,
  response_payload: { operation_status: 'COMMITTED', client_op_id: ownSale.operation, sale_id: 'b8000000-0000-4000-8000-000000000001', checkout_intent_id: 'bb000000-0000-4000-8000-000000000011' },
};
assert.equal(assertScenario(ownSale, { http: 200, body: ownSaleBody }).outcome, 'CONFIRMED_COMMITTED');
assert.throws(() => assertScenario(ownSale, { http: 200, body: { ...ownSaleBody, response_payload: { ...ownSaleBody.response_payload, sale_id: subjects.owner } } }), /effect identity/);

const incomplete = scenarios.find((scenario) => scenario.id === 'POSTGREST-A05-journal-only-actor');
assert.equal(assertScenario(incomplete, { http: 200, body: {
  pharmacy_id: 'b1000000-0000-4000-8000-000000000001', client_op_id: incomplete.operation,
  outcome: 'CONFLICT', operation_kind: 'UNIFIED_SALE_V1', payload_hash: 'e'.repeat(64),
  sale_id: null, checkout_intent_id: 'bb000000-0000-4000-8000-000000000099', response_status: 'COMMITTED', processed_at: '2026-10-23T10:04:01Z', return_id: null,
  record_id: 'b8000000-0000-4000-8000-000000000099', response_payload: { operation_status: 'COMMITTED', sale_id: 'b8000000-0000-4000-8000-000000000099', checkout_intent_id: 'bb000000-0000-4000-8000-000000000099' },
} }).outcome, 'CONFLICT');

const absence = scenarios.at(-1);
const absenceBody = {
  pharmacy_id: 'b1000000-0000-4000-8000-000000000001', client_op_id: absence.operation,
  outcome: 'CONFIRMED_ABSENT', operation_kind: 'UNKNOWN', response_status: 'AUTHORIZED_ABSENCE', payload_hash: null, sale_id: null,
  checkout_intent_id: null, response_payload: null, processed_at: null, record_id: null, return_id: null,
};
assert.equal(assertScenario(absence, { http: 200, body: absenceBody }).outcome, 'CONFIRMED_ABSENT');
assert.throws(() => assertScenario(absence, { http: 200, body: { ...absenceBody, sale_id: subjects.owner } }), /disclosed sale_id/);
assert.throws(() => assertScenario(ownSale, { http: 200, body: { ...ownSaleBody, record_id: subjects.owner } }), /record_id mismatch/);
assert.throws(() => assertScenario(ownSale, { http: 200, body: { ...ownSaleBody, processed_at: 'not-a-date' } }), /processed_at mismatch/);
assert.throws(() => assertScenario(ownSale, { http: 200, body: { ...ownSaleBody, response_payload: { ...ownSaleBody.response_payload, checkout_intent_id: subjects.owner } } }), /sale\/checkout response provenance/);
assert.throws(() => assertScenario(ownSale, { http: 200, body: null }), /response status or identity/);

const returnV1 = scenarios.find((scenario) => scenario.id === 'POSTGREST-A02-manager-return-v1');
const returnBody = {
  pharmacy_id: 'b1000000-0000-4000-8000-000000000001', client_op_id: returnV1.operation,
  outcome: 'CONFIRMED_COMMITTED', operation_kind: 'SALE_RETURN_V1', payload_hash: 'c'.repeat(64),
  sale_id: 'b8000000-0000-4000-8000-000000000001', checkout_intent_id: null, response_status: 'COMMITTED',
  record_id: 'bd000000-0000-4000-8000-000000000001', return_id: 'bd000000-0000-4000-8000-000000000001', processed_at: '2026-10-23T10:02:01Z',
  response_payload: { operation_status: 'COMMITTED', client_op_id: returnV1.operation, return_id: 'bd000000-0000-4000-8000-000000000001', sale_id: 'b8000000-0000-4000-8000-000000000001', processed_at: '2026-10-23T10:02:01Z' },
};
assert.equal(assertScenario(returnV1, { http: 200, body: returnBody }).outcome, 'CONFIRMED_COMMITTED');
assert.throws(() => assertScenario(returnV1, { http: 200, body: { ...returnBody, response_payload: { ...returnBody.response_payload, sale_id: subjects.owner } } }), /return\/sale response provenance/);
assert.throws(() => assertScenario(returnV1, { http: 200, body: { ...returnBody, response_payload: { ...returnBody.response_payload, processed_at: null } } }), /nested return timestamp/);

let captured;
await invokeStatus(async (url, options) => {
  captured = { url, options };
  return { status: 401, text: async () => '{"code":"42501","message":"permission denied for function rpc_get_client_op_status_v2"}' };
}, target.apiUrl, 'anon', scenarios[0]);
assert.equal(captured.url, 'http://127.0.0.1:56321/rest/v1/rpc/rpc_get_client_op_status_v2');
assert.equal(captured.options.headers.Authorization, undefined);
await invokeStatus(async (_url, options) => {
  captured = { options };
  return { status: 403, text: async () => '{"code":"42501","message":"OPERATION_STATUS_FORBIDDEN"}' };
}, target.apiUrl, 'anon', scenarios[3]);
assert.equal(captured.options.headers.Authorization, `Bearer ${scenarios[3].token}`);
assert.equal(captured.options.redirect, 'error');
assert(captured.options.signal instanceof AbortSignal, 'bounded request supplies an abort signal');
await assert.rejects(invokeStatus(async (url) => ({ status: 200, redirected: true, url: `${url}/redirected`, text: async () => '{}' }), target.apiUrl, 'anon', scenarios[0]), /escaped/);
await assert.rejects(invokeStatus(async (_url, options) => new Promise((_resolve, reject) => {
  options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
}), target.apiUrl, 'anon', scenarios[0], 1), /timed out/);

const responseFor = (scenario) => {
  if (scenario.expected.type === 'forbidden') return {
    status: scenario.expected.http,
    body: scenario.expected.category === 'execute_denied'
      ? { code: '42501', details: null, hint: null, message: 'permission denied for function rpc_get_client_op_status_v2' }
      : { code: '42501', details: null, hint: null, message: 'OPERATION_STATUS_FORBIDDEN' },
  };
  const expected = scenario.expected;
  const body = { pharmacy_id: 'b1000000-0000-4000-8000-000000000001', client_op_id: scenario.operation };
  for (const [key, value] of Object.entries(expected)) if (!['type', 'absence'].includes(key)) body[key] = value;
  if (expected.absence) Object.assign(body, { payload_hash: null, sale_id: null, checkout_intent_id: null, response_payload: null, processed_at: null, record_id: null, return_id: null });
  else if (expected.outcome === 'CONFIRMED_COMMITTED' && expected.operation_kind === 'UNIFIED_SALE_V1') body.response_payload = { operation_status: 'COMMITTED', client_op_id: scenario.operation, sale_id: expected.sale_id, checkout_intent_id: expected.checkout_intent_id };
  else if (expected.outcome === 'CONFIRMED_COMMITTED') body.response_payload = { operation_status: 'COMMITTED', client_op_id: scenario.operation, return_id: expected.return_id, sale_id: expected.sale_id, ...(expected.operation_kind === 'SALE_RETURN_V1' ? { processed_at: expected.processed_at } : {}) };
  else if (expected.operation_kind === 'UNIFIED_SALE_V1') body.response_payload = { operation_status: 'COMMITTED', client_op_id: scenario.operation, sale_id: expected.record_id, checkout_intent_id: expected.checkout_intent_id };
  else body.response_payload = {};
  return { status: 200, body };
};

const runnerPath = fileURLToPath(new URL('./status-v2-postgrest.mjs', import.meta.url));
const migrationPath = fileURLToPath(new URL('../../supabase/migrations/20261014000026_client_operation_status_v2.sql', import.meta.url));
const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const orchestrationEnv = {
  PF_ACCEPTANCE_TARGET_ID: targetId, PF_ACCEPTANCE_EXPECTED_TARGET_ID: targetId,
  PF_ACCEPTANCE_DB_CONTAINER: `supabase_db_${targetId}`, PF_ACCEPTANCE_EDGE_CONTAINER: `supabase_edge_runtime_${targetId}`,
  PF_ACCEPTANCE_API_CONTAINER: `supabase_kong_${targetId}`, PF_ACCEPTANCE_DB_PORT: '56322', PF_ACCEPTANCE_EXPECTED_DB_PORT: '56322',
  PF_ACCEPTANCE_API_URL: target.apiUrl, PF_ACCEPTANCE_EXPECTED_API_URL: target.apiUrl,
  ...env, PF_ACCEPTANCE_APPROVED_STATUS_V2_RUNNER_SHA256: digest(runnerPath), PF_ACCEPTANCE_APPROVED_STATUS_V2_MIGRATION_SHA256: digest(migrationPath),
};
const injectedScenarios = buildScenarios(validateInputs(orchestrationEnv, target, { runner: digest(runnerPath), migration: digest(migrationPath) }, now).tokens);
const responses = new Map(injectedScenarios.map((scenario) => [`${scenario.token ?? 'anonymous'}|${scenario.operation}`, responseFor(scenario)]));
const injected = await runStatusV2Postgrest({
  env: orchestrationEnv,
  nowSeconds: now,
  exec: (_file, args) => {
    const name = args[1]; const format = args[3];
    if (format.includes('.Config.Labels')) return JSON.stringify({ 'com.supabase.cli.project': targetId });
    if (name === `supabase_db_${targetId}`) return JSON.stringify({ '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '56322' }] });
    return JSON.stringify({ '8000/tcp': [{ HostIp: '127.0.0.1', HostPort: '56321' }] });
  },
  fetchImpl: async (url, options) => {
    const request = JSON.parse(options.body);
    const key = `${options.headers.Authorization?.slice(7) ?? 'anonymous'}|${request.p_client_op_id}`;
    const response = responses.get(key);
    if (!response) throw new Error('unexpected injected request');
    return { status: response.status, redirected: false, url, text: async () => JSON.stringify(response.body) };
  },
});
assert(injected.pass && injected.scenarios.length === 23 && injected.scenarios.every((row) => row.pass), 'all 23 injected orchestration scenarios pass');

let externalCalls = 0;
await assert.rejects(runStatusV2Postgrest({
  env: {
    PF_ACCEPTANCE_TARGET_ID: 'pharmacyflow-mvp-acceptance-20261023', PF_ACCEPTANCE_EXPECTED_TARGET_ID: 'pharmacyflow-mvp-acceptance-20261023',
    PF_ACCEPTANCE_DB_CONTAINER: 'supabase_db_pharmacyflow-mvp-acceptance-20261023', PF_ACCEPTANCE_EDGE_CONTAINER: 'supabase_edge_runtime_pharmacyflow-mvp-acceptance-20261023',
    PF_ACCEPTANCE_API_CONTAINER: 'supabase_kong_pharmacyflow-mvp-acceptance-20261023', PF_ACCEPTANCE_DB_PORT: '56322', PF_ACCEPTANCE_EXPECTED_DB_PORT: '56322',
    PF_ACCEPTANCE_API_URL: target.apiUrl, PF_ACCEPTANCE_EXPECTED_API_URL: target.apiUrl,
    ...env, PF_ACCEPTANCE_APPROVED_STATUS_V2_RUNNER_SHA256: '0'.repeat(64),
  },
  exec: () => { externalCalls += 1; throw new Error('must not inspect'); },
  fetchImpl: async () => { externalCalls += 1; throw new Error('must not fetch'); },
  nowSeconds: now,
}), /source hashes/);
await assert.rejects(runStatusV2Postgrest({
  env: { ...orchestrationEnv, PF_ACCEPTANCE_ANON_KEY: token(subjects.owner, { role: 'service_role' }) },
  exec: () => { externalCalls += 1; throw new Error('must not inspect'); }, fetchImpl: async () => { externalCalls += 1; throw new Error('must not fetch'); }, nowSeconds: now,
}), /target-bound anon/);
await assert.rejects(runStatusV2Postgrest({
  env: { ...orchestrationEnv, PF_STATUS_V2_TOKEN_OWNER_A: token(subjects.owner, { exp: now }) },
  exec: () => { externalCalls += 1; throw new Error('must not inspect'); }, fetchImpl: async () => { externalCalls += 1; throw new Error('must not fetch'); }, nowSeconds: now,
}), /approved lifetime/);
assert.equal(externalCalls, 0, 'source, anon-policy and token-lifetime failures abort before Docker inspection or PostgREST access');

console.log('Status-v2 PostgREST runner synthetic tests: 41 assertions passed; injected orchestration 23/23');
