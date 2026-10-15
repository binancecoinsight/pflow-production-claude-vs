import React, { useState, useEffect, useRef } from 'react';
import { 
  X, CheckCircle, Plus, Trash2, ArrowLeft, 
  Sparkles, User, Building2, CreditCard, FileText, 
  Calendar, Download, Image as ImageIcon, Printer, 
  ChevronDown, Check, Eye, Edit3, Search, RefreshCw
} from 'lucide-react';
import { Invoice, InvoiceItem, Account, Product } from '../types';
import { 
  INVOICE_TEMPLATES, 
  POPULAR_PAPER_SIZES, 
  PopularPaperSize, 
  InvoiceTemplate,
  PaperSizeConfig 
} from '../constants/invoiceTemplates';
import { useSettings } from '../context/SettingsContext';
import { useNotification } from '../context/NotificationContext';
import { apiFetch } from '../lib/api';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import jsPDF from 'jspdf';
import * as htmlToImage from 'html-to-image';
import { printerService, ReceiptData } from '../services/printerService';
import type { PrintData } from '../utils/printer';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface InvoiceEditorModalProps {
  initialTemplateId?: string;
  initialInvoice?: Invoice | null;
  onClose: () => void;
  onSaveSuccess: () => void;
  onBackToTemplates?: () => void;
}

