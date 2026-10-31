import type { Subscription, SubscriptionStatus } from '../../types/database';
import {
  SubscriptionLifecycleState,
  SubscriptionLifecycle,
  SubscriptionCapabilities,
  AuthoritativeEntitlementPayload,
  resolveCapabilities,
} from './capabilities';

export type {
  SubscriptionLifecycleState,
  SubscriptionLifecycle,
  SubscriptionCapabilities,
  AuthoritativeEntitlementPayload,
};

export { resolveCapabilities };

const GRACE_MS = 7 * 24 * 60 * 60 * 1000;

function result(
  state: SubscriptionLifecycleState,
  reason: string,
  periodEnd: string | null = null,
  graceEnd: string | null = null,
  authoritative = false,
  pharmacyId: string | null = null,
  serverTime: string | null = null,
): SubscriptionLifecycle {
  return {
    state,
    mutationAllowed: state === 'TRIAL' || state === 'ACTIVE' || state === 'GRACE',
    historicalReadAllowed: true,
    periodEnd,
    graceEnd,
    authoritative,
    pharmacyId,
    serverTime,
    reason,
    capabilities: resolveCapabilities(state),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const VALID_STATES = new Set<SubscriptionLifecycleState>([
  'TRIAL',
  'ACTIVE',
  'GRACE',
  'EXPIRED',
  'SUSPENDED',
  'UNKNOWN',
]);

/**
 * Resolves subscription lifecycle from a database subscription row using advisory local/UTC time.
 * This is an advisory client projection; the authoritative state is derived on the server by rpc_get_effective_entitlement_v1.
 */
export function resolveSubscriptionLifecycle(
  subscription: Subscription | null,
  now: Date = new Date(),
): SubscriptionLifecycle {
  if (!subscription) {
    return result('UNKNOWN', 'No authoritative subscription record was loaded. New mutations are blocked locally.');
  }

  const status = subscription.status as SubscriptionStatus | 'SUSPENDED';
  if (status === 'SUSPENDED') {
    return result('SUSPENDED', 'The subscription is suspended. New mutations are blocked.');
  }
  if (status === 'CANCELLED' || status === 'EXPIRED') {
    return result('EXPIRED', `The subscription record is ${status}. New mutations are blocked.`, subscription.current_period_end || null);
  }

  const periodEndMs = Date.parse(subscription.current_period_end);
  if (!Number.isFinite(periodEndMs) || !Number.isFinite(now.getTime())) {
    return result('UNKNOWN', 'Subscription timing evidence is incomplete or invalid. New mutations are blocked locally.');
  }

  const graceEndMs = periodEndMs + GRACE_MS;
  const periodEnd = new Date(periodEndMs).toISOString();
  const graceEnd = new Date(graceEndMs).toISOString();

  if (status === 'PAST_DUE') {
    if (now.getTime() < graceEndMs) {
      return result('GRACE', 'Payment is past due within the approved grace window.', periodEnd, graceEnd);
    }
    return result('EXPIRED', 'The approved grace window has ended.', periodEnd, graceEnd);
  }

  if (now.getTime() < periodEndMs) {
    return result(status, status === 'TRIAL' ? 'Trial access is within its recorded period.' : 'Paid access is within its recorded period.', periodEnd, graceEnd);
  }
  if (now.getTime() < graceEndMs) {
    return result('GRACE', 'The recorded period ended and the approved seven-day grace window is active.', periodEnd, graceEnd);
  }
  return result('EXPIRED', 'The recorded period and approved grace window have ended.', periodEnd, graceEnd);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RFC3339_REGEX = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;

export function parseStrictTimestamp(value: unknown): number | null {
  const micros = parseStrictTimestampMicros(value);
  return micros === null ? null : Number(micros / 1000n);
}

/** PostgreSQL-compatible RFC 3339 instant at microsecond precision. */
export function parseStrictTimestampMicros(value: unknown): bigint | null {
  if (typeof value !== 'string') return null;
  const match = RFC3339_REGEX.exec(value);
  if (!match) return null;
  const [, ys, mos, ds, hs, mis, ss, fraction = '', zone] = match;
  const year = Number(ys); const month = Number(mos); const day = Number(ds);
  const hour = Number(hs); const minute = Number(mis); const second = Number(ss);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const local = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  const check = new Date(local);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  let offsetMinutes = 0;
  if (zone !== 'Z') {
    const sign = zone[0] === '+' ? 1 : -1;
    const offsetHour = Number(zone.slice(1, 3)); const offsetMinute = Number(zone.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) return null;
    offsetMinutes = sign * (offsetHour * 60 + offsetMinute);
  }
  return BigInt(local - offsetMinutes * 60_000) * 1000n + BigInt((fraction + '000000').slice(0, 6));
}

/**
 * Resolves and validates an authoritative entitlement payload returned by rpc_get_effective_entitlement_v1.
 * Fails closed to UNKNOWN if the server response is null, non-record, or contains invalid/corrupted evidence.
 */
export function resolveAuthoritativeEntitlement(payload: unknown, expectedPharmacyId: string): SubscriptionLifecycle {
  if (!UUID_REGEX.test(expectedPharmacyId)) {
    return result('UNKNOWN', 'Entitlement request scope is invalid. Mutations blocked.');
  }
  if (!isRecord(payload)) {
    return result('UNKNOWN', 'Authoritative entitlement payload is missing or malformed. Mutations blocked.', null, null, false);
  }

  // 1. Validate pharmacy_id format
  if (typeof payload.pharmacy_id !== 'string' || !UUID_REGEX.test(payload.pharmacy_id.trim())) {
    return result('UNKNOWN', 'Authoritative entitlement payload contains invalid pharmacy_id. Mutations blocked.', null, null, false);
  }
  if (payload.pharmacy_id.toLowerCase() !== expectedPharmacyId.toLowerCase()) {
    return result('UNKNOWN', 'Entitlement response does not match the requested pharmacy. Mutations blocked.');
  }

  // 2. Validate state against approved APP-02 lifecycle states
  const state = payload.state;
  if (typeof state !== 'string' || !VALID_STATES.has(state as SubscriptionLifecycleState)) {
    return result('UNKNOWN', 'Authoritative entitlement state is unrecognized. Mutations blocked.', null, null, false);
  }

  // 3. Validate mutations_allowed is boolean
  if (typeof payload.mutations_allowed !== 'boolean') {
    return result('UNKNOWN', 'Authoritative entitlement mutations_allowed flag is invalid. Mutations blocked.', null, null, false);
  }

  // 4. Validate historical_reads_allowed is true
  if (payload.historical_reads_allowed !== true) {
    return result('UNKNOWN', 'Authoritative entitlement must unconditionally preserve historical reads. Mutations blocked.', null, null, false);
  }

  // 5. Validate server_time is a valid finite timestamp
  const serverMs = parseStrictTimestamp(payload.server_time);
  if (serverMs === null) {
    return result('UNKNOWN', 'Authoritative entitlement server_time is invalid or missing. Mutations blocked.', null, null, false);
  }

  const periodStartMs = parseStrictTimestamp(payload.current_period_start);
  const periodEndMs = parseStrictTimestamp(payload.current_period_end);
  const graceEndMs = parseStrictTimestamp(payload.grace_period_end);
  const active = state === 'TRIAL' || state === 'ACTIVE' || state === 'GRACE';
  if (payload.mutations_allowed !== active) return result('UNKNOWN', 'Entitlement state and mutation flag contradict each other. Mutations blocked.');
  if (state !== 'UNKNOWN' && (periodStartMs === null || periodEndMs === null || graceEndMs === null)) {
    return result('UNKNOWN', 'Entitlement period evidence is incomplete or malformed. Mutations blocked.');
  }
  if (periodStartMs !== null && periodEndMs !== null && graceEndMs !== null && !(periodStartMs <= periodEndMs && periodEndMs <= graceEndMs)) {
    return result('UNKNOWN', 'Entitlement period relationships are invalid. Mutations blocked.');
  }
  if ((state === 'TRIAL' || state === 'ACTIVE') && periodEndMs !== null && serverMs >= periodEndMs) return result('UNKNOWN', 'Entitlement state contradicts authoritative time. Mutations blocked.');
  if (state === 'GRACE' && periodEndMs !== null && graceEndMs !== null && !(serverMs >= periodEndMs && serverMs < graceEndMs)) return result('UNKNOWN', 'Entitlement grace evidence contradicts authoritative time. Mutations blocked.');
  if (state === 'EXPIRED' && graceEndMs !== null && serverMs < graceEndMs) return result('UNKNOWN', 'Expired entitlement contradicts authoritative time. Mutations blocked.');
  const periodEnd = periodEndMs === null ? null : payload.current_period_end as string;
  const graceEnd = graceEndMs === null ? null : payload.grace_period_end as string;
  const reason = typeof payload.reason === 'string' && payload.reason.trim() !== ''
    ? payload.reason
    : `Authoritative entitlement state: ${state}`;

  const lifecycleState = state as SubscriptionLifecycleState;
  return result(lifecycleState, reason, periodEnd, graceEnd, true, expectedPharmacyId, payload.server_time as string);
}
