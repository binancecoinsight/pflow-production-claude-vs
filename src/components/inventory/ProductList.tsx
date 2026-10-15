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
import { LocalProduct, LocalBatch } from '../../lib/inventory/types';
import { formatMinorUnits } from '../pos/formatters';

interface ProductListProps {
  products: LocalProduct[];
  selectedProductId: string | null;
  onSelectProduct: (product: LocalProduct) => void;
  currency: string;
  canSeeCostPrice: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  batchesMap: Record<string, LocalBatch[]>;
  isLoading: boolean;
  onSync: () => void;
}

export const ProductList: React.FC<ProductListProps> = ({
  products,
  selectedProductId,
  onSelectProduct,
  currency,
  canSeeCostPrice,
  searchQuery,
  onSearchChange,
  batchesMap,
  isLoading,
  onSync
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'DEPLETED_DEFICIT'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category.trim());
    });
    return Array.from(set).sort();
  }, [products]);

  // Compute total projected stock per product from cached batches
  const productStockMap = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((p) => {
      const batches = batchesMap[p.id] || [];
      const total = batches.reduce((sum, b) => sum + b.projected_stock, 0);
      map.set(p.id, total);
    });
    return map;
  }, [products, batchesMap]);

  // Filter products by category, stock filter, status filter, and query
  const filteredProducts = useMemo(() => {
    let result = products;

    // Status filter
    if (statusFilter !== 'ALL') {
      result = result.filter((p) => p.status?.toUpperCase() === statusFilter);
    }

    // Category filter
    if (selectedCategory !== 'ALL') {
      result = result.filter((p) => p.category?.trim().toLowerCase() === selectedCategory.toLowerCase());
    }

    // Stock filter
    if (stockFilter === 'IN_STOCK') {
      result = result.filter((p) => (productStockMap.get(p.id) ?? 0) > 10);
    } else if (stockFilter === 'LOW_STOCK') {
      result = result.filter((p) => {
        const stock = productStockMap.get(p.id) ?? 0;
        return stock > 0 && stock <= 10;
      });
    } else if (stockFilter === 'DEPLETED_DEFICIT') {
      result = result.filter((p) => (productStockMap.get(p.id) ?? 0) <= 0);
    }

    return result;
  }, [products, statusFilter, selectedCategory, stockFilter, productStockMap]);

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
            All Products ({products.length})
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
            Low Stock (≤10)
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
            All ({products.length})
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
            Active ({products.filter((p) => p.status?.toUpperCase() === 'ACTIVE').length})
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
            Inactive ({products.filter((p) => p.status?.toUpperCase() === 'INACTIVE').length})
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
        ) : products.length === 0 ? (
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
              {filteredProducts.map((product) => {
                const batches = batchesMap[product.id] || [];
                const projectedStock = productStockMap.get(product.id) ?? 0;
                const isSelected = selectedProductId === product.id;

                return (
                  <tr
                    key={product.id}
                    onClick={() => onSelectProduct(product)}
                    className={`group transition cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/10'
                        : 'hover:bg-slate-800/40'
                    }`}
                  >
                    {/* Product Name & Identifiers */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-100 group-hover:text-emerald-400 transition">
                        {product.name}
                      </div>
                      {product.generic_name && (
                        <div className="text-[11px] text-slate-400 italic">
                          {product.generic_name}
                        </div>
                      )}
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5 flex items-center gap-2">
                        {product.sku && <span>SKU: {product.sku}</span>}
                        {product.sku && product.barcode && <span>•</span>}
                        {product.barcode && <span>Bar: {product.barcode}</span>}
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3.5 px-4 text-slate-300">
                      {product.category ? (
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] text-slate-300 border border-slate-700/80">
                          {product.category}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">Uncategorized</span>
                      )}
                    </td>

                    {/* Selling Price */}
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400">
                      {formatMinorUnits(product.selling_price, currency)}
                    </td>

                    {/* Cost Price (Gated by Role Permission) */}
                    {canSeeCostPrice && (
                      <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                        {formatMinorUnits(product.cost_price, currency)}
                      </td>
                    )}

                    {/* Status Badge */}
                    <td className="py-3.5 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                        product.status === 'ACTIVE'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {product.status}
                      </span>
                    </td>

                    {/* Projected Stock */}
                    <td className="py-3.5 px-4 text-right font-mono">
                      <span className={`inline-flex items-center gap-1 font-bold ${
                        projectedStock < 0
                          ? 'text-rose-400'
                          : projectedStock === 0
                          ? 'text-slate-400'
                          : projectedStock <= 10
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}>
                        {projectedStock < 0 ? (
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
                        Local Projection
                      </span>
                    </td>

                    {/* Batches Count */}
                    <td className="py-3.5 px-4 text-center font-mono">
                      <span className="px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800 text-[11px]">
                        {batches.length} {batches.length === 1 ? 'batch' : 'batches'}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-4 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectProduct(product);
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
        )}
      </div>

      {/* Footer Summary Strip */}
      <div className="p-3 bg-slate-950 border-t border-slate-800/80 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-400">
        <span>
          Showing {filteredProducts.length} of {products.length} cached products
        </span>
        <span className="text-[11px] text-slate-400">
          Click any product to inspect batches and expiry dates
        </span>
      </div>
    </div>
  );
};
