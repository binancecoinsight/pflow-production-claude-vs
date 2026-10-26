import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let passed = 0;
const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message); passed += 1; };
const throws = (work: () => unknown, pattern: RegExp, message: string) => {
  try { work(); } catch (error) { assert(pattern.test(String(error)), message); return; }
  throw new Error(`Expected rejection: ${message}`);
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sql = readFileSync(resolve(root, 'supabase/migrations/20261025000028_owner_eligibility_issuer_v1.sql'), 'utf8');
const correctionSql = readFileSync(resolve(root, 'supabase/migrations/20261025000029_owner_eligibility_recovery_v1.sql'), 'utf8');
const boundary = readFileSync(resolve(root, 'supabase/functions/owner-eligibility-issuer/index.ts'), 'utf8');
for (const fragment of [
  'CREATE ROLE pharmacyflow_owner_eligibility_issuer NOLOGIN NOINHERIT NOBYPASSRLS',
  'CREATE TABLE public.owner_eligibility_admissions',
  'CREATE TABLE public.owner_eligibility_requests',
  'ISSUANCE_DISABLED: no active manual admission',
  "'PF-OWNER-INTENT-V1'",
  'FOR UPDATE',
  "v_eligibility.state = 'CONSUMED'",
  "SET state='CONSUMED',consumed_response=v_response",
  'FORCE ROW LEVEL SECURITY',
  'FROM PUBLIC, anon, authenticated, service_role',
] as const) assert(sql.includes(fragment), `additive SQL contains reviewed control: ${fragment}`);
assert(!/INSERT INTO public\.owner_eligibility_admissions/i.test(sql), 'manual admission allowlist is empty by default');
assert(!/GRANT EXECUTE ON FUNCTION public\.private_/i.test(sql), 'unresolved gateway receives no issuer function grants');
assert(!/\bBYPASSRLS\b(?!;)/.test(sql.replace(/NOBYPASSRLS/g, '')), 'issuer is not granted global BYPASSRLS');
assert(sql.indexOf('FROM public.owner_eligibility_admissions') < sql.indexOf('INSERT INTO public.owner_eligibility_requests'), 'admission is checked before issuer reservation');
assert(sql.includes("->>'request_id' IS DISTINCT FROM p_request_id::TEXT") && sql.includes("->>'provider_operation_id' IS DISTINCT FROM p_provider_operation_id::TEXT"), 'activation binds both request and provider operation IDs');
assert(!boundary.includes('serve(') && !boundary.includes('createClient(') && !boundary.includes('SUPABASE_'), 'injected boundary contains no production server, client, or environment adapter');
for (const fragment of [
  'pg_advisory_xact_lock(hashtextextended(p_request_id::TEXT, 0))',
  'pg_advisory_xact_lock(hashtextextended(v_email_digest, 1))',
  "MESSAGE = 'OPEN_EMAIL_CONFLICT'",
  "'admission_evidence_id', v_existing.admission_evidence_id",
  'private_get_owner_eligibility_v1',
  'private_recover_confirmed_owner_eligibility_v1',
  "auth.uid() IS DISTINCT FROM p_subject_id",
  "MESSAGE = 'ELIGIBILITY_NOT_RECOVERABLE'",
  "->>'issuer_contract_version' IS DISTINCT FROM 'owner-eligibility-issuer-v1'",
  "->>'owner_contract_version' IS DISTINCT FROM 'owner-onboarding-v1'",
  'DROP POLICY rls_owner_eligibility_onboarding_consume',
] as const) assert(correctionSql.includes(fragment), `forward-only correction contains reviewed control: ${fragment}`);
assert(correctionSql.indexOf('WHERE request_id = p_request_id') < correctionSql.indexOf('FROM public.owner_eligibility_admissions'), 'exact existing reservation is resolved before first-admission lookup');
assert(correctionSql.indexOf('FROM public.owner_eligibility_admissions') < correctionSql.indexOf('INSERT INTO public.owner_eligibility_requests'), 'first reservation still requires active manual admission');
assert(!/GRANT EXECUTE ON FUNCTION public\.private_/i.test(correctionSql), 'correction adds no private gateway execute grant');
assert(correctionSql.includes('FROM PUBLIC, anon, authenticated, service_role'), 'service-role substitution remains explicitly revoked');
assert(!boundary.includes('JSON.stringify'), 'authority comparison is explicit and independent of JSON key order');
assert(boundary.indexOf("['EMAIL_CONFIRMATION_PENDING', 'ACTIVE', 'CONSUMED']") < boundary.indexOf('markAuthCreatePending(bindingOf(reservation))'), 'completed/pending retry returns before Auth-pending transition');
assert(boundary.includes('recoverAuthenticatedByProviderOperation') && boundary.includes('authenticatedSubjectId'), 'confirmed continuation requires an authenticated exact-operation provider contract');

type State = 'ACTIVE' | 'CONSUMED' | 'REVOKED';
type Row = { subject: string; fingerprint: string; operation: string; state: State; response?: Readonly<Record<string, unknown>> };
class SynchronousIssuerModel {
  row: Row;
  effects = { pharmacies: 0, branches: 0, subscriptions: 0, memberships: 0, completions: 0 };
  constructor(row?: Row) { this.row = row || { subject: 'subject-1', fingerprint: 'fp-1', operation: 'op-1', state: 'ACTIVE' }; }
  consume(input: { subject: string; fingerprint: string; markerOperation: string; failAfter?: keyof SynchronousIssuerModel['effects'] }) {
    if (input.subject !== this.row.subject) throw new Error('CROSS_SUBJECT');
    if (input.fingerprint !== this.row.fingerprint) throw new Error('REQUEST_CONFLICT');
    if (input.markerOperation !== this.row.operation) throw new Error('FORGED_METADATA');
    if (this.row.state === 'REVOKED') throw new Error('REVOKED');
    if (this.row.state === 'CONSUMED') return this.row.response;
    const staged = { ...this.effects };
    for (const effect of Object.keys(staged) as Array<keyof typeof staged>) {
      staged[effect] += 1;
      if (input.failAfter === effect) throw new Error(`FAIL_AFTER_${effect}`);
    }
    const response = Object.freeze({ request_id: 'request-1', pharmacy_id: 'pharmacy-1', success: true });
    this.effects = staged; this.row = { ...this.row, state: 'CONSUMED', response };
    return response;
  }
  revoke() { if (this.row.state === 'CONSUMED') throw new Error('TERMINAL'); this.row = { ...this.row, state: 'REVOKED' }; }
  replace() { if (this.row.state === 'CONSUMED') throw new Error('TERMINAL'); this.revoke(); return new SynchronousIssuerModel({ subject: this.row.subject, fingerprint: 'fp-2', operation: 'op-2', state: 'ACTIVE' }); }
}
const valid = { subject: 'subject-1', fingerprint: 'fp-1', markerOperation: 'op-1' };
throws(() => new SynchronousIssuerModel().consume({ ...valid, subject: 'subject-2' }), /CROSS_SUBJECT/, 'cross-subject consumption denied');
throws(() => new SynchronousIssuerModel().consume({ ...valid, fingerprint: 'changed' }), /REQUEST_CONFLICT/, 'changed fingerprint denied');
throws(() => new SynchronousIssuerModel().consume({ ...valid, markerOperation: 'forged' }), /FORGED_METADATA/, 'forged correlated metadata denied');
for (const effect of ['pharmacies', 'branches', 'subscriptions', 'memberships', 'completions'] as const) {
  const model = new SynchronousIssuerModel();
  throws(() => model.consume({ ...valid, failAfter: effect }), /FAIL_AFTER_/, `synthetic failure after ${effect} rolls back`);
  assert(Object.values(model.effects).every((count) => count === 0) && model.row.state === 'ACTIVE', `failure after ${effect} preserves pre-transaction state`);
}
{
  const model = new SynchronousIssuerModel(); const first = model.consume(valid); const replay = model.consume(valid);
  assert(first === replay && model.effects.pharmacies === 1, 'exact CONSUMED replay returns canonical response without new effects');
  throws(() => model.revoke(), /TERMINAL/, 'consume-before-revoke makes revocation lose serialized race');
  throws(() => model.replace(), /TERMINAL/, 'consumed eligibility cannot be replaced');
}
{
  const model = new SynchronousIssuerModel(); model.revoke();
  throws(() => model.consume(valid), /REVOKED/, 'revoke-before-consume makes consumption lose serialized race');
}
{
  const model = new SynchronousIssuerModel(); const replacement = model.replace();
  assert(model.row.state === 'REVOKED' && replacement.row.operation === 'op-2', 'replacement revokes prior row and binds a new operation');
}
const canonical = ['PF-OWNER-INTENT-V1', 'request-1', 'owner@example.test', 'Alpha Pharmacy', 'NGN'].join('\n');
assert(createHash('sha256').update(canonical).digest('hex').length === 64, 'model documents canonical fingerprint shape');
console.log(`owner eligibility static/synchronous tests: ${passed} passed; PostgreSQL concurrency remains unexecuted`);
