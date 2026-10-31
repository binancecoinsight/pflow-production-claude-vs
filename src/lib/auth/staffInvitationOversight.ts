import { Branch, Pharmacy, PharmacyMember, UserRole } from '../../types/database';
import { isReadyWorkspace } from './membershipWorkspace';

export type StaffInvitationRole = 'MANAGER' | 'PHARMACIST' | 'CASHIER';
export type StaffInvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

export interface StaffInvitationRecord {
  readonly id: string;
  readonly pharmacy_id: string;
  readonly branch_id: string | null;
  readonly email: string;
  readonly role: StaffInvitationRole;
  readonly invited_by: string;
  readonly status: StaffInvitationStatus;
  readonly expires_at: string;
  readonly accepted_at: string | null;
  readonly created_at: string;
}

export interface StaffInvitationWorkspaceBinding {
  readonly userId: string;
  readonly membershipId: string;
  readonly membershipUpdatedAt: string;
  readonly pharmacyId: string;
  readonly branchId: string;
  readonly role: 'OWNER' | 'MANAGER';
}

export interface StaffInvitationRpcResponse {
  readonly data: unknown;
  readonly error: unknown;
}

export type StaffInvitationExecutor = (arguments_: {
  readonly p_pharmacy_id: string;
}) => PromiseLike<StaffInvitationRpcResponse>;

export type StaffInvitationViewState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'success'; readonly invitations: readonly StaffInvitationRecord[] };

interface WorkspaceInput {
  readonly userId: string | null;
  readonly membership: PharmacyMember | null;
  readonly pharmacy: Pharmacy | null;
  readonly branch: Branch | null;
  readonly role: UserRole | null;
}

const FIELD_NAMES = Object.freeze([
  'id',
  'pharmacy_id',
  'branch_id',
  'email',
  'role',
  'invited_by',
  'status',
  'expires_at',
  'accepted_at',
  'created_at',
] as const);

const FIELD_SET = new Set<string>(FIELD_NAMES);
const ROLES = new Set<StaffInvitationRole>(['MANAGER', 'PHARMACIST', 'CASHIER']);
const STATUSES = new Set<StaffInvitationStatus>(['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RFC3339_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(?:Z|([+-])(\d{2}):(\d{2}))$/;
const SECRET_VALUE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*\b/i,
  /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
  /\b(?:postgres(?:ql)?|supabase):\/\/[^\s]+/i,
  /\b(?:sb_secret_|service_role[=:]|password[=:]|token_hash[=:])\S*/i,
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = RFC3339_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] ? Number(match[9]) : 0;
  const offsetMinute = match[8] ? Number(match[10]) : 0;
  if (year < 1
      || month < 1 || month > 12
      || hour > 23
      || minute > 59
      || second > 59
      || offsetHour > 23
      || offsetMinute > 59) return false;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

function containsSecretLikeValue(row: Record<string, unknown>): boolean {
  return Object.values(row).some((value) =>
    typeof value === 'string' && SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))
  );
}

function hasExactFields(row: Record<string, unknown>): boolean {
  const keys = Object.keys(row);
  return keys.length === FIELD_NAMES.length && keys.every((key) => FIELD_SET.has(key));
}

function parseRow(row: unknown, pharmacyId: string): StaffInvitationRecord {
  if (!isPlainObject(row) || !hasExactFields(row) || containsSecretLikeValue(row)) {
    throw new Error('STAFF_INVITATION_RESPONSE_INVALID');
  }
  if (!isUuid(row.id)
      || !isUuid(row.pharmacy_id)
      || row.pharmacy_id !== pharmacyId
      || !(row.branch_id === null || isUuid(row.branch_id))
      || typeof row.email !== 'string'
      || row.email !== row.email.trim().toLowerCase()
      || row.email.indexOf('@') < 1
      || typeof row.role !== 'string'
      || !ROLES.has(row.role as StaffInvitationRole)
      || !isUuid(row.invited_by)
      || typeof row.status !== 'string'
      || !STATUSES.has(row.status as StaffInvitationStatus)
      || !isTimestamp(row.expires_at)
      || !(row.accepted_at === null || isTimestamp(row.accepted_at))
      || !isTimestamp(row.created_at)) {
    throw new Error('STAFF_INVITATION_RESPONSE_INVALID');
  }

  return Object.freeze({
    id: row.id,
    pharmacy_id: row.pharmacy_id,
    branch_id: row.branch_id,
    email: row.email,
    role: row.role as StaffInvitationRole,
    invited_by: row.invited_by,
    status: row.status as StaffInvitationStatus,
    expires_at: row.expires_at,
    accepted_at: row.accepted_at,
    created_at: row.created_at,
  });
}

