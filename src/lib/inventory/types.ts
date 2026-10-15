/**
 * PharmacyFlow Offline Product & Inventory Read Model Types (Phase 5D-4)
 * 
 * Defines local read-model entities, snapshot structures, and metadata for offline POS lookup.
 * 
 * IMPORTANT ARCHITECTURAL PRINCIPLE:
 * The browser read model is a client-side cache and projected read model.
 * It is NOT the authoritative inventory database. PostgreSQL remains the sole authority.
 * Local quantities are explicitly named and treated as `projected_stock`.
 */

export interface LocalProduct {
  id: string; // Product UUID v4
  pharmacy_id: string; // Tenant partition UUID v4
  name: string;
  sku: string | null;
  barcode: string | null;
  generic_name: string | null;
  category: string | null;
  unit: string | null;
  selling_price: number; // Integer minor currency units (e.g. kobo or cents)
  cost_price: number; // Integer minor currency units
  status: string; // 'ACTIVE', 'INACTIVE', etc.
  source_updated_at: string | null; // Server ISO timestamp
  synced_at: number; // Local epoch ms when snapshot ingested
}

export interface LocalBatch {
  id: string; // Batch UUID v4
  pharmacy_id: string; // Tenant partition UUID v4
  product_id: string; // Product UUID v4
  branch_id: string; // Branch UUID v4
  batch_number: string;
  expiry_date: string; // ISO date string ('YYYY-MM-DD')
  projected_stock: number; // Integer local non-authoritative projection
  selling_price: number; // Integer minor currency units
  cost_price: number; // Integer minor currency units
  status: string; // 'ACTIVE', 'EXPIRED', 'DEPLETED', etc.
  source_updated_at: string | null; // Server ISO timestamp
  synced_at: number; // Local epoch ms when snapshot ingested
  read_model_version: number;
}

export interface InventorySnapshotMetadata {
  pharmacy_id: string;
  synced_at: number;
  source_updated_at: string | null;
  product_count: number;
  batch_count: number;
  read_model_version: number;
}

export interface InventorySnapshot {
  pharmacy_id: string;
  products: Array<{
    id: string;
    pharmacy_id?: string;
    name: string;
    sku?: string | null;
    barcode?: string | null;
    generic_name?: string | null;
    category?: string | null;
    unit?: string | null;
    selling_price?: number;
    cost_price?: number;
    status?: string;
    updated_at?: string | null;
  }>;
  batches: Array<{
    id: string;
    pharmacy_id?: string;
    product_id: string;
    branch_id: string;
    batch_number: string;
    expiry_date: string;
    quantity: number;
    selling_price?: number;
    cost_price?: number;
    status?: string;
    updated_at?: string | null;
  }>;
  source_updated_at?: string | null;
}

export interface BatchExpiryInfo {
  expiry_date: string;
  is_expired: boolean;
  days_until_expiry: number;
}

export interface BatchSelectionOptions {
  branchId?: string;
  requestedQuantity?: number;
  referenceDate?: Date | string | number;
  allowExpired?: boolean;
}

/**
 * Authoritative Server Catalog Snapshot Contract (Phase 5D-7)
 */
export interface AuthoritativeSnapshotContract {
  pharmacy_id: string; // Tenant partition UUID v4
  snapshot_version: number; // Monotonic revision number (max updated_at ms across entities)
  generated_at: string; // ISO 8601 UTC timestamp of retrieval
  source_updated_at: string | null; // ISO 8601 UTC timestamp of most recent server mutation
  product_count: number;
  batch_count: number;
  products: SnapshotProductRecord[];
  batches: SnapshotBatchRecord[];
}

export interface SnapshotProductRecord {
  id: string;
  pharmacy_id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  generic_name: string | null;
  category: string | null;
  unit: string | null;
  selling_price: number;
  cost_price: number;
  status: string;
  updated_at: string | null;
}

export interface SnapshotBatchRecord {
  id: string;
  pharmacy_id: string;
  product_id: string;
  branch_id: string;
  batch_number: string;
  expiry_date: string;
  quantity: number; // Server authoritative stock
  selling_price: number;
  cost_price: number;
  status: string;
  updated_at: string | null;
}

export interface RefreshSnapshotOptions {
  customFactory?: IDBFactory;
  force?: boolean; // If true, replaces even if revision matches (unless older)
  allowEmptyCatalog?: boolean; // Explicit confirmation that 0 products is legitimate
  pageSize?: number; // Pagination chunk size, default 1000
}

export type SnapshotSyncStatus =
  | 'SYNCED'
  | 'ALREADY_CURRENT'
  | 'STALE_REJECTED'
  | 'OFFLINE'
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'SUSPICIOUS_EMPTY'
  | 'ERROR';

export interface SnapshotSyncResult {
  success: boolean;
  status: SnapshotSyncStatus;
  pharmacy_id: string;
  metadata?: InventorySnapshotMetadata;
  products_synced?: number;
  batches_synced?: number;
  snapshot_version?: number;
  error?: string;
}

/**
 * Authoritative Stock Intake / Inventory Receiving Contracts (Phase 5D-15)
 */
export interface StockIntakeItem {
  product_id: string; // Product UUID v4
  product_name?: string; // Informational
  batch_number: string;
  expiry_date: string; // 'YYYY-MM-DD'
  quantity: number; // Integer positive intake quantity
  cost_price: number; // Integer minor currency units (e.g. kobo or cents)
  selling_price: number; // Integer minor currency units
  batch_id?: string | null; // Optional: target existing batch explicitly
}

export interface StockIntakeRequest {
  pharmacy_id: string;
  branch_id: string;
  items: StockIntakeItem[];
  supplier_id?: string | null;
  invoice_number?: string | null;
  notes?: string | null;
  client_op_id?: string; // Idempotency UUID v4
}

