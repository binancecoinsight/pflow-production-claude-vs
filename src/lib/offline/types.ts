/**
 * PharmacyFlow Offline Storage & Synchronization Types
 * 
 * Defines durable local entity models, queue states, and transition rules.
 */

export type TransactionStatus =
  | 'PENDING'
  | 'COMMITTED'
  | 'PERMANENT_FAILURE';

export type QueueState =
  | 'PENDING'
  | 'SYNCING'
  | 'COMMITTED'
  | 'RETRYABLE'
  | 'PERMANENT_FAILURE'
  | 'AUTH_REQUIRED'
  | 'DEVICE_BLOCKED';

export type TransactionType =
  | 'SALE_STOCK_MOVEMENT'
  | 'SALE_RETURN';

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
}

export interface OperationResult {
  id: string;
  pharmacy_id: string;
  client_op_id: string;
  response_status: string;
  server_status: string;
  resulting_stock?: number;
  deficit_created?: boolean;
  processed_at: string;
  resolved_at: number;
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
