export interface OwnerRegistrationInput {
  email: string;
  password: string;
  fullName: string;
  pharmacyName: string;
}

export interface OwnerOnboardingIntent {
  kind: 'OWNER_ONBOARDING_V1';
  contract_version: 'owner-onboarding-v1';
  request_id: string;
  pharmacy_name: string;
  currency: string;
}

export const OWNER_ONBOARDING_CONTRACT_VERSION = 'owner-onboarding-v1' as const;

export interface OwnerOnboardingDeploymentState {
  enabled: boolean;
  contractVersion: string | null;
  profileOnlyBootstrapVerified: boolean;
  ownerEligibilityVerified: boolean;
  trustedIdentityProviderAvailable: boolean;
}

export const DEFAULT_OWNER_ONBOARDING_DEPLOYMENT: Readonly<OwnerOnboardingDeploymentState> = Object.freeze({
  enabled: false,
  contractVersion: null,
  profileOnlyBootstrapVerified: false,
  ownerEligibilityVerified: false,
  trustedIdentityProviderAvailable: false,
});

export interface TrustedOwnerIdentityProvider {
  createEligibleIdentity(input: OwnerRegistrationInput & { intent: OwnerOnboardingIntent }): Promise<{
    requiresEmailConfirmation: boolean;
  }>;
}

export type OwnerOnboardingErrorCode =
  | 'DEPLOYMENT_UNAVAILABLE'
  | 'INVALID_REQUEST'
  | 'AUTH_REQUIRED'
  | 'IDENTITY_UNVERIFIED'
  | 'STAFF_IDENTITY_PROHIBITED'
  | 'OWNER_INELIGIBLE'
  | 'REQUEST_CONFLICT'
  | 'UNSAFE_STATE'
  | 'RPC_UNAVAILABLE'
  | 'INVALID_RESPONSE';

export interface OwnerOnboardingFailure {
  code: OwnerOnboardingErrorCode;
  message: string;
}

export interface OwnerOnboardingResult {
  success: true;
  requestId: string;
  pharmacyId: string;
  branchId: string;
  membershipId: string;
  subscriptionId: string;
  role: 'OWNER';
  status: 'ACTIVE';
  contractVersion: 'owner-onboarding-v1';
  requestScope: 'AUTHENTICATED_USER';
  currency: string;
  planCode: 'TRIAL';
  trialStartedAt: string;
  trialEndsAt: string;
  completedAt: string;
}

export interface StaffInvitationInput {
  invitationId: string;
  rawToken: string;
}

export interface AcceptedStaffMembership {
  memberId: string;
  pharmacyId: string;
  role: 'MANAGER' | 'PHARMACIST' | 'CASHIER';
  status: 'ACTIVE';
}

type RpcResult = PromiseLike<{ data?: unknown; error?: { message?: string; code?: string; details?: string } | null }>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateOwnerRegistration(input: OwnerRegistrationInput): string | null {
  if (!input.email.trim() || !input.fullName.trim() || !input.pharmacyName.trim()) {
    return 'Email, full name, and pharmacy name are required.';
  }
  if (input.password.length < 6) return 'Password must be at least 6 characters.';
  if (input.pharmacyName.trim().length < 2 || input.pharmacyName.trim().length > 120) {
    return 'Pharmacy name must contain 2 to 120 characters.';
  }
  return null;
}

export function createOwnerOnboardingIntent(
  pharmacyName: string,
  requestId: string,
  currency = 'NGN',
): OwnerOnboardingIntent {
  const normalizedName = pharmacyName.trim();
  const normalizedCurrency = currency.trim().toUpperCase();
  if (!UUID_PATTERN.test(requestId)) throw new Error('A valid owner onboarding request ID is required.');
  if (normalizedName.length < 2 || normalizedName.length > 120) throw new Error('Pharmacy name must contain 2 to 120 characters.');
  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) throw new Error('Currency must be a three-letter code.');
  return {
    kind: 'OWNER_ONBOARDING_V1',
    contract_version: OWNER_ONBOARDING_CONTRACT_VERSION,
    request_id: requestId.toLowerCase(),
    pharmacy_name: normalizedName,
    currency: normalizedCurrency,
  };
}

