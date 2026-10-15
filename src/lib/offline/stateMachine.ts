/**
 * PharmacyFlow Sync Queue State Machine
 * 
 * Enforces strict, deterministic transitions for offline transaction states.
 * Prohibits arbitrary state mutations.
 */

import { QueueState, SyncQueueItem } from './types';

// Map of allowed origin states to their valid target states
const ALLOWED_TRANSITIONS: Record<QueueState, readonly QueueState[]> = {
  PENDING: ['SYNCING', 'PERMANENT_FAILURE'],
  SYNCING: [
    'SYNCING',
    'COMMITTED',
    'RETRYABLE',
    'PERMANENT_FAILURE',
    'AUTH_REQUIRED',
    'DEVICE_BLOCKED'
  ],
  RETRYABLE: ['SYNCING', 'PERMANENT_FAILURE'],
  AUTH_REQUIRED: ['RETRYABLE', 'SYNCING'],
  DEVICE_BLOCKED: ['RETRYABLE'], // Recoverable only if unblocked
  PERMANENT_FAILURE: [], // Terminal
  COMMITTED: [] // Terminal
};

/**
 * Validates whether a state transition from `from` to `to` is legally permitted.
 */
export const isValidTransition = (from: QueueState, to: QueueState): boolean => {
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
};

/**
 * Transitions a SyncQueueItem to a new state if valid.
 * Throws an Error if the transition violates the state machine rules.
 */
export const transitionQueueItem = (
  item: SyncQueueItem,
  toState: QueueState,
  options?: {
    error?: string | null;
    nextAttemptAt?: number;
    lockedAt?: number | null;
  }
): SyncQueueItem => {
  if (!isValidTransition(item.status, toState)) {
    throw new Error(
      `Illegal queue state transition: cannot transition from ${item.status} to ${toState} for client_op_id ${item.client_op_id}`
    );
  }

  const now = Date.now();
  const isSyncing = toState === 'SYNCING';

  return {
    ...item,
    status: toState,
    attempts: isSyncing ? item.attempts + 1 : item.attempts,
    last_attempt_at: isSyncing ? now : item.last_attempt_at,
    next_attempt_at: options?.nextAttemptAt !== undefined ? options.nextAttemptAt : item.next_attempt_at,
    last_error: options?.error !== undefined ? options.error : item.last_error,
    locked_at: isSyncing ? now : (options?.lockedAt !== undefined ? options.lockedAt : null),
    updated_at: now
  };
};
