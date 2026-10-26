/**
 * PharmacyFlow Offline Storage & Synchronization Types
 * 
 * Defines durable local entity models, queue states, and transition rules.
 */

export type TransactionStatus =
  | 'PENDING'
  | 'UNCERTAIN'
  | 'RECOVERY_REQUIRED'
  | 'CONFLICT'
  | 'COMMITTED'
  | 'PERMANENT_FAILURE';

export type QueueState =
  | 'PENDING'
  | 'SYNCING'
  | 'COMMITTED'
  | 'RETRYABLE'
  | 'UNCERTAIN'
  | 'RECOVERY_REQUIRED'
  | 'CONFLICT'
  | 'PERMANENT_FAILURE'
  | 'AUTH_REQUIRED'
  | 'DEVICE_BLOCKED';

export type TransactionType =
  | 'SALE_STOCK_MOVEMENT'
  | 'SALE_RETURN';

export type ReconciliationOutcome =
  | 'CONFIRMED_COMMITTED'
  | 'CONFIRMED_ABSENT'
  | 'IN_PROGRESS'
  | 'CONFLICT'
  | 'UNKNOWN';

export type OperationKind = 'UNIFIED_SALE_V1' | 'LEGACY_SALE_STOCK' | 'SALE_RETURN_V1' | 'SALE_RETURN_V2' | 'UNKNOWN';

export interface CheckoutDraft {
  scope_key: string;
  pharmacy_id: string;
  branch_id: string;
  cashier_id: string;
  checkout_intent_id: string;
  client_op_id: string;
  sale_id: string;
  client_created_at: number;
  state: 'DRAFT' | 'LOCALLY_DURABLE' | 'CANCELLED' | 'ACKNOWLEDGED';
  cart_snapshot: Record<string, unknown> | null;
  frozen_payload: Record<string, unknown> | null;
  payload_hash: string | null;
  transaction_id: string | null;
  queue_id: string | null;
  created_at: number;
  updated_at: number;
  revision: number;
}

export interface LocalTransaction {
  id: string; // Local primary UUID
  pharmacy_id: string; // Partition key (UUID v4)
  client_op_id: string; // Canonical idempotency UUID v4
  transaction_type: TransactionType;
  payload: Record<string, unknown>; // Raw payload
  payload_hash: string; // Lowercase 64-char SHA-256 hex
  created_at: number; // Epoch ms
  updated_at: number; // Epoch ms
  status: TransactionStatus;
}

export interface SyncQueueItem {
  id: string; // Queue entry UUID
  pharmacy_id: string; // Partition key (UUID v4)
  client_op_id: string; // References local_transactions.client_op_id
  status: QueueState;
  attempts: number;
  next_attempt_at: number; // Epoch ms
  last_attempt_at: number | null; // Epoch ms
  last_error: string | null;
  created_at: number; // Epoch ms
  updated_at: number; // Epoch ms
  locked_at: number | null; // Lease timestamp in epoch ms
  reconciliation_attempts?: number;
  revision?: number;
  lease_token?: string | null;
}

export interface OperationResult {
  id: string;
  pharmacy_id: string;
  client_op_id: string;
  response_status: string;
  server_status: string;
  resulting_stock?: number;
  deficit_created?: boolean;
  processed_at: string | null;
  resolved_at: number;
  operation_kind?: OperationKind;
  checkout_intent_id?: string;
  sale_id?: string;
  payload_hash?: string;
}

export interface ClientOperationStatusV2 {
  outcome: ReconciliationOutcome;
  pharmacy_id: string;
  client_op_id: string;
  operation_kind: OperationKind;
  payload_hash: string | null;
  sale_id: string | null;
  checkout_intent_id: string | null;
  response_status: string | null;
  response_payload: Record<string, unknown> | null;
  processed_at: string | null;
  record_id: string | null;
  return_id: string | null;
}

export interface CreateTransactionParams {
  pharmacy_id: string;
  client_op_id?: string;
  transaction_type?: TransactionType;
  payload: Record<string, unknown>;
}

export interface DispatchSummary {
  pharmacy_id: string;
  total_eligible: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export interface DispatchResult {
  client_op_id: string;
  status: QueueState;
  error?: string;
  server_status?: string;
  new_stock?: number;
}
