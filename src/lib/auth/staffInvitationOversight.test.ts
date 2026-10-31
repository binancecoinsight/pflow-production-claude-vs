import {
  deriveStaffInvitationWorkspace,
  isTimeDerivedExpired,
  sanitizeStaffInvitationError,
  StaffInvitationOversightCoordinator,
  StaffInvitationRpcResponse,
  StaffInvitationViewState,
  validateStaffInvitationResponse,
} from './staffInvitationOversight';
import { Branch, Pharmacy, PharmacyMember, UserRole } from '../../types/database';

let passed = 0;
const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
};

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const PHARMACY_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PHARMACY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BRANCH_A = 'a1111111-1111-4111-8111-111111111111';
const INVITATION_A = 'c1111111-1111-4111-8111-111111111111';
const INVITATION_B = 'c2222222-2222-4222-8222-222222222222';

const pharmacy: Pharmacy = {
  id: PHARMACY_A,
  name: 'A',
  owner_id: USER_A,
  currency: 'NGN',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};
const branch: Branch = {
  id: BRANCH_A,
  pharmacy_id: PHARMACY_A,
  name: 'Main',
  is_main: true,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};
const member = (role: UserRole, changes: Partial<PharmacyMember> = {}): PharmacyMember => ({
  id: 'd1111111-1111-4111-8111-111111111111',
  user_id: USER_A,
  pharmacy_id: PHARMACY_A,
  role,
  default_branch_id: BRANCH_A,
  status: 'ACTIVE',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-27T00:00:00Z',
  ...changes,
});
const row = (changes: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: INVITATION_A,
  pharmacy_id: PHARMACY_A,
  branch_id: null,
  email: 'staff@example.com',
  role: 'PHARMACIST',
  invited_by: USER_A,
  status: 'PENDING',
  expires_at: '2026-10-29T00:00:00Z',
  accepted_at: null,
  created_at: '2026-10-20T00:00:00Z',
  ...changes,
});
const input = (role: UserRole, changes: Record<string, unknown> = {}) => ({
  userId: USER_A,
  membership: member(role),
  pharmacy,
  branch,
  role,
  ...changes,
});

const ownerBinding = deriveStaffInvitationWorkspace(input('OWNER'));
const managerBinding = deriveStaffInvitationWorkspace(input('MANAGER'));
assert(ownerBinding?.role === 'OWNER', 'coherent active OWNER workspace is eligible');
assert(managerBinding?.role === 'MANAGER', 'coherent active MANAGER workspace is eligible');
assert(deriveStaffInvitationWorkspace(input('PHARMACIST')) === null, 'PHARMACIST workspace is denied');
assert(deriveStaffInvitationWorkspace(input('CASHIER')) === null, 'CASHIER workspace is denied');
assert(deriveStaffInvitationWorkspace(input('OWNER', { userId: USER_B })) === null, 'wrong current identity is denied');
assert(deriveStaffInvitationWorkspace(input('OWNER', { membership: member('OWNER', { status: 'SUSPENDED' }) })) === null, 'inactive membership is denied');
assert(deriveStaffInvitationWorkspace(input('OWNER', { pharmacy: { ...pharmacy, id: PHARMACY_B } })) === null, 'cross-pharmacy membership is denied');
assert(deriveStaffInvitationWorkspace(input('OWNER', { role: 'MANAGER' })) === null, 'role mismatch is denied');

const valid = validateStaffInvitationResponse([
  row(),
  row({ id: INVITATION_B, branch_id: BRANCH_A, role: 'MANAGER', status: 'ACCEPTED', accepted_at: '2026-10-21T00:00:00+00:00' }),
], PHARMACY_A);
assert(valid.length === 2, 'the exact M-16 ten-field response is accepted');
assert(Object.isFrozen(valid) && valid.every(Object.isFrozen), 'allowlisted response and rows are immutable');
assert(valid[0].status === 'PENDING', 'server-reported status is preserved');
assert(!('token_hash' in valid[0]), 'allowlisted result cannot contain token_hash');
assert(isTimeDerivedExpired(valid[0], () => Date.parse('2026-10-30T00:00:00Z')), 'injected clock identifies a past-due pending invitation');
assert(valid[0].status === 'PENDING', 'time-derived expiry does not rewrite server status');
assert(!isTimeDerivedExpired(valid[1], () => Date.parse('2026-10-30T00:00:00Z')), 'accepted invitation is not relabelled by time');

