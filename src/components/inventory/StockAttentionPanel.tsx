import React from 'react';
import {
  StockAttentionEvidenceState,
  StockAttentionResult,
} from '../../lib/inventory/stockAttention';

interface StockAttentionPanelProps {
  result: StockAttentionResult;
  evidenceState: StockAttentionEvidenceState;
}

const ISSUE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  batch_group_missing: 'At least one loaded product has no batch-group evidence.',
  snapshot_metadata_missing: 'Snapshot freshness metadata is unavailable.',
  search_subset: 'A product search is active, so only the searched cache subset is assessed.',
  product_limit_reached: 'The loaded cache reached the product display limit and may be truncated.',
  snapshot_stale: 'The loaded snapshot is marked stale.',
  product_count_mismatch: 'The loaded product count does not match snapshot metadata.',
  batch_count_mismatch: 'The loaded batch count does not match snapshot metadata.',
  snapshot_generation_mismatch: 'Loaded records do not all belong to the recorded snapshot generation.',
});

export const StockAttentionPanel: React.FC<StockAttentionPanelProps> = ({ result, evidenceState }) => {
  if (!result.workspaceKey) return null;
  const attentionRows = result.rows.filter((row) => (
    row.band === 'DEPLETED_OR_DEFICIT_CACHED_PROJECTED'
    || row.band === 'LOW_1_TO_10_CACHED_PROJECTED'
  ));

  return (
    <section className="mb-5 rounded-xl border border-slate-700 bg-slate-900/60 p-4" aria-labelledby="stock-attention-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="stock-attention-title" className="text-sm font-semibold text-white">Cached branch stock attention</h2>
          <p className="mt-1 text-xs text-slate-400">
            Cached projected quantities for the current branch. They are not authoritative stock, available-to-sell guarantees, reorder levels or purchase recommendations.
          </p>
        </div>
        {result.isStale && <span className="text-xs font-medium text-amber-300">Cached snapshot is stale</span>}
      </div>

      {evidenceState === 'unavailable' ? (
        <p className="mt-4 text-xs text-rose-300" role="alert">
          Stock attention is unavailable because the local cache could not be read. No stock conclusion is available.
        </p>
      ) : evidenceState === 'loading' ? (
        <p className="mt-4 text-xs text-slate-300" role="status">Assessing the current loaded cacheâ€¦</p>
      ) : result.coverage === 'unknown' ? (
        <p className="mt-4 text-xs text-rose-300" role="alert">
          Stock attention is unknown because cached evidence is missing, invalid or not bound to the current workspace. Missing evidence is not zero stock.
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

          {attentionRows.length === 0 ? (
            <p className="mt-4 text-xs text-slate-300">
              No matching stock-attention items in the loaded branch cache. This is not confirmation that stock is adequate or safe to sell.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="text-slate-400">
                  <tr>
                    <th className="pb-2 pr-4 font-medium">Product</th>
                    <th className="pb-2 pr-4 font-medium">Local display band</th>
                    <th className="pb-2 text-right font-medium">Cached projected quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {attentionRows.map((row) => (
                    <tr key={row.productId}>
                      <td className="py-2 pr-4 font-medium text-white">{row.productName}</td>
                      <td className="py-2 pr-4">
                        {row.band === 'LOW_1_TO_10_CACHED_PROJECTED'
                          ? '1â€“10 local attention band (not a reorder threshold)'
                          : 'Depleted / deficit cached projection'}
                      </td>
                      <td className="py-2 text-right tabular-nums">{row.cachedProjectedQuantity}</td>
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
