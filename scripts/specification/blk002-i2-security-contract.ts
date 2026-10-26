/**
 * BLK-002-I2 corrected executable security specification.
 *
 * This is a deterministic in-memory contract model. It is not a gateway,
 * provider adapter, database client, privileged endpoint, or concurrency test.
 */

import { createHash } from 'node:crypto';

export type OperatorPermission =
  | 'ADMISSION_APPROVE'
  | 'ADMISSION_REPLACE'
  | 'ADMISSION_REVOKE'
  | 'ELIGIBILITY_REVOKE';

export type GatewayCapability =
  | 'ELIGIBILITY_RESERVE'
  | 'IDENTITY_ISSUE'
  | 'IDENTITY_RECOVER';

export type Action =
  | 'ADMISSION_APPROVE'
  | 'ADMISSION_REPLACE'
  | 'ADMISSION_REVOKE'
  | 'ELIGIBILITY_RESERVE'
  | 'IDENTITY_ISSUE'
  | 'ELIGIBILITY_REVOKE'
  | 'ELIGIBILITY_CONSUME';

export type EligibilityState = 'RESERVED' | 'ISSUED' | 'REVOKED' | 'CONSUMED';
export type Outcome = 'APPLIED' | 'REPLAY';

export interface OperationBinding {
  operationId: string;
  applicantId: string;
  pharmacyContext: string;
  contractVersion: 'blk-002-i2-v1';
}

interface CommandBase {
  action: Action;
  binding: OperationBinding;
}

export interface ApproveAdmissionCommand extends CommandBase {
  action: 'ADMISSION_APPROVE';
  admissionId: string;
  decisionEvidenceId: string;
}

export interface ReplaceAdmissionCommand extends CommandBase {
  action: 'ADMISSION_REPLACE';
  predecessorAdmissionId: string;
  replacementAdmissionId: string;
  decisionEvidenceId: string;
}

export interface RevokeAdmissionCommand extends CommandBase {
  action: 'ADMISSION_REVOKE';
  admissionId: string;
  reasonCode: string;
}

export interface ReserveEligibilityCommand extends CommandBase {
  action: 'ELIGIBILITY_RESERVE';
  admissionId: string;
  eligibilityId: string;
}

export interface IssueIdentityCommand extends CommandBase {
  action: 'IDENTITY_ISSUE';
  eligibilityId: string;
  providerOperationId: string;
}

export interface RevokeEligibilityCommand extends CommandBase {
  action: 'ELIGIBILITY_REVOKE';
  eligibilityId: string;
  reasonCode: string;
}

export interface ConsumeEligibilityCommand extends CommandBase {
  action: 'ELIGIBILITY_CONSUME';
  eligibilityId: string;
  canonicalResult: Readonly<Record<string, unknown>>;
}

export type SecurityCommand =
  | ApproveAdmissionCommand
  | ReplaceAdmissionCommand
  | RevokeAdmissionCommand
  | ReserveEligibilityCommand
  | IssueIdentityCommand
  | RevokeEligibilityCommand
  | ConsumeEligibilityCommand;

export interface PresentedCredential {
  token: string;
}

export interface AuthorizationRequest {
  action: Action;
  mode: 'EXECUTE' | 'RECOVER';
  applicantId: string;
  pharmacyContext: string;
}

export interface AuthorizedActor {
  actorId: string;
  actorKind: 'OPERATOR' | 'GATEWAY' | 'APPLICANT';
  credentialVersion: number;
}

/** The implementation must derive current identity/authority from trusted credential evidence. */
export interface TrustedAuthorityBoundary {
  authorize(credential: PresentedCredential, request: Readonly<AuthorizationRequest>): AuthorizedActor;
}

export interface AuditEvent {
  sequence: number;
  operationId: string;
  action: Action;
  actorId: string;
  actorKind: AuthorizedActor['actorKind'];
  credentialVersion: number;
  applicantId: string;
  pharmacyContext: string;
  commandFingerprint: string;
  resultId: string;
  result: 'APPLIED';
}

