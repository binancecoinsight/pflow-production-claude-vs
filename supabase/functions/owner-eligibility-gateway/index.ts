/** Inactive BLK-002-I3 injected gateway; no entrypoint, clients, credentials, or I/O adapters. */
import {
  AmbiguousOutcomeError, I3_CONTRACT_VERSION, assertDigest, assertText, assertUuid,
  commandIdentity, immutableCopy, sha256Text, type Applied, type CommandContext,
  type GatewayAuthority, type GatewayCapability, type OperationIdentity, type PresentedCredential,
  type VerifiedPrincipal,
} from '../_shared/owner-security-i3';

export interface ReserveEligibilityCommand {
  context: CommandContext; requestId: string; normalizedEmail: string; pharmacyName: string;
  currency: string; admissionDecisionId: string; replacesRequestId?: string;
}
export interface ReservationResult {
  requestId: string; eligibilityId: string; providerOperationId: string; applicantKey: string;
  pharmacyContextId: string; state: 'RESERVED'; admissionDecisionId: string;
  intendedInputFingerprint: string;
}
export interface IssueIdentityCommand {
  context: CommandContext; requestId: string; eligibilityId: string; providerOperationId: string;
  intendedInputFingerprint: string; normalizedEmail: string; fullName: string;
}
export interface IdentityResult {
  requestId: string; eligibilityId: string; providerOperationId: string; subjectId: string;
  applicantKey: string; pharmacyContextId: string; state: 'EMAIL_CONFIRMATION_PENDING';
}
export interface TrustedOwnerMarker {
  contractVersion: 'owner-onboarding-v1'; requestId: string; providerOperationId: string;
  intendedInputFingerprint: string;
}
export interface ProviderIdentity {
  subjectId: string; providerOperationId: string; normalizedEmail: string; emailConfirmed: boolean;
  identityClass: 'OWNER_ONBOARDING_V1' | 'STAFF_INVITATION_BOOTSTRAP_V1' | 'UNCLASSIFIED';
  trustedOwnerMarker?: TrustedOwnerMarker;
}
export type ProviderRecovery =
  | { outcome: 'FOUND'; identity: ProviderIdentity }
  | { outcome: 'PROVEN_ABSENT' }
  | { outcome: 'UNKNOWN' };
export interface OwnerIdentityProvider {
  inspectExistingByEmail(normalizedEmail: string): Promise<ProviderIdentity | null>;
  createUnconfirmedOwner(input: { providerOperationId: string; normalizedEmail: string; fullName: string; trustedOwnerMarker: TrustedOwnerMarker }): Promise<ProviderIdentity>;
  recoverExact(providerOperationId: string): Promise<ProviderRecovery>;
}
export interface IssuanceAttempt {
  state: 'PROVIDER_PENDING' | 'COMPLETED'; originalIdentity: OperationIdentity;
  originalCredentialVersion: number; providerOperationId: string;
  authoritativeCommand: IssueIdentityCommand;
  result?: IdentityResult;
}
export interface IssuanceLookup {
  operationId: string; applicantKey: string; pharmacyContextId: string;
}
export interface IssuanceExecution {
  actor: VerifiedPrincipal; capability: Extract<GatewayCapability, 'IDENTITY_ISSUE' | 'IDENTITY_RECOVER'>;
}
/** Every repository mutation is a single authoritative transaction in a future adapter. */
export interface OwnerGatewayRepository {
  reserveAtomic(identity: OperationIdentity, command: ReserveEligibilityCommand): Promise<Applied<ReservationResult>>;
  beginIssuanceAtomic(identity: OperationIdentity, originalCredentialVersion: number, command: IssueIdentityCommand): Promise<Applied<IssuanceAttempt>>;
  authorizeProviderDispatchAtomic(execution: IssuanceExecution, lookup: IssuanceLookup): Promise<IssuanceAttempt>;
  authorizeProviderResolutionAtomic(execution: IssuanceExecution, lookup: IssuanceLookup): Promise<IssuanceAttempt>;
  completeIssuanceAtomic(execution: IssuanceExecution, lookup: IssuanceLookup, provider: ProviderIdentity): Promise<Applied<IdentityResult>>;
  completeIssuanceRecoveryAtomic(execution: IssuanceExecution, lookup: IssuanceLookup, provider: ProviderIdentity): Promise<Applied<IdentityResult>>;
  recoverCompletedIssuanceAtomic(execution: IssuanceExecution, lookup: IssuanceLookup): Promise<IdentityResult | null>;
  recoverExact<T>(identity: OperationIdentity): Promise<T | null>;
  recoverIssuanceAttempt(execution: IssuanceExecution, lookup: IssuanceLookup): Promise<IssuanceAttempt | null>;
}
export interface OwnerGatewayDependencies { authority: GatewayAuthority; repository: OwnerGatewayRepository; provider: OwnerIdentityProvider; }

