/**
 * PharmacyFlow Offline Inventory Read Model Service (Phase 5D-4)
 * 
 * Provides local product/batch lookups, search, deterministic batch recommendation,
 * expiry analysis, and atomic server snapshot ingestion.
 * 
 * CORE PRINCIPLE:
 * This is a local read model and projection for offline POS usability.
 * Authoritative inventory remains in PostgreSQL. Local quantities are projected stock.
 */

import {
  LocalProduct,
  LocalBatch,
  InventorySnapshot,
  InventorySnapshotMetadata,
  BatchExpiryInfo,
  BatchSelectionOptions,
  StockIntakeRequest,
  StockIntakeResult,
  StockAdjustmentRequest,
  StockAdjustmentResult,
  StockTransferDispatchRequest,
  StockTransferDispatchResult,
  StockTransferReceiveRequest,
  StockTransferReceiveResult,
  StockTransferStatus,
  StockTransferRecord,
  StockTransferItemRecord,
  StockTransferWithBranches,
  StockTransferItemWithProduct,
  StockTransferDetail,
  FetchStockTransfersOptions,
  CreateProductInput,
  UpdateProductInput,
  DuplicateCheckResult,
  BarcodeResolutionResult,
  CatalogMutationResult
} from './types';
import {
  validateSnapshot,
  isValidUuid,
  validateStockIntakeRequest,
  validateStockAdjustmentRequest,
  validateStockTransferDispatchRequest,
  validateStockTransferReceiveRequest
} from './validation';
import { computeExpiryInfo, parseUtcMidnight } from './expiry';
import { openOfflineDb, STORES } from '../offline/db';
import { SaleLineItemInput } from '../sales/types';
import { supabase } from '../supabase';
import { SupabaseClient } from '@supabase/supabase-js';
import { isOnline } from '../offline/network';
import { refreshInventorySnapshot } from './sync';

/**
 * Atomically replaces the local catalog snapshot for a specific pharmacy in IndexedDB.
 */
export const replacePharmacyInventorySnapshot = async (
  pharmacyId: string,
  snapshot: InventorySnapshot,
  customFactory?: IDBFactory
): Promise<InventorySnapshotMetadata> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const now = Date.now();

  // 1. Strict validation
  const validation = validateSnapshot(snapshot, normPharmacy, now);
  if (!validation.isValid) {
    throw new Error(`Inventory snapshot validation failed: ${validation.errors.join('; ')}`);
  }

  const db = await openOfflineDb(customFactory);

  return new Promise((resolve, reject) => {
    // Single atomic readwrite transaction covering products, batches, and snapshot metadata
    const tx = db.transaction(
      [STORES.PRODUCTS, STORES.BATCHES, STORES.SNAPSHOT_METADATA],
      'readwrite'
    );

    const productStore = tx.objectStore(STORES.PRODUCTS);
    const batchStore = tx.objectStore(STORES.BATCHES);
    const metaStore = tx.objectStore(STORES.SNAPSHOT_METADATA);

    // 2. Clear previous products for this pharmacy
    const prodIndex = productStore.index('pharmacy_id');
    const prodKeysReq = prodIndex.getAllKeys(normPharmacy);
    prodKeysReq.onsuccess = () => {
      const keys = prodKeysReq.result || [];
      keys.forEach((key) => productStore.delete(key));

      // Insert validated products
      for (const prod of validation.validatedProducts) {
        productStore.put(prod);
      }
    };

    // 3. Clear previous batches for this pharmacy
    const batchIndex = batchStore.index('pharmacy_id');
    const batchKeysReq = batchIndex.getAllKeys(normPharmacy);
    batchKeysReq.onsuccess = () => {
      const keys = batchKeysReq.result || [];
      keys.forEach((key) => batchStore.delete(key));

      // Insert validated batches
      for (const b of validation.validatedBatches) {
        batchStore.put(b);
      }
    };

    // 4. Update snapshot metadata
    const metadata: InventorySnapshotMetadata = {
      pharmacy_id: normPharmacy,
      synced_at: now,
      source_updated_at: snapshot.source_updated_at || null,
      product_count: validation.validatedProducts.length,
      batch_count: validation.validatedBatches.length,
      read_model_version: 1
    };

    metaStore.put(metadata);

    tx.oncomplete = () => resolve(metadata);
    tx.onerror = () => reject(new Error(`Failed to ingest inventory snapshot: ${tx.error?.message}`));
  });
};

/**
 * Retrieves a single product by ID, strictly scoped to the active pharmacy.
 */
export const getProductById = async (
  pharmacyId: string,
  productId: string,
  customFactory?: IDBFactory
): Promise<LocalProduct | null> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const normProduct = productId.toLowerCase().trim();

  if (!isValidUuid(normProduct)) return null;

  const db = await openOfflineDb(customFactory);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PRODUCTS, 'readonly');
    const store = tx.objectStore(STORES.PRODUCTS);
    const index = store.index('pharmacy_product');
    const req = index.get([normPharmacy, normProduct]);

    req.onsuccess = () => {
      const p = req.result as LocalProduct | undefined;
      resolve(p && p.pharmacy_id === normPharmacy ? p : null);
    };
    req.onerror = () => reject(new Error(`Failed to get product: ${req.error?.message}`));
  });
};

/**
 * Finds a product by barcode, strictly scoped to the active pharmacy.
 */
export const findProductByBarcode = async (
  pharmacyId: string,
  barcode: string,
  customFactory?: IDBFactory
): Promise<LocalProduct | null> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const cleanBarcode = barcode.trim();
  if (!cleanBarcode) return null;

  const db = await openOfflineDb(customFactory);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PRODUCTS, 'readonly');
    const store = tx.objectStore(STORES.PRODUCTS);
    const index = store.index('pharmacy_barcode');
    const req = index.get([normPharmacy, cleanBarcode]);

    req.onsuccess = () => {
      const p = req.result as LocalProduct | undefined;
      resolve(p && p.pharmacy_id === normPharmacy ? p : null);
    };
    req.onerror = () => reject(new Error(`Failed to find product by barcode: ${req.error?.message}`));
  });
};

/**
 * Finds all products matching a barcode, strictly scoped to the active pharmacy.
 * Uses the composite index 'pharmacy_barcode' (['pharmacy_id', 'barcode']) with getAll().
 * Enforces strict multi-tenant boundary isolation.
 * Phase 5D-22 Mandatory POS Barcode Safety foundation.
 */
