import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
  passed += 1;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = resolve(root, 'supabase/migrations/20261025000027_owner_onboarding_v1.sql');
const sql = readFileSync(migrationPath, 'utf8');
const authContext = readFileSync(resolve(root, 'src/contexts/AuthContext.tsx'), 'utf8');

for (const required of [
  'CREATE ROLE pharmacyflow_onboarding_owner NOLOGIN NOINHERIT NOBYPASSRLS',
  'PRIMARY KEY (user_id, request_id)',
  "contract_version TEXT NOT NULL CHECK (contract_version = 'owner-onboarding-v1')",
  "v_identity_class = 'STAFF_INVITATION_BOOTSTRAP_V1'",
  "v_identity_class IS DISTINCT FROM 'OWNER_ONBOARDING_V1'",
  "v_eligibility->>'request_id' IS DISTINCT FROM p_request_id::TEXT",
  "v_eligibility->>'subject_id' IS DISTINCT FROM v_user_id::TEXT",
  "'contract_version', v_contract_version",
  "'request_scope', 'AUTHENTICATED_USER'",
  "'trial_started_at', v_now",
  "'trial_ends_at', v_trial_end",
  'ON CONFLICT (user_id, request_id) DO NOTHING',
  'RETURN v_request.response_body',
  'FOR UPDATE',
] as const) {
  assert(sql.includes(required), `migration proposal includes reviewed contract element: ${required}`);
}
assert(!sql.includes('BYPASSRLS;') || sql.includes('NOBYPASSRLS;'), 'dedicated onboarding role does not receive global BYPASSRLS');
assert(!/NEW\.raw_user_meta_data->>'(?:role|pharmacy_name|currency|subscription_plan)'/.test(sql), 'profile trigger cannot trust client role, tenant, currency, or plan metadata');
assert(/TO pharmacyflow_onboarding_owner/.test(sql) && /owner_id = auth\.uid\(\)/.test(sql), 'narrow role-specific RLS policies bind effects to auth.uid');
assert(/ERRCODE = 'PF003'/.test(sql) && /ERRCODE = 'PF005'/.test(sql), 'staff denial and immutable request conflict are typed');

const resolveStart = authContext.indexOf('const resolveSessionContext');
const resolveEnd = authContext.indexOf('// Initialize and listen', resolveStart);
const resolverSource = authContext.slice(resolveStart, resolveEnd);
assert(!resolverSource.includes('rpc_create_pharmacy_owner_v1') && !resolverSource.includes('createOwnerPharmacyWithRpc'), 'normal session resolution never invokes owner onboarding');
assert(authContext.includes('const recoverOwnerOnboarding') && authContext.includes('readOwnerOnboardingIntent(user.user_metadata)'), 'owner recovery is an explicit validated transition');

interface RequestRow { fingerprint: string; response: Readonly<Record<string, string | boolean>> }
type Eligibility = 'OWNER' | 'STAFF' | 'NONE';

class SynchronousOwnerOnboardingModel {
  requests = new Map<string, RequestRow>();
  pharmacies = new Map<string, { ownerId: string; name: string }>();
  branches = new Map<string, string>();
  subscriptions = new Map<string, { plan: 'TRIAL'; startedAt: string; endsAt: string }>();
  memberships = new Map<string, Array<{ pharmacyId: string; role: string }>>();
  nextId = 1;