const assertContext = (context: CommandContext): void => {
  if (!context || context.contractVersion !== I3_CONTRACT_VERSION) throw new Error('INVALID_COMMAND_CONTEXT');
  assertUuid(context.operationId, 'OPERATION_ID'); assertDigest(context.applicantKey, 'APPLICANT_KEY');
  assertUuid(context.pharmacyContextId, 'PHARMACY_CONTEXT_ID');
};
const normalizedEmail = (email: unknown): string => {
  if (typeof email !== 'string') throw new Error('INVALID_EMAIL');
  const value = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(value)) throw new Error('INVALID_EMAIL');
  return value;
};
const reserveFields = (c: ReserveEligibilityCommand): readonly (string | null)[] => [
  c.requestId, normalizedEmail(c.normalizedEmail), c.pharmacyName.trim(), c.currency.trim().toUpperCase(),
  c.admissionDecisionId, c.replacesRequestId ?? null,
];
const issueFields = (c: IssueIdentityCommand): readonly (string | null)[] => [
  c.requestId, c.eligibilityId, c.providerOperationId, c.intendedInputFingerprint,
  normalizedEmail(c.normalizedEmail), c.fullName.trim(),
];
const validateReserve = (c: ReserveEligibilityCommand): void => {
  assertContext(c.context); assertUuid(c.requestId, 'REQUEST_ID'); assertUuid(c.admissionDecisionId, 'ADMISSION_DECISION_ID');
  if (c.replacesRequestId !== undefined) assertUuid(c.replacesRequestId, 'REPLACES_REQUEST_ID');
  normalizedEmail(c.normalizedEmail); assertText(c.pharmacyName, 'PHARMACY_NAME', 120);
  if (typeof c.currency !== 'string' || !/^[A-Za-z]{3}$/.test(c.currency.trim())) throw new Error('INVALID_CURRENCY');
};
const validateIssue = (c: IssueIdentityCommand): void => {
  assertContext(c.context); assertUuid(c.requestId, 'REQUEST_ID'); assertUuid(c.eligibilityId, 'ELIGIBILITY_ID');
  assertUuid(c.providerOperationId, 'PROVIDER_OPERATION_ID'); assertDigest(c.intendedInputFingerprint, 'INTENDED_INPUT_FINGERPRINT');
  normalizedEmail(c.normalizedEmail); assertText(c.fullName, 'FULL_NAME', 120);
};
const assertEmailBinding = async (email: string, key: string): Promise<void> => {
  if (await sha256Text(normalizedEmail(email)) !== key) throw new Error('APPLICANT_KEY_CONFLICT');
};
const markerFor = (c: IssueIdentityCommand): TrustedOwnerMarker => ({
  contractVersion: 'owner-onboarding-v1', requestId: c.requestId,
  providerOperationId: c.providerOperationId, intendedInputFingerprint: c.intendedInputFingerprint,
});
const assertProviderBinding = (p: ProviderIdentity, c: IssueIdentityCommand): void => {
  assertUuid(p.subjectId, 'SUBJECT_ID');
  const marker = p.trustedOwnerMarker;
  if (p.providerOperationId !== c.providerOperationId || p.normalizedEmail !== normalizedEmail(c.normalizedEmail)) throw new Error('PROVIDER_OPERATION_CONFLICT');
  if (p.identityClass === 'STAFF_INVITATION_BOOTSTRAP_V1') throw new Error('STAFF_IDENTITY_PROTECTED');
  if (p.identityClass !== 'OWNER_ONBOARDING_V1' || !marker || marker.contractVersion !== 'owner-onboarding-v1' ||
      marker.requestId !== c.requestId || marker.providerOperationId !== c.providerOperationId ||
      marker.intendedInputFingerprint !== c.intendedInputFingerprint) throw new Error('TRUSTED_OWNER_MARKER_CONFLICT');
  if (p.emailConfirmed) throw new Error('AUTHENTICATED_CONTINUATION_REQUIRED');
};