export const findProductsByBarcode = async (
  pharmacyId: string,
  barcode: string,
  customFactory?: IDBFactory
): Promise<LocalProduct[]> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const cleanBarcode = barcode.trim();
  if (!cleanBarcode) return [];

  const db = await openOfflineDb(customFactory);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PRODUCTS, 'readonly');
    const store = tx.objectStore(STORES.PRODUCTS);
    const index = store.index('pharmacy_barcode');
    const req = index.getAll([normPharmacy, cleanBarcode]);

    req.onsuccess = () => {
      const all = (req.result as LocalProduct[]) || [];
      const matching = all.filter((p) => p.pharmacy_id === normPharmacy);
      resolve(matching);
    };
    req.onerror = () => reject(new Error(`Failed to find products by barcode: ${req.error?.message}`));
  });
};

/**
 * Evaluates a scanned barcode for POS fail-safe duplicate-product resolution.
 * Categorizes matches into NO_MATCH, SINGLE_ACTIVE, SINGLE_INACTIVE, or MULTIPLE_MATCHES.
 * Strictly prevents automated selection when multiple products match.
 */
export const resolveBarcodeScan = async (
  pharmacyId: string,
  barcode: string,
  customFactory?: IDBFactory
): Promise<BarcodeResolutionResult> => {
  const matches = await findProductsByBarcode(pharmacyId, barcode, customFactory);

  if (matches.length === 0) {
    return { type: 'NO_MATCH', matches: [] };
  }

  if (matches.length === 1) {
    const single = matches[0];
    if (single.status?.toUpperCase() === 'INACTIVE') {
      return { type: 'SINGLE_INACTIVE', matches, product: single };
    }
    return { type: 'SINGLE_ACTIVE', matches, product: single };
  }

  // Multiple products share this barcode
  return { type: 'MULTIPLE_MATCHES', matches };
};

/**
 * Safely parses and converts a decimal or string currency input into integer minor units (kobo / cents).
 * 1.00 major unit = 100 minor units.
 * Rejects negative values, non-numeric values, or non-finite values.
 */
export const parseMajorCurrencyToMinor = (
  input: string | number
): { success: boolean; value?: number; error?: string } => {
  let num: number;
  if (typeof input === 'number') {
    num = input;
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      return { success: false, error: 'Price input cannot be empty' };
    }
    num = Number(trimmed);
  } else {
    return { success: false, error: 'Invalid price input type' };
  }

  if (isNaN(num) || !isFinite(num)) {
    return { success: false, error: 'Price must be a valid finite number' };
  }

  if (num < 0) {
    return { success: false, error: 'Price cannot be negative' };
  }

  if (num > 100000000) {
    return { success: false, error: 'Price exceeds maximum allowed value' };
  }

  const minor = Math.round(num * 100);
  return { success: true, value: minor };
};

/**
 * Finds a product by SKU, strictly scoped to the active pharmacy.
 */
export const findProductBySku = async (
  pharmacyId: string,
  sku: string,
  customFactory?: IDBFactory
): Promise<LocalProduct | null> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const cleanSku = sku.trim();
  if (!cleanSku) return null;

  const db = await openOfflineDb(customFactory);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PRODUCTS, 'readonly');
    const store = tx.objectStore(STORES.PRODUCTS);
    const index = store.index('pharmacy_sku');
    const req = index.get([normPharmacy, cleanSku]);

    req.onsuccess = () => {
      const p = req.result as LocalProduct | undefined;
      resolve(p && p.pharmacy_id === normPharmacy ? p : null);
    };
    req.onerror = () => reject(new Error(`Failed to find product by SKU: ${req.error?.message}`));
  });
};

/**
 * Performs offline pharmacy-scoped product search across name, generic_name, SKU, and barcode.
 */
export const searchProducts = async (
  pharmacyId: string,
  query: string,
  limit: number = 50,
  customFactory?: IDBFactory
): Promise<LocalProduct[]> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const cleanQuery = query.toLowerCase().trim();
  if (!cleanQuery) return [];

  const db = await openOfflineDb(customFactory);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PRODUCTS, 'readonly');
    const store = tx.objectStore(STORES.PRODUCTS);
    const index = store.index('pharmacy_id');
    const req = index.getAll(normPharmacy);

    req.onsuccess = () => {
      const all = (req.result as LocalProduct[]) || [];
      const matches: LocalProduct[] = [];

      for (const p of all) {
        if (p.pharmacy_id !== normPharmacy) continue;

        const nameMatch = p.name.toLowerCase().includes(cleanQuery);
        const genericMatch = p.generic_name ? p.generic_name.toLowerCase().includes(cleanQuery) : false;
        const skuMatch = p.sku ? p.sku.toLowerCase().includes(cleanQuery) : false;
        const barcodeMatch = p.barcode ? p.barcode.toLowerCase().includes(cleanQuery) : false;
        const categoryMatch = p.category ? p.category.toLowerCase().includes(cleanQuery) : false;

        if (nameMatch || genericMatch || skuMatch || barcodeMatch || categoryMatch) {
          matches.push(p);
          if (matches.length >= limit) break;
        }
      }

      resolve(matches);
    };

    req.onerror = () => reject(new Error(`Failed to search products: ${req.error?.message}`));
  });
};

/**
 * Lists available local products for the pharmacy read model up to the specified limit.
 */
export const listLocalProducts = async (
  pharmacyId: string,
  limit: number = 50,
  customFactory?: IDBFactory
): Promise<LocalProduct[]> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const db = await openOfflineDb(customFactory);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PRODUCTS, 'readonly');
    const store = tx.objectStore(STORES.PRODUCTS);
    const index = store.index('pharmacy_id');
    const req = index.getAll(normPharmacy);

    req.onsuccess = () => {
      const all = (req.result as LocalProduct[]) || [];
      resolve(all.slice(0, limit));
    };

    req.onerror = () => reject(new Error(`Failed to list products: ${req.error?.message}`));
  });
};

/**
 * Retrieves all local batches for a product within the active pharmacy context.
 */
export const getBatchesForProduct = async (
  pharmacyId: string,
  productId: string,
  branchId?: string,
  customFactory?: IDBFactory
): Promise<LocalBatch[]> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const normProduct = productId.toLowerCase().trim();
  const normBranch = branchId ? branchId.toLowerCase().trim() : undefined;

  const db = await openOfflineDb(customFactory);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.BATCHES, 'readonly');
    const store = tx.objectStore(STORES.BATCHES);
    const index = store.index('pharmacy_product');
    const req = index.getAll([normPharmacy, normProduct]);

    req.onsuccess = () => {
      const batches = (req.result as LocalBatch[]) || [];
      const filtered = batches.filter((b) => {
        if (b.pharmacy_id !== normPharmacy || b.product_id !== normProduct) return false;
        if (normBranch && b.branch_id !== normBranch) return false;
        return true;
      });
      resolve(filtered);
    };

    req.onerror = () => reject(new Error(`Failed to get batches: ${req.error?.message}`));
  });
};

