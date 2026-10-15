/**
 * PharmacyFlow Offline Sync Dispatcher
 * 
 * Coordinates queue processing, cryptographic signing, edge function transmission,
 * crash recovery, retry backoff, and ambiguous-status resolution.
 */

import {
  SyncQueueItem,
  DispatchSummary,
  DispatchResult
} from './types';
import {
  getEligibleQueueItems,
  getLocalTransaction,
  updateQueueItem,
  updateLocalTransactionStatus,
  recordOperationResult,
  openOfflineDb,
  acquireQueueLease,
  STORES
} from './db';
import { transitionQueueItem } from './stateMachine';
import { calculateNextAttemptAt } from './backoff';
import { DeviceIdentity } from '../crypto/deviceIdentity';
import {
  buildSyncSigningMessage,
  signSyncMessage,
  signatureToBase64,
  canonicalizeJson,
  sha256Hex
} from '../crypto/signing';

export interface DispatcherConfig {
  edgeFunctionUrl?: string;
  returnFunctionUrl?: string;
  staleLeaseTimeoutMs?: number;
  fetchFn?: typeof fetch;
  rpcGetClientOpStatus?: (pharmacyId: string, clientOpId: string) => Promise<{
    client_op_id: string;
    status: string;
    response_status: string;
    processed_at: string;
  } | null>;
}

export class SyncDispatcher {
  private activeLocks = new Set<string>();
  private edgeFunctionUrl: string;
  private returnFunctionUrl: string;
  private staleLeaseTimeoutMs: number;
  private fetchFn: typeof fetch;
  private rpcGetClientOpStatus?: DispatcherConfig['rpcGetClientOpStatus'];
  private customFactory?: IDBFactory;

