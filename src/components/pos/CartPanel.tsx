import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  AlertCircle, 
  Banknote, 
  CreditCard, 
  ArrowRightLeft, 
  MoreHorizontal, 
  Loader2, 
  Calendar, 
  Tag, 
  User, 
  UserCheck, 
  Search, 
  X, 
  UserPlus 
} from 'lucide-react';
import { PosCart, PosCartLineItem } from '../../lib/pos/types';
import { PaymentMethod, ALLOWED_PAYMENT_METHODS } from '../../lib/sales/types';
import { Customer, listCustomers, createCustomer } from '../../lib/customers/index';
import { isOnline } from '../../lib/offline/network';
import { supabase } from '../../lib/supabase';
import { formatMinorUnits, formatDate } from './formatters';

interface CartPanelProps {
  cart: PosCart;
  onUpdateQuantity: (lineId: string, quantity: number) => void;
  onRemoveItem: (lineId: string) => void;
  onClearCart: () => void;
  onFinalizeSale: (paymentMethod: PaymentMethod, customer?: Customer | null, amountTendered?: number) => Promise<void>;
  isFinalizing: boolean;
  errorMessage: string | null;
  onClearError: () => void;
  pharmacyId?: string;
}

export const CartPanel: React.FC<CartPanelProps> = ({
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onFinalizeSale,
  isFinalizing,
  errorMessage,
  onClearError,
  pharmacyId
}) => {
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('CASH');

  // Cash Tender State (Phase 5D-14)
  const [cashTenderInput, setCashTenderInput] = useState<string>('');

  useEffect(() => {
    // Sync tender input to exact total when total changes
    setCashTenderInput((cart.total / 100).toFixed(2));
  }, [cart.total]);

  const parsedTenderMinor = selectedPayment === 'CASH'
    ? Math.round(Math.max(0, parseFloat(cashTenderInput) || 0) * 100)
    : cart.total;

  const isUnderTendered = selectedPayment === 'CASH' && parsedTenderMinor < cart.total;
  const changeDue = selectedPayment === 'CASH' ? Math.max(0, parsedTenderMinor - cart.total) : 0;

  // Customer Selection State
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isCustomerSelectorOpen, setIsCustomerSelectorOpen] = useState<boolean>(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');
  const [customerList, setCustomerList] = useState<Customer[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState<boolean>(false);

  // Quick Customer Creation State
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState<boolean>(false);
  const [quickName, setQuickName] = useState<string>('');
  const [quickPhone, setQuickPhone] = useState<string>('');
  const [isSavingQuickCustomer, setIsSavingQuickCustomer] = useState<boolean>(false);

  // Load Customers for Selection
  const loadCustomers = useCallback(async (query: string) => {
    if (!pharmacyId) return;
    setIsLoadingCustomers(true);
    try {
      const res = await listCustomers(supabase, pharmacyId, {
        search: query,
        status: 'ACTIVE',
        limit: 15
      });
      if (res.success) {
        setCustomerList(res.customers);
      }
    } catch {
      // Ignored
    } finally {
      setIsLoadingCustomers(false);
    }
  }, [pharmacyId]);

  useEffect(() => {
    if (isCustomerSelectorOpen && pharmacyId) {
      loadCustomers(customerSearchQuery);
    }
  }, [isCustomerSelectorOpen, customerSearchQuery, pharmacyId, loadCustomers]);

  // Handle Quick Create Customer
  const handleQuickCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pharmacyId || !quickName.trim()) return;

    setIsSavingQuickCustomer(true);
    try {
      const res = await createCustomer(supabase, {
        pharmacy_id: pharmacyId,
        name: quickName.trim(),
        phone: quickPhone.trim() || null
      });

      if (res.success && res.customer) {
        setSelectedCustomer(res.customer);
        setIsQuickCreateOpen(false);
        setIsCustomerSelectorOpen(false);
        setQuickName('');
        setQuickPhone('');
      }
    } catch {
      // Ignored
    } finally {
      setIsSavingQuickCustomer(false);
    }
  };

  const getPaymentIcon = (method: PaymentMethod) => {
    switch (method) {
      case 'CASH':
        return <Banknote className="w-4 h-4" />;
      case 'CARD':
        return <CreditCard className="w-4 h-4" />;
      case 'TRANSFER':
        return <ArrowRightLeft className="w-4 h-4" />;
      case 'OTHER':
      default:
        return <MoreHorizontal className="w-4 h-4" />;
    }
  };

  const handleQuantityInputChange = (line: PosCartLineItem, value: string) => {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && parsed > 0) {
      onUpdateQuantity(line.id, parsed);
    }
  };

  const totalItemCount = cart.line_items.reduce((sum, li) => sum + li.quantity, 0);

  const handleClear = () => {
    setSelectedCustomer(null);
    onClearCart();
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-xl">
      {/* Cart Title & Header Actions */}
      <div className="flex items-center justify-between pb-3.5 mb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-emerald-400" />
          <h2 className="text-base font-bold text-white tracking-tight">Active Sale Cart</h2>
          <span className="px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'}
          </span>
        </div>

        {cart.line_items.length > 0 && (
          <button
            onClick={handleClear}
            disabled={isFinalizing}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/20 transition cursor-pointer disabled:opacity-50"
            title="Clear all items in cart"
          >
            Clear Cart
          </button>
        )}
      </div>

      {/* Cart Validation / Submission Error Banner */}
      {errorMessage && (
        <div className="p-3 mb-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={onClearError}
            className="text-rose-400 hover:text-rose-200 text-xs font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Cart Items List */}
      <div className="flex-1 overflow-y-auto max-h-[300px] space-y-2.5 pr-1">
        {cart.line_items.length === 0 ? (
          <div className="py-12 text-center text-slate-500 space-y-2">
            <ShoppingCart className="w-8 h-8 mx-auto opacity-30 text-slate-400" />
            <p className="text-xs font-medium">Cart is currently empty</p>
            <p className="text-[11px] text-slate-600 max-w-[200px] mx-auto">
              Search and add products from the inventory catalog to begin checkout.
            </p>
          </div>
        ) : (
          cart.line_items.map((line) => (
            <div
              key={line.id}
              className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700/80 transition space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-white leading-snug">
                    {line.product_name}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                    <span className="flex items-center gap-1">
                      <Tag className="w-3 h-3 text-slate-500" />
                      Batch: {line.batch_number}
                    </span>
                    {line.expiry_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        Exp: {formatDate(line.expiry_date)}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => onRemoveItem(line.id)}
                  disabled={isFinalizing}
                  className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                  title="Remove item"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Quantity Controls & Line Pricing */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-800/40">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onUpdateQuantity(line.id, line.quantity - 1)}
                    disabled={isFinalizing || line.quantity <= 1}
                    className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 flex items-center justify-center transition cursor-pointer"
                  >
                    <Minus className="w-3 h-3" />
                  </button>

                  <input
                    type="number"
                    min="1"
                    max={line.projected_stock ?? 999}
                    value={line.quantity}
                    onChange={(e) => handleQuantityInputChange(line, e.target.value)}
                    disabled={isFinalizing}
                    className="w-12 h-6 text-center text-xs font-mono font-bold bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />

                  <button
                    onClick={() => onUpdateQuantity(line.id, line.quantity + 1)}
                    disabled={isFinalizing || (line.projected_stock !== undefined && line.quantity >= line.projected_stock)}
                    className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 flex items-center justify-center transition cursor-pointer"
                    title={line.projected_stock !== undefined && line.quantity >= line.projected_stock ? 'Stock limit reached' : 'Add one'}
                  >
                    <Plus className="w-3 h-3" />
                  </button>

                  {line.projected_stock !== undefined && (
                    <span className="text-[10px] text-slate-500 ml-1">
                      max {line.projected_stock}
                    </span>
                  )}
                </div>

                <div className="text-right">
                  <div className="text-xs font-bold text-white font-mono">
                    {formatMinorUnits(line.line_total, cart.currency)}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {formatMinorUnits(line.unit_price, cart.currency)} each
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Customer Selection Section (Phase 5D-13) */}
      <div className="mt-3 pt-3 border-t border-slate-800/80">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-emerald-400" />
            <span>Customer (Optional)</span>
          </label>
          {selectedCustomer ? (
            <button
              type="button"
              onClick={() => setSelectedCustomer(null)}
              className="text-[10px] text-rose-400 hover:text-rose-300 font-medium flex items-center gap-0.5 cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>Walk-in</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsCustomerSelectorOpen(!isCustomerSelectorOpen)}
              className="text-[10px] text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer"
            >
              {isCustomerSelectorOpen ? 'Cancel' : '+ Attach Customer'}
            </button>
          )}
        </div>

        {selectedCustomer ? (
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <div>
                <span className="font-bold text-white">{selectedCustomer.name}</span>
                {selectedCustomer.phone && (
                  <span className="text-[10px] text-slate-400 ml-2">({selectedCustomer.phone})</span>
                )}
              </div>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 uppercase">Linked</span>
          </div>
        ) : (
          !isCustomerSelectorOpen && (
            <div className="text-[11px] text-slate-500 italic px-1">
              Walk-in / Anonymous Customer
            </div>
          )
        )}

        {/* Customer Search / Selection Dropdown */}
        {isCustomerSelectorOpen && !selectedCustomer && (
          <div className="mt-2 p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            {!isQuickCreateOpen ? (
              <>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={customerSearchQuery}
                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                    placeholder="Search customer by name or phone..."
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>

                <div className="max-h-36 overflow-y-auto space-y-1">
                  {isLoadingCustomers ? (
                    <div className="py-2 text-center text-[10px] text-slate-500">Searching...</div>
                  ) : customerList.length === 0 ? (
                    <div className="py-2 text-center text-[10px] text-slate-500">No matching customers</div>
                  ) : (
                    customerList.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(c);
                          setIsCustomerSelectorOpen(false);
                        }}
                        className="w-full text-left p-1.5 rounded-lg hover:bg-slate-800/80 text-xs text-slate-200 flex items-center justify-between transition cursor-pointer"
                      >
                        <span className="font-medium text-white">{c.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{c.phone || ''}</span>
                      </button>
                    ))
                  )}
                </div>

                <div className="pt-2 border-t border-slate-800/60 flex justify-between items-center">
                  {isOnline() ? (
                    <button
                      type="button"
                      onClick={() => setIsQuickCreateOpen(true)}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <UserPlus className="w-3 h-3" />
                      <span>+ New Customer</span>
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-500 italic">
                      Offline (select existing customer or walk-in)
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsCustomerSelectorOpen(false)}
                    className="text-[10px] text-slate-400 hover:text-white"
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              /* Inline Quick Add Form */
              <form onSubmit={handleQuickCreateCustomer} className="space-y-2">
                <div className="text-[11px] font-bold text-white">Register New Customer</div>
                <input
                  type="text"
                  required
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  placeholder="Customer Full Name *"
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                />
                <input
                  type="text"
                  value={quickPhone}
                  onChange={(e) => setQuickPhone(e.target.value)}
                  placeholder="Phone Number (e.g. +234...)"
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                />
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsQuickCreateOpen(false)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400 text-[11px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingQuickCustomer || !quickName.trim()}
                    className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1 disabled:opacity-50"
                  >
                    {isSavingQuickCustomer && <Loader2 className="w-3 h-3 animate-spin" />}
                    <span>Save & Link</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Financial Calculations Summary */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-1.5 text-xs">
        <div className="flex justify-between text-slate-400">
          <span>Subtotal</span>
          <span className="font-mono text-slate-200">
            {formatMinorUnits(cart.subtotal, cart.currency)}
          </span>
        </div>

        {cart.total_discount > 0 && (
          <div className="flex justify-between text-amber-400">
            <span>Discount</span>
            <span className="font-mono">
              - {formatMinorUnits(cart.total_discount, cart.currency)}
            </span>
          </div>
        )}

        {cart.total_tax > 0 && (
          <div className="flex justify-between text-slate-400">
            <span>Estimated Tax</span>
            <span className="font-mono text-slate-200">
              + {formatMinorUnits(cart.total_tax, cart.currency)}
            </span>
          </div>
        )}

        <div className="flex justify-between items-baseline pt-2 border-t border-slate-800 text-sm font-bold text-white">
          <span>Final Total</span>
          <span className="text-lg text-emerald-400 font-mono tracking-tight">
            {formatMinorUnits(cart.total, cart.currency)}
          </span>
        </div>
      </div>

      {/* Payment Method Selector */}
      <div className="mt-4 pt-3 border-t border-slate-800/80">
        <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-2">
          Select Payment Method
        </label>
        <div className="grid grid-cols-2 gap-2">
          {ALLOWED_PAYMENT_METHODS.map((method) => {
            const isSelected = selectedPayment === method;
            return (
              <button
                key={method}
                type="button"
                onClick={() => setSelectedPayment(method)}
                disabled={isFinalizing}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {getPaymentIcon(method)}
                <span>{method}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-slate-500 mt-1.5 text-center">
          Records transaction payment type • Gateway billing is handled separately
        </p>
      </div>

      {/* Cash Tender Integrity Section (Phase 5D-14) */}
      {selectedPayment === 'CASH' && (
        <div className="mt-3 p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
              <Banknote className="w-3.5 h-3.5 text-emerald-400" />
              <span>Cash Tendered</span>
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              Total Due: {formatMinorUnits(cart.total, cart.currency)}
            </span>
          </div>

          <div className="relative">
            <input
              type="number"
              step="any"
              min="0"
              value={cashTenderInput}
              onChange={(e) => setCashTenderInput(e.target.value)}
              disabled={isFinalizing}
              placeholder="0.00"
              className="w-full pl-3 pr-16 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={() => setCashTenderInput((cart.total / 100).toFixed(2))}
              className="absolute right-2 top-1.5 px-2 py-1 text-[10px] font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              Exact
            </button>
          </div>

          {/* Quick Increment Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {[500, 1000, 2000, 5000].map((addAmount) => (
              <button
                key={addAmount}
                type="button"
                onClick={() => {
                  const currentMajor = parseFloat(cashTenderInput) || 0;
                  setCashTenderInput((currentMajor + addAmount).toFixed(2));
                }}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-slate-300 shrink-0 transition"
              >
                +{addAmount}
              </button>
            ))}
          </div>

          {/* Change or Under-tender Feedback */}
          {isUnderTendered ? (
            <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] font-medium flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>
                Short by {formatMinorUnits(cart.total - parsedTenderMinor, cart.currency)} (amount tendered is less than total)
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold">
              <span className="text-emerald-300">Change Due:</span>
              <span className="text-emerald-400 font-mono text-sm">
                {formatMinorUnits(changeDue, cart.currency)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Complete Sale Action with Double Submission Protection */}
      <div className="mt-4">
        <button
          onClick={() => onFinalizeSale(selectedPayment, selectedCustomer, parsedTenderMinor)}
          disabled={cart.line_items.length === 0 || isFinalizing || isUnderTendered}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 active:from-emerald-600 active:to-teal-500 disabled:opacity-40 disabled:hover:from-emerald-500 disabled:hover:to-teal-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer disabled:cursor-not-allowed"
        >
          {isFinalizing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Committing Offline Sale...</span>
            </>
          ) : (
            <>
              <span>Complete Sale</span>
              <span className="font-mono">({formatMinorUnits(cart.total, cart.currency)})</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
