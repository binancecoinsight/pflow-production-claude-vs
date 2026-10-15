import React, { useState, useMemo } from 'react';
import { 
  Search, 
  X, 
  Receipt, 
  Filter, 
  Layers, 
  ChevronRight, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Building2, 
  CreditCard 
} from 'lucide-react';
import { HistoricalSale } from '../../lib/sales/history';
import { PaymentMethod } from '../../lib/sales/types';
import { formatMinorUnits, formatDate } from '../pos/formatters';

interface SalesListProps {
  sales: HistoricalSale[];
  selectedSaleId: string | null;
  onSelectSale: (sale: HistoricalSale) => void;
  currency: string;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  isLoading: boolean;
  onRefresh: () => void;
}

export const SalesList: React.FC<SalesListProps> = ({
  sales,
  selectedSaleId,
  onSelectSale,
  currency,
  searchQuery,
  onSearchChange,
  isLoading,
  onRefresh
}) => {
  const [selectedPayment, setSelectedPayment] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMMITTED' | 'PENDING' | 'ATTENTION'>('ALL');

  // Filtered sales
  const filteredSales = useMemo(() => {
    let result = sales;

    // Payment method filter
    if (selectedPayment !== 'ALL') {
      result = result.filter((s) => s.payment_method === selectedPayment);
    }

    // Status filter
    if (statusFilter === 'COMMITTED') {
      result = result.filter((s) => s.sync_status === 'COMMITTED');
    } else if (statusFilter === 'PENDING') {
      result = result.filter((s) => s.sync_status === 'PENDING' || s.sync_status === 'SYNCING');
    } else if (statusFilter === 'ATTENTION') {
      result = result.filter(
        (s) =>
          s.sync_status === 'RETRYABLE' ||
          s.sync_status === 'AUTH_REQUIRED' ||
          s.sync_status === 'DEVICE_BLOCKED' ||
          s.sync_status === 'PERMANENT_FAILURE'
      );
    }

    // Text search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (s) =>
          s.id.toLowerCase().includes(q) ||
          (s.client_op_id && s.client_op_id.toLowerCase().includes(q)) ||
          s.cashier_id.toLowerCase().includes(q) ||
          s.payment_method.toLowerCase().includes(q)
      );
    }

    return result;
  }, [sales, selectedPayment, statusFilter, searchQuery]);

  return (
    <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl shadow-xl overflow-hidden backdrop-blur-md flex flex-col">
      {/* Search & Filter Toolbar */}
      <div className="p-4 sm:p-5 border-b border-slate-800/80 space-y-3.5 bg-slate-950/40">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search transactions by Sale ID, Op ID, Cashier, or Tender..."
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-9 py-2 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition font-mono"
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

          {/* Payment Method Dropdown */}
          <div className="flex items-center gap-2">
            <CreditCard className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedPayment}
              onChange={(e) => setSelectedPayment(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="ALL">All Payment Methods</option>
              <option value="CASH">Cash</option>
              <option value="TRANSFER">Bank Transfer</option>
              <option value="CARD">Card</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-[11px] text-slate-400 font-medium">Filter Status:</span>
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            All Sales ({sales.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('COMMITTED')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
              statusFilter === 'COMMITTED'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Server Committed
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('PENDING')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
              statusFilter === 'PENDING'
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Local Pending
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('ATTENTION')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
              statusFilter === 'ATTENTION'
                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Requires Attention
          </button>
        </div>
      </div>

      {/* Transactions List */}
      <div className="overflow-x-auto flex-1">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400">
            <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin mx-auto mb-3" />
            <span className="text-xs">Loading sales history from database...</span>
          </div>
        ) : sales.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Receipt className="w-12 h-12 text-slate-600 mx-auto mb-3 opacity-60" />
            <h3 className="text-sm font-semibold text-white">No Transactions Recorded</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              There are no sales records matching your account permissions in this pharmacy yet.
            </p>
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Search className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
            <p className="text-xs font-medium text-slate-300">No transactions match your search or filter</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Try adjusting your query or resetting the payment and status filters.
            </p>
            <button
              type="button"
              onClick={() => {
                onSearchChange('');
                setSelectedPayment('ALL');
                setStatusFilter('ALL');
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
                <th className="py-3 px-4">Date / Time</th>
                <th className="py-3 px-4">Transaction ID</th>
                <th className="py-3 px-4">Cashier</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4 text-center">Items</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {filteredSales.map((sale) => {
                const isSelected = selectedSaleId === sale.id;
                const isCommitted = sale.sync_status === 'COMMITTED';
                const isAttention =
                  sale.sync_status === 'AUTH_REQUIRED' ||
                  sale.sync_status === 'DEVICE_BLOCKED' ||
                  sale.sync_status === 'PERMANENT_FAILURE' ||
                  sale.sync_status === 'RETRYABLE';

                return (
                  <tr
                    key={sale.id}
                    onClick={() => onSelectSale(sale)}
                    className={`group transition cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/10'
                        : 'hover:bg-slate-800/40'
                    }`}
                  >
                    {/* Timestamp */}
                    <td className="py-3.5 px-4 font-mono text-slate-300 whitespace-nowrap">
                      {new Date(sale.created_at).toLocaleDateString()}
                      <span className="block text-[10px] text-slate-400">
                        {new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>

                    {/* Sale ID */}
                    <td className="py-3.5 px-4 font-mono">
                      <div className="font-semibold text-slate-100 group-hover:text-emerald-400 transition">
                        #{sale.id.slice(0, 8)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {sale.id}
                      </div>
                    </td>

                    {/* Cashier */}
                    <td className="py-3.5 px-4 text-slate-300 font-mono">
                      {sale.cashier_name || sale.cashier_id.slice(0, 8)}
                    </td>

                    {/* Payment Method */}
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] text-slate-300 border border-slate-700/80">
                        {sale.payment_method}
                      </span>
                    </td>

                    {/* Items Count */}
                    <td className="py-3.5 px-4 text-center font-mono text-slate-300">
                      {sale.line_items.length} {sale.line_items.length === 1 ? 'item' : 'items'}
                    </td>

                    {/* Total Amount */}
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400 text-sm">
                      {formatMinorUnits(sale.total, currency)}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-4 text-center">
                      {isCommitted ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Committed</span>
                        </span>
                      ) : isAttention ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 inline-flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-rose-400" />
                          <span>{sale.sync_status}</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-400" />
                          <span>Pending Sync</span>
                        </span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-4 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectSale(sale);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-emerald-600 hover:text-slate-950 text-slate-200 text-xs font-semibold transition cursor-pointer flex items-center gap-1 mx-auto"
                        title="View transaction details"
                      >
                        <span>Details</span>
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

      {/* Footer Strip */}
      <div className="p-3 bg-slate-950 border-t border-slate-800/80 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-400">
        <span>
          Showing {filteredSales.length} of {sales.length} transactions
        </span>
        <span className="text-[11px] text-slate-400">
          Click any transaction to inspect financial details and line items
        </span>
      </div>
    </div>
  );
};