  constructor(config: DispatcherConfig = {}, customFactory?: IDBFactory) {
    this.edgeFunctionUrl = config.edgeFunctionUrl || '/functions/v1/sync-push-sale';
    this.returnFunctionUrl = config.returnFunctionUrl || '/functions/v1/sync-push-return';
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
    let currentItem = leaseResult.item;

    try {
      // 1. Load corresponding LocalTransaction record
      const txRecord = await getLocalTransaction(pharmacyId, clientOpId, this.customFactory);
      if (!txRecord) {
        const failedItem = transitionQueueItem(currentItem, 'PERMANENT_FAILURE', {
          error: 'Local transaction record missing for queued operation'
        });
        await updateQueueItem(failedItem, this.customFactory);
        return { client_op_id: clientOpId, status: 'PERMANENT_FAILURE', error: failedItem.last_error || undefined };
      }

      // 2. Integrity check: Verify payload hash matches canonical payload bytes
      const canonicalPayload = canonicalizeJson(txRecord.payload);
      const computedHash = await sha256Hex(canonicalPayload);
      if (computedHash !== txRecord.payload_hash) {
        const failedItem = transitionQueueItem(currentItem, 'PERMANENT_FAILURE', {
          error: 'Security failure: payload hash mismatch / data tampered'
        });
        await updateQueueItem(failedItem, this.customFactory);
        await updateLocalTransactionStatus(pharmacyId, clientOpId, 'PERMANENT_FAILURE', this.customFactory);
        return { client_op_id: clientOpId, status: 'PERMANENT_FAILURE', error: failedItem.last_error || undefined };
      }

      // 3. Construct Candidate A canonical signing message (item was already atomically marked SYNCING in acquireQueueLease)
      const timestampStr = Date.now().toString();
      const nonce = crypto.randomUUID().toLowerCase();
      const isReturn = txRecord.transaction_type === 'SALE_RETURN';
      const endpointUrl = isReturn ? this.returnFunctionUrl : this.edgeFunctionUrl;
      const endpointPath = isReturn ? '/sync-push-return' : '/sync-push-sale';

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
            product_id: txRecord.payload.product_id,
            batch_id: txRecord.payload.batch_id,
            quantity: txRecord.payload.quantity,
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
        // Network unavailable or fetch failed
        const nextAttempt = calculateNextAttemptAt(currentItem.attempts);
        const errMsg = networkErr instanceof Error ? networkErr.message : 'Network unavailable';
        currentItem = transitionQueueItem(currentItem, 'RETRYABLE', {
          error: errMsg,
          nextAttemptAt: nextAttempt
        });
        await updateQueueItem(currentItem, this.customFactory);
        return { client_op_id: clientOpId, status: 'RETRYABLE', error: errMsg };
      }

      // 8. Process HTTP Response
      if (response.status === 200) {
        const responseData = await response.json();
        currentItem = transitionQueueItem(currentItem, 'COMMITTED');
        await updateQueueItem(currentItem, this.customFactory);
        await updateLocalTransactionStatus(pharmacyId, clientOpId, 'COMMITTED', this.customFactory);

        await recordOperationResult({
          pharmacy_id: pharmacyId,
          client_op_id: clientOpId,
          response_status: '200 OK',
          server_status: responseData.operation_status || 'COMMITTED',
          resulting_stock: responseData.new_stock,
          deficit_created: responseData.deficit_created,
          processed_at: responseData.processed_at || new Date().toISOString(),
          resolved_at: Date.now()
        }, this.customFactory);

        return {
          client_op_id: clientOpId,
          status: 'COMMITTED',
          server_status: responseData.operation_status,
          new_stock: responseData.new_stock
        };
      }

      // Handle Authentication Failure (HTTP 401)
      if (response.status === 401) {
        currentItem = transitionQueueItem(currentItem, 'AUTH_REQUIRED', {
          error: 'Authentication session expired or invalid credentials'
        });
        await updateQueueItem(currentItem, this.customFactory);
        return { client_op_id: clientOpId, status: 'AUTH_REQUIRED', error: currentItem.last_error || undefined };
      }

      // Handle Forbidden / Blocked Device (HTTP 403)
      if (response.status === 403) {
        currentItem = transitionQueueItem(currentItem, 'DEVICE_BLOCKED', {
          error: 'Device is blocked or unauthorized for this pharmacy'
        });
        await updateQueueItem(currentItem, this.customFactory);
        return { client_op_id: clientOpId, status: 'DEVICE_BLOCKED', error: currentItem.last_error || undefined };
      }

      // Handle Conflict / Nonce or Payload Mismatch (HTTP 409)
      if (response.status === 409) {
        const errorData = await response.json().catch(() => ({}));
        currentItem = transitionQueueItem(currentItem, 'PERMANENT_FAILURE', {
          error: errorData.error || 'Server rejected stock ingestion conflict'
        });
        await updateQueueItem(currentItem, this.customFactory);
        await updateLocalTransactionStatus(pharmacyId, clientOpId, 'PERMANENT_FAILURE', this.customFactory);
        return { client_op_id: clientOpId, status: 'PERMANENT_FAILURE', error: currentItem.last_error || undefined };
      }

      // Handle Rate Limiting (HTTP 429) or Server Transient Error (HTTP 5xx)
      if (response.status === 429 || (response.status >= 500 && response.status <= 599)) {
        const nextAttempt = calculateNextAttemptAt(currentItem.attempts);
        const errMsg = `Server transient error HTTP ${response.status}`;
        currentItem = transitionQueueItem(currentItem, 'RETRYABLE', {
          error: errMsg,
          nextAttemptAt: nextAttempt
        });
        await updateQueueItem(currentItem, this.customFactory);
        return { client_op_id: clientOpId, status: 'RETRYABLE', error: errMsg };
      }

      // Other 4xx Client Errors: Treat as permanent failure
      const errorJson = await response.json().catch(() => ({}));
      const clientErrMsg = errorJson.error || `Client error HTTP ${response.status}`;
      currentItem = transitionQueueItem(currentItem, 'PERMANENT_FAILURE', {
        error: clientErrMsg
      });
      await updateQueueItem(currentItem, this.customFactory);
      await updateLocalTransactionStatus(pharmacyId, clientOpId, 'PERMANENT_FAILURE', this.customFactory);
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
    const db = await openOfflineDb(this.customFactory);

    return new Promise((resolve) => {
      const tx = db.transaction(STORES.QUEUE, 'readonly');
      const store = tx.objectStore(STORES.QUEUE);
      const index = store.index('pharmacy_id');
      const req = index.getAll(normPharmacy);

      req.onsuccess = async () => {
        const items = (req.result || []) as SyncQueueItem[];
        const staleItems = items.filter(
          (item) => item.pharmacy_id === normPharmacy && item.status === 'SYNCING' && item.locked_at !== null && item.locked_at < threshold
        );

        let recoveredCount = 0;
        for (const stale of staleItems) {
          // Check authoritative server state via rpc_get_client_op_status if available
          const serverStatus = await this.resolveAmbiguousOperation(normPharmacy, stale.client_op_id);
          if (serverStatus === 'COMMITTED') {
            const committed = transitionQueueItem(stale, 'COMMITTED');
            await updateQueueItem(committed, this.customFactory);
            await updateLocalTransactionStatus(normPharmacy, stale.client_op_id, 'COMMITTED', this.customFactory);
            recoveredCount++;
          } else {
            // Revert back to RETRYABLE with the EXACT same immutable client_op_id
            const retryable = transitionQueueItem(stale, 'RETRYABLE', {
              error: 'Recovered from interrupted SYNCING state',
              nextAttemptAt: Date.now()
            });
            await updateQueueItem(retryable, this.customFactory);
            recoveredCount++;
          }
        }
        resolve(recoveredCount);
      };

      req.onerror = () => resolve(0);
    });
  }

  /**
   * Queries the server-side rpc_get_client_op_status to resolve ambiguous outcomes.
   */
  public async resolveAmbiguousOperation(
    pharmacyId: string,
    clientOpId: string
  ): Promise<'COMMITTED' | 'NOT_COMMITTED' | 'UNKNOWN'> {
    if (!this.rpcGetClientOpStatus) {
      return 'NOT_COMMITTED';
    }

    try {
      const res = await this.rpcGetClientOpStatus(pharmacyId, clientOpId);
      if (res && res.status === 'COMMITTED') {
        return 'COMMITTED';
      }
      return 'NOT_COMMITTED';
    } catch {
      return 'UNKNOWN';
    }
  }
}