export default function InvoiceEditorModal({
  initialTemplateId = 'classic',
  initialInvoice = null,
  onClose,
  onSaveSuccess,
  onBackToTemplates
}: InvoiceEditorModalProps) {
  const { settings } = useSettings();
  const { showNotification } = useNotification();
  const printRef = useRef<HTMLDivElement>(null);

  // Active Template
  const [activeTemplateId, setActiveTemplateId] = useState<string>(
    initialInvoice?.templateId || initialTemplateId || 'classic'
  );
  const currentTemplate: InvoiceTemplate = 
    INVOICE_TEMPLATES.find(t => t.id === activeTemplateId) || INVOICE_TEMPLATES[0];

  // Paper Size state (A4 default)
  const [paperSize, setPaperSize] = useState<PopularPaperSize>('a4');
  const activePaperConfig: PaperSizeConfig = 
    POPULAR_PAPER_SIZES.find(p => p.id === paperSize) || POPULAR_PAPER_SIZES[0];

  // Mobile view tab: 'edit' or 'preview'
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit');

  // Accounts & Products
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false);

  // New customer inline entry
  const [isAddingNewCustomer, setIsAddingNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    email: '',
    address: ''
  });

  // Manual item input
  const [manualItem, setManualItem] = useState({
    name: '',
    quantity: 1,
    price: 0
  });

  const [selectedProductId, setSelectedProductId] = useState('');
  const [productSearch, setProductSearch] = useState('');

  // Form Data
  const [formData, setFormData] = useState({
    accountId: initialInvoice?.accountId || '',
    accountName: initialInvoice?.accountName || '',
    dueDate: initialInvoice?.dueDate ? initialInvoice.dueDate.split('T')[0] : '',
    notes: initialInvoice?.notes || '',
    customerPhone: initialInvoice?.customerPhone || '',
    customerEmail: initialInvoice?.customerEmail || '',
    customerAddress: initialInvoice?.customerAddress || '',
    items: (initialInvoice?.items || []).map(item => ({ ...item })) as Partial<InvoiceItem>[],
    storeName: initialInvoice?.storeName || settings?.storeName || '',
    storeAddress: initialInvoice?.storeAddress || settings?.storeAddress || '',
    storePhone: initialInvoice?.storePhone || settings?.phoneNumber || '',
    storeEmail: initialInvoice?.storeEmail || settings?.storeEmail || '',
    bankName: initialInvoice?.bankName || settings?.bankName || '',
    accountName_store: initialInvoice?.accountName_store || settings?.accountName || '',
    accountNumber_store: initialInvoice?.accountNumber_store || settings?.accountNumber || '',
    templateId: initialInvoice?.templateId || initialTemplateId || 'classic',
  });

  // Sync with template
  useEffect(() => {
    setFormData(prev => ({ ...prev, templateId: activeTemplateId }));
  }, [activeTemplateId]);

  // Fetch accounts and products
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [accRes, prodRes] = await Promise.all([
          apiFetch('/api/accounts'),
          apiFetch('/api/products')
        ]);
        const accData = await accRes.json();
        const prodData = await prodRes.json();
        setAccounts(Array.isArray(accData) ? accData : []);
        setProducts(Array.isArray(prodData) ? prodData : []);
      } catch (err) {
        console.error('Failed to load accounts/products:', err);
      } finally {
        setLoadingData(false);
      }
    };
    fetchData();
  }, []);

  // Item Management
  const addProductItem = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existingIdx = formData.items.findIndex(i => i.productId === product.id);
    if (existingIdx !== -1) {
      // Increment existing
      const updated = [...formData.items];
      const cur = updated[existingIdx];
      const newQty = (cur.quantity || 1) + 1;
      updated[existingIdx] = {
        ...cur,
        quantity: newQty,
        total: newQty * (cur.price || product.price)
      };
      setFormData(prev => ({ ...prev, items: updated }));
    } else {
      const newItem: Partial<InvoiceItem> = {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        price: product.price,
        total: product.price
      };
      setFormData(prev => ({ ...prev, items: [...prev.items, newItem] }));
    }
    setSelectedProductId('');
  };

  const addManualItem = () => {
    if (!manualItem.name.trim()) {
      showNotification('error', 'Please enter an item name');
      return;
    }
    const newItem: Partial<InvoiceItem> = {
      productName: manualItem.name.trim(),
      quantity: Math.max(1, manualItem.quantity),
      price: Math.max(0, manualItem.price),
      total: Math.max(1, manualItem.quantity) * Math.max(0, manualItem.price)
    };
    setFormData(prev => ({ ...prev, items: [...prev.items, newItem] }));
    setManualItem({ name: '', quantity: 1, price: 0 });
  };

  const updateItem = (index: number, updates: Partial<InvoiceItem>) => {
    setFormData(prev => {
      const newItems = [...prev.items];
      const item = { ...newItems[index], ...updates };
      if (updates.quantity !== undefined || updates.price !== undefined) {
        item.total = (item.quantity || 0) * (item.price || 0);
      }
      newItems[index] = item;
      return { ...prev, items: newItems };
    });
  };

  const removeItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const totalAmount = formData.items.reduce((sum, item) => sum + (item.total || 0), 0);
  const currencySymbol = settings?.currencySymbol || '₦';
  const isDarkTemplate = currentTemplate.id === 'premium';
  const isThermal = activePaperConfig.category === 'thermal';

  // Live Simulated Invoice for Live Preview
  const livePreviewInvoice: Invoice = {
    id: initialInvoice?.id || 'live-preview',
    invoiceNumber: initialInvoice?.invoiceNumber || 'INV-DRAFT',
    timestamp: initialInvoice?.timestamp || new Date().toISOString(),
    status: initialInvoice?.status || 'unpaid',
    totalAmount,
    ...formData,
    accountId: formData.accountId || (isAddingNewCustomer ? 'new' : ''),
    accountName: isAddingNewCustomer 
      ? (newCustomer.name || 'New Customer') 
      : (formData.accountName || 'Select Customer'),
    customerPhone: isAddingNewCustomer ? newCustomer.phone : formData.customerPhone,
    customerEmail: isAddingNewCustomer ? newCustomer.email : formData.customerEmail,
    customerAddress: isAddingNewCustomer ? newCustomer.address : formData.customerAddress,
    templateId: activeTemplateId,
    items: formData.items.map((item, idx) => ({
      id: item.id || `live-${idx}`,
      invoiceId: 'live',
      productName: item.productName || 'Unnamed Product',
      quantity: item.quantity || 1,
      price: item.price || 0,
      total: item.total || 0
    }))
  };

  // Submit & Save
  const handleSave = async () => {
    if ((!formData.accountId && !isAddingNewCustomer) || formData.items.length === 0) {
      showNotification('error', 'Please select or add a customer and include at least one item');
      return;
    }

    if (isAddingNewCustomer && !newCustomer.name.trim()) {
      showNotification('error', 'Please enter the new customer name');
      return;
    }

    setIsSubmitting(true);
    try {
      let finalAccountId = formData.accountId;
      let finalAccountName = formData.accountName;

      // Create new customer account if requested
      if (isAddingNewCustomer) {
        const accRes = await apiFetch('/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...newCustomer,
            totalDebt: 0,
            createdAt: new Date().toISOString()
          })
        });

        if (!accRes.ok) {
          const err = await accRes.json();
          throw new Error(err.error || 'Failed to register customer');
        }

        const savedAcc = await accRes.json();
        finalAccountId = savedAcc.id;
        finalAccountName = savedAcc.name;
      }

      const payload = {
        ...formData,
        accountId: finalAccountId,
        accountName: finalAccountName,
        customerPhone: isAddingNewCustomer ? newCustomer.phone : formData.customerPhone,
        customerEmail: isAddingNewCustomer ? newCustomer.email : formData.customerEmail,
        customerAddress: isAddingNewCustomer ? newCustomer.address : formData.customerAddress,
        templateId: activeTemplateId,
        totalAmount
      };

      const res = await apiFetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to save invoice');
      }

      showNotification('success', 'Invoice generated and saved successfully!');
      onSaveSuccess();
      onClose();
    } catch (err: any) {
      console.error('Invoice save error:', err);
      showNotification('error', err.message || 'Error occurred while saving invoice');
    } finally {
      setIsSubmitting(false);
    }
  };

  // PDF Export
  const handleExportPdf = async () => {
    if (!printRef.current) return;
    setIsExportingPdf(true);

    try {
      const el = printRef.current;
      const bgColor = isDarkTemplate ? '#090d16' : '#ffffff';

      const imgData = await htmlToImage.toJpeg(el, {
        quality: 0.98,
        pixelRatio: 2.0,
        backgroundColor: bgColor,
        filter: (node: any) => !node.classList?.contains('no-export')
      });

      let pdf: jsPDF;

      if (isThermal) {
        const widthMm = activePaperConfig.widthMm;
        const heightMm = Math.max(120, (el.scrollHeight * widthMm) / el.clientWidth);
        pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: [widthMm, heightMm],
          compress: true
        });
        pdf.addImage(imgData, 'JPEG', 0, 0, widthMm, heightMm, undefined, 'FAST');
      } else {
        const format = activePaperConfig.id === 'letter' ? 'letter' : activePaperConfig.id === 'a5' ? 'a5' : 'a4';
        pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: format,
          compress: true
        });

        const pdfWidth = activePaperConfig.widthMm;
        const pageHeight = activePaperConfig.heightMm || 297;
        const imgHeight = (el.scrollHeight * pdfWidth) / el.clientWidth;
        const totalPages = Math.ceil(imgHeight / pageHeight);

        for (let i = 0; i < totalPages; i++) {
          if (i > 0) pdf.addPage(format, 'portrait');
          pdf.addImage(imgData, 'JPEG', 0, -(i * pageHeight), pdfWidth, imgHeight, undefined, 'FAST');
        }
      }

      const pdfBlob = pdf.output('blob');
      const fileName = `Invoice_${livePreviewInvoice.invoiceNumber}_${activePaperConfig.id.toUpperCase()}.pdf`;
      const { saveFile } = await import('../utils/fileSaver');
      await saveFile(fileName, pdfBlob, 'application/pdf');
      showNotification('success', `Invoice exported as PDF (${activePaperConfig.name})`);
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      showNotification('error', 'Failed to generate PDF');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // PNG Export
  const handleExportPng = async () => {
    if (!printRef.current) return;
    setIsExportingPng(true);

    try {
      const el = printRef.current;
      const bgColor = isDarkTemplate ? '#090d16' : '#ffffff';

      const dataUrl = await htmlToImage.toPng(el, {
        quality: 1.0,
        pixelRatio: 2.5,
        backgroundColor: bgColor,
        filter: (node: any) => !node.classList?.contains('no-export')
      });

      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const fileName = `Invoice_${livePreviewInvoice.invoiceNumber}.png`;
      const { saveFile } = await import('../utils/fileSaver');
      await saveFile(fileName, blob, 'image/png');
      showNotification('success', 'Invoice exported as high-resolution PNG');
    } catch (err: any) {
      console.error('Error generating PNG:', err);
      showNotification('error', 'Failed to export PNG');
    } finally {
      setIsExportingPng(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2 sm:p-4 lg:p-6 pt-12 lg:pt-14 overflow-y-auto">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/75 backdrop-blur-md z-0"
      />

      {/* Main Studio Window */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: -16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        className="relative z-10 w-full max-w-[1550px] bg-brand-surface rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[94vh] border border-brand-border"
      >
        {/* ========================================================================= */}
        {/* TOP WORKSPACE NAVIGATION & TOOLBAR (Never Obstructed, Sticky)            */}
        {/* ========================================================================= */}
        <div className="px-5 py-3.5 sm:px-8 sm:py-4 border-b border-brand-border bg-brand-surface/95 backdrop-blur-md flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 shrink-0">
          {/* Left: Back to Templates & Current Template Badge */}
          <div className="flex items-center gap-3">
            {onBackToTemplates && (
              <button
                type="button"
                onClick={onBackToTemplates}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-border bg-brand-bg text-xs font-bold text-brand-muted hover:text-brand-text hover:border-brand-accent/50 transition-colors"
                title="Choose a different template"
              >
                <ArrowLeft size={14} />
                <span className="hidden sm:inline">Templates</span>
              </button>
            )}

            {/* Template Selector Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsTemplateMenuOpen(!isTemplateMenuOpen)}
                className="flex items-center gap-2 px-3 py-1.5 bg-brand-bg rounded-xl border border-brand-border text-xs font-bold text-brand-text hover:border-brand-accent/50 transition-all shadow-xs"
              >
                <div 
                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                  style={{ backgroundColor: currentTemplate.primaryColor }}
                />
                <span className="font-extrabold truncate max-w-[130px]">{currentTemplate.name}</span>
                <ChevronDown size={14} className="text-brand-muted" />
              </button>

              <AnimatePresence>
                {isTemplateMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.95 }}
                    className="absolute left-0 top-full mt-2 w-64 p-2 bg-brand-surface rounded-2xl shadow-2xl border border-brand-border z-50 max-h-80 overflow-y-auto"
                  >
                    <p className="text-[10px] font-black text-brand-muted uppercase tracking-widest px-3 py-1.5">
                      Switch Invoice Template
                    </p>
                    <div className="space-y-1">
                      {INVOICE_TEMPLATES.map((tmpl) => (
                        <button
                          key={tmpl.id}
                          onClick={() => {
                            setActiveTemplateId(tmpl.id);
                            setIsTemplateMenuOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs font-bold transition-all",
                            activeTemplateId === tmpl.id
                              ? "bg-brand-accent text-white shadow-sm"
                              : "text-brand-text hover:bg-brand-bg"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span 
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: tmpl.primaryColor }}
                            />
                            <span className="truncate">{tmpl.name}</span>
                          </div>
                          {activeTemplateId === tmpl.id && (
                            <Check size={14} className="shrink-0 stroke-[3]" />
                          )}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Mobile Tab Toggle (Screens < xl) */}
            <div className="flex xl:hidden items-center p-1 bg-brand-bg rounded-xl border border-brand-border">
              <button
                type="button"
                onClick={() => setMobileTab('edit')}
                className={cn(
                  "px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5",
                  mobileTab === 'edit'
                    ? "bg-brand-accent text-white shadow-xs"
                    : "text-brand-muted hover:text-brand-text"
                )}
              >
                <Edit3 size={13} />
                <span>Edit</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileTab('preview')}
                className={cn(
                  "px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5",
                  mobileTab === 'preview'
                    ? "bg-brand-accent text-white shadow-xs"
                    : "text-brand-muted hover:text-brand-text"
                )}
              >
                <Eye size={13} />
                <span>Live Preview</span>
              </button>
            </div>
          </div>

          {/* Center: Paper Size Segmented Tabs */}
          <div className="flex items-center gap-1 p-1 bg-brand-bg rounded-xl border border-brand-border">
            {POPULAR_PAPER_SIZES.map((size) => (
              <button
                key={size.id}
                type="button"
                onClick={() => setPaperSize(size.id)}
                title={`${size.name}: ${size.dimensions} (${size.description})`}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1",
                  paperSize === size.id
                    ? "bg-brand-accent text-white shadow-xs"
                    : "text-brand-muted hover:text-brand-text hover:bg-brand-surface/60"
                )}
              >
                <span>{size.name}</span>
                {size.category === 'thermal' && (
                  <span className={cn(
                    "text-[8.5px] px-1 py-0.2 rounded font-mono uppercase",
                    paperSize === size.id ? "bg-white/20 text-white" : "bg-brand-border/60 text-brand-muted"
                  )}>
                    POS
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Right: Quick Exports, Save Button, Close */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportPng}
              disabled={isExportingPng || isExportingPdf}
              className="hidden md:flex items-center gap-1.5 px-3 py-2 bg-brand-bg hover:bg-brand-accent/10 hover:text-brand-accent rounded-xl border border-brand-border text-xs font-bold text-brand-text transition-colors disabled:opacity-50"
              title="Download PNG image"
            >
              {isExportingPng ? (
                <div className="w-3.5 h-3.5 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
              ) : (
                <ImageIcon size={15} />
              )}
              <span>PNG</span>
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf || isExportingPng}
              className="hidden md:flex items-center gap-1.5 px-3 py-2 bg-brand-bg hover:bg-brand-accent/10 hover:text-brand-accent rounded-xl border border-brand-border text-xs font-bold text-brand-text transition-colors disabled:opacity-50"
              title={`Download PDF in ${activePaperConfig.name} format`}
            >
              {isExportingPdf ? (
                <div className="w-3.5 h-3.5 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download size={15} />
              )}
              <span>PDF</span>
            </button>

            {/* Primary Save Button */}
            <button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting || formData.items.length === 0}
              className="btn-primary px-5 py-2 text-xs flex items-center gap-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle size={15} />
                  <span>Save Invoice</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-brand-bg rounded-xl transition-colors text-brand-muted hover:text-brand-text"
              title="Close editor"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* MAIN BODY: 2-COLUMN SPLIT (Left: Unobstructed Edits, Right: Live Preview)  */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 xl:grid-cols-12 bg-brand-bg/30">
          {/* ==================== LEFT COLUMN: EDIT FORM ==================== */}
          <div 
            className={cn(
              "xl:col-span-6 2xl:col-span-6 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 scroll-smooth",
              mobileTab === 'preview' ? "hidden xl:block" : "block"
            )}
          >
            {/* CARD 1: Customer Information */}
            <div className="bg-brand-surface p-5 sm:p-6 rounded-3xl border border-brand-border/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-brand-border/40 pb-3">
                <div className="flex items-center gap-2">
                  <User size={16} className="text-brand-accent" />
                  <h3 className="text-sm font-black text-brand-text tracking-wide uppercase">
                    Customer Information
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddingNewCustomer(!isAddingNewCustomer)}
                  className="text-xs font-bold text-brand-accent hover:underline flex items-center gap-1"
                >
                  {isAddingNewCustomer ? 'Select Existing Customer' : '+ Register New Customer'}
                </button>
              </div>

              {isAddingNewCustomer ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in-50 duration-200">
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider block mb-1">
                      Full Name / Business *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Apex Health Clinic"
                      value={newCustomer.name}
                      onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })}
                      className="input-field py-2.5 text-xs w-full"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider block mb-1">
                      Phone Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. +234 803 123 4567"
                      value={newCustomer.phone}
                      onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                      className="input-field py-2.5 text-xs w-full"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider block mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      placeholder="billing@apexclinic.com"
                      value={newCustomer.email}
                      onChange={e => setNewCustomer({ ...newCustomer, email: e.target.value })}
                      className="input-field py-2.5 text-xs w-full"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider block mb-1">
                      Billing Address
                    </label>
                    <input
                      type="text"
                      placeholder="Street, City, State"
                      value={newCustomer.address}
                      onChange={e => setNewCustomer({ ...newCustomer, address: e.target.value })}
                      className="input-field py-2.5 text-xs w-full"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider block mb-1">
                      Select Registered Customer / Account *
                    </label>
                    <select
                      value={formData.accountId}
                      onChange={e => {
                        const selected = accounts.find(a => a.id === e.target.value);
                        setFormData({
                          ...formData,
                          accountId: e.target.value,
                          accountName: selected?.name || '',
                          customerPhone: selected?.phone || '',
                          customerEmail: selected?.email || '',
                          customerAddress: selected?.address || ''
                        });
                      }}
                      className="input-field py-2.5 text-xs w-full"
                    >
                      <option value="">-- Choose Account / Customer --</option>
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} {acc.phone ? `(${acc.phone})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {formData.accountId && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-brand-muted bg-brand-bg/70 p-3 rounded-2xl border border-brand-border/60">
                      <div>
                        <span className="text-[10px] font-bold block text-brand-text">Phone</span>
                        <input
                          type="text"
                          value={formData.customerPhone}
                          onChange={e => setFormData({ ...formData, customerPhone: e.target.value })}
                          className="bg-transparent border-b border-brand-border/60 text-xs w-full py-0.5 focus:outline-none focus:border-brand-accent"
                          placeholder="Phone"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold block text-brand-text">Email</span>
                        <input
                          type="text"
                          value={formData.customerEmail}
                          onChange={e => setFormData({ ...formData, customerEmail: e.target.value })}
                          className="bg-transparent border-b border-brand-border/60 text-xs w-full py-0.5 focus:outline-none focus:border-brand-accent"
                          placeholder="Email"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold block text-brand-text">Address</span>
                        <input
                          type="text"
                          value={formData.customerAddress}
                          onChange={e => setFormData({ ...formData, customerAddress: e.target.value })}
                          className="bg-transparent border-b border-brand-border/60 text-xs w-full py-0.5 focus:outline-none focus:border-brand-accent"
                          placeholder="Address"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Due Date & Invoice Meta */}
              <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider block mb-1">
                    Invoice Due Date
                  </label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
                    className="input-field py-2 text-xs w-full"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider block mb-1">
                    Issue Date
                  </label>
                  <input
                    type="text"
                    disabled
                    value={new Date().toLocaleDateString()}
                    className="input-field py-2 text-xs w-full opacity-70 bg-brand-bg/50 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* CARD 2: Line Items & Medicines */}
            <div className="bg-brand-surface p-5 sm:p-6 rounded-3xl border border-brand-border/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-brand-border/40 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-brand-accent" />
                  <h3 className="text-sm font-black text-brand-text tracking-wide uppercase">
                    Invoice Items & Medicines ({formData.items.length})
                  </h3>
                </div>
                <span className="text-xs font-extrabold text-brand-accent font-mono">
                  Total: {currencySymbol}{totalAmount.toLocaleString()}
                </span>
              </div>

              {/* Quick Add from Inventory */}
              <div className="space-y-3 bg-brand-bg/60 p-4 rounded-2xl border border-brand-border/60">
                <p className="text-[10px] font-black text-brand-muted uppercase tracking-wider">
                  Quick Add From Inventory
                </p>
                <div className="flex gap-2">
                  <select
                    value={selectedProductId}
                    onChange={e => {
                      if (e.target.value) {
                        addProductItem(e.target.value);
                      }
                    }}
                    className="input-field py-2 text-xs flex-1"
                  >
                    <option value="">-- Choose Medicine from Stock --</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {currencySymbol}{p.price.toLocaleString()} ({p.stock} in stock)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="h-px bg-brand-border/40 my-2" />

                {/* Or Custom / Manual Item */}
                <p className="text-[10px] font-black text-brand-muted uppercase tracking-wider">
                  Or Add Custom Item / Service
                </p>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-6">
                    <input
                      type="text"
                      placeholder="Item name / description"
                      value={manualItem.name}
                      onChange={e => setManualItem({ ...manualItem, name: e.target.value })}
                      className="input-field py-2 text-xs w-full"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={manualItem.quantity || ''}
                      onChange={e => setManualItem({ ...manualItem, quantity: parseInt(e.target.value) || 1 })}
                      className="input-field py-2 text-xs w-full text-center"
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      type="number"
                      min="0"
                      placeholder="Price"
                      value={manualItem.price || ''}
                      onChange={e => setManualItem({ ...manualItem, price: parseFloat(e.target.value) || 0 })}
                      className="input-field py-2 text-xs w-full text-right"
                    />
                  </div>
                  <div className="col-span-1 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={addManualItem}
                      className="p-2 bg-brand-accent text-white rounded-xl hover:bg-brand-accent/90 transition-all shadow-xs"
                      title="Add Custom Item"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Items List Table */}
              <div className="space-y-2">
                {formData.items.length === 0 ? (
                  <div className="text-center py-8 text-xs text-brand-muted italic border-2 border-dashed border-brand-border/60 rounded-2xl">
                    No items added yet. Select a product from inventory or enter a custom item above.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {formData.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-3 p-3 bg-brand-bg rounded-2xl border border-brand-border/60 text-xs"
                      >
                        <div className="flex-1 min-w-0">
                          <input
                            type="text"
                            value={item.productName}
                            onChange={e => updateItem(idx, { productName: e.target.value })}
                            className="bg-transparent font-bold text-brand-text text-xs w-full focus:outline-none truncate"
                          />
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {/* Qty */}
                          <div className="w-16">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={e => updateItem(idx, { quantity: parseInt(e.target.value) || 1 })}
                              className="input-field py-1 px-1.5 text-center text-xs font-mono w-full"
                              title="Quantity"
                            />
                          </div>

                          <span className="text-brand-muted text-[10px]">×</span>

                          {/* Price */}
                          <div className="w-24">
                            <input
                              type="number"
                              min="0"
                              value={item.price}
                              onChange={e => updateItem(idx, { price: parseFloat(e.target.value) || 0 })}
                              className="input-field py-1 px-2 text-right text-xs font-mono w-full"
                              title="Unit Price"
                            />
                          </div>

                          {/* Total */}
                          <span className="w-24 text-right font-black font-mono text-brand-accent">
                            {currencySymbol}{(item.total || 0).toLocaleString()}
                          </span>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="p-1.5 hover:bg-rose-500/10 text-brand-muted hover:text-rose-500 rounded-lg transition-colors"
                            title="Remove item"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* CARD 3: Pharmacy Information & Bank Details */}
            <div className="bg-brand-surface p-5 sm:p-6 rounded-3xl border border-brand-border/80 shadow-xs space-y-4">
              <div className="flex items-center gap-2 border-b border-brand-border/40 pb-3">
                <Building2 size={16} className="text-brand-accent" />
                <h3 className="text-sm font-black text-brand-text tracking-wide uppercase">
                  Pharmacy & Payment Details
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider block mb-1">
                    Pharmacy Store Name
                  </label>
                  <input
                    type="text"
                    value={formData.storeName}
                    onChange={e => setFormData({ ...formData, storeName: e.target.value })}
                    className="input-field py-2 text-xs w-full"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider block mb-1">
                    Store Phone
                  </label>
                  <input
                    type="text"
                    value={formData.storePhone}
                    onChange={e => setFormData({ ...formData, storePhone: e.target.value })}
                    className="input-field py-2 text-xs w-full"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider block mb-1">
                    Store Address
                  </label>
                  <input
                    type="text"
                    value={formData.storeAddress}
                    onChange={e => setFormData({ ...formData, storeAddress: e.target.value })}
                    className="input-field py-2 text-xs w-full"
                  />
                </div>

                <div className="sm:col-span-2 pt-2 border-t border-brand-border/30">
                  <p className="text-[10px] font-black text-brand-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <CreditCard size={13} className="text-brand-accent" /> Bank Wire Details (Shown on Invoice)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Bank Name"
                      value={formData.bankName}
                      onChange={e => setFormData({ ...formData, bankName: e.target.value })}
                      className="input-field py-2 text-xs w-full"
                    />
                    <input
                      type="text"
                      placeholder="Account Name"
                      value={formData.accountName_store}
                      onChange={e => setFormData({ ...formData, accountName_store: e.target.value })}
                      className="input-field py-2 text-xs w-full"
                    />
                    <input
                      type="text"
                      placeholder="Account Number"
                      value={formData.accountNumber_store}
                      onChange={e => setFormData({ ...formData, accountNumber_store: e.target.value })}
                      className="input-field py-2 text-xs w-full"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* CARD 4: Additional Notes */}
            <div className="bg-brand-surface p-5 sm:p-6 rounded-3xl border border-brand-border/80 shadow-xs space-y-3">
              <div className="flex items-center gap-2 border-b border-brand-border/40 pb-2">
                <FileText size={15} className="text-brand-accent" />
                <h3 className="text-sm font-black text-brand-text tracking-wide uppercase">
                  Additional Notes & Terms
                </h3>
              </div>
              <textarea
                rows={3}
                placeholder="e.g. Please quote invoice number on payment. Goods received in good condition cannot be returned without original receipt."
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                className="input-field p-3 text-xs w-full leading-relaxed"
              />
            </div>

            {/* Sticky Save Action on Left */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSubmitting || formData.items.length === 0}
                className="btn-primary w-full py-3.5 text-sm font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving and Generating Invoice...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={18} />
                    <span>Save & Generate Invoice</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ==================== RIGHT COLUMN: REAL-TIME LIVE PREVIEW ==================== */}
          <div 
            className={cn(
              "xl:col-span-6 2xl:col-span-6 flex flex-col h-full bg-slate-200/60 dark:bg-slate-900/80 p-4 sm:p-6 overflow-hidden border-t xl:border-t-0 xl:border-l border-brand-border",
              mobileTab === 'edit' ? "hidden xl:flex" : "flex"
            )}
          >
            {/* Live Preview Header */}
            <div className="flex items-center justify-between mb-3 px-1 shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Live Preview · {activePaperConfig.name} ({activePaperConfig.dimensions})
                </h4>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportPng}
                  disabled={isExportingPng}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 shadow-2xs hover:bg-slate-50 flex items-center gap-1"
                >
                  <ImageIcon size={13} />
                  <span>PNG</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportPdf}
                  disabled={isExportingPdf}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 shadow-2xs hover:bg-slate-50 flex items-center gap-1"
                >
                  <Download size={13} />
                  <span>PDF</span>
                </button>
              </div>
            </div>

            {/* Scrollable Live Document Render Canvas */}
            <div className="flex-1 overflow-y-auto p-2 sm:p-4 flex justify-center items-start scroll-smooth">
              <div
                ref={printRef}
                className={cn(
                  "shadow-2xl transition-all duration-200 relative mx-auto overflow-hidden",
                  isThermal ? "rounded-xl" : currentTemplate.borderRadius || "rounded-xl",
                  isDarkTemplate 
                    ? "bg-slate-950 text-slate-100 border border-slate-800" 
                    : "bg-white text-slate-900 border border-slate-200"
                )}
                style={{
                  width: '100%',
                  maxWidth: `${activePaperConfig.previewWidthPx}px`,
                  minHeight: isThermal ? 'auto' : activePaperConfig.id === 'a5' ? '700px' : '980px'
                }}
              >
                {/* ----------------- THERMAL RECEIPT VIEW (80mm / 58mm) ----------------- */}
                {isThermal ? (
                  <div className={cn(
                    "p-4 font-mono text-slate-900 text-xs leading-relaxed",
                    paperSize === '58mm' ? "text-[10px] p-2.5" : "text-xs"
                  )}>
                    <div className="text-center space-y-1 mb-3">
                      <div className="w-7 h-7 rounded-full bg-slate-900 text-white font-black flex items-center justify-center mx-auto text-xs">
                        {(livePreviewInvoice.storeName || settings?.storeName || 'P').charAt(0)}
                      </div>
                      <h2 className="font-black text-xs uppercase tracking-wide">
                        {livePreviewInvoice.storeName || settings?.storeName || 'Pharmacy Flow'}
                      </h2>
                      <p className="text-[9.5px] text-slate-600">
                        {livePreviewInvoice.storeAddress || settings?.storeAddress}
                      </p>
                      <p className="text-[9.5px] text-slate-600">
                        TEL: {livePreviewInvoice.storePhone || settings?.phoneNumber}
                      </p>
                    </div>

                    <div className="border-t border-dashed border-slate-400 my-2" />

                    <div className="space-y-0.5 text-[9.5px]">
                      <div className="flex justify-between">
                        <span className="font-bold">INVOICE:</span>
                        <span>{livePreviewInvoice.invoiceNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>DATE:</span>
                        <span>{new Date().toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-bold">CLIENT:</span>
                        <span className="truncate max-w-[140px]">
                          {livePreviewInvoice.accountName || 'Customer'}
                        </span>
                      </div>
                    </div>

                    <div className="border-t border-dashed border-slate-400 my-2" />

                    <div className="space-y-1.5 mb-2">
                      <div className="flex justify-between font-bold text-[9.5px] pb-0.5 border-b border-slate-300">
                        <span>ITEM</span>
                        <span>TOTAL</span>
                      </div>

                      {livePreviewInvoice.items.length === 0 ? (
                        <div className="py-2 text-center text-slate-400 italic text-[10px]">
                          [ No items added yet ]
                        </div>
                      ) : (
                        livePreviewInvoice.items.map((item, idx) => (
                          <div key={idx} className="space-y-0.5">
                            <div className="font-bold truncate">{item.productName}</div>
                            <div className="flex justify-between text-slate-600 text-[9.5px]">
                              <span>{item.quantity} × {currencySymbol}{(item.price || 0).toLocaleString()}</span>
                              <span className="font-bold text-slate-900">{currencySymbol}{(item.total || 0).toLocaleString()}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="border-t border-dashed border-slate-400 my-2" />

                    <div className="space-y-1 text-right text-[10.5px]">
                      <div className="flex justify-between text-slate-600">
                        <span>SUBTOTAL:</span>
                        <span>{currencySymbol}{totalAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between font-black text-xs pt-1 border-t border-slate-900">
                        <span>TOTAL DUE:</span>
                        <span>{currencySymbol}{totalAmount.toLocaleString()}</span>
                      </div>
                    </div>

                    {livePreviewInvoice.bankName && (
                      <>
                        <div className="border-t border-dashed border-slate-400 my-2" />
                        <div className="bg-slate-50 p-2 rounded text-[9.5px] space-y-0.5">
                          <p className="font-bold uppercase text-[8.5px] text-slate-500">Bank Transfer Details</p>
                          <p><span className="font-semibold">Bank:</span> {livePreviewInvoice.bankName}</p>
                          <p><span className="font-semibold">Acct:</span> {livePreviewInvoice.accountNumber_store}</p>
                          <p><span className="font-semibold">Name:</span> {livePreviewInvoice.accountName_store}</p>
                        </div>
                      </>
                    )}

                    <div className="border-t border-dashed border-slate-400 my-2" />
                    <div className="text-center text-[9px] text-slate-500 space-y-0.5">
                      <p className="font-bold">*** THANK YOU FOR YOUR BUSINESS ***</p>
                      <p>{settings?.receiptMessage || 'We value your health & wellness.'}</p>
                    </div>
                  </div>
                ) : (
                  /* ----------------- STANDARD SHEET VIEW (A4, Letter, A5) ----------------- */
                  <div className={cn(
                    "relative p-6 sm:p-8 transition-all duration-200",
                    currentTemplate.fontFamily === 'font-serif' ? "font-serif" :
                    currentTemplate.fontFamily === 'font-mono' ? "font-mono" : "font-sans",
                    activePaperConfig.id === 'a5' ? "p-4 text-xs" : "p-6 sm:p-10"
                  )}>
                    {/* Top Accent Bar */}
                    <div 
                      className="absolute top-0 left-0 right-0 h-2 z-10"
                      style={{
                        background: currentTemplate.gradient
                          ? `linear-gradient(to right, ${currentTemplate.primaryColor}, ${currentTemplate.secondaryColor || currentTemplate.primaryColor})`
                          : currentTemplate.primaryColor
                      }}
                    />

                    {/* Header */}
                    <div className="relative z-10 mb-6 sm:mb-8 border-b border-slate-200 dark:border-slate-800 pb-5">
                      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                        {/* Store Info */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                            <div 
                              className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-sm",
                                currentTemplate.gradient && `bg-gradient-to-br ${currentTemplate.gradient}`
                              )}
                              style={!currentTemplate.gradient ? { backgroundColor: currentTemplate.primaryColor } : {}}
                            >
                              {(livePreviewInvoice.storeName || settings?.storeName || 'P').charAt(0)}
                            </div>
                            <div>
                              <h2 className="text-lg font-black tracking-tight">
                                {livePreviewInvoice.storeName || settings?.storeName || 'Pharmacy Flow'}
                              </h2>
                              <p className="text-[10px] text-slate-500 font-medium">Healthcare & Pharmaceuticals</p>
                            </div>
                          </div>

                          <div className="text-[11px] text-slate-500 space-y-0.5 max-w-xs">
                            <p>{livePreviewInvoice.storeAddress || settings?.storeAddress}</p>
                            <p>{livePreviewInvoice.storePhone || settings?.phoneNumber}</p>
                          </div>
                        </div>

                        {/* Invoice Meta */}
                        <div className="text-left sm:text-right flex flex-col items-start sm:items-end">
                          <h1 
                            className="text-2xl sm:text-3xl font-black uppercase tracking-[0.2em] mb-1"
                            style={{ color: isDarkTemplate ? '#f8fafc' : currentTemplate.primaryColor }}
                          >
                            Invoice
                          </h1>
                          <p className="text-xs font-black text-brand-accent tracking-wider font-mono">
                            {livePreviewInvoice.invoiceNumber}
                          </p>
                          <div className="mt-2 space-y-0.5 text-[11px] text-slate-500">
                            <p>Date: <span className="font-bold text-slate-800 dark:text-slate-200">{new Date().toLocaleDateString()}</span></p>
                            {livePreviewInvoice.dueDate && (
                              <p>Due: <span className="font-bold text-brand-accent">{new Date(livePreviewInvoice.dueDate).toLocaleDateString()}</span></p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Billed To / Bank Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                        <div className={cn(
                          "p-3 rounded-xl border text-xs",
                          isDarkTemplate ? "bg-slate-900/60 border-slate-800" : "bg-slate-50 border-slate-200/80"
                        )}>
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                            Billed To:
                          </span>
                          <p className="font-black text-sm text-slate-900 dark:text-slate-100">
                            {livePreviewInvoice.accountName || 'Customer Name'}
                          </p>
                          {livePreviewInvoice.customerPhone && <p className="text-[11px] text-slate-500">{livePreviewInvoice.customerPhone}</p>}
                          {livePreviewInvoice.customerAddress && <p className="text-[11px] text-slate-500">{livePreviewInvoice.customerAddress}</p>}
                        </div>

                        {livePreviewInvoice.bankName && (
                          <div className={cn(
                            "p-3 rounded-xl border text-xs",
                            isDarkTemplate ? "bg-slate-900/60 border-slate-800" : "bg-slate-50 border-slate-200/80"
                          )}>
                            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                              Payment Transfer Info:
                            </span>
                            <p className="font-bold text-slate-800 dark:text-slate-200">{livePreviewInvoice.bankName}</p>
                            <p className="font-mono text-brand-accent font-black">{livePreviewInvoice.accountNumber_store}</p>
                            <p className="text-[10px] text-slate-500">{livePreviewInvoice.accountName_store}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Items Table */}
                    <div className="relative z-10 mb-6 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr 
                            className="text-[10px] font-black uppercase tracking-wider text-white"
                            style={{
                              background: currentTemplate.gradient
                                ? `linear-gradient(to right, ${currentTemplate.primaryColor}, ${currentTemplate.secondaryColor || currentTemplate.primaryColor})`
                                : currentTemplate.primaryColor
                            }}
                          >
                            <th className="px-3 sm:px-4 py-2.5">Item Description</th>
                            <th className="px-2 sm:px-3 py-2.5 text-center w-16">Qty</th>
                            <th className="px-3 sm:px-4 py-2.5 text-right w-24">Price</th>
                            <th className="px-3 sm:px-4 py-2.5 text-right w-28">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                          {livePreviewInvoice.items.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-6 text-center text-slate-400 italic text-xs">
                                [ Add items from the left form to see them live here ]
                              </td>
                            </tr>
                          ) : (
                            livePreviewInvoice.items.map((item, idx) => (
                              <tr 
                                key={idx}
                                className={idx % 2 === 1 ? (isDarkTemplate ? "bg-slate-900/30" : "bg-slate-50/60") : "bg-transparent"}
                              >
                                <td className="px-3 sm:px-4 py-2 font-bold">{item.productName}</td>
                                <td className="px-2 sm:px-3 py-2 text-center font-mono">{item.quantity}</td>
                                <td className="px-3 sm:px-4 py-2 text-right font-mono text-slate-500">
                                  {currencySymbol}{(item.price || 0).toLocaleString()}
                                </td>
                                <td className="px-3 sm:px-4 py-2 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                                  {currencySymbol}{(item.total || 0).toLocaleString()}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Total Box */}
                    <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-t border-slate-200 dark:border-slate-800 pt-4">
                      <div className="text-[11px] text-slate-500 max-w-xs">
                        {livePreviewInvoice.notes ? (
                          <p className="italic">"{livePreviewInvoice.notes}"</p>
                        ) : (
                          <p>Thank you for choosing {livePreviewInvoice.storeName || settings?.storeName || 'Pharmacy Flow'}.</p>
                        )}
                      </div>

                      <div 
                        className="px-4 py-3 rounded-xl text-white shadow-sm flex items-center justify-between gap-6 ml-auto"
                        style={{
                          background: currentTemplate.gradient
                            ? `linear-gradient(to right, ${currentTemplate.primaryColor}, ${currentTemplate.secondaryColor || currentTemplate.primaryColor})`
                            : currentTemplate.primaryColor
                        }}
                      >
                        <span className="text-[10px] font-black uppercase tracking-wider opacity-85">Total Due:</span>
                        <span className="text-lg font-black font-mono">
                          {currencySymbol}{totalAmount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
