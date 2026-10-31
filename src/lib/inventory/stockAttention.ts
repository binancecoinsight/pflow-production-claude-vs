import { CatalogFreshnessStatus } from '../pos/types';
import { ExpiryAttentionWorkspaceBinding, expiryAttentionWorkspaceKey } from './expiryAttention';
import { LocalBatch, LocalProduct } from './types';

export type StockAttentionCoverage = 'complete_cache' | 'partial_cache' | 'unknown';
export type StockAttentionEvidenceState = 'loading' | 'unavailable' | 'ready';
export type StockAttentionBand =
  | 'DEPLETED_OR_DEFICIT_CACHED_PROJECTED'
  | 'LOW_1_TO_10_CACHED_PROJECTED'
  | 'ABOVE_10_CACHED_PROJECTED'
  | 'UNKNOWN';
export type StockAttentionFilter = 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'DEPLETED_DEFICIT';

export interface StockAttentionRow {
  readonly productId: string;
  readonly productName: string;
  readonly cachedProjectedQuantity: number | null;
  readonly branchBatchCount: number | null;
  readonly band: StockAttentionBand;
}

export interface StockAttentionResult {
  readonly workspaceKey: string | null;
  readonly coverage: StockAttentionCoverage;
  readonly issues: readonly string[];
  readonly rows: readonly StockAttentionRow[];
  readonly loadedProductCount: number;
  readonly loadedBatchCount: number;
  readonly expectedProductCount: number | null;
  readonly expectedBatchCount: number | null;
  readonly syncedAt: number | null;
  readonly isStale: boolean;
}

