import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseAcceptanceTarget, verifyAcceptanceTarget } from './target-guard.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const SUPPORTED_JWT_ALGORITHMS = new Set(['HS256', 'RS256', 'ES256']);
const MAX_ACTOR_TOKEN_LIFETIME_SECONDS = 15 * 60;
const HTTP_TIMEOUT_MS = 10_000;
const tenantA = 'b1000000-0000-4000-8000-000000000001';
const users = {
  owner: 'b3000000-0000-4000-8000-000000000001',
  manager: 'b3000000-0000-4000-8000-000000000002',
  pharmacist: 'b3000000-0000-4000-8000-000000000003',
  cashierA: 'b3000000-0000-4000-8000-000000000004',
  cashierB: 'b3000000-0000-4000-8000-000000000005',
  inactive: 'b3000000-0000-4000-8000-000000000006',
  tenantB: 'b3000000-0000-4000-8000-000000000007',
  cashierC: 'b3000000-0000-4000-8000-000000000008',
};
const operations = {
  saleA: 'ba000000-0000-4000-8000-000000000001',
  saleB: 'ba000000-0000-4000-8000-000000000002',
  returnV1: 'ba000000-0000-4000-8000-000000000003',
  returnV2: 'ba000000-0000-4000-8000-000000000004',
  journalOnly: 'ba000000-0000-4000-8000-000000000005',
  legacy: 'ba000000-0000-4000-8000-000000000006',
  absent: 'ba000000-0000-4000-8000-000000000099',
};
const tokenSpecs = {
  owner: ['PF_STATUS_V2_TOKEN_OWNER_A', users.owner],
  manager: ['PF_STATUS_V2_TOKEN_MANAGER_A', users.manager],
  pharmacist: ['PF_STATUS_V2_TOKEN_PHARMACIST_A', users.pharmacist],
  cashierA: ['PF_STATUS_V2_TOKEN_CASHIER_A', users.cashierA],
  cashierB: ['PF_STATUS_V2_TOKEN_CASHIER_B', users.cashierB],
  inactive: ['PF_STATUS_V2_TOKEN_INACTIVE_A', users.inactive],
  tenantB: ['PF_STATUS_V2_TOKEN_CASHIER_TENANT_B', users.tenantB],
  cashierC: ['PF_STATUS_V2_TOKEN_CASHIER_C', users.cashierC],
};

const required = (env, key) => {
  const value = env[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`ABORT: ${key} is required before external access.`);
  return value.trim();
};
const decodePart = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
const decodeJwt = (token, label) => {
  if (/^(?:sb_secret_|sb_service_role_)/i.test(token)) throw new Error(`ABORT: ${label} uses a prohibited secret/service credential format.`);
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error(`ABORT: ${label} is not a supported JWT credential.`);
  try {
    const header = decodePart(parts[0]);
    const claims = decodePart(parts[1]);
    if (header.typ !== 'JWT' || !SUPPORTED_JWT_ALGORITHMS.has(header.alg)) throw new Error('unsupported header');
    return { header, claims, provenance: 'DECODED_UNVERIFIED_PREFLIGHT' };
  } catch {
    throw new Error(`ABORT: ${label} has malformed or unsupported decoded JWT content.`);
  }
};

const validateTemporalClaims = (claims, nowSeconds, maxLifetimeSeconds = null) => {
  if (!Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp)
      || claims.iat > nowSeconds + 30 || claims.exp <= nowSeconds + 60
      || (Number.isFinite(claims.nbf) && claims.nbf > nowSeconds + 30)
      || (maxLifetimeSeconds !== null && claims.exp - claims.iat > maxLifetimeSeconds)) {
    throw new Error('ABORT: a status-v2 credential is not within its approved lifetime.');
  }
};