/** Preparation may fail; prepared evidence is committed with model state in one state-root swap. */
export interface AuditBoundary {
  prepare(event: Readonly<AuditEvent>): Readonly<AuditEvent>;
}

export class MemoryAuditBoundary implements AuditBoundary {
  failNext = false;
  prepare(event: Readonly<AuditEvent>): Readonly<AuditEvent> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('AUDIT_PREPARE_FAILED');
    }
    return immutableCopy(event);
  }
}

export interface AdmissionResult {
  id: string;
  applicantId: string;
  pharmacyContext: string;
  state: 'ACTIVE' | 'REVOKED';
  decisionEvidenceId: string;
  replacesAdmissionId?: string;
}

export interface EligibilityResult {
  id: string;
  admissionId: string;
  applicantId: string;
  pharmacyContext: string;
  state: EligibilityState;
  providerOperationId?: string;
  consumedResult?: Readonly<Record<string, unknown>>;
}

type CommandResult = AdmissionResult | EligibilityResult | Readonly<Record<string, unknown>>;

interface DurableOperation {
  action: Action;
  actorId: string;
  fingerprint: string;
  resultId: string;
  result: CommandResult;
}

interface ModelState {
  admissions: Map<string, AdmissionResult>;
  eligibilities: Map<string, EligibilityResult>;
  operations: Map<string, DurableOperation>;
  audits: Readonly<AuditEvent>[];
  sequence: number;
}

const canonicalize = (value: unknown): string => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('NON_CANONICAL_COMMAND');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
  }
  throw new Error('NON_CANONICAL_COMMAND');
};

const deepClone = <T>(value: T): T => {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => deepClone(entry)) as T;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, deepClone(entry)])) as T;
};

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry);
  }
  return value;
};

const immutableCopy = <T>(value: T): T => deepFreeze(deepClone(value));

const canonicalCommandPayload = (command: SecurityCommand): Record<string, unknown> => {
  const common = { action: command.action, binding: command.binding };
  switch (command.action) {
    case 'ADMISSION_APPROVE': return { ...common, admissionId: command.admissionId, decisionEvidenceId: command.decisionEvidenceId };
    case 'ADMISSION_REPLACE': return { ...common, predecessorAdmissionId: command.predecessorAdmissionId, replacementAdmissionId: command.replacementAdmissionId, decisionEvidenceId: command.decisionEvidenceId };
    case 'ADMISSION_REVOKE': return { ...common, admissionId: command.admissionId, reasonCode: command.reasonCode };
    case 'ELIGIBILITY_RESERVE': return { ...common, admissionId: command.admissionId, eligibilityId: command.eligibilityId };
    case 'IDENTITY_ISSUE': return { ...common, eligibilityId: command.eligibilityId, providerOperationId: command.providerOperationId };
    case 'ELIGIBILITY_REVOKE': return { ...common, eligibilityId: command.eligibilityId, reasonCode: command.reasonCode };
    case 'ELIGIBILITY_CONSUME': return { ...common, eligibilityId: command.eligibilityId, canonicalResult: command.canonicalResult };
  }
};

/** Credential version and untyped extra input are excluded: rotation must not change operation identity. */
export const commandFingerprint = (command: SecurityCommand, stableActorId: string): string => createHash('sha256')
  .update(canonicalize({ stableActorId, command: canonicalCommandPayload(command) }))
  .digest('hex');

const cloneState = (state: ModelState): ModelState => ({
  admissions: new Map([...state.admissions].map(([key, value]) => [key, deepClone(value)])),
  eligibilities: new Map([...state.eligibilities].map(([key, value]) => [key, deepClone(value)])),
  operations: new Map([...state.operations].map(([key, value]) => [key, deepClone(value)])),
  audits: [...state.audits],
  sequence: state.sequence,
});

const requiredPermission = (action: Action): OperatorPermission | null => {
  if (action === 'ADMISSION_APPROVE') return 'ADMISSION_APPROVE';
  if (action === 'ADMISSION_REPLACE') return 'ADMISSION_REPLACE';
  if (action === 'ADMISSION_REVOKE') return 'ADMISSION_REVOKE';
  if (action === 'ELIGIBILITY_REVOKE') return 'ELIGIBILITY_REVOKE';
  return null;
};

