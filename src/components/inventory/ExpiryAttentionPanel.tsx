import React, { useMemo } from 'react';
import {
  DeriveExpiryAttentionInput,
  ExpiryAttentionWorkspaceBinding,
  deriveExpiryAttention,
} from '../../lib/inventory/expiryAttention';
import { LocalBatch, LocalProduct } from '../../lib/inventory/types';
import { CatalogFreshnessStatus } from '../../lib/pos/types';

interface ExpiryAttentionPanelProps {
  binding: ExpiryAttentionWorkspaceBinding | null;
  products: readonly LocalProduct[];
  batchesMap: Readonly<Record<string, readonly LocalBatch[]>>;
  freshness: CatalogFreshnessStatus | null;
  searchQuery: string;
  productLimit: number;
  now?: () => number;
  isLoading: boolean;
  loadError: boolean;
}

const ISSUE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  snapshot_metadata_missing: 'Snapshot freshness metadata is unavailable.',
  search_subset: 'A product search is active, so only the searched cache subset is assessed.',
  product_limit_reached: 'The loaded cache reached the product display limit and may be truncated.',
  product_count_mismatch: 'The loaded product count does not match snapshot metadata.',
  batch_count_mismatch: 'The loaded batch count does not match snapshot metadata.',
  snapshot_generation_mismatch: 'Loaded records do not all belong to the recorded snapshot generation.',
});

export const ExpiryAttentionPanel: React.FC<ExpiryAttentionPanelProps> = ({
  binding,
  products,
  batchesMap,
  freshness,
  searchQuery,
  productLimit,
  now = Date.now,
  isLoading,
  loadError,
}) => {
  const derivationInput: DeriveExpiryAttentionInput = {
    binding,
    products,
    batchesMap,
    freshness,
    searchQuery,
    productLimit,
    now,
  };
  const result = useMemo(
    () => deriveExpiryAttention(derivationInput),
    [binding, products, batchesMap, freshness, searchQuery, productLimit, now],
  );

  if (!binding) return null;

  return (
    <section className="mb-5 rounded-xl border border-slate-700 bg-slate-900/60 p-4" aria-labelledby="expiry-attention-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="expiry-attention-title" className="text-sm font-semibold text-white">Expiry attention</h2>
          <p className="mt-1 text-xs text-slate-400">
            Cached, projected branch quantities only. This is not authoritative stock and does not confirm that stock is safe to sell.
          </p>
        </div>
        {freshness?.isStale && <span className="text-xs font-medium text-amber-300">Cached snapshot is stale</span>}
      </div>

      {loadError ? (
        <p className="mt-4 text-xs text-rose-300" role="alert">
          Expiry attention is unavailable because the local cache could not be read. No safety conclusion is available.
        </p>
      ) : isLoading ? (
        <p className="mt-4 text-xs text-slate-300" role="status">Assessing the current loaded cache…</p>
      ) : result.coverage === 'unknown' ? (
        <p className="mt-4 text-xs text-rose-300" role="alert">
          Expiry attention is unknown because cached evidence is invalid or not bound to the current workspace. No safety conclusion is available.
        </p>
      ) : (
        <>
          {result.coverage === 'partial_cache' && (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200" role="status">
              <p className="font-medium">Partial cache coverage</p>
              <ul className="mt-1 list-disc pl-4">
                {result.issues.map((issue) => <li key={issue}>{ISSUE_LABELS[issue] ?? 'Cache coverage could not be fully established.'}</li>)}
              </ul>
            </div>
          )}

          {result.rows.length === 0 ? (
            <p className="mt-4 text-xs text-slate-300">
              No matching expiry items in the loaded cache. This is not confirmation that the branch has no expiry risk.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="text-slate-400">
                  <tr>
                    <th className="pb-2 pr-4 font-medium">Product / batch</th>
                    <th className="pb-2 pr-4 font-medium">Server status</th>
                    <th className="pb-2 pr-4 font-medium">Expiry (time-derived)</th>
                    <th className="pb-2 text-right font-medium">Cached projected quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {result.rows.map((row) => (
                    <tr key={row.batchId}>
                      <td className="py-2 pr-4">
                        <span className="font-medium text-white">{row.productName}</span>
                        <span className="block text-slate-400">{row.batchNumber}</span>
                      </td>
                      <td className="py-2 pr-4">{row.serverStatus}</td>
                      <td className="py-2 pr-4">
                        {row.expiryDate} — {row.classification === 'EXPIRED_TIME_DERIVED'
                          ? 'expired as of the UTC calendar day'
                          : `within 90 days (${row.daysUntilExpiry} days)`}
                      </td>
                      <td className="py-2 text-right tabular-nums">{row.projectedQuantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
};
