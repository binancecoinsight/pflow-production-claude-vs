import { MembershipWithPharmacy } from '../../types/auth';
import { Branch, Pharmacy, PharmacyMember, UserRole } from '../../types/database';
import { CatalogFreshnessStatus } from '../pos/types';
import { isReadyWorkspace } from '../auth/membershipWorkspace';
import { LocalBatch, LocalProduct } from './types';

export type ExpiryAttentionClassification = 'EXPIRED_TIME_DERIVED' | 'EXPIRING_WITHIN_90_DAYS_TIME_DERIVED';
export type ExpiryAttentionCoverage = 'complete_cache' | 'partial_cache' | 'unknown';

export interface ExpiryAttentionWorkspaceBinding {
  readonly userId: string;
  readonly membershipId: string;
  readonly membershipUpdatedAt: string;
  readonly pharmacyId: string;
  readonly branchId: string;
  readonly role: UserRole;
}

export interface ExpiryAttentionRow {
  readonly batchId: string;
  readonly productId: string;
  readonly productName: string;
  readonly batchNumber: string;
  readonly serverStatus: string;
  readonly expiryDate: string;
  readonly projectedQuantity: number;
  readonly daysUntilExpiry: number;
  readonly classification: ExpiryAttentionClassification;
}

export interface ExpiryAttentionResult {
  readonly workspaceKey: string | null;
  readonly coverage: ExpiryAttentionCoverage;
  readonly issues: readonly string[];
  readonly rows: readonly ExpiryAttentionRow[];
  readonly loadedProductCount: number;
  readonly loadedBatchCount: number;
  readonly expectedProductCount: number | null;
  readonly expectedBatchCount: number | null;
  readonly syncedAt: number | null;
  readonly isStale: boolean;
}

interface WorkspaceInput {
  readonly userId: string | null;
  readonly membership: PharmacyMember | MembershipWithPharmacy | null;
  readonly pharmacy: Pharmacy | null;
  readonly branch: Branch | null;
  readonly role: UserRole | null;
}

