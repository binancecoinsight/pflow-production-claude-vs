/**
 * PharmacyFlow Offline IndexedDB Engine
 * 
 * Provides durable, atomic, and pharmacy-partitioned persistence for offline sales transactions,
 * sync queues, and operation audit logs.
 */

import {
  LocalTransaction,
  SyncQueueItem,
  OperationResult,
  CreateTransactionParams,
  TransactionStatus
} from './types';
import { canonicalizeJson, sha256Hex } from '../crypto/signing';
import { getActiveDeviceIdentity } from '../crypto/deviceIdentity';

const DB_NAME = 'pharmacyflow_offline_v1';
const DB_VERSION = 3;

export const STORES = {
  TRANSACTIONS: 'local_transactions',
  QUEUE: 'sync_queue',
  RESULTS: 'operation_results',
  PRODUCTS: 'products',
  BATCHES: 'inventory_batches',
  SNAPSHOT_METADATA: 'snapshot_metadata',
  CUSTOMERS: 'customers'
} as const;

let dbInstance: IDBDatabase | null = null;
let currentFactory: IDBFactory | null = null;

/**
 * Returns the effective IDBFactory in the current environment.
 */
export const getIdbFactory = (customFactory?: IDBFactory): IDBFactory => {
  if (customFactory) return customFactory;
  if (currentFactory) return currentFactory;
  if (typeof window !== 'undefined' && window.indexedDB) return window.indexedDB;
  if (typeof globalThis !== 'undefined' && (globalThis as unknown as { indexedDB?: IDBFactory }).indexedDB) {
    return (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB;
  }
  throw new Error('IndexedDB is not available in the current runtime environment.');
};

/**
 * Sets an IDBFactory override (used for testing in Node / tsx).
 */
export const setIdbFactory = (factory: IDBFactory | null): void => {
  currentFactory = factory;
  dbInstance = null;
};

/**
 * Opens or retrieves the shared IndexedDB connection.
 */
export const openOfflineDb = async (customFactory?: IDBFactory): Promise<IDBDatabase> => {
  if (dbInstance && !customFactory) {
    return dbInstance;
  }

  const factory = getIdbFactory(customFactory);

  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      // 1. Store: local_transactions
      if (!db.objectStoreNames.contains(STORES.TRANSACTIONS)) {
        const txStore = db.createObjectStore(STORES.TRANSACTIONS, { keyPath: 'id' });
        txStore.createIndex('pharmacy_id', 'pharmacy_id', { unique: false });
        txStore.createIndex('client_op_id', 'client_op_id', { unique: false });
        txStore.createIndex('pharmacy_client_op', ['pharmacy_id', 'client_op_id'], { unique: true });
        txStore.createIndex('status', 'status', { unique: false });
        txStore.createIndex('created_at', 'created_at', { unique: false });
      }

      // 2. Store: sync_queue
      if (!db.objectStoreNames.contains(STORES.QUEUE)) {
        const queueStore = db.createObjectStore(STORES.QUEUE, { keyPath: 'id' });
        queueStore.createIndex('pharmacy_id', 'pharmacy_id', { unique: false });
        queueStore.createIndex('client_op_id', 'client_op_id', { unique: false });
        queueStore.createIndex('pharmacy_client_op', ['pharmacy_id', 'client_op_id'], { unique: true });
        queueStore.createIndex('status', 'status', { unique: false });
        queueStore.createIndex('next_attempt_at', 'next_attempt_at', { unique: false });
        queueStore.createIndex('pharmacy_status', ['pharmacy_id', 'status'], { unique: false });
      }

      // 3. Store: operation_results
      if (!db.objectStoreNames.contains(STORES.RESULTS)) {
        const resultStore = db.createObjectStore(STORES.RESULTS, { keyPath: 'id' });
        resultStore.createIndex('pharmacy_id', 'pharmacy_id', { unique: false });
        resultStore.createIndex('client_op_id', 'client_op_id', { unique: false });
        resultStore.createIndex('pharmacy_client_op', ['pharmacy_id', 'client_op_id'], { unique: true });
      }

      // 4. Store: products (Phase 5D-4 Read Model)
      if (!db.objectStoreNames.contains(STORES.PRODUCTS)) {
        const prodStore = db.createObjectStore(STORES.PRODUCTS, { keyPath: 'id' });
        prodStore.createIndex('pharmacy_id', 'pharmacy_id', { unique: false });
        prodStore.createIndex('pharmacy_product', ['pharmacy_id', 'id'], { unique: true });
        prodStore.createIndex('pharmacy_sku', ['pharmacy_id', 'sku'], { unique: false });
        prodStore.createIndex('pharmacy_barcode', ['pharmacy_id', 'barcode'], { unique: false });
        prodStore.createIndex('pharmacy_name', ['pharmacy_id', 'name'], { unique: false });
      }

      // 5. Store: inventory_batches (Phase 5D-4 Read Model)
      if (!db.objectStoreNames.contains(STORES.BATCHES)) {
        const batchStore = db.createObjectStore(STORES.BATCHES, { keyPath: 'id' });
        batchStore.createIndex('pharmacy_id', 'pharmacy_id', { unique: false });
        batchStore.createIndex('pharmacy_batch', ['pharmacy_id', 'id'], { unique: true });
        batchStore.createIndex('pharmacy_product', ['pharmacy_id', 'product_id'], { unique: false });
        batchStore.createIndex('pharmacy_branch', ['pharmacy_id', 'branch_id'], { unique: false });
        batchStore.createIndex('pharmacy_expiry', ['pharmacy_id', 'expiry_date'], { unique: false });
      }

      // 6. Store: snapshot_metadata
      if (!db.objectStoreNames.contains(STORES.SNAPSHOT_METADATA)) {
        db.createObjectStore(STORES.SNAPSHOT_METADATA, { keyPath: 'pharmacy_id' });
      }

      // 7. Store: customers (Phase 5D-13 Read Model)
      if (!db.objectStoreNames.contains(STORES.CUSTOMERS)) {
        const custStore = db.createObjectStore(STORES.CUSTOMERS, { keyPath: 'id' });
        custStore.createIndex('pharmacy_id', 'pharmacy_id', { unique: false });
        custStore.createIndex('pharmacy_customer', ['pharmacy_id', 'id'], { unique: true });
        custStore.createIndex('pharmacy_phone', ['pharmacy_id', 'phone'], { unique: false });
        custStore.createIndex('pharmacy_name', ['pharmacy_id', 'name'], { unique: false });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(request.result);
    };

    request.onerror = () => {
      reject(new Error(`Failed to open IndexedDB [${DB_NAME}]: ${request.error?.message}`));
    };
  });
};

