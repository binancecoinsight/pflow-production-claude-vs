import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, X, DollarSign, History, User, Phone, Mail, MapPin, ArrowUpRight, ArrowDownRight, Sparkles, MoreVertical, MessageCircle, TrendingUp, Users, AlertCircle, FileDown, Download } from 'lucide-react';
import { Account, AccountTransaction } from '../types';
import { apiFetch } from '../lib/api';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import CurrencyInput from './CurrencyInput';

import { formatCurrency, formatNumber } from '../utils/formatters';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function AccountBook({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [filter, setFilter] = useState<'all' | 'debtors' | 'paid'>('all');
  const { settings } = useSettings();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'store owner';

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await apiFetch('/api/accounts');
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
      setAccounts([]);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this account?')) {
      try {
        await apiFetch(`/api/accounts/${id}`, { method: 'DELETE' });
        fetchAccounts();
      } catch (err) {
        console.error('Failed to delete account:', err);
      }
    }
  };

  const filteredAccounts = accounts.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (filter === 'debtors') return matchesSearch && c.totalDebt > 0;
    if (filter === 'paid') return matchesSearch && c.totalDebt <= 0;
    return matchesSearch;
  });

  const totalDebt = accounts.reduce((sum, c) => sum + c.totalDebt, 0);
  const accountsWithDebt = accounts.filter(c => c.totalDebt > 0).length;
  
  const sendWhatsAppReminder = (account: Account) => {
    if (!account.phone) return;
    let message = `Hello ${account.name}, this is a reminder from ${settings.storeName} regarding your outstanding balance of ${formatCurrency(account.totalDebt || 0, settings.currencySymbol)}. Please let us know when you can make a payment. Thank you!`;
    
    if (settings.bankName || settings.accountName || settings.accountNumber) {
      message += `\n\nPayment Details:\n`;
      if (settings.bankName) message += `Bank: ${settings.bankName}\n`;
      if (settings.accountName) message += `Acc Name: ${settings.accountName}\n`;
      if (settings.accountNumber) message += `Acc No: ${settings.accountNumber}\n`;
    }
    
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${account.phone.replace(/\D/g, '')}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header Section - Left to Right */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-brand-text">Debt Book</h2>
          <p className="text-sm text-brand-muted mt-1">Manage customer credit and outstanding balances</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => { setEditingAccount(null); setIsModalOpen(true); }}
            className="btn-primary flex items-center gap-2 px-6 py-3 shadow-lg shadow-brand-accent/20"
          >
            <Plus size={20} />
            <span>Add Customer</span>
          </button>
        </div>
      </div>

      {/* Stats Section - Top to Bottom (Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-brand-surface p-6 rounded-2xl border border-brand-border shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-brand-muted uppercase tracking-wider">Total Debt</p>
              <p className="text-2xl font-black text-brand-text">{formatCurrency(totalDebt || 0, settings.currencySymbol)}</p>
            </div>
          </div>
        </div>
        <div className="bg-brand-surface p-6 rounded-2xl border border-brand-border shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <Users size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-brand-muted uppercase tracking-wider">Active Debtors</p>
              <p className="text-2xl font-black text-brand-text">{accountsWithDebt} Accounts</p>
            </div>
          </div>
        </div>
        <div className="bg-brand-surface p-6 rounded-2xl border border-brand-border shadow-sm sm:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <AlertCircle size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-brand-muted uppercase tracking-wider">Overdue Accounts</p>
              <p className="text-2xl font-black text-brand-text">{accounts.filter(a => a.totalDebt > 0 && a.dueDate && new Date(a.dueDate) < new Date()).length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Controls Section - Left to Right */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted" />
          <input 
            type="text" 
            placeholder="Search by name, phone or email..."
            className="input-field pl-12"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex p-1 bg-brand-bg/50 rounded-2xl border border-brand-border w-full md:w-auto">
          <button
            onClick={() => setFilter('all')}
            className={cn(
              "flex-1 md:px-6 py-2 text-xs font-bold rounded-xl transition-all",
              filter === 'all' ? "bg-brand-surface shadow-sm text-brand-accent" : "text-brand-muted"
            )}
          >
            All
          </button>
          <button
            onClick={() => setFilter('debtors')}
            className={cn(
              "flex-1 md:px-6 py-2 text-xs font-bold rounded-xl transition-all",
              filter === 'debtors' ? "bg-brand-surface shadow-sm text-rose-600" : "text-brand-muted"
            )}
          >
            Debtors
          </button>
          <button
            onClick={() => setFilter('paid')}
            className={cn(
              "flex-1 md:px-6 py-2 text-xs font-bold rounded-xl transition-all",
              filter === 'paid' ? "bg-brand-surface shadow-sm text-emerald-600" : "text-brand-muted"
            )}
          >
            Paid
          </button>
        </div>
      </div>

      {/* Accounts Table */}
      <div className="bg-brand-surface rounded-2xl border border-brand-border overflow-hidden shadow-sm">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-brand-border scrollbar-track-transparent">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-20 bg-brand-surface shadow-sm">
              <tr className="bg-brand-bg/50 border-b border-brand-border">
                <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Account</th>
                <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Contact Info</th>
                <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Address</th>
                <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Balance</th>
                <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border/50">
              <AnimatePresence mode="popLayout">
                {filteredAccounts.map((account, idx) => (
                  <motion.tr 
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ delay: idx * 0.03 }}
                    key={account.id} 
                    className="hover:bg-brand-bg/20 transition-colors group cursor-pointer"
                    onClick={() => { setEditingAccount(account); setIsModalOpen(true); }}
                  >
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-brand-bg flex items-center justify-center text-brand-muted group-hover:bg-brand-accent group-hover:text-white transition-all">
                          <User size={18} />
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setSelectedAccount(account); setIsTransactionModalOpen(true); }}
                          className="text-sm font-bold text-brand-text hover:text-brand-accent transition-colors text-left"
                        >
                          {account.name}
                        </button>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex flex-col gap-1">
                        {account.phone && (
                          <div className="flex items-center gap-2 text-xs text-brand-text">
                            <Phone size={12} className="text-brand-muted" />
                            {account.phone}
                          </div>
                        )}
                        {account.email && (
                          <div className="flex items-center gap-2 text-[10px] text-brand-muted">
                            <Mail size={12} className="text-brand-muted" />
                            {account.email}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-2 text-xs text-brand-muted max-w-[200px] truncate">
                        <MapPin size={12} />
                        {account.address || 'No address provided'}
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className={cn(
                          "text-sm font-bold",
                          account.totalDebt > 0 ? "text-rose-600" : "text-emerald-600"
                        )}>
                          {formatCurrency(account.totalDebt || 0, settings.currencySymbol)}
                        </span>
                        {account.totalDebt > 0 && (
                          <span className="text-[9px] font-bold text-rose-500 uppercase tracking-tighter">Outstanding</span>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex justify-end gap-2">
                        {account.totalDebt > 0 && account.phone && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); sendWhatsAppReminder(account); }}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                            title="Send WhatsApp Reminder"
                          >
                            <MessageCircle size={16} />
                          </button>
                        )}
                        <button 
                          onClick={(e) => { e.stopPropagation(); setSelectedAccount(account); setIsTransactionModalOpen(true); }}
                          className="p-2 text-brand-muted hover:text-brand-accent hover:bg-brand-bg rounded-xl transition-all"
                          title="Manage Transactions"
                        >
                          <History size={16} />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setEditingAccount(account); setIsModalOpen(true); }}
                          className="p-2 text-brand-muted hover:text-brand-accent hover:bg-brand-bg rounded-xl transition-all"
                          title="Edit Account"
                        >
                          <Edit2 size={16} />
                        </button>
                        {isAdmin && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDelete(account.id); }}
                            className="p-2 text-brand-muted hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                            title="Delete Account"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {filteredAccounts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-3 opacity-30">
                      <Search size={48} strokeWidth={1} />
                      <p className="font-medium">No accounts found matching your search</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {isModalOpen && (
          <AccountModal 
            account={editingAccount} 
            onClose={() => setIsModalOpen(false)} 
            onSave={() => { fetchAccounts(); setIsModalOpen(false); }}
            onDirtyChange={onDirtyChange}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isTransactionModalOpen && selectedAccount && (
          <TransactionModal
            account={accounts.find(a => a.id === selectedAccount.id) || selectedAccount}
            onClose={() => setIsTransactionModalOpen(false)}
            onSave={() => { fetchAccounts(); }}
            onDirtyChange={onDirtyChange}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function AccountModal({ account, onClose, onSave, onDirtyChange }: { account: Account | null, onClose: () => void, onSave: () => void, onDirtyChange?: (dirty: boolean) => void }) {
  const { settings } = useSettings();
  const [formData, setFormData] = useState({
    name: account?.name || '',
    phone: account?.phone || '',
    email: account?.email || '',
    address: account?.address || '',
    debtLimit: account?.debtLimit || ''
  });

  useEffect(() => {
    const isDirty = JSON.stringify(formData) !== JSON.stringify({
      name: account?.name || '',
      phone: account?.phone || '',
      email: account?.email || '',
      address: account?.address || '',
      debtLimit: account?.debtLimit || ''
    });
    if (onDirtyChange) onDirtyChange(isDirty);
    return () => { if (onDirtyChange) onDirtyChange(false); };
  }, [formData, account, onDirtyChange]);

  const handleGetContact = async () => {
    if (!('contacts' in navigator)) {
      return;
    }

    try {
      const props = ['name', 'tel'];
      const opts = { multiple: false };
      const contacts = await (navigator as any).contacts.select(props, opts);
      
      if (contacts.length > 0) {
        const contact = contacts[0];
        const name = contact.name?.[0] || '';
        const phone = contact.tel?.[0] || '';
        
        setFormData(prev => ({
          ...prev,
          name: name || prev.name,
          phone: phone || prev.phone
        }));
      }
    } catch (err) {
      console.error('Error selecting contact:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const method = account ? 'PUT' : 'POST';
    const url = account ? `/api/accounts/${account.id}` : '/api/accounts';
    
    try {
      await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      onSave();
    } catch (err) {
      console.error('Failed to save account:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 p-6 overflow-y-auto pt-20">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: -20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: -20 }}
        className="bg-brand-surface rounded-[2.5rem] p-10 max-w-md w-full shadow-2xl border border-brand-border"
      >
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-brand-accent text-white rounded-2xl flex items-center justify-center shadow-lg shadow-brand-accent/20">
              <Sparkles size={24} />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-brand-text">{account ? 'Edit Profile' : 'New Customer'}</h3>
              <p className="text-xs text-brand-muted">Manage customer contact information</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-brand-bg rounded-full transition-colors">
            <X size={24} className="text-brand-muted" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-brand-muted uppercase tracking-widest ml-1">Full Name</label>
            <input 
              required
              className="input-field py-4"
              placeholder="e.g. John Doe"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-brand-muted uppercase tracking-widest ml-1">Phone Number</label>
            <div className="flex gap-2">
              <input 
                className="input-field py-4 flex-1"
                placeholder="+1 (555) 000-0000"
                value={formData.phone}
                onChange={e => setFormData({...formData, phone: e.target.value})}
              />
              {'contacts' in navigator && (
                <button 
                  type="button"
                  onClick={handleGetContact}
                  className="p-4 bg-brand-bg hover:bg-brand-accent/10 text-brand-accent rounded-2xl transition-all border border-brand-border"
                  title="Get from contacts"
                >
                  <User size={20} />
                </button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-brand-muted uppercase tracking-widest ml-1">Email Address</label>
            <input 
              type="email"
              className="input-field py-4"
              placeholder="john@example.com"
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-brand-muted uppercase tracking-widest ml-1">Physical Address</label>
            <textarea 
              className="input-field py-4 h-24 resize-none"
              placeholder="Street address, City, Country"
              value={formData.address}
              onChange={e => setFormData({...formData, address: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-brand-muted uppercase tracking-widest ml-1">Specific Debt Limit (Optional)</label>
            <CurrencyInput
              value={formData.debtLimit}
              onChange={val => setFormData({...formData, debtLimit: val})}
              prefix={settings.currencySymbol}
              placeholder="Leave empty for general limit"
            />
            <p className="text-[9px] text-brand-muted italic ml-1">If set, this overrides the general app-wide debt limit for this customer.</p>
          </div>
          <div className="flex gap-4 pt-4">
            <button type="button" onClick={onClose} className="flex-1 btn-secondary py-4">Cancel</button>
            <button type="submit" className="flex-2 btn-primary py-4">Save Customer</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function TransactionModal({ account, onClose, onSave, onDirtyChange }: { account: Account, onClose: () => void, onSave: () => void, onDirtyChange?: (dirty: boolean) => void }) {
  const [transactions, setTransactions] = useState<AccountTransaction[]>([]);
  const [amount, setAmount] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const { settings } = useSettings();

  useEffect(() => {
    const isDirty = (amount !== '' && amount > 0) || notes !== '';
    if (onDirtyChange) onDirtyChange(isDirty);
    return () => { if (onDirtyChange) onDirtyChange(false); };
  }, [amount, notes, onDirtyChange]);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      const res = await apiFetch(`/api/accounts/${account.id}/debts`);
      const data = await res.json();
      setTransactions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch account transactions:', err);
      setTransactions([]);
    }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0) return;

    if (amount > account.totalDebt) {
      const confirmOverpayment = window.confirm(
        `The payment amount (${formatCurrency(amount, settings.currencySymbol)}) is greater than the customer's total debt (${formatCurrency(account.totalDebt, settings.currencySymbol)}). Do you want to proceed?`
      );
      if (!confirmOverpayment) return;
    }

    try {
      await apiFetch(`/api/accounts/${account.id}/debts/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, notes })
      });
      setAmount('');
      setNotes('');
      fetchTransactions();
      onSave(); // This will refresh the main accounts list
    } catch (err) {
      console.error('Failed to record payment:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-brand-accent/40 backdrop-blur-sm flex items-start justify-center z-50 p-6 overflow-y-auto pt-20">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: -20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: -20 }}
        className="bg-brand-surface rounded-[2.5rem] p-10 max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh] border border-brand-border"
      >
        <div className="flex items-center justify-between mb-10 shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-rose-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-rose-600/20">
              <DollarSign size={24} />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-brand-text">Transaction Management</h3>
              <p className="text-xs text-brand-muted">Tracking balance for <span className="font-bold text-brand-text">{account.name}</span></p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-brand-bg rounded-full transition-colors">
            <X size={24} className="text-brand-muted" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-10 pr-2 custom-scrollbar">
          {account.totalDebt > 0 && (
            <div className="bg-brand-bg/50 p-8 rounded-[2rem] border border-brand-border">
              <h4 className="text-[10px] font-bold text-brand-muted uppercase tracking-widest mb-6">Record New Payment</h4>
              <form onSubmit={handlePayment} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-muted uppercase tracking-widest ml-1">Payment Amount</label>
                    <CurrencyInput
                      value={amount}
                      onChange={val => setAmount(val === '' ? '' : Number(val))}
                      prefix={settings.currencySymbol}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-muted uppercase tracking-widest ml-1">Notes</label>
                    <input 
                      type="text"
                      className="input-field py-4"
                      placeholder="e.g. Cash payment"
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                    />
                  </div>
                </div>
                <button type="submit" className="btn-primary w-full py-4">
                  Confirm Payment
                </button>
              </form>
            </div>
          )}

          <div className="space-y-6">
            <h4 className="text-[10px] font-bold text-brand-muted uppercase tracking-widest ml-1">Transaction History</h4>
            <div className="space-y-4">
              {transactions.map(t => (
                <div key={t.id} className="flex items-center justify-between p-6 rounded-2xl border border-brand-border bg-brand-surface hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      t.type === 'SALE' || t.type === 'INVOICE' ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
                    )}>
                      {t.type === 'SALE' || t.type === 'INVOICE' ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-brand-text">
                        {t.type === 'SALE' ? 'Debt from Purchase' : t.type === 'INVOICE' ? 'Debt from Invoice' : 'Payment Received'}
                      </div>
                      <div className="text-[10px] text-brand-muted mt-1 uppercase tracking-wider flex items-center gap-2">
                        <span>{new Date(t.timestamp).toLocaleString()}</span>
                        {t.saleCreatedAt && new Date(t.timestamp).toISOString().split('T')[0] !== new Date(t.saleCreatedAt).toISOString().split('T')[0] && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 text-[8px] font-bold border border-amber-100">
                            Backdated
                          </span>
                        )}
                        {t.attendantName && (
                          <span className="text-brand-accent font-bold">
                            • {t.attendantName}
                          </span>
                        )}
                        {t.notes && <span className="ml-2 px-2 py-0.5 bg-brand-bg rounded text-brand-text">{t.notes}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className={cn(
                      "text-lg font-bold",
                      t.type === 'SALE' || t.type === 'INVOICE' ? "text-rose-600" : "text-emerald-600"
                    )}>
                      {t.type === 'SALE' || t.type === 'INVOICE' ? '+' : '-'}{formatCurrency(Math.abs(t.amount), settings.currencySymbol)}
                    </div>
                    {t.balance !== undefined && (
                      <div className="text-[10px] font-bold text-brand-muted uppercase tracking-wider bg-brand-bg px-2 py-0.5 rounded">
                        Bal: {formatCurrency(t.balance, settings.currencySymbol)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {transactions.length === 0 && (
                <div className="text-center py-12 text-brand-muted text-sm border-2 border-dashed border-brand-border rounded-[2rem]">
                  No transaction history available.
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