const scopeFor = (context: CommandContext) => ({
  applicantKey: context.applicantKey,
  pharmacyContextId: context.pharmacyContextId,
});
const lookupFor = (context: CommandContext): IssuanceLookup => ({
  operationId: context.operationId,
  ...scopeFor(context),
});
const requireExecution = async (
  credential: PresentedCredential,
  capability: IssuanceExecution['capability'],
  context: CommandContext,
  d: OwnerGatewayDependencies,
): Promise<IssuanceExecution> => ({
  actor: await d.authority.requireGatewayForContext(credential, capability, scopeFor(context)),
  capability,
});

export async function reserveOwnerEligibility(credential: PresentedCredential, command: ReserveEligibilityCommand, d: OwnerGatewayDependencies): Promise<Applied<ReservationResult>> {
  validateReserve(command); await assertEmailBinding(command.normalizedEmail, command.context.applicantKey);
  const principal = await d.authority.requireGateway(credential, 'ELIGIBILITY_RESERVE');
  const identity = await commandIdentity(principal, 'ELIGIBILITY_RESERVE', command.context, reserveFields(command));
  return immutableCopy(await d.repository.reserveAtomic(identity, immutableCopy(command)));
}
export async function recoverReservedEligibility(credential: PresentedCredential, command: ReserveEligibilityCommand, d: OwnerGatewayDependencies): Promise<ReservationResult> {
  validateReserve(command); await assertEmailBinding(command.normalizedEmail, command.context.applicantKey);
  const principal = await d.authority.requireGateway(credential, 'ELIGIBILITY_RESERVE');
  const identity = await commandIdentity(principal, 'ELIGIBILITY_RESERVE', command.context, reserveFields(command));
  const result = await d.repository.recoverExact<ReservationResult>(identity);
  if (!result) throw new Error('AUTHORITATIVE_RESULT_NOT_FOUND'); return immutableCopy(result);
}

const complete = async (credential: PresentedCredential, attempt: IssuanceAttempt, provider: ProviderIdentity, d: OwnerGatewayDependencies): Promise<Applied<IdentityResult>> => {
  const command = attempt.authoritativeCommand;
  assertProviderBinding(provider, command);
  const lookup = lookupFor(command.context);
  const execution = await requireExecution(credential, 'IDENTITY_ISSUE', command.context, d);
  try { return immutableCopy(await d.repository.completeIssuanceAtomic(execution, lookup, immutableCopy(provider))); }
  catch (error) {
    if (!(error instanceof AmbiguousOutcomeError)) throw error;
    const lookupExecution = await requireExecution(credential, 'IDENTITY_ISSUE', command.context, d);
    const result = await d.repository.recoverCompletedIssuanceAtomic(lookupExecution, lookup);
    if (!result) throw new Error('DATABASE_EXACT_RECOVERY_REQUIRED');
    return { outcome: 'REPLAY', result: immutableCopy(result) };
  }
};

const completeRecovery = async (credential: PresentedCredential, attempt: IssuanceAttempt, provider: ProviderIdentity, d: OwnerGatewayDependencies): Promise<Applied<IdentityResult>> => {
  const command = attempt.authoritativeCommand;
  assertProviderBinding(provider, command);
  const lookup = lookupFor(command.context);
  const execution = await requireExecution(credential, 'IDENTITY_RECOVER', command.context, d);
  try { return immutableCopy(await d.repository.completeIssuanceRecoveryAtomic(execution, lookup, immutableCopy(provider))); }
  catch (error) {
    if (!(error instanceof AmbiguousOutcomeError)) throw error;
    const lookupExecution = await requireExecution(credential, 'IDENTITY_RECOVER', command.context, d);
    const result = await d.repository.recoverCompletedIssuanceAtomic(lookupExecution, lookup);
    if (!result) throw new Error('DATABASE_EXACT_RECOVERY_REQUIRED');
    return { outcome: 'REPLAY', result: immutableCopy(result) };
  }
};