const requiredGatewayCapability = (action: Action, mode: AuthorizationRequest['mode']): GatewayCapability | null => {
  if (action === 'ELIGIBILITY_RESERVE') return 'ELIGIBILITY_RESERVE';
  if (action === 'IDENTITY_ISSUE') return mode === 'RECOVER' ? 'IDENTITY_RECOVER' : 'IDENTITY_ISSUE';
  return null;
};

/** Helper exported for deterministic tests; it stands in for a trusted identity verifier. */
export class MemoryTrustedAuthorityBoundary implements TrustedAuthorityBoundary {
  private credentials = new Map<string, {
    actorId: string;
    actorKind: AuthorizedActor['actorKind'];
    credentialVersion: number;
    active: boolean;
    permissions: ReadonlySet<OperatorPermission>;
    capabilities: ReadonlySet<GatewayCapability>;
  }>();

  register(input: {
    token: string;
    actorId: string;
    actorKind: AuthorizedActor['actorKind'];
    credentialVersion: number;
    active: boolean;
    permissions?: ReadonlySet<OperatorPermission>;
    capabilities?: ReadonlySet<GatewayCapability>;
  }): void {
    this.credentials.set(input.token, {
      ...input,
      permissions: input.permissions ?? new Set(),
      capabilities: input.capabilities ?? new Set(),
    });
  }

  authorize(credential: PresentedCredential, request: Readonly<AuthorizationRequest>): AuthorizedActor {
    const record = this.credentials.get(credential.token);
    if (!record?.active) throw new Error('CURRENT_AUTHORITY_DENIED');
    const permission = requiredPermission(request.action);
    const capability = requiredGatewayCapability(request.action, request.mode);
    if (permission && (record.actorKind !== 'OPERATOR' || !record.permissions.has(permission))) throw new Error('CURRENT_AUTHORITY_DENIED');
    if (capability && (record.actorKind !== 'GATEWAY' || !record.capabilities.has(capability))) throw new Error('CURRENT_AUTHORITY_DENIED');
    if (request.action === 'ELIGIBILITY_CONSUME' && (record.actorKind !== 'APPLICANT' || record.actorId !== request.applicantId)) {
      throw new Error('CURRENT_AUTHORITY_DENIED');
    }
    return { actorId: record.actorId, actorKind: record.actorKind, credentialVersion: record.credentialVersion };
  }
}

export class GatewayProviderSecurityContract {
  private state: ModelState = {
    admissions: new Map(),
    eligibilities: new Map(),
    operations: new Map(),
    audits: [],
    sequence: 0,
  };

  constructor(
    private readonly authority: TrustedAuthorityBoundary,
    private readonly auditBoundary: AuditBoundary,
  ) {}

  private authorize(credential: PresentedCredential, command: SecurityCommand, mode: AuthorizationRequest['mode']): AuthorizedActor {
    return this.authority.authorize(credential, {
      action: command.action,
      mode,
      applicantId: command.binding.applicantId,
      pharmacyContext: command.binding.pharmacyContext,
    });
  }

  private apply<T extends CommandResult>(
    credential: PresentedCredential,
    command: SecurityCommand,
    resultId: string,
    work: (draft: ModelState) => T,
  ): { outcome: Outcome; result: T } {
    const actor = this.authorize(credential, command, 'EXECUTE');
    const fingerprint = commandFingerprint(command, actor.actorId);
    const prior = this.state.operations.get(command.binding.operationId);
    if (prior) {
      if (prior.action !== command.action) throw new Error('ACTION_MISMATCH');
      if (prior.actorId !== actor.actorId || prior.fingerprint !== fingerprint) throw new Error('OPERATION_CONFLICT');
      return { outcome: 'REPLAY', result: immutableCopy(prior.result as T) };
    }

    const draft = cloneState(this.state);
    const result = immutableCopy(work(draft));
    const event = this.auditBoundary.prepare({
      sequence: draft.sequence + 1,
      operationId: command.binding.operationId,
      action: command.action,
      actorId: actor.actorId,
      actorKind: actor.actorKind,
      credentialVersion: actor.credentialVersion,
      applicantId: command.binding.applicantId,
      pharmacyContext: command.binding.pharmacyContext,
      commandFingerprint: fingerprint,
      resultId,
      result: 'APPLIED',
    });
    draft.sequence += 1;
    draft.operations.set(command.binding.operationId, {
      action: command.action,
      actorId: actor.actorId,
      fingerprint,
      resultId,
      result,
    });
    draft.audits.push(event);
    this.state = draft;
    return { outcome: 'APPLIED', result: immutableCopy(result) };
  }