const singleLabelDomain = validateStaffInvitationResponse([
  row({ email: 'staff@localhost', expires_at: '2024-02-29T23:59:59.123456+05:30' }),
], PHARMACY_A)[0];
assert(singleLabelDomain.email === 'staff@localhost', 'M-16-compatible normalized single-label-domain email is accepted');
assert(singleLabelDomain.status === 'PENDING', 'calendar validation does not rewrite the server status');
assert(isTimeDerivedExpired(singleLabelDomain, () => Date.parse('2026-10-30T00:00:00Z')), 'expiry remains a separate injected-clock derivation');
assert(validateStaffInvitationResponse([row({ expires_at: '2000-02-29T00:00:00Z' })], PHARMACY_A).length === 1, 'century divisible by 400 is a valid leap year');
assert(validateStaffInvitationResponse([row({ expires_at: '2026-06-30T12:34:56-04:00' })], PHARMACY_A).length === 1, 'valid negative offset is accepted');
assert(validateStaffInvitationResponse([row({ expires_at: '2026-06-30T12:34:56.1+00:00' })], PHARMACY_A).length === 1, 'valid fractional PostgreSQL timestamp is accepted');

const malformedCases: Array<{ label: string; value: unknown }> = [
  { label: 'SQL NULL response', value: null },
  { label: 'row SQL NULL', value: [null] },
  { label: 'missing field', value: [Object.fromEntries(Object.entries(row()).filter(([key]) => key !== 'created_at'))] },
  { label: 'unexpected field', value: [row({ unexpected: 'value' })] },
  { label: 'token hash field', value: [row({ token_hash: 'secret-token-hash' })] },
  { label: 'duplicate ID', value: [row(), row()] },
  { label: 'cross pharmacy', value: [row({ pharmacy_id: PHARMACY_B })] },
  { label: 'OWNER invitation', value: [row({ role: 'OWNER' })] },
  { label: 'unknown status', value: [row({ status: 'CANCELLED' })] },
  { label: 'null required ID', value: [row({ id: null })] },
  { label: 'malformed branch ID', value: [row({ branch_id: 'branch-a' })] },
  { label: 'unnormalized email', value: [row({ email: ' Staff@Example.com ' })] },
  { label: 'invalid timestamp', value: [row({ expires_at: 'tomorrow' })] },
  { label: 'non-leap February 29', value: [row({ expires_at: '2026-02-29T00:00:00Z' })] },
  { label: 'century non-leap February 29', value: [row({ expires_at: '1900-02-29T00:00:00Z' })] },
  { label: 'impossible April date', value: [row({ expires_at: '2026-04-31T00:00:00Z' })] },
  { label: 'zero calendar day', value: [row({ expires_at: '2026-01-00T00:00:00Z' })] },
  { label: 'invalid hour', value: [row({ expires_at: '2026-01-01T24:00:00Z' })] },
  { label: 'invalid minute', value: [row({ expires_at: '2026-01-01T00:60:00Z' })] },
  { label: 'invalid second', value: [row({ expires_at: '2026-01-01T00:00:60Z' })] },
  { label: 'invalid offset hour', value: [row({ expires_at: '2026-01-01T00:00:00+24:00' })] },
  { label: 'invalid offset minute', value: [row({ expires_at: '2026-01-01T00:00:00+05:60' })] },
  { label: 'fraction beyond PostgreSQL microseconds', value: [row({ expires_at: '2026-01-01T00:00:00.1234567Z' })] },
  { label: 'secret-shaped value', value: [row({ email: 'Bearer abc.def@example.com' })] },
  { label: 'normalized secret-bearing email value', value: [row({ email: 'token_hash=secret@localhost' })] },
];
for (const testCase of malformedCases) {
  let rejected = false;
  try {
    validateStaffInvitationResponse(testCase.value, PHARMACY_A);
  } catch {
    rejected = true;
  }
  assert(rejected, `${testCase.label} is rejected before publication`);
}

assert(sanitizeStaffInvitationError({ code: '42501', message: 'raw token_hash=secret' }) === 'You are not authorized to view staff invitations.', 'permission errors use a fixed safe message');
assert(sanitizeStaffInvitationError(new Error('postgres://user:password@host/db token_hash=secret')) === 'Unable to load staff invitations.', 'unexpected diagnostics are not disclosed');

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}
const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

if (!ownerBinding) throw new Error('owner fixture binding was not derived');

