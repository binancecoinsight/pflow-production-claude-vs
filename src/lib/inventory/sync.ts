/**
 * PharmacyFlow Authoritative Catalog & Inventory Synchronization Service (Phase 5D-7)
 * 
 * Implements authoritative server -> client catalog & inventory refresh.
 * 
 * ARCHITECTURAL PRINCIPLES:
 * 1. Authoritative PostgreSQL/Supabase remains the single source of truth.
 * 2. Authenticated user -> pharmacy_members membership is verified before data access.
 * 3. Atomic local IndexedDB replacement via Phase 5D-4 ensures no partial catalogs.
 * 4. Monotonic revision checking prevents stale server responses from overwriting newer local snapshots.
 * 5. Empty responses are guarded to prevent accidental local catalog wiping.
 * 6. Single-flight concurrency mutex prevents duplicate parallel sync operations.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  AuthoritativeSnapshotContract,
  SnapshotProductRecord,
  SnapshotBatchRecord,
  RefreshSnapshotOptions,
  SnapshotSyncResult,
  InventorySnapshot
} from './types';
import { replacePharmacyInventorySnapshot, getInventorySnapshotMetadata } from './service';
import { isOnline } from '../offline/network';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidUuid = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  return UUID_REGEX.test(value.trim());
};

// In-flight single-flight mutex per pharmacy tenant
const inFlightSyncs = new Map<string, Promise<SnapshotSyncResult>>();

/**
 * Downloads authoritative product and batch records from Supabase via PostgREST/RLS,
 * enforcing active pharmacy membership and controlled pagination.
 */
