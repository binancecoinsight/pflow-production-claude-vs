/**
 * PharmacyFlow Inventory Snapshot & Read-Model Validation
 * 
 * Enforces strict pre-ingestion validation on products, batches, and snapshot boundaries.
 * Malformed records are rejected; no silent data repairs are permitted.
 */

import { LocalProduct, LocalBatch, InventorySnapshot } from './types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isValidUuid = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  return UUID_REGEX.test(value.trim());
};

export const validateProductRecord = (
  raw: any,
  expectedPharmacyId: string,
  syncedAt: number
): { isValid: boolean; product?: LocalProduct; error?: string } => {
  if (!raw || typeof raw !== 'object') {
    return { isValid: false, error: 'Product record must be a valid object' };
  }

  if (!isValidUuid(raw.id)) {
    return { isValid: false, error: `Invalid product id: ${raw.id}` };
  }

  const pharmId = (raw.pharmacy_id || expectedPharmacyId).toLowerCase().trim();
  if (pharmId !== expectedPharmacyId.toLowerCase().trim()) {
    return { isValid: false, error: `Product pharmacy_id ${raw.pharmacy_id} does not match snapshot pharmacy ${expectedPharmacyId}` };
  }

  if (typeof raw.name !== 'string' || raw.name.trim().length === 0) {
    return { isValid: false, error: `Product ${raw.id} must have a non-empty name` };
  }

  const sellingPrice = raw.selling_price !== undefined ? raw.selling_price : 0;
  if (typeof sellingPrice !== 'number' || !Number.isInteger(sellingPrice) || sellingPrice < 0) {
    return { isValid: false, error: `Product ${raw.id} selling_price must be a non-negative integer minor unit` };
  }

  const costPrice = raw.cost_price !== undefined ? raw.cost_price : 0;
  if (typeof costPrice !== 'number' || !Number.isInteger(costPrice) || costPrice < 0) {
    return { isValid: false, error: `Product ${raw.id} cost_price must be a non-negative integer minor unit` };
  }

  const product: LocalProduct = {
    id: raw.id.toLowerCase().trim(),
    pharmacy_id: expectedPharmacyId.toLowerCase().trim(),
    name: raw.name.trim(),
    sku: raw.sku ? String(raw.sku).trim() : null,
    barcode: raw.barcode ? String(raw.barcode).trim() : null,
    generic_name: raw.generic_name ? String(raw.generic_name).trim() : null,
    category: raw.category ? String(raw.category).trim() : null,
    unit: raw.unit ? String(raw.unit).trim() : null,
    selling_price: sellingPrice,
    cost_price: costPrice,
    status: (raw.status || 'ACTIVE').toUpperCase().trim(),
    source_updated_at: raw.updated_at ? String(raw.updated_at) : null,
    synced_at: syncedAt
  };

  return { isValid: true, product };
};

