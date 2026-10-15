import React, { useEffect, useState } from 'react';
import { Plus, Search, Truck, Package, Calendar, DollarSign, Trash2, Edit2, X, CheckCircle2, AlertCircle, Clock, Phone, Mail, MapPin, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Supplier, Purchase, Product } from '../types';
import { apiFetch } from '../lib/api';
import { useSettings } from '../context/SettingsContext';
import { useNotification } from '../context/NotificationContext';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import CurrencyInput from './CurrencyInput';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Purchases({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const { showNotification } = useNotification();
  const { settings } = useSettings();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeTab, setActiveTab] = useState<'purchases' | 'suppliers'>('purchases');
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [search, setSearch] = useState('');

  const fetchData = async () => {
    try {
      const [suppliersRes, purchasesRes, productsRes] = await Promise.all([
        apiFetch('/api/suppliers'),
        apiFetch('/api/purchases'),
        apiFetch('/api/products')
      ]);
      
      const suppliersData = await suppliersRes.json();
      const purchasesData = await purchasesRes.json();
      const productsData = await productsRes.json();

      setSuppliers(Array.isArray(suppliersData) ? suppliersData : []);
      setPurchases(Array.isArray(purchasesData) ? purchasesData : []);
      setProducts(Array.isArray(productsData) ? productsData : []);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setSuppliers([]);
      setPurchases([]);
      setProducts([]);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDeleteSupplier = async (id: string) => {
    if (confirm('Are you sure you want to delete this supplier?')) {
      await apiFetch(`/api/suppliers/${id}`, { method: 'DELETE' });
      fetchData();
    }
  };

  const handleUpdatePurchaseStatus = async (id: string, status: 'paid' | 'unpaid') => {
    await apiFetch(`/api/purchases/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    fetchData();
    showNotification('success', `Purchase marked as ${status}`);
  };

  const filteredSuppliers = (Array.isArray(suppliers) ? suppliers : []).filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    s.contact?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredPurchases = (Array.isArray(purchases) ? purchases : []).filter(p => 
    p.supplierName?.toLowerCase().includes(search.toLowerCase()) ||
    p.id.toLowerCase().includes(search.toLowerCase())
  );

  // Reminders: Unpaid purchases due soon
  const reminders = (Array.isArray(purchases) ? purchases : []).filter(p => p.status === 'unpaid' && p.dueDate && new Date(p.dueDate) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col items-center text-center gap-6">
        <div className="space-y-2">
          <h2 className="section-title">New Goods & Suppliers</h2>
          <p className="text-brand-muted">Manage inventory procurement and supplier relationships.</p>
        </div>
        <div className="flex justify-center gap-3">
          <button 
            onClick={() => { setEditingSupplier(null); setIsSupplierModalOpen(true); }}
            className="btn-secondary flex items-center gap-2"
          >
            <Plus size={18} />
            Add Supplier
          </button>
          <button 
            onClick={() => setIsPurchaseModalOpen(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Package size={18} />
            Receive Goods
          </button>
        </div>
      </div>

      {reminders.length > 0 && (
        <div className="bg-rose-50 border border-rose-100 rounded-3xl p-6 flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-brand-surface text-rose-500 shadow-sm border border-brand-border">
            <AlertCircle size={24} />
          </div>
          <div className="flex-1">
            <h4 className="text-rose-900 font-bold">Payment Reminders</h4>
            <p className="text-rose-700 text-sm mt-1">
              You have {reminders.length} unpaid purchases due within the next 7 days.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {reminders.map(r => (
                <div key={r.id} className="bg-rose-500/10 px-3 py-1.5 rounded-xl text-[10px] font-bold text-rose-500 border border-rose-500/20">
                  {r.supplierName}: {settings.currencySymbol}{r.totalAmount.toFixed(2)} (Due {new Date(r.dueDate!).toLocaleDateString()})
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex border-b border-brand-border p-1 bg-brand-bg/50 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('purchases')}
          className={cn(
            "px-8 py-3 text-sm font-black transition-all duration-300 rounded-xl relative overflow-hidden",
            activeTab === 'purchases' 
              ? "bg-brand-surface text-brand-text shadow-sm border border-brand-border scale-105 z-10" 
              : "text-brand-muted hover:text-brand-text"
          )}
        >
          Purchase History
        </button>
        <button
          onClick={() => setActiveTab('suppliers')}
          className={cn(
            "px-8 py-3 text-sm font-black transition-all duration-300 rounded-xl relative overflow-hidden",
            activeTab === 'suppliers' 
              ? "bg-brand-surface text-brand-text shadow-sm border border-brand-border scale-105 z-10" 
              : "text-brand-muted hover:text-brand-text"
          )}
        >
          Suppliers
        </button>
      </div>

      <div className="relative">
        <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted" />
        <input 
          type="text" 
          placeholder={`Search ${activeTab}...`} 
          className="input-field pl-12 py-3"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-6">
        {activeTab === 'purchases' ? (
          <div className="card p-0 overflow-hidden border-none shadow-xl shadow-brand-accent/5">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-brand-bg/30 border-b border-brand-border">
                  <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Date</th>
                  <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Supplier</th>
                  <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Items</th>
                  <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Total</th>
                  <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-center">Status</th>
                  <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/50">
                {filteredPurchases.map(purchase => (
                  <tr key={purchase.id} className="hover:bg-brand-bg/20 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-brand-text">
                          {new Date(purchase.timestamp).toLocaleDateString()}
                        </span>
                        {purchase.dueDate && (
                          <span className={cn(
                            "text-[10px] font-bold uppercase tracking-widest flex items-center gap-1",
                            purchase.status === 'unpaid' && new Date(purchase.dueDate) < new Date() ? "text-rose-600" : "text-brand-muted"
                          )}>
                            <Clock size={10} />
                            Due: {new Date(purchase.dueDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-sm font-bold text-brand-text">{purchase.supplierName}</span>
                    </td>
                    <td className="px-8 py-5">
                      <div className="space-y-1">
                        {purchase.items?.map((item, i) => (
                          <p key={i} className="text-xs text-brand-muted">
                            {item.productName} x{item.quantity}
                          </p>
                        ))}
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <span className="text-sm font-black text-brand-text">
                        {settings.currencySymbol}{purchase.totalAmount.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex justify-center">
                        <span className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border",
                          purchase.status === 'paid' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-rose-50 text-rose-600 border-rose-100"
                        )}>
                          {purchase.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      {purchase.status === 'unpaid' && (
                        <button 
                          onClick={() => handleUpdatePurchaseStatus(purchase.id, 'paid')}
                          className="p-2 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors"
                          title="Mark as Paid"
                        >
                          <CheckCircle2 size={18} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSuppliers.map(supplier => (
              <div 
                key={supplier.id} 
                className="card group hover:border-brand-accent transition-all cursor-pointer"
                onClick={() => { setEditingSupplier(supplier); setIsSupplierModalOpen(true); }}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 rounded-xl bg-brand-bg text-brand-muted group-hover:bg-brand-accent group-hover:text-white transition-colors">
                    <Truck size={20} />
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setEditingSupplier(supplier); setIsSupplierModalOpen(true); }}
                      className="p-2 rounded-lg hover:bg-brand-bg text-brand-muted transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDeleteSupplier(supplier.id); }}
                      className="p-2 rounded-lg hover:bg-rose-50 text-rose-600 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-brand-text">{supplier.name}</h3>
                <div className="mt-4 space-y-2">
                  {supplier.contact && (
                    <div className="flex items-center gap-2 text-xs text-brand-muted">
                      <Users size={14} />
                      <span>{supplier.contact}</span>
                    </div>
                  )}
                  {supplier.phone && (
                    <div className="flex items-center gap-2 text-xs text-brand-muted">
                      <Phone size={14} />
                      <span>{supplier.phone}</span>
                    </div>
                  )}
                  {supplier.email && (
                    <div className="flex items-center gap-2 text-xs text-brand-muted">
                      <Mail size={14} />
                      <span>{supplier.email}</span>
                    </div>
                  )}
                  {supplier.address && (
                    <div className="flex items-center gap-2 text-xs text-brand-muted">
                      <MapPin size={14} />
                      <span className="line-clamp-1">{supplier.address}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isPurchaseModalOpen && (
        <PurchaseModal 
          suppliers={suppliers}
          products={products}
          onClose={() => setIsPurchaseModalOpen(false)} 
          onSave={() => { fetchData(); setIsPurchaseModalOpen(false); }}
          onAddNewSupplier={() => {
            setEditingSupplier(null);
            setIsSupplierModalOpen(true);
          }}
          onDirtyChange={onDirtyChange}
        />
      )}

      {isSupplierModalOpen && (
        <SupplierModal 
          supplier={editingSupplier} 
          onClose={() => setIsSupplierModalOpen(false)} 
          onSave={() => { fetchData(); setIsSupplierModalOpen(false); }}
          onDirtyChange={onDirtyChange}
        />
      )}
    </div>
  );
}

function SupplierModal({ supplier, onClose, onSave, onDirtyChange }: { supplier: Supplier | null, onClose: () => void, onSave: () => void, onDirtyChange?: (dirty: boolean) => void }) {
  const [formData, setFormData] = useState({
    name: supplier?.name || '',
    contact: supplier?.contact || '',
    phone: supplier?.phone || '',
    email: supplier?.email || '',
    address: supplier?.address || ''
  });

  useEffect(() => {
    const isDirty = JSON.stringify(formData) !== JSON.stringify({
      name: supplier?.name || '',
      contact: supplier?.contact || '',
      phone: supplier?.phone || '',
      email: supplier?.email || '',
      address: supplier?.address || ''
    });
    if (onDirtyChange) onDirtyChange(isDirty);
    return () => { if (onDirtyChange) onDirtyChange(false); };
  }, [formData, supplier, onDirtyChange]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const method = supplier ? 'PUT' : 'POST';
    const url = supplier ? `/api/suppliers/${supplier.id}` : '/api/suppliers';
    await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    onSave();
  };

  return (
    <div className="fixed inset-0 bg-brand-text/20 backdrop-blur-sm flex items-start justify-center z-[60] p-4 pt-20">
      <div className="bg-brand-surface rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-brand-border">
        <div className="px-6 py-4 border-b border-brand-border flex justify-between items-center">
          <h3 className="text-lg font-bold text-brand-text">{supplier ? 'Edit Supplier' : 'Add Supplier'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-brand-bg rounded-xl transition-colors text-brand-muted">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Supplier Name</label>
            <input required className="input-field" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Contact Person</label>
            <input className="input-field" value={formData.contact} onChange={e => setFormData({...formData, contact: e.target.value})} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Phone</label>
            <input className="input-field" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Email</label>
            <input type="email" className="input-field" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Address</label>
            <textarea className="input-field" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1">Save Supplier</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PurchaseModal({ suppliers, products, onClose, onSave, onAddNewSupplier, onDirtyChange }: { suppliers: Supplier[], products: Product[], onClose: () => void, onSave: () => void, onAddNewSupplier: () => void, onDirtyChange?: (dirty: boolean) => void }) {
  const { settings, playSound } = useSettings();
  const [supplierId, setSupplierId] = useState('');
  const [status, setStatus] = useState<'paid' | 'unpaid'>('paid');
  const [dueDate, setDueDate] = useState('');
  const [selectedItems, setSelectedItems] = useState<{productId: string, quantity: number | string, cost: number | string, batchNumber?: string, expiryDate?: string}[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const isDirty = supplierId !== '' || selectedItems.length > 0;
    if (onDirtyChange) onDirtyChange(isDirty);
    return () => { if (onDirtyChange) onDirtyChange(false); };
  }, [supplierId, selectedItems, onDirtyChange]);

  const totalAmount = selectedItems.reduce((sum, item) => {
    const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) || 0 : item.quantity;
    const cost = typeof item.cost === 'string' ? parseFloat(item.cost) || 0 : item.cost;
    return sum + (qty * cost);
  }, 0);

  const addItem = (product: Product) => {
    const existing = selectedItems.find(i => i.productId === product.id);
    if (existing) {
      const currentQty = typeof existing.quantity === 'string' ? parseInt(existing.quantity) || 0 : existing.quantity;
      updateItem(product.id, 'quantity', currentQty + 1);
      return;
    }
    setSelectedItems([...selectedItems, { 
      productId: product.id, 
      quantity: 1, 
      cost: product.cost,
      batchNumber: product.batchNumber || '',
      expiryDate: product.expiryDate || ''
    }]);
  };

  const removeItem = (productId: string) => {
    setSelectedItems(selectedItems.filter(i => i.productId !== productId));
  };

  const updateItem = (productId: string, field: 'quantity' | 'cost' | 'batchNumber' | 'expiryDate', value: number | string) => {
    setSelectedItems(selectedItems.map(i => i.productId === productId ? { ...i, [field]: value } : i));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) return alert('Please select a supplier');
    if (selectedItems.length === 0) return alert('Please add at least one item');

    const items = selectedItems.map(item => ({
      productId: item.productId,
      quantity: typeof item.quantity === 'string' ? parseInt(item.quantity) || 0 : item.quantity,
      cost: typeof item.cost === 'string' ? parseFloat(item.cost) || 0 : item.cost,
      batchNumber: item.batchNumber,
      expiryDate: item.expiryDate
    }));

    await apiFetch('/api/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplierId,
        totalAmount,
        status,
        dueDate: status === 'unpaid' ? dueDate : null,
        items
      })
    });
    onSave();
  };

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto pt-10">
      <div className="bg-brand-surface rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden border border-brand-border my-8">
        <div className="px-6 py-4 border-b border-brand-border flex justify-between items-center">
          <h3 className="text-lg font-bold text-brand-text">Receive New Goods</h3>
          <button onClick={onClose} className="p-2 hover:bg-brand-bg rounded-xl transition-colors text-brand-muted">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Supplier</label>
                <select 
                  required 
                  className="input-field appearance-none" 
                  value={supplierId} 
                  onChange={e => {
                    if (e.target.value === 'new') {
                      onAddNewSupplier();
                    } else {
                      setSupplierId(e.target.value);
                    }
                  }}
                >
                  <option value="">Select Supplier</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  <option value="new" className="text-brand-accent font-bold">+ Add New Supplier</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Payment Status</label>
                  <select className="input-field" value={status} onChange={e => setStatus(e.target.value as 'paid' | 'unpaid')}>
                    <option value="paid">Paid</option>
                    <option value="unpaid">Unpaid / Credit</option>
                  </select>
                </div>
                {status === 'unpaid' && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Due Date</label>
                    <input type="date" required className="input-field" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Add Items</label>
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
                <input 
                  type="text" 
                  placeholder="Search products..." 
                  className="input-field pl-10 text-sm" 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="max-h-60 overflow-y-auto border border-brand-border rounded-2xl divide-y divide-brand-border">
                {filteredProducts.map(p => (
                  <button 
                    key={p.id} 
                    type="button"
                    onClick={() => {
                      addItem(p);
                      playSound('scan');
                    }}
                    className="w-full p-3 text-left hover:bg-brand-bg flex justify-between items-center transition-all active:scale-[0.98]"
                  >
                    <div>
                      <p className="text-sm font-bold text-brand-text">{p.name}</p>
                      <p className="text-[10px] text-brand-muted">Stock: {p.stock} | Cost: {settings.currencySymbol}{p.cost.toFixed(2)}</p>
                    </div>
                    <Plus size={16} className="text-brand-muted" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col h-full">
            <label className="text-xs font-bold text-brand-muted uppercase tracking-wider mb-4">Selected Items</label>
            <div className="flex-1 min-h-[300px] border border-brand-border rounded-2xl overflow-hidden flex flex-col">
              <div className="flex-1 overflow-y-auto divide-y divide-brand-border">
                {selectedItems.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-brand-muted opacity-50 p-8 text-center">
                    <Package size={48} strokeWidth={1} className="mb-2" />
                    <p className="text-sm">No items selected yet</p>
                  </div>
                ) : (
                  selectedItems.map(item => {
                    const product = products.find(p => p.id === item.productId);
                    return (
                      <div key={item.productId} className="p-4 bg-brand-surface group">
                        <div className="flex justify-between items-start mb-3">
                          <p className="text-sm font-bold text-brand-text">{product?.name}</p>
                          <button onClick={() => removeItem(item.productId)} className="text-brand-muted hover:text-rose-600 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Qty</span>
                            <CurrencyInput
                              value={item.quantity}
                              onChange={val => updateItem(item.productId, 'quantity', val)}
                              inputClassName="py-1 px-2 text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Cost</span>
                            <CurrencyInput
                              value={item.cost}
                              onChange={val => updateItem(item.productId, 'cost', val)}
                              inputClassName={cn(
                                "py-1 px-2 text-sm",
                                product && ((Number(item.cost) > product.price) || ((product.wholesalePrice ?? 0) > 0 && Number(item.cost) > (product.wholesalePrice ?? 0))) && "border-rose-500"
                              )}
                              prefix={settings.currencySymbol}
                            />
                            {product && Number(item.cost) > product.price && (
                              <p className="text-[8px] text-rose-500 font-bold leading-tight">Cost exceeds retail price ({settings.currencySymbol}{product.price.toFixed(2)})</p>
                            )}
                            {product && (product.wholesalePrice ?? 0) > 0 && Number(item.cost) > (product.wholesalePrice ?? 0) && (
                              <p className="text-[8px] text-rose-500 font-bold leading-tight">Cost exceeds wholesale price ({settings.currencySymbol}{(product.wholesalePrice ?? 0).toFixed(2)})</p>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mt-2">
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Batch No.</span>
                            <input 
                              type="text" 
                              placeholder="Optional"
                              className="input-field py-1 px-2 text-sm" 
                              value={item.batchNumber} 
                              onChange={e => updateItem(item.productId, 'batchNumber', e.target.value)} 
                            />
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Expiry Date</span>
                            <input 
                              type="date" 
                              className="input-field py-1 px-2 text-sm" 
                              value={item.expiryDate} 
                              onChange={e => updateItem(item.productId, 'expiryDate', e.target.value)} 
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="p-6 bg-brand-bg/30 border-t border-brand-border">
                <div className="flex justify-between items-center mb-6">
                  <span className="text-sm font-bold text-brand-muted uppercase tracking-widest">Total Amount</span>
                  <span className="text-2xl font-black text-brand-text">{settings.currencySymbol}{totalAmount.toFixed(2)}</span>
                </div>
                <button type="submit" className="btn-primary w-full py-4">Complete Receipt</button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
