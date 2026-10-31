import { Branch, Pharmacy, PharmacyMember, UserRole } from '../../types/database';
import { MembershipWithPharmacy } from '../../types/auth';

export type WorkspaceTab =
  | 'pos'
  | 'inventory'
  | 'sales'
  | 'customers'
  | 'suppliers'
  | 'reconciliation'
  | 'reports'
  | 'devices'
  | 'overview';

export interface WorkspaceRequestToken {
  readonly generation: number;
  readonly userId: string;
}

export type GuardedWorkspaceResult<T> =
  | { status: 'current'; value: T }
  | { status: 'failed'; error: unknown }
  | { status: 'superseded' };

/**
 * Guards every asynchronous workspace resolution. A newer request or an
 * explicit invalidation makes all older tokens unusable, even when the same
 * user or pharmacy is selected again (for example A -> B -> A).
 */
export class WorkspaceRequestGuard {
  private generation = 0;

  begin(userId: string): WorkspaceRequestToken {
    this.generation += 1;
    return Object.freeze({ generation: this.generation, userId });
  }

  invalidate(): void {
    this.generation += 1;
  }

  isCurrent(token: WorkspaceRequestToken, currentUserId: string | null): boolean {
    return token.generation === this.generation
      && token.userId === currentUserId;
  }

  currentGeneration(): number {
    return this.generation;
  }

  async waitForCurrent<T>(
    token: WorkspaceRequestToken,
    currentUserId: () => string | null,
    load: () => PromiseLike<T>,
  ): Promise<GuardedWorkspaceResult<T>> {
    if (!this.isCurrent(token, currentUserId())) return { status: 'superseded' };
    try {
      const value = await load();
      if (!this.isCurrent(token, currentUserId())) return { status: 'superseded' };
      return { status: 'current', value };
    } catch (error: unknown) {
      if (!this.isCurrent(token, currentUserId())) return { status: 'superseded' };
      return { status: 'failed', error };
    }
  }

  /**
   * Rechecks freshness and performs publication in the same synchronous turn.
   * The callback must remain synchronous; callers cannot carry freshness
   * across an await or publish after this method returns false.
   */
  publishIfCurrent(
    token: WorkspaceRequestToken,
    currentUserId: () => string | null,
    publish: () => void,
  ): boolean {
    if (!this.isCurrent(token, currentUserId())) return false;
    publish();
    return true;
  }
}

export type BranchResolution =
  | { kind: 'unavailable'; branches: readonly Branch[] }
  | { kind: 'ready'; branches: readonly Branch[]; branch: Branch }
  | { kind: 'selection_required'; branches: readonly Branch[] };

export function isActiveMembershipForUser(
  membership: PharmacyMember,
  currentUserId: string,
): boolean {
  return membership.status === 'ACTIVE' && membership.user_id === currentUserId;
}

export function selectMembershipForPharmacy(
  memberships: readonly MembershipWithPharmacy[],
  currentUserId: string,
  pharmacyId: string,
): MembershipWithPharmacy | null {
  return memberships.find((candidate) =>
    candidate.pharmacy_id === pharmacyId
    && candidate.pharmacy?.id === pharmacyId
    && isActiveMembershipForUser(candidate, currentUserId)
  ) ?? null;
}

export function isMembershipSelectionCurrent(
  memberships: readonly MembershipWithPharmacy[],
  currentUserId: string,
  selected: MembershipWithPharmacy,
): boolean {
  return memberships.some((candidate) =>
    candidate.id === selected.id
    && candidate.user_id === selected.user_id
    && candidate.pharmacy_id === selected.pharmacy_id
    && candidate.role === selected.role
    && candidate.status === selected.status
    && candidate.default_branch_id === selected.default_branch_id
    && candidate.pharmacy?.id === selected.pharmacy_id
    && isActiveMembershipForUser(candidate, currentUserId)
  );
}

/**
 * Mirrors the existing has_branch_access contract from migration 000017:
 * OWNER/MANAGER may use branches returned by the authoritative branch query;
 * other roles may use only their returned default branch. A default id alone
 * never establishes access because the branch must also be present in the
 * authoritative query result and belong to the selected pharmacy.
 */
export function resolveEligibleBranches(
  currentUserId: string,
  membership: PharmacyMember,
  pharmacy: Pharmacy,
  returnedBranches: readonly Branch[],
): BranchResolution {
  if (!isActiveMembershipForUser(membership, currentUserId)
      || membership.pharmacy_id !== pharmacy.id) {
    return { kind: 'unavailable', branches: Object.freeze([]) };
  }

  const pharmacyBranches = returnedBranches.filter((candidate) =>
    candidate.pharmacy_id === pharmacy.id
  );
  const eligible = membership.role === 'OWNER' || membership.role === 'MANAGER'
    ? pharmacyBranches
    : pharmacyBranches.filter((candidate) =>
      Boolean(membership.default_branch_id)
      && candidate.id === membership.default_branch_id
    );
  const branches = Object.freeze([...eligible]);

  if (branches.length === 0) return { kind: 'unavailable', branches };
  if (branches.length === 1) return { kind: 'ready', branches, branch: branches[0] };
  return { kind: 'selection_required', branches };
}

export function selectEligibleBranch(
  currentUserId: string,
  membership: PharmacyMember,
  pharmacy: Pharmacy,
  branches: readonly Branch[],
  branchId: string,
): Branch | null {
  if (!isActiveMembershipForUser(membership, currentUserId)
      || membership.pharmacy_id !== pharmacy.id) return null;
  return branches.find((candidate) =>
    candidate.id === branchId && candidate.pharmacy_id === pharmacy.id
  ) ?? null;
}

/** Preserves the existing shell entitlement matrix exactly. */
export function canViewWorkspaceTab(
  tab: WorkspaceTab,
  role: UserRole | null,
  permissions: readonly string[],
): boolean {
  if (tab !== 'reports') return true;
  return role === 'OWNER'
    || role === 'MANAGER'
    || role === 'PHARMACIST'
    || permissions.includes('reports.read');
}

export function isReadyWorkspace(input: {
  userId: string | null;
  membership: PharmacyMember | null;
  pharmacy: Pharmacy | null;
  branch: Branch | null;
  role: UserRole | null;
}): boolean {
  const { userId, membership, pharmacy, branch, role } = input;
  return Boolean(
    userId
    && membership
    && pharmacy
    && branch
    && role
    && isActiveMembershipForUser(membership, userId)
    && membership.pharmacy_id === pharmacy.id
    && branch.pharmacy_id === pharmacy.id
    && membership.role === role
  );
}
