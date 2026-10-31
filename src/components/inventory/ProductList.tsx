import React, { useState, useMemo } from 'react';
import {
  Search,
  X,
  Package,
  Filter,
  Layers,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Info
} from 'lucide-react';
import { LocalProduct } from '../../lib/inventory/types';
import {
  StockAttentionEvidenceState,
  StockAttentionBand,
  StockAttentionFilter,
  StockAttentionResult,
  StockAttentionRow,
  matchesStockAttentionFilter,
} from '../../lib/inventory/stockAttention';
import { formatMinorUnits } from '../pos/formatters';

interface ProductListProps {
  products: unknown;
  selectedProductId: string | null;
  onSelectProduct: (product: LocalProduct) => void;
  currency: string;
  canSeeCostPrice: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  stockAttention: StockAttentionResult;
  stockEvidenceState: StockAttentionEvidenceState;
  isLoading: boolean;
  onSync: () => void;
}

interface ProductPresentationRow {
  readonly product: LocalProduct;
  readonly id: string;
  readonly name: string;
  readonly genericName: string | null;
  readonly sku: string | null;
  readonly barcode: string | null;
  readonly category: string | null;
  readonly sellingPrice: number;
  readonly costPrice: number | null;
  readonly status: string;
}

interface ProductPresentationBoundary {
  readonly collectionAvailable: boolean;
  readonly sourceCount: number | null;
  readonly invalidRowCount: number;
  readonly rows: readonly ProductPresentationRow[];
}