export interface DeriveStockAttentionInput {
  readonly binding: ExpiryAttentionWorkspaceBinding | null;
  readonly products: readonly LocalProduct[];
  readonly batchesMap: Readonly<Record<string, readonly LocalBatch[]>>;
  readonly freshness: CatalogFreshnessStatus | null;
  readonly searchQuery: string;
  readonly productLimit: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isProductEvidence(value: unknown): value is LocalProduct {
  return isRecord(value)
    && isUuid(value.id)
    && isUuid(value.pharmacy_id)
    && typeof value.name === 'string'
    && value.name.trim() !== ''
    && typeof value.synced_at === 'number'
    && Number.isFinite(value.synced_at)
    && value.synced_at > 0;
}

function isBatchEvidence(value: unknown): value is LocalBatch {
  return isRecord(value)
    && isUuid(value.id)
    && isUuid(value.pharmacy_id)
    && isUuid(value.product_id)
    && isUuid(value.branch_id)
    && typeof value.projected_stock === 'number'
    && Number.isSafeInteger(value.projected_stock)
    && typeof value.synced_at === 'number'
    && Number.isFinite(value.synced_at)
    && value.synced_at > 0;
}

function freezeResult(result: StockAttentionResult): StockAttentionResult {
  return Object.freeze({
    ...result,
    issues: Object.freeze([...result.issues]),
    rows: Object.freeze(result.rows.map((row) => Object.freeze({ ...row }))),
  });
}

function bandFor(quantity: number): StockAttentionBand {
  if (quantity <= 0) return 'DEPLETED_OR_DEFICIT_CACHED_PROJECTED';
  if (quantity <= 10) return 'LOW_1_TO_10_CACHED_PROJECTED';
  return 'ABOVE_10_CACHED_PROJECTED';
}

function unknownRows(products: readonly LocalProduct[]): readonly StockAttentionRow[] {
  return products.map((product) => ({
    productId: product.id,
    productName: product.name,
    cachedProjectedQuantity: null,
    branchBatchCount: null,
    band: 'UNKNOWN',
  }));
}

export function matchesStockAttentionFilter(
  row: StockAttentionRow | undefined,
  filter: StockAttentionFilter,
): boolean {
  if (filter === 'ALL') return true;
  if (!row || row.band === 'UNKNOWN') return false;
  if (filter === 'LOW_STOCK') return row.band === 'LOW_1_TO_10_CACHED_PROJECTED';
  if (filter === 'DEPLETED_DEFICIT') return row.band === 'DEPLETED_OR_DEFICIT_CACHED_PROJECTED';
  return row.band === 'ABOVE_10_CACHED_PROJECTED';
}

export function deriveStockAttention(input: DeriveStockAttentionInput): StockAttentionResult {
  const productCollectionValid = Array.isArray(input.products);
  const batchMapValid = isPlainRecord(input.batchesMap);
  const freshnessRecord = isRecord(input.freshness) ? input.freshness : null;
  const workspaceKey = input.binding ? expiryAttentionWorkspaceKey(input.binding) : null;
  const base = {
    workspaceKey,
    loadedProductCount: productCollectionValid ? input.products.length : 0,
    loadedBatchCount: 0,
    expectedProductCount: typeof freshnessRecord?.productCount === 'number' ? freshnessRecord.productCount : null,
    expectedBatchCount: typeof freshnessRecord?.batchCount === 'number' ? freshnessRecord.batchCount : null,
    syncedAt: typeof freshnessRecord?.syncedAt === 'number' ? freshnessRecord.syncedAt : null,
    isStale: typeof freshnessRecord?.isStale === 'boolean' ? freshnessRecord.isStale : true,
  };

  if (!productCollectionValid || !batchMapValid) {
    return freezeResult({ ...base, coverage: 'unknown', issues: ['collection_evidence_invalid'], rows: [] });
  }
  if (!input.binding || !isUuid(input.binding.pharmacyId) || !isUuid(input.binding.branchId)) {
    return freezeResult({ ...base, coverage: 'unknown', issues: ['workspace_unavailable'], rows: [] });
  }
  if (!Number.isInteger(input.productLimit) || input.productLimit < 1) {
    return freezeResult({ ...base, coverage: 'unknown', issues: ['derivation_input_invalid'], rows: [] });
  }

  const productsById = new Map<string, LocalProduct>();
  for (const product of input.products) {
    if (!isProductEvidence(product)
        || product.pharmacy_id !== input.binding.pharmacyId
        || productsById.has(product.id)) {
      return freezeResult({ ...base, coverage: 'unknown', issues: ['product_evidence_invalid'], rows: [] });
    }
    productsById.set(product.id, product);
  }

  const batchIds = new Set<string>();
  let loadedBatchCount = 0;
  for (const [productId, group] of Object.entries(input.batchesMap)) {
    if (!productsById.has(productId) || !Array.isArray(group)) {
      return freezeResult({
        ...base,
        coverage: 'unknown',
        issues: ['batch_group_invalid'],
        rows: unknownRows(input.products),
      });
    }
    loadedBatchCount += group.length;
    if (!Number.isSafeInteger(loadedBatchCount)) {
      return freezeResult({ ...base, coverage: 'unknown', issues: ['batch_count_overflow'], rows: unknownRows(input.products) });
    }
    for (const candidate of group) {
      if (!isBatchEvidence(candidate)
          || candidate.pharmacy_id !== input.binding.pharmacyId
          || candidate.product_id !== productId
          || batchIds.has(candidate.id)) {
        return freezeResult({
          ...base,
          loadedBatchCount,
          coverage: 'unknown',
          issues: ['batch_evidence_invalid'],
          rows: unknownRows(input.products),
        });
      }
      batchIds.add(candidate.id);
    }
  }

  const missingGroup = input.products.some((product) => !Object.prototype.hasOwnProperty.call(input.batchesMap, product.id));
  const rows: StockAttentionRow[] = [];
  let aggregateOverflow = false;
  for (const product of input.products) {
    const group = input.batchesMap[product.id];
    if (!group) {
      rows.push({
        productId: product.id,
        productName: product.name,
        cachedProjectedQuantity: null,
        branchBatchCount: null,
        band: 'UNKNOWN',
      });
      continue;
    }
    const branchBatches = group.filter((candidate) => candidate.branch_id === input.binding?.branchId);
    let quantity = 0;
    for (const candidate of branchBatches) {
      const next = quantity + candidate.projected_stock;
      if (!Number.isSafeInteger(next)) {
        aggregateOverflow = true;
        break;
      }
      quantity = next;
    }
    rows.push(aggregateOverflow
      ? {
          productId: product.id,
          productName: product.name,
          cachedProjectedQuantity: null,
          branchBatchCount: null,
          band: 'UNKNOWN',
        }
      : {
          productId: product.id,
          productName: product.name,
          cachedProjectedQuantity: quantity,
          branchBatchCount: branchBatches.length,
          band: bandFor(quantity),
        });
  }

  rows.sort((left, right) => {
    const byName = left.productName.localeCompare(right.productName);
    return byName !== 0 ? byName : left.productId.localeCompare(right.productId);
  });

  if (aggregateOverflow) {
    return freezeResult({
      ...base,
      loadedBatchCount,
      coverage: 'unknown',
      issues: ['aggregate_quantity_overflow'],
      rows: rows.map((row) => ({ ...row, cachedProjectedQuantity: null, branchBatchCount: null, band: 'UNKNOWN' as const })),
    });
  }

  if (input.freshness
      && (typeof input.freshness.isStale !== 'boolean'
        || !Number.isInteger(input.freshness.productCount) || input.freshness.productCount < 0
        || !Number.isInteger(input.freshness.batchCount) || input.freshness.batchCount < 0
        || !(input.freshness.syncedAt === null
          || (Number.isFinite(input.freshness.syncedAt) && input.freshness.syncedAt > 0))
        || !(input.freshness.sourceUpdatedAt === null || typeof input.freshness.sourceUpdatedAt === 'string'))) {
    return freezeResult({ ...base, loadedBatchCount, coverage: 'unknown', issues: ['snapshot_metadata_invalid'], rows: unknownRows(input.products) });
  }

  const issues: string[] = [];
  if (missingGroup) issues.push('batch_group_missing');
  if (!input.freshness || input.freshness.syncedAt === null) issues.push('snapshot_metadata_missing');
  if (input.searchQuery.trim() !== '') issues.push('search_subset');
  if (input.products.length >= input.productLimit) issues.push('product_limit_reached');
  if (input.freshness?.isStale) issues.push('snapshot_stale');
  if (input.freshness && input.freshness.productCount !== input.products.length) issues.push('product_count_mismatch');
  if (input.freshness && input.freshness.batchCount !== loadedBatchCount) issues.push('batch_count_mismatch');
  if (input.freshness?.syncedAt !== null && input.freshness?.syncedAt !== undefined) {
    const incompatibleGeneration = input.products.some((product) => product.synced_at !== input.freshness?.syncedAt)
      || Object.values(input.batchesMap).some((group) => group.some((candidate) => candidate.synced_at !== input.freshness?.syncedAt));
    if (incompatibleGeneration) issues.push('snapshot_generation_mismatch');
  }

  return freezeResult({
    ...base,
    loadedBatchCount,
    coverage: missingGroup ? 'unknown' : issues.length === 0 ? 'complete_cache' : 'partial_cache',
    issues,
    rows,
  });
}
