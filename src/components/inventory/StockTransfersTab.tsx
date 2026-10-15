import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowRightLeft,
  ArrowDownToLine,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  Filter,
  RefreshCw,
  Plus,
  Building2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Eye,
  WifiOff,
  Layers,
  Calendar
} from 'lucide-react';
import {
  StockTransferWithBranches,
  StockTransferStatus
} from '../../lib/inventory/types';
import { fetchStockTransfers } from '../../lib/inventory/service';
import { formatDate } from '../pos/formatters';

interface BranchOption {
  id: string;
  name: string;
  is_main?: boolean;
}

interface StockTransfersTabProps {
  pharmacyId: string;
  currency?: string;
  userRole: string;
  userDefaultBranchId?: string | null;
  currentBranchId?: string | null;
  branches: BranchOption[];
  canTransferStock: boolean;
  isOnline: boolean;
  onOpenDispatch: () => void;
  onSelectTransferDetail: (transfer: StockTransferWithBranches) => void;
  onOpenReceive: (transfer: StockTransferWithBranches) => void;
}

export const StockTransfersTab: React.FC<StockTransfersTabProps> = ({
  pharmacyId,
  currency = 'NGN',
  userRole,
  userDefaultBranchId,
  currentBranchId,
  branches,
  canTransferStock,
  isOnline,
  onOpenDispatch,
  onSelectTransferDetail,
  onOpenReceive
}) => {
  const [transfers, setTransfers] = useState<StockTransferWithBranches[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters
  const [directionFilter, setDirectionFilter] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedBranchId, setSelectedBranchId] = useState<string>(currentBranchId || 'all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const activeBranchId = currentBranchId || userDefaultBranchId || '';

  // Load Transfers from Server
  const loadTransfers = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const options: any = {};
      if (statusFilter !== 'all') {
        options.status = statusFilter as StockTransferStatus;
      }
      if (selectedBranchId !== 'all') {
        options.branchId = selectedBranchId;
        options.direction = directionFilter;
      } else if (directionFilter !== 'all' && activeBranchId) {
        options.branchId = activeBranchId;
        options.direction = directionFilter;
      }

      const result = await fetchStockTransfers(pharmacyId, options);
      if (result.success) {
        setTransfers(result.transfers);
      } else {
        setErrorMessage(result.error || 'Failed to load stock transfers');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error communicating with database');
    } finally {
      setIsLoading(false);
    }
  }, [pharmacyId, statusFilter, selectedBranchId, directionFilter, activeBranchId]);

  useEffect(() => {
    loadTransfers();
  }, [loadTransfers]);

  // Client-side text search filter
  const filteredTransfers = useMemo(() => {
    if (!searchQuery.trim()) return transfers;
    const q = searchQuery.toLowerCase().trim();
    return transfers.filter((t) => {
      const matchId = t.id.toLowerCase().includes(q);
      const matchSrc = t.source_branch_name?.toLowerCase().includes(q) || false;
      const matchDest = t.destination_branch_name?.toLowerCase().includes(q) || false;
      const matchNotes = t.notes?.toLowerCase().includes(q) || false;
      return matchId || matchSrc || matchDest || matchNotes;
    });
  }, [transfers, searchQuery]);

  // Metrics Counters
  const metrics = useMemo(() => {
    const total = transfers.length;
    const inTransit = transfers.filter((t) => t.status === 'DISPATCHED').length;
    const completed = transfers.filter((t) => t.status === 'RECEIVED').length;
    return { total, inTransit, completed };
  }, [transfers]);

  const isOwner = userRole === 'OWNER';

  return (
    <div className="space-y-5">
      {/* Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[11px] font-medium text-slate-400">Total Transfers</span>
            <div className="text-xl font-bold text-white mt-0.5">{metrics.total}</div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center">
            <ArrowRightLeft className="w-4 h-4" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[11px] font-medium text-amber-400">In-Transit (Dispatched)</span>
            <div className="text-xl font-bold text-amber-400 mt-0.5">{metrics.inTransit}</div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[11px] font-medium text-emerald-400">Completed (Received)</span>
            <div className="text-xl font-bold text-emerald-400 mt-0.5">{metrics.completed}</div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Offline Warning Banner */}
      {!isOnline && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2.5">
          <WifiOff className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            <strong>Offline Mode:</strong> Inter-branch transfers require active server connection. Creating new dispatches and confirming receipts are paused until reconnected.
          </span>
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={loadTransfers}
            className="text-xs font-semibold text-rose-400 hover:text-rose-200 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Control Bar: Filters, Search & Dispatch Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
        {/* Direction & Status Tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Direction Filter */}
          <div className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/60 text-xs">
            <button
              type="button"
              onClick={() => setDirectionFilter('all')}
              className={`px-3 py-1 rounded-md font-medium transition cursor-pointer ${
                directionFilter === 'all'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Routes
            </button>
            <button
              type="button"
              onClick={() => setDirectionFilter('inbound')}
              className={`px-3 py-1 rounded-md font-medium flex items-center gap-1 transition cursor-pointer ${
                directionFilter === 'inbound'
                  ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ArrowDownLeft className="w-3 h-3 text-emerald-400" />
              <span>Inbound</span>
            </button>
            <button
              type="button"
              onClick={() => setDirectionFilter('outbound')}
              className={`px-3 py-1 rounded-md font-medium flex items-center gap-1 transition cursor-pointer ${
                directionFilter === 'outbound'
                  ? 'bg-teal-600/30 text-teal-300 border border-teal-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ArrowUpRight className="w-3 h-3 text-teal-400" />
              <span>Outbound</span>
            </button>
          </div>

          {/* Status Dropdown Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-teal-500"
          >
            <option value="all">All Statuses</option>
            <option value="DISPATCHED">Dispatched (In-Transit)</option>
            <option value="RECEIVED">Received (Completed)</option>
          </select>

          {/* Branch Filter */}
          <select
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-teal-500"
          >
            <option value="all">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={loadTransfers}
            disabled={isLoading}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            title="Refresh transfer list"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Search & Dispatch CTA */}
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1 md:w-56">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reference or branch..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-teal-500"
            />
          </div>

          {/* Dispatch CTA Button (Hidden for Cashier) */}
          {canTransferStock && (
            <button
              type="button"
              onClick={onOpenDispatch}
              disabled={!isOnline}
              className="px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-teal-600/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Dispatch Stock</span>
            </button>
          )}
        </div>
      </div>

      {/* Transfers Table / Cards */}
      {isLoading ? (
        <div className="py-16 text-center text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-400" />
          <span className="text-xs">Loading stock transfers...</span>
        </div>
      ) : filteredTransfers.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 space-y-2">
          <ArrowRightLeft className="w-8 h-8 mx-auto text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-200">No Stock Transfers Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery
              ? 'No transfers match the search filter. Try clearing your query.'
              : 'No inter-branch transfers have been recorded matching the active filters.'}
          </p>
          {canTransferStock && isOnline && (
            <div className="pt-2">
              <button
                type="button"
                onClick={onOpenDispatch}
                className="px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-slate-950 font-semibold text-xs cursor-pointer transition shadow"
              >
                Dispatch First Transfer
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/80 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-semibold">Reference</th>
                  <th className="py-3 px-4 font-semibold">Route</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Items / Units</th>
                  <th className="py-3 px-4 font-semibold">Dispatched</th>
                  <th className="py-3 px-4 font-semibold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredTransfers.map((transfer) => {
                  const isDestinationMatch =
                    userDefaultBranchId &&
                    userDefaultBranchId.toLowerCase() === transfer.destination_branch_id.toLowerCase();
                  const canReceive = (isOwner || isDestinationMatch) && transfer.status === 'DISPATCHED';

                  return (
                    <tr key={transfer.id} className="hover:bg-slate-800/30 transition">
                      {/* Reference & Notes */}
                      <td className="py-3 px-4">
                        <div className="font-mono font-medium text-slate-200">
                          {transfer.id.slice(0, 8)}...
                        </div>
                        {transfer.notes && (
                          <div className="text-[11px] text-slate-400 truncate max-w-xs" title={transfer.notes}>
                            {transfer.notes}
                          </div>
                        )}
                      </td>

                      {/* Route */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <span className="font-medium">{transfer.source_branch_name}</span>
                          <span className="text-teal-400">→</span>
                          <span className="font-semibold text-emerald-400">{transfer.destination_branch_name}</span>
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                            transfer.status === 'RECEIVED'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}
                        >
                          {transfer.status}
                        </span>
                      </td>

                      {/* Units */}
                      <td className="py-3 px-4 text-right">
                        <span className="font-bold text-white">{transfer.total_quantity || 0}</span>
                        <span className="text-slate-400 text-[11px]"> ({transfer.total_items || 0} lines)</span>
                      </td>

                      {/* Dispatched Date */}
                      <td className="py-3 px-4 text-slate-400">
                        {formatDate(transfer.dispatched_at)}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectTransferDetail(transfer)}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium flex items-center gap-1 transition cursor-pointer"
                            title="Inspect transfer details"
                          >
                            <Eye className="w-3 h-3 text-slate-400" />
                            <span>Details</span>
                          </button>

                          {canReceive ? (
                            <button
                              type="button"
                              onClick={() => onOpenReceive(transfer)}
                              disabled={!isOnline}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-[11px] font-semibold border border-emerald-500/30 flex items-center gap-1 transition cursor-pointer shadow-sm disabled:opacity-50"
                              title="Confirm receipt at destination branch"
                            >
                              <ArrowDownToLine className="w-3 h-3 text-emerald-400" />
                              <span>Receive</span>
                            </button>
                          ) : transfer.status === 'DISPATCHED' ? (
                            <span
                              className="text-[10px] text-slate-500 px-2 py-0.5 rounded bg-slate-800/40"
                              title={`Pending receipt by staff at ${transfer.destination_branch_name}`}
                            >
                              Awaiting {transfer.destination_branch_name}
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