export function readOwnerOnboardingIntent(metadata: unknown): OwnerOnboardingIntent | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const candidate = (metadata as Record<string, unknown>).pharmacyflow_owner_onboarding_v1;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const record = candidate as Record<string, unknown>;
  if (record.kind !== 'OWNER_ONBOARDING_V1' || record.contract_version !== OWNER_ONBOARDING_CONTRACT_VERSION || typeof record.request_id !== 'string' ||
      typeof record.pharmacy_name !== 'string' || typeof record.currency !== 'string') return null;
  try {
    return createOwnerOnboardingIntent(record.pharmacy_name, record.request_id, record.currency);
  } catch {
    return null;
  }
}

export function isOwnerOnboardingDeploymentReady(state: OwnerOnboardingDeploymentState): boolean {
  return state.enabled &&
    state.contractVersion === OWNER_ONBOARDING_CONTRACT_VERSION &&
    state.profileOnlyBootstrapVerified &&
    state.ownerEligibilityVerified &&
    state.trustedIdentityProviderAvailable;
}

export async function beginOwnerRegistration(
  input: OwnerRegistrationInput,
  intent: OwnerOnboardingIntent,
  deployment: OwnerOnboardingDeploymentState,
  provider: TrustedOwnerIdentityProvider | null,
): Promise<{ error: OwnerOnboardingFailure | null; requiresEmailConfirmation: boolean }> {
  const validationError = validateOwnerRegistration(input);
  if (validationError) return { error: { code: 'INVALID_REQUEST', message: validationError }, requiresEmailConfirmation: false };
  if (!isOwnerOnboardingDeploymentReady(deployment) || !provider) {
    return {
      error: {
        code: 'DEPLOYMENT_UNAVAILABLE',
        message: 'Owner registration is disabled until the trusted server onboarding contract is independently verified and enabled.',
      },
      requiresEmailConfirmation: false,
    };
  }
  try {
    const result = await provider.createEligibleIdentity({ ...input, intent });
    return { error: null, requiresEmailConfirmation: result.requiresEmailConfirmation };
  } catch (error) {
    return {
      error: { code: 'RPC_UNAVAILABLE', message: error instanceof Error ? error.message : 'Trusted owner identity creation failed closed.' },
      requiresEmailConfirmation: false,
    };
  }
}

const ownerRpcFailure = (error: { message?: string; code?: string; details?: string }): OwnerOnboardingFailure => {
  const codeBySqlState: Record<string, OwnerOnboardingErrorCode> = {
    PF001: 'AUTH_REQUIRED',
    PF002: 'IDENTITY_UNVERIFIED',
    PF003: 'STAFF_IDENTITY_PROHIBITED',
    PF004: 'OWNER_INELIGIBLE',
    PF005: 'REQUEST_CONFLICT',
    PF006: 'UNSAFE_STATE',
  };
  return {
    code: codeBySqlState[error.code || ''] || 'RPC_UNAVAILABLE',
    message: error.message || 'Owner onboarding failed closed.',
  };
};