export interface DeriveExpiryAttentionInput {
  readonly binding: ExpiryAttentionWorkspaceBinding | null;
  readonly products: readonly LocalProduct[];
  readonly batchesMap: Readonly<Record<string, readonly LocalBatch[]>>;
  readonly freshness: CatalogFreshnessStatus | null;
  readonly searchQuery: string;
  readonly productLimit: number;
  readonly now: () => number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBatchMap(value: unknown): value is Readonly<Record<string, readonly LocalBatch[]>> {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isProductEvidence(value: unknown): value is LocalProduct {
  return isRecord(value)
    && isUuid(value.id)
    && typeof value.pharmacy_id === 'string'
    && typeof value.name === 'string'
    && value.name.trim() !== ''
    && typeof value.synced_at === 'number'
    && Number.isFinite(value.synced_at)
    && value.synced_at > 0;
}

function isBatchEvidence(value: unknown): value is LocalBatch {
  return isRecord(value)
    && isUuid(value.id)
    && typeof value.pharmacy_id === 'string'
    && typeof value.product_id === 'string'
    && isUuid(value.branch_id)
    && typeof value.expiry_date === 'string'
    && typeof value.projected_stock === 'number'
    && Number.isInteger(value.projected_stock)
    && typeof value.batch_number === 'string'
    && value.batch_number.trim() !== ''
    && typeof value.status === 'string'
    && value.status.trim() !== ''
    && typeof value.synced_at === 'number'
    && Number.isFinite(value.synced_at)
    && value.synced_at > 0;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function freezeResult(result: ExpiryAttentionResult): ExpiryAttentionResult {
  return Object.freeze({
    ...result,
    issues: Object.freeze([...result.issues]),
    rows: Object.freeze(result.rows.map((row) => Object.freeze({ ...row }))),
  });
}

export function parseStrictInventoryDate(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return null;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > daysInMonth[month - 1]) return null;

  const parsed = new Date(0);
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCFullYear(year, month - 1, day);
  return parsed.getTime();
}

function utcMidnight(timestamp: number): number | null {
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function expiryAttentionWorkspaceKey(binding: ExpiryAttentionWorkspaceBinding): string {
  return [
    binding.userId,
    binding.membershipId,
    binding.membershipUpdatedAt,
    binding.pharmacyId,
    binding.branchId,
    binding.role,
  ].join(':');
}

export function deriveExpiryAttentionWorkspace(input: WorkspaceInput): ExpiryAttentionWorkspaceBinding | null {
  if (!isReadyWorkspace(input)
      || !input.userId
      || !input.membership
      || !input.pharmacy
      || !input.branch
      || !input.role) return null;
  return Object.freeze({
    userId: input.userId,
    membershipId: input.membership.id,
    membershipUpdatedAt: input.membership.updated_at,
    pharmacyId: input.pharmacy.id,
    branchId: input.branch.id,
    role: input.role,
  });
}

export function deriveExpiryAttention(input: DeriveExpiryAttentionInput): ExpiryAttentionResult {
  const { binding, products, batchesMap, freshness } = input;
  const workspaceKey = binding ? expiryAttentionWorkspaceKey(binding) : null;
  const productCollectionValid = Array.isArray(products);
  const batchCollectionValid = isBatchMap(batchesMap);
  const batchGroups = batchCollectionValid ? Object.values(batchesMap) : [];
  const batchGroupsValid = batchGroups.every((batches) => Array.isArray(batches));
  const loadedBatchCount = batchGroupsValid
    ? batchGroups.reduce((count, batches) => count + batches.length, 0)
    : 0;
  const freshnessRecord = isRecord(freshness) ? freshness : null;
  const base = {
    workspaceKey,
    rows: [] as readonly ExpiryAttentionRow[],
    loadedProductCount: productCollectionValid ? products.length : 0,
    loadedBatchCount,
    expectedProductCount: typeof freshnessRecord?.productCount === 'number' ? freshnessRecord.productCount : null,
    expectedBatchCount: typeof freshnessRecord?.batchCount === 'number' ? freshnessRecord.batchCount : null,
    syncedAt: typeof freshnessRecord?.syncedAt === 'number' ? freshnessRecord.syncedAt : null,
    isStale: typeof freshnessRecord?.isStale === 'boolean' ? freshnessRecord.isStale : true,
  };

  if (!productCollectionValid || !batchCollectionValid || !batchGroupsValid) {
    return freezeResult({ ...base, coverage: 'unknown', issues: ['collection_evidence_invalid'] });
  }

  if (!binding || !isUuid(binding.pharmacyId) || !isUuid(binding.branchId)) {
    return freezeResult({ ...base, coverage: 'unknown', issues: ['workspace_unavailable'] });
  }
  const referenceUtc = utcMidnight(input.now());
  if (referenceUtc === null || !Number.isInteger(input.productLimit) || input.productLimit < 1) {
    return freezeResult({ ...base, coverage: 'unknown', issues: ['derivation_input_invalid'] });
  }

  const productById = new Map<string, LocalProduct>();
  for (const product of products) {
    if (!isProductEvidence(product)
        || product.pharmacy_id !== binding.pharmacyId
        || productById.has(product.id)
    ) {
      return freezeResult({ ...base, coverage: 'unknown', issues: ['product_evidence_invalid'] });
    }
    productById.set(product.id, product);
  }

  const batchIds = new Set<string>();
  const rows: ExpiryAttentionRow[] = [];
  for (const [mapProductId, batches] of Object.entries(batchesMap)) {
    const product = productById.get(mapProductId);
    if (!product || !Array.isArray(batches)) {
      return freezeResult({ ...base, coverage: 'unknown', issues: ['orphan_batch_group'] });
    }
    for (const batch of batches) {
      if (!isBatchEvidence(batch)) {
        return freezeResult({ ...base, coverage: 'unknown', issues: ['batch_evidence_invalid'] });
      }
      const expiryUtc = parseStrictInventoryDate(batch.expiry_date);
      if (batchIds.has(batch.id)
          || batch.pharmacy_id !== binding.pharmacyId
          || batch.product_id !== mapProductId
          || expiryUtc === null
      ) {
        return freezeResult({ ...base, coverage: 'unknown', issues: ['batch_evidence_invalid'] });
      }
      batchIds.add(batch.id);
      if (batch.branch_id !== binding.branchId || batch.projected_stock <= 0) continue;
      const daysUntilExpiry = Math.round((expiryUtc - referenceUtc) / MS_PER_DAY);
      if (daysUntilExpiry > 90) continue;
      rows.push({
        batchId: batch.id,
        productId: product.id,
        productName: product.name,
        batchNumber: batch.batch_number,
        serverStatus: batch.status,
        expiryDate: batch.expiry_date,
        projectedQuantity: batch.projected_stock,
        daysUntilExpiry,
        classification: daysUntilExpiry <= 0
          ? 'EXPIRED_TIME_DERIVED'
          : 'EXPIRING_WITHIN_90_DAYS_TIME_DERIVED',
      });
    }
  }

  for (const productId of productById.keys()) {
    if (!Object.prototype.hasOwnProperty.call(batchesMap, productId)) {
      return freezeResult({ ...base, coverage: 'unknown', issues: ['batch_group_missing'] });
    }
  }

  rows.sort((left, right) => {
    const byDate = left.expiryDate.localeCompare(right.expiryDate);
    if (byDate !== 0) return byDate;
    const byProduct = left.productName.localeCompare(right.productName);
    if (byProduct !== 0) return byProduct;
    const byBatch = left.batchNumber.localeCompare(right.batchNumber);
    return byBatch !== 0 ? byBatch : left.batchId.localeCompare(right.batchId);
  });

  if (freshness
      && (typeof freshness.isStale !== 'boolean'
        || !Number.isInteger(freshness.productCount) || freshness.productCount < 0
        || !Number.isInteger(freshness.batchCount) || freshness.batchCount < 0
        || !(freshness.syncedAt === null || (Number.isFinite(freshness.syncedAt) && freshness.syncedAt > 0))
        || !(freshness.sourceUpdatedAt === null || typeof freshness.sourceUpdatedAt === 'string'))) {
    return freezeResult({ ...base, coverage: 'unknown', issues: ['snapshot_metadata_invalid'] });
  }

  const issues: string[] = [];
  if (!freshness || freshness.syncedAt === null) issues.push('snapshot_metadata_missing');
  if (input.searchQuery.trim() !== '') issues.push('search_subset');
  if (products.length >= input.productLimit) issues.push('product_limit_reached');
  if (freshness && freshness.productCount !== products.length) issues.push('product_count_mismatch');
  if (freshness && freshness.batchCount !== loadedBatchCount) issues.push('batch_count_mismatch');
  if (freshness?.syncedAt !== null && freshness?.syncedAt !== undefined) {
    const incompatibleGeneration = products.some((product) => product.synced_at !== freshness.syncedAt)
      || Object.values(batchesMap).some((batches) => batches.some((batch) => batch.synced_at !== freshness.syncedAt));
    if (incompatibleGeneration) issues.push('snapshot_generation_mismatch');
  }

  return freezeResult({
    ...base,
    coverage: issues.length === 0 ? 'complete_cache' : 'partial_cache',
    issues,
    rows,
  });
}
