import {
  WorkspaceRequestGuard,
  canViewWorkspaceTab,
  isMembershipSelectionCurrent,
  isReadyWorkspace,
  resolveEligibleBranches,
  selectEligibleBranch,
  selectMembershipForPharmacy,
} from './membershipWorkspace';
import { Branch, Pharmacy, PharmacyMember, UserRole } from '../../types/database';
import { MembershipWithPharmacy } from '../../types/auth';

let passed = 0;
const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
};

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const PHARMACY_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PHARMACY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BRANCH_A1 = 'a1111111-1111-4111-8111-111111111111';
const BRANCH_A2 = 'a2222222-2222-4222-8222-222222222222';
const BRANCH_B1 = 'b1111111-1111-4111-8111-111111111111';

const pharmacy = (id: string): Pharmacy => ({
  id, name: id === PHARMACY_A ? 'A' : 'B', owner_id: USER_A, currency: 'NGN',
  created_at: '2026-10-27T00:00:00Z', updated_at: '2026-10-27T00:00:00Z',
});
const branch = (id: string, pharmacyId: string): Branch => ({
  id, pharmacy_id: pharmacyId, name: id, is_main: id === BRANCH_A1,
  created_at: '2026-10-27T00:00:00Z', updated_at: '2026-10-27T00:00:00Z',
});
const member = (
  role: UserRole,
  overrides: Partial<PharmacyMember> = {},
): PharmacyMember => ({
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', user_id: USER_A,
  pharmacy_id: PHARMACY_A, role, default_branch_id: BRANCH_A1, status: 'ACTIVE',
  created_at: '2026-10-27T00:00:00Z', updated_at: '2026-10-27T00:00:00Z',
  ...overrides,
});

const returned = [branch(BRANCH_A1, PHARMACY_A), branch(BRANCH_A2, PHARMACY_A), branch(BRANCH_B1, PHARMACY_B)];

const ownerBranches = resolveEligibleBranches(USER_A, member('OWNER'), pharmacy(PHARMACY_A), returned);
assert(ownerBranches.kind === 'selection_required' && ownerBranches.branches.length === 2, 'OWNER must explicitly select among multiple returned pharmacy branches');
const managerBranches = resolveEligibleBranches(USER_A, member('MANAGER'), pharmacy(PHARMACY_A), [returned[0]]);
assert(managerBranches.kind === 'ready' && managerBranches.branch.id === BRANCH_A1, 'exactly one MANAGER branch is automatically selected');
const pharmacistBranches = resolveEligibleBranches(USER_A, member('PHARMACIST'), pharmacy(PHARMACY_A), returned);
assert(pharmacistBranches.kind === 'ready' && pharmacistBranches.branch.id === BRANCH_A1, 'non-management role is limited to returned default branch');
assert(resolveEligibleBranches(USER_A, member('CASHIER', { default_branch_id: BRANCH_B1 }), pharmacy(PHARMACY_A), returned).kind === 'unavailable', 'cross-pharmacy default does not establish branch access');
assert(resolveEligibleBranches(USER_A, member('CASHIER', { default_branch_id: null }), pharmacy(PHARMACY_A), returned).kind === 'unavailable', 'missing non-management assignment fails closed');
assert(resolveEligibleBranches(USER_B, member('OWNER'), pharmacy(PHARMACY_A), returned).kind === 'unavailable', 'wrong current user fails closed');
assert(resolveEligibleBranches(USER_A, member('OWNER', { status: 'SUSPENDED' }), pharmacy(PHARMACY_A), returned).kind === 'unavailable', 'inactive membership fails closed');
assert(resolveEligibleBranches(USER_A, member('OWNER'), pharmacy(PHARMACY_A), []).kind === 'unavailable', 'zero returned branches is unavailable');