export function validateAccessToken(token, expectedSub, expectedIssuer, expectedTargetId, nowSeconds = Math.floor(Date.now() / 1000)) {
  const decoded = decodeJwt(token, 'status-v2 access token');
  const claims = decoded.claims;
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!UUID.test(claims.sub ?? '') || claims.sub !== expectedSub || claims.role !== 'authenticated'
      || !audiences.includes('authenticated') || claims.ref !== expectedTargetId) {
    throw new Error('ABORT: a status-v2 access token has the wrong subject, role, audience, or target binding.');
  }
  if (claims.iss !== expectedIssuer) throw new Error('ABORT: a status-v2 access token has the wrong issuer.');
  validateTemporalClaims(claims, nowSeconds, MAX_ACTOR_TOKEN_LIFETIME_SECONDS);
  return { sub: claims.sub, role: claims.role, aud: claims.aud, iss: claims.iss, ref: claims.ref, iat: claims.iat, exp: claims.exp, claimsProvenance: decoded.provenance, signatureVerified: false };
}

export function validateAnonKey(anonKey, expectedIssuer, expectedTargetId, nowSeconds = Math.floor(Date.now() / 1000)) {
  const decoded = decodeJwt(anonKey, 'acceptance anon key');
  const claims = decoded.claims;
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.role !== 'anon' || !audiences.includes('authenticated') || claims.iss !== expectedIssuer || claims.ref !== expectedTargetId || claims.sub) {
    throw new Error('ABORT: acceptance anon key is not an explicitly supported target-bound anon JWT.');
  }
  validateTemporalClaims(claims, nowSeconds);
  return { role: claims.role, iss: claims.iss, ref: claims.ref, claimsProvenance: decoded.provenance, signatureVerified: false };
}

export function validateInputs(env, target, sourceHashes, nowSeconds) {
  const anonKey = required(env, 'PF_ACCEPTANCE_ANON_KEY');
  const expectedRunnerHash = required(env, 'PF_ACCEPTANCE_APPROVED_STATUS_V2_RUNNER_SHA256').toLowerCase();
  const expectedMigrationHash = required(env, 'PF_ACCEPTANCE_APPROVED_STATUS_V2_MIGRATION_SHA256').toLowerCase();
  if (!SHA256.test(expectedRunnerHash) || !SHA256.test(expectedMigrationHash)
      || sourceHashes.runner !== expectedRunnerHash || sourceHashes.migration !== expectedMigrationHash) {
    throw new Error('ABORT: approved status-v2 source hashes do not match the local execution sources.');
  }
  const issuer = `${target.apiUrl}/auth/v1`;
  const anonPreflight = validateAnonKey(anonKey, issuer, target.targetId, nowSeconds);
  const tokens = {};
  const tokenPreflight = {};
  for (const [name, [envName, subject]] of Object.entries(tokenSpecs)) {
    tokens[name] = required(env, envName);
    tokenPreflight[name] = validateAccessToken(tokens[name], subject, issuer, target.targetId, nowSeconds);
  }
  if (new Set(Object.values(tokens)).size !== Object.keys(tokens).length) throw new Error('ABORT: status-v2 actor tokens must be distinct.');
  return { anonKey, tokens, decodedClaims: { anon: anonPreflight, actors: tokenPreflight }, signatureProvenance: 'NOT_VERIFIED_LOCALLY__FUTURE_GATEWAY_AND_ALTERED_SIGNATURE_CONTROL_REQUIRED' };
}