/**
 * Retrieves eligible batches with derived expiry metadata for a product.
 * Returns batches sorted deterministically.
 */
export const getEligibleBatchesForProduct = async (
  pharmacyId: string,
  productId: string,
  options?: BatchSelectionOptions,
  customFactory?: IDBFactory
): Promise<Array<LocalBatch & { expiry: BatchExpiryInfo }>> => {
  const batches = await getBatchesForProduct(pharmacyId, productId, options?.branchId, customFactory);
  const refDate = options?.referenceDate || new Date();

  const evaluated = batches.map((b) => ({
    ...b,
    expiry: computeExpiryInfo(b.expiry_date, refDate)
  }));

  const filtered = evaluated.filter((item) => {
    if (!options?.allowExpired && item.expiry.is_expired) return false;
    return true;
  });

  // Deterministic sorting order:
  // 1. Non-expired before expired
  // 2. Earliest expiry date (UTC midnight timestamp)
  // 3. Highest projected stock
  // 4. Batch ID alphabetical tie-breaker
  filtered.sort((a, b) => {
    if (a.expiry.is_expired !== b.expiry.is_expired) {
      return a.expiry.is_expired ? 1 : -1;
    }
    const aUtc = parseUtcMidnight(a.expiry_date);
    const bUtc = parseUtcMidnight(b.expiry_date);
    if (aUtc !== bUtc) return aUtc - bUtc;

    if (a.projected_stock !== b.projected_stock) {
      return b.projected_stock - a.projected_stock;
    }

    return a.id.localeCompare(b.id);
  });

  return filtered;
};

/**
 * Deterministically recommends a batch for an offline sale line.
 * 
 * PROVISIONAL POS UTILITY:
 * This provides a deterministic suggestion based on local read-model data.
 * It is NOT authoritative inventory logic. Server remains final authority.
 */
export const selectRecommendedBatch = (
  batches: LocalBatch[],
  options?: BatchSelectionOptions
): LocalBatch | null => {
  if (!batches || batches.length === 0) return null;

  const refDate = options?.referenceDate || new Date();
  const evaluated = batches.map((b) => ({
    ...b,
    expiry: computeExpiryInfo(b.expiry_date, refDate)
  }));

  const eligible = evaluated.filter((b) => {
    if (!options?.allowExpired && b.expiry.is_expired) return false;
    return true;
  });

  if (eligible.length === 0) return null;

  eligible.sort((a, b) => {
    if (a.expiry.is_expired !== b.expiry.is_expired) {
      return a.expiry.is_expired ? 1 : -1;
    }
    const aUtc = parseUtcMidnight(a.expiry_date);
    const bUtc = parseUtcMidnight(b.expiry_date);
    if (aUtc !== bUtc) return aUtc - bUtc;

    if (a.projected_stock !== b.projected_stock) {
      return b.projected_stock - a.projected_stock;
    }

    return a.id.localeCompare(b.id);
  });

  return eligible[0];
};

/**
 * Retrieves snapshot synchronization metadata for a pharmacy.
 */
export const getInventorySnapshotMetadata = async (
  pharmacyId: string,
  customFactory?: IDBFactory
): Promise<InventorySnapshotMetadata | null> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const db = await openOfflineDb(customFactory);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.SNAPSHOT_METADATA, 'readonly');
    const store = tx.objectStore(STORES.SNAPSHOT_METADATA);
    const req = store.get(normPharmacy);

    req.onsuccess = () => resolve((req.result as InventorySnapshotMetadata) || null);
    req.onerror = () => reject(new Error(`Failed to get snapshot metadata: ${req.error?.message}`));
  });
};

/**
 * Evaluates whether the cached snapshot is stale.
 * Default max age: 24 hours (86,400,000 ms).
 */
export const isSnapshotStale = (
  metadata: InventorySnapshotMetadata | null,
  maxAgeMs: number = 86_400_000
): boolean => {
  if (!metadata || !metadata.synced_at) return true;
  return Date.now() - metadata.synced_at > maxAgeMs;
};

/**
 * Integrates read-model entities into a Phase 5D-3 SaleLineItemInput.
 */
export const populateSaleLineItemFromReadModel = async (
  pharmacyId: string,
  productId: string,
  batchId: string,
  quantity: number,
  customFactory?: IDBFactory
): Promise<SaleLineItemInput> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const product = await getProductById(normPharmacy, productId, customFactory);
  if (!product) {
    throw new Error(`Product ${productId} not found in pharmacy ${pharmacyId} read model`);
  }

  const db = await openOfflineDb(customFactory);
  const batch = await new Promise<LocalBatch | null>((resolve, reject) => {
    const tx = db.transaction(STORES.BATCHES, 'readonly');
    const store = tx.objectStore(STORES.BATCHES);
    const index = store.index('pharmacy_batch');
    const req = index.get([normPharmacy, batchId.toLowerCase().trim()]);
    req.onsuccess = () => resolve((req.result as LocalBatch) || null);
    req.onerror = () => reject(new Error(`Failed to read batch: ${req.error?.message}`));
  });

  if (!batch) {
    throw new Error(`Batch ${batchId} not found in pharmacy ${pharmacyId} read model`);
  }

  if (batch.product_id !== product.id) {
    throw new Error(`Batch ${batchId} does not belong to product ${productId}`);
  }

  // Determine unit price: prefer batch selling_price, fallback to product selling_price
  const unitPrice = batch.selling_price > 0 ? batch.selling_price : product.selling_price;

  return {
    product_id: product.id,
    batch_id: batch.id,
    quantity: Math.max(1, Math.floor(quantity)),
    unit_price: unitPrice,
    discount: 0,
    tax: 0
  };
};

/**
 * Authoritative Stock Intake / Inventory Receiving (Phase 5D-15)
 * 
 * Invokes PostgreSQL RPC `public.rpc_receive_inventory_stock`.
 * 
 * INVARIANTS:
 * 1. The browser does NOT directly mutate stock quantities or batches.
 * 2. PostgreSQL authoritatively enforces tenant isolation, branch matching,
 *    role permissions (OWNER, MANAGER, PHARMACIST), batch creation/increment,
 *    immutable stock ledger journal entry ('PURCHASE'), and audit logging.
 * 3. Idempotent execution via client_op_id.
 * 4. Refreshes local IndexedDB read model upon successful intake.
 */
