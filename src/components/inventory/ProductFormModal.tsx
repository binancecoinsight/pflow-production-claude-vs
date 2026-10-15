import React, { useState, useEffect, useCallback } from 'react';
import { X, Package, Tag, Barcode, DollarSign, AlertCircle, AlertTriangle, ShieldCheck, Loader2, WifiOff } from 'lucide-react';
import { LocalProduct } from '../../lib/inventory/types';
import {
  createCatalogProduct,
  updateCatalogProduct,
  checkProductDuplicates,
  parseMajorCurrencyToMinor
} from '../../lib/inventory/service';
import { supabase } from '../../lib/supabase';
import { isOnline } from '../../lib/offline/network';

interface ProductFormModalProps {
  isOpen: boolean;
  pharmacyId: string;
  currency: string;
  product?: LocalProduct | null; // Null/undefined for Create, LocalProduct for Edit
  onSaveSuccess: (product: LocalProduct) => void;
  onClose: () => void;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  pharmacyId,
  currency,
  product,
  onSaveSuccess,
  onClose
}) => {
  const isEdit = Boolean(product);

  // Form field states strictly mapped to existing public.products columns
  const [name, setName] = useState<string>('');
  const [genericName, setGenericName] = useState<string>('');
  const [sku, setSku] = useState<string>('');
  const [barcode, setBarcode] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [unit, setUnit] = useState<string>('');
  const [sellingPriceMajor, setSellingPriceMajor] = useState<string>('0.00');
  const [costPriceMajor, setCostPriceMajor] = useState<string>('0.00');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

  // Advisory duplicate conflicts state
  const [skuConflict, setSkuConflict] = useState<LocalProduct | null>(null);
  const [barcodeConflict, setBarcodeConflict] = useState<LocalProduct | null>(null);

  // Submission & Validation States
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean>(isOnline());

  // Populate form on open / product change
  useEffect(() => {
    if (!isOpen) return;

    setOnline(isOnline());
    setErrorMessage(null);
    setSkuConflict(null);
    setBarcodeConflict(null);

    if (product) {
      setName(product.name || '');
      setGenericName(product.generic_name || '');
      setSku(product.sku || '');
      setBarcode(product.barcode || '');
      setCategory(product.category || '');
      setUnit(product.unit || '');
      setSellingPriceMajor((product.selling_price / 100).toFixed(2));
      setCostPriceMajor((product.cost_price / 100).toFixed(2));
      setStatus(product.status?.toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE');
    } else {
      setName('');
      setGenericName('');
      setSku('');
      setBarcode('');
      setCategory('');
      setUnit('');
      setSellingPriceMajor('0.00');
      setCostPriceMajor('0.00');
      setStatus('ACTIVE');
    }
  }, [isOpen, product]);

  // Advisory Debounced Duplicate Pre-Check
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(async () => {
      try {
        const { skuConflict: sConf, barcodeConflict: bConf } = await checkProductDuplicates(pharmacyId, {
          sku: sku.trim() || null,
          barcode: barcode.trim() || null,
          excludeProductId: product?.id
        });
        setSkuConflict(sConf);
        setBarcodeConflict(bConf);
      } catch {
        // Silently tolerate pre-check errors
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [isOpen, pharmacyId, sku, barcode, product?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!online) {
      setErrorMessage('Cannot save product: active server connection to PostgreSQL is required.');
      return;
    }

    const cleanName = name.trim();
    if (!cleanName) {
      setErrorMessage('Product name is required.');
      return;
    }

    // Convert selling price to integer minor units
    const sellParse = parseMajorCurrencyToMinor(sellingPriceMajor);
    if (!sellParse.success || sellParse.value === undefined) {
      setErrorMessage(sellParse.error || 'Invalid selling price');
      return;
    }

    // Convert cost price to integer minor units
    const costParse = parseMajorCurrencyToMinor(costPriceMajor || '0');
    if (!costParse.success || costParse.value === undefined) {
      setErrorMessage(costParse.error || 'Invalid cost price');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (isEdit && product) {
        const result = await updateCatalogProduct(supabase, pharmacyId, product.id, {
          name: cleanName,
          generic_name: genericName.trim() || null,
          sku: sku.trim() || null,
          barcode: barcode.trim() || null,
          category: category.trim() || null,
          unit: unit.trim() || null,
          selling_price: sellParse.value,
          cost_price: costParse.value,
          status
        });

        if (!result.success || !result.product) {
          setErrorMessage(result.error || 'Failed to update product in catalog.');
          return;
        }

        onSaveSuccess(result.product);
        onClose();
      } else {
        const result = await createCatalogProduct(supabase, pharmacyId, {
          name: cleanName,
          generic_name: genericName.trim() || null,
          sku: sku.trim() || null,
          barcode: barcode.trim() || null,
          category: category.trim() || null,
          unit: unit.trim() || null,
          selling_price: sellParse.value,
          cost_price: costParse.value,
          status
        });

        if (!result.success || !result.product) {
          setErrorMessage(result.error || 'Failed to create product in catalog.');
          return;
        }

        onSaveSuccess(result.product);
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unexpected error during catalog update';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-form-title"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 id="product-form-title" className="text-base sm:text-lg font-bold text-white tracking-tight">
                {isEdit ? 'Edit Product in Catalog' : 'Create New Catalog Product'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Master product master data • Persisted directly to PostgreSQL
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Offline Warning Banner */}
        {!online && (
          <div className="p-3 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>Product creation and modification require an active server connection to PostgreSQL.</span>
          </div>
        )}

        {/* Form Error Banner */}
        {errorMessage && (
          <div className="p-3 bg-rose-500/10 border-b border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Product Name (Required) */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Product Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Paracetamol 500mg Tablets"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition"
            />
          </div>

          {/* Generic Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Generic Name <span className="text-slate-500 text-[10px]">(Optional)</span>
            </label>
            <input
              type="text"
              value={genericName}
              onChange={(e) => setGenericName(e.target.value)}
              placeholder="e.g. Acetaminophen"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition"
            />
          </div>

          {/* SKU & Barcode Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <Tag className="w-3 h-3 text-slate-400" />
                <span>SKU Code</span>
              </label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="e.g. PARA-500-TAB"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <Barcode className="w-3 h-3 text-slate-400" />
                <span>Barcode</span>
              </label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="e.g. 5012345678900"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition"
              />
            </div>
          </div>

          {/* Advisory Duplicate Warnings */}
          {(skuConflict || barcodeConflict) && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Advisory Duplicate Warning (Pharmacy-Scoped)</span>
              </div>
              {skuConflict && (
                <p className="text-[11px] text-amber-200">
                  • SKU <strong>"{skuConflict.sku}"</strong> is already assigned to <strong>"{skuConflict.name}"</strong> ({skuConflict.status}).
                </p>
              )}
              {barcodeConflict && (
                <p className="text-[11px] text-amber-200">
                  • Barcode <strong>"{barcodeConflict.barcode}"</strong> is already assigned to <strong>"{barcodeConflict.name}"</strong> ({barcodeConflict.status}).
                </p>
              )}
              <p className="text-[10px] text-amber-400/80 pt-1 border-t border-amber-500/20 italic">
                * Advisory client pre-check only. PostgreSQL does not enforce uniqueness. Confirming does not guarantee uniqueness.
              </p>
            </div>
          )}

          {/* Category & Unit Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Category</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Analgesics, Antibiotics"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Unit of Measure</label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="e.g. Box, Bottle, Blister Pack"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition"
              />
            </div>
          </div>

          {/* Financials: Selling Price & Cost Price (Major Currency Units -> Minor Units) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-emerald-400" />
                <span>Selling Price ({currency})</span>
                <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={sellingPriceMajor}
                onChange={(e) => setSellingPriceMajor(e.target.value)}
                placeholder="0.00"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-emerald-400 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Converted to integer minor units</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-slate-400" />
                <span>Cost Price ({currency})</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={costPriceMajor}
                onChange={(e) => setCostPriceMajor(e.target.value)}
                placeholder="0.00"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-300 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Internal reference cost</span>
            </div>
          </div>

          {/* Status Lifecycle: ACTIVE / INACTIVE */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Lifecycle Status
            </label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="ACTIVE"
                  checked={status === 'ACTIVE'}
                  onChange={() => setStatus('ACTIVE')}
                  className="text-emerald-500 focus:ring-emerald-500"
                />
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  ACTIVE
                </span>
                <span className="text-slate-400 text-[11px]">Available for POS sales and stock operations</span>
              </label>
            </div>
            <div className="flex items-center gap-3 mt-1.5">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="INACTIVE"
                  checked={status === 'INACTIVE'}
                  onChange={() => setStatus('INACTIVE')}
                  className="text-rose-500 focus:ring-rose-500"
                />
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  INACTIVE
                </span>
                <span className="text-slate-400 text-[11px]">Retired from sales. Historical records preserved.</span>
              </label>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !online}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition cursor-pointer disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>{isEdit ? 'Save Changes' : 'Create Product'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
