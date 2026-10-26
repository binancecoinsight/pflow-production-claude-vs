/**
 * PharmacyFlow Offline Sync Dispatcher
 * 
 * Coordinates queue processing, cryptographic signing, edge function transmission,
 * crash recovery, retry backoff, and ambiguous-status resolution.
 */

import {
  SyncQueueItem,
  DispatchSummary,
  DispatchResult,
  ClientOperationStatusV2,
  ReconciliationOutcome
} from './types';
import {
  getEligibleQueueItems,
  getQueueItemsByStates,
  getLocalTransaction,
  quarantineOrphanQueueItem,
  resolveOperationAtomically,
  acquireQueueLease,
} from './db';
import { calculateNextAttemptAt } from './backoff';
import { DeviceIdentity } from '../crypto/deviceIdentity';
import {
  buildSyncSigningMessage,
  signSyncMessage,
  signatureToBase64,
  canonicalizeJson,
  sha256Hex
} from '../crypto/signing';
import { operationKindOf, validateDispatchSuccess, validateStatusEvidence } from './protocol';

export interface DispatcherConfig {
  edgeFunctionUrl?: string;
  returnFunctionUrl?: string;
  returnV2FunctionUrl?: string;
  staleLeaseTimeoutMs?: number;
  fetchFn?: typeof fetch;
  rpcGetClientOpStatus?: (pharmacyId: string, clientOpId: string) => Promise<ClientOperationStatusV2 | null>;
}

export class SyncDispatcher {
  private activeLocks = new Set<string>();
  private edgeFunctionUrl: string;
  private returnFunctionUrl: string;
  private returnV2FunctionUrl: string;
  private staleLeaseTimeoutMs: number;
  private fetchFn: typeof fetch;
  private rpcGetClientOpStatus?: DispatcherConfig['rpcGetClientOpStatus'];
  private customFactory?: IDBFactory;