export const validateBatchRecord = (
  raw: any,
  expectedPharmacyId: string,
  syncedAt: number
): { isValid: boolean; batch?: LocalBatch; error?: string } => {
  if (!raw || typeof raw !== 'object') {
    return { isValid: false, error: 'Batch record must be a valid object' };
  }

  if (!isValidUuid(raw.id)) {
    return { isValid: false, error: `Invalid batch id: ${raw.id}` };
  }

  const pharmId = (raw.pharmacy_id || expectedPharmacyId).toLowerCase().trim();
  if (pharmId !== expectedPharmacyId.toLowerCase().trim()) {
    return { isValid: false, error: `Batch pharmacy_id ${raw.pharmacy_id} does not match snapshot pharmacy ${expectedPharmacyId}` };
  }

  if (!isValidUuid(raw.product_id)) {
    return { isValid: false, error: `Batch ${raw.id} has invalid product_id: ${raw.product_id}` };
  }

  if (!isValidUuid(raw.branch_id)) {
    return { isValid: false, error: `Batch ${raw.id} has invalid branch_id: ${raw.branch_id}` };
  }

  if (typeof raw.batch_number !== 'string' || raw.batch_number.trim().length === 0) {
    return { isValid: false, error: `Batch ${raw.id} must have a non-empty batch_number` };
  }

  if (typeof raw.expiry_date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(raw.expiry_date.trim())) {
    return { isValid: false, error: `Batch ${raw.id} has invalid expiry_date: ${raw.expiry_date}` };
  }

  const quantity = raw.quantity !== undefined ? raw.quantity : 0;
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || !Number.isFinite(quantity)) {
    return { isValid: false, error: `Batch ${raw.id} quantity must be a finite integer` };
  }

  const sellingPrice = raw.selling_price !== undefined ? raw.selling_price : 0;
  if (typeof sellingPrice !== 'number' || !Number.isInteger(sellingPrice) || sellingPrice < 0) {
    return { isValid: false, error: `Batch ${raw.id} selling_price must be a non-negative integer minor unit` };
  }

  const costPrice = raw.cost_price !== undefined ? raw.cost_price : 0;
  if (typeof costPrice !== 'number' || !Number.isInteger(costPrice) || costPrice < 0) {
    return { isValid: false, error: `Batch ${raw.id} cost_price must be a non-negative integer minor unit` };
  }

  const batch: LocalBatch = {
    id: raw.id.toLowerCase().trim(),
    pharmacy_id: expectedPharmacyId.toLowerCase().trim(),
    product_id: raw.product_id.toLowerCase().trim(),
    branch_id: raw.branch_id.toLowerCase().trim(),
    batch_number: raw.batch_number.trim(),
    expiry_date: raw.expiry_date.trim().substring(0, 10),
    projected_stock: quantity,
    selling_price: sellingPrice,
    cost_price: costPrice,
    status: (raw.status || 'ACTIVE').toUpperCase().trim(),
    source_updated_at: raw.updated_at ? String(raw.updated_at) : null,
    synced_at: syncedAt,
    read_model_version: 1
  };

  return { isValid: true, batch };
};