assert(selectEligibleBranch(USER_A, member('OWNER'), pharmacy(PHARMACY_A), ownerBranches.branches, BRANCH_A2)?.id === BRANCH_A2, 'eligible selection succeeds');
assert(selectEligibleBranch(USER_A, member('OWNER'), pharmacy(PHARMACY_A), ownerBranches.branches, BRANCH_B1) === null, 'foreign branch selection is rejected');
assert(selectEligibleBranch(USER_A, member('OWNER', { status: 'SUSPENDED' }), pharmacy(PHARMACY_A), ownerBranches.branches, BRANCH_A1) === null, 'selection revalidates active membership');

const enriched: MembershipWithPharmacy[] = [
  { ...member('OWNER'), pharmacy: pharmacy(PHARMACY_A) },
  { ...member('MANAGER', { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', pharmacy_id: PHARMACY_B }), pharmacy: pharmacy(PHARMACY_B) },
];
assert(selectMembershipForPharmacy(enriched, USER_A, PHARMACY_B)?.pharmacy_id === PHARMACY_B, 'active pharmacy membership can be selected');
assert(selectMembershipForPharmacy(enriched, USER_B, PHARMACY_A) === null, 'membership from a previous user cannot be selected');
assert(selectMembershipForPharmacy([{ ...enriched[0], status: 'SUSPENDED' }], USER_A, PHARMACY_A) === null, 'inactive stored membership cannot be selected');
assert(!isMembershipSelectionCurrent(enriched, USER_A, { ...enriched[0], role: 'MANAGER' }), 'changed selected membership evidence is rejected even when another active pharmacy membership exists');

assert(canViewWorkspaceTab('reports', 'CASHIER', []) === false, 'existing CASHIER report navigation remains hidden');
assert(canViewWorkspaceTab('reports', 'CASHIER', ['reports.read']) === true, 'existing explicit reports permission remains honored');
assert(canViewWorkspaceTab('reports', 'PHARMACIST', []) === true, 'existing PHARMACIST report navigation remains visible');
assert(canViewWorkspaceTab('pos', null, []) === true, 'non-report navigation matrix remains unchanged');

assert(isReadyWorkspace({ userId: USER_A, membership: member('OWNER'), pharmacy: pharmacy(PHARMACY_A), branch: returned[0], role: 'OWNER' }), 'coherent active workspace is ready');
assert(!isReadyWorkspace({ userId: USER_A, membership: member('OWNER'), pharmacy: pharmacy(PHARMACY_A), branch: returned[2], role: 'OWNER' }), 'cross-pharmacy branch cannot publish ready');
assert(!isReadyWorkspace({ userId: USER_B, membership: member('OWNER'), pharmacy: pharmacy(PHARMACY_A), branch: returned[0], role: 'OWNER' }), 'previous user workspace cannot publish ready');

// These overlap tests exercise the same generation guard imported by AuthContext.
const guard = new WorkspaceRequestGuard();
const requestA1 = guard.begin(USER_A);
const requestB = guard.begin(USER_A);
const requestA2 = guard.begin(USER_A);
assert(!guard.isCurrent(requestA1, USER_A) && !guard.isCurrent(requestB, USER_A) && guard.isCurrent(requestA2, USER_A), 'rapid A -> B -> A accepts only the final generation');
const refresh1 = guard.begin(USER_A);
const refresh2 = guard.begin(USER_A);
assert(!guard.isCurrent(refresh1, USER_A) && guard.isCurrent(refresh2, USER_A), 'overlapping refresh accepts only the newest response');
const failingRequest = guard.begin(USER_A);
guard.invalidate();
assert(!guard.isCurrent(failingRequest, USER_A), 'failed or explicitly invalidated request cannot publish');
const signOutRequest = guard.begin(USER_A);
guard.invalidate();
assert(!guard.isCurrent(signOutRequest, null), 'sign-out during resolution cannot restore prior user context');
const oldUserRequest = guard.begin(USER_A);
const newUserRequest = guard.begin(USER_B);
assert(!guard.isCurrent(oldUserRequest, USER_B) && guard.isCurrent(newUserRequest, USER_B), 'late response cannot restore a previous user');

console.log(`Membership workspace policy tests: ${passed} passed`);