  constructor(config: DispatcherConfig = {}, customFactory?: IDBFactory) {
    this.edgeFunctionUrl = config.edgeFunctionUrl || '/functions/v1/sync-push-sale';
    this.returnFunctionUrl = config.returnFunctionUrl || '/functions/v1/sync-push-return';
    this.returnV2FunctionUrl = config.returnV2FunctionUrl || '/functions/v1/sync-push-return-v2';
    this.staleLeaseTimeoutMs = config.staleLeaseTimeoutMs || 60000; // 60s
    this.fetchFn = config.fetchFn || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : async () => {
      throw new Error('fetch is not defined in this environment');
    });
    this.rpcGetClientOpStatus = config.rpcGetClientOpStatus;
    this.customFactory = customFactory;
  }

  private getLockKey(pharmacyId: string, clientOpId: string): string {
    return `${pharmacyId.toLowerCase()}:${clientOpId.toLowerCase()}`;
  }

  /**
   * Dispatches all currently eligible queue items partitioned under a given pharmacy.
   */
  public async dispatch(
    pharmacyId: string,
    deviceIdentity: DeviceIdentity,
    sessionToken: string
  ): Promise<DispatchSummary> {
    const normPharmacy = pharmacyId.toLowerCase().trim();

    // 1. Recover any stale SYNCING operations prior to new dispatch cycle
    await this.recoverStaleOperations(normPharmacy);

    // 2. Fetch all eligible items for this pharmacy
    const eligible = await getEligibleQueueItems(normPharmacy, Date.now(), this.customFactory);

    const summary: DispatchSummary = {
      pharmacy_id: normPharmacy,
      total_eligible: eligible.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0
    };

    for (const item of eligible) {
      const lockKey = this.getLockKey(normPharmacy, item.client_op_id);
      if (this.activeLocks.has(lockKey)) {
        summary.skipped++;
        continue;
      }

      summary.processed++;
      const result = await this.dispatchOne(item, deviceIdentity, sessionToken);
      if (result.status === 'COMMITTED') {
        summary.succeeded++;
      } else {
        summary.failed++;
      }
    }

    return summary;
  }

  /**
   * Dispatches a single queued operation through the trusted Edge Function pipeline.
   */
  public async dispatchOne(
    queueItem: SyncQueueItem,
    deviceIdentity: DeviceIdentity,
    sessionToken: string
  ): Promise<DispatchResult> {
    const pharmacyId = queueItem.pharmacy_id.toLowerCase().trim();
    const clientOpId = queueItem.client_op_id.toLowerCase().trim();
    const lockKey = this.getLockKey(pharmacyId, clientOpId);

    // Fast-path in-memory guard: avoid duplicate concurrent dispatch within same runtime
    if (this.activeLocks.has(lockKey)) {
      return {
        client_op_id: clientOpId,
        status: queueItem.status,
        error: 'Operation is already locked by another dispatch worker in this execution context'
      };
    }

    // Authoritative cross-tab atomic lease acquisition in IndexedDB
    const leaseResult = await acquireQueueLease(
      pharmacyId,
      clientOpId,
      this.staleLeaseTimeoutMs,
      this.customFactory
    );

    if (!leaseResult.acquired || !leaseResult.item) {
      return {
        client_op_id: clientOpId,
        status: leaseResult.item?.status || queueItem.status,
        error: `Queue lease not acquired: ${leaseResult.reason || 'Held by another context'}`
      };
    }

    this.activeLocks.add(lockKey);
    const currentItem = leaseResult.item;
    const leaseExpectation = {
      expected_queue_statuses: ['SYNCING'] as const,
      expected_revision: currentItem.revision || 0,
      expected_lease_token: currentItem.lease_token || null
    };

    try {
      // 1. Load corresponding LocalTransaction record
      const txRecord = await getLocalTransaction(pharmacyId, clientOpId, this.customFactory);
      if (!txRecord) {
        await quarantineOrphanQueueItem(pharmacyId, clientOpId, {
          status: 'SYNCING', revision: currentItem.revision || 0, lease_token: currentItem.lease_token || null
        }, 'Local transaction record missing; queued operation preserved for recovery', this.customFactory);
        return { client_op_id: clientOpId, status: 'RECOVERY_REQUIRED', error: 'Local transaction record missing; queued operation preserved for recovery' };
      }

      if (operationKindOf(txRecord) === 'LEGACY_SALE_STOCK') {
        const error = 'Legacy stock-only sale lacks unified financial completion evidence; manual recovery required';
        await resolveOperationAtomically(pharmacyId, clientOpId, {
          queue_status: 'RECOVERY_REQUIRED', transaction_status: 'RECOVERY_REQUIRED', error, ...leaseExpectation
        }, this.customFactory);
        return { client_op_id: clientOpId, status: 'RECOVERY_REQUIRED', error };
      }

      // 2. Integrity check: Verify payload hash matches canonical payload bytes
      const canonicalPayload = canonicalizeJson(txRecord.payload);
      const computedHash = await sha256Hex(canonicalPayload);
      if (computedHash !== txRecord.payload_hash) {
        const error = 'Security failure: payload hash mismatch / data tampered';
        await resolveOperationAtomically(pharmacyId, clientOpId, {
          queue_status: 'PERMANENT_FAILURE', transaction_status: 'PERMANENT_FAILURE', error, ...leaseExpectation
        }, this.customFactory);
        return { client_op_id: clientOpId, status: 'PERMANENT_FAILURE', error };
      }

      // 3. Construct Candidate A canonical signing message (item was already atomically marked SYNCING in acquireQueueLease)
      const timestampStr = Date.now().toString();
      const nonce = crypto.randomUUID().toLowerCase();
      const isReturn = txRecord.transaction_type === 'SALE_RETURN';
      const isReturnV2 = isReturn && txRecord.payload.contract_version === 2;
      const endpointUrl = isReturn ? (isReturnV2 ? this.returnV2FunctionUrl : this.returnFunctionUrl) : this.edgeFunctionUrl;
      const endpointPath = isReturn ? (isReturnV2 ? '/sync-push-return-v2' : '/sync-push-return') : '/sync-push-sale';

      const canonicalMessage = buildSyncSigningMessage({
        pharmacyId,
        deviceId: deviceIdentity.deviceId,
        clientOpId,
        timestamp: timestampStr,
        nonce,
        payloadHash: txRecord.payload_hash,
        path: endpointPath
      });

      // 5. Sign message with device private key
      const rawSignature = await signSyncMessage(deviceIdentity.privateKey, canonicalMessage);
      const signatureBase64 = signatureToBase64(rawSignature);

      // 6. Build HTTP request payload
      const requestPayload = isReturn
        ? {
            pharmacy_id: pharmacyId,
            device_id: deviceIdentity.deviceId,
            branch_id: (txRecord.payload.branch_id as string) || '00000000-0000-0000-0000-000000000000',
            client_op_id: clientOpId,
            timestamp: timestampStr,
            nonce,
            sale_id: txRecord.payload.sale_id,
            items: txRecord.payload.items,
            contract_version: isReturnV2 ? 2 : undefined,
            expected_refund_amount_minor: isReturnV2 ? txRecord.payload.expected_refund_amount_minor : undefined,
            original_payment_method: isReturnV2 ? txRecord.payload.original_payment_method : undefined,
            refund_amount: txRecord.payload.refund_amount,
            refund_payment_method: txRecord.payload.refund_payment_method,
            reason: txRecord.payload.reason,
            payload: txRecord.payload,
            payload_hash: txRecord.payload_hash
          }
        : {
            pharmacy_id: pharmacyId,
            device_id: deviceIdentity.deviceId,
            branch_id: (txRecord.payload.branch_id as string) || '00000000-0000-0000-0000-000000000000',
            client_op_id: clientOpId,
            timestamp: timestampStr,
            nonce,
            sale_id: txRecord.payload.sale_id,
            checkout_intent_id: txRecord.payload.checkout_intent_id,
            payload: txRecord.payload,
            payload_hash: txRecord.payload_hash
          };

      // 7. Transmit to Edge Function
      let response: Response;
      try {
        response = await this.fetchFn(endpointUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
            'X-Device-Signature': signatureBase64,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestPayload)
        });
      } catch (networkErr: unknown) {
        // The request may have committed before the response was lost. Reconcile; never resend automatically.
        const errMsg = networkErr instanceof Error ? networkErr.message : 'Network unavailable';
        await resolveOperationAtomically(pharmacyId, clientOpId, {
          queue_status: 'UNCERTAIN', transaction_status: 'UNCERTAIN', error: errMsg, ...leaseExpectation
        }, this.customFactory);
        return { client_op_id: clientOpId, status: 'UNCERTAIN', error: errMsg };
      }

      // 8. Process HTTP Response
      if (response.status === 200) {
        const raw = await response.json().catch(() => null);
        const responseData = validateDispatchSuccess(txRecord, raw);
        if (!responseData) {
          const error = 'Malformed or identity-mismatched success response; authoritative reconciliation required';
          await resolveOperationAtomically(pharmacyId, clientOpId, {
            queue_status: 'UNCERTAIN', transaction_status: 'UNCERTAIN', error, ...leaseExpectation
          }, this.customFactory);
          return { client_op_id: clientOpId, status: 'UNCERTAIN', error };
        }
        await resolveOperationAtomically(pharmacyId, clientOpId, {
          queue_status: 'COMMITTED', transaction_status: 'COMMITTED', error: null, ...leaseExpectation, result: {
          pharmacy_id: pharmacyId,
          client_op_id: clientOpId,
          response_status: '200 OK',
          server_status: responseData.operation_status,
          resulting_stock: responseData.new_stock,
          deficit_created: responseData.deficit_created,
          processed_at: responseData.processed_at,
          resolved_at: Date.now(),
          operation_kind: operationKindOf(txRecord),
          checkout_intent_id: responseData.checkout_intent_id,
          sale_id: responseData.sale_id,
          payload_hash: txRecord.payload_hash
        } }, this.customFactory);

        return {
          client_op_id: clientOpId,
          status: 'COMMITTED',
          server_status: responseData.operation_status,
          new_stock: responseData.new_stock
        };
      }

      // Handle Authentication Failure (HTTP 401)
      if (response.status === 401) {
        const error = 'Authentication session expired or invalid credentials';
        await resolveOperationAtomically(pharmacyId, clientOpId, {
          queue_status: 'AUTH_REQUIRED', transaction_status: 'PENDING', error, ...leaseExpectation
        }, this.customFactory);
        return { client_op_id: clientOpId, status: 'AUTH_REQUIRED', error };
      }

      // Handle Forbidden / Blocked Device (HTTP 403)
      if (response.status === 403) {
        const error = 'Device is blocked or unauthorized for this pharmacy';
        await resolveOperationAtomically(pharmacyId, clientOpId, {
          queue_status: 'DEVICE_BLOCKED', transaction_status: 'PENDING', error, ...leaseExpectation
        }, this.customFactory);
        return { client_op_id: clientOpId, status: 'DEVICE_BLOCKED', error };
      }

      // Conflicts include both terminal integrity failures and retryable nonce /
      // concurrency outcomes. The gateway returns a typed error_code.
      if (response.status === 409) {
        const errorData = await response.json().catch(() => ({}));
        const uncertainCodes = new Set([
          'NONCE_REPLAY',
          'OPERATION_IN_PROGRESS'
        ]);
        const retryableCodes = new Set([
          'SERIALIZATION_FAILURE',
          'DEADLOCK_DETECTED'
        ]);
        if (uncertainCodes.has(errorData.error_code)) {
          const error = errorData.error_code || 'Ambiguous commit outcome';
          await resolveOperationAtomically(pharmacyId, clientOpId, {
            queue_status: 'UNCERTAIN', transaction_status: 'UNCERTAIN', error, ...leaseExpectation
          }, this.customFactory);
          return { client_op_id: clientOpId, status: 'UNCERTAIN', error };
        }
        if (retryableCodes.has(errorData.error_code)) {
          const error = errorData.error || errorData.error_code;
          await resolveOperationAtomically(pharmacyId, clientOpId, {
            queue_status: 'RETRYABLE', transaction_status: 'PENDING', error,
            next_attempt_at: calculateNextAttemptAt(currentItem.attempts), ...leaseExpectation
          }, this.customFactory);
          return { client_op_id: clientOpId, status: 'RETRYABLE', error };
        }
        const error = errorData.error_code || 'OPERATION_CONFLICT';
        await resolveOperationAtomically(pharmacyId, clientOpId, {
          queue_status: 'CONFLICT', transaction_status: 'CONFLICT', error, ...leaseExpectation
        }, this.customFactory);
        return { client_op_id: clientOpId, status: 'CONFLICT', error };
      }

      // Handle Rate Limiting (HTTP 429) or Server Transient Error (HTTP 5xx)
      if (response.status === 429) {
        const nextAttempt = calculateNextAttemptAt(currentItem.attempts);
        const errMsg = `Server transient error HTTP ${response.status}`;
        await resolveOperationAtomically(pharmacyId, clientOpId, {
          queue_status: 'RETRYABLE', transaction_status: 'PENDING', error: errMsg,
          next_attempt_at: nextAttempt, ...leaseExpectation
        }, this.customFactory);
        return { client_op_id: clientOpId, status: 'RETRYABLE', error: errMsg };
      }

      if (response.status >= 500 && response.status <= 599) {
        const error = `Ambiguous server response HTTP ${response.status}`;
        await resolveOperationAtomically(pharmacyId, clientOpId, {
          queue_status: 'UNCERTAIN', transaction_status: 'UNCERTAIN', error, ...leaseExpectation
        }, this.customFactory);
        return { client_op_id: clientOpId, status: 'UNCERTAIN', error };
      }

      // Other 4xx Client Errors: Treat as permanent failure
      const errorJson = await response.json().catch(() => ({}));
      const clientErrMsg = errorJson.error || `Client error HTTP ${response.status}`;
      await resolveOperationAtomically(pharmacyId, clientOpId, {
        queue_status: 'PERMANENT_FAILURE', transaction_status: 'PERMANENT_FAILURE', error: clientErrMsg, ...leaseExpectation
      }, this.customFactory);
      return { client_op_id: clientOpId, status: 'PERMANENT_FAILURE', error: clientErrMsg };

    } finally {
      this.activeLocks.delete(lockKey);
    }
  }

  /**
   * Recovers stale SYNCING operations following crashes, tabs unloads, or network timeouts.
   */
  public async recoverStaleOperations(
    pharmacyId: string,
    timeoutMs?: number
  ): Promise<number> {
    const normPharmacy = pharmacyId.toLowerCase().trim();
    const threshold = Date.now() - (timeoutMs || this.staleLeaseTimeoutMs);
    const items = await getQueueItemsByStates(normPharmacy, ['SYNCING', 'UNCERTAIN', 'AUTH_REQUIRED'], this.customFactory);
    const staleItems = items.filter((item) => item.status !== 'SYNCING' ||
      (item.locked_at !== null && item.locked_at < threshold))
      .sort((a, b) => a.updated_at - b.updated_at).slice(0, 25);

    let recoveredCount = 0;
    for (const stale of staleItems) {
      const expected = {
        expected_queue_statuses: [stale.status] as readonly SyncQueueItem['status'][],
        expected_revision: stale.revision || 0,
        expected_lease_token: stale.lease_token || null
      };
      try {
        if ((stale.reconciliation_attempts || 0) >= 8) {
          await resolveOperationAtomically(normPharmacy, stale.client_op_id, {
            queue_status: 'RECOVERY_REQUIRED', transaction_status: 'RECOVERY_REQUIRED', ...expected,
            error: 'Automatic reconciliation limit reached; unresolved operation preserved for manual recovery'
          }, this.customFactory);
          recoveredCount++;
          continue;
        }
        const local = await getLocalTransaction(normPharmacy, stale.client_op_id, this.customFactory);
        if (!local) {
          await quarantineOrphanQueueItem(normPharmacy, stale.client_op_id, {
            status: stale.status, revision: stale.revision || 0, lease_token: stale.lease_token || null
          }, 'Local transaction record missing; queued operation preserved for recovery', this.customFactory);
          recoveredCount++;
          continue;
        }
        const canonicalPayload = canonicalizeJson(local.payload);
        const computedHash = await sha256Hex(canonicalPayload);
        if (computedHash !== local.payload_hash || operationKindOf(local) === 'LEGACY_SALE_STOCK') {
          await resolveOperationAtomically(normPharmacy, stale.client_op_id, {
            queue_status: 'RECOVERY_REQUIRED', transaction_status: 'RECOVERY_REQUIRED', ...expected,
            error: computedHash !== local.payload_hash
              ? 'Frozen payload hash is invalid; operation quarantined without mutation'
              : 'Incomplete legacy operation quarantined; stock evidence is not unified financial completion'
          }, this.customFactory);
          recoveredCount++;
          continue;
        }
        const resolution = await this.resolveAmbiguousOperation(normPharmacy, stale.client_op_id);
        const evidenceValid = !!resolution.evidence && validateStatusEvidence(local, resolution.evidence);
        if (resolution.outcome === 'CONFIRMED_COMMITTED' && evidenceValid) {
          await resolveOperationAtomically(normPharmacy, stale.client_op_id, {
            queue_status: 'COMMITTED', transaction_status: 'COMMITTED', error: null, ...expected, result: {
              pharmacy_id: normPharmacy, client_op_id: stale.client_op_id,
              response_status: resolution.evidence!.response_status || 'COMMITTED', server_status: 'COMMITTED',
              processed_at: resolution.evidence!.processed_at!, resolved_at: Date.now(),
              operation_kind: resolution.evidence!.operation_kind,
              checkout_intent_id: resolution.evidence!.checkout_intent_id || undefined,
              sale_id: resolution.evidence!.sale_id || undefined,
              payload_hash: resolution.evidence!.payload_hash || undefined
            }
          }, this.customFactory);
        } else if (resolution.outcome === 'CONFIRMED_ABSENT' && evidenceValid) {
          await resolveOperationAtomically(normPharmacy, stale.client_op_id, {
            queue_status: 'RETRYABLE', transaction_status: 'PENDING', ...expected,
            error: 'Authoritatively confirmed absent; exact frozen operation may be retried', next_attempt_at: Date.now()
          }, this.customFactory);
        } else if (resolution.outcome === 'CONFLICT' && evidenceValid) {
          await resolveOperationAtomically(normPharmacy, stale.client_op_id, {
            queue_status: 'CONFLICT', transaction_status: 'CONFLICT', ...expected,
            error: 'Authoritative operation evidence conflicts with local frozen operation'
          }, this.customFactory);
        } else {
          const preserveAuth = stale.status === 'AUTH_REQUIRED';
          await resolveOperationAtomically(normPharmacy, stale.client_op_id, {
            queue_status: preserveAuth ? 'AUTH_REQUIRED' : 'UNCERTAIN',
            transaction_status: preserveAuth ? 'PENDING' : 'UNCERTAIN', ...expected,
            error: resolution.outcome === 'IN_PROGRESS' && evidenceValid
              ? 'Authoritative operation is still in progress' : 'Authoritative status unavailable, unauthorized or invalid',
            increment_reconciliation: true
          }, this.customFactory);
        }
        recoveredCount++;
      } catch (error: unknown) {
        if (!(error instanceof Error) || !error.message.includes('STALE_OPERATION_RESOLUTION')) throw error;
      }
    }
    return recoveredCount;
  }

  /**
   * Queries the server-side rpc_get_client_op_status to resolve ambiguous outcomes.
   */
  public async resolveAmbiguousOperation(
    pharmacyId: string,
    clientOpId: string
  ): Promise<{ outcome: ReconciliationOutcome; evidence?: ClientOperationStatusV2 }> {
    if (!this.rpcGetClientOpStatus) {
      return { outcome: 'UNKNOWN' };
    }

    try {
      const res = await this.rpcGetClientOpStatus(pharmacyId, clientOpId);
      const allowed: ReconciliationOutcome[] = ['CONFIRMED_COMMITTED', 'CONFIRMED_ABSENT', 'IN_PROGRESS', 'CONFLICT', 'UNKNOWN'];
      if (!res || !allowed.includes(res.outcome)) return { outcome: 'UNKNOWN' };
      return { outcome: res.outcome, evidence: res };
    } catch {
      return { outcome: 'UNKNOWN' };
    }
  }
}