/**
 * Closes the active database connection.
 */
export const closeOfflineDb = (): void => {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
};

/**
 * Atomically creates a durable local transaction and enqueues it for synchronization.
 */
export const createLocalTransaction = async (
  params: CreateTransactionParams,
  customFactory?: IDBFactory
): Promise<{ transaction: LocalTransaction; queueItem: SyncQueueItem }> => {
  const pharmacyId = params.pharmacy_id.toLowerCase().trim();
  const clientOpId = (params.client_op_id || crypto.randomUUID()).toLowerCase().trim();
  const now = Date.now();

  // Canonicalize payload and compute immutable SHA-256 digest
  const canonicalPayload = canonicalizeJson(params.payload);
  const payloadHash = await sha256Hex(canonicalPayload);

  const transaction: LocalTransaction = {
    id: crypto.randomUUID().toLowerCase(),
    pharmacy_id: pharmacyId,
    client_op_id: clientOpId,
    transaction_type: params.transaction_type || 'SALE_STOCK_MOVEMENT',
    payload: JSON.parse(canonicalPayload),
    payload_hash: payloadHash,
    created_at: now,
    updated_at: now,
    status: 'PENDING'
  };

  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID().toLowerCase(),
    pharmacy_id: pharmacyId,
    client_op_id: clientOpId,
    status: 'PENDING',
    attempts: 0,
    next_attempt_at: now,
    last_attempt_at: null,
    last_error: null,
    created_at: now,
    updated_at: now,
    locked_at: null
  };

  const db = await openOfflineDb(customFactory);

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.TRANSACTIONS, STORES.QUEUE], 'readwrite');
    const txStore = tx.objectStore(STORES.TRANSACTIONS);
    const queueStore = tx.objectStore(STORES.QUEUE);

    const index = txStore.index('pharmacy_client_op');
    const checkReq = index.get([pharmacyId, clientOpId]);

    checkReq.onsuccess = () => {
      if (checkReq.result) {
        reject(new Error(`Transaction with client_op_id [${clientOpId}] already exists in pharmacy [${pharmacyId}]`));
        return;
      }

      txStore.add(transaction);
      queueStore.add(queueItem);
    };

    checkReq.onerror = () => {
      reject(new Error(`Failed to check existing transaction: ${checkReq.error?.message}`));
    };

    tx.oncomplete = () => {
      resolve({ transaction, queueItem });
    };

    tx.onerror = () => {
      reject(new Error(`Transaction commit failed: ${tx.error?.message}`));
    };
  });
};

