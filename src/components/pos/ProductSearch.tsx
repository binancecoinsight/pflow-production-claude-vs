import React, { useState, useEffect, useCallback, useTransition } from 'react';
import { Search, Barcode, Tag, Plus, AlertCircle, PackageX, Loader2, Sparkles, AlertTriangle } from 'lucide-react';
import { LocalProduct } from '../../lib/inventory/types';
import {
  searchProducts,
  findProductsByBarcode,
  findProductBySku,
  listLocalProducts,
  resolveBarcodeScan
} from '../../lib/inventory/service';
import { BarcodeDuplicateModal } from './BarcodeDuplicateModal';
import { formatMinorUnits } from './formatters';
import { CheckoutAsyncBoundary, runCheckoutBoundTask } from './checkoutUiLifecycle';

interface ProductSearchProps {
  pharmacyId: string;
  currency: string;
  onAddToCart: (productId: string) => Promise<void>;
  isAddingProduct: boolean;
  checkoutIdentity: string;
}

export const ProductSearch: React.FC<ProductSearchProps> = ({
  pharmacyId,
  currency,
  onAddToCart,
  isAddingProduct,
  checkoutIdentity
}) => {
  const requestBoundary = React.useRef(new CheckoutAsyncBoundary(checkoutIdentity));
  const [query, setQuery] = useState<string>('');
  const [products, setProducts] = useState<LocalProduct[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'BARCODE' | 'SKU'>('ALL');
  const [, startTransition] = useTransition();

  // Multi-match duplicate barcode resolution modal state
  const [duplicateMatches, setDuplicateMatches] = useState<LocalProduct[]>([]);
  const [scannedBarcode, setScannedBarcode] = useState<string>('');
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState<boolean>(false);

  useEffect(() => {
    requestBoundary.current.reset(checkoutIdentity);
    setQuery('');
    setProducts([]);
    setSearchError(null);
    setActiveFilter('ALL');
    setDuplicateMatches([]);
    setScannedBarcode('');
    setIsDuplicateModalOpen(false);
  }, [checkoutIdentity]);

  useEffect(() => () => requestBoundary.current.invalidate(), []);

  const loadProducts = useCallback(async (searchQuery: string, filter: 'ALL' | 'BARCODE' | 'SKU') => {
    setIsLoading(true);
    setSearchError(null);
    const outcome = await runCheckoutBoundTask(requestBoundary.current, async () => {
      const clean = searchQuery.trim();

      if (!clean) {
        // Load initial local products when search is empty
        return await listLocalProducts(pharmacyId, 60);
      }

      let results: LocalProduct[] = [];

      if (filter === 'BARCODE') {
        results = await findProductsByBarcode(pharmacyId, clean);
      } else if (filter === 'SKU') {
        const bySku = await findProductBySku(pharmacyId, clean);
        results = bySku ? [bySku] : [];
      } else {
        // General Search (Checks Name, Generic Name, SKU, and Barcode)
        results = await searchProducts(pharmacyId, clean, 50);
      }

      return results;
    });
    if (!outcome.accepted) return;
    if ('error' in outcome) {
      setSearchError(outcome.error instanceof Error ? outcome.error.message : 'Error querying local inventory catalog');
    } else {
      startTransition(() => setProducts(outcome.value));
    }
    setIsLoading(false);
  }, [pharmacyId, checkoutIdentity]);

  // Debounced search on query or filter change
  useEffect(() => {
    const timer = setTimeout(() => {
      loadProducts(query, activeFilter);
    }, 200);

    return () => clearTimeout(timer);
  }, [query, activeFilter, loadProducts]);

  /**
   * Safe POS Barcode Scanner Handler
   * Triggers when operator scans a barcode or hits Enter on barcode search.
   * Strictly enforces:
   * 1. No match -> error feedback, cart unchanged.
   * 2. Single active match -> safe add to cart.
   * 3. Single inactive match -> block with explanation, cart unchanged.
   * 4. Multiple matches -> open duplicate-resolution modal, never auto-select, cart unchanged.
   */
  const handleBarcodeScan = useCallback(async (barcodeToLookup: string) => {
    const clean = barcodeToLookup.trim();
    if (!clean) return;

    setSearchError(null);
    const outcome = await runCheckoutBoundTask(requestBoundary.current, () => resolveBarcodeScan(pharmacyId, clean));
    if (!outcome.accepted) return;
    if ('error' in outcome) {
      setSearchError(outcome.error instanceof Error ? outcome.error.message : 'Error resolving barcode scan');
      return;
    }
    const resolution = outcome.value;

    if (resolution.type === 'NO_MATCH') {
        setSearchError(`No product found with barcode "${clean}". Cart unchanged.`);
      } else if (resolution.type === 'SINGLE_INACTIVE') {
        const prod = resolution.product;
        setSearchError(`Product "${prod?.name || 'Selected product'}" is INACTIVE and cannot be sold. Cart unchanged.`);
      } else if (resolution.type === 'SINGLE_ACTIVE') {
        if (resolution.product) {
          const added = await runCheckoutBoundTask(requestBoundary.current, () => onAddToCart(resolution.product!.id));
          if (added.accepted && 'value' in added) setQuery('');
        }
      } else if (resolution.type === 'MULTIPLE_MATCHES') {
        // Collision detected: do NOT touch cart; require manual operator selection
        setScannedBarcode(clean);
        setDuplicateMatches(resolution.matches);
        setIsDuplicateModalOpen(true);
    }
  }, [pharmacyId, onAddToCart]);

  const handleSelectDuplicateProduct = async (product: LocalProduct) => {
    setIsDuplicateModalOpen(false);
    setDuplicateMatches([]);
    setScannedBarcode('');
    const outcome = await runCheckoutBoundTask(requestBoundary.current, () => onAddToCart(product.id));
    if (!outcome.accepted) return;
    if ('error' in outcome) setSearchError(outcome.error instanceof Error ? outcome.error.message : 'Failed to add product to cart');
    else setQuery('');
  };

  const handleCloseDuplicateModal = () => {
    // Explicit cancellation: Cart remains 100% unchanged
    setIsDuplicateModalOpen(false);
    setDuplicateMatches([]);
    setScannedBarcode('');
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-xl">
      {/* Search Input and Filters */}
      <div className="mb-4 space-y-3">
        <div className="relative flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && query.trim()) {
                  e.preventDefault();
                  if (activeFilter === 'BARCODE' || /^[0-9A-Za-z-]{5,}$/.test(query.trim())) {
                    handleBarcodeScan(query);
                  }
                }
              }}
              placeholder="Search by product name, generic name, SKU, or barcode..."
              className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition"
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300 px-1 py-0.5 rounded bg-slate-800 cursor-pointer"
                title="Clear search"
              >
                Clear
              </button>
            )}
          </div>

          {/* Quick Scan Action Button */}
          <button
            type="button"
            onClick={() => handleBarcodeScan(query)}
            disabled={!query.trim() || isAddingProduct}
            className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition cursor-pointer disabled:cursor-not-allowed shrink-0"
            title="Scan or lookup barcode directly with fail-safe duplicate resolution"
          >
            <Barcode className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Scan Barcode</span>
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <span className="text-slate-500 text-[11px] uppercase tracking-wider font-semibold">Filter:</span>
          <button
            type="button"
            onClick={() => setActiveFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
              activeFilter === 'ALL'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            All Fields
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('SKU')}
            className={`px-2.5 py-1 rounded-lg font-medium transition flex items-center gap-1 cursor-pointer ${
              activeFilter === 'SKU'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Tag className="w-3 h-3" />
            <span>SKU Only</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('BARCODE')}
            className={`px-2.5 py-1 rounded-lg font-medium transition flex items-center gap-1 cursor-pointer ${
              activeFilter === 'BARCODE'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Barcode className="w-3 h-3" />
            <span>Barcode Only</span>
          </button>
        </div>
      </div>

      {/* Advisory Barcode Duplicate In Search Results Notice */}
      {activeFilter === 'BARCODE' && products.length > 1 && (
        <div className="p-3 mb-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            Multiple products share barcode "{query}". Inspect items carefully before adding to the cart.
          </span>
        </div>
      )}

      {/* Search Error Notice */}
      {searchError && (
        <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{searchError}</span>
        </div>
      )}

      {/* Product Results List */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 min-h-[300px] max-h-[600px]">
        {isLoading ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
            <span className="text-xs">Querying local inventory snapshot...</span>
          </div>
        ) : products.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center p-6 rounded-xl border border-dashed border-slate-800 text-slate-400">
            <PackageX className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-sm font-medium text-slate-300">
              {query ? 'No matching products found' : 'Local product catalog is empty'}
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs">
              {query
                ? 'Try searching with a different name, SKU, or barcode.'
                : 'Ingest an inventory snapshot or ensure local products are synchronized for this pharmacy.'}
            </p>
          </div>
        ) : (
          products.map((product) => {
            const isInactive = product.status?.toUpperCase() === 'INACTIVE';

            return (
              <div
                key={product.id}
                className={`p-3.5 rounded-xl border transition flex items-center justify-between gap-3 ${
                  isInactive
                    ? 'bg-slate-950/40 border-slate-900 opacity-60'
                    : 'bg-slate-950/80 border-slate-800/80 hover:border-emerald-500/40 hover:bg-slate-900/80'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white truncate">
                      {product.name}
                    </span>
                    {isInactive && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        INACTIVE
                      </span>
                    )}
                    {product.category && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-900 text-slate-400 border border-slate-800">
                        {product.category}
                      </span>
                    )}
                  </div>

                  {product.generic_name && (
                    <div className="text-xs text-slate-400 italic truncate mt-0.5">
                      {product.generic_name}
                    </div>
                  )}

                  {/* Metadata Row: SKU, Barcode & Read-Model Stock Notice */}
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500 flex-wrap">
                    {product.sku && (
                      <span className="font-mono flex items-center gap-1">
                        <Tag className="w-2.5 h-2.5" />
                        <span>SKU: {product.sku}</span>
                      </span>
                    )}
                    {product.barcode && (
                      <span className="font-mono flex items-center gap-1">
                        <Barcode className="w-2.5 h-2.5" />
                        <span>{product.barcode}</span>
                      </span>
                    )}
                    {/* Non-Authoritative Projected Stock Disclaimer */}
                    <span className="text-slate-400 text-[10px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                      Local stock: projected • may have changed
                    </span>
                  </div>
                </div>

                {/* Right: Selling Price and Add Button */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <div className="text-sm font-bold text-emerald-400 font-mono">
                      {formatMinorUnits(product.selling_price, currency)}
                    </div>
                    <div className="text-[10px] text-slate-500">Unit Price</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onAddToCart(product.id)}
                    disabled={isInactive || isAddingProduct}
                    className="p-2 sm:px-3 sm:py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-40 disabled:hover:bg-emerald-500 text-slate-950 font-semibold text-xs flex items-center gap-1 shadow-md shadow-emerald-500/20 transition cursor-pointer disabled:cursor-not-allowed"
                    title={isInactive ? 'Product is inactive and cannot be sold' : 'Add to sale cart'}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Add</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info Notice */}
      <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-emerald-400" />
          <span>Local FEFO batch auto-selected upon adding</span>
        </span>
        <span>Showing {products.length} products</span>
      </div>

      {/* Barcode Multi-Match Disambiguation Modal */}
      <BarcodeDuplicateModal
        isOpen={isDuplicateModalOpen}
        barcode={scannedBarcode}
        matches={duplicateMatches}
        currency={currency}
        onSelectProduct={handleSelectDuplicateProduct}
        onClose={handleCloseDuplicateModal}
      />
    </div>
  );
};
