import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  ArrowRightLeft,
  Package,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Layers,
  FileText,
  Loader2,
  Plus,
  Trash2,
  WifiOff,
  AlertCircle
} from 'lucide-react';
import {
  LocalProduct,
  LocalBatch,
  StockTransferItemInput,
  StockTransferDispatchResult
} from '../../lib/inventory/types';
import { dispatchStockTransfer } from '../../lib/inventory/service';
import { validateStockTransferDispatchRequest } from '../../lib/inventory/validation';
import { formatDate } from '../pos/formatters';

interface BranchOption {
  id: string;
  name: string;
  is_main?: boolean;
}

interface StockTransferDispatchModalProps {
  pharmacyId: string;
  pharmacyName: string;
  userRole: string;
  userDefaultBranchId?: string | null;
  currentBranchId?: string | null;
  branches: BranchOption[];
  products: LocalProduct[];
  batchesMap: Record<string, LocalBatch[]>;
  isOnline: boolean;
  onClose: () => void;
  onDispatchSuccess: (result: StockTransferDispatchResult) => void;
}

interface DraftLineItem {
  id: string;
  productId: string;
  sourceBatchId: string;
  quantity: number;
}

export const StockTransferDispatchModal: React.FC<StockTransferDispatchModalProps> = ({
  pharmacyId,
  pharmacyName,
  userRole,
  userDefaultBranchId,
  currentBranchId,
  branches,
  products,
  batchesMap,
  isOnline,
  onClose,
  onDispatchSuccess
}) => {
  const isOwner = userRole === 'OWNER';

  // 1. Role-aware Source Branch Initialization
  const initialSourceBranchId = useMemo(() => {
    if (isOwner) {
      return currentBranchId || userDefaultBranchId || branches[0]?.id || '';
    }
    return userDefaultBranchId || currentBranchId || branches[0]?.id || '';
  }, [isOwner, currentBranchId, userDefaultBranchId, branches]);

  const [selectedSourceBranchId, setSelectedSourceBranchId] = useState<string>(initialSourceBranchId);

  // Keep source locked for non-owner
  useEffect(() => {
    if (!isOwner && initialSourceBranchId) {
      setSelectedSourceBranchId(initialSourceBranchId);
    }
  }, [isOwner, initialSourceBranchId]);

  // 2. Destination Branch (must exclude source branch)
  const availableDestBranches = useMemo(() => {
    return branches.filter((b) => b.id.toLowerCase() !== selectedSourceBranchId.toLowerCase());
  }, [branches, selectedSourceBranchId]);

  const [selectedDestBranchId, setSelectedDestBranchId] = useState<string>(
    availableDestBranches[0]?.id || ''
  );

  // Auto-switch destination if source changes to match it
  useEffect(() => {
    if (selectedDestBranchId.toLowerCase() === selectedSourceBranchId.toLowerCase()) {
      const nextDest = availableDestBranches[0]?.id || '';
      setSelectedDestBranchId(nextDest);
    }
  }, [selectedSourceBranchId, selectedDestBranchId, availableDestBranches]);

  // 3. Line Items Draft State
  const [lineItems, setLineItems] = useState<DraftLineItem[]>([]);
  const [notes, setNotes] = useState<string>('');

  // Item Picker State for New Item Row
  const [pickerProductId, setPickerProductId] = useState<string>(products[0]?.id || '');
  const [pickerBatchId, setPickerBatchId] = useState<string>('');
  const [pickerQuantity, setPickerQuantity] = useState<string>('1');

  // Execution & Feedback State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<StockTransferDispatchResult | null>(null);

  // Available batches for selected picker product matching SOURCE branch
  const availableSourceBatches = useMemo(() => {
    if (!pickerProductId) return [];
    const allBatches = batchesMap[pickerProductId] || [];
    return allBatches.filter((b) => {
      const matchesBranch = b.branch_id.toLowerCase() === selectedSourceBranchId.toLowerCase();
      const isActive = b.status !== 'RECALLED' && b.status !== 'ARCHIVED';
      const hasStock = b.projected_stock > 0;
      return matchesBranch && isActive && hasStock;
    });
  }, [pickerProductId, batchesMap, selectedSourceBranchId]);

  // Reset or pick first available batch when product or source branch changes
  useEffect(() => {
    if (availableSourceBatches.length > 0) {
      setPickerBatchId(availableSourceBatches[0].id);
    } else {
      setPickerBatchId('');
    }
  }, [availableSourceBatches]);

  const activePickerBatch = useMemo(() => {
    return availableSourceBatches.find((b) => b.id.toLowerCase() === pickerBatchId.toLowerCase()) || null;
  }, [pickerBatchId, availableSourceBatches]);

  // Clear line items if source branch changes (batches belong to specific branches)
  const handleSourceBranchChange = (newBranchId: string) => {
    if (!isOwner) return; // Non-owners cannot change source branch
    setSelectedSourceBranchId(newBranchId);
    setLineItems([]);
    setErrorMessage(null);
  };

  // Add Item to Line Items List
  const handleAddItem = () => {
    setErrorMessage(null);
    if (!pickerProductId || !pickerBatchId) {
      setErrorMessage('Please select a valid product and available batch.');
      return;
    }

    const qty = parseInt(pickerQuantity, 10);
    if (isNaN(qty) || qty <= 0) {
      setErrorMessage('Quantity must be a positive integer.');
      return;
    }

    if (!activePickerBatch) {
      setErrorMessage('Selected batch is not available.');
      return;
    }

    // Check duplicate batch in existing line items
    const existingIndex = lineItems.findIndex(
      (it) => it.sourceBatchId.toLowerCase() === pickerBatchId.toLowerCase()
    );
    if (existingIndex >= 0) {
      setErrorMessage('This batch is already added to the transfer. Edit the existing line item instead.');
      return;
    }

    // Check displayed available stock limit
    if (qty > activePickerBatch.projected_stock) {
      setErrorMessage(
        `Quantity (${qty}) exceeds displayed available stock (${activePickerBatch.projected_stock}) for batch ${activePickerBatch.batch_number}.`
      );
      return;
    }

    setLineItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        productId: pickerProductId,
        sourceBatchId: pickerBatchId,
        quantity: qty
      }
    ]);

    setPickerQuantity('1');
  };

  const handleRemoveItem = (id: string) => {
    setLineItems((prev) => prev.filter((it) => it.id !== id));
  };

  // Authoritative Dispatch Submission Handler
  const handleSubmitDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!isOnline) {
      setErrorMessage('Stock transfer dispatch requires an active server connection. Offline transfers are not supported.');
      return;
    }

    if (!selectedDestBranchId) {
      setErrorMessage('Please select a destination branch.');
      return;
    }

    if (selectedSourceBranchId.toLowerCase() === selectedDestBranchId.toLowerCase()) {
      setErrorMessage('Source and destination branches cannot be the same.');
      return;
    }

    if (lineItems.length === 0) {
      setErrorMessage('Please add at least one line item to dispatch.');
      return;
    }

    const formattedItems: StockTransferItemInput[] = lineItems.map((it) => ({
      product_id: it.productId,
      source_batch_id: it.sourceBatchId,
      quantity: it.quantity
    }));

    // Preflight Client Validation
    const clientOpId = crypto.randomUUID();
    const valResult = validateStockTransferDispatchRequest({
      pharmacy_id: pharmacyId,
      source_branch_id: selectedSourceBranchId,
      destination_branch_id: selectedDestBranchId,
      items: formattedItems,
      client_op_id: clientOpId,
      notes: notes.trim() || null
    });

    if (!valResult.isValid) {
      setErrorMessage(`Validation error: ${valResult.errors.join('; ')}`);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await dispatchStockTransfer({
        pharmacy_id: pharmacyId,
        source_branch_id: selectedSourceBranchId,
        destination_branch_id: selectedDestBranchId,
        items: formattedItems,
        client_op_id: clientOpId,
        notes: notes.trim() || null
      });

      if (!result.success) {
        let msg = result.error || 'Failed to dispatch stock transfer';
        if (result.errorCode === 'FORBIDDEN_BRANCH') {
          msg = 'Permission Denied: You are not assigned to the source branch.';
        } else if (result.errorCode === 'INSUFFICIENT_STOCK') {
          msg = 'Stock Deficit: One or more batches have insufficient stock for this transfer.';
        } else if (result.errorCode === 'SAME_BRANCH_TRANSFER') {
          msg = 'Invalid Route: Source and destination branches cannot be identical.';
        } else if (result.errorCode === 'OFFLINE_UNSUPPORTED') {
          msg = 'Transfers cannot be processed while offline. Reconnect and try again.';
        }
        setErrorMessage(msg);
        return;
      }

      setSuccessResult(result);
      onDispatchSuccess(result);
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred during dispatch.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const sourceBranchName = branches.find((b) => b.id.toLowerCase() === selectedSourceBranchId.toLowerCase())?.name || 'Source Branch';
  const destBranchName = branches.find((b) => b.id.toLowerCase() === selectedDestBranchId.toLowerCase())?.name || 'Destination Branch';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Dispatch Inter-Branch Stock Transfer
              </h2>
              <p className="text-xs text-slate-400">
                Authoritative multi-branch replenishment ({pharmacyName})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs text-slate-300">
          {/* Offline Warning Banner */}
          {!isOnline && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center gap-3">
              <WifiOff className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                <strong>Offline Mode Active:</strong> Inter-branch transfers require live PostgreSQL verification to prevent inventory duplication. Transacting is temporarily disabled.
              </span>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Success State Screen */}
          {successResult ? (
            <div className="py-8 px-4 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-white">Stock Transfer Dispatched Successfully</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Transfer reference <span className="font-mono text-emerald-400">{successResult.transfer_id}</span> has been created in DISPATCHED status. Stock has been deducted from {sourceBranchName} and is in-transit to {destBranchName}.
              </p>
              <div className="pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs cursor-pointer shadow-lg shadow-emerald-600/20 transition"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitDispatch} className="space-y-5">
              {/* Branch Routing Card */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 space-y-3">
                <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-teal-400" />
                  <span>Transfer Route (Source & Destination)</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Source Branch Selector */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Source Branch {isOwner ? '(Selectable by Owner)' : '(Assigned Branch)'}
                    </label>
                    {isOwner ? (
                      <select
                        value={selectedSourceBranchId}
                        onChange={(e) => handleSourceBranchChange(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-teal-500"
                      >
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} {b.is_main ? '(Main Branch)' : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-400 text-xs flex items-center justify-between">
                        <span>{sourceBranchName}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          Locked ({userRole})
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Destination Branch Selector */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Destination Branch
                    </label>
                    <select
                      value={selectedDestBranchId}
                      onChange={(e) => setSelectedDestBranchId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-teal-500"
                    >
                      {availableDestBranches.length === 0 ? (
                        <option value="">No other branches available</option>
                      ) : (
                        availableDestBranches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} {b.is_main ? '(Main Branch)' : ''}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>
              </div>

              {/* Add Item Row Box */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 space-y-3">
                <h4 className="text-xs font-semibold text-slate-200 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Package className="w-3.5 h-3.5 text-teal-400" />
                    <span>Select Product & Source Batch</span>
                  </span>
                  {activePickerBatch && (
                    <span className="text-[11px] text-teal-400">
                      Available Stock: <strong>{activePickerBatch.projected_stock}</strong> units
                    </span>
                  )}
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Product Picker */}
                  <div className="sm:col-span-1">
                    <label className="block text-[10px] text-slate-400 mb-1">Product</label>
                    <select
                      value={pickerProductId}
                      onChange={(e) => setPickerProductId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-teal-500"
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Batch Picker */}
                  <div className="sm:col-span-1">
                    <label className="block text-[10px] text-slate-400 mb-1">Source Batch (at {sourceBranchName})</label>
                    <select
                      value={pickerBatchId}
                      onChange={(e) => setPickerBatchId(e.target.value)}
                      disabled={availableSourceBatches.length === 0}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-teal-500 disabled:opacity-50"
                    >
                      {availableSourceBatches.length === 0 ? (
                        <option value="">No stock at source branch</option>
                      ) : (
                        availableSourceBatches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.batch_number} (Exp: {formatDate(b.expiry_date)}) - {b.projected_stock} avail
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  {/* Quantity & Add Action */}
                  <div className="sm:col-span-1 flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-[10px] text-slate-400 mb-1">Transfer Quantity</label>
                      <input
                        type="number"
                        min="1"
                        max={activePickerBatch?.projected_stock || 1}
                        value={pickerQuantity}
                        onChange={(e) => setPickerQuantity(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-teal-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddItem}
                      disabled={!activePickerBatch || !isOnline}
                      className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-slate-950 font-semibold text-xs flex items-center gap-1 cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Transfer Items ({lineItems.length})</span>
                  <span>
                    Total Units:{' '}
                    <strong className="text-slate-200">
                      {lineItems.reduce((acc, it) => acc + it.quantity, 0)}
                    </strong>
                  </span>
                </div>

                {lineItems.length === 0 ? (
                  <div className="p-6 text-center rounded-xl border border-dashed border-slate-800 text-slate-500">
                    <Layers className="w-5 h-5 mx-auto mb-1.5 opacity-40" />
                    <span>No items added yet. Select a product and batch above to add.</span>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-800 overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-800/60 text-slate-400">
                        <tr>
                          <th className="py-2 px-3">Product</th>
                          <th className="py-2 px-3">Batch</th>
                          <th className="py-2 px-3 text-right">Quantity</th>
                          <th className="py-2 px-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                        {lineItems.map((item) => {
                          const prod = products.find((p) => p.id === item.productId);
                          const allBatches = batchesMap[item.productId] || [];
                          const batch = allBatches.find((b) => b.id === item.sourceBatchId);
                          return (
                            <tr key={item.id} className="hover:bg-slate-800/30">
                              <td className="py-2 px-3 font-medium text-slate-200">
                                {prod?.name || 'Product'}
                              </td>
                              <td className="py-2 px-3 font-mono text-[11px] text-slate-400">
                                {batch?.batch_number || 'Batch'}
                              </td>
                              <td className="py-2 px-3 text-right font-bold text-teal-400">
                                {item.quantity}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(item.id)}
                                  className="text-slate-400 hover:text-rose-400 transition cursor-pointer p-1"
                                  title="Remove item"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Optional Notes */}
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Dispatch Notes (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Urgent stock rebalancing for weekend surge"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* Form Action Buttons */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !isOnline || lineItems.length === 0}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-teal-600/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Dispatching...</span>
                    </>
                  ) : (
                    <>
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      <span>Dispatch Transfer</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