/**
 * Retrieves a local transaction by its compound partition key (pharmacy_id, client_op_id).
 */
export const getLocalTransaction = async (
  pharmacyId: string,
  clientOpId: string,
  customFactory?: IDBFactory
): Promise<LocalTransaction | null> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const normOp = clientOpId.toLowerCase().trim();
  const db = await openOfflineDb(customFactory);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.TRANSACTIONS, 'readonly');
    const store = tx.objectStore(STORES.TRANSACTIONS);
    const index = store.index('pharmacy_client_op');
    const req = index.get([normPharmacy, normOp]);

    req.onsuccess = () => {
      const result = req.result as LocalTransaction | undefined;
      // Strict pharmacy isolation guard
      if (result && result.pharmacy_id !== normPharmacy) {
        resolve(null);
      } else {
        resolve(result || null);
      }
    };

    req.onerror = () => {
      reject(new Error(`Failed to read local transaction: ${req.error?.message}`));
    };
  });
};

/**
 * Retrieves all transactions partitioned under a specific pharmacy.
 */
export const getTransactionsByPharmacy = async (
  pharmacyId: string,
  customFactory?: IDBFactory
): Promise<LocalTransaction[]> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const db = await openOfflineDb(customFactory);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.TRANSACTIONS, 'readonly');
    const store = tx.objectStore(STORES.TRANSACTIONS);
    const index = store.index('pharmacy_id');
    const req = index.getAll(normPharmacy);

    req.onsuccess = () => {
      const rows = (req.result || []) as LocalTransaction[];
      resolve(rows.filter((r) => r.pharmacy_id === normPharmacy));
    };

    req.onerror = () => {
      reject(new Error(`Failed to get pharmacy transactions: ${req.error?.message}`));
    };
  });
};

/**
 * Updates the status of a local transaction record.
 */
export const updateLocalTransactionStatus = async (
  pharmacyId: string,
  clientOpId: string,
  status: TransactionStatus,
  customFactory?: IDBFactory
): Promise<void> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const normOp = clientOpId.toLowerCase().trim();
  const db = await openOfflineDb(customFactory);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.TRANSACTIONS, 'readwrite');
    const store = tx.objectStore(STORES.TRANSACTIONS);
    const index = store.index('pharmacy_client_op');
    const req = index.get([normPharmacy, normOp]);

    req.onsuccess = () => {
      const record = req.result as LocalTransaction | undefined;
      if (!record || record.pharmacy_id !== normPharmacy) {
        reject(new Error(`Transaction not found for client_op_id [${normOp}] under pharmacy [${normPharmacy}]`));
        return;
      }

      record.status = status;
      record.updated_at = Date.now();
      store.put(record);
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(`Failed to update transaction status: ${tx.error?.message}`));
  });
};

/**
 * Retrieves a queue item by (pharmacy_id, client_op_id).
 */
export const getQueueItem = async (
  pharmacyId: string,
  clientOpId: string,
  customFactory?: IDBFactory
): Promise<SyncQueueItem | null> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const normOp = clientOpId.toLowerCase().trim();
  const db = await openOfflineDb(customFactory);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.QUEUE, 'readonly');
    const store = tx.objectStore(STORES.QUEUE);
    const index = store.index('pharmacy_client_op');
    const req = index.get([normPharmacy, normOp]);

    req.onsuccess = () => {
      const result = req.result as SyncQueueItem | undefined;
      if (result && result.pharmacy_id !== normPharmacy) {
        resolve(null);
      } else {
        resolve(result || null);
      }
    };

    req.onerror = () => {
      reject(new Error(`Failed to read queue item: ${req.error?.message}`));
    };
  });
};