export async function issueOwnerIdentity(credential: PresentedCredential, command: IssueIdentityCommand, d: OwnerGatewayDependencies): Promise<Applied<IdentityResult>> {
  validateIssue(command); await assertEmailBinding(command.normalizedEmail, command.context.applicantKey);
  const principal = await d.authority.requireGatewayForContext(credential, 'IDENTITY_ISSUE', scopeFor(command.context));
  const identity = await commandIdentity(principal, 'IDENTITY_ISSUE', command.context, issueFields(command));
  // This transaction validates the authoritative reservation and durably records PROVIDER_PENDING before any provider call.
  const begun = await d.repository.beginIssuanceAtomic(identity, principal.credentialVersion, immutableCopy(command));
  if (begun.result.state === 'COMPLETED' && begun.result.result) return { outcome: 'REPLAY', result: immutableCopy(begun.result.result) };

  // A new attempt may dispatch under issue authority. A restarted or ambiguous attempt may only resolve
  // under recovery authority. In both cases the repository reloads the immutable original command.
  let recoveryPhase = begun.outcome === 'REPLAY';
  let attempt: IssuanceAttempt;
  if (recoveryPhase) {
    const resolutionExecution = await requireExecution(credential, 'IDENTITY_RECOVER', command.context, d);
    attempt = await d.repository.authorizeProviderResolutionAtomic(resolutionExecution, lookupFor(command.context));
  } else {
    const dispatchExecution = await requireExecution(credential, 'IDENTITY_ISSUE', command.context, d);
    attempt = await d.repository.authorizeProviderDispatchAtomic(dispatchExecution, lookupFor(command.context));
  }
  let authoritativeCommand = attempt.authoritativeCommand;
  let provider: ProviderIdentity | null = null;
  if (recoveryPhase) {
    const recovery = await d.provider.recoverExact(authoritativeCommand.providerOperationId);
    if (recovery.outcome !== 'FOUND') throw new Error('ISSUANCE_RECOVERY_PENDING');
    provider = recovery.identity;
  } else {
    const existing = await d.provider.inspectExistingByEmail(normalizedEmail(authoritativeCommand.normalizedEmail));
    if (existing) provider = existing;
    else {
      try {
        provider = await d.provider.createUnconfirmedOwner({ providerOperationId: authoritativeCommand.providerOperationId, normalizedEmail: normalizedEmail(authoritativeCommand.normalizedEmail), fullName: authoritativeCommand.fullName.trim(), trustedOwnerMarker: markerFor(authoritativeCommand) });
      } catch (error) {
        if (!(error instanceof AmbiguousOutcomeError)) throw error;
        const recoveryExecution = await requireExecution(credential, 'IDENTITY_RECOVER', authoritativeCommand.context, d);
        const recoveryAttempt = await d.repository.authorizeProviderResolutionAtomic(recoveryExecution, lookupFor(authoritativeCommand.context));
        recoveryPhase = true;
        attempt = recoveryAttempt;
        authoritativeCommand = recoveryAttempt.authoritativeCommand;
        const recovery = await d.provider.recoverExact(recoveryAttempt.providerOperationId);
        if (recovery.outcome !== 'FOUND') throw new Error('ISSUANCE_RECOVERY_PENDING');
        provider = recovery.identity;
      }
    }
  }
  return recoveryPhase ? completeRecovery(credential, attempt, provider, d) : complete(credential, attempt, provider, d);
}

export async function recoverIssuedIdentity(credential: PresentedCredential, command: IssueIdentityCommand, d: OwnerGatewayDependencies): Promise<IdentityResult> {
  validateIssue(command); await assertEmailBinding(command.normalizedEmail, command.context.applicantKey);
  const lookup = lookupFor(command.context);
  const lookupExecution = await requireExecution(credential, 'IDENTITY_RECOVER', command.context, d);
  const attempt = await d.repository.recoverIssuanceAttempt(lookupExecution, lookup);
  if (!attempt) throw new Error('AUTHORITATIVE_RESULT_NOT_FOUND');
  if (attempt.state === 'COMPLETED' && attempt.result) return immutableCopy(attempt.result);
  const resolutionExecution = await requireExecution(credential, 'IDENTITY_RECOVER', attempt.authoritativeCommand.context, d);
  const resolutionAttempt = await d.repository.authorizeProviderResolutionAtomic(resolutionExecution, lookupFor(attempt.authoritativeCommand.context));
  const recovery = await d.provider.recoverExact(resolutionAttempt.providerOperationId);
  if (recovery.outcome !== 'FOUND') throw new Error('ISSUANCE_RECOVERY_PENDING');
  return (await completeRecovery(credential, resolutionAttempt, recovery.identity, d)).result;
}