  recoverOperation<T extends CommandResult>(credential: PresentedCredential, command: SecurityCommand): T {
    const actor = this.authorize(credential, command, 'RECOVER');
    const prior = this.state.operations.get(command.binding.operationId);
    if (!prior) throw new Error('AUTHORITATIVE_RESULT_NOT_FOUND');
    if (prior.action !== command.action) throw new Error('ACTION_MISMATCH');
    if (prior.actorId !== actor.actorId || prior.fingerprint !== commandFingerprint(command, actor.actorId)) throw new Error('OPERATION_CONFLICT');
    return immutableCopy(prior.result as T);
  }

  approveAdmission(credential: PresentedCredential, command: ApproveAdmissionCommand): { outcome: Outcome; result: AdmissionResult } {
    return this.apply(credential, command, command.admissionId, (draft) => {
      if (draft.admissions.has(command.admissionId)) throw new Error('DUPLICATE_ADMISSION_ID');
      if ([...draft.admissions.values()].some((row) => row.applicantId === command.binding.applicantId && row.pharmacyContext === command.binding.pharmacyContext && row.state === 'ACTIVE')) {
        throw new Error('ACTIVE_ADMISSION_EXISTS');
      }
      const row: AdmissionResult = {
        id: command.admissionId,
        applicantId: command.binding.applicantId,
        pharmacyContext: command.binding.pharmacyContext,
        state: 'ACTIVE',
        decisionEvidenceId: command.decisionEvidenceId,
      };
      draft.admissions.set(row.id, row);
      return row;
    });
  }

  replaceAdmission(credential: PresentedCredential, command: ReplaceAdmissionCommand): { outcome: Outcome; result: AdmissionResult } {
    return this.apply(credential, command, command.replacementAdmissionId, (draft) => {
      if (command.predecessorAdmissionId === command.replacementAdmissionId || draft.admissions.has(command.replacementAdmissionId)) throw new Error('DUPLICATE_ADMISSION_ID');
      const old = draft.admissions.get(command.predecessorAdmissionId);
      if (!old || old.applicantId !== command.binding.applicantId || old.pharmacyContext !== command.binding.pharmacyContext) throw new Error('ADMISSION_BINDING_CONFLICT');
      if (old.state !== 'ACTIVE') throw new Error('ADMISSION_NOT_ACTIVE');
      old.state = 'REVOKED';
      const replacement: AdmissionResult = {
        id: command.replacementAdmissionId,
        applicantId: old.applicantId,
        pharmacyContext: old.pharmacyContext,
        state: 'ACTIVE',
        decisionEvidenceId: command.decisionEvidenceId,
        replacesAdmissionId: old.id,
      };
      draft.admissions.set(replacement.id, replacement);
      return replacement;
    });
  }

  revokeAdmission(credential: PresentedCredential, command: RevokeAdmissionCommand): { outcome: Outcome; result: AdmissionResult } {
    return this.apply(credential, command, command.admissionId, (draft) => {
      const row = draft.admissions.get(command.admissionId);
      if (!row || row.applicantId !== command.binding.applicantId || row.pharmacyContext !== command.binding.pharmacyContext) throw new Error('ADMISSION_BINDING_CONFLICT');
      row.state = 'REVOKED';
      return row;
    });
  }