export interface LeaseAcquisitionResult {
  acquired: boolean;
  reason?: 'SUCCESS' | 'LEASE_ACTIVE' | 'TERMINAL_STATE' | 'NOT_FOUND' | 'UNAUTHORIZED_PHARMACY' | 'NOT_ELIGIBLE';
  item?: SyncQueueItem;
}

/**
 * Atomically acquires a synchronization lease for a queue item inside a single
 * exclusive W3C IndexedDB readwrite transaction.
 * 
 * Guarantees cross-tab / cross-window mutual exclusion:
 * 1. The readwrite transaction acquires an exclusive lock on the sync_queue store across all tabs.
 * 2. It inspects the record: if already in SYNCING with an unexpired locked_at timestamp, acquisition fails.
 * 3. If eligible, it atomically updates status to SYNCING and locked_at to the current timestamp.
 * 4. Competing tabs whose transactions run sequentially will read the updated SYNCING state and fail acquisition.
 */
export const acquireQueueLease = async (
  pharmacyId: string,
  clientOpId: string,
  leaseTimeoutMs: number = 60000,
  customFactory?: IDBFactory
): Promise<LeaseAcquisitionResult> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const normOp = clientOpId.toLowerCase().trim();
  const db = await openOfflineDb(customFactory);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.QUEUE, 'readwrite');
    const store = tx.objectStore(STORES.QUEUE);
    const index = store.index('pharmacy_client_op');
    const req = index.get([normPharmacy, normOp]);

    req.onsuccess = () => {
      const item = req.result as SyncQueueItem | undefined;
      if (!item) {
        resolve({ acquired: false, reason: 'NOT_FOUND' });
        return;
      }

      if (item.pharmacy_id !== normPharmacy) {
        resolve({ acquired: false, reason: 'UNAUTHORIZED_PHARMACY' });
        return;
      }

      // Check terminal states
      if (item.status === 'COMMITTED' || item.status === 'PERMANENT_FAILURE') {
        resolve({ acquired: false, reason: 'TERMINAL_STATE', item });
        return;
      }

      const now = Date.now();

      // Check if another tab/worker currently holds an active (unexpired) lease
      if (item.status === 'SYNCING' && item.locked_at !== null && (now - item.locked_at < leaseTimeoutMs)) {
        resolve({ acquired: false, reason: 'LEASE_ACTIVE', item });
        return;
      }

      // Check eligibility: PENDING, RETRYABLE, or stale SYNCING (lease expired)
      if (item.status !== 'PENDING' && item.status !== 'RETRYABLE' && item.status !== 'SYNCING') {
        resolve({ acquired: false, reason: 'NOT_ELIGIBLE', item });
        return;
      }

      // Atomic transition to SYNCING with new lease timestamp
      const updatedItem: SyncQueueItem = {
        ...item,
        status: 'SYNCING',
        attempts: item.attempts + 1,
        last_attempt_at: now,
        locked_at: now,
        updated_at: now
      };

      store.put(updatedItem);
      resolve({ acquired: true, reason: 'SUCCESS', item: updatedItem });
    };

    req.onerror = () => {
      reject(new Error(`Failed to acquire queue lease: ${req.error?.message}`));
    };
  });
};

/**
 * Returns all eligible queue items for a pharmacy (PENDING or RETRYABLE with next_attempt_at <= now).
 */
export const getEligibleQueueItems = async (
  pharmacyId: string,
  now: number = Date.now(),
  customFactory?: IDBFactory
): Promise<SyncQueueItem[]> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const db = await openOfflineDb(customFactory);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.QUEUE, 'readonly');
    const store = tx.objectStore(STORES.QUEUE);
    const index = store.index('pharmacy_id');
    const req = index.getAll(normPharmacy);

    req.onsuccess = () => {
      const items = (req.result || []) as SyncQueueItem[];
      const eligible = items.filter((item) => {
        if (item.pharmacy_id !== normPharmacy) return false;
        if (item.status !== 'PENDING' && item.status !== 'RETRYABLE') return false;
        // Lease lock expiration: if locked more than 60s ago, consider lease expired
        if (item.locked_at !== null && now - item.locked_at < 60000) return false;
        return item.next_attempt_at <= now;
      });

      // Sort by priority: created_at ascending (FIFO)
      eligible.sort((a, b) => a.created_at - b.created_at);
      resolve(eligible);
    };

    req.onerror = () => {
      reject(new Error(`Failed to fetch eligible queue items: ${req.error?.message}`));
    };
  });
};