export const submitStockIntake = async (
  request: StockIntakeRequest,
  options?: {
    customClient?: SupabaseClient;
    customFactory?: IDBFactory;
    skipRefresh?: boolean;
  }
): Promise<StockIntakeResult> => {
  // 1. Connectivity Check
  if (!isOnline()) {
    return {
      success: false,
      error: 'Network offline. Authoritative stock intake requires an active server connection to PostgreSQL.',
      errorCode: 'NETWORK_OFFLINE'
    };
  }

  // 2. Pre-flight Validation
  const validation = validateStockIntakeRequest(request);
  if (!validation.isValid) {
    return {
      success: false,
      error: `Validation failed: ${validation.errors.join('; ')}`,
      errorCode: 'INVALID_REQUEST'
    };
  }

  // 3. Prepare Authoritative Payload
  const client = options?.customClient || supabase;
  const clientOpId = request.client_op_id || crypto.randomUUID();

  const formattedItems = request.items.map((item) => ({
    product_id: item.product_id.toLowerCase().trim(),
    batch_number: item.batch_number.trim(),
    expiry_date: item.expiry_date.trim(),
    quantity: Math.floor(item.quantity),
    cost_price: Math.max(0, Math.floor(item.cost_price)),
    selling_price: Math.max(0, Math.floor(item.selling_price)),
    batch_id: item.batch_id ? item.batch_id.toLowerCase().trim() : null
  }));

  try {
    const { data, error } = await client.rpc('rpc_receive_inventory_stock', {
      p_pharmacy_id: request.pharmacy_id.toLowerCase().trim(),
      p_branch_id: request.branch_id.toLowerCase().trim(),
      p_items: formattedItems,
      p_supplier_id: request.supplier_id ? request.supplier_id.toLowerCase().trim() : null,
      p_invoice_number: request.invoice_number ? request.invoice_number.trim() : null,
      p_notes: request.notes ? request.notes.trim() : null,
      p_client_op_id: clientOpId
    });

    if (error) {
      let errorCode = 'INTAKE_RPC_ERROR';
      if (error.message?.includes('AUTH_REQUIRED')) errorCode = 'AUTH_REQUIRED';
      else if (error.message?.includes('FORBIDDEN_PHARMACY')) errorCode = 'FORBIDDEN_PHARMACY';
      else if (error.message?.includes('FORBIDDEN_PERMISSION')) errorCode = 'FORBIDDEN_PERMISSION';
      else if (error.message?.includes('SUPPLIER_MISMATCH')) errorCode = 'SUPPLIER_MISMATCH';
      else if (error.message?.includes('BRANCH_MISMATCH')) errorCode = 'BRANCH_MISMATCH';
      else if (error.message?.includes('PRODUCT_NOT_FOUND')) errorCode = 'PRODUCT_NOT_FOUND';
      else if (error.message?.includes('INVALID_QUANTITY')) errorCode = 'INVALID_QUANTITY';
      else if (error.message?.includes('INVALID_BATCH_NUMBER')) errorCode = 'INVALID_BATCH_NUMBER';
      else if (error.message?.includes('INVALID_EXPIRY')) errorCode = 'INVALID_EXPIRY';

      return {
        success: false,
        error: error.message,
        errorCode
      };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.purchase_id) {
      return {
        success: false,
        error: 'Stock intake RPC returned unexpected response format',
        errorCode: 'UNEXPECTED_RESPONSE'
      };
    }

    // 4. Trigger Automatic Local Catalog Refresh (if not explicitly skipped)
    if (!options?.skipRefresh) {
      try {
        await refreshInventorySnapshot(client, request.pharmacy_id, {
          customFactory: options?.customFactory,
          force: true
        });
      } catch (refreshErr) {
        console.warn('[PharmacyFlow] Local read-model refresh after stock intake encountered an error:', refreshErr);
      }
    }

    return {
      success: true,
      purchase_id: row.purchase_id,
      status: row.status || 'COMPLETED',
      total_items: Number(row.total_items) || formattedItems.length,
      total_cost: Number(row.total_cost) || 0,
      processed_at: row.processed_at || new Date().toISOString()
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Unknown stock intake exception',
      errorCode: 'UNEXPECTED_EXCEPTION'
    };
  }
};

/**
 * Authoritative Stock Adjustment Execution (Phase 5D-16)
 * 
 * Rules:
 * 1. Online-only: Strictly rejected if offline.
 * 2. Preflight client validation via validateStockAdjustmentRequest.
 * 3. Invokes authoritative PostgreSQL SECURITY DEFINER RPC: rpc_adjust_inventory_stock.
 * 4. Automatically triggers local read-model refresh upon success.
 */