  reserveEligibility(credential: PresentedCredential, command: ReserveEligibilityCommand): { outcome: Outcome; result: EligibilityResult } {
    return this.apply(credential, command, command.eligibilityId, (draft) => {
      if (draft.eligibilities.has(command.eligibilityId)) throw new Error('DUPLICATE_ELIGIBILITY_ID');
      const admission = draft.admissions.get(command.admissionId);
      if (!admission || admission.state !== 'ACTIVE') throw new Error('ADMISSION_NOT_ACTIVE');
      if (admission.applicantId !== command.binding.applicantId || admission.pharmacyContext !== command.binding.pharmacyContext) throw new Error('ADMISSION_BINDING_CONFLICT');
      if ([...draft.eligibilities.values()].some((row) => row.applicantId === command.binding.applicantId && row.pharmacyContext === command.binding.pharmacyContext && (row.state === 'RESERVED' || row.state === 'ISSUED'))) {
        throw new Error('OPEN_ELIGIBILITY_EXISTS');
      }
      const row: EligibilityResult = {
        id: command.eligibilityId,
        admissionId: command.admissionId,
        applicantId: command.binding.applicantId,
        pharmacyContext: command.binding.pharmacyContext,
        state: 'RESERVED',
      };
      draft.eligibilities.set(row.id, row);
      return row;
    });
  }

  markIssued(credential: PresentedCredential, command: IssueIdentityCommand): { outcome: Outcome; result: EligibilityResult } {
    return this.apply(credential, command, command.eligibilityId, (draft) => {
      if ([...draft.eligibilities.values()].some((row) => row.id !== command.eligibilityId && row.providerOperationId === command.providerOperationId)) {
        throw new Error('DUPLICATE_PROVIDER_OPERATION_ID');
      }
      const row = draft.eligibilities.get(command.eligibilityId);
      if (!row || row.applicantId !== command.binding.applicantId || row.pharmacyContext !== command.binding.pharmacyContext) throw new Error('ELIGIBILITY_BINDING_CONFLICT');
      if (row.state !== 'RESERVED') throw new Error('ELIGIBILITY_NOT_RESERVED');
      row.state = 'ISSUED';
      row.providerOperationId = command.providerOperationId;
      return row;
    });
  }

  revokeEligibility(credential: PresentedCredential, command: RevokeEligibilityCommand): { outcome: Outcome; result: EligibilityResult } {
    return this.apply(credential, command, command.eligibilityId, (draft) => {
      const row = draft.eligibilities.get(command.eligibilityId);
      if (!row || row.applicantId !== command.binding.applicantId || row.pharmacyContext !== command.binding.pharmacyContext) throw new Error('ELIGIBILITY_BINDING_CONFLICT');
      if (row.state === 'CONSUMED') throw new Error('CONSUMED_IMMUTABLE');
      row.state = 'REVOKED';
      return row;
    });
  }

  consumeEligibility(credential: PresentedCredential, command: ConsumeEligibilityCommand): { outcome: Outcome; result: Readonly<Record<string, unknown>> } {
    return this.apply(credential, command, command.eligibilityId, (draft) => {
      const row = draft.eligibilities.get(command.eligibilityId);
      if (!row || row.applicantId !== command.binding.applicantId || row.pharmacyContext !== command.binding.pharmacyContext) throw new Error('ELIGIBILITY_BINDING_CONFLICT');
      if (row.state === 'REVOKED') throw new Error('ELIGIBILITY_REVOKED');
      if (row.state !== 'ISSUED') throw new Error('ELIGIBILITY_NOT_ISSUED');
      row.state = 'CONSUMED';
      row.consumedResult = immutableCopy(command.canonicalResult);
      return row.consumedResult;
    });
  }

  eligibilityState(id: string): EligibilityState | undefined {
    return this.state.eligibilities.get(id)?.state;
  }

  admissionState(id: string): AdmissionResult['state'] | undefined {
    return this.state.admissions.get(id)?.state;
  }

  auditEvents(): ReadonlyArray<Readonly<AuditEvent>> {
    return immutableCopy(this.state.audits);
  }

  operationCount(): number {
    return this.state.operations.size;
  }
}
