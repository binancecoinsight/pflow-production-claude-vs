import type { Subscription } from '../../types/database';
import {
  SubscriptionLifecycle,
  resolveSubscriptionLifecycle,
  resolveAuthoritativeEntitlement,
  resolveCapabilities,
} from './lifecycle';

/**
 * Minimal interface for injected RPC executor (e.g. SupabaseClient)
 */
export interface RpcExecutor {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}

/**
 * Contract for entitlement resolution provider
 */
export interface EntitlementProviderAdapter {
  getEffectiveEntitlement(pharmacyId: string): Promise<SubscriptionLifecycle>;
}

export interface EntitlementAdapterOptions {
  timeoutMs?: number;
  scheduleTimeout?: (callback: () => void, milliseconds: number) => unknown;
  cancelTimeout?: (handle: unknown) => void;
}

const failClosed = (reason: string): SubscriptionLifecycle => ({
  state: 'UNKNOWN', mutationAllowed: false, historicalReadAllowed: true,
  periodEnd: null, graceEnd: null, authoritative: false, pharmacyId: null, serverTime: null,
  reason, capabilities: resolveCapabilities('UNKNOWN'),
});

/**
 * Inactive injected Supabase RPC adapter suitable for future live integration.
 * Makes zero live network calls on its own and accepts an injected mock or live executor.
 * Fails closed to UNKNOWN on error or network unavailability without throwing.
 */
export function createRpcEntitlementAdapter(executor: RpcExecutor, options: EntitlementAdapterOptions = {}): EntitlementProviderAdapter {
  const timeoutMs = Math.max(25, Math.min(options.timeoutMs ?? 5_000, 10_000));
  const schedule = options.scheduleTimeout ?? ((callback, milliseconds) => setTimeout(callback, milliseconds));
  const cancel = options.cancelTimeout ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  return {
    async getEffectiveEntitlement(pharmacyId: string): Promise<SubscriptionLifecycle> {
      let handle: unknown;
      try {
        const timeout = new Promise<never>((_, reject) => { handle = schedule(() => reject(new Error('ENTITLEMENT_TIMEOUT')), timeoutMs); });
        const { data, error } = await Promise.race([executor.rpc('rpc_get_effective_entitlement_v2', { p_pharmacy_id: pharmacyId }), timeout]);
        if (handle !== undefined) cancel(handle);
        if (error || !data) {
          return failClosed(error ? 'Entitlement service rejected the request.' : 'Entitlement service returned no evidence.');
        }
        return resolveAuthoritativeEntitlement(data, pharmacyId);
      } catch {
        if (handle !== undefined) cancel(handle);
        return failClosed('Entitlement service was unavailable or timed out.');
      }
    },
  };
}

/**
 * Offline-first fallback adapter utilizing locally cached subscription evidence.
 * Explicitly marks result as non-authoritative (authoritative: false).
 */
export function createOfflineFallbackEntitlementAdapter(cachedSubscription: Subscription | null): EntitlementProviderAdapter {
  return {
    async getEffectiveEntitlement(_pharmacyId: string): Promise<SubscriptionLifecycle> {
      return resolveSubscriptionLifecycle(cachedSubscription);
    },
  };
}
