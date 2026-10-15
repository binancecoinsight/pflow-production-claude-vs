import React, { useState, useEffect, useRef } from 'react';
import { 
  Printer, X, CheckCircle, FileText, Download, 
  Image as ImageIcon, Share2, Sparkles, CreditCard, 
  User, Check, ChevronDown, Eye, AlertCircle
} from 'lucide-react';
import { Invoice } from '../types';
import { 
  INVOICE_TEMPLATES, 
  POPULAR_PAPER_SIZES, 
  PopularPaperSize, 
  InvoiceTemplate,
  PaperSizeConfig
} from '../constants/invoiceTemplates';
import { useSettings } from '../context/SettingsContext';
import { useNotification } from '../context/NotificationContext';
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

interface InvoicePreviewProps {
  invoice: Invoice;
  onClose: () => void;
  isUnsaved?: boolean;
  onGenerate?: () => void;
}

export default function InvoicePreview({
  invoice,
  onClose,
  isUnsaved = false,
  onGenerate
}: InvoicePreviewProps) {
  const { settings } = useSettings();
  const { showNotification } = useNotification();
  const printRef = useRef<HTMLDivElement>(null);

  // Active Template (defaults to invoice's template, but allows live switching)
  const [activeTemplateId, setActiveTemplateId] = useState<string>(
    invoice.templateId || 'classic'
  );
  const currentTemplate: InvoiceTemplate = 
    INVOICE_TEMPLATES.find(t => t.id === activeTemplateId) || INVOICE_TEMPLATES[0];

  // Paper Size state (A4 default)
  const [paperSize, setPaperSize] = useState<PopularPaperSize>('a4');
  const activePaperConfig: PaperSizeConfig = 
    POPULAR_PAPER_SIZES.find(p => p.id === paperSize) || POPULAR_PAPER_SIZES[0];

  // Exporting states
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false);

  const currencySymbol = settings.currencySymbol || '₦';
  const isDarkTemplate = currentTemplate.id === 'premium';
  const isThermal = activePaperConfig.category === 'thermal';

  // Export as PDF
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

      const img = new Image();
      img.src = imgData;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      let pdf: jsPDF;

      if (isThermal) {
        const widthMm = activePaperConfig.widthMm;
        const heightMm = Math.max(120, (img.height * widthMm) / img.width);
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
        const imgHeight = (img.height * pdfWidth) / img.width;
        const totalPages = Math.ceil(imgHeight / pageHeight);

        for (let i = 0; i < totalPages; i++) {
          if (i > 0) pdf.addPage(format, 'portrait');
          pdf.addImage(imgData, 'JPEG', 0, -(i * pageHeight), pdfWidth, imgHeight, undefined, 'FAST');
        }
      }

      const pdfBlob = pdf.output('blob');
      const safeNumber = (invoice.invoiceNumber || 'INV').replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `Invoice_${safeNumber}_${activePaperConfig.id.toUpperCase()}.pdf`;
      
      const { saveFile } = await import('../utils/fileSaver');
      await saveFile(fileName, pdfBlob, 'application/pdf');
      showNotification('success', `Invoice exported successfully as PDF (${activePaperConfig.name})`);
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      showNotification('error', 'Failed to generate PDF. Please try again.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Export as PNG
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
      const safeNumber = (invoice.invoiceNumber || 'INV').replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `Invoice_${safeNumber}.png`;

      const { saveFile } = await import('../utils/fileSaver');
      await saveFile(fileName, blob, 'image/png');
      showNotification('success', 'Invoice exported successfully as high-resolution PNG');
    } catch (err: any) {
      console.error('Error generating PNG:', err);
      showNotification('error', 'Failed to generate PNG image. Please try again.');
    } finally {
      setIsExportingPng(false);
    }
  };

  // Print Invoice
  const handlePrint = async () => {
    const printData: PrintData = {
      storeName: invoice.storeName || settings.storeName || 'Pharmacy Flow',
      storeAddress: invoice.storeAddress || settings.storeAddress || '',
      phoneNumber: invoice.storePhone || settings.phoneNumber || '',
      receiptMessage: (settings.receiptMessage || 'Thank you for your business!').replace(
        '{storeName}',
        invoice.storeName || settings.storeName || 'Pharmacy'
      ),
      items: (invoice.items || []).map(item => ({
        productId: '',
        productName: item.productName,
        quantity: item.quantity,
        price: item.price,
        total: item.total,
        cost: 0
      })),
      totalAmount: invoice.totalAmount,
      paymentMethod: 'Invoice',
      date: new Date(invoice.timestamp),
      currencySymbol: currencySymbol,
      receiptId: invoice.invoiceNumber,
    };

    const receiptData: ReceiptData = {
      shopName: printData.storeName,
      shopAddress: printData.storeAddress,
      shopPhone: printData.phoneNumber,
      orderId: printData.receiptId || '0000',
      date: printData.date.toLocaleString(),
      items: printData.items.map((item: any) => ({
        name: item.productName,
        price: item.price,
        qty: item.quantity,
        total: item.price * item.quantity
      })),
      subtotal: printData.subTotal || printData.totalAmount,
      tax: printData.taxAmount || 0,
      discount: 0,
      grandTotal: printData.totalAmount,
      customerName: invoice.accountName,
      footerMessage: printData.receiptMessage
    };

    try {
      if (settings.printMethod === 'bluetooth') {
        const printerId = settings.defaultPrinterId || (settings.pairedPrinters && settings.pairedPrinters.length > 0 ? settings.pairedPrinters[0].id : null);
        if (!printerId) {
          throw new Error('No Bluetooth printer selected. Please connect a printer in Settings.');
        }
        if (!printerService.isConnectedTo(printerId)) {
          await printerService.connect(printerId);
        }
        await printerService.printReceipt(receiptData, currencySymbol);
      } else {
        const { receiptPrinter } = await import('../utils/printer');
        const bytes = receiptPrinter.generateReceipt(printData, paperSize as any);
        if (settings.printMethod === 'android') {
          await receiptPrinter.printViaAndroid(bytes);
        } else if (settings.printMethod === 'browser') {
          if (paperSize === 'a4' || paperSize === 'letter' || paperSize === 'a5') {
            const printContent = printRef.current;
            if (!printContent) return;

            const win = window.open('', '', 'width=900,height=900');
            if (!win) return;

            win.document.write(`
              <!DOCTYPE html>
              <html>
                <head>
                  <title>Invoice ${invoice.invoiceNumber}</title>
                  <script src="https://cdn.tailwindcss.com"></script>
                  <style>
                    @page { size: ${paperSize === 'letter' ? 'letter' : paperSize === 'a5' ? 'A5' : 'A4'}; margin: 10mm; }
                    @media print { .no-print, .no-export { display: none !important; } }
                    body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                  </style>
                </head>
                <body>
                  <div style="width: 100%;">
                    ${printContent.innerHTML}
                  </div>
                  <script>
                    window.onload = () => {
                      setTimeout(() => {
                        window.print();
                        window.close();
                      }, 500);
                    };
                  </script>
                </body>
              </html>
            `);
            win.document.close();
          } else {
            receiptPrinter.printViaBrowser(printData, paperSize as any);
          }
        } else {
          receiptPrinter.printViaDeepLink(bytes);
        }
      }
    } catch (err: any) {
      console.error('Invoice printing failed:', err);
      showNotification('error', err.message || 'Printing failed. Check printer configuration.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2 sm:p-4 lg:p-6 pt-16 lg:pt-20 overflow-y-auto">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-0"
      />

      {/* Modal Dialog */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.96, y: -16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ duration: 0.2 }}
        className="relative z-10 w-full max-w-5xl bg-brand-surface rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-brand-border"
      >
        {/* Top Control Bar */}
        <div className="p-4 sm:p-5 border-b border-brand-border bg-brand-surface/95 backdrop-blur-md flex flex-wrap items-center justify-between gap-4 no-print shrink-0">
          {/* Left: Invoice Title & Status */}
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-brand-text tracking-tight">Invoice Preview</h3>
                <span className={cn(
                  "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                  invoice.status === 'paid' ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                  invoice.status === 'unpaid' ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
                  "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                )}>
                  {invoice.status}
                </span>
              </div>
              <p className="text-xs text-brand-muted font-medium mt-0.5">
                {invoice.invoiceNumber} · {new Date(invoice.timestamp).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Center / Right: Paper Sizes, Template Switcher & Actions */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Template Selector Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsTemplateMenuOpen(!isTemplateMenuOpen)}
                className="flex items-center gap-2 px-3 py-1.5 bg-brand-bg rounded-xl border border-brand-border text-xs font-bold text-brand-text hover:border-brand-accent/50 transition-colors"
                title="Change Template"
              >
                <div 
                  className="w-2.5 h-2.5 rounded-full" 
                  style={{ backgroundColor: currentTemplate.primaryColor }}
                />
                <span className="truncate max-w-[120px]">{currentTemplate.name}</span>
                <ChevronDown size={14} className="text-brand-muted" />
              </button>

              {/* Template Dropdown Menu */}
              <AnimatePresence>
                {isTemplateMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.95 }}
                    className="absolute right-0 top-full mt-2 w-64 p-2 bg-brand-surface rounded-2xl shadow-2xl border border-brand-border z-50 max-h-80 overflow-y-auto"
                  >
                    <p className="text-[10px] font-black text-brand-muted uppercase tracking-widest px-3 py-1.5">
                      Select Template
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
                          <div className="flex items-center gap-2.5">
                            <span 
                              className="w-3 h-3 rounded-full shrink-0 ring-1 ring-white/20"
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

            {/* Paper Size Segmented Tabs */}
            <div className="flex items-center gap-1 p-1 bg-brand-bg rounded-xl border border-brand-border">
              {POPULAR_PAPER_SIZES.map((size) => (
                <button
                  key={size.id}
                  onClick={() => setPaperSize(size.id)}
                  title={`${size.name}: ${size.dimensions} - ${size.description}`}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1",
                    paperSize === size.id
                      ? "bg-brand-accent text-white shadow-sm"
                      : "text-brand-muted hover:text-brand-text hover:bg-brand-surface/60"
                  )}
                >
                  <span>{size.name}</span>
                  {size.category === 'thermal' && (
                    <span className={cn(
                      "text-[9px] px-1 py-0.2 rounded font-mono uppercase",
                      paperSize === size.id ? "bg-white/20 text-white" : "bg-brand-border/60 text-brand-muted"
                    )}>
                      POS
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="h-6 w-px bg-brand-border/80 hidden sm:block" />

            {/* Action Buttons */}
            {isUnsaved ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 hover:bg-brand-bg rounded-xl text-xs font-bold text-brand-muted transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={onGenerate}
                  className="btn-primary px-4 py-2 text-xs flex items-center gap-2"
                >
                  <CheckCircle size={16} /> Generate
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Print Button */}
                <button
                  onClick={handlePrint}
                  className="px-3 py-1.5 bg-brand-bg hover:bg-brand-accent/10 hover:text-brand-accent rounded-xl border border-brand-border text-xs font-bold text-brand-text flex items-center gap-1.5 transition-colors"
                  title="Print Invoice"
                >
                  <Printer size={15} />
                  <span className="hidden md:inline">Print</span>
                </button>

                {/* Export PNG */}
                <button
                  onClick={handleExportPng}
                  disabled={isExportingPng || isExportingPdf}
                  className="px-3 py-1.5 bg-brand-bg hover:bg-brand-accent/10 hover:text-brand-accent rounded-xl border border-brand-border text-xs font-bold text-brand-text flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  title="Export High-Resolution PNG"
                >
                  {isExportingPng ? (
                    <div className="w-3.5 h-3.5 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <ImageIcon size={15} />
                  )}
                  <span className="hidden sm:inline">PNG</span>
                </button>

                {/* Export PDF */}
                <button
                  onClick={handleExportPdf}
                  disabled={isExportingPdf || isExportingPng}
                  className="btn-primary px-3.5 py-1.5 text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  title={`Export PDF in ${activePaperConfig.name} format`}
                >
                  {isExportingPdf ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Download size={15} />
                  )}
                  <span>Export PDF</span>
                </button>
              </div>
            )}

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-brand-bg rounded-xl transition-colors text-brand-muted hover:text-brand-text"
              title="Close Preview"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Paper Size Dimensions Banner */}
        <div className="px-6 py-2 bg-brand-bg/50 border-b border-brand-border flex items-center justify-between text-[11px] text-brand-muted font-medium">
          <div className="flex items-center gap-2">
            <span className="font-bold text-brand-text">{activePaperConfig.name}</span>
            <span>·</span>
            <span>{activePaperConfig.dimensions}</span>
            <span>·</span>
            <span className="hidden md:inline">{activePaperConfig.description}</span>
          </div>
          <div className="flex items-center gap-2 text-brand-accent font-semibold">
            <span>Template: {currentTemplate.name}</span>
          </div>
        </div>

        {/* Scrollable Document Canvas */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100 dark:bg-slate-900/60 flex justify-center items-start">
          {/* Outer Invoice Container - Width adapts to chosen paper size */}
          <div
            ref={printRef}
            className={cn(
              "shadow-2xl transition-all duration-300 relative mx-auto overflow-hidden",
              isThermal ? "rounded-xl" : currentTemplate.borderRadius || "rounded-xl",
              isDarkTemplate ? "bg-slate-950 text-slate-100 border border-slate-800" : "bg-white text-slate-900 border border-slate-200"
            )}
            style={{
              width: '100%',
              maxWidth: `${activePaperConfig.previewWidthPx}px`,
              minHeight: isThermal ? 'auto' : activePaperConfig.id === 'a5' ? '780px' : '1080px'
            }}
          >
            {/* ========================================================= */}
            {/* THERMAL RECEIPT LAYOUT (For 80mm & 58mm Thermal Printers) */}
            {/* ========================================================= */}
            {isThermal ? (
              <div className={cn(
                "p-4 sm:p-6 font-mono text-slate-900 text-xs leading-relaxed",
                paperSize === '58mm' ? "text-[10px] p-3" : "text-xs"
              )}>
                {/* Store Header */}
                <div className="text-center space-y-1 mb-4">
                  <div className="w-8 h-8 rounded-full bg-slate-900 text-white font-black flex items-center justify-center mx-auto text-sm">
                    {(invoice.storeName || settings.storeName || 'P').charAt(0)}
                  </div>
                  <h2 className="font-black text-sm uppercase tracking-wide">
                    {invoice.storeName || settings.storeName || 'Pharmacy Flow'}
                  </h2>
                  <p className="text-[10px] text-slate-600">
                    {invoice.storeAddress || settings.storeAddress}
                  </p>
                  <p className="text-[10px] text-slate-600">
                    TEL: {invoice.storePhone || settings.phoneNumber}
                  </p>
                </div>

                <div className="border-t border-dashed border-slate-400 my-2" />

                {/* Receipt Details */}
                <div className="space-y-0.5 text-[10px]">
                  <div className="flex justify-between">
                    <span className="font-bold">INVOICE:</span>
                    <span>{invoice.invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>DATE:</span>
                    <span>{new Date(invoice.timestamp).toLocaleString()}</span>
                  </div>
                  {invoice.accountName && (
                    <div className="flex justify-between">
                      <span className="font-bold">CLIENT:</span>
                      <span className="truncate max-w-[150px]">{invoice.accountName}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>STATUS:</span>
                    <span className="font-black uppercase">{invoice.status}</span>
                  </div>
                </div>

                <div className="border-t border-dashed border-slate-400 my-2" />

                {/* Items List */}
                <div className="space-y-2 mb-3">
                  <div className="flex justify-between font-bold text-[10px] pb-1 border-b border-slate-300">
                    <span>ITEM</span>
                    <span>TOTAL</span>
                  </div>

                  {(invoice.items || []).map((item, idx) => (
                    <div key={idx} className="space-y-0.5">
                      <div className="font-bold truncate">{item.productName}</div>
                      <div className="flex justify-between text-slate-600 text-[10px]">
                        <span>{item.quantity} × {currencySymbol}{(item.price || 0).toLocaleString()}</span>
                        <span className="font-bold text-slate-900">{currencySymbol}{(item.total || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-dashed border-slate-400 my-2" />

                {/* Totals Summary */}
                <div className="space-y-1 text-right text-[11px]">
                  <div className="flex justify-between text-slate-600">
                    <span>SUBTOTAL:</span>
                    <span>{currencySymbol}{(invoice.totalAmount || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-black text-sm pt-1 border-t border-slate-900">
                    <span>TOTAL DUE:</span>
                    <span>{currencySymbol}{(invoice.totalAmount || 0).toLocaleString()}</span>
                  </div>
                </div>

                {/* Bank Account Info for Payment */}
                {invoice.bankName && (
                  <>
                    <div className="border-t border-dashed border-slate-400 my-2" />
                    <div className="bg-slate-50 p-2 rounded text-[10px] space-y-0.5">
                      <p className="font-bold uppercase text-[9px] text-slate-500">Bank Transfer Details</p>
                      <p><span className="font-semibold">Bank:</span> {invoice.bankName}</p>
                      <p><span className="font-semibold">Acct:</span> {invoice.accountNumber_store}</p>
                      <p><span className="font-semibold">Name:</span> {invoice.accountName_store}</p>
                    </div>
                  </>
                )}

                {/* Footer */}
                <div className="border-t border-dashed border-slate-400 my-3" />
                <div className="text-center text-[10px] text-slate-500 space-y-1">
                  <p className="font-bold">*** THANK YOU FOR YOUR BUSINESS ***</p>
                  <p>{settings.receiptMessage || 'We value your health & wellness.'}</p>
                </div>
              </div>
            ) : (
              /* ========================================================= */
              /* STANDARD SHEET INVOICE LAYOUT (A4, Letter, A5 Multi-Theme) */
              /* ========================================================= */
              <div className={cn(
                "relative p-6 sm:p-10 transition-all duration-300",
                currentTemplate.fontFamily === 'font-serif' ? "font-serif" :
                currentTemplate.fontFamily === 'font-mono' ? "font-mono" : "font-sans",
                activePaperConfig.id === 'a5' ? "p-5 text-sm" : "p-8 sm:p-12"
              )}>
                {/* Decorative Template Elements */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-25 z-0">
                  {currentTemplate.id === 'tech' && (
                    <div 
                      className="absolute inset-0 opacity-40" 
                      style={{ 
                        backgroundImage: 'radial-gradient(#10b981 1px, transparent 1px)', 
                        backgroundSize: '24px 24px' 
                      }} 
                    />
                  )}
                  {currentTemplate.id === 'creative' && (
                    <>
                      <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full blur-[100px] bg-violet-600/30" />
                      <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full blur-[100px] bg-fuchsia-600/30" />
                    </>
                  )}
                  {currentTemplate.id === 'elegant' && (
                    <>
                      <div className="absolute inset-4 border border-amber-600/20 rounded-xs pointer-events-none" />
                      <div className="absolute inset-6 border border-amber-600/10 rounded-xs pointer-events-none" />
                    </>
                  )}
                  {currentTemplate.id === 'ocean' && (
                    <div className="absolute top-0 right-0 w-full h-32 bg-gradient-to-b from-sky-500/10 to-transparent" />
                  )}
                  {currentTemplate.id === 'forest' && (
                    <div className="absolute bottom-0 right-0 w-80 h-80 bg-emerald-600/10 rounded-full blur-3xl" />
                  )}
                  {currentTemplate.id === 'sunset' && (
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 via-rose-500/5 to-transparent" />
                  )}
                  {currentTemplate.id === 'bold' && (
                    <div className="absolute top-0 right-0 w-1/3 h-full bg-amber-400/5 -skew-x-12 translate-x-12" />
                  )}
                </div>

                {/* Top Theme Accent Bar */}
                <div 
                  className="absolute top-0 left-0 right-0 h-2 z-10"
                  style={{
                    background: currentTemplate.gradient
                      ? `linear-gradient(to right, ${currentTemplate.primaryColor}, ${currentTemplate.secondaryColor || currentTemplate.primaryColor})`
                      : currentTemplate.primaryColor
                  }}
                />

                {/* Header Section */}
                <div className="relative z-10 mb-8 sm:mb-12">
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-b border-brand-border/40 pb-6 sm:pb-8">
                    {/* Store Branding */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div 
                          className={cn(
                            "w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-md",
                            currentTemplate.gradient && `bg-gradient-to-br ${currentTemplate.gradient}`
                          )}
                          style={!currentTemplate.gradient ? { backgroundColor: currentTemplate.primaryColor } : {}}
                        >
                          {(invoice.storeName || settings.storeName || 'P').charAt(0)}
                        </div>
                        <div>
                          <h1 className="text-xl sm:text-2xl font-black tracking-tight">
                            {invoice.storeName || settings.storeName || 'Pharmacy Flow'}
                          </h1>
                          <p className="text-xs text-brand-muted font-medium">Healthcare & Pharmaceuticals</p>
                        </div>
                      </div>

                      <div className="text-xs text-brand-muted space-y-0.5 leading-relaxed max-w-xs">
                        <p>{invoice.storeAddress || settings.storeAddress}</p>
                        <p>{invoice.storePhone || settings.phoneNumber}</p>
                        <p>{invoice.storeEmail || settings.storeEmail}</p>
                      </div>
                    </div>

                    {/* Invoice Meta */}
                    <div className="text-left sm:text-right flex flex-col items-start sm:items-end">
                      <div className="inline-block relative mb-2">
                        <h2 
                          className="text-3xl sm:text-4xl font-black uppercase tracking-[0.2em]"
                          style={{ color: isDarkTemplate ? '#f8fafc' : currentTemplate.primaryColor }}
                        >
                          Invoice
                        </h2>
                      </div>

                      <p className="text-sm font-black text-brand-accent tracking-wider font-mono">
                        {invoice.invoiceNumber}
                      </p>

                      <div className="mt-3 space-y-1 text-xs">
                        <div className="flex items-center gap-2 sm:justify-end">
                          <span className="text-brand-muted">Issue Date:</span>
                          <span className="font-bold">
                            {new Date(invoice.timestamp).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </span>
                        </div>
                        {invoice.dueDate && (
                          <div className="flex items-center gap-2 sm:justify-end">
                            <span className="text-brand-muted">Due Date:</span>
                            <span className="font-bold text-brand-accent">
                              {new Date(invoice.dueDate).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                              })}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 sm:justify-end">
                          <span className="text-brand-muted">Payment Status:</span>
                          <span className={cn(
                            "font-black uppercase text-[10px] px-2 py-0.5 rounded",
                            invoice.status === 'paid' ? "bg-emerald-500/10 text-emerald-600" :
                            invoice.status === 'unpaid' ? "bg-amber-500/10 text-amber-600" :
                            "bg-rose-500/10 text-rose-600"
                          )}>
                            {invoice.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Customer Info & Store Bank Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mt-6">
                    {/* Billed To */}
                    <div className={cn(
                      "p-4 sm:p-5 rounded-2xl border transition-all",
                      isDarkTemplate 
                        ? "bg-slate-900/80 border-slate-800" 
                        : "bg-slate-50/80 border-slate-200/80"
                    )}>
                      <div className="flex items-center gap-2 mb-2 text-brand-muted">
                        <User size={14} className="text-brand-accent" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Billed To</span>
                      </div>
                      <h3 className="font-black text-base sm:text-lg text-brand-text truncate">
                        {invoice.accountName}
                      </h3>
                      <div className="text-xs text-brand-muted space-y-0.5 mt-1">
                        {invoice.customerAddress && <p>{invoice.customerAddress}</p>}
                        {invoice.customerPhone && <p>{invoice.customerPhone}</p>}
                        {invoice.customerEmail && <p>{invoice.customerEmail}</p>}
                      </div>
                    </div>

                    {/* Bank Transfer Details */}
                    {invoice.bankName ? (
                      <div className={cn(
                        "p-4 sm:p-5 rounded-2xl border transition-all relative overflow-hidden",
                        isDarkTemplate 
                          ? "bg-slate-900/80 border-slate-800" 
                          : "bg-slate-50/80 border-slate-200/80"
                      )}>
                        <div className="flex items-center gap-2 mb-2 text-brand-muted">
                          <CreditCard size={14} className="text-brand-accent" />
                          <span className="text-[10px] font-black uppercase tracking-widest">Bank Payment Details</span>
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-brand-muted">Bank Name:</span>
                            <span className="font-bold">{invoice.bankName}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-brand-muted">Account Name:</span>
                            <span className="font-bold truncate max-w-[160px]">{invoice.accountName_store}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-brand-muted">Account Number:</span>
                            <span className="font-mono font-black text-brand-accent">{invoice.accountNumber_store}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className={cn(
                        "p-4 sm:p-5 rounded-2xl border flex flex-col justify-center",
                        isDarkTemplate ? "bg-slate-900/40 border-slate-800" : "bg-slate-50/40 border-slate-200/60"
                      )}>
                        <p className="text-xs text-brand-muted italic">
                          Official commercial invoice. Please retain this document for accounting and tax reconciliation.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Items Table */}
                <div className="relative z-10 mb-8 overflow-hidden rounded-2xl border border-brand-border/70 shadow-sm">
                  <table className="w-full text-left">
                    <thead>
                      <tr 
                        className="text-[11px] font-black uppercase tracking-wider text-white"
                        style={{
                          background: currentTemplate.gradient
                            ? `linear-gradient(to right, ${currentTemplate.primaryColor}, ${currentTemplate.secondaryColor || currentTemplate.primaryColor})`
                            : currentTemplate.primaryColor
                        }}
                      >
                        <th className="px-4 sm:px-6 py-3.5">Item Description</th>
                        <th className="px-3 sm:px-4 py-3.5 text-center w-20">Qty</th>
                        <th className="px-4 sm:px-6 py-3.5 text-right w-28 sm:w-36">Unit Price</th>
                        <th className="px-4 sm:px-6 py-3.5 text-right w-32 sm:w-40">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border/40 text-xs sm:text-sm">
                      {(invoice.items || []).map((item, idx) => (
                        <tr 
                          key={idx} 
                          className={cn(
                            "transition-colors",
                            idx % 2 === 1 
                              ? isDarkTemplate ? "bg-slate-900/40" : "bg-slate-50/50" 
                              : "bg-transparent"
                          )}
                        >
                          <td className="px-4 sm:px-6 py-3.5 font-bold">{item.productName}</td>
                          <td className="px-3 sm:px-4 py-3.5 text-center font-mono font-medium">{item.quantity}</td>
                          <td className="px-4 sm:px-6 py-3.5 text-right font-mono text-brand-muted">
                            {currencySymbol}{(item.price || 0).toLocaleString()}
                          </td>
                          <td className="px-4 sm:px-6 py-3.5 text-right font-mono font-bold text-brand-text">
                            {currencySymbol}{(item.total || 0).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals & Notes Section */}
                <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-6 items-start mb-8">
                  {/* Notes Block */}
                  <div className="space-y-3">
                    {invoice.notes && (
                      <div className={cn(
                        "p-4 rounded-2xl border text-xs",
                        isDarkTemplate ? "bg-slate-900/60 border-slate-800" : "bg-slate-50 border-slate-200"
                      )}>
                        <p className="text-[10px] font-black uppercase tracking-wider text-brand-muted mb-1 flex items-center gap-1.5">
                          <FileText size={12} className="text-brand-accent" /> Notes & Instructions
                        </p>
                        <p className="text-brand-muted leading-relaxed whitespace-pre-wrap">{invoice.notes}</p>
                      </div>
                    )}

                    <div className="text-[11px] text-brand-muted leading-relaxed">
                      <p className="font-semibold text-brand-text mb-0.5">Payment Terms:</p>
                      <p>Payment is due within the stipulated period. Goods received in good condition cannot be returned without prior verification.</p>
                    </div>
                  </div>

                  {/* Summary Box */}
                  <div className="space-y-2 sm:ml-auto w-full max-w-sm">
                    <div className="flex justify-between text-xs sm:text-sm text-brand-muted px-3 py-1">
                      <span>Subtotal</span>
                      <span className="font-mono font-bold text-brand-text">
                        {currencySymbol}{(invoice.totalAmount || 0).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex justify-between text-xs sm:text-sm text-brand-muted px-3 py-1">
                      <span>Tax / VAT</span>
                      <span className="font-mono font-medium">Included</span>
                    </div>

                    {/* Total Amount Box */}
                    <div 
                      className="p-4 sm:p-5 rounded-2xl text-white shadow-md flex items-center justify-between"
                      style={{
                        background: currentTemplate.gradient
                          ? `linear-gradient(to right, ${currentTemplate.primaryColor}, ${currentTemplate.secondaryColor || currentTemplate.primaryColor})`
                          : currentTemplate.primaryColor
                      }}
                    >
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Total Due</p>
                        <p className="text-xl sm:text-2xl font-black font-mono tracking-tight mt-0.5">
                          {currencySymbol}{(invoice.totalAmount || 0).toLocaleString()}
                        </p>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center">
                        <CheckCircle size={22} className="text-white" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Signatures & Authorization */}
                <div className="relative z-10 pt-8 border-t border-brand-border/40 grid grid-cols-2 gap-8 text-center text-xs">
                  <div>
                    <div className="w-36 sm:w-44 border-b border-brand-border mx-auto mb-2 h-10" />
                    <p className="font-black text-[11px] uppercase tracking-wider text-brand-text">Customer Signature</p>
                    <p className="text-[10px] text-brand-muted">Received in Good Order</p>
                  </div>

                  <div>
                    <div className="w-36 sm:w-44 border-b border-brand-border mx-auto mb-2 h-10 flex items-end justify-center">
                      <span className="text-[10px] font-mono text-brand-accent tracking-widest font-bold pb-1">
                        [VERIFIED AUTHORIZED]
                      </span>
                    </div>
                    <p className="font-black text-[11px] uppercase tracking-wider text-brand-text">Authorized Signatory</p>
                    <p className="text-[10px] text-brand-muted">{invoice.storeName || settings.storeName}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
