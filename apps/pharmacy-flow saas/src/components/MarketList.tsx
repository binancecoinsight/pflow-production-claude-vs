import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { useNotification } from '../context/NotificationContext';
import { useSettings } from '../context/SettingsContext';
import { Plus, Search, Trash2, Calendar, Phone, User, ShoppingCart, CheckCircle2, Clock, X, FileDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { v4 as uuidv4 } from 'uuid';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface MarketListItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
}

interface MarketListOrder {
  id: string;
  name: string;
  phone: string;
  date: string;
  items: MarketListItem[];
  status: 'pending' | 'ordered' | 'received';
  batchName: string;
  orderedBy: 'customer' | 'shop';
  createdAt: string;
}

export default function MarketList({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const [orders, setOrders] = useState<MarketListOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const { showNotification } = useNotification();
  const { settings, playSound } = useSettings();

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    date: new Date().toISOString().split('T')[0],
    items: [] as MarketListItem[],
    batchName: '',
    orderedBy: 'customer' as 'customer' | 'shop'
  });

  const [newItem, setNewItem] = useState({ name: '', quantity: 1, unit: '' });

  useEffect(() => {
    const isDirty = showModal && (
      formData.name !== '' || 
      formData.phone !== '' || 
      formData.items.length > 0 || 
      formData.batchName !== '' ||
      newItem.name !== ''
    );
    if (onDirtyChange) onDirtyChange(isDirty);
    return () => { if (onDirtyChange) onDirtyChange(false); };
  }, [showModal, formData, newItem, onDirtyChange]);
  const [isNewBatch, setIsNewBatch] = useState(false);
  const [groupBy, setGroupBy] = useState<'none' | 'batch' | 'orderedBy'>('none');
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const res = await apiFetch('/api/market-list');
      const data = await res.json();
      setOrders(Array.isArray(data) ? data.map((o: any) => ({ ...o, items: JSON.parse(o.items) })) : []);
    } catch (err) {
      console.error(err);
      showNotification('error', 'Failed to fetch market list');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.items.length === 0) {
      showNotification('error', 'Please add at least one item');
      return;
    }

    if (formData.orderedBy === 'customer') {
      if (!formData.name.trim()) {
        showNotification('error', 'Customer name is required');
        return;
      }
      if (!formData.phone.trim() || formData.phone.length !== 11) {
        showNotification('error', 'Phone number must be exactly 11 digits');
        return;
      }
    }

    try {
      const payload = {
        ...formData,
        name: formData.orderedBy === 'shop' ? (settings.storeName || 'Shop') : formData.name
      };

      const res = await apiFetch('/api/market-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        playSound('success');
        showNotification('success', 'Order added to market orders');
        setShowModal(false);
        setFormData({
          name: '',
          phone: '',
          date: new Date().toISOString().split('T')[0],
          items: [],
          batchName: '',
          orderedBy: 'customer'
        });
        setIsNewBatch(false);
        fetchOrders();
      }
    } catch (err) {
      showNotification('error', 'Failed to save order');
    }
  };

  const addItem = () => {
    if (!newItem.name.trim()) return;
    setFormData({
      ...formData,
      items: [...formData.items, { 
        id: uuidv4(), 
        name: newItem.name.trim(), 
        quantity: newItem.quantity,
        unit: newItem.unit.trim()
      }]
    });
    setNewItem({ name: '', quantity: 1, unit: '' });
  };

  const removeItem = (id: string) => {
    setFormData({
      ...formData,
      items: formData.items.filter(i => i.id !== id)
    });
  };

  const deleteOrder = async (id: string) => {
    if (!confirm('Are you sure you want to delete this order?')) return;
    try {
      const res = await apiFetch(`/api/market-list/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showNotification('success', 'Order deleted');
        fetchOrders();
      }
    } catch (err) {
      showNotification('error', 'Failed to delete order');
    }
  };

  const filteredOrders = orders.filter(o => {
    const matchesSearch = o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.phone.includes(search) ||
      (o.batchName && o.batchName.toLowerCase().includes(search.toLowerCase()));
    
    const orderDate = new Date(o.date).getTime();
    const matchesDate = (!dateRange.start || orderDate >= new Date(dateRange.start).getTime()) &&
                       (!dateRange.end || orderDate <= new Date(dateRange.end).getTime());
    
    return matchesSearch && matchesDate;
  }).sort((a, b) => {
    if (sortBy === 'date') {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    }
    return a.name.localeCompare(b.name);
  });

  const batches = Array.from(new Set(orders.map(o => o.batchName).filter(Boolean)));
  const units = Array.from(new Set(orders.flatMap(o => o.items.map(i => i.unit)).filter(Boolean)));

  const groupedOrders = React.useMemo(() => {
    if (groupBy === 'none') return { 'All Orders': filteredOrders };
    
    return filteredOrders.reduce((acc, order) => {
      const key = groupBy === 'batch' 
        ? (order.batchName || 'No Batch') 
        : (order.orderedBy === 'shop' ? 'Shop Orders' : 'Customer Orders');
      
      if (!acc[key]) acc[key] = [];
      acc[key].push(order);
      return acc;
    }, {} as Record<string, MarketListOrder[]>);
  }, [filteredOrders, groupBy]);

  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(40, 40, 40);
    doc.text('Market Orders Report', pageWidth / 2, 15, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, pageWidth / 2, 22, { align: 'center' });
    doc.text(`Store: ${settings.storeName || 'Pharmacy Flow'}`, pageWidth / 2, 27, { align: 'center' });

    let yPos = 35;

    Object.entries(groupedOrders).forEach(([groupName, groupOrders]) => {
      if (yPos > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text(groupName, 14, yPos);
      yPos += 5;

      const tableData = groupOrders.flatMap(order => 
        order.items.map((item, index) => [
          index === 0 ? order.name : '',
          index === 0 ? new Date(order.date).toLocaleDateString() : '',
          index === 0 ? (order.batchName || '-') : '',
          item.name,
          `${item.quantity} ${item.unit}`,
          index === 0 ? order.status : ''
        ])
      );

      autoTable(doc, {
        startY: yPos,
        head: [['Customer/Shop', 'Date', 'Batch', 'Item', 'Qty', 'Status']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255] },
        styles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
        didDrawPage: (data) => {
          yPos = data.cursor ? data.cursor.y + 10 : yPos;
        }
      });

      // Update yPos for next group
      // @ts-ignore - autoTable adds lastAutoTable to doc
      yPos = doc.lastAutoTable.finalY + 15;
    });

    doc.save(`market-orders-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center gap-6">
        <div>
          <h2 className="text-2xl font-bold text-brand-text">Market Orders</h2>
          <p className="text-sm text-brand-muted">Manage customer and shop market orders</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 w-full max-w-4xl">
          <div className="relative w-full md:flex-1 md:min-w-[200px]">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
            <input 
              type="text" 
              placeholder="Search orders, batches..." 
              className="input-field pl-10 py-2 text-sm w-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 no-scrollbar">
            <div className="flex items-center gap-2 bg-brand-surface border border-brand-border rounded-xl px-3 py-1">
              <Calendar size={14} className="text-brand-muted" />
              <input 
                type="date" 
                className="bg-transparent text-xs text-brand-text outline-none"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              />
              <span className="text-brand-muted text-xs">-</span>
              <input 
                type="date" 
                className="bg-transparent text-xs text-brand-text outline-none"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              />
              {(dateRange.start || dateRange.end) && (
                <button 
                  onClick={() => setDateRange({ start: '', end: '' })}
                  className="text-brand-muted hover:text-brand-accent ml-1"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <select 
              className="input-field py-2 text-sm min-w-[140px]"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as any)}
            >
              <option value="none">No Grouping</option>
              <option value="batch">Group by Batch</option>
              <option value="orderedBy">Group by Ordered By</option>
            </select>

            <select 
              className="input-field py-2 text-sm min-w-[140px]"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
            >
              <option value="date">Sort by Date</option>
              <option value="name">Sort by Name</option>
            </select>
          </div>

          <div className="w-full flex justify-center mt-2 gap-3">
            <button 
              onClick={exportToPDF}
              className="btn-secondary flex items-center gap-2 whitespace-nowrap px-6 py-3"
              disabled={filteredOrders.length === 0}
            >
              <FileDown size={20} /> Export PDF
            </button>
            <button 
              onClick={() => setShowModal(true)}
              className="btn-primary flex items-center gap-2 whitespace-nowrap px-8 py-3 shadow-lg shadow-brand-accent/20"
            >
              <Plus size={20} /> New Order
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-brand-muted">Loading orders...</div>
      ) : filteredOrders.length === 0 ? (
        <div className="card py-20 text-center space-y-4">
          <div className="w-16 h-16 bg-brand-bg rounded-full flex items-center justify-center mx-auto text-brand-muted">
            <ShoppingCart size={32} />
          </div>
          <p className="text-brand-muted">No orders found in the market orders.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {(Object.entries(groupedOrders) as [string, MarketListOrder[]][]).map(([groupName, groupOrders]) => (
            <div key={groupName} className="space-y-4">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-bold text-brand-text">{groupName}</h3>
                <div className="h-px flex-1 bg-brand-border" />
                <span className="text-xs font-bold text-brand-muted bg-brand-bg px-2 py-1 rounded-lg">
                  {groupOrders.length} {groupOrders.length === 1 ? 'Order' : 'Orders'}
                </span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groupOrders.map(order => (
                  <motion.div 
                    layout
                    key={order.id}
                    className="card p-6 space-y-4 hover:shadow-lg transition-shadow border-l-4 border-brand-accent"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-lg text-brand-text">{order.name}</h3>
                          {order.orderedBy === 'shop' && (
                            <span className="text-[10px] font-bold bg-brand-bg text-brand-muted px-1.5 py-0.5 rounded uppercase tracking-wider">Shop</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-brand-muted mt-1">
                          <Phone size={12} /> {order.phone || 'No phone'}
                        </div>
                      </div>
                      <button 
                        onClick={() => deleteOrder(order.id)}
                        className="text-brand-muted hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs font-medium py-2 border-y border-brand-border">
                      <div className="flex items-center gap-1 text-brand-muted">
                        <Calendar size={14} /> {new Date(order.date).toLocaleDateString()}
                      </div>
                      {order.batchName && (
                        <div className="flex items-center gap-1 text-brand-accent">
                          <ShoppingCart size={14} /> {order.batchName}
                        </div>
                      )}
                      <div className={cn(
                        "flex items-center gap-1 px-2 py-0.5 rounded-full ml-auto",
                        order.status === 'pending' ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500"
                      )}>
                        {order.status === 'pending' ? <Clock size={12} /> : <CheckCircle2 size={12} />}
                        <span className="capitalize">{order.status}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Items</p>
                      <div className="space-y-1">
                        {order.items.map(item => (
                          <div key={item.id} className="flex justify-between text-sm">
                            <span className="text-brand-text">{item.name}</span>
                            <span className="font-bold text-brand-muted">
                              x{item.quantity} {item.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-20">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              className="relative bg-brand-surface rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-brand-border"
            >
              <div className="p-6 border-b border-brand-border flex items-center justify-between">
                <h3 className="text-xl font-bold text-brand-text">Add to Market List</h3>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-brand-bg rounded-xl transition-colors text-brand-muted">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[80vh] bg-brand-surface">
                <div className="flex p-1 bg-brand-bg dark:bg-brand-bg/40 rounded-2xl border border-brand-border">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, orderedBy: 'customer' })}
                    className={cn(
                      "flex-1 py-2 text-sm font-bold rounded-xl transition-all",
                      formData.orderedBy === 'customer' ? "bg-brand-surface shadow-sm text-brand-accent" : "text-brand-muted"
                    )}
                  >
                    Customer Order
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, orderedBy: 'shop', name: settings.storeName || 'Shop', phone: '' })}
                    className={cn(
                      "flex-1 py-2 text-sm font-bold rounded-xl transition-all",
                      formData.orderedBy === 'shop' ? "bg-brand-surface shadow-sm text-brand-accent" : "text-brand-muted"
                    )}
                  >
                    Shop Order
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {formData.orderedBy === 'customer' ? (
                    <>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-brand-text uppercase tracking-wider">Customer Name</label>
                        <div className="relative">
                          <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
                          <input 
                            type="text"
                            required
                            className="input-field pl-10"
                            placeholder="Enter name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-brand-text uppercase tracking-wider">Phone Number (11 digits)</label>
                        <div className="relative">
                          <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
                          <input 
                            type="tel"
                            required
                            maxLength={11}
                            className="input-field pl-10"
                            placeholder="08012345678"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '') })}
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="md:col-span-2 space-y-2">
                      <label className="text-xs font-bold text-brand-text uppercase tracking-wider">Ordered By</label>
                      <div className="p-3 bg-brand-bg dark:bg-brand-bg/40 rounded-xl border border-brand-border text-brand-text font-bold">
                        {settings.storeName || 'Shop'}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-brand-text uppercase tracking-wider">Order Date</label>
                    <div className="relative">
                      <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
                      <input 
                        type="date"
                        required
                        className="input-field pl-10"
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-brand-text uppercase tracking-wider">Batch</label>
                    <div className="flex gap-2">
                      {!isNewBatch ? (
                        <select 
                          className="input-field flex-1"
                          value={formData.batchName}
                          onChange={(e) => {
                            if (e.target.value === 'new') {
                              setIsNewBatch(true);
                              setFormData({ ...formData, batchName: '' });
                            } else {
                              setFormData({ ...formData, batchName: e.target.value });
                            }
                          }}
                        >
                          <option value="">Select Batch (Optional)</option>
                          {batches.map(b => <option key={b} value={b}>{b}</option>)}
                          <option value="new">+ Create New Batch</option>
                        </select>
                      ) : (
                        <div className="flex-1 flex gap-2">
                          <input 
                            type="text"
                            className="input-field flex-1"
                            placeholder="New batch name"
                            value={formData.batchName}
                            onChange={(e) => setFormData({ ...formData, batchName: e.target.value })}
                            autoFocus
                          />
                          <button 
                            type="button"
                            onClick={() => setIsNewBatch(false)}
                            className="text-xs text-brand-accent font-bold"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-xs font-bold text-brand-text uppercase tracking-wider">Items to Order</label>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                    <div className="md:col-span-5">
                      <input 
                        type="text"
                        className="input-field w-full"
                        placeholder="Item name"
                        value={newItem.name}
                        onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <input 
                        type="number"
                        min="1"
                        className="input-field w-full"
                        placeholder="Qty"
                        value={newItem.quantity}
                        onFocus={(e) => e.target.value === '1' && setNewItem({ ...newItem, quantity: '' as any })}
                        onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 1 })}
                      />
                    </div>
                    <div className="md:col-span-4 flex gap-2">
                      <div className="relative flex-1">
                        <input 
                          type="text"
                          list="unit-suggestions"
                          className="input-field w-full"
                          placeholder="Unit (e.g. Bag)"
                          value={newItem.unit}
                          onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                        />
                        <datalist id="unit-suggestions">
                          {units.map(u => <option key={u} value={u} />)}
                        </datalist>
                      </div>
                      <button 
                        type="button"
                        onClick={addItem}
                        className="btn-secondary p-3"
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                    {formData.items.map(item => (
                      <div key={item.id} className="flex items-center justify-between p-3 bg-brand-bg dark:bg-brand-bg/40 rounded-xl border border-brand-border">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-brand-text">{item.name}</span>
                          <span className="text-xs text-brand-muted">Qty: {item.quantity}</span>
                        </div>
                        <button 
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    {formData.items.length === 0 && (
                      <div className="text-center py-6 text-brand-muted text-sm border-2 border-dashed border-brand-border rounded-xl">
                        No items added to this order yet.
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 btn-secondary py-3"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 btn-primary py-3"
                  >
                    Save Order
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

