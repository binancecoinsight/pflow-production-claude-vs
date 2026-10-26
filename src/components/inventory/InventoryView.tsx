import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  LocalProduct, 
  LocalBatch, 
  BatchExpiryInfo 
} from '../../lib/inventory/types';
import { 
  listLocalProducts, 
  searchProducts, 
  getBatchesForProduct, 
  getEligibleBatchesForProduct, 
  refreshInventorySnapshot
} from '../../lib/inventory/index';
import { checkCatalogFreshness } from '../../lib/pos/index';
import { CatalogFreshnessStatus } from '../../lib/pos/types';
import { isOnline, subscribeToNetworkStatus } from '../../lib/offline/network';
import { supabase } from '../../lib/supabase';
import { InventoryHeader } from './InventoryHeader';
import { ProductList } from './ProductList';
import { ProductDetailModal } from './ProductDetailModal';
import { StockIntakeModal } from './StockIntakeModal';
import { StockAdjustmentModal } from './StockAdjustmentModal';
import { StockTransferDispatchModal } from './StockTransferDispatchModal';
import { StockTransferDetailModal } from './StockTransferDetailModal';
import { StockTransferReceiveModal } from './StockTransferReceiveModal';
import { StockTransfersTab } from './StockTransfersTab';
import { fetchBranches, setProductStatus } from '../../lib/inventory/service';
import { StockTransferWithBranches } from '../../lib/inventory/types';
import { ProductFormModal } from './ProductFormModal';
import { AlertTriangle, Lock, ShieldCheck, ArrowRightLeft, Package } from 'lucide-react';

/**
 * Checks whether user has permission to manage product master catalog (Phase 5D-22).
 * Strictly restricted to management, owners, and clinical pharmacists (inventory.write).
 * CASHIER role is prohibited.
 */
export const canManageCatalog = (role: string | null | undefined, permissions: string[] = []): boolean => {
  if (!role) return false;
  if (role === 'OWNER' || role === 'MANAGER' || role === 'PHARMACIST') return true;
  return permissions.includes('inventory.write');
};

/**
 * Checks whether user has permission to inspect cost prices.
 * Strictly restricted to management, owners, and clinical pharmacists.
 */
export const canViewCostPrice = (role: string | null | undefined, permissions: string[] = []): boolean => {
  if (!role) return false;
  if (role === 'OWNER' || role === 'MANAGER' || role === 'PHARMACIST') return true;
  return (
    permissions.includes('inventory.write') ||
    permissions.includes('purchases.manage') ||
    permissions.includes('reports.financial') ||
    permissions.includes('inventory.adjust')
  );
};

/**
 * Checks whether user has permission to perform authoritative stock intake.
 * Strictly restricted to management, owners, and clinical pharmacists (inventory.write / purchases.manage).
 * CASHIER role is prohibited.
 */
export const canPerformStockIntake = (role: string | null | undefined, permissions: string[] = []): boolean => {
  if (!role) return false;
  if (role === 'OWNER' || role === 'MANAGER' || role === 'PHARMACIST') return true;
  return (
    permissions.includes('inventory.write') ||
    permissions.includes('purchases.manage')
  );
};

/**
 * Checks whether user has permission to perform authoritative stock adjustments (Phase 5D-16).
 * Restricted to management, owners, and pharmacists (inventory.adjust).
 * CASHIER role is strictly prohibited.
 */
export const canAdjustInventory = (role: string | null | undefined, permissions: string[] = []): boolean => {
  if (!role) return false;
  if (role === 'OWNER' || role === 'MANAGER' || role === 'PHARMACIST') return true;
  return permissions.includes('inventory.adjust');
};

/**
 * Checks whether user has permission to perform authoritative stock transfers (Phase 5D-17).
 * Dispatch requires inventory.adjust; receive requires inventory.write.
 * OWNER, MANAGER, and PHARMACIST are permitted; CASHIER role is strictly prohibited.
 */