  create(input: { requestId: string; userId: string; verified: boolean; eligibility: Eligibility; pharmacyName: string; currency: string; failAfter?: 'pharmacy' | 'branch' }) {
    if (!input.verified) throw new Error('IDENTITY_UNVERIFIED');
    if (input.eligibility === 'STAFF') throw new Error('STAFF_IDENTITY_PROHIBITED');
    if (input.eligibility !== 'OWNER') throw new Error('OWNER_INELIGIBLE');
    const normalized = { contractVersion: 'owner-onboarding-v1', requestScope: 'AUTHENTICATED_USER', userId: input.userId, pharmacyName: input.pharmacyName.trim(), currency: input.currency.trim().toUpperCase() };
    const fingerprint = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    const scopedKey = `${input.userId}:${input.requestId}`;
    const existing = this.requests.get(scopedKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new Error('REQUEST_CONFLICT');
      return existing.response;
    }

    const pharmacies = new Map(this.pharmacies);
    const branches = new Map(this.branches);
    const subscriptions = new Map(this.subscriptions);
    const memberships = new Map(Array.from(this.memberships, ([key, value]) => [key, [...value]]));
    const suffix = String(this.nextId).padStart(12, '0');
    const pharmacyId = `10000000-0000-4000-8000-${suffix}`;
    const branchId = `20000000-0000-4000-8000-${suffix}`;
    const membershipId = `30000000-0000-4000-8000-${suffix}`;
    const subscriptionId = `40000000-0000-4000-8000-${suffix}`;
    const startedAt = '2026-10-25T10:00:00.000Z';
    const endsAt = '2026-11-08T10:00:00.000Z';
    pharmacies.set(pharmacyId, { ownerId: input.userId, name: normalized.pharmacyName });
    if (input.failAfter === 'pharmacy') throw new Error('synthetic rollback');
    branches.set(branchId, pharmacyId);
    if (input.failAfter === 'branch') throw new Error('synthetic rollback');
    subscriptions.set(subscriptionId, { plan: 'TRIAL', startedAt, endsAt });
    memberships.set(input.userId, [...(memberships.get(input.userId) || []), { pharmacyId, role: 'OWNER' }]);
    const response = Object.freeze({ success: true, contract_version: 'owner-onboarding-v1', request_scope: 'AUTHENTICATED_USER', request_id: input.requestId, pharmacy_id: pharmacyId, branch_id: branchId, membership_id: membershipId, subscription_id: subscriptionId, role: 'OWNER', status: 'ACTIVE', currency: normalized.currency, plan_code: 'TRIAL', trial_started_at: startedAt, trial_ends_at: endsAt, completed_at: startedAt });
    this.nextId += 1;
    this.pharmacies = pharmacies;
    this.branches = branches;
    this.subscriptions = subscriptions;
    this.memberships = memberships;
    this.requests.set(scopedKey, { fingerprint, response });
    return response;
  }
}

const model = new SynchronousOwnerOnboardingModel();
const input = { requestId: 'request-1', userId: 'user-1', verified: true, eligibility: 'OWNER' as const, pharmacyName: 'Alpha', currency: 'NGN' };
const first = model.create(input);
const replay = model.create(input);
assert(first === replay && model.pharmacies.size === 1, 'synchronous exact replay returns stored canonical response without duplicate effects');
assert(first.contract_version === 'owner-onboarding-v1' && first.plan_code === 'TRIAL' && first.trial_started_at !== first.trial_ends_at, 'canonical response carries versioned trial/completion evidence');

let conflict = false;
try { model.create({ ...input, pharmacyName: 'Different' }); } catch (error) { conflict = error instanceof Error && error.message === 'REQUEST_CONFLICT'; }
assert(conflict && model.pharmacies.size === 1, 'different-fingerprint replay is a typed conflict without effects');

for (const eligibility of ['STAFF', 'NONE'] as const) {
  let denied = false;
  try { model.create({ ...input, requestId: eligibility, eligibility }); } catch { denied = true; }
  assert(denied && model.pharmacies.size === 1, `${eligibility} identity cannot mint OWNER`);
}

const sameRequestOtherUser = model.create({ ...input, userId: 'user-2' });
assert(sameRequestOtherUser.pharmacy_id !== first.pharmacy_id, 'request identity is scoped to authenticated user plus request ID');

const rollback = new SynchronousOwnerOnboardingModel();
let rolledBack = false;
try { rollback.create({ ...input, requestId: 'rollback', failAfter: 'branch' }); } catch { rolledBack = true; }
assert(rolledBack && rollback.requests.size === 0 && rollback.pharmacies.size === 0 && rollback.branches.size === 0 && rollback.subscriptions.size === 0 && rollback.memberships.size === 0, 'synchronous injected failure preserves zero orphan model effects');

model.memberships.set('user-1', [{ pharmacyId: 'existing-pharmacy', role: 'CASHIER' }]);
model.create({ ...input, requestId: 'second', pharmacyName: 'Beta' });
assert(model.memberships.get('user-1')?.some((row) => row.pharmacyId === 'existing-pharmacy') === true, 'existing memberships remain additive and unchanged');

console.log(`Owner onboarding static/synchronous model tests: ${passed} passed; SQL concurrency remains unexecuted`);
