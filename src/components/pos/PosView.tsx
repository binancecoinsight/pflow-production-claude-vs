import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  createCartFromSession,
  addItemToCart,
  updateCartItemQuantity,
  removeCartItem,
  clearCart,
  finalizePosSale,
  checkCatalogFreshness,
  PosCart,
  FinalizeSaleResult,
  CatalogFreshnessStatus
} from '../../lib/pos/index';
import { refreshInventorySnapshot } from '../../lib/inventory/index';
import { supabase } from '../../lib/supabase';
import { PaymentMethod } from '../../lib/sales/types';
import { isOnline, subscribeToNetworkStatus } from '../../lib/offline/network';
import { PosHeader } from './PosHeader';
import { ProductSearch } from './ProductSearch';
import { CartPanel } from './CartPanel';
import { SaleSuccessModal } from './SaleSuccessModal';
import { ReceiptModal } from '../sales/ReceiptModal';
import { buildReceiptFromPosSale, ReceiptData } from '../../lib/sales/receipt';
import { Customer } from '../../lib/customers/index';
import { formatMinorUnits } from './formatters';
import { AlertTriangle, Lock } from 'lucide-react';

export const PosView: React.FC = () => {
  const { user, profile, pharmacy, branch } = useAuth();

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

  // POS In-Memory Cart State
  const [cart, setCart] = useState<PosCart | null>(null);
  const [isAddingProduct, setIsAddingProduct] = useState<boolean>(false);
  const [isFinalizing, setIsFinalizing] = useState<boolean>(false);
  const [isSyncingCatalog, setIsSyncingCatalog] = useState<boolean>(false);
  const [catalogSyncKey, setCatalogSyncKey] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Success Modal State
  const [completedSale, setCompletedSale] = useState<FinalizeSaleResult | null>(null);
  const [lastCustomer, setLastCustomer] = useState<Customer | null>(null);
  const [receiptToView, setReceiptToView] = useState<ReceiptData | null>(null);

  // Ref tracking current active pharmacy to enforce tenant boundary isolation
  const activePharmacyIdRef = useRef<string | null>(null);

  // 1. Subscribe to network status changes
  useEffect(() => {
    const unsubscribe = subscribeToNetworkStatus((online) => {
      setOnlineStatus(online);
    });
    return () => unsubscribe();
  }, []);

  // 2. Refresh Catalog snapshot from authoritative server
  const handleSyncCatalog = useCallback(async () => {
    if (!pharmacy?.id || isSyncingCatalog) return;
    setIsSyncingCatalog(true);
    setErrorMessage(null);

    try {
      const result = await refreshInventorySnapshot(supabase, pharmacy.id);
      if (result.success) {
        const updatedFreshness = await checkCatalogFreshness(pharmacy.id);
        setFreshness(updatedFreshness);
        setCatalogSyncKey((k) => k + 1);
      } else if (result.status === 'AUTH_REQUIRED') {
        setErrorMessage('Authentication session expired: please sign in again.');
      } else if (result.status === 'FORBIDDEN') {
        setErrorMessage('Access denied: not an active member of this pharmacy.');
      } else if (result.status === 'OFFLINE') {
        setErrorMessage('Cannot refresh catalog: network is offline.');
      } else if (result.status !== 'ALREADY_CURRENT') {
        setErrorMessage(result.error || 'Failed to refresh catalog');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error syncing catalog';
      setErrorMessage(message);
    } finally {
      setIsSyncingCatalog(false);
    }
  }, [pharmacy?.id, isSyncingCatalog]);

  // 2. Initialize or re-initialize Cart on Pharmacy / Branch / User change
  useEffect(() => {
    if (!user?.id || !pharmacy?.id) {
      setCart(null);
      return;
    }

    // Invalidate cart if pharmacy has changed (Tenant Safety Invariant)
    if (activePharmacyIdRef.current && activePharmacyIdRef.current !== pharmacy.id) {
      setErrorMessage('Switched pharmacy tenant: previous cart was securely cleared.');
    }
    activePharmacyIdRef.current = pharmacy.id;

    try {
      const initialCart = createCartFromSession({
        user: { id: user.id },
        pharmacy: { id: pharmacy.id },
        branch: branch ? { id: branch.id } : null
      }, pharmacy.currency || 'NGN');

      setCart(initialCart);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to initialize POS cart';
      setErrorMessage(message);
    }

    // Load Catalog Freshness
    checkCatalogFreshness(pharmacy.id)
      .then((status) => setFreshness(status))
      .catch(() => {
        // Silently tolerate if offline or fresh installation
      });
  }, [user?.id, pharmacy?.id, branch?.id, pharmacy?.currency]);

  // 3. Add Product to Cart using Phase 5D-5 Orchestration
  const handleAddToCart = useCallback(async (productId: string) => {
    if (!cart) return;
    setIsAddingProduct(true);
    setErrorMessage(null);

    try {
      const updatedCart = await addItemToCart(cart, { product_id: productId });
      setCart(updatedCart);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add item to cart';
      setErrorMessage(message);
    } finally {
      setIsAddingProduct(false);
    }
  }, [cart]);

  // 4. Update Quantity using Phase 5D-5 Cart Engine
  const handleUpdateQuantity = useCallback((lineId: string, quantity: number) => {
    if (!cart) return;
    setErrorMessage(null);

    try {
      const updatedCart = updateCartItemQuantity(cart, lineId, quantity);
      setCart(updatedCart);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid quantity value';
      setErrorMessage(message);
    }
  }, [cart]);

  // 5. Remove Item from Cart
  const handleRemoveItem = useCallback((lineId: string) => {
    if (!cart) return;
    setErrorMessage(null);
    const updatedCart = removeCartItem(cart, lineId);
    setCart(updatedCart);
  }, [cart]);

  // 6. Clear Cart
  const handleClearCart = useCallback(() => {
    if (!cart) return;
    setErrorMessage(null);
    const cleared = clearCart(cart);
    setCart(cleared);
  }, [cart]);

  // 7. Complete Sale Flow with Double-Submission Protection
  const handleFinalizeSale = useCallback(async (
    paymentMethod: PaymentMethod,
    customer?: Customer | null,
    amountTendered?: number
  ) => {
    if (!cart || !user?.id) return;
    if (isFinalizing) return; // Prevent double click

    setIsFinalizing(true);
    setErrorMessage(null);
    setLastCustomer(customer || null);

    try {
      const result = await finalizePosSale(cart, {
        payment_method: paymentMethod,
        amount_tendered: amountTendered,
        authenticated_user_id: user.id,
        customer_id: customer?.id || null
      });

      if (!result.success) {
        const errorText = result.errors && result.errors.length > 0
          ? result.errors.join('. ')
          : 'Failed to record sale';
        setErrorMessage(errorText);
        return;
      }

      // Sale committed locally and queued!
      setCompletedSale(result);

      // Reset cart for next customer
      const freshCart = clearCart(cart);
      setCart(freshCart);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unexpected error during sale finalization';
      setErrorMessage(message);
    } finally {
      setIsFinalizing(false);
    }
  }, [cart, user?.id, isFinalizing]);

  // Guard: Context Not Ready
  if (!user || !pharmacy) {
    return (
      <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl max-w-md mx-auto my-12">
        <Lock className="w-8 h-8 text-amber-400 mx-auto mb-3" />
        <h2 className="text-base font-bold text-white mb-1">POS Authentication Required</h2>
        <p className="text-xs text-slate-400">
          An active authenticated user and verified pharmacy selection are required to operate the point of sale.
        </p>
      </div>
    );
  }

  // Guard: Cart Initializing
  if (!cart) {
    return (
      <div className="p-12 text-center text-slate-400">
        <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin mx-auto mb-3" />
        <span className="text-xs">Initializing local POS transaction context...</span>
      </div>
    );
  }

  const totalItems = cart.line_items.reduce((acc, li) => acc + li.quantity, 0);

  return (
    <div className="w-full">
      {/* POS Top Header */}
      <PosHeader
        pharmacyName={pharmacy.name}
        branchName={branch?.name || 'Main Branch'}
        cashierName={profile?.full_name || user.email || 'Cashier'}
        cashierEmail={user.email}
        isOnline={onlineStatus}
        catalogFreshness={freshness}
        cartItemsCount={totalItems}
        cartTotalFormatted={formatMinorUnits(cart.total, cart.currency)}
        onSyncCatalog={handleSyncCatalog}
        isSyncingCatalog={isSyncingCatalog}
      />

      {/* Main Dual-Column POS Viewport */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Product Search & Catalog (7 cols on large displays) */}
        <div className="lg:col-span-7">
          <ProductSearch
            key={catalogSyncKey}
            pharmacyId={pharmacy.id}
            currency={cart.currency}
            onAddToCart={handleAddToCart}
            isAddingProduct={isAddingProduct}
          />
        </div>

        {/* Right Column: Cart Panel & Payment (5 cols on large displays) */}
        <div className="lg:col-span-5 sticky top-20">
          <CartPanel
            cart={cart}
            onUpdateQuantity={handleUpdateQuantity}
            onRemoveItem={handleRemoveItem}
            onClearCart={handleClearCart}
            onFinalizeSale={handleFinalizeSale}
            isFinalizing={isFinalizing}
            errorMessage={errorMessage}
            onClearError={() => setErrorMessage(null)}
            pharmacyId={pharmacy.id}
          />
        </div>
      </div>

      {/* Completed Sale Success Receipt Modal */}
      {completedSale && completedSale.sale && (
        <SaleSuccessModal
          sale={completedSale.sale}
          transaction={completedSale.transaction}
          queueItem={completedSale.queueItem}
          onClose={() => setCompletedSale(null)}
          onViewReceipt={() => {
            if (completedSale.sale && pharmacy) {
              const receipt = buildReceiptFromPosSale(
                completedSale.sale,
                pharmacy,
                branch,
                profile?.full_name || user.email || 'Cashier',
                undefined,
                lastCustomer ? { id: lastCustomer.id, name: lastCustomer.name, phone: lastCustomer.phone } : null
              );
              setReceiptToView(receipt);
            }
          }}
        />
      )}

      {/* Customer Receipt Modal */}
      {receiptToView && (
        <ReceiptModal
          receipt={receiptToView}
          onClose={() => setReceiptToView(null)}
          onNewSale={() => {
            setReceiptToView(null);
            setCompletedSale(null);
            handleClearCart();
          }}
        />
      )}
    </div>
  );
};