const evidence = {
  saleA: { outcome: 'CONFIRMED_COMMITTED', operation_kind: 'UNIFIED_SALE_V1', payload_hash: 'a'.repeat(64), sale_id: 'b8000000-0000-4000-8000-000000000001', checkout_intent_id: 'bb000000-0000-4000-8000-000000000011', response_status: 'COMMITTED', record_id: 'b8000000-0000-4000-8000-000000000001', return_id: null, processed_at: '2026-10-23T10:00:01Z' },
  saleB: { outcome: 'CONFIRMED_COMMITTED', operation_kind: 'UNIFIED_SALE_V1', payload_hash: 'b'.repeat(64), sale_id: 'b8000000-0000-4000-8000-000000000002', checkout_intent_id: 'bb000000-0000-4000-8000-000000000012', response_status: 'COMMITTED', record_id: 'b8000000-0000-4000-8000-000000000002', return_id: null, processed_at: '2026-10-23T10:01:01Z' },
  returnV1: { outcome: 'CONFIRMED_COMMITTED', operation_kind: 'SALE_RETURN_V1', payload_hash: 'c'.repeat(64), sale_id: 'b8000000-0000-4000-8000-000000000001', checkout_intent_id: null, response_status: 'COMMITTED', record_id: 'bd000000-0000-4000-8000-000000000001', return_id: 'bd000000-0000-4000-8000-000000000001', processed_at: '2026-10-23T10:02:01Z' },
  returnV2: { outcome: 'CONFIRMED_COMMITTED', operation_kind: 'SALE_RETURN_V2', payload_hash: 'd'.repeat(64), sale_id: 'b8000000-0000-4000-8000-000000000001', checkout_intent_id: null, response_status: 'COMMITTED', record_id: 'bd000000-0000-4000-8000-000000000002', return_id: 'bd000000-0000-4000-8000-000000000002', processed_at: '2026-10-23T10:03:01Z' },
  journalOnly: { outcome: 'CONFLICT', operation_kind: 'UNIFIED_SALE_V1', payload_hash: 'e'.repeat(64), sale_id: null, checkout_intent_id: 'bb000000-0000-4000-8000-000000000099', response_status: 'COMMITTED', record_id: 'b8000000-0000-4000-8000-000000000099', return_id: null, processed_at: '2026-10-23T10:04:01Z' },
  legacy: { outcome: 'UNKNOWN', operation_kind: 'LEGACY_SALE_STOCK', payload_hash: 'f'.repeat(64), sale_id: null, checkout_intent_id: null, response_status: 'COMMITTED', record_id: 'b6000000-0000-4000-8000-000000000001', return_id: null, processed_at: '2026-10-23T10:05:01Z' },
};

export function buildScenarios(tokens) {
  const forbidden = (id, token, operation, anonymous = false) => ({ id, token, operation, expected: { type: 'forbidden', http: anonymous ? 401 : 403, category: anonymous ? 'execute_denied' : 'operation_forbidden' } });
  const allowed = (id, token, operation, expected) => ({ id, token, operation, expected: { type: 'row', ...expected } });
  return [
    forbidden('POSTGREST-A01-anon-present', null, operations.saleA, true), forbidden('POSTGREST-A01-anon-absent', null, operations.absent, true),
    forbidden('POSTGREST-A01-inactive-present', tokens.inactive, operations.saleA), forbidden('POSTGREST-A01-inactive-absent', tokens.inactive, operations.absent),
    forbidden('POSTGREST-A01-tenant-b-present', tokens.tenantB, operations.saleA), forbidden('POSTGREST-A01-tenant-b-absent', tokens.tenantB, operations.absent),
    allowed('POSTGREST-A02-owner-sale-b', tokens.owner, operations.saleB, evidence.saleB),
    allowed('POSTGREST-A02-manager-return-v1', tokens.manager, operations.returnV1, evidence.returnV1),
    allowed('POSTGREST-A02-pharmacist-return-v2', tokens.pharmacist, operations.returnV2, evidence.returnV2),
    allowed('POSTGREST-A03-cashier-own-sale', tokens.cashierA, operations.saleA, evidence.saleA),
    forbidden('POSTGREST-A03-cashier-other-sale', tokens.cashierA, operations.saleB),
    allowed('POSTGREST-A04-original-cashier-v1', tokens.cashierA, operations.returnV1, evidence.returnV1),
    allowed('POSTGREST-A04-return-author-v1', tokens.cashierB, operations.returnV1, evidence.returnV1),
    allowed('POSTGREST-A04-original-cashier-v2', tokens.cashierA, operations.returnV2, evidence.returnV2),
    allowed('POSTGREST-A04-return-author-v2', tokens.cashierB, operations.returnV2, evidence.returnV2),
    forbidden('POSTGREST-A04-unrelated-v1', tokens.cashierC, operations.returnV1), forbidden('POSTGREST-A04-unrelated-v2', tokens.cashierC, operations.returnV2),
    allowed('POSTGREST-A05-journal-only-actor', tokens.cashierA, operations.journalOnly, evidence.journalOnly),
    allowed('POSTGREST-A05-journal-only-owner', tokens.owner, operations.journalOnly, evidence.journalOnly),
    allowed('POSTGREST-A06-legacy-actor', tokens.cashierA, operations.legacy, evidence.legacy),
    allowed('POSTGREST-A06-legacy-owner', tokens.owner, operations.legacy, evidence.legacy),
    forbidden('POSTGREST-A06-legacy-unrelated', tokens.cashierC, operations.legacy),
    allowed('POSTGREST-A07-authorized-absence', tokens.cashierA, operations.absent, { outcome: 'CONFIRMED_ABSENT', operation_kind: 'UNKNOWN', response_status: 'AUTHORIZED_ABSENCE', absence: true }),
  ];
}

