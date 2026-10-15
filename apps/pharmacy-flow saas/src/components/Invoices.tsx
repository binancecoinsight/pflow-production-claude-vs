import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Search, FileText, Download, Printer, Share2, 
  Trash2, X, CheckCircle, Clock, AlertCircle, 
  ChevronRight, MoreVertical, Calendar, User, 
  DollarSign, Package, Sparkles, Filter, ArrowLeft,
  Mail, Phone, MapPin, CreditCard, Building2,
  ExternalLink, Send, Eye, Edit3
} from 'lucide-react';
import { Invoice, InvoiceItem, Account, Product } from '../types';
import { INVOICE_TEMPLATES } from '../constants/invoiceTemplates';
import InvoicePreview from './InvoicePreview';
import InvoiceTemplateGalleryModal from './InvoiceTemplateGalleryModal';
import InvoiceEditorModal from './InvoiceEditorModal';
import { printerService, ReceiptData } from '../services/printerService';
import type { PrintData } from '../utils/printer';
import { apiFetch } from '../lib/api';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Invoices() {
  const { settings } = useSettings();
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('classic');
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isNewInvoicePreview, setIsNewInvoicePreview] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchInvoices = async () => {
    try {
      const res = await apiFetch('/api/invoices');
      const data = await res.json();
      setInvoices(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch invoices:', err);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const filteredInvoices = (Array.isArray(invoices) ? invoices : []).filter(inv => {
    const matchesSearch = 
      (inv.invoiceNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.accountName || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this invoice?')) return;
    try {
      await apiFetch(`/api/invoices/${id}`, { method: 'DELETE' });
      fetchInvoices();
    } catch (err) {
      console.error('Failed to delete invoice:', err);
    }
  };

  const handleUpdateStatus = async (id: string, status: Invoice['status']) => {
    try {
      await apiFetch(`/api/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      fetchInvoices();
    } catch (err) {
      console.error('Failed to update invoice status:', err);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-brand-text tracking-tight mb-2">Invoices</h1>
          <p className="text-brand-muted font-medium">Manage customer billing and payments</p>
        </div>
        <button 
          onClick={() => { 
            setSelectedInvoice(null); 
            setEditingInvoice(null);
            setIsGalleryOpen(true); 
          }}
          className="btn-primary flex items-center gap-3 px-8"
        >
          <Plus size={20} />
          Create Invoice
        </button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-brand-surface p-6 rounded-3xl border border-brand-border shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-brand-accent/10 flex items-center justify-center text-brand-accent">
              <FileText size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Total Invoices</p>
              <p className="text-2xl font-bold text-brand-text">{invoices.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-brand-surface p-6 rounded-3xl border border-brand-border shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center text-green-500">
              <CheckCircle size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Paid</p>
              <p className="text-2xl font-bold text-brand-text">
                {invoices.filter(i => i.status === 'paid').length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-brand-surface p-6 rounded-3xl border border-brand-border shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Unpaid</p>
              <p className="text-2xl font-bold text-brand-text">
                {invoices.filter(i => i.status === 'unpaid').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col lg:flex-row gap-6 items-center justify-between">
        <div className="relative flex-1 max-w-xl w-full">
          <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-brand-muted" />
          <input 
            type="text"
            placeholder="Search by invoice number or customer..."
            className="input-field pl-12 py-4"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3 overflow-x-auto pb-2 lg:pb-0 w-full lg:w-auto">
            {['all', 'unpaid', 'paid', 'overdue', 'cancelled'].map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  "px-6 py-3 rounded-2xl text-xs font-bold transition-all whitespace-nowrap border",
                  statusFilter === status 
                    ? "bg-brand-accent text-brand-bg border-brand-accent shadow-lg shadow-brand-accent/20" 
                    : "bg-brand-surface text-brand-muted border-brand-border hover:border-brand-accent"
                )}
              >
                {(status || '').charAt(0).toUpperCase() + (status || '').slice(1)}
              </button>
            ))}
        </div>
      </div>

      {/* Invoices List */}
      <div className="bg-brand-surface rounded-[2rem] border border-brand-border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-brand-bg/50 border-b border-brand-border">
                <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-muted uppercase tracking-widest">Invoice #</th>
                <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-muted uppercase tracking-widest">Customer</th>
                <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-muted uppercase tracking-widest">Date</th>
                <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-muted uppercase tracking-widest">Due Date</th>
                <th className="px-8 py-6 text-right text-[10px] font-bold text-brand-muted uppercase tracking-widest">Amount</th>
                <th className="px-8 py-6 text-center text-[10px] font-bold text-brand-muted uppercase tracking-widest">Status</th>
                <th className="px-8 py-6 text-right text-[10px] font-bold text-brand-muted uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {(filteredInvoices || []).map((inv, index) => (
                <motion.tr 
                  key={inv.id} 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="group hover:bg-brand-bg/30 transition-colors"
                >
                  <td className="px-8 py-6">
                    <button 
                      onClick={async () => {
                        if (!inv.id) {
                          console.error('Invoice ID is missing', inv);
                          showNotification('error', 'Invoice ID is missing');
                          return;
                        }
                        try {
                          const res = await apiFetch(`/api/invoices/${inv.id}`);
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error || `Failed to fetch invoice (${res.status})`);
                          setSelectedInvoice(data);
                          setIsNewInvoicePreview(false);
                          setIsPreviewOpen(true);
                        } catch (err: any) {
                          console.error('Error fetching invoice:', err);
                          showNotification('error', err.message || 'Could not load invoice details');
                        }
                      }}
                      className="text-brand-accent font-bold hover:underline flex items-center gap-2"
                    >
                      {inv.invoiceNumber}
                      <ExternalLink size={14} />
                    </button>
                  </td>
                  <td className="px-8 py-6">
                    <div className="font-bold text-brand-text">{inv.accountName}</div>
                  </td>
                  <td className="px-8 py-6 text-brand-muted font-medium">
                    {new Date(inv.timestamp).toLocaleDateString()}
                  </td>
                  <td className="px-8 py-6 text-brand-muted font-medium">
                    {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-8 py-6 text-right font-black text-brand-text">
                    {(settings?.currencySymbol || '₦')}{(inv?.totalAmount || 0).toLocaleString()}
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex justify-center">
                      <span className={cn(
                        "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                        inv.status === 'paid' ? "bg-green-500/10 text-green-500" :
                        inv.status === 'unpaid' ? "bg-amber-500/10 text-amber-500" :
                        inv.status === 'overdue' ? "bg-red-500/10 text-red-500" :
                        "bg-brand-bg text-brand-muted"
                      )}>
                        {inv.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={async () => {
                          if (!inv.id) return;
                          try {
                            const res = await apiFetch(`/api/invoices/${inv.id}`);
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.error || `Failed to fetch invoice`);
                            setSelectedInvoice(data);
                            setIsNewInvoicePreview(false);
                            setIsPreviewOpen(true);
                          } catch (err: any) {
                            showNotification('error', err.message || 'Could not load invoice details');
                          }
                        }}
                        className="p-2 hover:bg-brand-accent/10 text-brand-accent rounded-xl transition-colors"
                        title="Preview & Export Invoice"
                      >
                        <Eye size={18} />
                      </button>
                      <button 
                        onClick={async () => {
                          if (!inv.id) return;
                          try {
                            const res = await apiFetch(`/api/invoices/${inv.id}`);
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.error || `Failed to fetch invoice`);
                            setEditingInvoice(data);
                            setSelectedTemplateId(data.templateId || 'classic');
                            setIsEditorOpen(true);
                          } catch (err: any) {
                            showNotification('error', err.message || 'Could not load invoice for editing');
                          }
                        }}
                        className="p-2 hover:bg-brand-bg text-brand-muted hover:text-brand-text rounded-xl transition-colors"
                        title="Edit Invoice"
                      >
                        <Edit3 size={18} />
                      </button>
                      {inv.status !== 'paid' && (
                        <button 
                          onClick={() => handleUpdateStatus(inv.id, 'paid')}
                          className="p-2 hover:bg-green-500/10 text-green-600 rounded-xl transition-colors"
                          title="Mark as Paid"
                        >
                          <CheckCircle size={18} />
                        </button>
                      )}
                      <button 
                        onClick={() => handleDelete(inv.id)}
                        className="p-2 hover:bg-red-500/10 text-red-600 rounded-xl transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-20 h-20 rounded-full bg-brand-bg flex items-center justify-center text-brand-muted">
                        <FileText size={40} />
                      </div>
                      <div>
                        <p className="text-brand-text font-bold text-lg">No invoices found</p>
                        <p className="text-brand-muted">Try adjusting your search or filters</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence mode="wait">
        {isGalleryOpen && (
          <InvoiceTemplateGalleryModal
            isOpen={isGalleryOpen}
            onClose={() => setIsGalleryOpen(false)}
            onSelectTemplate={(templateId) => {
              setSelectedTemplateId(templateId);
              setIsGalleryOpen(false);
              setIsEditorOpen(true);
            }}
            currentTemplateId={selectedTemplateId}
          />
        )}

        {isEditorOpen && (
          <InvoiceEditorModal
            initialTemplateId={selectedTemplateId}
            initialInvoice={editingInvoice}
            onClose={() => {
              setIsEditorOpen(false);
              setEditingInvoice(null);
            }}
            onSaveSuccess={() => {
              setIsEditorOpen(false);
              setEditingInvoice(null);
              fetchInvoices();
            }}
            onBackToTemplates={() => {
              setIsEditorOpen(false);
              setIsGalleryOpen(true);
            }}
          />
        )}

        {isPreviewOpen && selectedInvoice && (
          <InvoicePreview 
            invoice={selectedInvoice} 
            onClose={() => {
              setIsPreviewOpen(false);
              setIsNewInvoicePreview(false);
            }} 
            isUnsaved={isNewInvoicePreview}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
