import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Users, 
  Search, 
  Plus, 
  Phone, 
  Mail, 
  MapPin, 
  Receipt, 
  Edit2, 
  X, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Building2, 
  User, 
  ShoppingBag,
  RotateCcw
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { 
  Customer, 
  listCustomers, 
  createCustomer, 
  updateCustomer, 
  getCustomerSalesHistory 
} from '../../lib/customers/index';
import { HistoricalSale } from '../../lib/sales/history';
import { isOnline } from '../../lib/offline/network';
import { ReceiptModal } from '../sales/ReceiptModal';
import { buildReceiptFromHistoricalSale, ReceiptData } from '../../lib/sales/receipt';
import { formatMinorUnits, formatDate } from '../pos/formatters';
import { CapabilityAsyncBoundary } from '../../lib/subscription/capabilityBoundary';

export const CustomersView: React.FC<{ mutationsAllowed?: boolean }> = ({ mutationsAllowed = true }) => {
  const { user, pharmacy, branch, role } = useAuth();

  // State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Form State
  const [formName, setFormName] = useState<string>('');
  const [formPhone, setFormPhone] = useState<string>('');
  const [formEmail, setFormEmail] = useState<string>('');
  const [formAddress, setFormAddress] = useState<string>('');
  const [formNotes, setFormNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Customer Sales History State
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [customerSales, setCustomerSales] = useState<HistoricalSale[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Receipt Modal State
  const [receiptToView, setReceiptToView] = useState<ReceiptData | null>(null);

  // Guard active pharmacy ref
  const activePharmacyIdRef = useRef<string | null>(null);
  const mutationBoundaryRef = useRef(new CapabilityAsyncBoundary('', mutationsAllowed));

  useEffect(() => {
    if (mutationBoundaryRef.current.update(pharmacy?.id || '', mutationsAllowed)) setIsSubmitting(false);
    if (!mutationsAllowed) {
      setIsCreateModalOpen(false);
      setEditingCustomer(null);
    }
  }, [pharmacy?.id, mutationsAllowed]);

  useEffect(() => () => mutationBoundaryRef.current.invalidate(), []);

  // 1. Load Customers
  const loadCustomersList = useCallback(async (pharmacyId: string, search?: string) => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const result = await listCustomers(supabase, pharmacyId, {
        search,
        status: 'ALL'
      });

      if (activePharmacyIdRef.current !== pharmacyId) return;

      if (result.success) {
        setCustomers(result.customers);
      } else {
        setErrorMessage(result.error || 'Failed to load customers');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error loading customers';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!pharmacy?.id) return;
    activePharmacyIdRef.current = pharmacy.id;
    loadCustomersList(pharmacy.id, searchQuery);
  }, [pharmacy?.id, searchQuery, loadCustomersList]);

  // Handle Search Input
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  // Open Create Modal
  const handleOpenCreateModal = () => {
    if (!mutationsAllowed) return;
    setEditingCustomer(null);
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormAddress('');
    setFormNotes('');
    setErrorMessage(null);
    setIsCreateModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (c: Customer) => {
    if (!mutationsAllowed) return;
    setEditingCustomer(c);
    setFormName(c.name);
    setFormPhone(c.phone || '');
    setFormEmail(c.email || '');
    setFormAddress(c.address || '');
    setFormNotes(c.notes || '');
    setErrorMessage(null);
    setIsCreateModalOpen(true);
  };

  // Save Customer (Create / Edit)
  const handleSubmitCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const mutationToken = mutationBoundaryRef.current.begin();
    if (!pharmacy?.id || !mutationToken) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (editingCustomer) {
        const res = await updateCustomer(supabase, pharmacy.id, editingCustomer.id, {
          name: formName,
          phone: formPhone || null,
          email: formEmail || null,
          address: formAddress || null,
          notes: formNotes || null
        });
        if (!mutationBoundaryRef.current.accepts(mutationToken)) return;

        if (!res.success) {
          setErrorMessage(res.error || 'Failed to update customer');
          return;
        }

        setSuccessMessage(`Customer "${res.customer?.name}" updated successfully.`);
      } else {
        const res = await createCustomer(supabase, {
          pharmacy_id: pharmacy.id,
          name: formName,
          phone: formPhone || null,
          email: formEmail || null,
          address: formAddress || null,
          notes: formNotes || null
        });
        if (!mutationBoundaryRef.current.accepts(mutationToken)) return;

        if (!res.success) {
          setErrorMessage(res.error || 'Failed to create customer');
          return;
        }

        setSuccessMessage(`Customer "${res.customer?.name}" registered successfully.`);
      }

      setIsCreateModalOpen(false);
      loadCustomersList(pharmacy.id, searchQuery);
    } catch (err: unknown) {
      if (!mutationBoundaryRef.current.accepts(mutationToken)) return;
      const msg = err instanceof Error ? err.message : 'Error saving customer';
      setErrorMessage(msg);
    } finally {
      if (mutationBoundaryRef.current.accepts(mutationToken)) setIsSubmitting(false);
    }
  };

  // Load Customer Sales History
  const handleViewHistory = async (c: Customer) => {
    if (!pharmacy?.id || !user?.id) return;
    setHistoryCustomer(c);
    setIsLoadingHistory(true);
    setCustomerSales([]);

    try {
      const res = await getCustomerSalesHistory(
        supabase,
        pharmacy.id,
        c.id,
        user.id,
        role
      );

      if (res.success) {
        setCustomerSales(res.sales);
      } else {
        setErrorMessage(res.error || 'Failed to load transaction history');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error loading transaction history';
      setErrorMessage(msg);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  return (
    <div className="space-y-6">
      {!mutationsAllowed && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200" role="status">
          Advisory subscription containment: customer history remains available, but customer creation and editing are disabled. Server authorization remains authoritative.
        </div>
      )}
      {/* Top Banner & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-tight">Customer Directory</h1>
              <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-slate-800 text-slate-300 border border-slate-700">
                {customers.length}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Tenant-scoped client registry and customer-linked sales history.
            </p>
          </div>
        </div>

        <button
          onClick={handleOpenCreateModal}
          disabled={!isOnline() || !mutationsAllowed}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition cursor-pointer self-start sm:self-auto"
          title={!mutationsAllowed ? 'Subscription policy currently blocks customer mutations' : isOnline() ? 'Register Customer' : 'Network connection required to register new customers'}
        >
          <Plus className="w-4 h-4" />
          <span>Register Customer</span>
          {!isOnline() && <span className="text-[10px] text-amber-300 font-normal">(Online required)</span>}
        </button>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-rose-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-emerald-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder="Search by customer name, phone number, or email..."
          className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition"
        />
      </div>

      {/* Customers Grid */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-400" />
          <p className="text-xs">Loading customer directory...</p>
        </div>
      ) : customers.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl">
          <Users className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-white">No Customers Found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {searchQuery
              ? `No customers matched "${searchQuery}". Try a different search term.`
              : 'No customers registered for this pharmacy yet. Click "Register Customer" to add one.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {customers.map((c) => (
            <div
              key={c.id}
              className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 transition flex flex-col justify-between gap-4 shadow-sm"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-tight">{c.name}</h3>
                    <span className="text-[10px] font-mono text-slate-500">
                      ID: #{c.id.slice(0, 8).toUpperCase()}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      c.status === 'ACTIVE'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {c.status}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-slate-300">
                  {c.phone && (
                    <div className="flex items-center gap-2 text-slate-400">
                      <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>{c.phone}</span>
                    </div>
                  )}
                  {c.email && (
                    <div className="flex items-center gap-2 text-slate-400">
                      <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate">{c.email}</span>
                    </div>
                  )}
                  {c.address && (
                    <div className="flex items-center gap-2 text-slate-400">
                      <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate text-[11px]">{c.address}</span>
                    </div>
                  )}
                </div>

                {c.notes && (
                  <p className="text-[11px] text-slate-500 italic line-clamp-2 pt-1 border-t border-slate-800/60">
                    "{c.notes}"
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => handleViewHistory(c)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Receipt className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Purchases</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenEditModal(c)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                  title="Edit Customer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Customer Create / Edit Modal */}
      {mutationsAllowed && isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
              <h2 className="text-sm font-bold text-white tracking-tight">
                {editingCustomer ? 'Edit Customer' : 'Register New Customer'}
              </h2>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitCustomer} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Full Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Chukwuma Okafor"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+234 800 000 0000"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Address / Residence
                </label>
                <input
                  type="text"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="e.g. 14 Marina Road, Lagos"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Clinical / Dispensing Notes
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Optional preferences or drug allergy notes..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-600/20"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingCustomer ? 'Update Customer' : 'Save Customer'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Purchase History Modal */}
      {historyCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white tracking-tight">
                    Transactions: {historyCustomer.name}
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Authoritative sale records governed strictly by M-8 RLS policies.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setHistoryCustomer(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3">
              {isLoadingHistory ? (
                <div className="p-8 text-center text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-400" />
                  <p className="text-xs">Loading transaction history...</p>
                </div>
              ) : customerSales.length === 0 ? (
                <div className="p-8 text-center bg-slate-950/40 border border-slate-800 rounded-xl">
                  <ShoppingBag className="w-6 h-6 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">No transactions recorded for this customer.</p>
                </div>
              ) : (
                customerSales.map((s) => (
                  <div
                    key={s.id}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-white">
                          Sale #{s.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            s.provenance === 'SERVER_COMMITTED'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}
                        >
                          {s.provenance === 'SERVER_COMMITTED' ? 'COMMITTED' : 'PENDING'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2">
                        <span>{formatDate(s.created_at)}</span>
                        <span>•</span>
                        <span className="uppercase">{s.payment_method}</span>
                        <span>•</span>
                        <span>{s.cashier_name || 'Cashier'}</span>
                      </div>
                    </div>

                    <div className="text-right flex items-center gap-3">
                      <div>
                        <div className="text-sm font-bold font-mono text-emerald-400">
                          {formatMinorUnits(s.total, s.currency)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {s.line_items.length} item{s.line_items.length === 1 ? '' : 's'}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const r = buildReceiptFromHistoricalSale(
                            s,
                            pharmacy!,
                            branch,
                            undefined,
                            { id: historyCustomer.id, name: historyCustomer.name, phone: historyCustomer.phone }
                          );
                          setReceiptToView(r);
                        }}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                        title="View Receipt"
                      >
                        <Receipt className="w-4 h-4 text-emerald-400" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/40 text-right">
              <button
                type="button"
                onClick={() => setHistoryCustomer(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Receipt Modal */}
      {receiptToView && (
        <ReceiptModal
          receipt={receiptToView}
          onClose={() => setReceiptToView(null)}
        />
      )}
    </div>
  );
};