export const canTransferStock = (role: string | null | undefined, permissions: string[] = []): boolean => {
  if (!role) return false;
  if (role === 'OWNER' || role === 'MANAGER' || role === 'PHARMACIST') return true;
  return permissions.includes('inventory.adjust') || permissions.includes('inventory.write');
};

export const InventoryView: React.FC<{ mutationsAllowed?: boolean }> = ({ mutationsAllowed = true }) => {
  const { user, profile, pharmacy, branch, membership, role, permissions } = useAuth();

  // Network Connectivity State
  const [onlineStatus, setOnlineStatus] = useState<boolean>(isOnline());

  // Catalog Freshness State
  const [freshness, setFreshness] = useState<CatalogFreshnessStatus>({
    isStale: false,
    syncedAt: null,
    sourceUpdatedAt: null,
    productCount: 0,
    batchCount: 0
  });

  // Local Read-Model Inventory State
  const [products, setProducts] = useState<LocalProduct[]>([]);
  const [batchesMap, setBatchesMap] = useState<Record<string, LocalBatch[]>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);

  // Selected Product & Batch Inspector Modal
  const [selectedProduct, setSelectedProduct] = useState<LocalProduct | null>(null);
  const [selectedBatches, setSelectedBatches] = useState<Array<LocalBatch & { expiry: BatchExpiryInfo }>>([]);
  const [isLoadingBatches, setIsLoadingBatches] = useState<boolean>(false);

  // Authoritative Stock Intake Modal (Phase 5D-15)
  const [isStockIntakeOpen, setIsStockIntakeOpen] = useState<boolean>(false);

  // Authoritative Stock Adjustment Modal (Phase 5D-16)
  const [isStockAdjustmentOpen, setIsStockAdjustmentOpen] = useState<boolean>(false);
  const [adjustmentTarget, setAdjustmentTarget] = useState<{ productId?: string; batchId?: string } | null>(null);

  // Authoritative Stock Transfers (Phase 5D-18)
  const [activeTab, setActiveTab] = useState<'catalog' | 'transfers'>('catalog');
  const [branches, setBranches] = useState<Array<{ id: string; name: string; is_main?: boolean }>>([]);
  const [isStockTransferDispatchOpen, setIsStockTransferDispatchOpen] = useState<boolean>(false);
  const [selectedTransferForDetail, setSelectedTransferForDetail] = useState<StockTransferWithBranches | null>(null);
  const [selectedTransferForReceive, setSelectedTransferForReceive] = useState<StockTransferWithBranches | null>(null);

  // Master Product Catalog Form Modal (Phase 5D-22)
  const [isProductFormOpen, setIsProductFormOpen] = useState<boolean>(false);
  const [productToEdit, setProductToEdit] = useState<LocalProduct | null>(null);
  const [isTogglingStatus, setIsTogglingStatus] = useState<boolean>(false);

  // Active Pharmacy Guard Ref
  const activePharmacyIdRef = useRef<string | null>(null);

  // Load pharmacy branches for transfer route selection
  useEffect(() => {
    if (!pharmacy?.id) {
      setBranches([]);
      return;
    }
    fetchBranches(pharmacy.id).then((b) => setBranches(b));
  }, [pharmacy?.id]);

  // 1. Subscribe to network status changes
  useEffect(() => {
    const unsubscribe = subscribeToNetworkStatus((online) => {
      setOnlineStatus(online);
    });
    return () => unsubscribe();
  }, []);

  // 2. Load Local Inventory Read Model for Active Pharmacy
  const loadLocalCatalog = useCallback(async (pharmacyId: string, query: string = '') => {
    try {
      setIsLoading(true);
      let prods: LocalProduct[] = [];
      if (query.trim()) {
        prods = await searchProducts(pharmacyId, query.trim(), 100);
      } else {
        prods = await listLocalProducts(pharmacyId, 200);
      }

      // Fetch batch mappings for displayed products
      const newBatchesMap: Record<string, LocalBatch[]> = {};
      await Promise.all(
        prods.map(async (p) => {
          const b = await getBatchesForProduct(pharmacyId, p.id);
          newBatchesMap[p.id] = b;
        })
      );

      // Verify tenant has not changed mid-query
      if (activePharmacyIdRef.current === pharmacyId) {
        setProducts(prods);
        setBatchesMap(newBatchesMap);
      }

      // Update Freshness
      const fresh = await checkCatalogFreshness(pharmacyId);
      if (activePharmacyIdRef.current === pharmacyId) {
        setFreshness(fresh);
      }
    } catch (err: unknown) {
      console.error('[InventoryView] Failed to load local read model:', err);
    } finally {
      if (activePharmacyIdRef.current === pharmacyId) {
        setIsLoading(false);
      }
    }
  }, []);

  // 3. Tenant Boundary Reset & Initial Load on Pharmacy Change
  useEffect(() => {
    if (!pharmacy?.id) {
      setProducts([]);
      setBatchesMap({});
      setSelectedProduct(null);
      setSelectedBatches([]);
      activePharmacyIdRef.current = null;
      return;
    }

    // Tenant Switch Guard: Clear previous pharmacy state immediately
    if (activePharmacyIdRef.current !== pharmacy.id) {
      activePharmacyIdRef.current = pharmacy.id;
      setProducts([]);
      setBatchesMap({});
      setSelectedProduct(null);
      setSelectedBatches([]);
      setSearchQuery('');
      setSyncErrorMessage(null);
    }

    loadLocalCatalog(pharmacy.id, searchQuery);
  }, [pharmacy?.id, loadLocalCatalog]);

  // 4. Handle Search Query Changes (Debounced locally without server trips)
  useEffect(() => {
    if (!pharmacy?.id) return;
    const timer = setTimeout(() => {
      loadLocalCatalog(pharmacy.id, searchQuery);
    }, 150);

    return () => clearTimeout(timer);
  }, [searchQuery, pharmacy?.id, loadLocalCatalog]);

  // 5. Authoritative Snapshot Synchronization Handler
  const handleSync = useCallback(async () => {
    if (!pharmacy?.id || isSyncing) return;
    setIsSyncing(true);
    setSyncErrorMessage(null);

    try {
      const result = await refreshInventorySnapshot(supabase, pharmacy.id);
      if (result.success) {
        // Reload local read model after atomic ingestion
        await loadLocalCatalog(pharmacy.id, searchQuery);
      } else if (result.status === 'AUTH_REQUIRED') {
        setSyncErrorMessage('Session expired: please sign in again to download inventory.');
      } else if (result.status === 'FORBIDDEN') {
        setSyncErrorMessage('Access denied: not an active member of this pharmacy.');
      } else if (result.status === 'OFFLINE') {
        setSyncErrorMessage('Cannot synchronize: network connection is unavailable.');
      } else if (result.status === 'STALE_REJECTED') {
        setSyncErrorMessage('Server returned an older snapshot than current local cache; update skipped.');
      } else if (result.status === 'SUSPICIOUS_EMPTY') {
        setSyncErrorMessage('Server returned zero products unexpectedly; local catalog preserved.');
      } else if (result.status !== 'ALREADY_CURRENT') {
        setSyncErrorMessage(result.error || 'Failed to refresh catalog snapshot.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error syncing catalog';
      setSyncErrorMessage(msg);
    } finally {
      setIsSyncing(false);
    }
  }, [pharmacy?.id, isSyncing, loadLocalCatalog, searchQuery]);

  // 6. Inspect Product Batches Handler
  const handleSelectProduct = useCallback(async (product: LocalProduct) => {
    if (!pharmacy?.id) return;
    setSelectedProduct(product);
    setIsLoadingBatches(true);

    try {
      const evaluatedBatches = await getEligibleBatchesForProduct(pharmacy.id, product.id, { allowExpired: true });
      // Sort batches by earliest expiry date first
      evaluatedBatches.sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
      setSelectedBatches(evaluatedBatches);
    } catch (err: unknown) {
      console.error('[InventoryView] Error reading batches:', err);
      setSelectedBatches([]);
    } finally {
      setIsLoadingBatches(false);
    }
  }, [pharmacy?.id]);

  // Permission: Cost Price Visibility & Stock Operations Authorization
  const canSeeCostPrice = canViewCostPrice(role, permissions);
  const canReceiveStock = mutationsAllowed && canPerformStockIntake(role, permissions);
  const canAdjustStock = mutationsAllowed && canAdjustInventory(role, permissions);
  const canTransfer = mutationsAllowed && canTransferStock(role, permissions);
  const canManage = mutationsAllowed && canManageCatalog(role, permissions);

  useEffect(() => {
    if (mutationsAllowed) return;
    setIsStockIntakeOpen(false);
    setIsStockAdjustmentOpen(false);
    setIsStockTransferDispatchOpen(false);
    setSelectedTransferForReceive(null);
    setIsProductFormOpen(false);
    setProductToEdit(null);
    setActiveTab('catalog');
  }, [mutationsAllowed]);

  // Master Product Catalog Form Handlers (Phase 5D-22)
  const handleOpenCreateProduct = useCallback(() => {
    if (!mutationsAllowed) return;
    setProductToEdit(null);
    setIsProductFormOpen(true);
  }, [mutationsAllowed]);

  const handleOpenEditProduct = useCallback((prod: LocalProduct) => {
    if (!mutationsAllowed) return;
    setProductToEdit(prod);
    setIsProductFormOpen(true);
  }, [mutationsAllowed]);

  const handleProductSaveSuccess = useCallback(async (savedProduct: LocalProduct) => {
    if (pharmacy?.id) {
      await loadLocalCatalog(pharmacy.id, searchQuery);
      if (selectedProduct && selectedProduct.id === savedProduct.id) {
        setSelectedProduct(savedProduct);
      }
    }
  }, [pharmacy?.id, loadLocalCatalog, searchQuery, selectedProduct]);

  const handleToggleProductStatus = useCallback(async (prod: LocalProduct) => {
    if (!pharmacy?.id || isTogglingStatus || !mutationsAllowed) return;
    const newStatus = prod.status?.toUpperCase() === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE';
    setIsTogglingStatus(true);
    setSyncErrorMessage(null);
    try {
      const res = await setProductStatus(supabase, pharmacy.id, prod.id, newStatus);
      if (res.success && res.product) {
        if (selectedProduct && selectedProduct.id === prod.id) {
          setSelectedProduct(res.product);
        }
        await loadLocalCatalog(pharmacy.id, searchQuery);
      } else {
        setSyncErrorMessage(res.error || 'Failed to toggle product status');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error changing product status';
      setSyncErrorMessage(msg);
    } finally {
      setIsTogglingStatus(false);
    }
  }, [pharmacy?.id, isTogglingStatus, selectedProduct, loadLocalCatalog, searchQuery, mutationsAllowed]);

  // Guard: No Active Pharmacy Selected
  if (!pharmacy || !user) {
    return (
      <div className="p-12 text-center text-slate-400">
        <Lock className="w-8 h-8 text-amber-500 mx-auto mb-3" />
        <h2 className="text-sm font-semibold text-white">No Pharmacy Tenant Selected</h2>
        <p className="text-xs text-slate-400 mt-1">
          Select an authorized pharmacy to explore local inventory read model.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {!mutationsAllowed && (
        <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200" role="status">
          Inventory remains available for authorized inspection and read-model refresh. Product, stock, transfer, intake and adjustment mutations are disabled by subscription policy.
        </div>
      )}
      {/* Top Inventory Header with Status & Sync */}
      <InventoryHeader
        pharmacyName={pharmacy.name}
        currency={pharmacy.currency || 'NGN'}
        isOnline={onlineStatus}
        catalogFreshness={freshness}
        isSyncing={isSyncing}
        onSync={handleSync}
        totalProductsCount={products.length}
        canReceiveStock={canReceiveStock}
        onOpenStockIntake={() => {
          if (mutationsAllowed) setIsStockIntakeOpen(true);
        }}
        canAdjustStock={canAdjustStock}
        onOpenStockAdjustment={() => {
          if (!mutationsAllowed) return;
          setAdjustmentTarget(null);
          setIsStockAdjustmentOpen(true);
        }}
        canTransferStock={canTransfer}
        onOpenStockTransfer={() => {
          if (mutationsAllowed) setIsStockTransferDispatchOpen(true);
        }}
        canManageCatalog={canManage}
        onOpenCreateProduct={handleOpenCreateProduct}
      />

      {/* Sync Error / Warning Banner */}
      {syncErrorMessage && (
        <div className="mb-5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{syncErrorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncErrorMessage(null)}
            className="text-xs text-amber-400 hover:text-amber-200 cursor-pointer font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* View Switcher: Catalog vs Inter-Branch Transfers (Management/Staff Only - Hidden from Cashier) */}
      {canTransfer && (
        <div className="flex items-center gap-2 mb-5">
          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className={`px-3.5 py-1.5 rounded-xl font-medium text-xs flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'catalog'
                ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Products & Batches</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('transfers')}
            className={`px-3.5 py-1.5 rounded-xl font-medium text-xs flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'transfers'
                ? 'bg-teal-600/20 text-teal-300 border border-teal-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-teal-400" />
            <span>Inter-Branch Transfers</span>
          </button>
        </div>
      )}

      {/* Main Content: Transfers Tab or Product Catalog List */}
      {activeTab === 'transfers' && canTransfer ? (
        <StockTransfersTab
          pharmacyId={pharmacy.id}
          currency={pharmacy.currency || 'NGN'}
          userRole={role || 'CASHIER'}
          userDefaultBranchId={membership?.default_branch_id || branch?.id}
          currentBranchId={branch?.id}
          branches={branches}
          canTransferStock={canTransfer}
          isOnline={onlineStatus}
          onOpenDispatch={() => {
            if (mutationsAllowed) setIsStockTransferDispatchOpen(true);
          }}
          onSelectTransferDetail={(transfer) => setSelectedTransferForDetail(transfer)}
          onOpenReceive={(transfer) => {
            if (mutationsAllowed) setSelectedTransferForReceive(transfer);
          }}
        />
      ) : (
        <ProductList
          products={products}
          selectedProductId={selectedProduct?.id || null}
          onSelectProduct={handleSelectProduct}
          currency={pharmacy.currency || 'NGN'}
          canSeeCostPrice={canSeeCostPrice}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          batchesMap={batchesMap}
          isLoading={isLoading}
          onSync={handleSync}
        />
      )}

      {/* Product Detail & Batch Inspector Modal */}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          batches={selectedBatches}
          currency={pharmacy.currency || 'NGN'}
          canSeeCostPrice={canSeeCostPrice}
          branchName={branch?.name || 'Main Branch'}
          canAdjustStock={canAdjustStock}
          onOpenStockAdjustment={(prodId, batchId) => {
            if (!mutationsAllowed) return;
            setAdjustmentTarget({ productId: prodId, batchId });
            setIsStockAdjustmentOpen(true);
          }}
          canManageCatalog={canManage}
          onEditProduct={handleOpenEditProduct}
          onToggleProductStatus={handleToggleProductStatus}
          isTogglingStatus={isTogglingStatus}
          onClose={() => {
            setSelectedProduct(null);
            setSelectedBatches([]);
          }}
        />
      )}

      {/* Authoritative Stock Intake Modal (Phase 5D-15) */}
      {mutationsAllowed && isStockIntakeOpen && (
        <StockIntakeModal
          pharmacyId={pharmacy.id}
          pharmacyName={pharmacy.name}
          currency={pharmacy.currency || 'NGN'}
          branchId={branch?.id || pharmacy.id}
          branchName={branch?.name || 'Main Branch'}
          products={products}
          batchesMap={batchesMap}
          isOnline={onlineStatus}
          onClose={() => setIsStockIntakeOpen(false)}
          onIntakeSuccess={async () => {
            await loadLocalCatalog(pharmacy.id, searchQuery);
          }}
        />
      )}

      {/* Authoritative Stock Adjustment Modal (Phase 5D-16) */}
      {mutationsAllowed && isStockAdjustmentOpen && (
        <StockAdjustmentModal
          pharmacyId={pharmacy.id}
          pharmacyName={pharmacy.name}
          currency={pharmacy.currency || 'NGN'}
          branchId={branch?.id || pharmacy.id}
          branchName={branch?.name || 'Main Branch'}
          products={products}
          batchesMap={batchesMap}
          initialProductId={adjustmentTarget?.productId || selectedProduct?.id || null}
          initialBatchId={adjustmentTarget?.batchId || null}
          isOnline={onlineStatus}
          onClose={() => {
            setIsStockAdjustmentOpen(false);
            setAdjustmentTarget(null);
          }}
          onAdjustmentSuccess={async () => {
            await loadLocalCatalog(pharmacy.id, searchQuery);
            if (selectedProduct) {
              await handleSelectProduct(selectedProduct);
            }
          }}
        />
      )}

      {/* Authoritative Stock Transfer Dispatch Modal (Phase 5D-18) */}
      {mutationsAllowed && isStockTransferDispatchOpen && (
        <StockTransferDispatchModal
          pharmacyId={pharmacy.id}
          pharmacyName={pharmacy.name}
          userRole={role || 'CASHIER'}
          userDefaultBranchId={membership?.default_branch_id || branch?.id}
          currentBranchId={branch?.id}
          branches={branches}
          products={products}
          batchesMap={batchesMap}
          isOnline={onlineStatus}
          onClose={() => setIsStockTransferDispatchOpen(false)}
          onDispatchSuccess={async () => {
            await loadLocalCatalog(pharmacy.id, searchQuery);
          }}
        />
      )}

      {/* Stock Transfer Detail Modal (Phase 5D-18) */}
      {selectedTransferForDetail && (
        <StockTransferDetailModal
          pharmacyId={pharmacy.id}
          transferSummary={selectedTransferForDetail}
          currency={pharmacy.currency || 'NGN'}
          canSeeCostPrice={canSeeCostPrice}
          userRole={role || 'CASHIER'}
          userDefaultBranchId={membership?.default_branch_id || branch?.id}
          isOnline={onlineStatus}
          onClose={() => setSelectedTransferForDetail(null)}
          onOpenReceive={(transfer) => {
            if (mutationsAllowed) setSelectedTransferForReceive(transfer);
          }}
        />
      )}

      {/* Authoritative Stock Transfer Receive Modal (Phase 5D-18) */}
      {mutationsAllowed && selectedTransferForReceive && (
        <StockTransferReceiveModal
          pharmacyId={pharmacy.id}
          transfer={selectedTransferForReceive}
          userRole={role || 'CASHIER'}
          userDefaultBranchId={membership?.default_branch_id || branch?.id}
          isOnline={onlineStatus}
          onClose={() => setSelectedTransferForReceive(null)}
          onReceiveSuccess={async () => {
            await loadLocalCatalog(pharmacy.id, searchQuery);
          }}
        />
      )}

      {/* Master Product Catalog Form Modal (Phase 5D-22) */}
      <ProductFormModal
        isOpen={mutationsAllowed && isProductFormOpen}
        pharmacyId={pharmacy.id}
        currency={pharmacy.currency || 'NGN'}
        product={productToEdit}
        onSaveSuccess={handleProductSaveSuccess}
        onClose={() => {
          setIsProductFormOpen(false);
          setProductToEdit(null);
        }}
      />
    </div>
  );
};
