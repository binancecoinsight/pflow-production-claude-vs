import {
  acceptStaffInvitationWithRpc,
  beginOwnerRegistration,
  createOwnerOnboardingIntent,
  createOwnerPharmacyWithRpc,
  DEFAULT_OWNER_ONBOARDING_DEPLOYMENT,
  normalizeStaffInvitation,
  readOwnerOnboardingIntent,
  validateOwnerRegistration,
  validateStaffInvitation,
} from './onboarding';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
  passed += 1;
}

const REQUEST_ID = '550e8400-e29b-41d4-a716-446655440000';
const PHARMACY_ID = '660e8400-e29b-41d4-a716-446655440001';
const BRANCH_ID = '770e8400-e29b-41d4-a716-446655440002';
const MEMBER_ID = '880e8400-e29b-41d4-a716-446655440003';
const SUBSCRIPTION_ID = '990e8400-e29b-41d4-a716-446655440004';
const TRIAL_STARTED_AT = '2026-10-25T10:00:00.000Z';
const TRIAL_ENDS_AT = '2026-11-08T10:00:00.000Z';

assert(validateOwnerRegistration({ email: '', password: '123456', fullName: 'A', pharmacyName: 'P' }) !== null, 'owner email is required');
assert(validateOwnerRegistration({ email: 'a@example.test', password: '12345', fullName: 'A', pharmacyName: 'Pharmacy' }) !== null, 'owner password minimum is enforced');
assert(validateOwnerRegistration({ email: 'a@example.test', password: '123456', fullName: 'A', pharmacyName: 'Pharmacy' }) === null, 'complete owner input is accepted locally');

const ownerIntent = createOwnerOnboardingIntent('  Example Pharmacy  ', REQUEST_ID, 'ngn');
assert(ownerIntent.pharmacy_name === 'Example Pharmacy' && ownerIntent.currency === 'NGN', 'owner request values are normalized');
assert(ownerIntent.contract_version === 'owner-onboarding-v1', 'owner intent is bound to the reviewed contract version');
assert(readOwnerOnboardingIntent({ role: 'OWNER', subscription_plan: 'ENTERPRISE' }) === null, 'forged role and plan metadata are not onboarding intent');
assert(readOwnerOnboardingIntent({ pharmacyflow_owner_onboarding_v1: { ...ownerIntent, role: 'CASHIER', trial_days: 999 } })?.kind === 'OWNER_ONBOARDING_V1', 'client metadata cannot alter server-selected role or trial anchors');

let authCreationCalls = 0;
const unavailableSignup = await beginOwnerRegistration(
  { email: 'owner@example.test', password: '123456', fullName: 'Owner', pharmacyName: 'Example Pharmacy' },
  ownerIntent,
  DEFAULT_OWNER_ONBOARDING_DEPLOYMENT,
  { createEligibleIdentity: async () => { authCreationCalls += 1; return { requiresEmailConfirmation: true }; } },
);
assert(unavailableSignup.error?.code === 'DEPLOYMENT_UNAVAILABLE', 'missing server-first contract disables owner signup');
assert(authCreationCalls === 0, 'missing server-first contract makes zero Auth-creation calls');

const rpcArguments: Array<Record<string, string>> = [];
const ownerResult = await createOwnerPharmacyWithRpc(ownerIntent, async (arguments_) => {
  rpcArguments.push(arguments_);
  return {
    data: {
      success: true,
      request_id: REQUEST_ID,
      pharmacy_id: PHARMACY_ID,
      branch_id: BRANCH_ID,
      membership_id: MEMBER_ID,
      subscription_id: SUBSCRIPTION_ID,
      contract_version: 'owner-onboarding-v1',
      request_scope: 'AUTHENTICATED_USER',
      currency: 'NGN',
      plan_code: 'TRIAL',
      trial_started_at: TRIAL_STARTED_AT,
      trial_ends_at: TRIAL_ENDS_AT,
      completed_at: TRIAL_STARTED_AT,
      role: 'OWNER',
      status: 'ACTIVE',
    },
    error: null,
  };
});
assert(ownerResult.error === null && ownerResult.data?.pharmacyId === PHARMACY_ID, 'valid authoritative owner evidence is accepted');
assert(Object.keys(rpcArguments[0]).sort().join(',') === 'p_currency,p_pharmacy_name,p_request_id', 'client sends no role, tenant, plan, or trial anchor');