export const fetchAuthoritativeSnapshot = async (
  client: SupabaseClient,
  pharmacyId: string,
  options?: RefreshSnapshotOptions
): Promise<{
  success: boolean;
  status: 'FETCHED' | 'AUTH_REQUIRED' | 'FORBIDDEN' | 'OFFLINE' | 'ERROR';
  snapshot?: AuthoritativeSnapshotContract;
  error?: string;
}> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  if (!isValidUuid(normPharmacy)) {
    return { success: false, status: 'ERROR', error: `Invalid pharmacy_id: ${pharmacyId}` };
  }

  // 1. Check network connectivity hint
  if (!isOnline()) {
    return { success: false, status: 'OFFLINE', error: 'Network is currently offline' };
  }

  try {
    // 2. Authenticated Session Verification
    const { data: sessionData, error: sessionErr } = await client.auth.getSession();
    if (sessionErr || !sessionData?.session?.user?.id) {
      return {
        success: false,
        status: 'AUTH_REQUIRED',
        error: 'Active Supabase session is required to fetch catalog snapshot'
      };
    }
    const userId = sessionData.session.user.id;

    // 3. Authoritative Tenant Membership Verification
    // Prevents cross-tenant queries before requesting data
    const { data: member, error: memberErr } = await client
      .from('pharmacy_members')
      .select('id, pharmacy_id, user_id, role, status')
      .eq('pharmacy_id', normPharmacy)
      .eq('user_id', userId)
      .eq('status', 'ACTIVE')
      .maybeSingle();

    if (memberErr) {
      return {
        success: false,
        status: 'ERROR',
        error: `Database error verifying pharmacy membership: ${memberErr.message}`
      };
    }

    if (!member) {
      return {
        success: false,
        status: 'FORBIDDEN',
        error: `User does not have an active membership in pharmacy [${normPharmacy}]`
      };
    }

    // 4. Paginated Product Fetching
    const pageSize = options?.pageSize && options.pageSize > 0 ? options.pageSize : 1000;
    const products: SnapshotProductRecord[] = [];
    let prodFrom = 0;
    let hasMoreProds = true;

    while (hasMoreProds) {
      const prodTo = prodFrom + pageSize - 1;
      const { data: chunk, error: prodErr } = await client
        .from('products')
        .select('id, pharmacy_id, name, sku, barcode, generic_name, category, unit, selling_price, cost_price, status, updated_at')
        .eq('pharmacy_id', normPharmacy)
        .order('id', { ascending: true })
        .range(prodFrom, prodTo);

      if (prodErr) {
        return {
          success: false,
          status: 'ERROR',
          error: `Failed to fetch products: ${prodErr.message}`
        };
      }

      if (!chunk || chunk.length === 0) break;

      products.push(...(chunk as SnapshotProductRecord[]));
      if (chunk.length < pageSize) break;
      prodFrom += pageSize;
    }

    // 5. Paginated Inventory Batch Fetching
    const batches: SnapshotBatchRecord[] = [];
    let batchFrom = 0;
    let hasMoreBatches = true;

    while (hasMoreBatches) {
      const batchTo = batchFrom + pageSize - 1;
      const { data: chunk, error: batchErr } = await client
        .from('inventory_batches')
        .select('id, pharmacy_id, product_id, branch_id, batch_number, expiry_date, quantity, selling_price, cost_price, status, updated_at')
        .eq('pharmacy_id', normPharmacy)
        .order('id', { ascending: true })
        .range(batchFrom, batchTo);

      if (batchErr) {
        return {
          success: false,
          status: 'ERROR',
          error: `Failed to fetch inventory batches: ${batchErr.message}`
        };
      }

      if (!chunk || chunk.length === 0) break;

      batches.push(...(chunk as SnapshotBatchRecord[]));
      if (chunk.length < pageSize) break;
      batchFrom += pageSize;
    }

    // 6. Monotonic Snapshot Revision Computation
    // Uses the latest updated_at epoch ms across all products and batches
    let maxUpdatedMs = 0;
    for (const p of products) {
      if (p.updated_at) {
        const ms = new Date(p.updated_at).getTime();
        if (!isNaN(ms) && ms > maxUpdatedMs) maxUpdatedMs = ms;
      }
    }
    for (const b of batches) {
      if (b.updated_at) {
        const ms = new Date(b.updated_at).getTime();
        if (!isNaN(ms) && ms > maxUpdatedMs) maxUpdatedMs = ms;
      }
    }

    // Fallback to current time if database records have no timestamps
    const nowIso = new Date().toISOString();
    const sourceUpdatedAt = maxUpdatedMs > 0 ? new Date(maxUpdatedMs).toISOString() : nowIso;
    const snapshotVersion = maxUpdatedMs > 0 ? maxUpdatedMs : Date.now();

    const snapshot: AuthoritativeSnapshotContract = {
      pharmacy_id: normPharmacy,
      snapshot_version: snapshotVersion,
      generated_at: nowIso,
      source_updated_at: sourceUpdatedAt,
      product_count: products.length,
      batch_count: batches.length,
      products,
      batches
    };

    return { success: true, status: 'FETCHED', snapshot };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected network error';
    return { success: false, status: 'ERROR', error: message };
  }
};

/**
 * Ingests an authoritative snapshot into local IndexedDB with atomic replacement,
 * staleness protection, and empty catalog safety guards.
 */