export const adjustInventoryStock = async (
  request: StockAdjustmentRequest,
  options?: {
    customClient?: SupabaseClient;
    customFactory?: IDBFactory;
    skipRefresh?: boolean;
  }
): Promise<StockAdjustmentResult> => {
  // 1. Online Precondition
  if (!isOnline()) {
    return {
      success: false,
      error: 'Stock adjustments require an active server connection. Offline adjustments are not supported.',
      errorCode: 'OFFLINE_UNSUPPORTED'
    };
  }

  // 2. Client Payload Validation & Idempotency Guarantee
  const valResult = validateStockAdjustmentRequest(request);
  if (!valResult.isValid) {
    return {
      success: false,
      error: `Validation failed: ${valResult.errors.join('; ')}`,
      errorCode: 'VALIDATION_FAILED'
    };
  }

  // 3. Prepare Authoritative Payload
  const client = options?.customClient || supabase;

  try {
    const { data, error } = await client.rpc('rpc_adjust_inventory_stock', {
      p_pharmacy_id: request.pharmacy_id.toLowerCase().trim(),
      p_branch_id: request.branch_id.toLowerCase().trim(),
      p_product_id: request.product_id.toLowerCase().trim(),
      p_batch_id: request.batch_id.toLowerCase().trim(),
      p_direction: request.direction.toUpperCase().trim(),
      p_quantity: Math.floor(request.quantity),
      p_reason: request.reason.trim(),
      p_client_op_id: request.client_op_id,
      p_notes: request.notes ? request.notes.trim() : null
    });

    if (error) {
      let errorCode = 'ADJUSTMENT_RPC_ERROR';
      if (error.message?.includes('AUTH_REQUIRED')) errorCode = 'AUTH_REQUIRED';
      else if (error.message?.includes('CLIENT_OP_REQUIRED')) errorCode = 'CLIENT_OP_REQUIRED';
      else if (error.message?.includes('FORBIDDEN_PHARMACY')) errorCode = 'FORBIDDEN_PHARMACY';
      else if (error.message?.includes('FORBIDDEN_PERMISSION')) errorCode = 'FORBIDDEN_PERMISSION';
      else if (error.message?.includes('BRANCH_MISMATCH')) errorCode = 'BRANCH_MISMATCH';
      else if (error.message?.includes('PRODUCT_NOT_FOUND')) errorCode = 'PRODUCT_NOT_FOUND';
      else if (error.message?.includes('BATCH_NOT_FOUND')) errorCode = 'BATCH_NOT_FOUND';
      else if (error.message?.includes('INVALID_QUANTITY')) errorCode = 'INVALID_QUANTITY';
      else if (error.message?.includes('INVALID_DIRECTION')) errorCode = 'INVALID_DIRECTION';
      else if (error.message?.includes('INVALID_REASON')) errorCode = 'INVALID_REASON';
      else if (error.message?.includes('IDEMPOTENCY_CONFLICT')) errorCode = 'IDEMPOTENCY_CONFLICT';

      return {
        success: false,
        error: error.message,
        errorCode
      };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.adjustment_id) {
      return {
        success: false,
        error: 'Stock adjustment RPC returned unexpected response format',
        errorCode: 'UNEXPECTED_RESPONSE'
      };
    }

    // 4. Trigger Automatic Local Catalog Refresh (if not explicitly skipped)
    if (!options?.skipRefresh) {
      try {
        await refreshInventorySnapshot(client, request.pharmacy_id, {
          customFactory: options?.customFactory,
          force: true
        });
      } catch (refreshErr) {
        console.warn('[PharmacyFlow] Local read-model refresh after stock adjustment encountered an error:', refreshErr);
      }
    }

    return {
      success: true,
      adjustment_id: row.adjustment_id,
      batch_id: row.batch_id,
      previous_quantity: Number(row.previous_quantity),
      adjustment_quantity: Number(row.adjustment_quantity),
      resulting_quantity: Number(row.resulting_quantity),
      adjusted_at: row.adjusted_at || new Date().toISOString()
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Unknown stock adjustment exception',
      errorCode: 'UNEXPECTED_EXCEPTION'
    };
  }
};

/**
 * Authoritative Inter-Branch Stock Transfer Dispatch Execution (Phase 5D-17)
 * 
 * Rules:
 * 1. Online-only: Strictly rejected if offline.
 * 2. Preflight client validation via validateStockTransferDispatchRequest.
 * 3. Invokes authoritative PostgreSQL SECURITY DEFINER RPC: rpc_dispatch_stock_transfer.
 * 4. Automatically triggers local read-model refresh upon success.
 */
export const dispatchStockTransfer = async (
  request: StockTransferDispatchRequest,
  options?: {
    customClient?: SupabaseClient;
    customFactory?: IDBFactory;
    skipRefresh?: boolean;
  }
): Promise<StockTransferDispatchResult> => {
  // 1. Online Precondition
  if (!isOnline()) {
    return {
      success: false,
      error: 'Stock transfer dispatch requires an active server connection. Offline transfers are not supported.',
      errorCode: 'OFFLINE_UNSUPPORTED'
    };
  }

  // 2. Client Payload Validation
  const valResult = validateStockTransferDispatchRequest(request);
  if (!valResult.isValid) {
    return {
      success: false,
      error: `Validation failed: ${valResult.errors.join('; ')}`,
      errorCode: 'VALIDATION_FAILED'
    };
  }

  // 3. Prepare Authoritative Payload
  const client = options?.customClient || supabase;

  try {
    const formattedItems = request.items.map((it) => ({
      product_id: it.product_id.toLowerCase().trim(),
      source_batch_id: it.source_batch_id.toLowerCase().trim(),
      quantity: Math.floor(it.quantity)
    }));

    const { data, error } = await client.rpc('rpc_dispatch_stock_transfer', {
      p_pharmacy_id: request.pharmacy_id.toLowerCase().trim(),
      p_source_branch_id: request.source_branch_id.toLowerCase().trim(),
      p_destination_branch_id: request.destination_branch_id.toLowerCase().trim(),
      p_items: formattedItems,
      p_client_op_id: request.client_op_id,
      p_notes: request.notes ? request.notes.trim() : null
    });

    if (error) {
      let errorCode = 'TRANSFER_RPC_ERROR';
      if (error.message?.includes('AUTH_REQUIRED')) errorCode = 'AUTH_REQUIRED';
      else if (error.message?.includes('CLIENT_OP_REQUIRED')) errorCode = 'CLIENT_OP_REQUIRED';
      else if (error.message?.includes('FORBIDDEN_PHARMACY')) errorCode = 'FORBIDDEN_PHARMACY';
      else if (error.message?.includes('FORBIDDEN_PERMISSION')) errorCode = 'FORBIDDEN_PERMISSION';
      else if (error.message?.includes('FORBIDDEN_BRANCH')) errorCode = 'FORBIDDEN_BRANCH';
      else if (error.message?.includes('SAME_BRANCH_TRANSFER')) errorCode = 'SAME_BRANCH_TRANSFER';
      else if (error.message?.includes('SOURCE_BRANCH_NOT_FOUND')) errorCode = 'SOURCE_BRANCH_NOT_FOUND';
      else if (error.message?.includes('DESTINATION_BRANCH_NOT_FOUND')) errorCode = 'DESTINATION_BRANCH_NOT_FOUND';
      else if (error.message?.includes('INVALID_ITEMS')) errorCode = 'INVALID_ITEMS';
      else if (error.message?.includes('INVALID_QUANTITY')) errorCode = 'INVALID_QUANTITY';
      else if (error.message?.includes('INVALID_ITEM')) errorCode = 'INVALID_ITEM';
      else if (error.message?.includes('PRODUCT_NOT_FOUND')) errorCode = 'PRODUCT_NOT_FOUND';
      else if (error.message?.includes('BATCH_NOT_FOUND')) errorCode = 'BATCH_NOT_FOUND';
      else if (error.message?.includes('INSUFFICIENT_STOCK')) errorCode = 'INSUFFICIENT_STOCK';
      else if (error.message?.includes('IDEMPOTENCY_CONFLICT')) errorCode = 'IDEMPOTENCY_CONFLICT';

      return {
        success: false,
        error: error.message,
        errorCode
      };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.transfer_id) {
      return {
        success: false,
        error: 'Stock transfer dispatch RPC returned unexpected response format',
        errorCode: 'UNEXPECTED_RESPONSE'
      };
    }

    // 4. Trigger Automatic Local Catalog Refresh
    if (!options?.skipRefresh) {
      try {
        await refreshInventorySnapshot(client, request.pharmacy_id, {
          customFactory: options?.customFactory,
          force: true
        });
      } catch (refreshErr) {
        console.warn('[PharmacyFlow] Local read-model refresh after stock transfer dispatch encountered an error:', refreshErr);
      }
    }

    return {
      success: true,
      transfer_id: row.transfer_id,
      status: row.status || 'DISPATCHED',
      total_items: Number(row.total_items) || formattedItems.length,
      dispatched_at: row.dispatched_at || new Date().toISOString()
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Unknown stock transfer dispatch exception',
      errorCode: 'UNEXPECTED_EXCEPTION'
    };
  }
};