/**
 * Updates a SyncQueueItem record in the queue store.
 */
export const updateQueueItem = async (
  item: SyncQueueItem,
  customFactory?: IDBFactory
): Promise<void> => {
  const db = await openOfflineDb(customFactory);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.QUEUE, 'readwrite');
    const store = tx.objectStore(STORES.QUEUE);
    const req = store.put(item);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(new Error(`Failed to update queue item: ${req.error?.message}`));
  });
};

/**
 * Records an operation audit result.
 */
export const recordOperationResult = async (
  result: Omit<OperationResult, 'id'>,
  customFactory?: IDBFactory
): Promise<OperationResult> => {
  const fullResult: OperationResult = {
    ...result,
    id: crypto.randomUUID().toLowerCase()
  };

  const db = await openOfflineDb(customFactory);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.RESULTS, 'readwrite');
    const store = tx.objectStore(STORES.RESULTS);
    store.put(fullResult);

    tx.oncomplete = () => resolve(fullResult);
    tx.onerror = () => reject(new Error(`Failed to record operation result: ${tx.error?.message}`));
  });
};

/**
 * Retrieves the recorded operation result for a given client_op_id within a pharmacy.
 */
export const getOperationResult = async (
  pharmacyId: string,
  clientOpId: string,
  customFactory?: IDBFactory
): Promise<OperationResult | null> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const normOp = clientOpId.toLowerCase().trim();
  const db = await openOfflineDb(customFactory);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.RESULTS, 'readonly');
    const store = tx.objectStore(STORES.RESULTS);
    const index = store.index('pharmacy_client_op');
    const req = index.get([normPharmacy, normOp]);

    req.onsuccess = () => {
      const res = req.result as OperationResult | undefined;
      resolve(res && res.pharmacy_id === normPharmacy ? res : null);
    };

    req.onerror = () => {
      reject(new Error(`Failed to read operation result: ${req.error?.message}`));
    };
  });
};

/**
 * Purges all local offline data for a single pharmacy without affecting any other pharmacy.
 */
export const clearPharmacyOfflineData = async (
  pharmacyId: string,
  customFactory?: IDBFactory
): Promise<void> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const db = await openOfflineDb(customFactory);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      [
        STORES.TRANSACTIONS,
        STORES.QUEUE,
        STORES.RESULTS,
        STORES.PRODUCTS,
        STORES.BATCHES,
        STORES.SNAPSHOT_METADATA,
        STORES.CUSTOMERS
      ],
      'readwrite'
    );

    const deleteFromStore = (storeName: string) => {
      const store = tx.objectStore(storeName);
      const index = store.index('pharmacy_id');
      const req = index.getAllKeys(normPharmacy);
      req.onsuccess = () => {
        const keys = req.result || [];
        keys.forEach((key) => store.delete(key));
      };
    };

    deleteFromStore(STORES.TRANSACTIONS);
    deleteFromStore(STORES.QUEUE);
    deleteFromStore(STORES.RESULTS);
    deleteFromStore(STORES.PRODUCTS);
    deleteFromStore(STORES.BATCHES);
    deleteFromStore(STORES.CUSTOMERS);

    // Delete snapshot metadata (keyed by pharmacy_id)
    tx.objectStore(STORES.SNAPSHOT_METADATA).delete(normPharmacy);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(`Failed to clear pharmacy offline data: ${tx.error?.message}`));
  });
};

/**
 * Persists an array of customers into the tenant-partitioned customers store.
 */
export const saveOfflineCustomers = async (
  pharmacyId: string,
  customers: Array<{
    id: string;
    pharmacy_id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    status: string;
    created_at: string;
    updated_at: string;
  }>,
  customFactory?: IDBFactory
): Promise<void> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const db = await openOfflineDb(customFactory);

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.CUSTOMERS], 'readwrite');
    const store = tx.objectStore(STORES.CUSTOMERS);

    // Clear existing customers for this pharmacy
    const index = store.index('pharmacy_id');
    const req = index.getAllKeys(normPharmacy);
    req.onsuccess = () => {
      const keys = req.result || [];
      keys.forEach((k) => store.delete(k));

      // Insert fresh snapshot
      for (const c of customers) {
        if (c.pharmacy_id.toLowerCase().trim() === normPharmacy) {
          store.put(c);
        }
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(`Failed to save offline customers: ${tx.error?.message}`));
  });
};