export const validateSnapshot = (
  snapshot: InventorySnapshot,
  expectedPharmacyId: string,
  syncedAt: number = Date.now()
): {
  isValid: boolean;
  errors: string[];
  validatedProducts: LocalProduct[];
  validatedBatches: LocalBatch[];
} => {
  const errors: string[] = [];
  const validatedProducts: LocalProduct[] = [];
  const validatedBatches: LocalBatch[] = [];

  const normTarget = expectedPharmacyId.toLowerCase().trim();
  const normSnap = snapshot.pharmacy_id.toLowerCase().trim();

  if (normSnap !== normTarget) {
    errors.push(`Snapshot target mismatch: snapshot specifies ${snapshot.pharmacy_id}, expected ${expectedPharmacyId}`);
    return { isValid: false, errors, validatedProducts, validatedBatches };
  }

  if (!Array.isArray(snapshot.products)) {
    errors.push('Snapshot products must be an array');
  } else {
    for (let i = 0; i < snapshot.products.length; i++) {
      const res = validateProductRecord(snapshot.products[i], normTarget, syncedAt);
      if (!res.isValid) {
        errors.push(`products[${i}]: ${res.error}`);
      } else if (res.product) {
        validatedProducts.push(res.product);
      }
    }
  }

  if (!Array.isArray(snapshot.batches)) {
    errors.push('Snapshot batches must be an array');
  } else {
    for (let i = 0; i < snapshot.batches.length; i++) {
      const res = validateBatchRecord(snapshot.batches[i], normTarget, syncedAt);
      if (!res.isValid) {
        errors.push(`batches[${i}]: ${res.error}`);
      } else if (res.batch) {
        validatedBatches.push(res.batch);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    validatedProducts,
    validatedBatches
  };
};

/**
 * Validates a single stock intake line item (Phase 5D-15)
 */
export const validateStockIntakeItem = (
  item: any
): { isValid: boolean; error?: string } => {
  if (!item || typeof item !== 'object') {
    return { isValid: false, error: 'Intake item must be an object' };
  }

  if (!isValidUuid(item.product_id)) {
    return { isValid: false, error: `Invalid product_id: ${item.product_id}` };
  }

  if (typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity <= 0) {
    return { isValid: false, error: `Intake quantity must be a positive integer, received: ${item.quantity}` };
  }

  if (typeof item.batch_number !== 'string' || item.batch_number.trim().length === 0) {
    return { isValid: false, error: 'Batch number is required and cannot be empty' };
  }

  if (typeof item.expiry_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.expiry_date.trim())) {
    return { isValid: false, error: 'Expiry date must be in YYYY-MM-DD format' };
  }

  const d = new Date(item.expiry_date.trim());
  if (isNaN(d.getTime())) {
    return { isValid: false, error: 'Invalid expiry date' };
  }

  const costPrice = item.cost_price !== undefined ? item.cost_price : 0;
  if (typeof costPrice !== 'number' || !Number.isInteger(costPrice) || costPrice < 0) {
    return { isValid: false, error: 'Cost price must be a non-negative integer minor unit' };
  }

  const sellingPrice = item.selling_price !== undefined ? item.selling_price : 0;
  if (typeof sellingPrice !== 'number' || !Number.isInteger(sellingPrice) || sellingPrice < 0) {
    return { isValid: false, error: 'Selling price must be a non-negative integer minor unit' };
  }

  if (item.batch_id !== undefined && item.batch_id !== null && item.batch_id !== '') {
    if (!isValidUuid(item.batch_id)) {
      return { isValid: false, error: `Invalid batch_id: ${item.batch_id}` };
    }
  }

  return { isValid: true };
};

/**
 * Validates a stock intake request payload (Phase 5D-15)
 */
export const validateStockIntakeRequest = (
  req: any
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!req || typeof req !== 'object') {
    return { isValid: false, errors: ['Request must be an object'] };
  }

  if (!isValidUuid(req.pharmacy_id)) {
    errors.push(`Invalid pharmacy_id: ${req.pharmacy_id}`);
  }

  if (!isValidUuid(req.branch_id)) {
    errors.push(`Invalid branch_id: ${req.branch_id}`);
  }

  if (!Array.isArray(req.items) || req.items.length === 0) {
    errors.push('Intake request must contain at least one item');
  } else {
    for (let i = 0; i < req.items.length; i++) {
      const res = validateStockIntakeItem(req.items[i]);
      if (!res.isValid && res.error) {
        errors.push(`items[${i}]: ${res.error}`);
      }
    }
  }

  if (req.client_op_id && !isValidUuid(req.client_op_id)) {
    errors.push(`Invalid client_op_id: ${req.client_op_id}`);
  }

  if (req.supplier_id && !isValidUuid(req.supplier_id)) {
    errors.push(`Invalid supplier_id: ${req.supplier_id}`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validates a stock adjustment request payload (Phase 5D-16)
 */
export const validateStockAdjustmentRequest = (
  req: any
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!req || typeof req !== 'object') {
    return { isValid: false, errors: ['Request must be an object'] };
  }

  if (!isValidUuid(req.pharmacy_id)) {
    errors.push(`Invalid pharmacy_id: ${req.pharmacy_id}`);
  }

  if (!isValidUuid(req.branch_id)) {
    errors.push(`Invalid branch_id: ${req.branch_id}`);
  }

  if (!isValidUuid(req.product_id)) {
    errors.push(`Invalid product_id: ${req.product_id}`);
  }

  if (!isValidUuid(req.batch_id)) {
    errors.push(`Invalid batch_id: ${req.batch_id}`);
  }

  const direction = req.direction ? String(req.direction).toUpperCase().trim() : '';
  if (direction !== 'INCREASE' && direction !== 'DECREASE') {
    errors.push(`Adjustment direction must be INCREASE or DECREASE, received: ${req.direction}`);
  }

  if (typeof req.quantity !== 'number' || !Number.isInteger(req.quantity) || req.quantity <= 0) {
    errors.push(`Adjustment quantity must be a positive integer, received: ${req.quantity}`);
  }

  const validReasons = ['COUNT_DISCREPANCY', 'DAMAGED', 'EXPIRED', 'RECEIVED_CORRECTION', 'THEFT', 'OTHER'];
  const cleanReason = req.reason ? String(req.reason).trim().toUpperCase() : '';
  if (!validReasons.includes(cleanReason)) {
    errors.push(`Adjustment reason must be one of ${validReasons.join(', ')}, received: ${req.reason}`);
  }

  if (!req.client_op_id || !isValidUuid(req.client_op_id)) {
    errors.push(`client_op_id is mandatory and must be a valid UUID, received: ${req.client_op_id}`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validates a single stock transfer item (Phase 5D-17)
 */
export const validateStockTransferItem = (
  item: any
): { isValid: boolean; error?: string } => {
  if (!item || typeof item !== 'object') {
    return { isValid: false, error: 'Transfer item must be an object' };
  }

  if (!isValidUuid(item.product_id)) {
    return { isValid: false, error: `Invalid product_id: ${item.product_id}` };
  }

  if (!isValidUuid(item.source_batch_id)) {
    return { isValid: false, error: `Invalid source_batch_id: ${item.source_batch_id}` };
  }

  if (typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity <= 0) {
    return { isValid: false, error: `Transfer item quantity must be a positive integer, received: ${item.quantity}` };
  }

  return { isValid: true };
};

/**
 * Validates a stock transfer dispatch request payload (Phase 5D-17)
 */
export const validateStockTransferDispatchRequest = (
  req: any
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!req || typeof req !== 'object') {
    return { isValid: false, errors: ['Request must be an object'] };
  }

  if (!isValidUuid(req.pharmacy_id)) {
    errors.push(`Invalid pharmacy_id: ${req.pharmacy_id}`);
  }

  if (!isValidUuid(req.source_branch_id)) {
    errors.push(`Invalid source_branch_id: ${req.source_branch_id}`);
  }

  if (!isValidUuid(req.destination_branch_id)) {
    errors.push(`Invalid destination_branch_id: ${req.destination_branch_id}`);
  }

  if (
    req.source_branch_id &&
    req.destination_branch_id &&
    String(req.source_branch_id).toLowerCase().trim() === String(req.destination_branch_id).toLowerCase().trim()
  ) {
    errors.push('Source branch and destination branch cannot be identical');
  }

  if (!Array.isArray(req.items) || req.items.length === 0) {
    errors.push('Transfer request must contain at least one item');
  } else {
    const seenBatches = new Set<string>();
    for (let i = 0; i < req.items.length; i++) {
      const itemRes = validateStockTransferItem(req.items[i]);
      if (!itemRes.isValid && itemRes.error) {
        errors.push(`items[${i}]: ${itemRes.error}`);
      } else if (req.items[i]?.source_batch_id) {
        const batchKey = String(req.items[i].source_batch_id).toLowerCase().trim();
        if (seenBatches.has(batchKey)) {
          errors.push(`Duplicate source_batch_id detected: ${batchKey}`);
        }
        seenBatches.add(batchKey);
      }
    }
  }

  if (!req.client_op_id || !isValidUuid(req.client_op_id)) {
    errors.push(`client_op_id is mandatory and must be a valid UUID, received: ${req.client_op_id}`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validates a stock transfer receive request payload (Phase 5D-17)
 */
export const validateStockTransferReceiveRequest = (
  req: any
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!req || typeof req !== 'object') {
    return { isValid: false, errors: ['Request must be an object'] };
  }

  if (!isValidUuid(req.pharmacy_id)) {
    errors.push(`Invalid pharmacy_id: ${req.pharmacy_id}`);
  }

  if (!isValidUuid(req.transfer_id)) {
    errors.push(`Invalid transfer_id: ${req.transfer_id}`);
  }

  if (!req.client_op_id || !isValidUuid(req.client_op_id)) {
    errors.push(`client_op_id is mandatory and must be a valid UUID, received: ${req.client_op_id}`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