const parseJson = (text) => { try { return text ? JSON.parse(text) : null; } catch { throw new Error('Status-v2 PostgREST returned a non-JSON body.'); } };
export async function invokeStatus(fetchImpl, apiUrl, anonKey, scenario, timeoutMs = HTTP_TIMEOUT_MS) {
  const headers = { apikey: anonKey, 'Content-Type': 'application/json', Accept: 'application/vnd.pgrst.object+json' };
  if (scenario.token) headers.Authorization = `Bearer ${scenario.token}`;
  const endpoint = `${apiUrl}/rest/v1/rpc/rpc_get_client_op_status_v2`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Status-v2 PostgREST request timed out after ${timeoutMs}ms.`)), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, { method: 'POST', headers, redirect: 'error', signal: controller.signal, body: JSON.stringify({ p_pharmacy_id: tenantA, p_client_op_id: scenario.operation }) });
    if (response.redirected || (response.url && response.url !== endpoint)) throw new Error('Status-v2 PostgREST escaped the approved origin/path.');
    return { http: response.status, body: parseJson(await response.text()) };
  } finally {
    clearTimeout(timeout);
  }
}

const classifyError = (body) => body?.code === '42501' && body?.message === 'OPERATION_STATUS_FORBIDDEN'
  ? 'operation_forbidden'
  : body?.code === '42501' && /^permission denied for function rpc_get_client_op_status_v2$/i.test(body?.message ?? '') ? 'execute_denied' : 'unexpected';
export function assertScenario(scenario, actual) {
  const expected = scenario.expected;
  if (expected.type === 'forbidden') {
    const category = classifyError(actual.body);
    if (actual.http !== expected.http || category !== expected.category || actual.body?.details != null || actual.body?.hint != null) throw new Error(`${scenario.id}: expected ${expected.http}/${expected.category}, received ${actual.http}/${category}.`);
    return { id: scenario.id, pass: true, http: actual.http, error_code: actual.body.code, category };
  }
  const row = actual.body;
  if (actual.http !== 200 || !row || Array.isArray(row) || typeof row !== 'object'
      || row.pharmacy_id !== tenantA || row.client_op_id !== scenario.operation) throw new Error(`${scenario.id}: response status or identity mismatch.`);
  for (const [key, value] of Object.entries(expected)) {
    if (key === 'processed_at') {
      if (typeof row.processed_at !== 'string' || Number.isNaN(Date.parse(row.processed_at)) || Date.parse(row.processed_at) !== Date.parse(value)) throw new Error(`${scenario.id}: processed_at mismatch.`);
    } else if (key !== 'type' && key !== 'absence' && row[key] !== value) throw new Error(`${scenario.id}: ${key} mismatch.`);
  }
  if (row.outcome === 'CONFIRMED_COMMITTED') {
    if (!row.response_payload || row.response_payload.operation_status !== 'COMMITTED' || row.response_payload.client_op_id !== scenario.operation) {
      throw new Error(`${scenario.id}: committed response provenance mismatch.`);
    }
    const effectId = row.operation_kind === 'UNIFIED_SALE_V1' ? row.response_payload.sale_id : row.response_payload.return_id;
    if (effectId !== row.record_id) throw new Error(`${scenario.id}: committed effect identity mismatch.`);
    if (row.operation_kind === 'UNIFIED_SALE_V1' && (row.response_payload.checkout_intent_id !== row.checkout_intent_id || row.response_payload.sale_id !== row.sale_id)) {
      throw new Error(`${scenario.id}: sale/checkout response provenance mismatch.`);
    }
    if (row.operation_kind.startsWith('SALE_RETURN_') && (row.response_payload.return_id !== row.return_id || row.response_payload.sale_id !== row.sale_id)) {
      throw new Error(`${scenario.id}: return/sale response provenance mismatch.`);
    }
    if (row.operation_kind === 'SALE_RETURN_V1' && (typeof row.response_payload.processed_at !== 'string'
        || Date.parse(row.response_payload.processed_at) !== Date.parse(row.processed_at))) throw new Error(`${scenario.id}: nested return timestamp mismatch.`);
  } else if (!expected.absence) {
    if (!row.response_payload || typeof row.response_payload !== 'object' || Array.isArray(row.response_payload)) throw new Error(`${scenario.id}: non-success evidence payload is malformed.`);
    if (row.operation_kind === 'UNIFIED_SALE_V1' && (row.response_payload.sale_id !== row.record_id || row.response_payload.checkout_intent_id !== row.checkout_intent_id)) throw new Error(`${scenario.id}: conflicting sale evidence identity mismatch.`);
    if (row.operation_kind === 'LEGACY_SALE_STOCK' && Object.keys(row.response_payload).length !== 0) throw new Error(`${scenario.id}: legacy evidence unexpectedly disclosed effect provenance.`);
  }
  if (expected.absence) {
    for (const key of ['payload_hash', 'sale_id', 'checkout_intent_id', 'response_payload', 'processed_at', 'record_id', 'return_id']) {
      if (row[key] !== null) throw new Error(`${scenario.id}: authorized absence disclosed ${key}.`);
    }
  }
  return { id: scenario.id, pass: true, http: actual.http, outcome: row.outcome, operation_kind: row.operation_kind };
}

export async function runStatusV2Postgrest({ env = process.env, exec = execFileSync, fetchImpl = fetch, nowSeconds } = {}) {
  const target = parseAcceptanceTarget(env);
  const runnerPath = fileURLToPath(import.meta.url);
  const migrationPath = fileURLToPath(new URL('../../supabase/migrations/20261014000026_client_operation_status_v2.sql', import.meta.url));
  const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
  const credentials = validateInputs(env, target, { runner: digest(runnerPath), migration: digest(migrationPath) }, nowSeconds);
  verifyAcceptanceTarget(target, exec);
  const scenarios = buildScenarios(credentials.tokens);
  const results = [];
  for (const scenario of scenarios) results.push(assertScenario(scenario, await invokeStatus(fetchImpl, target.apiUrl, credentials.anonKey, scenario)));
  const pairs = [['anonymous', results[0], results[1]], ['inactive', results[2], results[3]], ['cross_tenant', results[4], results[5]]];
  for (const [name, present, absent] of pairs) {
    if (present.http !== absent.http || present.error_code !== absent.error_code || present.category !== absent.category) throw new Error(`${name}: present and absent denials are distinguishable.`);
  }
  return { pass: true, evidence_class: 'REAL-POSTGREST AUTH/RLS/GRANT', target_id: target.targetId, scenarios: results };
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  const report = await runStatusV2Postgrest();
  console.log(JSON.stringify(report));
}