// The production coordinator owns the final synchronous publication boundary.
{
  const coordinator = new StaffInvitationOversightCoordinator();
  const states: StaffInvitationViewState[] = [];
  let arguments_: Record<string, unknown> | null = null;
  const outcome = await coordinator.load(
    ownerBinding,
    () => ownerBinding,
    async (received) => {
      arguments_ = received;
      return { data: [row()], error: null };
    },
    (state) => states.push(state),
  );
  assert(outcome === 'published' && states[0].kind === 'loading' && states[1].kind === 'success', 'normal load publishes loading then validated success');
  assert(JSON.stringify(arguments_) === JSON.stringify({ p_pharmacy_id: PHARMACY_A }), 'RPC invocation has only p_pharmacy_id from the coherent workspace');
}

{
  const coordinator = new StaffInvitationOversightCoordinator();
  const states: StaffInvitationViewState[] = [];
  await coordinator.load(ownerBinding, () => ownerBinding, async () => ({ data: [], error: null }), (state) => states.push(state));
  assert(states.at(-1)?.kind === 'empty', 'empty response has a distinct state');
}

{
  const coordinator = new StaffInvitationOversightCoordinator();
  const states: StaffInvitationViewState[] = [];
  await coordinator.load(ownerBinding, () => ownerBinding, async () => ({ data: null, error: { code: '42501', message: 'token_hash=secret' } }), (state) => states.push(state));
  const last = states.at(-1);
  assert(last?.kind === 'error' && last.message === 'You are not authorized to view staff invitations.', 'permission denial publishes only a sanitized error');
}

{
  const coordinator = new StaffInvitationOversightCoordinator();
  const pending = deferred<StaffInvitationRpcResponse>();
  const states: StaffInvitationViewState[] = [];
  const loading = coordinator.load(ownerBinding, () => ownerBinding, () => pending.promise, (state) => states.push(state));
  coordinator.invalidate();
  pending.resolve({ data: [row()], error: null });
  assert(await loading === 'superseded' && states.length === 1 && states[0].kind === 'loading', 'unmount or refresh invalidation prevents late publication');
}

{
  const coordinator = new StaffInvitationOversightCoordinator();
  const pending = deferred<StaffInvitationRpcResponse>();
  let current: typeof ownerBinding | null = ownerBinding;
  const states: StaffInvitationViewState[] = [];
  const loading = coordinator.load(ownerBinding, () => current, () => pending.promise, (state) => states.push(state));
  current = managerBinding;
  pending.resolve({ data: [row()], error: null });
  assert(await loading === 'superseded' && states.length === 1, 'identity, membership, pharmacy, branch or role binding change prevents publication');
}

{
  const coordinator = new StaffInvitationOversightCoordinator();
  const pending = deferred<StaffInvitationRpcResponse>();
  // Register invalidation before the coordinator's awaited continuation. This
  // reproduces the helper-completion/caller-continuation microtask gap.
  void pending.promise.then(() => coordinator.invalidate());
  const states: StaffInvitationViewState[] = [];
  const loading = coordinator.load(ownerBinding, () => ownerBinding, () => pending.promise, (state) => states.push(state));
  pending.resolve({ data: [row()], error: null });
  assert(await loading === 'superseded' && states.length === 1, 'microtask invalidation between completion and continuation publishes no stale data');
}

{
  const coordinator = new StaffInvitationOversightCoordinator();
  const first = deferred<StaffInvitationRpcResponse>();
  const firstStates: StaffInvitationViewState[] = [];
  const secondStates: StaffInvitationViewState[] = [];
  const oldLoad = coordinator.load(ownerBinding, () => ownerBinding, () => first.promise, (state) => firstStates.push(state));
  const newLoad = coordinator.load(ownerBinding, () => ownerBinding, async () => ({ data: [row({ id: INVITATION_B })], error: null }), (state) => secondStates.push(state));
  first.resolve({ data: [row()], error: null });
  assert(await oldLoad === 'superseded' && await newLoad === 'published', 'new refresh supersedes an older deferred request');
  assert(firstStates.length === 1 && secondStates.at(-1)?.kind === 'success', 'only the newest refresh publishes invitation data');
}

{
  const coordinator = new StaffInvitationOversightCoordinator();
  const states: StaffInvitationViewState[] = [];
  await coordinator.load(ownerBinding, () => ownerBinding, async () => ({ data: [row({ token_hash: 'do-not-publish' })], error: null }), (state) => states.push(state));
  assert(states.at(-1)?.kind === 'error' && JSON.stringify(states).includes('do-not-publish') === false, 'malformed secret-bearing response is never retained in published state');
}

console.log(`Staff invitation oversight tests: ${passed} passed`);
