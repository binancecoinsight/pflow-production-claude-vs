import React, { useEffect, useState, useRef } from 'react';
import { Plus, Search, Edit2, Trash2, AlertCircle, Package, Filter, X, Minus, Camera, Download, FileDown, FileUp, Upload } from 'lucide-react';
import { motion } from 'motion/react';
import { Product } from '../types';
import { apiFetch } from '../lib/api';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import BarcodeScanner from './BarcodeScanner';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import CurrencyInput from './CurrencyInput';

import { saveFile } from '../utils/fileSaver';
import { formatCurrency, formatNumber } from '../utils/formatters';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Inventory({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const { showNotification } = useNotification();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [viewType, setViewType] = useState<'product' | 'service'>('product');
  const [pendingSku, setPendingSku] = useState('');
  const { settings, updateSettings, playSound } = useSettings();
  const { user } = useAuth();
  const categories = Array.isArray(settings.categories) ? settings.categories : [];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  const downloadSampleCSV = async () => {
    try {
      const headers = ['name', 'sku', 'category', 'subcategory', 'price', 'wholesalePrice', 'cost', 'stock', 'minStock', 'description', 'type'];
      const sampleData = [
        ['Sample Product', 'PRD-001', 'Electronics', 'Phones', '1000', '900', '700', '50', '10', 'A great phone', 'product'],
        ['Sample Service', 'SRV-001', 'Maintenance', 'Repair', '50', '', '0', '0', '0', 'Phone repair service', 'service']
      ];
      
      const csvContent = [
        headers.join(','),
        ...sampleData.map(row => row.join(','))
      ].join('\n');
      
      await saveFile('inventory_sample.csv', csvContent, 'text/csv');
      showNotification('success', 'Sample CSV downloaded');
    } catch (error) {
      console.error('Download error:', error);
      showNotification('error', 'Failed to download sample CSV');
    }
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        
        const productsToUpload = lines.slice(1).filter(line => line.trim()).map(line => {
          const values = line.split(',').map(v => v.trim());
          const product: any = {};
          headers.forEach((header, index) => {
            const val = values[index];
            if (val === undefined || val === '') return;

            if (['price', 'wholesaleprice', 'cost', 'stock', 'minstock'].includes(header)) {
              product[header === 'wholesaleprice' ? 'wholesalePrice' : header === 'minstock' ? 'minStock' : header] = parseFloat(val) || 0;
            } else {
              product[header] = val;
            }
          });
          return product;
        });

        if (productsToUpload.length === 0) {
          showNotification('error', 'No products found in CSV');
          return;
        }

        const response = await apiFetch('/api/products/bulk', {
          method: 'POST',
          body: JSON.stringify({ products: productsToUpload })
        });

        const data = await response.json();

        if (data.success) {
          showNotification('success', `Successfully processed ${productsToUpload.length} products`);
          fetchProducts();
          playSound('success');
        } else {
          showNotification('error', data.error || 'Failed to upload products');
        }
      } catch (error) {
        console.error('CSV Upload Error:', error);
        showNotification('error', 'Error parsing CSV file');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const buffer = event.target?.result as ArrayBuffer;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const worksheet = workbook.getWorksheet(1);
        
        if (!worksheet) {
          showNotification('error', 'No worksheet found in Excel file');
          return;
        }

        const headers: string[] = [];
        worksheet.getRow(1).eachCell((cell) => {
          headers.push(cell.value?.toString().toLowerCase().trim() || '');
        });

        const productsToUpload: any[] = [];
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return; // Skip headers
          
          const product: any = {};
          row.eachCell((cell, colNumber) => {
            const header = headers[colNumber - 1];
            if (header) {
              if (['price', 'wholesaleprice', 'cost', 'stock', 'minstock'].includes(header)) {
                product[header === 'wholesaleprice' ? 'wholesalePrice' : header === 'minstock' ? 'minStock' : header] = parseFloat(cell.value?.toString() || '0') || 0;
              } else {
                product[header] = cell.value?.toString() || '';
              }
            }
          });
          if (product.name) productsToUpload.push(product);
        });

        if (productsToUpload.length === 0) {
          showNotification('error', 'No products found in Excel');
          return;
        }

        const response = await apiFetch('/api/products/bulk', {
          method: 'POST',
          body: JSON.stringify({ products: productsToUpload })
        });

        const data = await response.json();

        if (data.success) {
          showNotification('success', `Successfully processed ${productsToUpload.length} products`);
          fetchProducts();
          playSound('success');
        } else {
          showNotification('error', data.error || 'Failed to upload products');
        }
      } catch (error) {
        console.error('Excel Upload Error:', error);
        showNotification('error', 'Error parsing Excel file');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ''; // Reset input
  };

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isSubcategoryModalOpen, setIsSubcategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSubcategoryName, setNewSubcategoryName] = useState('');

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    
    // Check if category already exists
    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      showNotification('error', 'Category already exists');
      return;
    }

    const newCategory = { id: Date.now().toString(), name, subcategories: [] };
    try {
      await updateSettings({ categories: [...categories, newCategory] });
      setSelectedCategory(name);
      setNewCategoryName('');
      setIsCategoryModalOpen(false);
      showNotification('success', 'Category added successfully');
    } catch (err) {
      showNotification('error', 'Failed to add category');
    }
  };

  const handleAddSubcategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSubcategoryName.trim();
    if (!name || selectedCategory === 'all') return;

    const updatedCategories = categories.map(c => {
      if (c.name === selectedCategory) {
        const subcategories = Array.isArray(c.subcategories) ? c.subcategories : [];
        if (subcategories.some(s => s.toLowerCase() === name.toLowerCase())) {
          return c;
        }
        return { ...c, subcategories: [...subcategories, name] };
      }
      return c;
    });

    try {
      await updateSettings({ categories: updatedCategories });
      setNewSubcategoryName('');
      setIsSubcategoryModalOpen(false);
      showNotification('success', 'Subcategory added successfully');
    } catch (err) {
      showNotification('error', 'Failed to add subcategory');
    }
  };

  const isAdmin = user?.role === 'admin' || user?.role === 'store owner';

  const fetchProducts = () => {
    apiFetch('/api/products?all=true')
      .then(res => res.json())
      .then(data => setProducts(Array.isArray(data) ? data : []))
      .catch(err => {
        console.error('Failed to fetch products:', err);
        setProducts([]);
      });
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Reset subcategory filter when category filter changes
  useEffect(() => {
    setSelectedSubcategory('all');
  }, [selectedCategory]);

  const filteredProducts = products.filter(p => {
    const matchesType = (p.type || 'product') === viewType;
    const matchesSearch = 
      p.name.toLowerCase().includes(search.toLowerCase()) || 
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      (p.alias && p.alias.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    const matchesSubcategory = selectedSubcategory === 'all' || p.subcategory === selectedSubcategory;
    return matchesType && matchesSearch && matchesCategory && matchesSubcategory;
  });

  const activeCategoryObj = Array.isArray(categories) ? categories.find(c => c.name === selectedCategory) : null;
  const activeSubcategories = activeCategoryObj ? activeCategoryObj.subcategories : [];

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this product?')) {
      try {
        await apiFetch(`/api/products/${id}`, { method: 'DELETE' });
        fetchProducts();
      } catch (err) {
        console.error('Failed to delete product:', err);
        showNotification('error', 'Failed to delete product. It might be linked to existing sales.');
      }
    }
  };

  const updateStock = async (id: string, delta: number) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    const newStock = Math.max(0, product.stock + delta);
    
    // Optimistic update
    setProducts(products.map(p => p.id === id ? { ...p, stock: newStock } : p));

    try {
      await apiFetch(`/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...product, stock: newStock })
      });
    } catch (err) {
      console.error('Failed to update stock:', err);
      fetchProducts();
    }
  };

  const updateProductField = async (id: string, field: keyof Product, value: any) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    
    // Optimistic update
    setProducts(products.map(p => p.id === id ? { ...p, [field]: value } : p));

    try {
      await apiFetch(`/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...product, [field]: value })
      });
    } catch (err) {
      console.error(`Failed to update ${field}:`, err);
      fetchProducts();
    }
  };

  const exportToXLS = async () => {
    if (!filteredProducts.length) return;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Inventory');

    worksheet.columns = [
      { header: 'Name', key: 'name', width: 30 },
      { header: 'SKU', key: 'sku', width: 20 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Subcategory', key: 'subcategory', width: 20 },
      { header: 'Price', key: 'price', width: 15 },
      { header: 'Cost', key: 'cost', width: 15 },
      { header: 'Stock', key: 'stock', width: 10 },
      { header: 'Min Stock', key: 'minStock', width: 10 },
      { header: 'Status', key: 'status', width: 15 },
    ];

    filteredProducts.forEach(p => {
      worksheet.addRow({
        name: p.name,
        sku: p.sku,
        category: p.category || 'Uncategorized',
        subcategory: p.subcategory || '',
        price: p.price.toFixed(2),
        cost: p.cost.toFixed(2),
        stock: p.stock,
        minStock: p.minStock,
        status: p.active === 0 ? 'Inactive' : p.stock <= p.minStock ? 'Low Stock' : 'Optimal'
      });
    });

    try {
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `inventory_export_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      const { saveFile } = await import('../utils/fileSaver');
      await saveFile(fileName, blob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      
      showNotification('success', 'XLS Inventory exported successfully');
    } catch (err) {
      console.error('XLS Export failed:', err);
      showNotification('error', 'Failed to export XLS. Please try opening in a new tab.');
    }
  };

  const exportToPDF = async () => {
    if (!filteredProducts.length) return;

    try {
      const doc = new jsPDF();
      const currency = settings?.currencySymbol || '$';
      const safeCurrency = currency === '₦' ? 'NGN ' : currency;
      
      doc.setFontSize(20);
      doc.setTextColor(15, 23, 42);
      doc.text('Inventory Status Report', 14, 22);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`${settings.storeName || 'Pharmacy Flow'}`, 14, 30);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 35);
      doc.text(`Total Products: ${filteredProducts.length}`, 14, 40);
      
      const tableData = filteredProducts.map(p => [
        p.name,
        p.sku,
        p.category || 'Uncategorized',
        `${safeCurrency}${p.price.toFixed(2)}`,
        p.stock,
        p.active === 0 ? 'Inactive' : p.stock <= p.minStock ? 'Low Stock' : 'Optimal'
      ]);
      
      autoTable(doc, {
        startY: 45,
        head: [['Product', 'SKU', 'Category', 'Price', 'Stock', 'Status']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        margin: { top: 45 },
      });
      
      const pdfBlob = doc.output('blob');
      const fileName = `inventory_report_${new Date().toISOString().split('T')[0]}.pdf`;
      
      const { saveFile } = await import('../utils/fileSaver');
      await saveFile(fileName, pdfBlob, 'application/pdf');
      
      showNotification('success', 'PDF Inventory exported successfully');
    } catch (err) {
      console.error('PDF Export failed:', err);
      showNotification('error', 'Failed to export PDF. Please try opening in a new tab.');
    }
  };

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex flex-col items-center text-center gap-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-brand-text">Inventory</h2>
          <p className="text-sm text-brand-muted mt-1">Manage your product catalog and stock levels</p>
        </div>

        {isAdmin && (
          <button 
            onClick={() => { setEditingProduct(null); setIsModalOpen(true); }}
            className="btn-primary flex items-center gap-2 w-full md:w-auto justify-center px-8 py-4 text-lg shadow-lg shadow-brand-accent/20"
          >
            <Plus size={24} />
            {viewType === 'product' ? 'Add New Product' : 'Add New Service'}
          </button>
        )}

        <div className="flex border-b border-brand-border p-1 bg-brand-bg/50 rounded-2xl w-fit">
          <button
            onClick={() => setViewType('product')}
            className={cn(
              "px-8 py-3 text-sm font-black transition-all duration-300 rounded-xl relative overflow-hidden group",
              viewType === 'product' 
                ? "bg-brand-surface text-brand-text shadow-[0_8px_20px_rgba(0,0,0,0.1),0_0_15px_rgba(5,150,105,0.3)] border border-brand-border scale-105 z-10" 
                : "text-brand-muted hover:text-brand-text hover:bg-brand-surface/50"
            )}
          >
            <div className="flex items-center gap-2 relative z-10">
              <Package size={18} className={cn("transition-transform duration-300", viewType === 'product' && "scale-110")} />
              <span>Products</span>
            </div>
            {viewType === 'product' && (
              <motion.div 
                layoutId="inventory-view-glow"
                className="absolute inset-0 bg-emerald-500/5 blur-xl"
                initial={false}
              />
            )}
          </button>
          <button
            onClick={() => setViewType('service')}
            className={cn(
              "px-8 py-3 text-sm font-black transition-all duration-300 rounded-xl relative overflow-hidden group",
              viewType === 'service' 
                ? "bg-brand-surface text-brand-text shadow-[0_8px_20px_rgba(0,0,0,0.1),0_0_15px_rgba(5,150,105,0.3)] border border-brand-border scale-105 z-10" 
                : "text-brand-muted hover:text-brand-text hover:bg-brand-surface/50"
            )}
          >
            <div className="flex items-center gap-2 relative z-10">
              <AlertCircle size={18} className={cn("transition-transform duration-300", viewType === 'service' && "scale-110")} />
              <span>Services</span>
            </div>
            {viewType === 'service' && (
              <motion.div 
                layoutId="inventory-view-glow"
                className="absolute inset-0 bg-emerald-500/5 blur-xl"
                initial={false}
              />
            )}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto justify-center">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleCSVUpload} 
            accept=".csv" 
            className="hidden" 
          />
          <input 
            type="file" 
            ref={excelInputRef} 
            onChange={handleExcelUpload} 
            accept=".xlsx, .xls" 
            className="hidden" 
          />
          
          <div className="flex items-center gap-1 bg-brand-bg p-1 rounded-xl border border-brand-border">
            <button 
              onClick={downloadSampleCSV}
              className="p-2 text-brand-muted hover:text-brand-accent hover:bg-brand-surface rounded-lg transition-all flex items-center gap-2 text-xs font-bold"
              title="Download Sample CSV"
            >
              <FileDown size={16} />
              <span className="hidden sm:inline">Sample CSV</span>
            </button>
            <div className="w-px h-4 bg-brand-border mx-1" />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-brand-muted hover:text-brand-accent hover:bg-brand-surface rounded-lg transition-all flex items-center gap-2 text-xs font-bold"
              title="Upload CSV"
            >
              <Upload size={16} />
              <span className="hidden sm:inline">Upload CSV</span>
            </button>
            <button 
              onClick={() => excelInputRef.current?.click()}
              className="p-2 text-brand-muted hover:text-brand-accent hover:bg-brand-surface rounded-lg transition-all flex items-center gap-2 text-xs font-bold"
              title="Upload Excel"
            >
              <FileUp size={16} />
              <span className="hidden sm:inline">Upload Excel</span>
            </button>
          </div>

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
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full flex gap-2">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted" />
            <input 
              type="text" 
              placeholder={selectedCategory === 'all' ? "Search all products..." : `Search in ${selectedCategory}...`}
              className="input-field pl-12"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setIsScannerOpen(true)}
            className="p-3 bg-brand-bg hover:bg-brand-border rounded-xl text-brand-text transition-colors flex items-center justify-center"
            title="Scan Barcode"
          >
            <Camera size={20} />
          </button>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <select 
            className="input-field appearance-none flex-1 md:w-48"
            value={selectedCategory}
            onChange={(e) => {
              if (e.target.value === 'new') {
                setIsCategoryModalOpen(true);
              } else {
                setSelectedCategory(e.target.value);
              }
            }}
          >
            <option value="all">All Categories</option>
            {categories.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
            <option value="new" className="text-brand-accent font-bold">+ Add New Category</option>
          </select>
          
          <select 
            className="input-field appearance-none flex-1 md:w-48"
            value={selectedSubcategory}
            onChange={(e) => {
              if (e.target.value === 'new') {
                setIsSubcategoryModalOpen(true);
              } else {
                setSelectedSubcategory(e.target.value);
              }
            }}
            disabled={selectedCategory === 'all'}
          >
            <option value="all">All Subcategories</option>
            {activeSubcategories.map(sub => (
              <option key={sub} value={sub}>{sub}</option>
            ))}
            {selectedCategory !== 'all' && (
              <option value="new" className="text-brand-accent font-bold">+ Add New Subcategory</option>
            )}
          </select>
        </div>
      </div>

      <div className="bg-brand-surface rounded-2xl border border-brand-border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-bg/50 border-b border-brand-border">
                <th className="px-6 py-4 col-header">{viewType === 'product' ? 'Product' : 'Service'}</th>
                <th className="px-6 py-4 col-header">SKU</th>
                <th className="px-6 py-4 col-header text-right">Price</th>
                {viewType === 'product' && <th className="px-6 py-4 col-header text-right">Stock</th>}
                <th className="px-6 py-4 col-header text-center">Status</th>
                <th className="px-6 py-4 col-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border/50">
              {filteredProducts.map(product => (
                <tr 
                  key={product.id} 
                  className={cn("data-row group", isAdmin && "cursor-pointer hover:bg-brand-bg/50 transition-colors")}
                  onClick={() => {
                    if (isAdmin) {
                      setEditingProduct(product);
                      setIsModalOpen(true);
                    }
                  }}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-bg flex items-center justify-center text-brand-muted">
                        <Package size={20} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-brand-text">
                          {product.name}
                          {product.alias && <span className="ml-2 text-[10px] font-normal text-brand-muted">({product.alias})</span>}
                        </span>
                        <span className="text-xs text-brand-muted">
                          {product.category || 'Uncategorized'}
                          {product.subcategory ? ` • ${product.subcategory}` : ''}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-mono text-brand-muted bg-brand-bg px-2 py-1 rounded-lg">{product.sku}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm font-bold text-brand-text">{formatCurrency(product.price, settings.currencySymbol)}</span>
                  </td>
                  {viewType === 'product' && (
                    <td className="px-6 py-4 text-right">
                      <span className={cn(
                        "text-sm font-bold",
                        product.stock <= product.minStock ? "text-rose-600" : "text-brand-text"
                      )}>
                        {product.stock}
                      </span>
                    </td>
                  )}
                  <td className="px-6 py-4">
                    <div className="flex justify-center">
                      {product.active === 0 ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wider border border-slate-200">
                          Inactive
                        </span>
                      ) : (viewType === 'product' && product.stock <= product.minStock) ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 text-[10px] font-bold uppercase tracking-wider border border-rose-100 animate-pulse">
                          <AlertCircle size={12} />
                          Low Stock
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-wider border border-emerald-100">
                          {viewType === 'product' ? 'Optimal' : 'Active'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                      {isAdmin && (
                        <>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setEditingProduct(product); setIsModalOpen(true); }}
                            className="p-2 rounded-lg hover:bg-brand-bg text-brand-muted hover:text-brand-text transition-colors"
                            title="Edit Product"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDelete(product.id); }}
                            className="p-2 rounded-lg hover:bg-rose-50 text-brand-muted hover:text-rose-600 transition-colors"
                            title="Delete Product"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3 opacity-30">
                      <Search size={48} strokeWidth={1} />
                      <p className="font-medium">No products found matching your search</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-brand-text/20 backdrop-blur-sm flex items-start justify-center z-50 p-4 pt-20">
          <div className="bg-brand-surface rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-brand-border">
            <div className="px-6 py-4 border-b border-brand-border flex justify-between items-center">
              <h3 className="text-lg font-bold text-brand-text">Add New Category</h3>
              <button onClick={() => setIsCategoryModalOpen(false)} className="p-2 hover:bg-brand-bg rounded-xl transition-colors text-brand-muted">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddCategory} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Category Name</label>
                <input required className="input-field" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} autoFocus />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setIsCategoryModalOpen(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">Add Category</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isSubcategoryModalOpen && (
        <div className="fixed inset-0 bg-brand-text/20 backdrop-blur-sm flex items-start justify-center z-50 p-4 pt-20">
          <div className="bg-brand-surface rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-brand-border">
            <div className="px-6 py-4 border-b border-brand-border flex justify-between items-center">
              <h3 className="text-lg font-bold text-brand-text">Add Subcategory to {selectedCategory}</h3>
              <button onClick={() => setIsSubcategoryModalOpen(false)} className="p-2 hover:bg-brand-bg rounded-xl transition-colors text-brand-muted">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddSubcategory} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Subcategory Name</label>
                <input required className="input-field" value={newSubcategoryName} onChange={e => setNewSubcategoryName(e.target.value)} autoFocus />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setIsSubcategoryModalOpen(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">Add Subcategory</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isModalOpen && (
        <ProductModal 
          product={editingProduct} 
          type={viewType}
          initialSku={pendingSku}
          onClose={() => { setIsModalOpen(false); setPendingSku(''); }} 
          onSave={() => { fetchProducts(); setIsModalOpen(false); setPendingSku(''); }}
          onDirtyChange={onDirtyChange}
        />
      )}

      {isScannerOpen && (
        <BarcodeScanner
          onClose={() => setIsScannerOpen(false)}
          onScan={(decodedText) => {
            const trimmedText = decodedText.trim();
            setSearch(trimmedText);
            setIsScannerOpen(false);
            
            // If exact match found, open edit modal
            const match = products.find(p => 
              p.sku === trimmedText || 
              (p.alias && p.alias.toLowerCase() === trimmedText.toLowerCase())
            );
            if (match) {
              setEditingProduct(match);
              setIsModalOpen(true);
              playSound('success');
            } else {
              // If no match, open add modal with SKU auto-filled
              setEditingProduct(null);
              setPendingSku(trimmedText);
              setIsModalOpen(true);
              playSound('alert');
            }
          }}
        />
      )}
    </div>
  );
}

function ProductModal({ product, type, initialSku, onClose, onSave, onDirtyChange }: { product: Product | null, type: 'product' | 'service', initialSku?: string, onClose: () => void, onSave: () => void, onDirtyChange?: (dirty: boolean) => void }) {
  const { settings, playSound } = useSettings();
  const categories = Array.isArray(settings.categories) ? settings.categories : [];
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    name: product?.name || '',
    sku: product?.sku || initialSku || '',
    category: product?.category || '',
    subcategory: product?.subcategory || '',
    price: product?.price || 0,
    wholesalePrice: product?.wholesalePrice || 0,
    cost: product?.cost || 0,
    stock: product?.stock || 0,
    minStock: product?.minStock ?? settings.lowStockThreshold ?? 5,
    alias: product?.alias || '',
    description: product?.description || '',
    expiryDate: product?.expiryDate || '',
    model: product?.model || '',
    manufacturer: product?.manufacturer || '',
    batchNumber: product?.batchNumber || '',
    type: product?.type || type,
    active: product?.active ?? 1
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [isAddingSubcategory, setIsAddingSubcategory] = useState(false);
  const { showNotification } = useNotification();
  const { updateSettings } = useSettings();
  const prevCategoryRef = useRef(formData.category);

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    
    // Check if category already exists
    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      showNotification('error', 'Category already exists');
      return;
    }

    const newCategory = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      subcategories: []
    };
    try {
      const updatedCategories = [...categories, newCategory];
      await updateSettings({ categories: updatedCategories });
      setFormData(prev => ({ ...prev, category: name }));
      setIsAddingCategory(false);
      setNewCategoryName('');
      showNotification('success', 'Category added successfully');
    } catch (err) {
      showNotification('error', 'Failed to add category');
    }
  };

  const handleAddSubcategory = async () => {
    const name = newSubcategoryName.trim();
    if (!name || !formData.category) return;

    const updatedCategories = categories.map(c => {
      if (c.name === formData.category) {
        const subcategories = Array.isArray(c.subcategories) ? c.subcategories : [];
        if (subcategories.some(s => s.toLowerCase() === name.toLowerCase())) {
          return c;
        }
        return {
          ...c,
          subcategories: [...subcategories, name]
        };
      }
      return c;
    });

    try {
      await updateSettings({ categories: updatedCategories });
      setFormData(prev => ({ ...prev, subcategory: name }));
      setIsAddingSubcategory(false);
      setNewSubcategoryName('');
      showNotification('success', 'Subcategory added successfully');
    } catch (err) {
      showNotification('error', 'Failed to add subcategory');
    }
  };

  useEffect(() => {
    const isDirty = JSON.stringify(formData) !== JSON.stringify({
      name: product?.name || '',
      sku: product?.sku || '',
      category: product?.category || '',
      subcategory: product?.subcategory || '',
      price: product?.price || 0,
      wholesalePrice: product?.wholesalePrice || 0,
      cost: product?.cost || 0,
      stock: product?.stock || 0,
      minStock: product?.minStock ?? settings.lowStockThreshold ?? 5,
      alias: product?.alias || '',
      description: product?.description || '',
      expiryDate: product?.expiryDate || '',
      batchNumber: product?.batchNumber || '',
      model: product?.model || '',
      manufacturer: product?.manufacturer || '',
      type: product?.type || type,
      active: product?.active ?? 1
    });
    if (onDirtyChange) onDirtyChange(isDirty);
    return () => { if (onDirtyChange) onDirtyChange(false); };
  }, [formData, product, onDirtyChange]);

  const selectedCategoryObj = Array.isArray(categories) ? categories.find(c => c.name === formData.category) : null;
  const availableSubcategories = selectedCategoryObj ? selectedCategoryObj.subcategories : [];

  // Reset subcategory if category changes
  useEffect(() => {
    if (formData.category !== prevCategoryRef.current) {
      setFormData(prev => ({ ...prev, subcategory: '' }));
      prevCategoryRef.current = formData.category;
    }
  }, [formData.category]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    const method = product ? 'PUT' : 'POST';
    const url = product ? `/api/products/${product.id}` : '/api/products';
    
    try {
      const response = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save product');
      }

      playSound('success');
      showNotification('success', product ? 'Product updated successfully' : 'Product added successfully');
      onSave();
    } catch (err: any) {
      console.error('Failed to save product:', err);
      showNotification('error', err.message || 'Failed to save product');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto pt-20">
      <div className="bg-brand-surface rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-brand-border mb-10">
        <div className="px-6 py-4 md:px-8 md:py-6 border-b border-brand-border flex justify-between items-center">
          <div>
            <h3 className="text-lg md:text-xl font-bold text-brand-text">
              {product ? `Edit ${formData.type === 'product' ? 'Product' : 'Service'}` : `Add New ${formData.type === 'product' ? 'Product' : 'Service'}`}
            </h3>
            <p className="text-[10px] md:text-xs text-brand-muted mt-0.5">
              {product ? `Update ${formData.type === 'product' ? 'product' : 'service'} details` : `Create a new ${formData.type === 'product' ? 'item' : 'service'} in your catalog`}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-brand-bg rounded-xl transition-colors text-brand-muted" disabled={isSubmitting}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6 md:space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">
                {formData.type === 'product' ? 'Product Name' : 'Service Name'}
              </label>
              <input 
                required
                placeholder={formData.type === 'product' ? "e.g. Wireless Headphones" : "e.g. Consultation"}
                className="input-field"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Alias (Optional)</label>
              <input 
                placeholder="e.g. Local Name or Short Name"
                className="input-field"
                value={formData.alias}
                onChange={e => setFormData({...formData, alias: e.target.value})}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">
                SKU / Barcode (Optional)
              </label>
              <div className="flex gap-2">
                <input 
                  placeholder={formData.type === 'product' ? "e.g. WH-001" : "e.g. SRV-001"}
                  className="input-field font-mono flex-1"
                  value={formData.sku}
                  onChange={e => setFormData({...formData, sku: e.target.value})}
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="p-3 bg-brand-bg hover:bg-brand-border rounded-xl text-brand-text transition-colors flex items-center justify-center"
                  title="Scan Barcode"
                  disabled={isSubmitting}
                >
                  <Camera size={20} />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Category</label>
              {isAddingCategory ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input-field"
                    placeholder="New Category Name"
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleAddCategory}
                    className="btn-primary px-3"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingCategory(false)}
                    className="btn-secondary px-3"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <select 
                  className="input-field appearance-none"
                  value={formData.category}
                  onChange={e => {
                    if (e.target.value === 'new') {
                      setIsAddingCategory(true);
                    } else {
                      setFormData({...formData, category: e.target.value});
                    }
                  }}
                  disabled={isSubmitting}
                >
                  <option value="">Select Category</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                  <option value="new" className="text-brand-accent font-bold">+ Add New Category</option>
                </select>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Subcategory</label>
              {isAddingSubcategory ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input-field"
                    placeholder="New Subcategory Name"
                    value={newSubcategoryName}
                    onChange={e => setNewSubcategoryName(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleAddSubcategory}
                    className="btn-primary px-3"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingSubcategory(false)}
                    className="btn-secondary px-3"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <select 
                  className="input-field appearance-none"
                  value={formData.subcategory}
                  onChange={e => {
                    if (e.target.value === 'new') {
                      setIsAddingSubcategory(true);
                    } else {
                      setFormData({...formData, subcategory: e.target.value});
                    }
                  }}
                  disabled={!formData.category || isSubmitting}
                >
                  <option value="">Select Subcategory</option>
                  {availableSubcategories.map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                  {formData.category && <option value="new" className="text-brand-accent font-bold">+ Add New Subcategory</option>}
                </select>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Price (Retail)</label>
              <CurrencyInput
                value={formData.price}
                onChange={val => setFormData({...formData, price: val === '' ? 0 : Number(val)})}
                prefix={settings.currencySymbol}
                required
                disabled={isSubmitting}
                className={cn(formData.price < formData.cost && formData.price > 0 && "border-rose-500")}
              />
              {formData.price < formData.cost && formData.price > 0 && (
                <p className="text-[10px] text-rose-500 font-bold flex items-center gap-1">
                  <AlertCircle size={10} /> Retail price is lower than cost
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Wholesale Price (Optional)</label>
              <CurrencyInput
                value={formData.wholesalePrice === 0 ? '' : formData.wholesalePrice}
                onChange={val => setFormData({...formData, wholesalePrice: val === '' ? 0 : Number(val)})}
                prefix={settings.currencySymbol}
                disabled={isSubmitting}
                className={cn(formData.wholesalePrice > 0 && formData.wholesalePrice < formData.cost && "border-rose-500")}
              />
              {formData.wholesalePrice > 0 && formData.wholesalePrice < formData.cost && (
                <p className="text-[10px] text-rose-500 font-bold flex items-center gap-1">
                  <AlertCircle size={10} /> Wholesale price is lower than cost
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">
                {formData.type === 'product' ? 'Cost (Purchase)' : 'Basic Minimum Cost'}
              </label>
              <CurrencyInput
                value={formData.cost === 0 ? '' : formData.cost}
                onChange={val => setFormData({...formData, cost: val === '' ? 0 : Number(val)})}
                prefix={settings.currencySymbol}
                required
                disabled={isSubmitting}
              />
            </div>
            {formData.type === 'product' && (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Initial Stock</label>
                  <CurrencyInput
                    value={formData.stock === 0 ? '' : formData.stock}
                    onChange={val => setFormData({...formData, stock: val === '' ? 0 : Number(val)})}
                    required
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Min Stock Level</label>
                  <CurrencyInput
                    value={formData.minStock === 0 ? '' : formData.minStock}
                    onChange={val => setFormData({...formData, minStock: val === '' ? 0 : Number(val)})}
                    required
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Expiry Date (Optional)</label>
                  <input 
                    type="date"
                    className="input-field"
                    value={formData.expiryDate}
                    onChange={e => setFormData({...formData, expiryDate: e.target.value})}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Batch Number (Optional)</label>
                  <input 
                    type="text"
                    placeholder="e.g. BATCH-001"
                    className="input-field"
                    value={formData.batchNumber}
                    onChange={e => setFormData({...formData, batchNumber: e.target.value})}
                    disabled={isSubmitting}
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Model (Optional)</label>
              <input 
                type="text"
                placeholder="e.g. Pro Max"
                className="input-field"
                value={formData.model}
                onChange={e => setFormData({...formData, model: e.target.value})}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Manufacturer (Optional)</label>
              <input 
                type="text"
                placeholder="e.g. Apple"
                className="input-field"
                value={formData.manufacturer}
                onChange={e => setFormData({...formData, manufacturer: e.target.value})}
                disabled={isSubmitting}
              />
            </div>
            {product && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Status</label>
                <select 
                  className="input-field appearance-none"
                  value={formData.active}
                  onChange={e => setFormData({...formData, active: parseInt(e.target.value)})}
                  disabled={isSubmitting}
                >
                  <option value={1}>Active (Available for Sale)</option>
                  <option value={0}>Inactive (Hidden from Sales)</option>
                </select>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={isSubmitting}>Cancel</button>
            <button type="submit" className="btn-primary px-8" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : product ? 'Update' : 'Save'} {formData.type === 'product' ? 'Product' : 'Service'}
            </button>
          </div>
        </form>
      </div>

      {isScannerOpen && (
        <BarcodeScanner
          onClose={() => setIsScannerOpen(false)}
          onScan={(decodedText) => {
            setFormData({ ...formData, sku: decodedText });
            setIsScannerOpen(false);
          }}
        />
      )}
    </div>
  );
}