export function validateStaffInvitationResponse(
  response: unknown,
  pharmacyId: string,
): readonly StaffInvitationRecord[] {
  if (!isUuid(pharmacyId) || !Array.isArray(response)) {
    throw new Error('STAFF_INVITATION_RESPONSE_INVALID');
  }
  const ids = new Set<string>();
  const records = response.map((row) => {
    const parsed = parseRow(row, pharmacyId);
    if (ids.has(parsed.id)) throw new Error('STAFF_INVITATION_RESPONSE_INVALID');
    ids.add(parsed.id);
    return parsed;
  });
  return Object.freeze(records);
}

export function deriveStaffInvitationWorkspace(
  input: WorkspaceInput,
): StaffInvitationWorkspaceBinding | null {
  if (!isReadyWorkspace(input)
      || !input.userId
      || !input.membership
      || !input.pharmacy
      || !input.branch
      || (input.role !== 'OWNER' && input.role !== 'MANAGER')) return null;

  return Object.freeze({
    userId: input.userId,
    membershipId: input.membership.id,
    membershipUpdatedAt: input.membership.updated_at,
    pharmacyId: input.pharmacy.id,
    branchId: input.branch.id,
    role: input.role,
  });
}

export function sameStaffInvitationWorkspace(
  left: StaffInvitationWorkspaceBinding | null,
  right: StaffInvitationWorkspaceBinding | null,
): boolean {
  return Boolean(left && right
    && left.userId === right.userId
    && left.membershipId === right.membershipId
    && left.membershipUpdatedAt === right.membershipUpdatedAt
    && left.pharmacyId === right.pharmacyId
    && left.branchId === right.branchId
    && left.role === right.role);
}

export function sanitizeStaffInvitationError(error: unknown): string {
  const code = isPlainObject(error) && typeof error.code === 'string' ? error.code : '';
  if (code === '42501' || code === '28000') {
    return 'You are not authorized to view staff invitations.';
  }
  return 'Unable to load staff invitations.';
}

export function isTimeDerivedExpired(
  invitation: StaffInvitationRecord,
  now: () => number,
): boolean {
  return invitation.status === 'PENDING' && Date.parse(invitation.expires_at) <= now();
}

/**
 * Owns request freshness and performs the final workspace check and React
 * publication callback in one synchronous turn. Importing this class performs
 * no I/O; the RPC executor and current workspace are injected.
 */
export class StaffInvitationOversightCoordinator {
  private generation = 0;

  invalidate(): void {
    this.generation += 1;
  }

  async load(
    binding: StaffInvitationWorkspaceBinding,
    currentBinding: () => StaffInvitationWorkspaceBinding | null,
    executor: StaffInvitationExecutor,
    publish: (state: StaffInvitationViewState) => void,
  ): Promise<'published' | 'superseded'> {
    const generation = ++this.generation;
    const isCurrent = (): boolean => generation === this.generation
      && sameStaffInvitationWorkspace(binding, currentBinding());

    if (!isCurrent()) return 'superseded';
    publish(Object.freeze({ kind: 'loading' }));

    try {
      const response = await executor({ p_pharmacy_id: binding.pharmacyId });
      if (!isCurrent()) return 'superseded';
      if (!isPlainObject(response) || response.error) {
        const message = sanitizeStaffInvitationError(
          isPlainObject(response) ? response.error : response,
        );
        if (!isCurrent()) return 'superseded';
        publish(Object.freeze({ kind: 'error', message }));
        return 'published';
      }
      const invitations = validateStaffInvitationResponse(response.data, binding.pharmacyId);
      if (!isCurrent()) return 'superseded';
      publish(invitations.length === 0
        ? Object.freeze({ kind: 'empty' })
        : Object.freeze({ kind: 'success', invitations }));
      return 'published';
    } catch (error: unknown) {
      if (!isCurrent()) return 'superseded';
      publish(Object.freeze({ kind: 'error', message: sanitizeStaffInvitationError(error) }));
      return 'published';
    }
  }
}
