import { ClientOperationStatusV2, LocalTransaction, OperationKind } from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

export const operationKindOf = (transaction: LocalTransaction): OperationKind => {
  if (transaction.transaction_type === 'SALE_RETURN') {
    return transaction.payload.contract_version === 2 ? 'SALE_RETURN_V2' : 'SALE_RETURN_V1';
  }
  return uuid(transaction.payload.checkout_intent_id) && Array.isArray(transaction.payload.line_items)
    ? 'UNIFIED_SALE_V1' : 'LEGACY_SALE_STOCK';
};

export type ValidatedSuccess = {
  operation_status: 'COMMITTED' | 'ALREADY_COMMITTED';
  client_op_id: string;
  processed_at: string | null;
  sale_id?: string;
  checkout_intent_id?: string;
  return_id?: string;
  new_stock?: number;
  deficit_created?: boolean;
};

export const validateDispatchSuccess = (transaction: LocalTransaction, value: unknown): ValidatedSuccess | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const kind = operationKindOf(transaction);
  if (kind === 'SALE_RETURN_V1') {
    if (row.status !== 'COMMITTED' || row.client_op_id !== transaction.client_op_id ||
        typeof row.return_id !== 'string' || row.return_id.length === 0) return null;
    return { operation_status: 'COMMITTED', client_op_id: transaction.client_op_id,
      return_id: row.return_id, processed_at: null };
  }
  if (row.operation_status !== 'COMMITTED' && row.operation_status !== 'ALREADY_COMMITTED') return null;
  if (row.client_op_id !== transaction.client_op_id || !timestamp(row.processed_at)) return null;
  if (kind === 'UNIFIED_SALE_V1') {
    if (row.sale_id !== transaction.payload.sale_id || row.checkout_intent_id !== transaction.payload.checkout_intent_id) return null;
    if (!uuid(row.sale_id) || !uuid(row.checkout_intent_id)) return null;
  } else if (kind === 'SALE_RETURN_V2') {
    if (!uuid(row.return_id) || row.contract_version !== 2) return null;
  } else if (kind === 'LEGACY_SALE_STOCK') {
    return null;
  }
  return row as ValidatedSuccess;
};

export const validateStatusEvidence = (
  transaction: LocalTransaction,
  status: ClientOperationStatusV2
): boolean => {
  if (status.pharmacy_id !== transaction.pharmacy_id || status.client_op_id !== transaction.client_op_id) return false;
  if (status.outcome === 'CONFIRMED_ABSENT') {
    return status.operation_kind === 'UNKNOWN' && status.payload_hash === null &&
      status.sale_id === null && status.checkout_intent_id === null && status.record_id === null &&
      status.return_id === null && status.response_status === 'AUTHORIZED_ABSENCE' &&
      status.response_payload === null && status.processed_at === null;
  }
  if (status.payload_hash !== transaction.payload_hash) return false;
  if (status.operation_kind !== operationKindOf(transaction)) return false;
  const response = status.response_payload;
  const responseRow = response && typeof response === 'object' && !Array.isArray(response)
    ? response as Record<string, unknown> : null;
  if (status.operation_kind === 'UNIFIED_SALE_V1') {
    if (status.sale_id !== transaction.payload.sale_id || status.record_id !== transaction.payload.sale_id ||
        status.checkout_intent_id !== transaction.payload.checkout_intent_id || status.return_id !== null) return false;
  }
  if (status.operation_kind === 'SALE_RETURN_V1' || status.operation_kind === 'SALE_RETURN_V2') {
    if (!uuid(status.return_id) || status.record_id !== status.return_id || status.sale_id !== transaction.payload.sale_id ||
        status.checkout_intent_id !== null) return false;
  }
  if (status.outcome === 'CONFIRMED_COMMITTED') {
    if (!timestamp(status.processed_at)) return false;
    if (status.operation_kind === 'UNIFIED_SALE_V1') {
      return !!responseRow && responseRow.client_op_id === transaction.client_op_id &&
        responseRow.operation_status === 'COMMITTED' && timestamp(responseRow.processed_at) &&
        responseRow.sale_id === transaction.payload.sale_id &&
        responseRow.checkout_intent_id === transaction.payload.checkout_intent_id;
    }
    if (status.operation_kind === 'SALE_RETURN_V1' || status.operation_kind === 'SALE_RETURN_V2') {
      return !!responseRow && responseRow.client_op_id === transaction.client_op_id &&
        responseRow.operation_status === 'COMMITTED' && timestamp(responseRow.processed_at) &&
        responseRow.return_id === status.return_id && responseRow.sale_id === transaction.payload.sale_id &&
        (status.operation_kind !== 'SALE_RETURN_V2' || responseRow.contract_version === 2);
    }
  }
  return true;
};
