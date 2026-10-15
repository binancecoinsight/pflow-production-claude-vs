import React, { useEffect, useState } from 'react';
import { RefreshCw, Search, Filter, Calendar, Clock, Receipt, User, ArrowRightLeft, Download, FileText, Printer, FileDown, X, Package, Truck, CheckCircle2, Store, Plus, Minus, Trash2 } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useSettings } from '../context/SettingsContext';
import { apiFetch } from '../lib/api';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ReturnRecord {
  id: string;
  saleId: string;
  productId: string;
  productName: string;
  quantity: number;
  reason: string;
  returnedBy: string;
  timestamp: string;
  sentToVendor: boolean;
  sentToVendorDate?: string;
  vendorReplaced: boolean;
  vendorReplaceDate?: string;
  inShop: boolean;
  returnedToStoreDate?: string;
  status: 'customer_returned' | 'sent_to_vendor' | 'vendor_replaced' | 'completed';
}

export default function Returns({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const { showNotification } = useNotification();
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedReturn, setSelectedReturn] = useState<ReturnRecord | null>(null);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isNewReturnModalOpen, setIsNewReturnModalOpen] = useState(false);

  useEffect(() => {
    if (onDirtyChange) onDirtyChange(isNewReturnModalOpen || isStatusModalOpen);
  }, [isNewReturnModalOpen, isStatusModalOpen, onDirtyChange]);

  useEffect(() => {
    fetchReturns();
  }, []);

  const fetchReturns = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/returns');
      const data = await res.json();
      setReturns(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch returns', err);
      showNotification('error', 'Failed to load returns');
    } finally {
      setLoading(false);
    }
  };

  const updateReturnStatus = async (id: string, updates: Partial<ReturnRecord>) => {
    try {
      await apiFetch(`/api/returns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      showNotification('success', 'Return status updated');
      fetchReturns();
      setIsStatusModalOpen(false);
    } catch (err) {
      console.error('Failed to update return status', err);
      showNotification('error', 'Failed to update status');
    }
  };

  const filteredReturns = returns.filter(ret => 
    ret.productName.toLowerCase().includes(search.toLowerCase()) ||
    ret.reason.toLowerCase().includes(search.toLowerCase()) ||
    ret.returnedBy.toLowerCase().includes(search.toLowerCase()) ||
    (ret.saleId || '').toLowerCase().includes(search.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'customer_returned':
        return <span className="px-3 py-1 bg-amber-50 text-amber-600 border border-amber-100 rounded-full text-[10px] font-bold uppercase tracking-widest">Customer Returned</span>;
      case 'sent_to_vendor':
        return <span className="px-3 py-1 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-[10px] font-bold uppercase tracking-widest">Sent to Vendor</span>;
      case 'vendor_replaced':
        return <span className="px-3 py-1 bg-purple-50 text-purple-600 border border-purple-100 rounded-full text-[10px] font-bold uppercase tracking-widest">Vendor Replaced</span>;
      case 'completed':
        return <span className="px-3 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full text-[10px] font-bold uppercase tracking-widest">Completed</span>;
      default:
        return <span className="px-3 py-1 bg-brand-bg text-brand-muted border border-brand-border rounded-full text-[10px] font-bold uppercase tracking-widest">{status}</span>;
    }
  };

  const exportToPDF = async () => {
    const doc = new jsPDF();
    doc.text('Returns History', 14, 15);
    
    const tableData = filteredReturns.map(ret => [
      new Date(ret.timestamp).toLocaleDateString(),
      ret.productName,
      ret.quantity,
      ret.reason,
      ret.returnedBy
    ]);

    autoTable(doc, {
      head: [['Date', 'Product', 'Qty', 'Reason', 'Returned By']],
      body: tableData,
      startY: 20,
    });

    const pdfBlob = doc.output('blob');
    const fileName = 'returns_history.pdf';
    
    const { saveFile } = await import('../utils/fileSaver');
    await saveFile(fileName, pdfBlob, 'application/pdf');
  };

  const exportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Returns');

    worksheet.columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Product', key: 'product', width: 30 },
      { header: 'Quantity', key: 'quantity', width: 10 },
      { header: 'Reason', key: 'reason', width: 30 },
      { header: 'Returned By', key: 'returnedBy', width: 20 },
    ];

    filteredReturns.forEach(ret => {
      worksheet.addRow({
        date: new Date(ret.timestamp).toLocaleDateString(),
        product: ret.productName,
        quantity: ret.quantity,
        reason: ret.reason,
        returnedBy: ret.returnedBy
      });
    });

    try {
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = 'returns_history.xlsx';
      
      const { saveFile } = await import('../utils/fileSaver');
      await saveFile(fileName, blob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } catch (err) {
      console.error('Excel Export failed:', err);
      showNotification('error', 'Failed to export Excel');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-accent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-3xl font-black text-brand-text tracking-tight flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-brand-accent/10 flex items-center justify-center text-brand-accent">
              <RefreshCw size={28} />
            </div>
            Returns Management
          </h2>
          <p className="text-brand-muted font-bold text-sm uppercase tracking-widest ml-15">
            View and manage returned items
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsNewReturnModalOpen(true)}
            className="btn-primary flex items-center gap-2 px-6 py-3 shadow-lg shadow-brand-accent/20"
          >
            <Plus size={20} />
            Add Return
          </button>
          <button 
            onClick={exportToPDF}
            className="p-3 bg-brand-surface border border-brand-border rounded-2xl text-brand-text hover:border-brand-accent transition-all flex items-center gap-2 font-bold text-xs uppercase tracking-widest"
          >
            <FileDown size={18} className="text-brand-accent" />
            PDF
          </button>
          <button 
            onClick={exportToExcel}
            className="p-3 bg-brand-surface border border-brand-border rounded-2xl text-brand-text hover:border-brand-accent transition-all flex items-center gap-2 font-bold text-xs uppercase tracking-widest"
          >
            <FileText size={18} className="text-brand-accent" />
            Excel
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="card p-4 flex flex-col md:flex-row gap-4">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted group-focus-within:text-brand-accent transition-colors" size={20} />
          <input 
            type="text"
            placeholder="Search by product, reason, or person..."
            className="input-field pl-12"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="p-3 bg-brand-bg rounded-2xl text-brand-text hover:bg-brand-border transition-all flex items-center gap-2 font-bold text-xs uppercase tracking-widest">
          <Filter size={18} />
          Filters
        </button>
      </div>

      {/* Table */}
      {filteredReturns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-brand-surface rounded-3xl border-2 border-dashed border-brand-border">
          <div className="w-20 h-20 rounded-full bg-brand-bg flex items-center justify-center text-brand-muted mb-4">
            <RefreshCw size={40} strokeWidth={1} />
          </div>
          <h3 className="text-xl font-bold text-brand-text">No returns found</h3>
          <p className="text-brand-muted mt-2 mb-6">Start by adding a new return record</p>
          <button 
            onClick={() => setIsNewReturnModalOpen(true)}
            className="btn-primary flex items-center gap-2 px-8 py-3 shadow-lg shadow-brand-accent/20"
          >
            <Plus size={20} />
            Add New Return
          </button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden border-none shadow-xl shadow-brand-accent/5">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-bg/30 border-b border-brand-border">
                <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Date & Time</th>
                <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Product</th>
                <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-center">Quantity</th>
                <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Reason</th>
                <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-center">Status</th>
                <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border/50">
              <AnimatePresence mode="popLayout">
                {filteredReturns.map((ret, index) => (
                  <motion.tr 
                    key={ret.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className="hover:bg-brand-bg/20 transition-colors group cursor-pointer"
                    onClick={() => { setSelectedReturn(ret); setIsStatusModalOpen(true); }}
                  >
                    <td className="px-8 py-5">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-brand-text">
                          {new Date(ret.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span className="text-[10px] font-bold text-brand-muted flex items-center gap-1 uppercase tracking-widest">
                          <Clock size={10} />
                          {new Date(ret.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-brand-bg flex items-center justify-center text-brand-muted group-hover:scale-110 transition-transform">
                          <RefreshCw size={18} />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-brand-text">
                            {ret.productName}
                          </span>
                          <span className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">
                            Receipt: {ret.saleId}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <span className="px-3 py-1 bg-brand-bg rounded-full text-xs font-bold text-brand-text">
                        {ret.quantity}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex flex-col">
                        <span className="text-sm text-brand-muted italic">
                          "{ret.reason}"
                        </span>
                        <span className="text-[10px] font-bold text-brand-muted uppercase tracking-widest mt-1">
                          By: {ret.returnedBy}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-center">
                      {getStatusBadge(ret.status)}
                    </td>
                    <td className="px-8 py-5 text-right">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setSelectedReturn(ret); setIsStatusModalOpen(true); }}
                        className="p-2 rounded-xl bg-brand-bg text-brand-muted hover:bg-brand-accent hover:text-white transition-all"
                        title="Update Status"
                      >
                        <ArrowRightLeft size={16} />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>
    )}

      {isStatusModalOpen && selectedReturn && (
        <StatusModal 
          ret={selectedReturn}
          onClose={() => setIsStatusModalOpen(false)}
          onUpdate={updateReturnStatus}
        />
      )}

      {isNewReturnModalOpen && (
        <NewReturnModal 
          onClose={() => setIsNewReturnModalOpen(false)}
          onSave={() => {
            setIsNewReturnModalOpen(false);
            showNotification('success', 'Return processed successfully');
            fetchReturns();
          }}
        />
      )}
    </div>
  );
}

function NewReturnModal({ onClose, onSave }: { onClose: () => void, onSave: () => void }) {
  const { settings, playSound } = useSettings();
  const { showNotification } = useNotification();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSale, setSelectedSale] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [returnQuantities, setReturnQuantities] = useState<{[key: string]: number}>({});
  const [reason, setReason] = useState('');
  const [returnedBy, setReturnedBy] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const searchSale = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/sales');
      const allSales = await res.json();
      const foundSale = allSales.find((s: any) => 
        (s.receiptId || '').toLowerCase() === searchQuery.toLowerCase() ||
        s.id.toLowerCase() === searchQuery.toLowerCase()
      );
      
      if (foundSale) {
        setSelectedSale(foundSale);
        const itemsRes = await apiFetch(`/api/sales/${foundSale.id}/items`);
        const itemsData = await itemsRes.json();
        setItems(Array.isArray(itemsData) ? itemsData : []);
        
        const initialQtys: {[key: string]: number} = {};
        (Array.isArray(itemsData) ? itemsData : []).forEach((item: any) => {
          initialQtys[item.productId] = 0;
        });
        setReturnQuantities(initialQtys);
      } else {
        showNotification('error', 'Sale not found');
      }
    } catch (err) {
      console.error('Search failed', err);
      showNotification('error', 'Failed to search for sale');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSale) return;
    
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
            saleId: selectedSale.id,
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto pt-20">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -20 }}
        className="bg-brand-surface rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-brand-border my-8"
      >
        <div className="px-6 py-4 md:px-8 md:py-6 border-b border-brand-border flex justify-between items-center bg-brand-bg/30 dark:bg-brand-surface/50">
          <div>
            <h3 className="text-lg md:text-xl font-bold text-brand-text">Add New Return</h3>
            <p className="text-[10px] md:text-xs text-brand-muted mt-0.5 uppercase tracking-widest">Process a return from a previous sale</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-brand-bg dark:hover:bg-brand-surface rounded-xl transition-colors text-brand-muted">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 md:p-8 space-y-6">
          {!selectedSale ? (
            <div className="space-y-4">
              <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Search Sale by Receipt ID</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Receipt size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
                  <input 
                    type="text"
                    placeholder="e.g. RCPT-000001"
                    className="input-field pl-10 dark:bg-brand-surface dark:border-brand-border dark:text-brand-text dark:placeholder-brand-muted/50"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchSale()}
                  />
                </div>
                <button 
                  onClick={searchSale}
                  disabled={loading}
                  className="btn-primary px-6 flex items-center gap-2"
                >
                  {loading ? <RefreshCw size={18} className="animate-spin" /> : <Search size={18} />}
                  Search
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="bg-brand-bg/30 dark:bg-brand-surface/50 p-4 rounded-2xl border border-brand-border flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Selected Sale</p>
                  <p className="text-sm font-bold text-brand-text">{selectedSale.receiptId || selectedSale.id}</p>
                  <p className="text-[10px] text-brand-muted">{new Date(selectedSale.timestamp).toLocaleString()}</p>
                </div>
                <button 
                  type="button"
                  onClick={() => { setSelectedSale(null); setItems([]); }}
                  className="text-xs font-bold text-brand-accent hover:underline"
                >
                  Change Sale
                </button>
              </div>

              <div className="space-y-4">
                <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Select Items to Return</label>
                <div className="divide-y divide-brand-border border border-brand-border rounded-2xl overflow-hidden max-h-60 overflow-y-auto">
                  {items.map(item => (
                    <div key={item.productId} className="p-4 flex items-center justify-between bg-brand-surface">
                      <div className="flex-1">
                        <p className="text-sm font-bold text-brand-text">{item.productName}</p>
                        <p className="text-[10px] text-brand-muted">Sold: {item.quantity} | Price: {settings.currencySymbol}{item.price.toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          type="button"
                          onClick={() => setReturnQuantities(prev => ({...prev, [item.productId]: Math.max(0, (prev[item.productId] || 0) - 1)}))}
                          className="w-8 h-8 rounded-lg bg-brand-bg dark:bg-brand-surface/50 flex items-center justify-center text-brand-text hover:bg-brand-border transition-colors"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-8 text-center font-mono font-bold">{returnQuantities[item.productId] || 0}</span>
                        <button 
                          type="button"
                          onClick={() => setReturnQuantities(prev => ({...prev, [item.productId]: Math.min(item.quantity, (prev[item.productId] || 0) + 1)}))}
                          className="w-8 h-8 rounded-lg bg-brand-bg dark:bg-brand-surface/50 flex items-center justify-center text-brand-text hover:bg-brand-border transition-colors"
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
                    className="input-field dark:bg-brand-surface dark:border-brand-border dark:text-brand-text dark:placeholder-brand-muted/50"
                    value={returnedBy}
                    onChange={e => setReturnedBy(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Reason for Return</label>
                  <input 
                    required
                    placeholder="e.g. Defective, Wrong Item"
                    className="input-field dark:bg-brand-surface dark:border-brand-border dark:text-brand-text dark:placeholder-brand-muted/50"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={onClose} className="flex-1 btn-secondary py-3">Cancel</button>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <RefreshCw size={18} className="animate-spin" /> : <ArrowRightLeft size={18} />}
                  Process Return
                </button>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function StatusModal({ ret, onClose, onUpdate }: { ret: ReturnRecord, onClose: () => void, onUpdate: (id: string, updates: any) => void }) {
  const [status, setStatus] = useState(ret.status);
  const [sentToVendor, setSentToVendor] = useState(ret.sentToVendor);
  const [sentToVendorDate, setSentToVendorDate] = useState(ret.sentToVendorDate || new Date().toISOString().split('T')[0]);
  const [vendorReplaced, setVendorReplaced] = useState(ret.vendorReplaced);
  const [vendorReplaceDate, setVendorReplaceDate] = useState(ret.vendorReplaceDate || new Date().toISOString().split('T')[0]);
  const [inShop, setInShop] = useState(ret.inShop);
  const [returnedToStoreDate, setReturnedToStoreDate] = useState(ret.returnedToStoreDate || new Date().toISOString().split('T')[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate(ret.id, {
      status,
      sentToVendor,
      sentToVendorDate: sentToVendor ? sentToVendorDate : null,
      vendorReplaced,
      vendorReplaceDate: vendorReplaced ? vendorReplaceDate : null,
      inShop,
      returnedToStoreDate: inShop ? returnedToStoreDate : null
    });
  };

  return (
    <div className="fixed inset-0 bg-brand-text/20 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto pt-20">
      <div className="bg-brand-surface rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-brand-border my-8">
        <div className="px-6 py-4 border-b border-brand-border flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-brand-text">Update Return Status</h3>
            <p className="text-xs text-brand-muted mt-0.5">{ret.productName} (Qty: {ret.quantity})</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-brand-bg rounded-xl transition-colors text-brand-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Current Status</label>
              <select 
                className="input-field dark:bg-brand-surface dark:border-brand-border dark:text-brand-text"
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
              >
                <option value="customer_returned" className="dark:bg-brand-surface">Customer Returned</option>
                <option value="sent_to_vendor" className="dark:bg-brand-surface">Sent to Vendor</option>
                <option value="vendor_replaced" className="dark:bg-brand-surface">Vendor Replaced</option>
                <option value="completed" className="dark:bg-brand-surface">Completed (Back in Store)</option>
              </select>
            </div>

            <div className="space-y-4 border-t border-brand-border pt-4 mt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input 
                    type="checkbox" 
                    id="sentToVendor"
                    checked={sentToVendor}
                    onChange={(e) => setSentToVendor(e.target.checked)}
                    className="w-5 h-5 rounded border-brand-border text-brand-accent focus:ring-brand-accent dark:bg-brand-surface/50"
                  />
                  <label htmlFor="sentToVendor" className="text-sm font-bold text-brand-text">Sent to Vendor</label>
                </div>
                {sentToVendor && (
                  <input 
                    type="date" 
                    className="input-field py-1 text-xs w-32 dark:bg-brand-surface dark:border-brand-border dark:text-brand-text"
                    value={sentToVendorDate}
                    onChange={(e) => setSentToVendorDate(e.target.value)}
                  />
                )}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input 
                    type="checkbox" 
                    id="vendorReplaced"
                    checked={vendorReplaced}
                    onChange={(e) => setVendorReplaced(e.target.checked)}
                    className="w-5 h-5 rounded border-brand-border text-brand-accent focus:ring-brand-accent dark:bg-brand-surface/50"
                  />
                  <label htmlFor="vendorReplaced" className="text-sm font-bold text-brand-text">Vendor Replaced</label>
                </div>
                {vendorReplaced && (
                  <input 
                    type="date" 
                    className="input-field py-1 text-xs w-32 dark:bg-brand-surface dark:border-brand-border dark:text-brand-text"
                    value={vendorReplaceDate}
                    onChange={(e) => setVendorReplaceDate(e.target.value)}
                  />
                )}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input 
                    type="checkbox" 
                    id="inShop"
                    checked={inShop}
                    onChange={(e) => setInShop(e.target.checked)}
                    className="w-5 h-5 rounded border-brand-border text-brand-accent focus:ring-brand-accent dark:bg-brand-surface/50"
                  />
                  <label htmlFor="inShop" className="text-sm font-bold text-brand-text">Goods in Shop</label>
                </div>
                {inShop && (
                  <input 
                    type="date" 
                    className="input-field py-1 text-xs w-32 dark:bg-brand-surface dark:border-brand-border dark:text-brand-text"
                    value={returnedToStoreDate}
                    onChange={(e) => setReturnedToStoreDate(e.target.value)}
                  />
                )}
              </div>
            </div>

            <div className="bg-brand-bg/30 dark:bg-brand-surface/50 p-4 rounded-2xl border border-brand-border space-y-2">
              <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">History Summary</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-brand-muted">Returned by Customer:</span>
                  <span className="font-bold text-brand-text">{new Date(ret.timestamp).toLocaleDateString()}</span>
                </div>
                {sentToVendor && (
                  <div className="flex justify-between">
                    <span className="text-brand-muted">Sent to Vendor:</span>
                    <span className="font-bold text-brand-text">{new Date(sentToVendorDate).toLocaleDateString()}</span>
                  </div>
                )}
                {vendorReplaced && (
                  <div className="flex justify-between">
                    <span className="text-brand-muted">Vendor Replaced:</span>
                    <span className="font-bold text-brand-text">{new Date(vendorReplaceDate).toLocaleDateString()}</span>
                  </div>
                )}
                {inShop && (
                  <div className="flex justify-between">
                    <span className="text-brand-muted">Returned to Store:</span>
                    <span className="font-bold text-brand-text">{new Date(returnedToStoreDate).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 dark:bg-brand-surface dark:border-brand-border dark:text-brand-text">Cancel</button>
            <button type="submit" className="btn-primary flex-1">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  );
}
