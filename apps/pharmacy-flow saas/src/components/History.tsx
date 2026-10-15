import React, { useEffect, useState } from 'react';
import { Calendar, DollarSign, Tag, Clock, Receipt, CreditCard, Banknote, Search, Filter, ArrowRight, Download, FileText, Sparkles, Printer, FileDown, ArrowRightLeft, X, Plus, Minus } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { useNotification } from '../context/NotificationContext';
import { apiFetch } from '../lib/api';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { printerService, ReceiptData } from '../services/printerService';
import type { PrintData } from '../utils/printer';

import { formatCurrency, formatNumber } from '../utils/formatters';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SaleRecord {
  id: string;
  receiptId?: string;
  timestamp: string;
  createdAt?: string;
  totalAmount: number;
  paymentMethod: string;
  itemsSummary: string;
  accountName?: string;
  attendantName?: string;
  customerName?: string;
  taxType?: 'percentage' | 'fixed' | 'none';
  taxValue?: number;
  taxAmount?: number;
  subTotal?: number;
}

export default function History({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const { showNotification } = useNotification();
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const { settings, playSound } = useSettings();

  useEffect(() => {
    if (onDirtyChange) {
      onDirtyChange(isReturnModalOpen);
    }
    return () => {
      if (onDirtyChange) onDirtyChange(false);
    };
  }, [isReturnModalOpen, onDirtyChange]);

  useEffect(() => {
    apiFetch('/api/sales')
      .then(res => res.json())
      .then(data => {
        setSales(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch sales history:', err);
        setSales([]);
        setLoading(false);
      });
  }, []);

  const filteredSales = sales.filter(sale => 
    (sale.receiptId || sale.id).toLowerCase().includes(search.toLowerCase()) || 
    sale.itemsSummary.toLowerCase().includes(search.toLowerCase())
  );

  const totalSalesAmount = filteredSales.reduce((sum, s) => sum + s.totalAmount, 0);

  const exportToPDF = async () => {
    try {
      const doc = new jsPDF();
      const currency = settings?.currencySymbol || '$';
      const safeCurrency = currency === '₦' ? 'NGN ' : currency;
      
      // Add title
      doc.setFontSize(20);
      doc.setTextColor(15, 23, 42);
      doc.text('Transaction History Report', 14, 22);
      
      // Add store info
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`${settings?.storeName || 'Pharmacy Flow'}`, 14, 30);
      doc.text(`Report Generated: ${new Date().toLocaleString()}`, 14, 35);
      doc.text(`Total Transactions: ${filteredSales.length}`, 14, 40);
      doc.text(`Total Volume: ${safeCurrency}${formatCurrency(totalSalesAmount || 0, '')}`, 14, 45);
      
      // Add table
      const tableData = filteredSales.map(sale => [
        sale.receiptId || sale.id,
        new Date(sale.timestamp).toLocaleString(),
        sale.itemsSummary,
        `${safeCurrency}${formatCurrency(sale.totalAmount, '')}`,
        sale.paymentMethod,
        sale.accountName || 'Walk-in'
      ]);
      
      autoTable(doc, {
        startY: 50,
        head: [['Receipt ID', 'Date & Time', 'Items Summary', 'Amount', 'Payment', 'Account']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        margin: { top: 50 },
      });
      
      const pdfBlob = doc.output('blob');
      const fileName = `transaction_history_${new Date().toISOString().split('T')[0]}.pdf`;
      
      const { saveFile } = await import('../utils/fileSaver');
      await saveFile(fileName, pdfBlob, 'application/pdf');
      
      showNotification('success', 'PDF History exported successfully');
    } catch (err) {
      console.error('PDF Export failed:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      showNotification('error', `Failed to export PDF: ${errorMsg}. Please try opening in a new tab.`);
    }
  };

  const exportToXLS = async () => {
    if (!filteredSales.length) return;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Transactions');

    worksheet.columns = [
      { header: 'Receipt ID', key: 'receiptId', width: 20 },
      { header: 'Date & Time', key: 'dateTime', width: 25 },
      { header: 'Items Summary', key: 'itemsSummary', width: 40 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Payment Method', key: 'paymentMethod', width: 15 },
      { header: 'Account', key: 'account', width: 20 },
    ];

    filteredSales.forEach(sale => {
      worksheet.addRow({
        receiptId: sale.receiptId || sale.id,
        dateTime: new Date(sale.timestamp).toLocaleString(),
        itemsSummary: sale.itemsSummary,
        amount: sale.totalAmount.toFixed(2),
        paymentMethod: sale.paymentMethod,
        account: sale.accountName || 'Walk-in'
      });
    });

    try {
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `transaction_history_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      const { saveFile } = await import('../utils/fileSaver');
      await saveFile(fileName, blob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      
      showNotification('success', 'XLS History exported successfully');
    } catch (err) {
      console.error('XLS Export failed:', err);
      showNotification('error', 'Failed to export XLS. Please try opening in a new tab.');
    }
  };

  const printHistory = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Transaction History</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #333; }
            .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
            .store-name { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
            .report-title { font-size: 18px; color: #666; }
            .meta { margin-bottom: 30px; font-size: 12px; color: #888; display: flex; justify-content: space-between; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #f8fafc; text-align: left; padding: 12px 8px; border-bottom: 2px solid #e2e8f0; font-size: 10px; text-transform: uppercase; }
            td { padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
            tr:nth-child(even) { background: #fcfcfc; }
            .summary { margin-top: 30px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
            .stat-card { padding: 15px; border: 1px solid #e2e8f0; border-radius: 8px; }
            .stat-label { font-size: 9px; font-weight: bold; color: #64748b; text-transform: uppercase; }
            .stat-value { font-size: 16px; font-weight: bold; margin-top: 5px; }
            @media print {
              .no-print { display: none; }
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="store-name">${settings.storeName || 'Pharmacy Flow'}</div>
            <div class="report-title">Transaction History Log</div>
          </div>
          
          <div class="meta">
            <span>Generated: ${new Date().toLocaleString()}</span>
            <span>Records: ${filteredSales.length}</span>
          </div>

          <div class="summary">
            <div class="stat-card">
              <div class="stat-label">Total Transactions</div>
              <div class="stat-value">${filteredSales.length}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Total Volume</div>
              <div class="stat-value">${formatCurrency(totalSalesAmount, settings.currencySymbol)}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Receipt ID</th>
                <th>Date & Time</th>
                <th>Items Summary</th>
                <th>Amount</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              ${filteredSales.map(sale => `
                <tr>
                  <td>${sale.receiptId || sale.id}</td>
                  <td>${new Date(sale.timestamp).toLocaleString()}</td>
                  <td>${sale.itemsSummary}</td>
                  <td>${settings.currencySymbol}${sale.totalAmount.toFixed(2)}</td>
                  <td>${sale.paymentMethod}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <script>
            window.onload = () => {
              window.print();
              setTimeout(() => window.close(), 500);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-accent"></div>
        <p className="text-sm font-bold text-brand-muted uppercase tracking-widest">Loading Records...</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-10 pb-20">
      {/* Header */}
      <div className="flex flex-col items-center text-center gap-6">
        <div className="space-y-2">
          <h2 className="section-title">Transaction History</h2>
          <p className="text-brand-muted">A comprehensive log of all sales and business transactions.</p>
        </div>
        
        {/* Search - Positioned in the middle of the header area */}
        <div className="relative w-full max-w-lg mx-auto">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted" />
          <input 
            type="text" 
            placeholder="Search by receipt or items..." 
            className="input-field pl-12 h-12 text-base shadow-sm focus:shadow-md transition-all rounded-2xl"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Action Buttons - Reduced size and centered */}
        <div className="flex flex-wrap justify-center gap-2">
          <button 
            onClick={printHistory}
            className="btn-secondary flex items-center justify-center gap-2 px-4 h-10 text-xs font-bold uppercase tracking-wider"
          >
            <Printer size={16} />
            Print Log
          </button>
          <button 
            onClick={exportToPDF}
            className="btn-secondary flex items-center justify-center gap-2 px-4 h-10 text-xs font-bold uppercase tracking-wider"
          >
            <FileDown size={16} />
            Export PDF
          </button>
          <button 
            onClick={exportToXLS}
            className="btn-secondary flex items-center justify-center gap-2 px-4 h-10 text-xs font-bold uppercase tracking-wider"
          >
            <Download size={16} />
            Export XLS
          </button>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card group">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
              <Receipt size={20} />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Total Transactions</p>
            <h3 className="text-2xl font-bold text-brand-text">{filteredSales.length}</h3>
          </div>
        </div>
        <div className="card group">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
              <DollarSign size={20} />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Filtered Volume</p>
            <h3 className="text-2xl font-bold text-brand-text">
              {formatCurrency(totalSalesAmount || 0, settings.currencySymbol)}
            </h3>
          </div>
        </div>
        <div className="card group">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-xl bg-violet-50 text-violet-600">
              <Sparkles size={20} />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Last Activity</p>
            <h3 className="text-2xl font-bold text-brand-text">
              {filteredSales.length > 0 
                ? new Date(filteredSales[0].timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) 
                : 'N/A'}
            </h3>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden border-none shadow-xl shadow-brand-accent/5">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-bg/30 border-b border-brand-border">
                <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Receipt ID</th>
                <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Date & Time</th>
                <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Items Summary</th>
                <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Total Amount</th>
                <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-center">Payment</th>
                <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border/50">
              <AnimatePresence mode="popLayout">
                {filteredSales.map((sale, index) => (
                  <motion.tr 
                    key={sale.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className="hover:bg-brand-bg/20 transition-colors group"
                  >
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-brand-bg flex items-center justify-center text-brand-muted group-hover:scale-110 transition-transform">
                          <Receipt size={18} />
                        </div>
                        <button 
                          onClick={() => {
                            setSelectedSale(sale);
                            setIsReceiptModalOpen(true);
                          }}
                          className="text-xs font-mono font-bold text-brand-accent hover:underline uppercase tracking-widest truncate w-24 text-left" 
                          title={sale.receiptId || sale.id}
                        >
                          {sale.receiptId ? sale.receiptId : `${sale.id.split('-')[0]}...`}
                        </button>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-brand-text">
                            {new Date(sale.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          {sale.createdAt && new Date(sale.timestamp).toISOString().split('T')[0] !== new Date(sale.createdAt).toISOString().split('T')[0] && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 text-[8px] font-bold uppercase tracking-widest border border-amber-100" title={`Recorded on ${new Date(sale.createdAt).toLocaleString()}`}>
                              Backdated
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-bold text-brand-muted flex items-center gap-1 uppercase tracking-widest">
                            <Clock size={10} />
                            {new Date(sale.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {sale.attendantName && (
                            <span className="text-[10px] font-bold text-brand-accent flex items-center gap-1 uppercase tracking-widest">
                              <ArrowRight size={10} />
                              {sale.attendantName}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-sm font-medium text-brand-text line-clamp-1 max-w-xs" title={sale.itemsSummary}>
                        {sale.itemsSummary}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <span className="text-sm font-black text-brand-text">
                        {formatCurrency(sale.totalAmount || 0, settings.currencySymbol)}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex justify-center">
                        <span className={cn(
                          "inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border",
                          sale.paymentMethod === 'cash' 
                            ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                            : sale.paymentMethod === 'debt'
                            ? "bg-rose-50 text-rose-600 border-rose-100"
                            : "bg-blue-50 text-blue-600 border-blue-100"
                        )}>
                          {sale.paymentMethod === 'cash' ? <Banknote size={12} /> : <CreditCard size={12} />}
                          {sale.paymentMethod}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => { setSelectedSale(sale); setIsReceiptModalOpen(true); }}
                          className="p-2 rounded-xl bg-brand-bg text-brand-muted hover:bg-brand-accent hover:text-white transition-all"
                          title="View Receipt"
                        >
                          <Receipt size={16} />
                        </button>
                        <button 
                          onClick={() => { setSelectedSale(sale); setIsReturnModalOpen(true); }}
                          className="p-2 rounded-xl bg-brand-bg text-brand-muted hover:bg-rose-500 hover:text-white transition-all"
                          title="Process Return"
                        >
                          <ArrowRightLeft size={16} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {filteredSales.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-3 opacity-30">
                      <FileText size={48} strokeWidth={1} />
                      <p className="font-medium">No transaction records found</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isReturnModalOpen && selectedSale && (
        <ReturnModal 
          sale={selectedSale} 
          onClose={() => setIsReturnModalOpen(false)} 
          onSave={() => { setIsReturnModalOpen(false); showNotification('success', 'Return processed successfully'); }}
          onDirtyChange={onDirtyChange}
        />
      )}

      {isReceiptModalOpen && selectedSale && (
        <ReceiptModal 
          sale={selectedSale} 
          onClose={() => setIsReceiptModalOpen(false)} 
        />
      )}
    </div>
  );
}

function ReceiptModal({ sale, onClose }: { sale: SaleRecord, onClose: () => void }) {
  const { settings } = useSettings();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [paperSize, setPaperSize] = useState<'58mm' | '80mm' | 'thermal' | 'a4' | 'a2'>(settings.paperSize || '80mm');

  useEffect(() => {
    apiFetch(`/api/sales/${sale.id}/items`)
      .then(res => res.json())
      .then(data => {
        setItems(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch sale items:', err);
        setItems([]);
        setLoading(false);
      });
  }, [sale.id]);

  const handlePrint = async () => {
    const printData: PrintData = {
      storeName: settings.storeName || 'Store',
      storeAddress: settings.storeAddress || '',
      phoneNumber: settings.phoneNumber || '',
      receiptMessage: (settings.receiptMessage || 'Thank you!').replace('{storeName}', settings.storeName || 'Store'),
      items: items.map(item => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity,
        serialNumber: item.serialNumber,
        cost: item.cost || 0
      })),
      totalAmount: sale.totalAmount,
      paymentMethod: sale.paymentMethod,
      accountName: sale.attendantName || 'Attendant',
      customerName: sale.customerName,
      date: new Date(sale.timestamp),
      currencySymbol: settings.currencySymbol || '$',
      receiptId: sale.receiptId || sale.id,
      taxType: sale.taxType,
      taxValue: sale.taxValue,
      taxAmount: sale.taxAmount,
      subTotal: sale.subTotal
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
      customerName: printData.customerName,
      footerMessage: printData.receiptMessage
    };

    try {
      if (settings.printMethod === 'bluetooth') {
        const printerId = settings.defaultPrinterId || (settings.pairedPrinters && settings.pairedPrinters.length > 0 ? settings.pairedPrinters[0].id : null);
        
        if (!printerId) {
          throw new Error('No Bluetooth printer selected. Please connect and select a printer in Settings.');
        }

        if (!printerService.isConnectedTo(printerId)) {
          await printerService.connect(printerId);
        }
        await printerService.printReceipt(receiptData, settings.currencySymbol);
      } else {
        const { receiptPrinter } = await import('../utils/printer');
        const bytes = receiptPrinter.generateReceipt(printData, paperSize as any);
        if (settings.printMethod === 'android') {
          await receiptPrinter.printViaAndroid(bytes);
        } else if (settings.printMethod === 'browser') {
          receiptPrinter.printViaBrowser(printData, paperSize as any);
        } else {
          receiptPrinter.printViaDeepLink(bytes);
        }
      }
    } catch (err: any) {
      console.error('Printing failed:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-brand-text/20 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto pt-20">
      <div className="bg-brand-surface rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-brand-border my-auto">
        <div className="px-6 py-4 border-b border-brand-border flex justify-between items-center">
          <h3 className="text-lg font-bold text-brand-text">Sales Receipt</h3>
          <button onClick={onClose} className="p-2 hover:bg-brand-bg rounded-xl transition-colors text-brand-muted">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="bg-brand-bg/30 p-4 rounded-2xl border border-brand-border space-y-2 font-mono text-xs">
            <div className="text-center border-b border-brand-border pb-2 mb-2">
              <p className="font-bold text-sm">{settings.storeName}</p>
              <p>{settings.storeAddress}</p>
              <p>{settings.phoneNumber}</p>
            </div>
            <div className="flex justify-between">
              <span>Receipt ID:</span>
              <span className="font-bold">{sale.receiptId || sale.id.split('-')[0]}</span>
            </div>
            <div className="flex justify-between">
              <span>Date:</span>
              <span>{new Date(sale.timestamp).toLocaleString()}</span>
            </div>
            {sale.createdAt && new Date(sale.timestamp).toISOString().split('T')[0] !== new Date(sale.createdAt).toISOString().split('T')[0] && (
              <>
                <div className="text-center py-1 mb-2 bg-amber-50 border border-amber-100 rounded text-amber-600 font-bold uppercase tracking-widest text-[10px]">
                  Backdated Sale
                </div>
                <div className="flex justify-between text-amber-600">
                  <span>Recorded At:</span>
                  <span>{new Date(sale.createdAt).toLocaleString()}</span>
                </div>
              </>
            )}
            <div className="flex justify-between">
              <span>Attendant:</span>
              <span>{sale.attendantName || 'N/A'}</span>
            </div>
            {sale.customerName && (
              <div className="flex justify-between">
                <span>Customer:</span>
                <span>{sale.customerName}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Payment:</span>
              <span className="uppercase">{sale.paymentMethod}</span>
            </div>
            <div className="border-t border-brand-border pt-2 mt-2">
              {loading ? (
                <p className="text-center py-4">Loading items...</p>
              ) : (
                <div className="space-y-1">
                  {items.map((item, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span>{item.productName} x{item.quantity}</span>
                      <span>{formatCurrency(item.price * item.quantity, settings.currencySymbol)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-brand-border pt-2 mt-2 font-bold text-sm flex justify-between">
              <span>TOTAL:</span>
              <span>{formatCurrency(sale.totalAmount, settings.currencySymbol)}</span>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Select Paper Size</label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {['58mm', '80mm', 'thermal', 'a4', 'a2'].map(size => (
                <button
                  key={size}
                  onClick={() => setPaperSize(size as any)}
                  className={cn(
                    "py-2 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all",
                    paperSize === size 
                      ? "bg-brand-accent text-white border-brand-accent shadow-sm" 
                      : "bg-brand-bg text-brand-muted border-brand-border hover:border-brand-accent/50"
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <button 
            onClick={handlePrint}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2"
          >
            <Printer size={18} />
            Print Receipt
          </button>
        </div>
      </div>
    </div>
  );
}

function ReturnModal({ sale, onClose, onSave, onDirtyChange }: { sale: SaleRecord, onClose: () => void, onSave: () => void, onDirtyChange?: (dirty: boolean) => void }) {
  const { settings, playSound } = useSettings();
  const { showNotification } = useNotification();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [returnQuantities, setReturnQuantities] = useState<{[key: string]: number}>({});
  const [reason, setReason] = useState('');
  const [returnedBy, setReturnedBy] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const hasChanges = Object.values(returnQuantities).some(qty => Number(qty) > 0) || reason !== '' || returnedBy !== '';
    if (onDirtyChange) onDirtyChange(hasChanges);
  }, [returnQuantities, reason, returnedBy, onDirtyChange]);

  useEffect(() => {
    apiFetch(`/api/sales/${sale.id}/items`)
      .then(res => res.json())
      .then(data => {
        const safeData = Array.isArray(data) ? data : [];
        setItems(safeData);
        const initialQtys: {[key: string]: number} = {};
        safeData.forEach((item: any) => {
          initialQtys[item.productId] = 0;
        });
        setReturnQuantities(initialQtys);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch sale items:', err);
        setItems([]);
        setLoading(false);
      });
  }, [sale.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const itemsToReturn = Object.entries(returnQuantities).filter(([_, qty]) => (qty as number) > 0);
    
    if (itemsToReturn.length === 0) {
      showNotification('error', 'Please select at least one item to return.');
      return;
    }

    setIsSubmitting(true);
    try {
      for (const [productId, quantity] of itemsToReturn) {
        await apiFetch('/api/returns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            saleId: sale.id,
            productId,
            quantity,
            reason,
            returnedBy
          })
        });
      }
      playSound('success');
      onSave();
    } catch (err) {
      console.error('Failed to process return:', err);
      showNotification('error', 'Failed to process return.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-brand-text/20 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto pt-20">
      <div className="bg-brand-surface rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-brand-border my-auto">
        <div className="px-6 py-4 md:px-8 md:py-6 border-b border-brand-border flex justify-between items-center">
          <div>
            <h3 className="text-lg md:text-xl font-bold text-brand-text">Process Return</h3>
            <p className="text-[10px] md:text-xs text-brand-muted mt-0.5">Receipt: {sale.receiptId || sale.id}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-brand-bg rounded-xl transition-colors text-brand-muted">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6">
          {loading ? (
            <div className="py-10 text-center">Loading items...</div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Select Items to Return</label>
                <div className="divide-y divide-brand-border border border-brand-border rounded-2xl overflow-hidden">
                  {items.map(item => (
                    <div key={item.productId} className="p-4 flex items-center justify-between bg-brand-surface">
                      <div className="flex-1">
                        <p className="text-sm font-bold text-brand-text">{item.productName}</p>
                        <p className="text-[10px] text-brand-muted">Sold: {item.quantity} | Price: {formatCurrency(item.price, settings.currencySymbol)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          type="button"
                          onClick={() => setReturnQuantities(prev => ({...prev, [item.productId]: Math.max(0, (prev[item.productId] || 0) - 1)}))}
                          className="w-8 h-8 rounded-lg bg-brand-bg flex items-center justify-center text-brand-text hover:bg-brand-border transition-colors"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-8 text-center font-mono font-bold">{returnQuantities[item.productId] || 0}</span>
                        <button 
                          type="button"
                          onClick={() => setReturnQuantities(prev => ({...prev, [item.productId]: Math.min(item.quantity, (prev[item.productId] || 0) + 1)}))}
                          className="w-8 h-8 rounded-lg bg-brand-bg flex items-center justify-center text-brand-text hover:bg-brand-border transition-colors"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Returned By</label>
                  <input 
                    required
                    placeholder="Account Name"
                    className="input-field"
                    value={returnedBy}
                    onChange={e => setReturnedBy(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Reason for Return</label>
                  <input 
                    required
                    placeholder="e.g. Defective, Wrong Item"
                    className="input-field"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button 
              type="submit" 
              disabled={isSubmitting || loading}
              className="btn-primary flex-1 bg-rose-600 hover:bg-rose-700 shadow-rose-200"
            >
              {isSubmitting ? 'Processing...' : 'Confirm Return'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
