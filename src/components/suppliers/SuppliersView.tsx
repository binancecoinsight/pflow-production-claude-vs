import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Building2, 
  Search, 
  Plus, 
  Phone, 
  Mail, 
  MapPin, 
  Edit2, 
  Trash2, 
  FileText, 
  Package, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ShieldCheck, 
  ShieldAlert, 
  Truck, 
  ArrowDownToLine, 
  Calendar, 
  Eye, 
  X,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Supplier, PurchaseAuditRecord, PurchaseAuditItem } from '../../lib/suppliers/types';
import { 
  listSuppliers, 
  deleteSupplier, 
  listPurchases, 
  getPurchaseDetails 
} from '../../lib/suppliers/service';
import { SupplierModal } from './SupplierModal';
import { formatMinorUnits, formatDate } from '../pos/formatters';

export const SuppliersView: React.FC = () => {
  const { pharmacy, branch, role, permissions } = useAuth();

  // Role permissions
  const isOwner = role === 'OWNER';
  const canManageSuppliers = isOwner || role === 'MANAGER' || role === 'PHARMACIST' || permissions.includes('purchases.manage');
  const canViewPurchases = isOwner || role === 'MANAGER' || role === 'PHARMACIST' || permissions.includes('purchases.manage') || permissions.includes('reports.financial');

  // Active view tab: 'directory' | 'purchases'
  const [activeTab, setActiveTab] = useState<'directory' | 'purchases'>('directory');

  // Supplier state
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState<boolean>(true);
  const [supplierSearch, setSupplierSearch] = useState<string>('');
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [supplierSuccess, setSupplierSuccess] = useState<string | null>(null);

  // Supplier modal state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Supplier delete confirmation state
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Purchases audit state
  const [purchases, setPurchases] = useState<PurchaseAuditRecord[]>([]);
  const [isLoadingPurchases, setIsLoadingPurchases] = useState<boolean>(false);
  const [purchaseSearch, setPurchaseSearch] = useState<string>('');
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string>('ALL');
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  // Purchase line items detail modal
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseAuditRecord | null>(null);
  const [purchaseItems, setPurchaseItems] = useState<PurchaseAuditItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState<boolean>(false);
  const [itemsError, setItemsError] = useState<string | null>(null);

  // Load suppliers
  const loadSuppliers = useCallback(async () => {
    if (!pharmacy?.id) return;
    try {
      setIsLoadingSuppliers(true);
      setSupplierError(null);
      const res = await listSuppliers(supabase, pharmacy.id, { search: supplierSearch });
      if (res.success) {
        setSuppliers(res.suppliers);
      } else {
        setSupplierError(res.error || 'Failed to fetch suppliers');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error fetching suppliers';
      setSupplierError(msg);
    } finally {
      setIsLoadingSuppliers(false);
    }
  }, [pharmacy?.id, supplierSearch]);

  // Load purchases
  const loadPurchases = useCallback(async () => {
    if (!pharmacy?.id || !canViewPurchases) return;
    try {
      setIsLoadingPurchases(true);
      setPurchaseError(null);
      const res = await listPurchases(supabase, pharmacy.id, {
        supplier_id: selectedSupplierFilter !== 'ALL' ? selectedSupplierFilter : undefined,
        search: purchaseSearch
      });
      if (res.success) {
        setPurchases(res.purchases);
      } else {
        setPurchaseError(res.error || 'Failed to fetch inbound shipment records');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error fetching purchases';
      setPurchaseError(msg);
    } finally {
      setIsLoadingPurchases(false);
    }
  }, [pharmacy?.id, canViewPurchases, selectedSupplierFilter, purchaseSearch]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  useEffect(() => {
    if (activeTab === 'purchases' && canViewPurchases) {
      loadPurchases();
    }
  }, [activeTab, canViewPurchases, loadPurchases]);

  // View purchase items modal
  const handleViewPurchaseDetails = async (p: PurchaseAuditRecord) => {
    if (!pharmacy?.id) return;
    setSelectedPurchase(p);
    setIsLoadingItems(true);
    setItemsError(null);
    setPurchaseItems([]);

    try {
      const res = await getPurchaseDetails(supabase, pharmacy.id, p.id);
      if (res.success) {
        setPurchaseItems(res.items);
      } else {
        setItemsError(res.error || 'Failed to fetch line items for this purchase');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unexpected error loading manifest items';
      setItemsError(msg);
    } finally {
      setIsLoadingItems(false);
    }
  };

  // Handle supplier delete execution
  const handleExecuteDelete = async () => {
    if (!pharmacy?.id || !deletingSupplier) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await deleteSupplier(supabase, pharmacy.id, deletingSupplier.id);
      if (res.success) {
        setSupplierSuccess(`Supplier "${deletingSupplier.name}" permanently deleted.`);
        setDeletingSupplier(null);
        loadSuppliers();
        setTimeout(() => setSupplierSuccess(null), 4000);
      } else {
        setDeleteError(res.error || 'Failed to delete supplier');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error executing supplier deletion';
      setDeleteError(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered suppliers
  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch.trim()) return suppliers;
    const term = supplierSearch.toLowerCase().trim();
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(term) ||
        (s.contact_person && s.contact_person.toLowerCase().includes(term)) ||
        (s.phone && s.phone.includes(term)) ||
        (s.email && s.email.toLowerCase().includes(term))
    );
  }, [suppliers, supplierSearch]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900/90 via-slate-900/60 to-slate-900/90 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-2">
            <Truck className="w-3.5 h-3.5" />
            <span>Procurement & Supply Chain Management</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Suppliers & Procurement
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Maintain verified pharmaceutical vendors, configure procurement sources, and audit inbound inventory shipments.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 self-start md:self-auto">
          <button
            onClick={() => setActiveTab('directory')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'directory'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Supplier Directory</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono">
              {suppliers.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('purchases')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'purchases'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span>Inbound Shipments & Purchases</span>
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {supplierSuccess && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{supplierSuccess}</span>
        </div>
      )}

      {/* TAB 1: SUPPLIER DIRECTORY */}
      {activeTab === 'directory' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
                placeholder="Search suppliers by name, contact, phone, email..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 focus:border-emerald-500/50 text-xs text-white placeholder-slate-500 focus:outline-none transition"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={loadSuppliers}
                disabled={isLoadingSuppliers}
                className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs transition"
                title="Refresh suppliers list"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSuppliers ? 'animate-spin' : ''}`} />
              </button>

              {canManageSuppliers ? (
                <button
                  onClick={() => {
                    setEditingSupplier(null);
                    setIsModalOpen(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow-lg shadow-emerald-500/20 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Register Supplier</span>
                </button>
              ) : (
                <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                  <span>Directory Read Only</span>
                </div>
              )}
            </div>
          </div>

          {supplierError && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{supplierError}</span>
            </div>
          )}

          {/* Supplier Grid / Table */}
          {isLoadingSuppliers ? (
            <div className="p-12 rounded-2xl bg-slate-900/40 border border-slate-800 flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400 mb-2" />
              <p className="text-xs">Loading supplier directory...</p>
            </div>
          ) : filteredSuppliers.length === 0 ? (
            <div className="p-12 rounded-2xl bg-slate-900/40 border border-slate-800 text-center">
              <Building2 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-white">No suppliers found</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                {supplierSearch
                  ? 'No registered suppliers match your search query.'
                  : 'Your pharmacy has no registered suppliers yet. Add your first vendor to streamline stock receiving.'}
              </p>
              {canManageSuppliers && !supplierSearch && (
                <button
                  onClick={() => {
                    setEditingSupplier(null);
                    setIsModalOpen(true);
                  }}
                  className="mt-4 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Register First Supplier</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSuppliers.map((supplier) => (
                <div
                  key={supplier.id}
                  className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700/80 transition flex flex-col justify-between group shadow-lg shadow-black/20"
                >
                  <div>
                    {/* Header: Name & Actions */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white group-hover:text-emerald-400 transition leading-snug">
                            {supplier.name}
                          </h3>
                          {supplier.contact_person && (
                            <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <span>Rep:</span>
                              <span className="text-slate-300 font-medium">{supplier.contact_person}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Mutation Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {canManageSuppliers && (
                          <button
                            onClick={() => {
                              setEditingSupplier(supplier);
                              setIsModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition"
                            title="Edit Supplier"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isOwner && (
                          <button
                            onClick={() => {
                              setDeletingSupplier(supplier);
                              setDeleteError(null);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                            title="Delete Supplier (Owner Only)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Contact Details List */}
                    <div className="space-y-1.5 text-xs text-slate-400 pt-2 border-t border-slate-800/60">
                      {supplier.phone ? (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3 h-3 text-slate-500 shrink-0" />
                          <span className="text-slate-300 font-mono text-[11px]">{supplier.phone}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-slate-600 text-[11px]">
                          <Phone className="w-3 h-3 text-slate-700 shrink-0" />
                          <span>No phone on file</span>
                        </div>
                      )}

                      {supplier.email ? (
                        <div className="flex items-center gap-2">
                          <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                          <span className="text-slate-300 truncate max-w-[220px] text-[11px]">{supplier.email}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-slate-600 text-[11px]">
                          <Mail className="w-3 h-3 text-slate-700 shrink-0" />
                          <span>No email on file</span>
                        </div>
                      )}

                      {supplier.address ? (
                        <div className="flex items-start gap-2">
                          <MapPin className="w-3 h-3 text-slate-500 shrink-0 mt-0.5" />
                          <span className="text-slate-300 line-clamp-2 text-[11px]">{supplier.address}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-slate-600 text-[11px]">
                          <MapPin className="w-3 h-3 text-slate-700 shrink-0" />
                          <span>No address recorded</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer metadata */}
                  <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="w-2.5 h-2.5" />
                      <span>Registered {new Date(supplier.created_at).toLocaleDateString()}</span>
                    </span>
                    <span className="font-mono text-slate-600 text-[9px] uppercase">
                      ID: {supplier.id.slice(0, 8)}...
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: INBOUND SHIPMENTS & PURCHASES AUDIT */}
      {activeTab === 'purchases' && (
        <div className="space-y-4">
          {!canViewPurchases ? (
            <div className="p-8 rounded-2xl bg-slate-900/60 border border-slate-800 text-center max-w-lg mx-auto">
              <ShieldAlert className="w-10 h-10 text-amber-400 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-white">Management Access Only</h3>
              <p className="text-xs text-slate-400 mt-1">
                Inbound shipment audit records and cost totals are restricted to management roles (OWNER, MANAGER, PHARMACIST) under PostgreSQL security policies (M-13).
              </p>
            </div>
          ) : (
            <>
              {/* Controls Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
                  {/* Search by Invoice # */}
                  <div className="relative flex-1 max-w-xs">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                    <input
                      type="text"
                      value={purchaseSearch}
                      onChange={(e) => setPurchaseSearch(e.target.value)}
                      placeholder="Search invoice number..."
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 focus:border-emerald-500/50 text-xs text-white placeholder-slate-500 focus:outline-none transition"
                    />
                  </div>

                  {/* Filter by Supplier */}
                  <select
                    value={selectedSupplierFilter}
                    onChange={(e) => setSelectedSupplierFilter(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500/50 transition"
                  >
                    <option value="ALL">All Suppliers</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={loadPurchases}
                  disabled={isLoadingPurchases}
                  className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs transition self-start sm:self-auto"
                  title="Refresh purchases list"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPurchases ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {purchaseError && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{purchaseError}</span>
                </div>
              )}

              {/* Purchases Table */}
              {isLoadingPurchases ? (
                <div className="p-12 rounded-2xl bg-slate-900/40 border border-slate-800 flex flex-col items-center justify-center text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-400 mb-2" />
                  <p className="text-xs">Loading inbound shipment records...</p>
                </div>
              ) : purchases.length === 0 ? (
                <div className="p-12 rounded-2xl bg-slate-900/40 border border-slate-800 text-center">
                  <ArrowDownToLine className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-white">No Inbound Shipments Found</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    No procurement intake records match the current filters. Receive stock through the Inventory Intake workflow to log shipments.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden shadow-xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase tracking-wider font-semibold text-[11px]">
                        <tr>
                          <th className="px-4 py-3">Inbound Record</th>
                          <th className="px-4 py-3">Date & Time</th>
                          <th className="px-4 py-3">Destination Branch</th>
                          <th className="px-4 py-3">Supplier</th>
                          <th className="px-4 py-3">Invoice Number</th>
                          <th className="px-4 py-3 text-right">Total Cost</th>
                          <th className="px-4 py-3 text-center">Status</th>
                          <th className="px-4 py-3 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-300">
                        {purchases.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-800/40 transition">
                            <td className="px-4 py-3 font-mono text-[11px] text-slate-400">
                              {p.id.slice(0, 8)}...
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-slate-400">
                              {formatDate(p.created_at)}
                            </td>
                            <td className="px-4 py-3 font-medium text-white">
                              {p.branch_name}
                            </td>
                            <td className="px-4 py-3">
                              {p.supplier_name ? (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
                                  <Building2 className="w-3 h-3" />
                                  <span>{p.supplier_name}</span>
                                </span>
                              ) : (
                                <span className="text-slate-500 italic">Direct Intake (No Supplier)</span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-300">
                              {p.invoice_number || '—'}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-white font-mono">
                              {formatMinorUnits(p.total_cost, pharmacy?.currency || 'NGN')}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                                {p.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => handleViewPurchaseDetails(p)}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                              >
                                <Eye className="w-3 h-3" />
                                <span>Manifest</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* MODAL 1: CREATE / EDIT SUPPLIER */}
      {isModalOpen && pharmacy?.id && (
        <SupplierModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setEditingSupplier(null);
          }}
          pharmacyId={pharmacy.id}
          editingSupplier={editingSupplier}
          onSuccess={(savedSupplier) => {
            setSupplierSuccess(
              editingSupplier
                ? `Supplier "${savedSupplier.name}" successfully updated.`
                : `Supplier "${savedSupplier.name}" registered successfully.`
            );
            loadSuppliers();
            setTimeout(() => setSupplierSuccess(null), 4000);
          }}
        />
      )}

      {/* MODAL 2: PERMANENT DELETE SUPPLIER CONFIRMATION (OWNER ONLY) */}
      {deletingSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div 
            className="w-full max-w-md rounded-2xl bg-slate-900 border border-rose-500/30 shadow-2xl overflow-hidden p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Supplier?</h3>
                <p className="text-xs text-rose-400 font-medium">Permanent Action • Cannot be undone</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Are you sure you want to permanently delete supplier <strong className="text-white">"{deletingSupplier.name}"</strong>?
            </p>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1 mb-4">
              <div className="flex items-center gap-1.5 font-semibold text-slate-300">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Referential Audit Invariant:</span>
              </div>
              <p>
                If any historical purchase orders, invoices, or inbound shipments reference this supplier, PostgreSQL will strictly reject this deletion to safeguard financial audit trails.
              </p>
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2 mb-4">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDeletingSupplier(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-lg shadow-rose-500/20"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Supplier</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: PURCHASE MANIFEST & LINE ITEMS DETAIL */}
      {selectedPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div 
            className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Inbound Shipment Manifest</h3>
                  <p className="text-xs text-slate-400">
                    Invoice: <span className="font-mono text-white">{selectedPurchase.invoice_number || 'N/A'}</span> • Received: {formatDate(selectedPurchase.created_at)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPurchase(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Destination</div>
                  <div className="text-xs font-bold text-white mt-0.5">{selectedPurchase.branch_name}</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Vendor / Supplier</div>
                  <div className="text-xs font-bold text-emerald-400 mt-0.5 truncate">
                    {selectedPurchase.supplier_name || 'Direct Stock Intake'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Total Cost</div>
                  <div className="text-xs font-bold text-white mt-0.5 font-mono">
                    {formatMinorUnits(selectedPurchase.total_cost, pharmacy?.currency || 'NGN')}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Audit Status</div>
                  <div className="text-xs font-bold text-emerald-400 mt-0.5">{selectedPurchase.status}</div>
                </div>
              </div>

              {selectedPurchase.notes && (
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300">
                  <span className="font-semibold text-slate-400">Intake Notes:</span> {selectedPurchase.notes}
                </div>
              )}

              {/* Items Table */}
              <div>
                <h4 className="text-xs font-bold text-white mb-2 uppercase tracking-wider text-slate-400">
                  Manifest Line Items ({purchaseItems.length})
                </h4>

                {isLoadingItems ? (
                  <div className="p-8 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-400 mx-auto mb-2" />
                    <p className="text-xs">Loading manifest items...</p>
                  </div>
                ) : itemsError ? (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                    {itemsError}
                  </div>
                ) : purchaseItems.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-xs">
                    No individual line items recorded.
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-800 overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                        <tr>
                          <th className="px-3 py-2">Product Name</th>
                          <th className="px-3 py-2 text-right">Quantity</th>
                          <th className="px-3 py-2 text-right">Unit Cost</th>
                          <th className="px-3 py-2 text-right">Total Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-300">
                        {purchaseItems.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-800/30">
                            <td className="px-3 py-2">
                              <div className="font-medium text-white">{item.product_name}</div>
                              {item.product_sku && (
                                <div className="text-[10px] text-slate-500 font-mono">SKU: {item.product_sku}</div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-white">
                              {item.quantity}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-slate-300">
                              {formatMinorUnits(item.unit_cost, pharmacy?.currency || 'NGN')}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-white">
                              {formatMinorUnits(item.total_cost, pharmacy?.currency || 'NGN')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-800 flex items-center justify-between text-xs bg-slate-950">
              <span className="font-mono text-[10px] text-slate-500">
                Op ID: {selectedPurchase.client_op_id?.slice(0, 8) || 'N/A'}...
              </span>
              <button
                onClick={() => setSelectedPurchase(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Close Manifest
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