/**
 * Saves or updates a single offline customer record.
 */
export const saveSingleOfflineCustomer = async (
  customer: {
    id: string;
    pharmacy_id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    status: string;
    created_at: string;
    updated_at: string;
  },
  customFactory?: IDBFactory
): Promise<void> => {
  const db = await openOfflineDb(customFactory);
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.CUSTOMERS], 'readwrite');
    const store = tx.objectStore(STORES.CUSTOMERS);
    store.put(customer);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(`Failed to save customer: ${tx.error?.message}`));
  });
};

/**
 * Retrieves all offline customers for a specific pharmacy tenant.
 */
export const getOfflineCustomers = async (
  pharmacyId: string,
  customFactory?: IDBFactory
): Promise<Array<{
  id: string;
  pharmacy_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}>> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const db = await openOfflineDb(customFactory);

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.CUSTOMERS], 'readonly');
    const store = tx.objectStore(STORES.CUSTOMERS);
    const index = store.index('pharmacy_id');
    const req = index.getAll(normPharmacy);

    req.onsuccess = () => {
      resolve(req.result || []);
    };
    req.onerror = () => {
      reject(new Error(`Failed to query offline customers: ${req.error?.message}`));
    };
  });
};

/**
 * Searches offline customers by name or phone within tenant boundary.
 */
export const searchOfflineCustomers = async (
  pharmacyId: string,
  query: string,
  customFactory?: IDBFactory
): Promise<Array<{
  id: string;
  pharmacy_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}>> => {
  const all = await getOfflineCustomers(pharmacyId, customFactory);
  const q = query.toLowerCase().trim();
  if (!q) return all;

  return all.filter((c) => {
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.toLowerCase().includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q))
    );
  });
};

/**
 * Scope parameters for querying unresolved queue items.
 */
export interface QueueScopeFilter {
  deviceId?: string;
  pharmacyId?: string;
}

/**
 * Retrieves all unresolved operations from the local sync queue, scoped to the device identity
 * and/or pharmacy partition.
 * 
 * Unresolved / non-terminal states that require synchronization:
 * - 'PENDING'
 * - 'SYNCING'
 * - 'RETRYABLE'
 * - 'AUTH_REQUIRED'
 * - 'DEVICE_BLOCKED'
 * 
 * Terminal resolved states:
 * - 'COMMITTED'
 * - 'PERMANENT_FAILURE'
 * 
 * Architectural Invariant (Device-Scoped Queue Safety):
 * In the offline-first POS architecture, local IndexedDB transactions are created on the active
 * physical workstation. Each local operation is bound either explicitly via `payload.device_id`
 * or implicitly to the active workstation's `deviceIdentity.deviceId`.
 * When a `deviceId` filter is supplied:
 * - If the queried `deviceId` matches the local workstation's active terminal, local unresolved operations are included.
 * - If the queried `deviceId` represents a remote device, local operations do NOT belong to it and return empty.
 */
