import React, { useEffect, useState } from 'react';
import { Plus, Search, Trash2, Filter, Download, FileDown, DollarSign, Calendar, TrendingDown, Tag, Clock, Edit2 } from 'lucide-react';
import { Expense, DashboardStats } from '../types';
import { apiFetch } from '../lib/api';
import { useSettings } from '../context/SettingsContext';
import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import CurrencyInput from './CurrencyInput';

import { formatCurrency, formatNumber } from '../utils/formatters';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Expenses({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'category'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { settings } = useSettings();
  const { showNotification } = useNotification();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'store owner';

  const getLocalDate = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  };

  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    category: 'General',
    date: getLocalDate(),
    recurring: 'none' as 'none' | 'daily' | 'weekly' | 'monthly'
  });

  useEffect(() => {
    const isDirty = isModalOpen && (
      formData.description !== '' || 
      formData.amount !== ''
    );
    if (onDirtyChange) onDirtyChange(isDirty);
    return () => { if (onDirtyChange) onDirtyChange(false); };
  }, [isModalOpen, formData, onDirtyChange]);

  const categories = ['General', 'Rent', 'Utilities', 'Salaries', 'Supplies', 'Marketing', 'Maintenance', 'Other'];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [expensesRes, statsRes] = await Promise.all([
        apiFetch('/api/expenses'),
        apiFetch('/api/stats')
      ]);
      const expensesData = await expensesRes.json();
      const statsData = await statsRes.json();
      
      setExpenses(Array.isArray(expensesData) ? expensesData : []);
      setStats(statsData);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setLoading(false);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description || !formData.amount) return;

    try {
      const url = isEditing ? `/api/expenses/${editingId}` : '/api/expenses';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount)
        })
      });

      if (res.ok) {
        showNotification('success', isEditing ? 'Expense updated successfully' : 'Expense recorded successfully');
        setIsModalOpen(false);
        setIsEditing(false);
        setEditingId(null);
        setFormData({
          description: '',
          amount: '',
          category: 'General',
          date: getLocalDate(),
          recurring: 'none'
        });
        fetchData();
      } else {
        const errorData = await res.json();
        showNotification('error', errorData.error || 'Failed to record expense');
      }
    } catch (err) {
      console.error('Failed to add/edit expense:', err);
      showNotification('error', 'Failed to record expense');
    }
  };

  const handleEditClick = (exp: Expense) => {
    if (!isAdmin) {
      showNotification('error', 'Only admins can modify expenses');
      return;
    }
    setEditingId(exp.id);
    setFormData({
      description: exp.description,
      amount: exp.amount.toString(),
      category: exp.category,
      date: exp.date,
      recurring: exp.recurring
    });
    setIsEditing(true);
    setIsModalOpen(true);
  };

  const handleDeleteExpense = async (id: string) => {
    if (!isAdmin) {
      showNotification('error', 'Only admins can delete expenses');
      return;
    }
    if (!confirm('Are you sure you want to delete this expense?')) return;

    try {
      const res = await apiFetch(`/api/expenses/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showNotification('success', 'Expense deleted');
        fetchData();
      }
    } catch (err) {
      console.error('Failed to delete expense:', err);
      showNotification('error', 'Failed to delete expense');
    }
  };

  const filteredExpenses = expenses
    .filter(exp => {
      const matchesSearch = (exp.description.toLowerCase().includes(search.toLowerCase()) || 
                             exp.category.toLowerCase().includes(search.toLowerCase()));
      const matchesCategory = (selectedCategory === 'all' || exp.category === selectedCategory);
      
      let matchesDate = true;
      if (startDate) {
        const expDate = exp.date.split('T')[0];
        matchesDate = matchesDate && expDate >= startDate;
      }
      if (endDate) {
        const expDate = exp.date.split('T')[0];
        matchesDate = matchesDate && expDate <= endDate;
      }
      
      return matchesSearch && matchesCategory && matchesDate;
    })
    .sort((a, b) => {
      if (sortBy === 'date') {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      }
      if (sortBy === 'amount') {
        return sortOrder === 'desc' ? b.amount - a.amount : a.amount - b.amount;
      }
      if (sortBy === 'category') {
        return sortOrder === 'desc' 
          ? b.category.localeCompare(a.category) 
          : a.category.localeCompare(b.category);
      }
      return 0;
    });

  const totalExpenses = filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);

  const setQuickRange = (range: 'today' | 'week' | 'month' | 'year' | 'all') => {
    const today = getLocalDate();
    const now = new Date();
    
    if (range === 'today') {
      setStartDate(today);
      setEndDate(today);
    } else if (range === 'week') {
      const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      setStartDate(lastWeek);
      setEndDate(today);
    } else if (range === 'month') {
      const lastMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      setStartDate(lastMonth);
      setEndDate(today);
    } else if (range === 'year') {
      const lastYear = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
      setStartDate(lastYear);
      setEndDate(today);
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  const exportToPDF = async () => {
    if (!filteredExpenses.length) return;
    try {
      const doc = new jsPDF();
      const currency = settings?.currencySymbol || '$';
      const safeCurrency = currency === '₦' ? 'NGN ' : currency;

      doc.setFontSize(20);
      doc.setTextColor(15, 23, 42);
      doc.text('Expense Report', 14, 22);

      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`${settings.storeName || 'Pharmacy Flow'}`, 14, 30);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 35);
      doc.text(`Total Expenses: ${safeCurrency}${totalExpenses.toFixed(2)}`, 14, 40);

      const tableData = filteredExpenses.map(exp => [
        exp.date,
        exp.description,
        exp.category,
        exp.recurring !== 'none' ? `Yes (${exp.recurring})` : 'No',
        `${safeCurrency}${exp.amount.toFixed(2)}`
      ]);

      autoTable(doc, {
        startY: 45,
        head: [['Date', 'Description', 'Category', 'Recurring', 'Amount']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        margin: { top: 45 },
      });

      const pdfBlob = doc.output('blob');
      const fileName = `expense_report_${new Date().toISOString().split('T')[0]}.pdf`;
      
      const { saveFile } = await import('../utils/fileSaver');
      await saveFile(fileName, pdfBlob, 'application/pdf');
      
      showNotification('success', 'PDF Report exported successfully');
    } catch (err) {
      console.error('PDF Export failed:', err);
      showNotification('error', 'Failed to export PDF');
    }
  };

  const exportToXLS = async () => {
    if (!filteredExpenses.length) return;
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Expenses');

    worksheet.columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Description', key: 'description', width: 30 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Recurring', key: 'recurring', width: 15 },
      { header: 'Amount', key: 'amount', width: 15 },
    ];

    filteredExpenses.forEach(exp => {
      worksheet.addRow({
        date: exp.date,
        description: exp.description,
        category: exp.category,
        recurring: exp.recurring,
        amount: exp.amount.toFixed(2)
      });
    });

    try {
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `expense_report_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      const { saveFile } = await import('../utils/fileSaver');
      await saveFile(fileName, blob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      
      showNotification('success', 'XLS Report exported successfully');
    } catch (err) {
      console.error('XLS Export failed:', err);
      showNotification('error', 'Failed to export XLS');
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-accent"></div>
    </div>
  );

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex flex-col items-center text-center gap-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-brand-text">Income & Expenses</h2>
          <p className="text-sm text-brand-muted mt-1">Track your business spending and net profit</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto justify-center">
          <button 
            onClick={exportToPDF}
            className="btn-secondary flex items-center gap-2 flex-1 md:flex-none justify-center"
          >
            <FileDown size={18} />
            Export PDF
          </button>
          <button 
            onClick={exportToXLS}
            className="btn-secondary flex items-center gap-2 flex-1 md:flex-none justify-center"
          >
            <Download size={18} />
            Export XLS
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="btn-primary flex items-center gap-2 flex-1 md:flex-none justify-center"
          >
            <Plus size={18} />
            Record Expense
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-brand-surface border border-brand-border p-4 rounded-2xl shadow-sm">
          <span className="text-[10px] font-bold text-brand-muted uppercase tracking-widest block mb-1">Daily Total</span>
          <div className="text-xl font-bold text-brand-text">
            {formatCurrency(stats?.dailyExpenses || 0, settings.currencySymbol)}
          </div>
        </div>
        <div className="bg-brand-surface border border-brand-border p-4 rounded-2xl shadow-sm">
          <span className="text-[10px] font-bold text-brand-muted uppercase tracking-widest block mb-1">Weekly Total</span>
          <div className="text-xl font-bold text-brand-text">
            {formatCurrency(stats?.weeklyExpenses || 0, settings.currencySymbol)}
          </div>
        </div>
        <div className="bg-brand-surface border border-brand-border p-4 rounded-2xl shadow-sm">
          <span className="text-[10px] font-bold text-brand-muted uppercase tracking-widest block mb-1">Monthly Total</span>
          <div className="text-xl font-bold text-brand-text">
            {formatCurrency(stats?.monthlyExpenses || 0, settings.currencySymbol)}
          </div>
        </div>
        <div className="bg-brand-surface border border-brand-border p-4 rounded-2xl shadow-sm">
          <span className="text-[10px] font-bold text-brand-muted uppercase tracking-widest block mb-1">Yearly Total</span>
          <div className="text-xl font-bold text-brand-text">
            {formatCurrency(stats?.yearlyExpenses || 0, settings.currencySymbol)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-brand-surface border border-brand-border p-6 rounded-3xl shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-xl">
              <TrendingDown size={20} />
            </div>
            <span className="text-sm font-bold text-brand-muted uppercase tracking-widest">Overall Expenses</span>
          </div>
          <div className="text-3xl font-bold text-brand-text">
            {formatCurrency(stats?.totalExpenses || 0, settings.currencySymbol)}
          </div>
        </div>
        
        <div className="bg-brand-surface border border-brand-border p-6 rounded-3xl shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl">
              <Tag size={20} />
            </div>
            <span className="text-sm font-bold text-brand-muted uppercase tracking-widest">Categories</span>
          </div>
          <div className="text-3xl font-bold text-brand-text">
            {new Set(expenses.map(e => e.category)).size}
          </div>
        </div>

        <div className="bg-brand-surface border border-brand-border p-6 rounded-3xl shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <Clock size={20} />
            </div>
            <span className="text-sm font-bold text-brand-muted uppercase tracking-widest">Recurring</span>
          </div>
          <div className="text-3xl font-bold text-brand-text">
            {expenses.filter(e => e.recurring !== 'none').length}
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted" />
          <input 
            type="text" 
            placeholder="Search expenses..."
            className="input-field pl-12"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-brand-surface border border-brand-border rounded-xl px-3 py-1">
            <Calendar size={14} className="text-brand-muted" />
            <input 
              type="date" 
              className="bg-transparent text-xs font-bold text-brand-text focus:outline-none"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <span className="text-brand-muted text-xs">to</span>
            <input 
              type="date" 
              className="bg-transparent text-xs font-bold text-brand-text focus:outline-none"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <select 
            className="input-field appearance-none flex-1 md:w-40 py-2 text-sm"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="all">All Categories</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 justify-center md:justify-start">
        {['today', 'week', 'month', 'year', 'all'].map((range) => (
          <button
            key={range}
            onClick={() => setQuickRange(range as any)}
            className="px-4 py-1.5 bg-brand-surface border border-brand-border rounded-full text-[10px] font-bold uppercase tracking-widest text-brand-muted hover:text-brand-accent hover:border-brand-accent transition-all"
          >
            {range}
          </button>
        ))}
      </div>

      <div className="bg-brand-accent/5 border border-brand-accent/20 p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-brand-accent/10 text-brand-accent rounded-2xl">
            <TrendingDown size={24} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Filtered Total Expenses</p>
            <h3 className="text-3xl font-black text-brand-text">
              {formatCurrency(totalExpenses || 0, settings.currencySymbol)}
            </h3>
          </div>
        </div>
        <div className="flex gap-2">
          <select 
            className="input-field appearance-none w-40 py-2 text-sm"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
          >
            <option value="date">Sort by Date</option>
            <option value="amount">Sort by Amount</option>
            <option value="category">Sort by Category</option>
          </select>
          <button 
            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
            className="p-2 bg-brand-surface border border-brand-border rounded-xl text-brand-text hover:bg-brand-bg transition-colors"
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      <div className="bg-brand-surface border border-brand-border rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-bg/50 border-b border-brand-border">
                <th className="px-6 py-4 text-xs font-bold text-brand-muted uppercase tracking-widest">Date</th>
                <th className="px-6 py-4 text-xs font-bold text-brand-muted uppercase tracking-widest">Description</th>
                <th className="px-6 py-4 text-xs font-bold text-brand-muted uppercase tracking-widest">Category</th>
                <th className="px-6 py-4 text-xs font-bold text-brand-muted uppercase tracking-widest">Recurring</th>
                <th className="px-6 py-4 text-xs font-bold text-brand-muted uppercase tracking-widest text-right">Amount</th>
                <th className="px-6 py-4 text-xs font-bold text-brand-muted uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {filteredExpenses.map((exp) => (
                <tr 
                  key={exp.id} 
                  className="hover:bg-brand-bg/30 transition-colors group cursor-pointer"
                  onClick={() => handleEditClick(exp)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-brand-text font-medium">
                      <Calendar size={14} className="text-brand-muted" />
                      {new Date(exp.date).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-brand-text font-medium">{exp.description}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 bg-brand-bg text-brand-text text-xs font-bold rounded-full border border-brand-border">
                      {exp.category}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {exp.recurring !== 'none' ? (
                      <div className="flex items-center gap-2 text-brand-accent text-xs font-bold">
                        <Clock size={14} />
                        {exp.recurring.toUpperCase()}
                      </div>
                    ) : (
                      <span className="text-brand-muted text-xs">One-time</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="text-brand-text font-bold">
                      {formatCurrency(exp.amount || 0, settings.currencySymbol)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleEditClick(exp); }}
                        className="p-2 text-brand-accent hover:bg-brand-bg rounded-lg transition-colors"
                        title="Edit Expense"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDeleteExpense(exp.id); }}
                        className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                        title="Delete Expense"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredExpenses.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-brand-muted">
                    No expenses found matching your criteria
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-20 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              className="bg-brand-surface border border-brand-border w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-brand-border flex justify-between items-center">
                <h3 className="text-xl font-bold text-brand-text">
                  {isEditing ? 'Edit Expense' : 'Record Expense'}
                </h3>
                <button 
                  onClick={() => {
                    setIsModalOpen(false);
                    setIsEditing(false);
                    setEditingId(null);
                    setFormData({
                      description: '',
                      amount: '',
                      category: 'General',
                      date: getLocalDate(),
                      recurring: 'none'
                    });
                  }} 
                  className="text-brand-muted hover:text-brand-text"
                >
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>
              <form onSubmit={handleAddExpense} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-brand-text dark:text-brand-muted uppercase tracking-widest mb-2">Description</label>
                  <input 
                    type="text" 
                    required
                    className="input-field"
                    placeholder="e.g. Office Rent"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-brand-text dark:text-brand-muted uppercase tracking-widest mb-2">Amount</label>
                    <CurrencyInput
                      value={formData.amount}
                      onChange={val => setFormData({ ...formData, amount: val === '' ? '' : val.toString() })}
                      prefix={settings.currencySymbol}
                      required
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-brand-text dark:text-brand-muted uppercase tracking-widest mb-2">Category</label>
                    <select 
                      className="input-field appearance-none"
                      value={formData.category}
                      onChange={e => setFormData({ ...formData, category: e.target.value })}
                    >
                      {categories.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-brand-text dark:text-brand-muted uppercase tracking-widest mb-2">Date</label>
                    <input 
                      type="date" 
                      required
                      className="input-field"
                      value={formData.date}
                      onChange={e => setFormData({ ...formData, date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-brand-text dark:text-brand-muted uppercase tracking-widest mb-2">Recurring</label>
                    <select 
                      className="input-field appearance-none"
                      value={formData.recurring}
                      onChange={e => setFormData({ ...formData, recurring: e.target.value as any })}
                    >
                      <option value="none">None</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                </div>
                <div className="pt-4">
                  <button type="submit" className="btn-primary w-full py-4 text-lg">
                    {isEditing ? 'Update Expense' : 'Save Expense'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
