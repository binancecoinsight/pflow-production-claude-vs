import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  HistoricalSale, 
  getUnifiedSalesHistory, 
  getHistoricalSaleById 
} from '../../lib/sales/history';
import { isOnline, subscribeToNetworkStatus } from '../../lib/offline/network';
import { supabase } from '../../lib/supabase';
import { getProductById } from '../../lib/inventory/index';
import { SalesHeader } from './SalesHeader';
import { SalesList } from './SalesList';
import { SaleDetailModal } from './SaleDetailModal';
import { ReturnModal } from './ReturnModal';
import { ReceiptModal } from './ReceiptModal';
import { buildReceiptFromHistoricalSale, ReceiptData } from '../../lib/sales/receipt';
import { Lock, AlertTriangle, CheckCircle2 } from 'lucide-react';

export const SalesView: React.FC = () => {
  const { user, pharmacy, branch, role } = useAuth();

  // Network Connectivity State
  const [onlineStatus, setOnlineStatus] = useState<boolean>(isOnline());

  // Sales History State
  const [sales, setSales] = useState<HistoricalSale[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Selected Sale for Detailed Inspection & Return Initiation
  const [selectedSale, setSelectedSale] = useState<HistoricalSale | null>(null);
  const [saleForReturn, setSaleForReturn] = useState<HistoricalSale | null>(null);
  const [receiptToView, setReceiptToView] = useState<ReceiptData | null>(null);

  // Active Pharmacy Guard Ref (Tenant Boundary)
  const activePharmacyIdRef = useRef<string | null>(null);

  // 1. Subscribe to network connectivity changes
  useEffect(() => {
    const unsubscribe = subscribeToNetworkStatus((online) => {
      setOnlineStatus(online);
    });
    return () => unsubscribe();
  }, []);

  // 2. Load Sales History for Active Pharmacy
  const loadSales = useCallback(async (pharmacyId: string, currentUserId: string, userRole: string | null) => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const result = await getUnifiedSalesHistory(
        supabase,
        pharmacyId,
        currentUserId,
        userRole,
        { limit: 100 }
      );

      // Verify active tenant has not changed mid-fetch
      if (activePharmacyIdRef.current === pharmacyId) {
        setSales(result.sales);
        if (result.error && !result.isOffline) {
          setErrorMessage(`Notice: ${result.error}`);
        }
      }
    } catch (err: unknown) {
      console.error('[SalesView] Failed to load transactions:', err);
      if (activePharmacyIdRef.current === pharmacyId) {
        setErrorMessage('Failed to load transaction history.');
      }
    } finally {
      if (activePharmacyIdRef.current === pharmacyId) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  // 3. Tenant Boundary Reset & Initial Load on Pharmacy Switch
  useEffect(() => {
    if (!pharmacy?.id || !user?.id) {
      setSales([]);
      setSelectedSale(null);
      activePharmacyIdRef.current = null;
      return;
    }

    // Tenant Switch Guard: Immediately wipe previous tenant's state
    if (activePharmacyIdRef.current !== pharmacy.id) {
      activePharmacyIdRef.current = pharmacy.id;
      setSales([]);
      setSelectedSale(null);
      setSearchQuery('');
      setErrorMessage(null);
    }

    loadSales(pharmacy.id, user.id, role);
  }, [pharmacy?.id, user?.id, role, loadSales]);

  // 4. Refresh Trigger
  const handleRefresh = useCallback(() => {
    if (!pharmacy?.id || !user?.id) return;
    setIsRefreshing(true);
    loadSales(pharmacy.id, user.id, role);
  }, [pharmacy?.id, user?.id, role, loadSales]);

  // 5. Select Sale and Enrich Line Items with Product Names
  const handleSelectSale = useCallback(async (sale: HistoricalSale) => {
    if (!pharmacy?.id) return;

    // Check if line items need product name enrichment from local catalog
    const enrichedLineItems = await Promise.all(
      sale.line_items.map(async (li) => {
        if (!li.product_name) {
          try {
            const prod = await getProductById(pharmacy.id, li.product_id);
            if (prod) {
              return { ...li, product_name: prod.name };
            }
          } catch {
            // Ignore enrichment failures gracefully
          }
        }
        return li;
      })
    );

    setSelectedSale({
      ...sale,
      line_items: enrichedLineItems
    });
  }, [pharmacy?.id]);

  // Count pending local transactions
  const pendingCount = sales.filter((s) => s.provenance === 'LOCAL_PENDING').length;

  // Guard: No Active Pharmacy Selected
  if (!pharmacy || !user) {
    return (
      <div className="p-12 text-center text-slate-400">
        <Lock className="w-8 h-8 text-amber-500 mx-auto mb-3" />
        <h2 className="text-sm font-semibold text-white">No Pharmacy Tenant Selected</h2>
        <p className="text-xs text-slate-400 mt-1">
          Select an authorized pharmacy to view transaction history.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Top Header with Context, Role Scoping & Sync Status */}
      <SalesHeader
        pharmacyName={pharmacy.name}
        currency={pharmacy.currency || 'NGN'}
        isOnline={onlineStatus}
        role={role}
        pendingCount={pendingCount}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
      />

      {/* Success Alert */}
      {successMessage && (
        <div className="mb-5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-xs text-emerald-400 hover:text-emerald-200 cursor-pointer font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Error / Warning Alert */}
      {errorMessage && (
        <div className="mb-5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-xs text-amber-400 hover:text-amber-200 cursor-pointer font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Transactions List */}
      <SalesList
        sales={sales}
        selectedSaleId={selectedSale?.id || null}
        onSelectSale={handleSelectSale}
        currency={pharmacy.currency || 'NGN'}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isLoading={isLoading}
        onRefresh={handleRefresh}
      />

      {/* Sale Detail Modal */}
      {selectedSale && (
        <SaleDetailModal
          sale={selectedSale}
          currency={pharmacy.currency || 'NGN'}
          role={role}
          onClose={() => setSelectedSale(null)}
          onInitiateReturn={() => {
            setSaleForReturn(selectedSale);
            setSelectedSale(null);
          }}
          onViewReceipt={() => {
            if (selectedSale) {
              const r = buildReceiptFromHistoricalSale(
                selectedSale,
                pharmacy,
                branch
              );
              setReceiptToView(r);
              setSelectedSale(null);
            }
          }}
        />
      )}

      {/* Return & Refund Modal */}
      {saleForReturn && (
        <ReturnModal
          sale={saleForReturn}
          currency={pharmacy.currency || 'NGN'}
          onClose={() => setSaleForReturn(null)}
          onSuccess={(info) => {
            if (info?.offlineQueued) {
              setSuccessMessage(`Return for Sale #${saleForReturn.id.slice(0, 8)} queued offline. It will synchronize securely when online.`);
            } else {
              setSuccessMessage(`Return for Sale #${saleForReturn.id.slice(0, 8)} successfully authorized and committed.`);
            }
            handleRefresh();
          }}
        />
      )}

      {/* Customer Receipt Modal */}
      {receiptToView && (
        <ReceiptModal
          receipt={receiptToView}
          onClose={() => setReceiptToView(null)}
        />
      )}
    </div>
  );
};