export async function createOwnerPharmacyWithRpc(
  intent: OwnerOnboardingIntent,
  runRpc: (arguments_: { p_request_id: string; p_pharmacy_name: string; p_currency: string }) => RpcResult,
): Promise<{ data: OwnerOnboardingResult | null; error: OwnerOnboardingFailure | null }> {
  let normalized: OwnerOnboardingIntent;
  try {
    normalized = createOwnerOnboardingIntent(intent.pharmacy_name, intent.request_id, intent.currency);
  } catch (error) {
    return { data: null, error: { code: 'INVALID_REQUEST', message: error instanceof Error ? error.message : 'Invalid owner onboarding request.' } };
  }

  let result: Awaited<RpcResult>;
  try {
    result = await runRpc({
      p_request_id: normalized.request_id,
      p_pharmacy_name: normalized.pharmacy_name,
      p_currency: normalized.currency,
    });
  } catch (error) {
    return { data: null, error: { code: 'RPC_UNAVAILABLE', message: error instanceof Error ? error.message : 'Owner onboarding RPC is unavailable.' } };
  }
  if (result.error) return { data: null, error: ownerRpcFailure(result.error) };
  if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) {
    return { data: null, error: { code: 'INVALID_RESPONSE', message: 'Owner onboarding returned missing or malformed authority evidence.' } };
  }

  const record = result.data as Record<string, unknown>;
  const ids = ['request_id', 'pharmacy_id', 'branch_id', 'membership_id', 'subscription_id'] as const;
  const timestamps = ['trial_started_at', 'trial_ends_at', 'completed_at'] as const;
  if (record.success !== true || record.role !== 'OWNER' || record.status !== 'ACTIVE' ||
      record.contract_version !== OWNER_ONBOARDING_CONTRACT_VERSION || record.request_scope !== 'AUTHENTICATED_USER' ||
      record.plan_code !== 'TRIAL' || typeof record.currency !== 'string' || !/^[A-Z]{3}$/.test(record.currency) ||
      ids.some((key) => typeof record[key] !== 'string' || !UUID_PATTERN.test(record[key] as string)) ||
      timestamps.some((key) => typeof record[key] !== 'string' || Number.isNaN(Date.parse(record[key] as string))) ||
      String(record.request_id).toLowerCase() !== normalized.request_id || record.currency !== normalized.currency ||
      Date.parse(String(record.trial_ends_at)) <= Date.parse(String(record.trial_started_at))) {
    return { data: null, error: { code: 'INVALID_RESPONSE', message: 'Owner onboarding returned invalid authority evidence.' } };
  }

  return {
    data: {
      success: true,
      requestId: String(record.request_id).toLowerCase(),
      pharmacyId: String(record.pharmacy_id).toLowerCase(),
      branchId: String(record.branch_id).toLowerCase(),
      membershipId: String(record.membership_id).toLowerCase(),
      subscriptionId: String(record.subscription_id).toLowerCase(),
      role: 'OWNER',
      status: 'ACTIVE',
      contractVersion: OWNER_ONBOARDING_CONTRACT_VERSION,
      requestScope: 'AUTHENTICATED_USER',
      currency: String(record.currency),
      planCode: 'TRIAL',
      trialStartedAt: String(record.trial_started_at),
      trialEndsAt: String(record.trial_ends_at),
      completedAt: String(record.completed_at),
    },
    error: null,
  };
}

export function normalizeStaffInvitation(input: StaffInvitationInput): StaffInvitationInput {
  return {
    invitationId: input.invitationId.trim().toLowerCase(),
    rawToken: input.rawToken.trim(),
  };
}

export function validateStaffInvitation(input: StaffInvitationInput): string | null {
  const normalized = normalizeStaffInvitation(input);
  if (!UUID_PATTERN.test(normalized.invitationId)) return 'Enter a valid invitation ID.';
  if (!normalized.rawToken) return 'Enter the invitation token.';
  return null;
}

export async function acceptStaffInvitationWithRpc(
  input: StaffInvitationInput,
  runRpc: (arguments_: { p_invitation_id: string; p_raw_token: string }) => RpcResult,
): Promise<{ data: AcceptedStaffMembership | null; error: string | null }> {
  const normalized = normalizeStaffInvitation(input);
  const validationError = validateStaffInvitation(normalized);
  if (validationError) return { data: null, error: validationError };
  const result = await runRpc({
    p_invitation_id: normalized.invitationId,
    p_raw_token: normalized.rawToken,
  });
  if (result.error) return { data: null, error: result.error.message || 'Invitation acceptance failed.' };
  if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) {
    return { data: null, error: 'Invitation acceptance returned missing or malformed membership evidence.' };
  }
  const record = result.data as Record<string, unknown>;
  if (record.success === false) {
    return { data: null, error: typeof record.error === 'string' && record.error.trim() ? record.error : 'Invitation acceptance was rejected.' };
  }
  const memberId = typeof record.member_id === 'string' ? record.member_id.trim().toLowerCase() : '';
  const pharmacyId = typeof record.pharmacy_id === 'string' ? record.pharmacy_id.trim().toLowerCase() : '';
  const role = record.role;
  const status = record.status;
  if (!UUID_PATTERN.test(memberId) || !UUID_PATTERN.test(pharmacyId) ||
      !['MANAGER', 'PHARMACIST', 'CASHIER'].includes(String(role)) || status !== 'ACTIVE') {
    return { data: null, error: 'Invitation acceptance returned invalid membership evidence.' };
  }
  return {
    data: { memberId, pharmacyId, role: role as AcceptedStaffMembership['role'], status: 'ACTIVE' },
    error: null,
  };
}
