export interface AdminPharmacySummary {
  key: string;
  id: string | null;
  name: string | null;
  subscriptionPlan: string | null;
  subscriptionExpiresAt: string | null;
  createdAt: string | null;
}

export type AdminDataFailureReason =
  | 'missing_client'
  | 'query_rejected'
  | 'invalid_response';

export type AdminDataState =
  | { status: 'loading'; records: [] }
  | { status: 'error'; records: []; reason: AdminDataFailureReason; message: string }
  | { status: 'empty'; records: [] }
  | { status: 'ready'; records: AdminPharmacySummary[] };

export interface AdminQueryResult {
  data: unknown;
  error?: unknown;
}

export type AdminPharmacyQuery = () => PromiseLike<AdminQueryResult> | null;

export const createAdminLoadingState = (): AdminDataState => ({
  status: 'loading',
  records: [],
});

function unavailableError(reason: AdminDataFailureReason): AdminDataState {
  const messages: Record<AdminDataFailureReason, string> = {
    missing_client:
      'Authoritative PharmacyFlow data is unavailable because the Admin Support client is not configured. No demo records were loaded.',
    query_rejected:
      'Admin Support could not load authoritative PharmacyFlow data. No demo records were substituted.',
    invalid_response:
      'Admin Support received an invalid authoritative data response. No operational data is being shown.',
  };

  return { status: 'error', records: [], reason, message: messages[reason] };
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function normalizeAdminPharmacyRows(rows: unknown[]): AdminPharmacySummary[] {
  return rows.map((row, index) => {
    const record = row && typeof row === 'object' ? row as Record<string, unknown> : {};
    const id = readOptionalString(record.id);

    return {
      key: id || `unavailable-${index}`,
      id,
      name: readOptionalString(record.name),
      subscriptionPlan: readOptionalString(record.subscription_plan),
      subscriptionExpiresAt: readOptionalString(record.subscription_expires_at),
      createdAt: readOptionalString(record.created_at),
    };
  });
}

export async function loadAdminPharmacyData(
  runQuery: AdminPharmacyQuery,
): Promise<AdminDataState> {
  try {
    const pendingResult = runQuery();
    if (!pendingResult) return unavailableError('missing_client');

    const result = await pendingResult;
    if (result.error) return unavailableError('query_rejected');
    if (!Array.isArray(result.data)) return unavailableError('invalid_response');
    if (result.data.length === 0) return { status: 'empty', records: [] };

    return { status: 'ready', records: normalizeAdminPharmacyRows(result.data) };
  } catch {
    return unavailableError('query_rejected');
  }
}

export interface AdminControlReadiness {
  refreshEnabled: boolean;
  operationalMutationsEnabled: false;
  mutationReason: string;
}

export function getAdminControlReadiness(state: AdminDataState): AdminControlReadiness {
  return {
    refreshEnabled: state.status !== 'loading',
    operationalMutationsEnabled: false,
    mutationReason:
      'Privileged Admin Support actions are unavailable until an approved backend contract, authorization check, persistence result, and audit result are implemented.',
  };
}
