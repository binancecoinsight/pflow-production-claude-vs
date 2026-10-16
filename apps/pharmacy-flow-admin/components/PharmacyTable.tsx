'use client';

import React, { useState, useMemo } from 'react';
import { Search, Filter, ChevronLeft, ChevronRight, ArrowUpDown, MoreVertical, ShieldAlert, BellRing, Trash2, CreditCard, Edit3, Key, MessageSquare } from 'lucide-react';
import { Pharmacy } from '@/lib/mock-data';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface PharmacyTableProps {
  pharmacies: Pharmacy[];
  onRenewPharmacy?: (pharmacy: Pharmacy) => void;
  onRenamePharmacy?: (pharmacy: Pharmacy) => void;
  onResetPasswordPharmacy?: (pharmacy: Pharmacy) => void;
  onSendMessagePharmacy?: (pharmacy: Pharmacy) => void;
  canSuspend?: boolean;
}

const ITEMS_PER_PAGE = 10;

export default function PharmacyTable({
  pharmacies,
  onRenewPharmacy,
  onRenamePharmacy,
  onResetPasswordPharmacy,
  onSendMessagePharmacy,
  canSuspend = true,
}: PharmacyTableProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<keyof Pharmacy>('business_name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedPharmacy, setSelectedPharmacy] = useState<Pharmacy | null>(null);

  const filteredData = useMemo(() => {
    return pharmacies
      .filter((p) => {
        const matchesSearch =
          p.business_name.toLowerCase().includes(search.toLowerCase()) ||
          p.owner_name.toLowerCase().includes(search.toLowerCase());
        const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        const aVal = a[sortField] ?? '';
        const bVal = b[sortField] ?? '';
        if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
  }, [pharmacies, search, statusFilter, sortField, sortOrder]);

  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleSort = (field: keyof Pharmacy) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleAction = (action: string, pharmacy: Pharmacy) => {
    const confirmed = window.confirm(`Are you sure you want to ${action} for ${pharmacy.business_name}?`);
    if (confirmed) {
      alert(`Action "${action}" executed for ${pharmacy.business_name}`);
      setSelectedPharmacy(null);
    }
  };

  return (
    <div className="card-glass overflow-hidden flex flex-col h-[600px] relative">
      {/* Table Header / Controls */}
      <div className="p-4 border-b border-border flex flex-col md:flex-row gap-4 items-center justify-between bg-card/50">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary w-4 h-4" />
          <input
            type="text"
            placeholder="Search pharmacies or owners..."
            className="w-full bg-bg border border-border rounded-md pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent transition-all"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="text-text-secondary w-4 h-4" />
          <select
            className="bg-bg border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent transition-all"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as any);
              setCurrentPage(1);
            }}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
          </select>
        </div>
      </div>

      {/* Table Body */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-card z-10 border-b border-border">
            <tr>
              <th className="p-4 data-grid-header cursor-pointer hover:text-text-primary transition-colors" onClick={() => handleSort('business_name')}>
                <div className="flex items-center gap-2">
                  Business Name <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="p-4 data-grid-header cursor-pointer hover:text-text-primary transition-colors" onClick={() => handleSort('owner_name')}>
                <div className="flex items-center gap-2">
                  Owner <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="p-4 data-grid-header cursor-pointer hover:text-text-primary transition-colors" onClick={() => handleSort('status')}>
                <div className="flex items-center gap-2">
                  Status <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="p-4 data-grid-header cursor-pointer hover:text-text-primary transition-colors text-right" onClick={() => handleSort('daily_sales')}>
                <div className="flex items-center gap-2 justify-end">
                  Daily Sales <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="p-4 data-grid-header text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginatedData.map((p) => (
              <tr key={p.id} className="hover:bg-white/5 transition-colors group">
                <td className="p-4 text-sm font-medium">{p.business_name}</td>
                <td className="p-4 text-sm text-text-secondary">{p.owner_name}</td>
                <td className="p-4">
                  <span className={cn(
                    "status-badge",
                    p.status === 'active' ? "status-active" : "status-expired"
                  )}>
                    {p.status}
                  </span>
                </td>
                <td className="p-4 text-sm text-right data-mono font-medium">
                  ₦{p.daily_sales.toLocaleString()}
                </td>
                <td className="p-4 text-right">
                  <button
                    onClick={() => setSelectedPharmacy(p)}
                    className="p-1.5 hover:bg-white/10 rounded-md transition-colors text-text-secondary hover:text-text-primary"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Action Modal */}
      <AnimatePresence>
        {selectedPharmacy && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPharmacy(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-20"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 bg-card border border-border rounded-xl shadow-2xl z-30 overflow-hidden"
            >
              <div className="p-4 border-b border-border bg-white/5">
                <h4 className="font-bold text-sm truncate">{selectedPharmacy.business_name}</h4>
                <p className="text-[10px] text-text-secondary uppercase tracking-widest mt-0.5">Manage Store</p>
              </div>
              <div className="p-2 space-y-1">
                {onRenewPharmacy && (
                  <button
                    onClick={() => {
                      const p = selectedPharmacy;
                      setSelectedPharmacy(null);
                      onRenewPharmacy(p);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-semibold text-accent hover:bg-accent/10 transition-colors"
                  >
                    <CreditCard className="w-4 h-4" /> Renew Subscription
                  </button>
                )}
                {onSendMessagePharmacy && (
                  <button
                    onClick={() => {
                      const p = selectedPharmacy;
                      setSelectedPharmacy(null);
                      onSendMessagePharmacy(p);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium text-text-secondary hover:bg-white/5 hover:text-text-primary transition-colors"
                  >
                    <MessageSquare className="w-4 h-4 text-accent" /> Send Direct Notice
                  </button>
                )}
                {onRenamePharmacy && (
                  <button
                    onClick={() => {
                      const p = selectedPharmacy;
                      setSelectedPharmacy(null);
                      onRenamePharmacy(p);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium text-text-secondary hover:bg-white/5 hover:text-text-primary transition-colors"
                  >
                    <Edit3 className="w-4 h-4 text-accent" /> Rename Store
                  </button>
                )}
                {onResetPasswordPharmacy && (
                  <button
                    onClick={() => {
                      const p = selectedPharmacy;
                      setSelectedPharmacy(null);
                      onResetPasswordPharmacy(p);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium text-text-secondary hover:bg-white/5 hover:text-text-primary transition-colors"
                  >
                    <Key className="w-4 h-4 text-amber-500" /> Reset Password
                  </button>
                )}
                {canSuspend && (
                  <>
                    <button
                      onClick={() => handleAction('suspend store access', selectedPharmacy)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium text-text-secondary hover:bg-error/10 hover:text-error transition-colors"
                    >
                      <ShieldAlert className="w-4 h-4" /> Suspend Store
                    </button>
                    <button
                      onClick={() => handleAction('delete store record', selectedPharmacy)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium text-text-secondary hover:bg-error/10 hover:text-error transition-colors"
                    >
                      <Trash2 className="w-4 h-4" /> Delete Store
                    </button>
                  </>
                )}
              </div>
              <div className="p-3 bg-white/5 border-t border-border">
                <button
                  onClick={() => setSelectedPharmacy(null)}
                  className="w-full py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Pagination Footer */}
      <div className="p-4 border-t border-border flex items-center justify-between bg-card/50">
        <p className="text-xs text-text-secondary">
          Showing <span className="text-text-primary font-medium">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to <span className="text-text-primary font-medium">{Math.min(currentPage * ITEMS_PER_PAGE, filteredData.length)}</span> of <span className="text-text-primary font-medium">{filteredData.length}</span> results
        </p>
        <div className="flex items-center gap-2">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => prev - 1)}
            className="p-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-xs font-medium px-2">Page {currentPage} of {totalPages || 1}</span>
          <button
            disabled={currentPage === totalPages || totalPages === 0}
            onClick={() => setCurrentPage(prev => prev + 1)}
            className="p-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