export interface StockIntakeResult {
  success: boolean;
  purchase_id?: string;
  status?: string;
  total_items?: number;
  total_cost?: number;
  processed_at?: string;
  error?: string;
  errorCode?: string;
}

/**
 * Authoritative Stock Adjustment Contracts (Phase 5D-16)
 */
export type StockAdjustmentDirection = 'INCREASE' | 'DECREASE';

export type StockAdjustmentReason = 
  | 'COUNT_DISCREPANCY'
  | 'DAMAGED'
  | 'EXPIRED'
  | 'RECEIVED_CORRECTION'
  | 'THEFT'
  | 'OTHER';

export interface StockAdjustmentRequest {
  pharmacy_id: string;
  branch_id: string;
  product_id: string;
  batch_id: string;
  direction: StockAdjustmentDirection;
  quantity: number; // Positive integer magnitude
  reason: StockAdjustmentReason;
  notes?: string | null;
  client_op_id: string; // Idempotency UUID v4 (Mandatory)
}

export interface StockAdjustmentResult {
  success: boolean;
  adjustment_id?: string;
  batch_id?: string;
  previous_quantity?: number;
  adjustment_quantity?: number;
  resulting_quantity?: number;
  adjusted_at?: string;
  error?: string;
  errorCode?: string;
}

/**
 * Authoritative Inter-Branch Stock Transfer Contracts (Phase 5D-17)
 */
export type StockTransferStatus = 'DISPATCHED' | 'RECEIVED';

export interface StockTransferItemInput {
  product_id: string; // Product UUID v4
  source_batch_id: string; // Source Batch UUID v4
  quantity: number; // Integer positive transfer quantity
}

export interface StockTransferDispatchRequest {
  pharmacy_id: string;
  source_branch_id: string;
  destination_branch_id: string;
  items: StockTransferItemInput[];
  client_op_id: string; // Idempotency UUID v4 (Mandatory)
  notes?: string | null;
}

export interface StockTransferDispatchResult {
  success: boolean;
  transfer_id?: string;
  status?: StockTransferStatus;
  total_items?: number;
  dispatched_at?: string;
  error?: string;
  errorCode?: string;
}

export interface StockTransferReceiveRequest {
  pharmacy_id: string;
  transfer_id: string;
  client_op_id: string; // Idempotency UUID v4 (Mandatory)
  notes?: string | null;
}

export interface StockTransferReceiveResult {
  success: boolean;
  transfer_id?: string;
  status?: StockTransferStatus;
  total_items?: number;
  received_at?: string;
  error?: string;
  errorCode?: string;
}

export interface StockTransferRecord {
  id: string;
  pharmacy_id: string;
  source_branch_id: string;
  destination_branch_id: string;
  status: StockTransferStatus;
  notes: string | null;
  dispatched_by: string;
  dispatched_at: string;
  dispatch_client_op_id: string;
  received_by: string | null;
  received_at: string | null;
  receive_client_op_id: string | null;
  receive_notes: string | null;
  updated_at: string;
  created_at: string;
}

export interface StockTransferItemRecord {
  id: string;
  pharmacy_id: string;
  transfer_id: string;
  source_branch_id: string;
  destination_branch_id: string;
  product_id: string;
  source_batch_id: string;
  destination_batch_id: string | null;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  quantity_received: number | null;
  cost_price: number;
  selling_price: number;
  created_at: string;
}

/**
 * Enriched transfer record with joined branch names and aggregation summaries (Phase 5D-18)
 */
export interface StockTransferWithBranches extends StockTransferRecord {
  source_branch_name?: string;
  destination_branch_name?: string;
  total_items?: number;
  total_quantity?: number;
}

/**
 * Enriched transfer item with product presentation metadata (Phase 5D-18)
 */
export interface StockTransferItemWithProduct extends StockTransferItemRecord {
  product_name?: string;
  product_sku?: string;
}

/**
 * Complete transfer aggregate with header and line items (Phase 5D-18)
 */
export interface StockTransferDetail extends StockTransferWithBranches {
  items: StockTransferItemWithProduct[];
}

/**
 * Options for querying stock transfers list (Phase 5D-18)
 */
export interface FetchStockTransfersOptions {
  branchId?: string;
  direction?: 'inbound' | 'outbound' | 'all';
  status?: StockTransferStatus;
  limit?: number;
}

/**
 * Phase 5D-22 Master Product Catalog Management Types
 * Uses strictly existing public.products columns:
 * id, pharmacy_id, name, generic_name, sku, barcode, category, unit, cost_price, selling_price, status
 */
export interface CreateProductInput {
  name: string;
  generic_name?: string | null;
  sku?: string | null;
  barcode?: string | null;
  category?: string | null;
  unit?: string | null;
  selling_price: number; // Integer minor currency units (e.g. kobo or cents)
  cost_price?: number; // Integer minor currency units
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface UpdateProductInput {
  name?: string;
  generic_name?: string | null;
  sku?: string | null;
  barcode?: string | null;
  category?: string | null;
  unit?: string | null;
  selling_price?: number; // Integer minor currency units
  cost_price?: number; // Integer minor currency units
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface DuplicateCheckResult {
  skuConflict: LocalProduct | null;
  barcodeConflict: LocalProduct | null;
}

export type BarcodeResolutionType = 
  | 'NO_MATCH' 
  | 'SINGLE_ACTIVE' 
  | 'SINGLE_INACTIVE' 
  | 'MULTIPLE_MATCHES';

export interface BarcodeResolutionResult {
  type: BarcodeResolutionType;
  matches: LocalProduct[];
  product?: LocalProduct;
}

export interface CatalogMutationResult {
  success: boolean;
  product?: LocalProduct;
  error?: string;
}
