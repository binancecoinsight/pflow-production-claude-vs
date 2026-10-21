import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  RotateCcw, 
  AlertCircle, 
  CheckCircle2, 
  Building2, 
  CreditCard, 
  Layers, 
  Clock 
} from 'lucide-react';
import { HistoricalSale } from '../../lib/sales/history';
import { PaymentMethod } from '../../lib/sales/types';
import { 
  ReturnRecord, 
  getSaleReturns, 
  calculateReturnableQuantities, 
  submitSaleReturn 
} from '../../lib/sales/returns';
import { calculateRefundV2 } from '../../lib/sales/refundV2';
import { formatMinorUnits } from '../pos/formatters';
import { supabase } from '../../lib/supabase';

interface ReturnModalProps {
  sale: HistoricalSale;
  currency: string;
  onClose: () => void;
  onSuccess: (info?: { offlineQueued?: boolean; returnId?: string }) => void;
}

export const ReturnModal: React.FC<ReturnModalProps> = ({
  sale,
  currency,
  onClose,
  onSuccess
}) => {
  const [existingReturns, setExistingReturns] = useState<ReturnRecord[]>([]);
  const [isLoadingReturns, setIsLoadingReturns] = useState<boolean>(true);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [restockOptions, setRestockOptions] = useState<Record<string, boolean>>({});
  const [refundMethod] = useState<PaymentMethod>(sale.payment_method);
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. Fetch previous returns for this sale to compute accurate returnable quantities
  useEffect(() => {
    let isMounted = true;
    async function loadReturns() {
      setIsLoadingReturns(true);
      const { returns, error } = await getSaleReturns(supabase, sale.pharmacy_id, sale.id);
      if (isMounted) {
        if (error) {
          setErrorMessage(`Notice: ${error}`);
        } else {
          setExistingReturns(returns);
        }
        setIsLoadingReturns(false);
      }
    }
    loadReturns();
    return () => {
      isMounted = false;
    };
  }, [sale.pharmacy_id, sale.id]);

  // 2. Compute returnable quantities map
  const returnableMap = useMemo(() => {
    return calculateReturnableQuantities(sale, existingReturns);
  }, [sale, existingReturns]);

  // 3. Compute auto-calculated refund total
  const calculatedRefund = useMemo(() => {
    try {
      const items = sale.line_items.map((item) => ({
        sale_item_id: item.id,
        product_id: item.product_id,
        batch_id: item.batch_id,
        quantity: returnQuantities[item.id] || 0
      })).filter((item) => item.quantity > 0);
      return items.length ? calculateRefundV2(sale, items).total_minor : 0;
    } catch {
      return 0;
    }
  }, [sale, returnQuantities]);

  const totalReturnQuantity = useMemo(() => {
    return Object.values(returnQuantities).reduce((acc, q) => acc + q, 0);
  }, [returnQuantities]);

  // Handle quantity change for a line item
  const handleQuantityChange = (key: string, max: number, value: string) => {
    const val = parseInt(value, 10);
    if (isNaN(val) || val <= 0) {
      const copy = { ...returnQuantities };
      delete copy[key];
      setReturnQuantities(copy);
    } else {
      const clamped = Math.min(val, max);
      setReturnQuantities({
        ...returnQuantities,
        [key]: clamped
      });
    }
  };

  // Toggle restock
  const toggleRestock = (key: string) => {
    setRestockOptions({
      ...restockOptions,
      [key]: restockOptions[key] === undefined ? false : !restockOptions[key]
    });
  };

  // Submit return
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalReturnQuantity === 0) {
      setErrorMessage('Please specify a return quantity of at least 1 for one or more items.');
      return;
    }
    if (!reason.trim()) {
      setErrorMessage('Please provide a reason for the return / transaction correction.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const itemsToReturn = sale.line_items
      .map((item) => {
        const key = item.id;
        const qty = returnQuantities[key] || 0;
        return {
          sale_item_id: item.id,
          product_id: item.product_id,
          batch_id: item.batch_id,
          quantity: qty,
          restock_to_inventory: restockOptions[key] ?? true
        };
      })
      .filter((i) => i.quantity > 0);

    const result = await submitSaleReturn(supabase, {
      pharmacy_id: sale.pharmacy_id,
      branch_id: sale.branch_id,
      sale_id: sale.id,
      items: itemsToReturn,
      refund_amount: calculatedRefund,
      refund_payment_method: refundMethod,
      original_payment_method: sale.payment_method,
      sale,
      reason: reason.trim()
    });

    if (!result.success) {
      setErrorMessage(result.error || 'Failed to process return.');
      setIsSubmitting(false);
    } else {
      setIsSubmitting(false);
      onSuccess({ offlineQueued: result.offline_queued, returnId: result.return_id });
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-start justify-between gap-4 bg-slate-950/40">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>Process Return / Refund</span>
                <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-800 text-slate-300 border border-slate-700">
                  Sale #{sale.id.slice(0, 8)}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Authorized managerial transaction • Restores physical stock to inventory and records financial refund event.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Cancel and close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3.5 bg-rose-500/10 border-b border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Sale Items Table with Returnable Quantities */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                <span>Return Line Items</span>
              </h3>
              <span className="text-[11px] text-slate-400">
                {isLoadingReturns ? 'Checking return history...' : `${existingReturns.length} prior return(s) on file`}
              </span>
            </div>

            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Item / Batch</th>
                    <th className="py-2.5 px-3 text-center">Sold</th>
                    <th className="py-2.5 px-3 text-center">Returnable</th>
                    <th className="py-2.5 px-3 text-right">Return Qty</th>
                    <th className="py-2.5 px-3 text-center">Restock?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {sale.line_items.map((item) => {
                    const key = item.id;
                    const returnable = returnableMap.get(key) || 0;
                    const selectedQty = returnQuantities[key] || 0;
                    const restock = restockOptions[key] ?? true;
                    const isExhausted = returnable === 0;

                    return (
                      <tr key={key} className={isExhausted ? 'opacity-40 bg-slate-950/50' : 'hover:bg-slate-800/30'}>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-200 font-sans">
                            {item.product_name || `Product [${item.product_id.slice(0, 8)}]`}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Batch: {item.batch_number || item.batch_id.slice(0, 8)}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-300">
                          {item.quantity}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-amber-400">
                          {returnable}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="number"
                            min="0"
                            max={returnable}
                            disabled={isExhausted || isSubmitting}
                            value={selectedQty > 0 ? selectedQty : ''}
                            placeholder="0"
                            onChange={(e) => handleQuantityChange(key, returnable, e.target.value)}
                            className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-right text-xs text-white focus:outline-none focus:border-amber-400 disabled:bg-slate-900 disabled:text-slate-600"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={restock}
                            disabled={isExhausted || isSubmitting}
                            onChange={() => toggleRestock(key)}
                            className="rounded border-slate-700 text-amber-500 focus:ring-amber-400 h-3.5 w-3.5 cursor-pointer disabled:cursor-not-allowed"
                            title="Restock returned units to inventory batch"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Refund Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Refund Method
              </label>
              <select
                value={refundMethod}
                disabled
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400 cursor-pointer"
              >
                <option value="CASH">Cash</option>
                <option value="TRANSFER">Bank Transfer</option>
                <option value="CARD">Card</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Total Refund Amount
              </label>
              <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono font-bold text-amber-400">
                {formatMinorUnits(calculatedRefund, currency)}
              </div>
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Return Reason / Notes <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={2}
              required
              disabled={isSubmitting}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Provide reason for return (e.g. Expired batch dispensed, customer adverse reaction, packaging damaged)..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400 resize-none"
            />
          </div>

          {/* Warning Banner */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-300 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span>
              Authoritative transaction: Submitting will append a non-reversible return record, restore inventory batch quantities via the immutable stock ledger, and record an audit log.
            </span>
          </div>

          {/* Submit Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || totalReturnQuantity === 0}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
              <span>{isSubmitting ? 'Processing Return...' : `Authorize Return (${totalReturnQuantity} units)`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
