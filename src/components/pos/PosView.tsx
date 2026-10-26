import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  addItemToCart,
  updateCartItemQuantity,
  removeCartItem,
  loadOrCreateDurableCart,
  loadExistingDurableCart,
  persistDurableCart,
  cancelDurableCart,
  acknowledgeDurableCart,
  finalizePosSale,
  checkCatalogFreshness,
  PosCart,
  FinalizeSaleResult,
  CatalogFreshnessStatus
} from '../../lib/pos/index';
import { capturePosScope, isPosScopeCurrent, runPosScopeBoundTask } from '../../lib/pos/scopeGuard';
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
import { getExistingDurableCheckoutSale } from '../../lib/sales/service';
import { Customer } from '../../lib/customers/index';
import { formatMinorUnits } from './formatters';
import { AlertTriangle, Lock } from 'lucide-react';

export const PosView: React.FC<{ newSaleAllowed?: boolean }> = ({ newSaleAllowed = true }) => {
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
  const [initializationFailure, setInitializationFailure] = useState<string | null>(null);
  const [initializationAttempt, setInitializationAttempt] = useState(0);

  // Success Modal State
  const [completedSale, setCompletedSale] = useState<FinalizeSaleResult | null>(null);
  const [lastCustomer, setLastCustomer] = useState<Customer | null>(null);
  const [receiptToView, setReceiptToView] = useState<ReceiptData | null>(null);
  const [recoveryRequired, setRecoveryRequired] = useState<boolean>(false);

  // Ref tracking current active pharmacy to enforce tenant boundary isolation
  const activePharmacyIdRef = useRef<string | null>(null);
  const activeScopeRef = useRef<string | null>(null);
  const scopeGenerationRef = useRef(0);

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
    const generation = scopeGenerationRef.current;
    const pharmacyId = pharmacy.id;
    const token = capturePosScope(generation, pharmacyId);
    const isCurrent = () => isPosScopeCurrent(token, scopeGenerationRef.current, activePharmacyIdRef.current);
    setIsSyncingCatalog(true);
    setErrorMessage(null);

    try {
      const result = await refreshInventorySnapshot(supabase, pharmacyId);
      if (!isCurrent()) return;
      if (result.success) {
        const updatedFreshness = await checkCatalogFreshness(pharmacyId);
        if (!isCurrent()) return;
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
      if (isCurrent()) setErrorMessage(message);
    } finally {
      if (isCurrent()) setIsSyncingCatalog(false);
    }
  }, [pharmacy?.id, isSyncingCatalog]);

  // 2. Initialize or re-initialize Cart on Pharmacy / Branch / User change
  useEffect(() => {
    const generation = ++scopeGenerationRef.current;
    setCart(null);
    setCompletedSale(null);
    setLastCustomer(null);
    setReceiptToView(null);
    setRecoveryRequired(false);
    setErrorMessage(null);
    setInitializationFailure(null);
    setIsAddingProduct(false);
    setIsFinalizing(false);
    setIsSyncingCatalog(false);
    if (!user?.id || !pharmacy?.id) {
      activeScopeRef.current = null;
      activePharmacyIdRef.current = null;
      return;
    }
    const scopeKey = [pharmacy.id, branch?.id || '00000000-0000-0000-0000-000000000000', user.id]
      .map((value) => value.toLowerCase().trim()).join(':');
    activeScopeRef.current = scopeKey;

    // Invalidate cart if pharmacy has changed (Tenant Safety Invariant)
    if (activePharmacyIdRef.current && activePharmacyIdRef.current !== pharmacy.id) {
      setErrorMessage('Switched pharmacy tenant: the previous cart was detached and any unresolved operation remains durable.');
    }
    activePharmacyIdRef.current = pharmacy.id;

    const loadCart = newSaleAllowed ? loadOrCreateDurableCart : loadExistingDurableCart;
    loadCart({
      pharmacy_id: pharmacy.id,
      branch_id: branch?.id || '00000000-0000-0000-0000-000000000000',
      cashier_id: user.id,
      authenticated_user_id: user.id,
      currency: pharmacy.currency || 'NGN'
    }).then((initialCart) => {
      if (initialCart && generation === scopeGenerationRef.current && activeScopeRef.current === initialCart.checkout_scope_key) {
        setCart(initialCart);
        setRecoveryRequired(initialCart.checkout_state === 'LOCALLY_DURABLE');
      }
    })
      .catch((err: unknown) => {
        if (generation === scopeGenerationRef.current && activeScopeRef.current === scopeKey) {
          const message = err instanceof Error ? err.message : 'Failed to initialize POS cart';
          setErrorMessage(message);
          setInitializationFailure(message);
        }
      });

    // Load Catalog Freshness
    checkCatalogFreshness(pharmacy.id)
      .then((status) => { if (generation === scopeGenerationRef.current && activeScopeRef.current === scopeKey) setFreshness(status); })
      .catch(() => {
        // Silently tolerate if offline or fresh installation
      });
    return () => { if (generation === scopeGenerationRef.current) scopeGenerationRef.current++; };
  }, [user?.id, pharmacy?.id, branch?.id, pharmacy?.currency, initializationAttempt, newSaleAllowed]);

  // 3. Add Product to Cart using Phase 5D-5 Orchestration
  const handleAddToCart = useCallback(async (productId: string) => {
    if (!cart || !newSaleAllowed) return;
    const generation = scopeGenerationRef.current;
    const scopeKey = cart.checkout_scope_key;
    const token = capturePosScope(generation, scopeKey);
    const isCurrent = () => isPosScopeCurrent(token, scopeGenerationRef.current, activeScopeRef.current);
    setIsAddingProduct(true);
    setErrorMessage(null);

    try {
      const updatedCart = await addItemToCart(cart, { product_id: productId });
      const persisted = await persistDurableCart(updatedCart);
      if (isCurrent()) setCart(persisted);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add item to cart';
      if (isCurrent()) setErrorMessage(message);
    } finally {
      if (isCurrent()) setIsAddingProduct(false);
    }
  }, [cart, newSaleAllowed]);

  // 4. Update Quantity using Phase 5D-5 Cart Engine
  const handleUpdateQuantity = useCallback(async (lineId: string, quantity: number) => {
    if (!cart || !newSaleAllowed) return;
    const generation = scopeGenerationRef.current;
    const scopeKey = cart.checkout_scope_key;
    const token = capturePosScope(generation, scopeKey);
    const isCurrent = () => isPosScopeCurrent(token, scopeGenerationRef.current, activeScopeRef.current);
    setErrorMessage(null);

    try {
      const updatedCart = updateCartItemQuantity(cart, lineId, quantity);
      const persisted = await persistDurableCart(updatedCart);
      if (isCurrent()) setCart(persisted);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid quantity value';
      if (isCurrent()) setErrorMessage(message);
    }
  }, [cart, newSaleAllowed]);

  // 5. Remove Item from Cart
  const handleRemoveItem = useCallback(async (lineId: string) => {
    if (!cart || !newSaleAllowed) return;
    const generation = scopeGenerationRef.current;
    const scopeKey = cart.checkout_scope_key;
    const token = capturePosScope(generation, scopeKey);
    const isCurrent = () => isPosScopeCurrent(token, scopeGenerationRef.current, activeScopeRef.current);
    setErrorMessage(null);
    const updatedCart = removeCartItem(cart, lineId);
    try {
      const persisted = await persistDurableCart(updatedCart);
      if (isCurrent()) setCart(persisted);
    } catch (err: unknown) {
      if (isCurrent()) setErrorMessage(err instanceof Error ? err.message : 'Unable to remove item');
    }
  }, [cart, newSaleAllowed]);

  // 6. Clear Cart
  const handleClearCart = useCallback(async () => {
    if (!cart || !newSaleAllowed) return;
    const generation = scopeGenerationRef.current;
    const scopeKey = cart.checkout_scope_key;
    const token = capturePosScope(generation, scopeKey);
    const isCurrent = () => isPosScopeCurrent(token, scopeGenerationRef.current, activeScopeRef.current);
    setErrorMessage(null);
    try {
      await cancelDurableCart(cart);
      if (!isCurrent()) return;
      const next = await loadOrCreateDurableCart({
        pharmacy_id: cart.pharmacy_id, branch_id: cart.branch_id, cashier_id: cart.cashier_id,
        authenticated_user_id: cart.cashier_id, currency: cart.currency
      });
      if (isCurrent()) setCart(next);
    } catch (err: unknown) {
      if (isCurrent()) setErrorMessage(err instanceof Error ? err.message : 'Unable to cancel checkout');
    }
  }, [cart, newSaleAllowed]);

  const handleRetireRestrictedDraft = useCallback(async () => {
    if (!cart || newSaleAllowed || cart.checkout_state !== 'DRAFT') return;
    const token = capturePosScope(scopeGenerationRef.current, cart.checkout_scope_key);
    const isCurrent = () => isPosScopeCurrent(token, scopeGenerationRef.current, activeScopeRef.current);
    setErrorMessage(null);
    const outcome = await runPosScopeBoundTask(token, isCurrent, () => cancelDurableCart(cart));
    if (!outcome.accepted) return;
    if ('error' in outcome) setErrorMessage(outcome.error instanceof Error ? outcome.error.message : 'Unable to retire checkout');
    else setCart(null);
  }, [cart, newSaleAllowed]);

  // 7. Complete Sale Flow with Double-Submission Protection
  const handleFinalizeSale = useCallback(async (
    paymentMethod: PaymentMethod,
    customer?: Customer | null,
    amountTendered?: number
  ) => {
    if (!cart || !user?.id || !newSaleAllowed) return;
    if (isFinalizing) return; // Prevent double click
    const generation = scopeGenerationRef.current;
    const scopeKey = cart.checkout_scope_key;
    const token = capturePosScope(generation, scopeKey);
    const isCurrent = () => isPosScopeCurrent(token, scopeGenerationRef.current, activeScopeRef.current);

    setIsFinalizing(true);
    setErrorMessage(null);
    try {
      const result = await finalizePosSale(cart, {
        payment_method: paymentMethod,
        amount_tendered: amountTendered,
        authenticated_user_id: user.id,
        customer_id: customer?.id || null
      });
      if (!isCurrent()) return;

      if (!result.success) {
        const errorText = result.errors && result.errors.length > 0
          ? result.errors.join('. ')
          : 'Failed to record sale';
        setErrorMessage(errorText);
        return;
      }

      // Sale committed locally and queued!
      if (result.checkoutRevision !== undefined) {
        setCart((current) => current?.checkout_scope_key === scopeKey ? {
          ...current,
          draft_revision: result.checkoutRevision!,
          checkout_state: 'LOCALLY_DURABLE',
          transaction_id: result.transaction?.id || current.transaction_id,
          queue_id: result.queueItem?.id || current.queue_id
        } : current);
      }
      setLastCustomer(customer && result.sale?.customer_id === customer.id ? customer : null);
      setCompletedSale(result);

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unexpected error during sale finalization';
      if (isCurrent()) setErrorMessage(message);
    } finally {
      if (isCurrent()) setIsFinalizing(false);
    }
  }, [cart, user?.id, isFinalizing, newSaleAllowed]);

  const handleRecoverDurableCheckout = useCallback(async () => {
    if (!cart || cart.checkout_state !== 'LOCALLY_DURABLE') return;
    const generation = scopeGenerationRef.current;
    const scopeKey = cart.checkout_scope_key;
    try {
      const recovered = await getExistingDurableCheckoutSale({
        scope_key: scopeKey, checkout_intent_id: cart.checkout_intent_id,
        client_op_id: cart.client_op_id, sale_id: cart.sale_id, pharmacy_id: cart.pharmacy_id
      });
      if (generation !== scopeGenerationRef.current || activeScopeRef.current !== scopeKey) return;
      if (!recovered?.sale) throw new Error('Durable checkout evidence is incomplete');
      setLastCustomer(null);
      setCompletedSale({ success: true, sale: recovered.sale, transaction: recovered.transaction,
        queueItem: recovered.queueItem, checkoutRevision: recovered.checkoutRevision });
      setRecoveryRequired(false);
    } catch (err: unknown) {
      if (generation === scopeGenerationRef.current && activeScopeRef.current === scopeKey) {
        setErrorMessage(err instanceof Error ? err.message : 'Durable checkout recovery failed');
      }
    }
  }, [cart]);

  const handleAcknowledgeAndStartNext = useCallback(async () => {
    if (!cart) return;
    const generation = scopeGenerationRef.current;
    const scopeKey = cart.checkout_scope_key;
    const token = capturePosScope(generation, scopeKey);
    const isCurrent = () => isPosScopeCurrent(token, scopeGenerationRef.current, activeScopeRef.current);
    try {
      await acknowledgeDurableCart(cart);
      if (!isCurrent()) return;
      if (!newSaleAllowed) {
        setCompletedSale(null);
        setLastCustomer(null);
        setReceiptToView(null);
        setCart(null);
        return;
      }
      const next = await loadOrCreateDurableCart({
        pharmacy_id: cart.pharmacy_id, branch_id: cart.branch_id, cashier_id: cart.cashier_id,
        authenticated_user_id: cart.cashier_id, currency: cart.currency
      });
      if (isCurrent()) {
        setCompletedSale(null);
        setLastCustomer(null);
        setReceiptToView(null);
        setCart(next);
      }
    } catch (err: unknown) {
      if (isCurrent()) setErrorMessage(err instanceof Error ? err.message : 'Failed to start the next checkout');
    }
  }, [cart, newSaleAllowed]);

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
    if (!newSaleAllowed) {
      return (
        <div className="p-8 text-center bg-slate-900 border border-amber-500/30 rounded-2xl max-w-xl mx-auto my-12">
          <Lock className="w-8 h-8 text-amber-400 mx-auto mb-3" />
          <h2 className="text-base font-bold text-white mb-2">New checkout unavailable</h2>
          <p className="text-xs text-slate-300">The subscription does not permit reserving a new sale. Existing durable checkout evidence remains reviewable and the synchronization runtime may reconcile previously accepted operations.</p>
        </div>
      );
    }
    if (initializationFailure) {
      return (
        <div className="p-8 text-center bg-slate-900 border border-rose-500/30 rounded-2xl max-w-md mx-auto my-12">
          <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto mb-3" />
          <h2 className="text-base font-bold text-white mb-2">Checkout initialization interrupted</h2>
          <p className="text-xs text-slate-300 mb-4">{initializationFailure}</p>
          <button type="button" onClick={() => setInitializationAttempt((value) => value + 1)}
            className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold">
            Retry initialization
          </button>
        </div>
      );
    }
    return (
      <div className="p-12 text-center text-slate-400">
        <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin mx-auto mb-3" />
        <span className="text-xs">Initializing local POS transaction context...</span>
      </div>
    );
  }

  const totalItems = cart.line_items.reduce((acc, li) => acc + li.quantity, 0);

  if (!newSaleAllowed && cart.checkout_state === 'DRAFT') {
    return (
      <div className="p-8 bg-slate-900 border border-amber-500/30 rounded-2xl max-w-xl mx-auto my-12">
        <Lock className="w-8 h-8 text-amber-400 mb-3" />
        <h2 className="text-base font-bold text-white mb-2">Unsubmitted checkout restricted</h2>
        <p className="text-xs text-slate-300 mb-4">This draft was never frozen as an accepted sale and cannot be completed after entitlement expiry. It may be retired without creating a replacement.</p>
        <button type="button" onClick={() => { void handleRetireRestrictedDraft(); }}
          className="px-4 py-2 rounded-xl bg-slate-700 text-white text-xs font-bold">Retire unsubmitted checkout</button>
      </div>
    );
  }

  if (recoveryRequired) {
    return (
      <div className="p-8 bg-slate-900 border border-amber-500/30 rounded-2xl max-w-xl mx-auto my-12">
        <AlertTriangle className="w-8 h-8 text-amber-400 mb-3" />
        <h2 className="text-base font-bold text-white mb-2">Durable checkout requires review</h2>
        <p className="text-xs text-slate-300 mb-4">
          A prior checkout was frozen locally. Recover its original customer, payment, tender and creation-time evidence before starting another customer.
        </p>
        {errorMessage && <p className="text-xs text-rose-400 mb-3">{errorMessage}</p>}
        <button type="button" onClick={() => { void handleRecoverDurableCheckout(); }}
          className="px-4 py-2 rounded-xl bg-amber-400 text-slate-950 text-xs font-bold">
          Review recovered sale
        </button>
      </div>
    );
  }

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
            key={`${cart.checkout_intent_id}:${catalogSyncKey}`}
            pharmacyId={pharmacy.id}
            currency={cart.currency}
            onAddToCart={handleAddToCart}
            isAddingProduct={isAddingProduct}
            checkoutIdentity={cart.checkout_intent_id}
          />
        </div>

        {/* Right Column: Cart Panel & Payment (5 cols on large displays) */}
        <div className="lg:col-span-5 sticky top-20">
          <CartPanel
            key={cart.checkout_intent_id}
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
          onClose={() => { void handleAcknowledgeAndStartNext(); }}
          onViewReceipt={() => {
            if (completedSale.sale && pharmacy) {
              const receipt = buildReceiptFromPosSale(
                completedSale.sale,
                pharmacy,
                branch,
                profile?.full_name || user.email || 'Cashier',
                undefined,
                lastCustomer && lastCustomer.id === completedSale.sale.customer_id
                  ? { id: lastCustomer.id, name: lastCustomer.name, phone: lastCustomer.phone }
                  : null
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
            void handleAcknowledgeAndStartNext();
          }}
        />
      )}
    </div>
  );
};