for (const [label, data] of [
  ['missing response', null],
  ['client-selected role', { success: true, request_id: REQUEST_ID, pharmacy_id: PHARMACY_ID, branch_id: BRANCH_ID, membership_id: MEMBER_ID, subscription_id: SUBSCRIPTION_ID, role: 'MANAGER', status: 'ACTIVE' }],
  ['wrong request replay', { success: true, request_id: PHARMACY_ID, pharmacy_id: PHARMACY_ID, branch_id: BRANCH_ID, membership_id: MEMBER_ID, subscription_id: SUBSCRIPTION_ID, role: 'OWNER', status: 'ACTIVE' }],
  ['malformed id', { success: true, request_id: REQUEST_ID, pharmacy_id: 'bad', branch_id: BRANCH_ID, membership_id: MEMBER_ID, subscription_id: SUBSCRIPTION_ID, role: 'OWNER', status: 'ACTIVE' }],
] as const) {
  const outcome = await createOwnerPharmacyWithRpc(ownerIntent, async () => ({ data, error: null }));
  assert(outcome.data === null && outcome.error !== null, `${label} fails response-shape validation`);
}

const typedConflict = await createOwnerPharmacyWithRpc(ownerIntent, async () => ({ error: { code: 'PF005', message: 'conflict' } }));
assert(typedConflict.error?.code === 'REQUEST_CONFLICT', 'server request conflicts retain a typed client classification');

const invitation = normalizeStaffInvitation({
  invitationId: ' A50E8400-E29B-41D4-A716-446655440000 ',
  rawToken: ' secret-token ',
});
assert(invitation.invitationId === 'a50e8400-e29b-41d4-a716-446655440000', 'invitation identity is normalized');
assert(invitation.rawToken === 'secret-token', 'invitation token whitespace is removed without changing internal bytes');
assert(validateStaffInvitation(invitation) === null, 'valid invitation input passes');
assert(validateStaffInvitation({ invitationId: 'not-an-id', rawToken: 'token' }) !== null, 'invalid invitation identity fails before RPC');
assert(validateStaffInvitation({ invitationId: invitation.invitationId, rawToken: '' }) !== null, 'missing invitation token fails before RPC');

const captured: Array<Record<string, string>> = [];
const accepted = await acceptStaffInvitationWithRpc(invitation, async (arguments_) => {
  captured.push(arguments_);
  return { data: { member_id: MEMBER_ID, pharmacy_id: PHARMACY_ID, role: 'PHARMACIST', status: 'ACTIVE' }, error: null };
});
assert(accepted.error === null && accepted.data?.role === 'PHARMACIST', 'sealed M-16 membership JSON succeeds');
assert(captured[0]?.p_invitation_id === invitation.invitationId && captured[0]?.p_raw_token === invitation.rawToken, 'M-16 RPC receives only invitation identity and token');
assert(!('role' in captured[0]) && !('pharmacy_id' in captured[0]), 'client cannot supply role or tenant to invitation acceptance');

let invalidRpcCalls = 0;
await acceptStaffInvitationWithRpc({ invitationId: 'invalid', rawToken: 'token' }, async () => {
  invalidRpcCalls += 1;
  return { data: null, error: null };
});
assert(invalidRpcCalls === 0, 'invalid invitation input never reaches the RPC');

const expired = await acceptStaffInvitationWithRpc(invitation, async () => ({
  data: { success: false, error: 'Invitation has expired', error_code: '22023', invitation_id: invitation.invitationId, status: 'EXPIRED' },
  error: null,
}));
assert(expired.data === null && expired.error === 'Invitation has expired', 'M-16 expired result remains an application-level failure');

for (const [label, data] of [
  ['missing data', null],
  ['malformed data', { member_id: 'bad', pharmacy_id: 'bad', role: 'CASHIER', status: 'ACTIVE' }],
  ['owner evidence', { member_id: MEMBER_ID, pharmacy_id: PHARMACY_ID, role: 'OWNER', status: 'ACTIVE' }],
  ['inactive evidence', { member_id: MEMBER_ID, pharmacy_id: PHARMACY_ID, role: 'CASHIER', status: 'SUSPENDED' }],
] as const) {
  const outcome = await acceptStaffInvitationWithRpc(invitation, async () => ({ data, error: null }));
  assert(outcome.data === null && outcome.error !== null, `${label} fails closed`);
}

console.log(`Onboarding client policy tests: ${passed} passed`);