const STOCK_BANDS = new Set<StockAttentionBand>([
  'DEPLETED_OR_DEFICIT_CACHED_PROJECTED',
  'LOW_1_TO_10_CACHED_PROJECTED',
  'ABOVE_10_CACHED_PROJECTED',
  'UNKNOWN',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableText(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function expectedBand(quantity: number): StockAttentionBand {
  if (quantity <= 0) return 'DEPLETED_OR_DEFICIT_CACHED_PROJECTED';
  if (quantity <= 10) return 'LOW_1_TO_10_CACHED_PROJECTED';
  return 'ABOVE_10_CACHED_PROJECTED';
}

export function prepareProductListPresentation(
  products: unknown,
  canSeeCostPrice: boolean,
): ProductPresentationBoundary {
  if (!Array.isArray(products)) {
    return { collectionAvailable: false, sourceCount: null, invalidRowCount: 0, rows: [] };
  }

  const rows: ProductPresentationRow[] = [];
  let invalidRowCount = 0;
  for (const candidate of products) {
    if (!isRecord(candidate)
        || typeof candidate.id !== 'string' || candidate.id.trim() === ''
        || typeof candidate.name !== 'string' || candidate.name.trim() === ''
        || !isNullableText(candidate.generic_name)
        || !isNullableText(candidate.sku)
        || !isNullableText(candidate.barcode)
        || !isNullableText(candidate.category)
        || typeof candidate.status !== 'string' || candidate.status.trim() === ''
        || typeof candidate.selling_price !== 'number' || !Number.isSafeInteger(candidate.selling_price)
        || (canSeeCostPrice
          && (typeof candidate.cost_price !== 'number' || !Number.isSafeInteger(candidate.cost_price)))) {
      invalidRowCount += 1;
      continue;
    }
    rows.push({
      product: candidate as unknown as LocalProduct,
      id: candidate.id,
      name: candidate.name,
      genericName: candidate.generic_name,
      sku: candidate.sku,
      barcode: candidate.barcode,
      category: candidate.category,
      sellingPrice: candidate.selling_price,
      costPrice: canSeeCostPrice ? candidate.cost_price as number : null,
      status: candidate.status,
    });
  }
  return { collectionAvailable: true, sourceCount: products.length, invalidRowCount, rows };
}

function isStockAttentionRow(value: unknown): value is StockAttentionRow {
  if (!isRecord(value)
      || typeof value.productId !== 'string' || value.productId.trim() === ''
      || typeof value.band !== 'string' || !STOCK_BANDS.has(value.band as StockAttentionBand)) {
    return false;
  }
  if (value.cachedProjectedQuantity === null) {
    return value.band === 'UNKNOWN' && value.branchBatchCount === null;
  }
  return typeof value.cachedProjectedQuantity === 'number'
    && Number.isSafeInteger(value.cachedProjectedQuantity)
    && typeof value.branchBatchCount === 'number'
    && Number.isSafeInteger(value.branchBatchCount)
    && value.branchBatchCount >= 0
    && value.band === expectedBand(value.cachedProjectedQuantity);
}

function stockRowsByProductId(stockAttention: unknown): ReadonlyMap<string, StockAttentionRow> {
  if (!isRecord(stockAttention) || !Array.isArray(stockAttention.rows)) return new Map();
  const rows = new Map<string, StockAttentionRow>();
  const duplicates = new Set<string>();
  for (const candidate of stockAttention.rows) {
    if (!isStockAttentionRow(candidate) || duplicates.has(candidate.productId)) continue;
    if (rows.has(candidate.productId)) {
      rows.delete(candidate.productId);
      duplicates.add(candidate.productId);
      continue;
    }
    rows.set(candidate.productId, candidate);
  }
  return rows;
}

export function filterProductListPresentation(
  rows: readonly ProductPresentationRow[],
  statusFilter: 'ALL' | 'ACTIVE' | 'INACTIVE',
  selectedCategory: string,
  stockFilter: StockAttentionFilter,
  stockByProductId: ReadonlyMap<string, StockAttentionRow>,
  stockEvidenceState: StockAttentionEvidenceState,
): readonly ProductPresentationRow[] {
  return rows.filter((row) => (
    (statusFilter === 'ALL' || row.status.toUpperCase() === statusFilter)
    && (selectedCategory === 'ALL' || row.category?.trim().toLowerCase() === selectedCategory.toLowerCase())
    && (stockFilter === 'ALL'
      || (stockEvidenceState === 'ready'
        && matchesStockAttentionFilter(stockByProductId.get(row.id), stockFilter)))
  ));
}

export const ProductList: React.FC<ProductListProps> = ({
  products,
  selectedProductId,
  onSelectProduct,
  currency,
  canSeeCostPrice,
  searchQuery,
  onSearchChange,
  stockAttention,
  stockEvidenceState,
  isLoading,
  onSync
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [stockFilter, setStockFilter] = useState<StockAttentionFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const productPresentation = useMemo(
    () => prepareProductListPresentation(products, canSeeCostPrice),
    [products, canSeeCostPrice],
  );
  const productRows = productPresentation.rows;

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    productRows.forEach((row) => {
      if (row.category?.trim()) set.add(row.category.trim());
    });
    return Array.from(set).sort();
  }, [productRows]);

  const stockByProductId = useMemo(() => stockRowsByProductId(stockAttention), [stockAttention]);

  // Filter products by category, stock filter, status filter, and query
  const filteredProducts = useMemo(() => {
    return filterProductListPresentation(
      productRows,
      statusFilter,
      selectedCategory,
      stockFilter,
      stockByProductId,
      stockEvidenceState,
    );
  }, [productRows, statusFilter, selectedCategory, stockFilter, stockByProductId, stockEvidenceState]);

  return (
    <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl shadow-xl overflow-hidden backdrop-blur-md flex flex-col">
      {/* Search & Filter Toolbar */}
      <div className="p-4 sm:p-5 border-b border-slate-800/80 space-y-3.5 bg-slate-950/40">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          {/* Responsive Local Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search local catalog by name, generic name, SKU, or barcode..."
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-9 py-2 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-0.5 cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Dropdown */}
          {categories.length > 0 && (
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="ALL">All Categories ({categories.length})</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Stock Filter Pills */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-[11px] text-slate-400 font-medium">Filter Stock:</span>
          <button
            type="button"
            onClick={() => setStockFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
              stockFilter === 'ALL'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            All Products ({productRows.length})
          </button>
          <button
            type="button"
            onClick={() => setStockFilter('IN_STOCK')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
              stockFilter === 'IN_STOCK'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            In Stock
          </button>
          <button
            type="button"
            onClick={() => setStockFilter('LOW_STOCK')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
              stockFilter === 'LOW_STOCK'
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Local attention (1–10 cached projected)
          </button>
          <button
            type="button"
            onClick={() => setStockFilter('DEPLETED_DEFICIT')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
              stockFilter === 'DEPLETED_DEFICIT'
                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Depleted / Deficit (≤0)
          </button>
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-2 flex-wrap text-xs pt-2 border-t border-slate-800/60">
          <span className="text-[11px] text-slate-400 font-medium">Status:</span>
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-2.5 py-0.5 rounded-lg text-[11px] font-medium transition cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-slate-800 text-white border border-slate-700'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            All ({productRows.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('ACTIVE')}
            className={`px-2.5 py-0.5 rounded-lg text-[11px] font-medium transition cursor-pointer ${
              statusFilter === 'ACTIVE'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Active ({productRows.filter((row) => row.status.toUpperCase() === 'ACTIVE').length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('INACTIVE')}
            className={`px-2.5 py-0.5 rounded-lg text-[11px] font-medium transition cursor-pointer ${
              statusFilter === 'INACTIVE'
                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Inactive ({productRows.filter((row) => row.status.toUpperCase() === 'INACTIVE').length})
          </button>
        </div>
      </div>

      {/* Product List Content */}
      <div className="overflow-x-auto flex-1">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400">
            <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin mx-auto mb-3" />
            <span className="text-xs">Loading local inventory read model...</span>
          </div>
        ) : !productPresentation.collectionAvailable ? (
          <div className="p-12 text-center text-amber-300" role="alert">
            <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-white">Local inventory unavailable</h3>
            <p className="text-xs text-slate-300 mt-1 max-w-md mx-auto">
              The cached product collection is malformed or unavailable. It is not being presented as empty inventory.
            </p>
          </div>
        ) : productPresentation.sourceCount === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Package className="w-12 h-12 text-slate-600 mx-auto mb-3 opacity-60" />
            <h3 className="text-sm font-semibold text-white">Local Inventory Empty</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              No product catalog records found in local IndexedDB. Perform a catalog sync to download authoritative inventory from Supabase.
            </p>
            <button
              type="button"
              onClick={onSync}
              className="mt-4 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition cursor-pointer shadow-lg shadow-emerald-600/20"
            >
              Sync Catalog Now
            </button>
          </div>
        ) : productRows.length === 0 ? (
          <div className="p-12 text-center text-amber-300" role="alert">
            <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-white">Product records unavailable</h3>
            <p className="text-xs text-slate-300 mt-1 max-w-md mx-auto">
              Cached product rows contain malformed presentation evidence. They are not being presented as empty inventory.
            </p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Search className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
            <p className="text-xs font-medium text-slate-300">No products match your search or filter</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Try adjusting your query or resetting the category and stock filters.
            </p>
            <button
              type="button"
              onClick={() => {
                onSearchChange('');
                setSelectedCategory('ALL');
                setStockFilter('ALL');
              }}
              className="mt-3 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-medium transition cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <>
          {productPresentation.invalidRowCount > 0 && (
            <div className="px-4 py-3 border-b border-amber-500/20 bg-amber-500/10 text-xs text-amber-200" role="alert">
              {productPresentation.invalidRowCount} cached product {productPresentation.invalidRowCount === 1 ? 'record is' : 'records are'} unavailable because presentation evidence is malformed. Valid records remain listed.
            </div>
          )}
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Product Details</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-right">Selling Price</th>
                {canSeeCostPrice && <th className="py-3 px-4 text-right">Cost Price</th>}
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Projected Stock</th>
                <th className="py-3 px-4 text-center">Batches</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {filteredProducts.map((row) => {
                const stockEvidence = stockEvidenceState === 'ready'
                  ? stockByProductId.get(row.id)
                  : undefined;
                const projectedStock = stockEvidence?.cachedProjectedQuantity ?? null;
                const isSelected = selectedProductId === row.id;

                return (
                  <tr
                    key={row.id}
                    onClick={() => onSelectProduct(row.product)}
                    className={`group transition cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/10'
                        : 'hover:bg-slate-800/40'
                    }`}
                  >
                    {/* Product Name & Identifiers */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-100 group-hover:text-emerald-400 transition">
                        {row.name}
                      </div>
                      {row.genericName && (
                        <div className="text-[11px] text-slate-400 italic">
                          {row.genericName}
                        </div>
                      )}
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5 flex items-center gap-2">
                        {row.sku && <span>SKU: {row.sku}</span>}
                        {row.sku && row.barcode && <span>•</span>}
                        {row.barcode && <span>Bar: {row.barcode}</span>}
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3.5 px-4 text-slate-300">
                      {row.category ? (
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] text-slate-300 border border-slate-700/80">
                          {row.category}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">Uncategorized</span>
                      )}
                    </td>

                    {/* Selling Price */}
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400">
                      {formatMinorUnits(row.sellingPrice, currency)}
                    </td>

                    {/* Cost Price (Gated by Role Permission) */}
                    {canSeeCostPrice && (
                      <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                        {row.costPrice === null ? 'Unavailable' : formatMinorUnits(row.costPrice, currency)}
                      </td>
                    )}

                    {/* Status Badge */}
                    <td className="py-3.5 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                        row.status === 'ACTIVE'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {row.status}
                      </span>
                    </td>

                    {/* Projected Stock */}
                    <td className="py-3.5 px-4 text-right font-mono">
                      <span className={`inline-flex items-center gap-1 font-bold ${
                        projectedStock === null
                          ? 'text-slate-400'
                          : projectedStock < 0
                          ? 'text-rose-400'
                          : projectedStock === 0
                          ? 'text-slate-400'
                          : projectedStock <= 10
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}>
                        {projectedStock === null ? (
                          <span>Unknown cached projection</span>
                        ) : projectedStock < 0 ? (
                          <>
                            <AlertTriangle className="w-3 h-3 text-rose-400" />
                            <span>{projectedStock} (Deficit)</span>
                          </>
                        ) : projectedStock === 0 ? (
                          <span>0 units</span>
                        ) : (
                          <span>{projectedStock} units</span>
                        )}
                      </span>
                      <span className="block text-[10px] text-slate-400 font-sans">
                        Cached branch projection
                      </span>
                    </td>

                    {/* Batches Count */}
                    <td className="py-3.5 px-4 text-center font-mono">
                      <span className="px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800 text-[11px]">
                        {stockEvidence?.branchBatchCount === null || stockEvidence?.branchBatchCount === undefined
                          ? 'Unknown'
                          : `${stockEvidence.branchBatchCount} ${stockEvidence.branchBatchCount === 1 ? 'batch' : 'batches'}`}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-4 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectProduct(row.product);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-emerald-600 hover:text-slate-950 text-slate-200 text-xs font-semibold transition cursor-pointer flex items-center gap-1 mx-auto"
                        title="Inspect batches for this product"
                      >
                        <span>Inspect</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </>
        )}
      </div>

      {/* Footer Summary Strip */}
      <div className="p-3 bg-slate-950 border-t border-slate-800/80 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-400">
        <span>
          Showing {filteredProducts.length} of {productRows.length} valid cached products
          {productPresentation.invalidRowCount > 0 ? `; ${productPresentation.invalidRowCount} unavailable` : ''}
        </span>
        <span className="text-[11px] text-slate-400">
          Click any product to inspect batches and expiry dates
        </span>
      </div>
    </div>
  );
};