export const getUnresolvedQueueItems = async (
  scopeOrDeviceIdOrPharmacy?: string | QueueScopeFilter,
  pharmacyIdOrCustomFactory?: string | IDBFactory,
  customFactoryArg?: IDBFactory
): Promise<SyncQueueItem[]> => {
  let targetDeviceId: string | undefined;
  let targetPharmacyId: string | undefined;
  let effectiveFactory: IDBFactory | undefined;

  if (typeof scopeOrDeviceIdOrPharmacy === 'object' && scopeOrDeviceIdOrPharmacy !== null) {
    targetDeviceId = scopeOrDeviceIdOrPharmacy.deviceId;
    targetPharmacyId = scopeOrDeviceIdOrPharmacy.pharmacyId;
    effectiveFactory = typeof pharmacyIdOrCustomFactory === 'object' ? (pharmacyIdOrCustomFactory as IDBFactory) : customFactoryArg;
  } else if (typeof scopeOrDeviceIdOrPharmacy === 'string') {
    if (typeof pharmacyIdOrCustomFactory === 'string') {
      targetDeviceId = scopeOrDeviceIdOrPharmacy;
      targetPharmacyId = pharmacyIdOrCustomFactory;
      effectiveFactory = customFactoryArg;
    } else {
      effectiveFactory = pharmacyIdOrCustomFactory as IDBFactory | undefined;
      targetDeviceId = scopeOrDeviceIdOrPharmacy;
    }
  } else {
    effectiveFactory = typeof pharmacyIdOrCustomFactory === 'object' ? (pharmacyIdOrCustomFactory as IDBFactory) : customFactoryArg;
  }

  const db = await openOfflineDb(effectiveFactory);
  const activeIdentity = await getActiveDeviceIdentity(effectiveFactory);

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.QUEUE, STORES.TRANSACTIONS], 'readonly');
    const queueStore = tx.objectStore(STORES.QUEUE);
    const txStore = tx.objectStore(STORES.TRANSACTIONS);
    const req = queueStore.getAll();

    req.onsuccess = () => {
      const allItems: SyncQueueItem[] = req.result || [];
      const normPharmacy = targetPharmacyId ? targetPharmacyId.toLowerCase().trim() : null;
      const normTarget = targetDeviceId ? targetDeviceId.toLowerCase().trim() : null;

      // Filter by unresolved status and pharmacy (if pharmacyId is explicitly passed)
      const unresolvedCandidates = allItems.filter((item) => {
        if (normPharmacy && item.pharmacy_id.toLowerCase().trim() !== normPharmacy) {
          return false;
        }
        return item.status !== 'COMMITTED' && item.status !== 'PERMANENT_FAILURE';
      });

      if (!normTarget || unresolvedCandidates.length === 0) {
        resolve(unresolvedCandidates);
        return;
      }

      const isDirectPharmacyMatch = unresolvedCandidates.some(
        (item) => item.pharmacy_id.toLowerCase().trim() === normTarget
      );
      const isLocalTerminalMatch = Boolean(
        activeIdentity && activeIdentity.deviceId.toLowerCase().trim() === normTarget
      );

      const matchedItems: SyncQueueItem[] = [];
      let pendingChecks = unresolvedCandidates.length;

      for (const item of unresolvedCandidates) {
        const txReq = txStore.get(item.id);
        const onCheckComplete = () => {
          pendingChecks--;
          if (pendingChecks === 0) {
            resolve(matchedItems);
          }
        };

        txReq.onsuccess = () => {
          const txRecord = txReq.result as LocalTransaction | undefined;
          const explicitDeviceId = txRecord?.payload?.device_id as string | undefined;

          if (explicitDeviceId) {
            if (explicitDeviceId.toLowerCase().trim() === normTarget) {
              matchedItems.push(item);
            }
          } else {
            // Implicit scoping: bound to local workstation active deviceId
            if (isLocalTerminalMatch || (isDirectPharmacyMatch && !targetPharmacyId)) {
              matchedItems.push(item);
            }
          }
          onCheckComplete();
        };

        txReq.onerror = () => {
          if (isLocalTerminalMatch || (isDirectPharmacyMatch && !targetPharmacyId)) {
            matchedItems.push(item);
          }
          onCheckComplete();
        };
      }
    };

    req.onerror = () => {
      reject(new Error(`Failed to query unresolved queue items: ${req.error?.message}`));
    };
  });
};

/**
 * Returns the count of unresolved local offline operations.
 * 
 * Mandatory Decommission Safety Invariant:
 * pendingOfflineOperations(deviceId) > 0 => DECOMMISSION BLOCKED.
 * 
 * Scoped authoritatively to the target deviceId.
 */
export const countUnresolvedQueueOperations = async (
  scopeOrDeviceIdOrPharmacy?: string | QueueScopeFilter,
  pharmacyIdOrCustomFactory?: string | IDBFactory,
  customFactory?: IDBFactory
): Promise<number> => {
  const unresolved = await getUnresolvedQueueItems(
    scopeOrDeviceIdOrPharmacy,
    pharmacyIdOrCustomFactory,
    customFactory
  );
  return unresolved.length;
};