export const ingestAuthoritativeSnapshot = async (
  snapshot: AuthoritativeSnapshotContract,
  options?: RefreshSnapshotOptions
): Promise<SnapshotSyncResult> => {
  const normPharmacy = snapshot.pharmacy_id.toLowerCase().trim();

  // 1. Guard against accidental empty catalog overwrite
  const existingMeta = await getInventorySnapshotMetadata(normPharmacy, options?.customFactory);

  if (snapshot.products.length === 0) {
    if (existingMeta && existingMeta.product_count > 0 && !options?.allowEmptyCatalog) {
      return {
        success: false,
        status: 'SUSPICIOUS_EMPTY',
        pharmacy_id: normPharmacy,
        error: `Server returned 0 products while local catalog contains ${existingMeta.product_count} products. Set allowEmptyCatalog to confirm legitimate empty store.`
      };
    }
  }

  // 2. Monotonic Stale Response Protection
  if (existingMeta && existingMeta.source_updated_at) {
    const localVersion = new Date(existingMeta.source_updated_at).getTime();
    if (!isNaN(localVersion)) {
      if (snapshot.snapshot_version < localVersion) {
        return {
          success: false,
          status: 'STALE_REJECTED',
          pharmacy_id: normPharmacy,
          metadata: existingMeta,
          snapshot_version: snapshot.snapshot_version,
          error: `Server snapshot version (${snapshot.snapshot_version}) is older than existing local snapshot (${localVersion})`
        };
      }

      if (snapshot.snapshot_version === localVersion && !options?.force) {
        return {
          success: true,
          status: 'ALREADY_CURRENT',
          pharmacy_id: normPharmacy,
          metadata: existingMeta,
          products_synced: existingMeta.product_count,
          batches_synced: existingMeta.batch_count,
          snapshot_version: snapshot.snapshot_version
        };
      }
    }
  }

  // 3. Map to Phase 5D-4 InventorySnapshot format
  const mappedSnapshot: InventorySnapshot = {
    pharmacy_id: normPharmacy,
    products: snapshot.products.map((p) => ({
      id: p.id,
      pharmacy_id: normPharmacy,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      generic_name: p.generic_name,
      category: p.category,
      unit: p.unit,
      selling_price: p.selling_price,
      cost_price: p.cost_price,
      status: p.status,
      updated_at: p.updated_at
    })),
    batches: snapshot.batches.map((b) => ({
      id: b.id,
      pharmacy_id: normPharmacy,
      product_id: b.product_id,
      branch_id: b.branch_id,
      batch_number: b.batch_number,
      expiry_date: b.expiry_date,
      quantity: b.quantity, // Server current stock mapped to projected_stock
      selling_price: b.selling_price,
      cost_price: b.cost_price,
      status: b.status,
      updated_at: b.updated_at
    })),
    source_updated_at: snapshot.source_updated_at
  };

  // 4. Atomic Ingestion into IndexedDB via Phase 5D-4
  // Phase 5D-4 performs rigorous schema validation on products and batches before write
  const metadata = await replacePharmacyInventorySnapshot(
    normPharmacy,
    mappedSnapshot,
    options?.customFactory
  );

  return {
    success: true,
    status: 'SYNCED',
    pharmacy_id: normPharmacy,
    metadata,
    products_synced: metadata.product_count,
    batches_synced: metadata.batch_count,
    snapshot_version: snapshot.snapshot_version
  };
};

/**
 * Controlled high-level synchronization service:
 * Refreshes authoritative inventory snapshot from Supabase into local IndexedDB.
 * Deduplicates concurrent calls via single-flight mutex per pharmacy tenant.
 */
export const refreshInventorySnapshot = async (
  client: SupabaseClient,
  pharmacyId: string,
  options?: RefreshSnapshotOptions
): Promise<SnapshotSyncResult> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();

  // Deduplicate concurrent sync executions for same pharmacy
  const existingFlight = inFlightSyncs.get(normPharmacy);
  if (existingFlight) {
    return existingFlight;
  }

  const syncPromise = (async () => {
    try {
      // 1. Fetch authoritative snapshot
      const fetchResult = await fetchAuthoritativeSnapshot(client, normPharmacy, options);

      if (!fetchResult.success || !fetchResult.snapshot) {
        const errorStatus = fetchResult.status;
        return {
          success: false,
          status: errorStatus as any,
          pharmacy_id: normPharmacy,
          error: fetchResult.error || 'Failed to fetch catalog snapshot'
        };
      }

      // 2. Ingest with atomic replacement and staleness protection
      return await ingestAuthoritativeSnapshot(fetchResult.snapshot, options);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown synchronization error';
      return {
        success: false,
        status: 'ERROR',
        pharmacy_id: normPharmacy,
        error: message
      };
    } finally {
      inFlightSyncs.delete(normPharmacy);
    }
  })();

  inFlightSyncs.set(normPharmacy, syncPromise);
  return syncPromise;
};