/**
 * Authoritative Inter-Branch Stock Transfer Receive Execution (Phase 5D-17)
 * 
 * Rules:
 * 1. Online-only: Strictly rejected if offline.
 * 2. Preflight client validation via validateStockTransferReceiveRequest.
 * 3. Invokes authoritative PostgreSQL SECURITY DEFINER RPC: rpc_receive_stock_transfer.
 * 4. Automatically triggers local read-model refresh upon success.
 */
export const receiveStockTransfer = async (
  request: StockTransferReceiveRequest,
  options?: {
    customClient?: SupabaseClient;
    customFactory?: IDBFactory;
    skipRefresh?: boolean;
  }
): Promise<StockTransferReceiveResult> => {
  // 1. Online Precondition
  if (!isOnline()) {
    return {
      success: false,
      error: 'Stock transfer receive requires an active server connection. Offline transfers are not supported.',
      errorCode: 'OFFLINE_UNSUPPORTED'
    };
  }

  // 2. Client Payload Validation
  const valResult = validateStockTransferReceiveRequest(request);
  if (!valResult.isValid) {
    return {
      success: false,
      error: `Validation failed: ${valResult.errors.join('; ')}`,
      errorCode: 'VALIDATION_FAILED'
    };
  }

  // 3. Prepare Authoritative Payload
  const client = options?.customClient || supabase;

  try {
    const { data, error } = await client.rpc('rpc_receive_stock_transfer', {
      p_pharmacy_id: request.pharmacy_id.toLowerCase().trim(),
      p_transfer_id: request.transfer_id.toLowerCase().trim(),
      p_client_op_id: request.client_op_id,
      p_notes: request.notes ? request.notes.trim() : null
    });

    if (error) {
      let errorCode = 'RECEIVE_RPC_ERROR';
      if (error.message?.includes('AUTH_REQUIRED')) errorCode = 'AUTH_REQUIRED';
      else if (error.message?.includes('CLIENT_OP_REQUIRED')) errorCode = 'CLIENT_OP_REQUIRED';
      else if (error.message?.includes('FORBIDDEN_PHARMACY')) errorCode = 'FORBIDDEN_PHARMACY';
      else if (error.message?.includes('FORBIDDEN_PERMISSION')) errorCode = 'FORBIDDEN_PERMISSION';
      else if (error.message?.includes('FORBIDDEN_BRANCH')) errorCode = 'FORBIDDEN_BRANCH';
      else if (error.message?.includes('TRANSFER_NOT_FOUND')) errorCode = 'TRANSFER_NOT_FOUND';
      else if (error.message?.includes('TRANSFER_ALREADY_RECEIVED')) errorCode = 'TRANSFER_ALREADY_RECEIVED';
      else if (error.message?.includes('INVALID_TRANSFER_STATUS')) errorCode = 'INVALID_TRANSFER_STATUS';
      else if (error.message?.includes('BATCH_METADATA_CONFLICT')) errorCode = 'BATCH_METADATA_CONFLICT';
      else if (error.message?.includes('IDEMPOTENCY_CONFLICT')) errorCode = 'IDEMPOTENCY_CONFLICT';

      return {
        success: false,
        error: error.message,
        errorCode
      };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.transfer_id) {
      return {
        success: false,
        error: 'Stock transfer receive RPC returned unexpected response format',
        errorCode: 'UNEXPECTED_RESPONSE'
      };
    }

    // 4. Trigger Automatic Local Catalog Refresh
    if (!options?.skipRefresh) {
      try {
        await refreshInventorySnapshot(client, request.pharmacy_id, {
          customFactory: options?.customFactory,
          force: true
        });
      } catch (refreshErr) {
        console.warn('[PharmacyFlow] Local read-model refresh after stock transfer receive encountered an error:', refreshErr);
      }
    }

    return {
      success: true,
      transfer_id: row.transfer_id,
      status: row.status || 'RECEIVED',
      total_items: Number(row.total_items) || 0,
      received_at: row.received_at || new Date().toISOString()
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Unknown stock transfer receive exception',
      errorCode: 'UNEXPECTED_EXCEPTION'
    };
  }
};

/**
 * Helper to fetch active branches for a pharmacy (Phase 5D-18).
 */
