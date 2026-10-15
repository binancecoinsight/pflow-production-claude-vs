import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, 
  Package, 
  Calendar, 
  Building2, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  Plus, 
  Trash2, 
  ArrowDownToLine, 
  Layers, 
  DollarSign, 
  FileText, 
  Info,
  Loader2,
  AlertCircle,
  Truck
} from 'lucide-react';
import { LocalProduct, LocalBatch, StockIntakeItem, StockIntakeResult } from '../../lib/inventory/types';
import { submitStockIntake } from '../../lib/inventory/service';
import { formatMinorUnits } from '../pos/formatters';
import { supabase } from '../../lib/supabase';
import { Supplier, listSuppliers } from '../../lib/suppliers/index';

interface StockIntakeModalProps {
  pharmacyId: string;
  pharmacyName: string;
  currency: string;
  branchId: string;
  branchName: string;
  products: LocalProduct[];
  batchesMap: Record<string, LocalBatch[]>;
  isOnline: boolean;
  onClose: () => void;
  onIntakeSuccess: (result: StockIntakeResult) => void;
}

export const StockIntakeModal: React.FC<StockIntakeModalProps> = ({
  pharmacyId,
  pharmacyName,
  currency,
  branchId,
  branchName,
  products,
  batchesMap,
  isOnline,
  onClose,
  onIntakeSuccess
}) => {
  // Manifest & Order Level State
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([]);
  const [isLoadingSuppliersList, setIsLoadingSuppliersList] = useState<boolean>(false);
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [manifestItems, setManifestItems] = useState<StockIntakeItem[]>([]);

  // Load suppliers for active pharmacy
  useEffect(() => {
    let isMounted = true;
    if (!pharmacyId) return;
    setIsLoadingSuppliersList(true);
    listSuppliers(supabase, pharmacyId)
      .then((res) => {
        if (isMounted && res.success) {
          setSuppliersList(res.suppliers);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsLoadingSuppliersList(false);
      });
    return () => {
      isMounted = false;
    };
  }, [pharmacyId]);

  // Current Item Editor State
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [useExistingBatch, setUseExistingBatch] = useState<boolean>(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [batchNumber, setBatchNumber] = useState<string>('');
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('1');
  const [costPriceMajor, setCostPriceMajor] = useState<string>('0');
  const [sellingPriceMajor, setSellingPriceMajor] = useState<string>('0');
  const [itemValidationError, setItemValidationError] = useState<string | null>(null);

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [completedResult, setCompletedResult] = useState<StockIntakeResult | null>(null);

  // Selected Product Reference
  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === selectedProductId) || null;
  }, [products, selectedProductId]);

  // Existing Batches for Selected Product
  const productBatches = useMemo(() => {
    if (!selectedProductId) return [];
    return batchesMap[selectedProductId] || [];
  }, [batchesMap, selectedProductId]);

  // Handle Product Selection Change
  const handleSelectProduct = (prodId: string) => {
    setSelectedProductId(prodId);
    setItemValidationError(null);
    const prod = products.find((p) => p.id === prodId);
    if (prod) {
      setSellingPriceMajor((prod.selling_price / 100).toFixed(2));
      setCostPriceMajor((prod.cost_price / 100).toFixed(2));
      // Reset batch inputs
      setUseExistingBatch(false);
      setSelectedBatchId('');
      setBatchNumber('');
      setExpiryDate('');
    }
  };

  // Handle Existing Batch Selection
  const handleSelectBatch = (batchId: string) => {
    setSelectedBatchId(batchId);
    const b = productBatches.find((item) => item.id === batchId);
    if (b) {
      setBatchNumber(b.batch_number);
      setExpiryDate(b.expiry_date);
      if (b.cost_price > 0) setCostPriceMajor((b.cost_price / 100).toFixed(2));
      if (b.selling_price > 0) setSellingPriceMajor((b.selling_price / 100).toFixed(2));
    }
  };

  // Add Item to Manifest
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    setItemValidationError(null);

    if (!selectedProduct) {
      setItemValidationError('Please select a product to receive.');
      return;
    }

    const trimmedBatchNo = batchNumber.trim();
    if (!trimmedBatchNo) {
      setItemValidationError('Batch number is required.');
      return;
    }

    if (!expiryDate || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
      setItemValidationError('A valid expiry date (YYYY-MM-DD) is required.');
      return;
    }

    const qtyNum = parseInt(quantity, 10);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setItemValidationError('Intake quantity must be a positive integer.');
      return;
    }

    const costMajorNum = parseFloat(costPriceMajor);
    if (isNaN(costMajorNum) || costMajorNum < 0) {
      setItemValidationError('Cost price cannot be negative.');
      return;
    }

    const sellMajorNum = parseFloat(sellingPriceMajor);
    if (isNaN(sellMajorNum) || sellMajorNum < 0) {
      setItemValidationError('Selling price cannot be negative.');
      return;
    }

    const costMinor = Math.round(costMajorNum * 100);
    const sellMinor = Math.round(sellMajorNum * 100);

    const newItem: StockIntakeItem = {
      product_id: selectedProduct.id,
      product_name: selectedProduct.name,
      batch_number: trimmedBatchNo,
      expiry_date: expiryDate,
      quantity: qtyNum,
      cost_price: costMinor,
      selling_price: sellMinor,
      batch_id: useExistingBatch && selectedBatchId ? selectedBatchId : null
    };

    setManifestItems((prev) => [...prev, newItem]);

    // Reset item form fields for next entry
    setSelectedProductId('');
    setSelectedBatchId('');
    setBatchNumber('');
    setExpiryDate('');
    setQuantity('1');
    setCostPriceMajor('0');
    setSellingPriceMajor('0');
    setUseExistingBatch(false);
  };

  // Remove Item from Manifest
  const handleRemoveItem = (index: number) => {
    setManifestItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Manifest Totals
  const manifestTotalQuantity = manifestItems.reduce((sum, item) => sum + item.quantity, 0);
  const manifestTotalCost = manifestItems.reduce((sum, item) => sum + (item.quantity * item.cost_price), 0);

  // Submit Authoritative Intake
  const handleSubmitIntake = async () => {
    if (manifestItems.length === 0) return;
    if (!isOnline) {
      setSubmitError('Offline: Stock intake requires an active server connection to PostgreSQL.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await submitStockIntake({
        pharmacy_id: pharmacyId,
        branch_id: branchId,
        items: manifestItems,
        supplier_id: selectedSupplierId ? selectedSupplierId.toLowerCase().trim() : undefined,
        invoice_number: invoiceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        client_op_id: crypto.randomUUID()
      });

      if (!result.success) {
        setSubmitError(result.error || 'Failed to commit stock intake on PostgreSQL.');
        setIsSubmitting(false);
        return;
      }

      setCompletedResult(result);
      setIsSubmitting(false);
      onIntakeSuccess(result);
    } catch (err: any) {
      setSubmitError(err.message || 'An unexpected error occurred during stock intake submission.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800/80 flex items-start justify-between gap-4 bg-slate-950/50">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
              <ArrowDownToLine className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Receive Inventory & Stock Intake
                </h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                  {pharmacyName}
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Branch: {branchName}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Authoritative PostgreSQL intake with atomic stock ledger journal and batch allocation
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Completed Success View */}
          {completedResult ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Stock Intake Committed Successfully</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Authoritative inventory has been committed to PostgreSQL. Stock ledger movements recorded as PURCHASE.
                </p>
              </div>

              <div className="max-w-md mx-auto bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-left space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Purchase Reference:</span>
                  <span className="font-mono text-emerald-400 font-semibold">{completedResult.purchase_id}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Total Line Items:</span>
                  <span className="font-mono text-slate-200">{completedResult.total_items} items ({manifestTotalQuantity} units)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Total Purchase Value:</span>
                  <span className="font-mono text-emerald-400 font-bold">{formatMinorUnits(manifestTotalCost, currency)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Processed At:</span>
                  <span className="text-slate-300">{new Date(completedResult.processed_at || Date.now()).toLocaleString()}</span>
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold text-xs shadow-lg transition cursor-pointer"
                >
                  Return to Inventory
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Header / Waybill Metadata Form */}
              <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span>Invoice & Receiving Metadata</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Truck className="w-3 h-3 text-slate-400" />
                        <span>Supplier (Optional)</span>
                      </span>
                      {isLoadingSuppliersList && (
                        <span className="text-[10px] text-slate-500 font-normal">Loading...</span>
                      )}
                    </label>
                    <select
                      value={selectedSupplierId}
                      onChange={(e) => setSelectedSupplierId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">None (Direct / Internal Stock Intake)</option>
                      {suppliersList.map((sup) => (
                        <option key={sup.id} value={sup.id}>
                          {sup.name} {sup.contact_person ? `(${sup.contact_person})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Invoice / Waybill Number
                    </label>
                    <input
                      type="text"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      placeholder="e.g. INV-2026-1004"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Notes / Remarks
                    </label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g. Routine distributor restocking"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Item Entry Sub-form */}
              <form onSubmit={handleAddItem} className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-slate-400" />
                    <span>Add Item to Intake Manifest</span>
                  </h3>
                  {selectedProduct && productBatches.length > 0 && (
                    <div className="flex items-center gap-2 text-xs">
                      <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useExistingBatch}
                          onChange={(e) => {
                            setUseExistingBatch(e.target.checked);
                            if (!e.target.checked) setSelectedBatchId('');
                          }}
                          className="rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>Restock Existing Batch</span>
                      </label>
                    </div>
                  )}
                </div>

                {itemValidationError && (
                  <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{itemValidationError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 text-xs">
                  {/* Product Picker */}
                  <div className="lg:col-span-2">
                    <label className="block text-slate-300 font-medium mb-1">
                      Product <span className="text-rose-400">*</span>
                    </label>
                    <select
                      value={selectedProductId}
                      onChange={(e) => handleSelectProduct(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">-- Select Product --</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.sku ? `(${p.sku})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Quantity */}
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Intake Quantity <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Existing Batch Dropdown if toggled */}
                  {useExistingBatch && productBatches.length > 0 && (
                    <div className="lg:col-span-3">
                      <label className="block text-slate-300 font-medium mb-1">
                        Select Existing Batch to Restock
                      </label>
                      <select
                        value={selectedBatchId}
                        onChange={(e) => handleSelectBatch(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="">-- Choose Existing Batch --</option>
                        {productBatches.map((b) => (
                          <option key={b.id} value={b.id}>
                            Lot: {b.batch_number} | Exp: {b.expiry_date} | Current Stock: {b.projected_stock}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Batch Number */}
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Batch / Lot Number <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={batchNumber}
                      onChange={(e) => setBatchNumber(e.target.value)}
                      placeholder="e.g. LOT-2026-X1"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Expiry Date */}
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Expiry Date <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="date"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Cost Price */}
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Unit Cost ({currency})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={costPriceMajor}
                      onChange={(e) => setCostPriceMajor(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Selling Price */}
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Unit Selling Price ({currency})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={sellingPriceMajor}
                      onChange={(e) => setSellingPriceMajor(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 font-medium text-xs flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add to Manifest</span>
                  </button>
                </div>
              </form>

              {/* Manifest Items Table */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden">
                <div className="p-3.5 border-b border-slate-800/80 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Intake Manifest ({manifestItems.length} items, {manifestTotalQuantity} units)</span>
                  </h3>
                  <div className="text-xs font-medium text-emerald-400">
                    Total Value: <span className="font-mono font-bold">{formatMinorUnits(manifestTotalCost, currency)}</span>
                  </div>
                </div>

                {manifestItems.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    No items in intake manifest yet. Use the form above to add products.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-950 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                          <th className="py-2.5 px-3">Product</th>
                          <th className="py-2.5 px-3">Batch Number</th>
                          <th className="py-2.5 px-3">Expiry Date</th>
                          <th className="py-2.5 px-3 text-right">Quantity</th>
                          <th className="py-2.5 px-3 text-right">Unit Cost</th>
                          <th className="py-2.5 px-3 text-right">Line Total</th>
                          <th className="py-2.5 px-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {manifestItems.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/40">
                            <td className="py-2 px-3 font-sans font-medium text-slate-200">
                              {item.product_name}
                            </td>
                            <td className="py-2 px-3 text-slate-300">
                              {item.batch_number}
                              {item.batch_id && (
                                <span className="ml-1 text-[10px] text-teal-400 font-sans">(restock)</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-slate-300">
                              {item.expiry_date}
                            </td>
                            <td className="py-2 px-3 text-right text-emerald-400 font-bold">
                              +{item.quantity}
                            </td>
                            <td className="py-2 px-3 text-right text-slate-300">
                              {formatMinorUnits(item.cost_price, currency)}
                            </td>
                            <td className="py-2 px-3 text-right text-emerald-400 font-semibold">
                              {formatMinorUnits(item.quantity * item.cost_price, currency)}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                className="p-1 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition cursor-pointer"
                                title="Remove item"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Submission Error Banner */}
              {submitError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{submitError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSubmitError(null)}
                    className="text-xs text-rose-400 hover:text-rose-200 font-medium"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!completedResult && (
          <div className="p-4 bg-slate-950/70 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Atomic PostgreSQL commit with immutable stock ledger journal
              </span>
            </div>
            <div className="flex items-center gap-2.5 self-end sm:self-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitIntake}
                disabled={manifestItems.length === 0 || isSubmitting || !isOnline}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Committing to Server...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Commit Stock Intake ({manifestItems.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