export const fetchBranches = async (
  pharmacyId: string,
  options?: { customClient?: SupabaseClient }
): Promise<Array<{ id: string; name: string; is_main?: boolean }>> => {
  const client = options?.customClient || supabase;
  try {
    const { data, error } = await client
      .from('branches')
      .select('id, name, is_main')
      .eq('pharmacy_id', pharmacyId.toLowerCase().trim())
      .order('is_main', { ascending: false })
      .order('name', { ascending: true });
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
};

/**
 * Fetches stock transfers with optional direction, branch, and status filters (Phase 5D-18).
 * Scoped strictly to the caller's active pharmacy tenant.
 */
export const fetchStockTransfers = async (
  pharmacyId: string,
  options?: {
    branchId?: string;
    direction?: 'inbound' | 'outbound' | 'all';
    status?: StockTransferStatus;
    limit?: number;
    customClient?: SupabaseClient;
  }
): Promise<{
  success: boolean;
  transfers: StockTransferWithBranches[];
  error?: string;
}> => {
  const client = options?.customClient || supabase;

  try {
    const cleanPharmacyId = pharmacyId.toLowerCase().trim();
    let query = client
      .from('stock_transfers')
      .select('*')
      .eq('pharmacy_id', cleanPharmacyId)
      .order('created_at', { ascending: false });

    if (options?.status) {
      query = query.eq('status', options.status);
    }

    if (options?.branchId) {
      const cleanBranchId = options.branchId.toLowerCase().trim();
      const direction = options.direction || 'all';
      if (direction === 'inbound') {
        query = query.eq('destination_branch_id', cleanBranchId);
      } else if (direction === 'outbound') {
        query = query.eq('source_branch_id', cleanBranchId);
      } else {
        query = query.or(`source_branch_id.eq.${cleanBranchId},destination_branch_id.eq.${cleanBranchId}`);
      }
    }

    if (options?.limit && options.limit > 0) {
      query = query.limit(options.limit);
    }

    const { data: transfersData, error: transfersErr } = await query;
    if (transfersErr) {
      return {
        success: false,
        transfers: [],
        error: transfersErr.message || 'Failed to query stock transfers'
      };
    }

    const rawTransfers = (transfersData || []) as StockTransferRecord[];
    if (rawTransfers.length === 0) {
      return {
        success: true,
        transfers: []
      };
    }

    // Resolve branch names
    const branches = await fetchBranches(cleanPharmacyId, { customClient: client });
    const branchMap = new Map<string, string>();
    branches.forEach((b) => branchMap.set(b.id.toLowerCase(), b.name));

    // Resolve line items summary (counts and total quantities)
    const transferIds = rawTransfers.map((t) => t.id.toLowerCase());
    const { data: itemsData } = await client
      .from('stock_transfer_items')
      .select('transfer_id, quantity')
      .eq('pharmacy_id', cleanPharmacyId)
      .in('transfer_id', transferIds);

    const summaryMap = new Map<string, { totalItems: number; totalQuantity: number }>();
    if (itemsData) {
      for (const item of itemsData) {
        const tId = item.transfer_id.toLowerCase();
        const existing = summaryMap.get(tId) || { totalItems: 0, totalQuantity: 0 };
        existing.totalItems += 1;
        existing.totalQuantity += Number(item.quantity) || 0;
        summaryMap.set(tId, existing);
      }
    }

    const enrichedTransfers: StockTransferWithBranches[] = rawTransfers.map((t) => {
      const summary = summaryMap.get(t.id.toLowerCase()) || { totalItems: 0, totalQuantity: 0 };
      return {
        ...t,
        source_branch_name: branchMap.get(t.source_branch_id.toLowerCase()) || 'Branch',
        destination_branch_name: branchMap.get(t.destination_branch_id.toLowerCase()) || 'Branch',
        total_items: summary.totalItems,
        total_quantity: summary.totalQuantity
      };
    });

    return {
      success: true,
      transfers: enrichedTransfers
    };
  } catch (err: any) {
    return {
      success: false,
      transfers: [],
      error: err.message || 'Unexpected exception while fetching stock transfers'
    };
  }
};

/**
 * Fetches single transfer header and all line items with resolved product metadata (Phase 5D-18).
 */
export const fetchStockTransferDetails = async (
  pharmacyId: string,
  transferId: string,
  options?: {
    customClient?: SupabaseClient;
  }
): Promise<{
  success: boolean;
  transfer?: StockTransferDetail;
  error?: string;
}> => {
  const client = options?.customClient || supabase;

  try {
    const cleanPharmacyId = pharmacyId.toLowerCase().trim();
    const cleanTransferId = transferId.toLowerCase().trim();

    // 1. Fetch header
    const { data: transferData, error: transferErr } = await client
      .from('stock_transfers')
      .select('*')
      .eq('pharmacy_id', cleanPharmacyId)
      .eq('id', cleanTransferId)
      .maybeSingle();

    if (transferErr || !transferData) {
      return {
        success: false,
        error: transferErr?.message || `Stock transfer ${transferId} not found`
      };
    }

    const transfer = transferData as StockTransferRecord;

    // 2. Fetch branches for name resolution
    const branches = await fetchBranches(cleanPharmacyId, { customClient: client });
    const branchMap = new Map<string, string>();
    branches.forEach((b) => branchMap.set(b.id.toLowerCase(), b.name));

    // 3. Fetch line items
    const { data: itemsData, error: itemsErr } = await client
      .from('stock_transfer_items')
      .select('*')
      .eq('pharmacy_id', cleanPharmacyId)
      .eq('transfer_id', cleanTransferId)
      .order('created_at', { ascending: true });

    if (itemsErr) {
      return {
        success: false,
        error: itemsErr.message || 'Failed to query transfer items'
      };
    }

    const rawItems = (itemsData || []) as StockTransferItemRecord[];

    // 4. Resolve product names and SKUs
    const productIds = Array.from(new Set(rawItems.map((it) => it.product_id.toLowerCase())));
    const productMap = new Map<string, { name: string; sku: string }>();

    if (productIds.length > 0) {
      const { data: productsData } = await client
        .from('products')
        .select('id, name, sku')
        .eq('pharmacy_id', cleanPharmacyId)
        .in('id', productIds);

      if (productsData) {
        for (const p of productsData) {
          productMap.set(p.id.toLowerCase(), { name: p.name, sku: p.sku || '' });
        }
      }
    }

    let totalQuantity = 0;
    const enrichedItems: StockTransferItemWithProduct[] = rawItems.map((item) => {
      const prod = productMap.get(item.product_id.toLowerCase());
      totalQuantity += Number(item.quantity) || 0;
      return {
        ...item,
        product_name: prod?.name || 'Product',
        product_sku: prod?.sku || ''
      };
    });

    const enrichedDetail: StockTransferDetail = {
      ...transfer,
      source_branch_name: branchMap.get(transfer.source_branch_id.toLowerCase()) || 'Source Branch',
      destination_branch_name: branchMap.get(transfer.destination_branch_id.toLowerCase()) || 'Destination Branch',
      total_items: enrichedItems.length,
      total_quantity: totalQuantity,
      items: enrichedItems
    };

    return {
      success: true,
      transfer: enrichedDetail
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Unexpected exception while fetching transfer details'
    };
  }
};

/**
 * Advisory pharmacy-scoped pre-check for SKU and barcode duplicates.
 * NOTE: This is best-effort client validation; PostgreSQL does not enforce uniqueness.
 * Excludes the specified excludeProductId (for product editing).
 */
export const checkProductDuplicates = async (
  pharmacyId: string,
  params: {
    sku?: string | null;
    barcode?: string | null;
    excludeProductId?: string | null;
  },
  customFactory?: IDBFactory
): Promise<DuplicateCheckResult> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const excludeId = params.excludeProductId?.toLowerCase().trim();

  let skuConflict: LocalProduct | null = null;
  let barcodeConflict: LocalProduct | null = null;

  const cleanSku = params.sku?.trim();
  const cleanBarcode = params.barcode?.trim();

  // 1. Check SKU
  if (cleanSku) {
    const p = await findProductBySku(normPharmacy, cleanSku, customFactory);
    if (p && (!excludeId || p.id.toLowerCase() !== excludeId)) {
      skuConflict = p;
    }
  }

  // 2. Check Barcode
  if (cleanBarcode) {
    const matches = await findProductsByBarcode(normPharmacy, cleanBarcode, customFactory);
    const conflict = matches.find((m) => !excludeId || m.id.toLowerCase() !== excludeId);
    if (conflict) {
      barcodeConflict = conflict;
    }
  }

  return { skuConflict, barcodeConflict };
};

/**
 * Creates a new product in public.products and caches in local read model.
 * Uses strictly existing columns: id, pharmacy_id, name, generic_name, sku, barcode,
 * category, unit, cost_price, selling_price, status.
 */
export const createCatalogProduct = async (
  client: SupabaseClient,
  pharmacyId: string,
  input: CreateProductInput,
  customFactory?: IDBFactory
): Promise<CatalogMutationResult> => {
  if (!isOnline()) {
    return {
      success: false,
      error: 'Product creation requires an active server connection to PostgreSQL.'
    };
  }

  const normPharmacy = pharmacyId.toLowerCase().trim();
  const cleanName = input.name?.trim();
  if (!cleanName) {
    return { success: false, error: 'Product name is required.' };
  }

  if (typeof input.selling_price !== 'number' || input.selling_price < 0 || !Number.isInteger(input.selling_price)) {
    return { success: false, error: 'Selling price must be a non-negative integer in minor units.' };
  }

  const costPrice = input.cost_price !== undefined
    ? Math.max(0, Math.floor(input.cost_price))
    : 0;

  const status = input.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

  try {
    const payload = {
      pharmacy_id: normPharmacy,
      name: cleanName,
      generic_name: input.generic_name?.trim() || null,
      sku: input.sku?.trim() || null,
      barcode: input.barcode?.trim() || null,
      category: input.category?.trim() || null,
      unit: input.unit?.trim() || null,
      selling_price: input.selling_price,
      cost_price: costPrice,
      status
    };

    const { data, error } = await client
      .from('products')
      .insert(payload)
      .select('id, pharmacy_id, name, sku, barcode, generic_name, category, unit, selling_price, cost_price, status, created_at, updated_at')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    // Ingest/update local IndexedDB so immediately visible
    const localProduct: LocalProduct = {
      id: data.id,
      pharmacy_id: normPharmacy,
      name: data.name,
      sku: data.sku,
      barcode: data.barcode,
      generic_name: data.generic_name,
      category: data.category,
      unit: data.unit,
      selling_price: data.selling_price,
      cost_price: data.cost_price,
      status: data.status,
      source_updated_at: data.updated_at || data.created_at,
      synced_at: Date.now()
    };

    const db = await openOfflineDb(customFactory);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORES.PRODUCTS, 'readwrite');
      const store = tx.objectStore(STORES.PRODUCTS);
      const req = store.put(localProduct);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(new Error(`Failed to cache new product locally: ${req.error?.message}`));
    });

    return { success: true, product: localProduct };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unexpected error creating product';
    return { success: false, error: msg };
  }
};

/**
 * Updates an existing product in public.products and refreshes local read model.
 */
export const updateCatalogProduct = async (
  client: SupabaseClient,
  pharmacyId: string,
  productId: string,
  input: UpdateProductInput,
  customFactory?: IDBFactory
): Promise<CatalogMutationResult> => {
  if (!isOnline()) {
    return {
      success: false,
      error: 'Product update requires an active server connection to PostgreSQL.'
    };
  }

  const normPharmacy = pharmacyId.toLowerCase().trim();
  const cleanId = productId.toLowerCase().trim();

  if (input.name !== undefined && !input.name.trim()) {
    return { success: false, error: 'Product name cannot be empty.' };
  }

  if (input.selling_price !== undefined) {
    if (typeof input.selling_price !== 'number' || input.selling_price < 0 || !Number.isInteger(input.selling_price)) {
      return { success: false, error: 'Selling price must be a non-negative integer in minor units.' };
    }
  }

  if (input.cost_price !== undefined) {
    if (typeof input.cost_price !== 'number' || input.cost_price < 0 || !Number.isInteger(input.cost_price)) {
      return { success: false, error: 'Cost price must be a non-negative integer in minor units.' };
    }
  }

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.generic_name !== undefined) updates.generic_name = input.generic_name ? input.generic_name.trim() : null;
  if (input.sku !== undefined) updates.sku = input.sku ? input.sku.trim() : null;
  if (input.barcode !== undefined) updates.barcode = input.barcode ? input.barcode.trim() : null;
  if (input.category !== undefined) updates.category = input.category ? input.category.trim() : null;
  if (input.unit !== undefined) updates.unit = input.unit ? input.unit.trim() : null;
  if (input.selling_price !== undefined) updates.selling_price = input.selling_price;
  if (input.cost_price !== undefined) updates.cost_price = input.cost_price;
  if (input.status !== undefined) updates.status = input.status;
  updates.updated_at = new Date().toISOString();

  try {
    const { data, error } = await client
      .from('products')
      .update(updates)
      .eq('id', cleanId)
      .eq('pharmacy_id', normPharmacy)
      .select('id, pharmacy_id, name, sku, barcode, generic_name, category, unit, selling_price, cost_price, status, created_at, updated_at')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    const localProduct: LocalProduct = {
      id: data.id,
      pharmacy_id: normPharmacy,
      name: data.name,
      sku: data.sku,
      barcode: data.barcode,
      generic_name: data.generic_name,
      category: data.category,
      unit: data.unit,
      selling_price: data.selling_price,
      cost_price: data.cost_price,
      status: data.status,
      source_updated_at: data.updated_at || data.created_at,
      synced_at: Date.now()
    };

    const db = await openOfflineDb(customFactory);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORES.PRODUCTS, 'readwrite');
      const store = tx.objectStore(STORES.PRODUCTS);
      const req = store.put(localProduct);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(new Error(`Failed to update product in local cache: ${req.error?.message}`));
    });

    return { success: true, product: localProduct };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unexpected error updating product';
    return { success: false, error: msg };
  }
};

/**
 * Activates or deactivates a product in public.products and refreshes local read model.
 * Deactivation is the sole safe retirement path for products. No hard deletion is permitted.
 */
export const setProductStatus = async (
  client: SupabaseClient,
  pharmacyId: string,
  productId: string,
  status: 'ACTIVE' | 'INACTIVE',
  customFactory?: IDBFactory
): Promise<CatalogMutationResult> => {
  return updateCatalogProduct(client, pharmacyId, productId, { status }, customFactory);
};

