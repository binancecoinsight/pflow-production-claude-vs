import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { Download, Calendar, TrendingUp, Package, DollarSign, AlertTriangle, Search, Filter, ArrowUpRight, ArrowDownRight, Sparkles, History, FileText, X, Printer, FileDown } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { useNotification } from '../context/NotificationContext';
import { apiFetch } from '../lib/api';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';

import { formatCurrency, formatNumber } from '../utils/formatters';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const COLORS = ['#0f172a', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function Reports() {
  const { settings } = useSettings();
  const { showNotification } = useNotification();
  const [activeTab, setActiveTab] = useState<'sales' | 'inventory' | 'expiry' | 'accounts' | 'top-sellers' | 'slow-sellers' | 'negotiated-profits' | 'sales-vs-services' | 'activities'>('sales');
  const [salesData, setSalesData] = useState<any[]>([]);
  const [inventoryData, setInventoryData] = useState<any[]>([]);
  const [expiryData, setExpiryData] = useState<any[]>([]);
  const [accountsData, setAccountsData] = useState<any[]>([]);
  const [topSellersData, setTopSellersData] = useState<any[]>([]);
  const [slowSellersData, setSlowSellersData] = useState<any[]>([]);
  const [negotiatedProfitsData, setNegotiatedProfitsData] = useState<any[]>([]);
  const [salesVsServicesData, setSalesVsServicesData] = useState<any[]>([]);
  const [activitiesData, setActivitiesData] = useState<any[]>([]);
  const [salesSearch, setSalesSearch] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');
  const [expirySearch, setExpirySearch] = useState('');
  const [activitySearch, setActivitySearch] = useState('');
  const [expiryFilter, setExpiryFilter] = useState<'all' | '30' | '60' | '90' | '120'>('all');
  const [accountsSearch, setAccountsSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState('30days'); // '7days', '30days', 'all'
  const [activityDays, setActivityDays] = useState('1'); // '1', '7', '30', '90'
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  useEffect(() => {
    // Only clear data when tab changes, don't auto-fetch
    setSalesData([]);
    setInventoryData([]);
    setExpiryData([]);
    setAccountsData([]);
    setTopSellersData([]);
    setSlowSellersData([]);
    setNegotiatedProfitsData([]);
    setSalesVsServicesData([]);
    setActivitiesData([]);
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'activities') {
        const res = await apiFetch(`/api/activities?range=${activityDays}`);
        const data = await res.json();
        setActivitiesData(Array.isArray(data) ? data : []);
      } else if (activeTab === 'sales') {
        let url = '/api/reports/sales';
        if (dateRange !== 'all') {
          const end = new Date();
          const start = new Date();
          start.setDate(end.getDate() - (dateRange === '7days' ? 7 : 30));
          url += `?startDate=${start.toISOString().split('T')[0]}&endDate=${end.toISOString().split('T')[0]}`;
        }
        const res = await apiFetch(url);
        const data = await res.json();
        setSalesData(Array.isArray(data) ? data : []);
      } else if (activeTab === 'inventory') {
        const res = await apiFetch('/api/reports/inventory');
        const data = await res.json();
        setInventoryData(Array.isArray(data) ? data : []);
      } else if (activeTab === 'expiry') {
        const res = await apiFetch('/api/reports/expiry');
        const data = await res.json();
        setExpiryData(Array.isArray(data) ? data : []);
      } else if (activeTab === 'accounts') {
        const res = await apiFetch('/api/reports/accounts');
        const data = await res.json();
        setAccountsData(Array.isArray(data) ? data : []);
      } else if (activeTab === 'top-sellers') {
        const res = await apiFetch('/api/reports/top-sellers');
        const data = await res.json();
        setTopSellersData(Array.isArray(data) ? data : []);
      } else if (activeTab === 'slow-sellers') {
        const res = await apiFetch('/api/reports/slow-sellers');
        const data = await res.json();
        setSlowSellersData(Array.isArray(data) ? data : []);
      } else if (activeTab === 'negotiated-profits') {
        let url = '/api/reports/negotiated-profits';
        if (dateRange !== 'all') {
          const end = new Date();
          const start = new Date();
          start.setDate(end.getDate() - (dateRange === '7days' ? 7 : 30));
          url += `?startDate=${start.toISOString().split('T')[0]}&endDate=${end.toISOString().split('T')[0]}`;
        }
        const res = await apiFetch(url);
        const data = await res.json();
        setNegotiatedProfitsData(Array.isArray(data) ? data : []);
      } else if (activeTab === 'sales-vs-services') {
        let url = '/api/reports/sales-vs-services';
        if (dateRange !== 'all') {
          const end = new Date();
          const start = new Date();
          start.setDate(end.getDate() - (dateRange === '7days' ? 7 : 30));
          url += `?startDate=${start.toISOString().split('T')[0]}&endDate=${end.toISOString().split('T')[0]}`;
        }
        const res = await apiFetch(url);
        const data = await res.json();
        setSalesVsServicesData(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Failed to fetch report data', error);
      setSalesData([]);
      setInventoryData([]);
      setExpiryData([]);
      setAccountsData([]);
    } finally {
      setLoading(false);
    }
  };

  const exportToXLS = async () => {
    const data = activeTab === 'sales' ? salesData : 
                 activeTab === 'inventory' ? inventoryData : 
                 activeTab === 'expiry' ? expiryData : 
                 activeTab === 'accounts' ? accountsData :
                 activeTab === 'top-sellers' ? topSellersData :
                 activeTab === 'slow-sellers' ? slowSellersData :
                 activeTab === 'negotiated-profits' ? negotiatedProfitsData :
                 activeTab === 'activities' ? activitiesData :
                 salesVsServicesData;
    if (!data.length) return;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report');

    // Get headers from the first object
    const headers = Object.keys(data[0]);
    worksheet.columns = headers.map(h => ({
      header: h.replace(/([A-Z])/g, ' $1').trim().toUpperCase(),
      key: h,
      width: 20
    }));

    data.forEach(row => {
      worksheet.addRow(row);
    });

    try {
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `${activeTab}_report_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      const { saveFile } = await import('../utils/fileSaver');
      await saveFile(fileName, blob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      
      showNotification('success', 'XLS Report exported successfully');
    } catch (err) {
      console.error('XLS Export failed:', err);
      showNotification('error', 'Failed to export XLS. Please try opening in a new tab.');
    }
  };

  const exportToPDF = async () => {
    const data = activeTab === 'sales' ? salesData : 
                 activeTab === 'inventory' ? inventoryData : 
                 activeTab === 'expiry' ? expiryData : 
                 activeTab === 'accounts' ? accountsData :
                 activeTab === 'top-sellers' ? topSellersData :
                 activeTab === 'slow-sellers' ? slowSellersData :
                 activeTab === 'negotiated-profits' ? negotiatedProfitsData :
                 activeTab === 'activities' ? activitiesData :
                 salesVsServicesData;
    if (!data.length) return;

    try {
      const doc = new jsPDF();
      const title = tabs.find(t => t.id === activeTab)?.label || 'Report';
      const currency = settings?.currencySymbol || '$';
      const safeCurrency = currency === '₦' ? 'NGN ' : currency;
      
      // Add title
      doc.setFontSize(20);
      doc.setTextColor(15, 23, 42);
      doc.text(title, 14, 22);
      
      // Add store info
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`${settings.storeName || 'Pharmacy Flow'}`, 14, 30);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 35);
      doc.text(`Period: ${dateRange === 'all' ? 'All Time' : dateRange === '7days' ? 'Last 7 Days' : 'Last 30 Days'}`, 14, 40);
      
      const headers = Object.keys(data[0]);
      
      // Add summary stats if applicable
      let currentY = 45;
      if (activeTab === 'sales') {
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text(`Total Revenue: ${safeCurrency}${formatCurrency(totalRevenue, '')}`, 14, currentY);
        doc.text(`Net Profit: ${safeCurrency}${formatCurrency(totalProfit, '')}`, 14, currentY + 5);
        doc.text(`Total Orders: ${totalOrders}`, 14, currentY + 10);
        currentY += 20;
      } else if (activeTab === 'inventory') {
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text(`Total Valuation (Retail): ${safeCurrency}${formatCurrency(totalInventoryValue, '')}`, 14, currentY);
        doc.text(`Total Valuation (Cost): ${safeCurrency}${formatCurrency(totalInventoryCost, '')}`, 14, currentY + 5);
        doc.text(`Total Items: ${totalInventoryItems}`, 14, currentY + 10);
        currentY += 20;
      } else if (activeTab === 'negotiated-profits') {
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text(`Total Actual Profit: ${safeCurrency}${formatCurrency(totalNegotiatedProfit, '')}`, 14, currentY);
        doc.text(`Negotiation Impact: ${totalNegotiatedVariance >= 0 ? '+' : ''}${safeCurrency}${formatCurrency(totalNegotiatedVariance, '')}`, 14, currentY + 5);
        doc.text(`Negotiated Items: ${negotiatedProfitsData.length}`, 14, currentY + 10);
        currentY += 20;
      }

      const tableData = data.map(row => 
        headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          if (typeof val === 'number' && (h.toLowerCase().includes('amount') || h.toLowerCase().includes('revenue') || h.toLowerCase().includes('profit') || h.toLowerCase().includes('value') || h.toLowerCase().includes('cost') || h.toLowerCase().includes('balance'))) {
            return `${safeCurrency}${formatCurrency(val, '')}`;
          }
          return String(val);
        })
      );
      
      autoTable(doc, {
        startY: currentY,
        head: [headers.map(h => h.replace(/([A-Z])/g, ' $1').trim().toUpperCase())],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        margin: { top: currentY },
      });
      
      const pdfBlob = doc.output('blob');
      const fileName = `${activeTab}_report_${new Date().toISOString().split('T')[0]}.pdf`;
      
      const { saveFile } = await import('../utils/fileSaver');
      await saveFile(fileName, pdfBlob, 'application/pdf');
      
      showNotification('success', 'PDF Report exported successfully');
    } catch (err) {
      console.error('PDF Export failed:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      showNotification('error', `Failed to export PDF: ${errorMsg}. Please try opening in a new tab.`);
    }
  };

  const printReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const data = activeTab === 'sales' ? salesData : 
                 activeTab === 'inventory' ? inventoryData : 
                 activeTab === 'expiry' ? expiryData : 
                 activeTab === 'accounts' ? accountsData :
                 activeTab === 'top-sellers' ? topSellersData :
                 activeTab === 'slow-sellers' ? slowSellersData :
                 activeTab === 'negotiated-profits' ? negotiatedProfitsData :
                 activeTab === 'activities' ? activitiesData :
                 salesVsServicesData;
    if (!data.length) return;

    const headers = Object.keys(data[0]);
    const title = tabs.find(t => t.id === activeTab)?.label || 'Report';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #333; }
            .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
            .store-name { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
            .report-title { font-size: 18px; color: #666; }
            .meta { margin-bottom: 30px; font-size: 12px; color: #888; display: flex; justify-content: space-between; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #f8fafc; text-align: left; padding: 12px 8px; border-bottom: 2px solid #e2e8f0; font-size: 12px; text-transform: uppercase; }
            td { padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
            tr:nth-child(even) { background: #fcfcfc; }
            .summary { margin-top: 30px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
            .stat-card { padding: 15px; border: 1px solid #e2e8f0; border-radius: 8px; }
            .stat-label { font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase; }
            .stat-value { font-size: 18px; font-weight: bold; margin-top: 5px; }
            @media print {
              .no-print { display: none; }
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="store-name">${settings.storeName || 'Pharmacy Flow'}</div>
            <div class="report-title">${title}</div>
          </div>
          
          <div class="meta">
            <span>Generated: ${new Date().toLocaleString()}</span>
            <span>Period: ${dateRange === 'all' ? 'All Time' : dateRange === '7days' ? 'Last 7 Days' : 'Last 30 Days'}</span>
          </div>

          ${activeTab === 'sales' ? `
            <div class="summary">
              <div class="stat-card">
                <div class="stat-label">Total Revenue</div>
                <div class="stat-value">${formatCurrency(totalRevenue, settings.currencySymbol)}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Net Profit</div>
                <div class="stat-value">${formatCurrency(totalProfit, settings.currencySymbol)}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Total Orders</div>
                <div class="stat-value">${totalOrders}</div>
              </div>
            </div>
          ` : activeTab === 'inventory' ? `
            <div class="summary">
              <div class="stat-card">
                <div class="stat-label">Total Valuation (Retail)</div>
                <div class="stat-value">${formatCurrency(totalInventoryValue, settings.currencySymbol)}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Total Valuation (Cost)</div>
                <div class="stat-value">${formatCurrency(totalInventoryCost, settings.currencySymbol)}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Total Items</div>
                <div class="stat-value">${totalInventoryItems}</div>
              </div>
            </div>
          ` : activeTab === 'negotiated-profits' ? `
            <div class="summary">
              <div class="stat-card">
                <div class="stat-label">Total Actual Profit</div>
                <div class="stat-value">${formatCurrency(totalNegotiatedProfit, settings.currencySymbol)}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Negotiation Impact</div>
                <div class="stat-value" style="color: ${totalNegotiatedVariance >= 0 ? '#10b981' : '#ef4444'}">
                  ${totalNegotiatedVariance >= 0 ? '+' : ''}${formatCurrency(totalNegotiatedVariance, settings.currencySymbol)}
                </div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Negotiated Items</div>
                <div class="stat-value">${negotiatedProfitsData.length}</div>
              </div>
            </div>
          ` : ''}

          <table>
            <thead>
              <tr>
                ${headers.map(h => `<th>${h.replace(/([A-Z])/g, ' $1').trim()}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${data.map(row => `
                <tr>
                  ${headers.map(h => `<td>${row[h] !== null && row[h] !== undefined ? row[h] : ''}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>

          <script>
            window.onload = () => {
              window.print();
              setTimeout(() => window.close(), 500);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const totalRevenue = salesData.reduce((sum, item) => sum + (item.revenue || 0), 0);
  const totalProfit = salesData.reduce((sum, item) => sum + (item.profit || 0), 0);
  const totalOrders = salesData.reduce((sum, item) => sum + (item.orders || 0), 0);

  const totalInventoryValue = inventoryData.reduce((sum, item) => sum + (item.totalValue || 0), 0);
  const totalInventoryCost = inventoryData.reduce((sum, item) => sum + (item.totalCost || 0), 0);
  const totalInventoryItems = inventoryData.reduce((sum, item) => sum + (item.totalStock || 0), 0);

  const totalNegotiatedProfit = negotiatedProfitsData.reduce((sum, item) => sum + (item.profit || 0), 0);
  const totalNegotiatedVariance = negotiatedProfitsData.reduce((sum, item) => sum + (item.variance || 0), 0);

  const tabs = [
    { id: 'sales', label: 'Sales Performance', icon: TrendingUp },
    { id: 'inventory', label: 'Inventory Valuation', icon: Package },
    { id: 'expiry', label: 'Expiry Tracking', icon: Calendar },
    { id: 'accounts', label: 'Account Analysis', icon: History },
    { id: 'top-sellers', label: 'Top Sellers', icon: Sparkles },
    { id: 'slow-sellers', label: 'Slow Sellers', icon: AlertTriangle },
    { id: 'negotiated-profits', label: 'Negotiated Profits', icon: DollarSign },
    { id: 'sales-vs-services', label: 'Sales vs Services', icon: TrendingUp },
    { id: 'activities', label: 'Recent Activities', icon: History },
  ];

  return (
    <div className="space-y-10 pb-20">
      {/* Header */}
      <div className="flex flex-col items-center text-center gap-8">
        <div className="space-y-2">
          <h2 className="section-title">Reports & Analytics</h2>
          <p className="text-brand-muted">Deep dive into your business performance and metrics.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          <button 
            onClick={printReport}
            className="btn-secondary flex items-center gap-3 px-8"
          >
            <Printer size={20} />
            Print Report
          </button>
          <button 
            onClick={exportToPDF}
            className="btn-secondary flex items-center gap-3 px-8"
          >
            <FileDown size={20} />
            Export PDF
          </button>
          <button 
            onClick={exportToXLS}
            className="btn-secondary flex items-center gap-3 px-8"
          >
            <Download size={20} />
            Export XLS
          </button>
        </div>
      </div>

      {/* Tab Navigation & Generate Button */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex flex-wrap gap-2 p-2 bg-brand-surface rounded-[2rem] border border-brand-border shadow-sm w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-3 px-6 py-3 rounded-[1.5rem] text-sm font-bold transition-all",
                activeTab === tab.id 
                  ? "bg-brand-accent text-white shadow-lg shadow-brand-accent/20" 
                  : "text-brand-muted hover:bg-brand-bg hover:text-brand-text"
              )}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>

        <button 
          onClick={fetchData}
          disabled={loading}
          className="btn-primary flex items-center gap-3 px-10 py-4 rounded-2xl shadow-xl shadow-brand-accent/20 hover:scale-105 active:scale-95 transition-all"
        >
          <Sparkles size={20} className={cn(loading && "animate-spin")} />
          {loading ? 'Generating...' : 'Generate Report'}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-96">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-accent"></div>
            <p className="text-sm font-bold text-brand-muted uppercase tracking-widest">Generating Insights...</p>
          </div>
        </div>
      ) : (
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-10"
        >
          {activeTab === 'sales' && (
            <>
              {/* Sales Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="card group">
                  <div className="flex justify-between items-start mb-6">
                    <div className="p-4 rounded-2xl bg-blue-50 text-blue-600 group-hover:scale-110 transition-transform">
                      <DollarSign size={24} />
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wider">
                      <TrendingUp size={12} />
                      Active
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Total Revenue</p>
                    <h3 className="text-3xl font-bold text-brand-text tracking-tight">
                      {formatCurrency(totalRevenue || 0, settings.currencySymbol)}
                    </h3>
                  </div>
                </div>
                <div className="card group">
                  <div className="flex justify-between items-start mb-6">
                    <div className="p-4 rounded-2xl bg-emerald-50 text-emerald-600 group-hover:scale-110 transition-transform">
                      <TrendingUp size={24} />
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider">
                      <TrendingUp size={12} />
                      Yield
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Net Profit</p>
                    <h3 className="text-3xl font-bold text-brand-text tracking-tight">
                      {formatCurrency(totalProfit || 0, settings.currencySymbol)}
                    </h3>
                  </div>
                </div>
                <div className="card group">
                  <div className="flex justify-between items-start mb-6">
                    <div className="p-4 rounded-2xl bg-violet-50 text-violet-600 group-hover:scale-110 transition-transform">
                      <Package size={24} />
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold uppercase tracking-wider">
                      <Package size={12} />
                      Volume
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Total Orders</p>
                    <h3 className="text-3xl font-bold text-brand-text tracking-tight">
                      {(totalOrders || 0).toLocaleString()}
                    </h3>
                  </div>
                </div>
              </div>

              {/* Sales Chart */}
              <div className="card p-10">
                <div className="flex flex-col items-center text-center gap-6 mb-12">
                  <div>
                    <h3 className="text-xl font-bold text-brand-text">Revenue & Profit Trends</h3>
                    <p className="text-xs text-brand-muted mt-1">Visualizing financial performance over time</p>
                  </div>
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative w-64">
                      <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted" />
                      <input 
                        type="text" 
                        placeholder="Filter by date..." 
                        className="input-field pl-12 pr-12 py-2 text-sm text-center"
                        value={salesSearch}
                        onChange={(e) => setSalesSearch(e.target.value)}
                      />
                    </div>
                    <select 
                      value={dateRange}
                      onChange={(e) => setDateRange(e.target.value)}
                      className="input-field py-2 text-sm w-40 text-center"
                    >
                      <option value="7days">Last 7 Days</option>
                      <option value="30days">Last 30 Days</option>
                      <option value="all">All Time</option>
                    </select>
                  </div>
                </div>
                <div className="h-96 w-full">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={1}>
                    <AreaChart data={salesData.filter(item => item.date.toLowerCase().includes(salesSearch.toLowerCase()))}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0f172a" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#0f172a" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="date" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} 
                        dy={15}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                        tickFormatter={(value) => formatCurrency(value, settings.currencySymbol)}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '15px' }}
                        formatter={(value: any) => [formatCurrency(Number(value), settings.currencySymbol), '']}
                      />
                      <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#0f172a" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                      <Area type="monotone" dataKey="profit" name="Profit" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorProfit)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          {activeTab === 'inventory' && (
            <>
              {/* Inventory Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="card group">
                  <div className="flex justify-between items-start mb-6">
                    <div className="p-4 rounded-2xl bg-blue-50 text-blue-600 group-hover:scale-110 transition-transform">
                      <DollarSign size={24} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Valuation (Retail)</p>
                    <h3 className="text-3xl font-bold text-brand-text tracking-tight">
                      {formatCurrency(totalInventoryValue || 0, settings.currencySymbol)}
                    </h3>
                  </div>
                </div>
                <div className="card group">
                  <div className="flex justify-between items-start mb-6">
                    <div className="p-4 rounded-2xl bg-emerald-50 text-emerald-600 group-hover:scale-110 transition-transform">
                      <TrendingUp size={24} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Valuation (Cost)</p>
                    <h3 className="text-3xl font-bold text-brand-text tracking-tight">
                      {formatCurrency(totalInventoryCost || 0, settings.currencySymbol)}
                    </h3>
                  </div>
                </div>
                <div className="card group">
                  <div className="flex justify-between items-start mb-6">
                    <div className="p-4 rounded-2xl bg-violet-50 text-violet-600 group-hover:scale-110 transition-transform">
                      <Package size={24} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Items in Stock</p>
                    <h3 className="text-3xl font-bold text-brand-text tracking-tight">
                      {(totalInventoryItems || 0).toLocaleString()}
                    </h3>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <div className="card p-10">
                  <h3 className="text-xl font-bold text-brand-text mb-10">Value by Category</h3>
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={1}>
                      <PieChart>
                        <Pie
                          data={inventoryData.filter(item => item.category.toLowerCase().includes(inventorySearch.toLowerCase()))}
                          cx="50%"
                          cy="50%"
                          innerRadius={70}
                          outerRadius={110}
                          paddingAngle={8}
                          dataKey="totalValue"
                          nameKey="category"
                          stroke="none"
                        >
                          {inventoryData.filter(item => item.category.toLowerCase().includes(inventorySearch.toLowerCase())).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: any) => [formatCurrency(Number(value), settings.currencySymbol), 'Value']}
                          contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                        />
                        <Legend verticalAlign="bottom" height={36}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card p-0 overflow-hidden border-none shadow-xl shadow-brand-accent/5">
                  <div className="p-8 border-b border-brand-border flex justify-between items-center bg-brand-bg/20">
                    <h3 className="text-sm font-bold text-brand-text uppercase tracking-widest">Category Breakdown</h3>
                    <div className="relative w-48">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
                      <input 
                        type="text" 
                        placeholder="Search..." 
                        className="input-field pl-9 py-1.5 text-xs"
                        value={inventorySearch}
                        onChange={(e) => setInventorySearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-brand-bg/30 border-b border-brand-border">
                          <th className="px-8 py-4 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Category</th>
                          <th className="px-8 py-4 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Products</th>
                          <th className="px-8 py-4 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Stock</th>
                          <th className="px-8 py-4 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Retail Value</th>
                          <th className="px-8 py-4 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Cost Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-brand-border/50">
                        {inventoryData
                          .filter(row => row.category.toLowerCase().includes(inventorySearch.toLowerCase()))
                          .map((row, i) => (
                          <tr key={i} className="hover:bg-brand-bg/20 transition-colors">
                            <td className="px-8 py-4 text-sm font-bold text-brand-text">{row.category}</td>
                            <td className="px-8 py-4 text-sm text-right text-brand-muted">{row.productCount}</td>
                            <td className="px-8 py-4 text-sm text-right text-brand-muted">{row.totalStock}</td>
                            <td className="px-8 py-4 text-sm text-right font-bold text-brand-text">
                              {formatCurrency(row.totalValue || 0, settings.currencySymbol)}
                            </td>
                            <td className="px-8 py-4 text-sm text-right font-bold text-emerald-600">
                              {formatCurrency(row.totalCost || 0, settings.currencySymbol)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'expiry' && (
            <div className="card overflow-hidden border-none shadow-xl shadow-brand-accent/5">
              <div className="p-8 border-b border-brand-border flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-brand-bg/20">
                <div>
                  <h3 className="text-lg font-bold text-brand-text">Expiry Tracking</h3>
                  <p className="text-xs text-brand-muted mt-1">Monitor products nearing their expiration date</p>
                </div>
                <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
                  <div className="flex gap-2 p-1 bg-brand-bg rounded-xl border border-brand-border">
                    {[
                      { id: 'all', label: 'All' },
                      { id: '30', label: '30d' },
                      { id: '60', label: '60d' },
                      { id: '90', label: '90d' },
                      { id: '120', label: '120d' },
                    ].map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setExpiryFilter(f.id as any)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                          expiryFilter === f.id 
                            ? "bg-brand-accent text-white shadow-sm" 
                            : "text-brand-muted hover:text-brand-text"
                        )}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <div className="relative w-full md:w-64">
                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted" />
                    <input 
                      type="text" 
                      placeholder="Search..." 
                      className="input-field pl-12 py-3 text-sm"
                      value={expirySearch}
                      onChange={(e) => setExpirySearch(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-brand-bg/30 border-b border-brand-border">
                      <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Product</th>
                      <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">SKU</th>
                      <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Stock</th>
                      <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Expiry Date</th>
                      <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border/50">
                    {expiryData
                      .filter(item => {
                        const matchesSearch = item.name.toLowerCase().includes(expirySearch.toLowerCase()) || item.sku.toLowerCase().includes(expirySearch.toLowerCase());
                        if (!matchesSearch) return false;
                        
                        if (expiryFilter === 'all') return true;
                        
                        const expiryDate = new Date(item.expiryDate);
                        const today = new Date();
                        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
                        
                        return daysUntilExpiry <= parseInt(expiryFilter);
                      })
                      .map(item => {
                        const expiryDate = new Date(item.expiryDate);
                        const today = new Date();
                        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
                        
                        let statusColor = 'bg-emerald-50 text-emerald-600 border-emerald-100';
                        let statusText = 'Good';
                        
                        if (daysUntilExpiry < 0) {
                          statusColor = 'bg-rose-50 text-rose-600 border-rose-100';
                          statusText = 'Expired';
                        } else if (daysUntilExpiry <= 30) {
                          statusColor = 'bg-orange-50 text-orange-600 border-orange-100';
                          statusText = 'Expiring (30d)';
                        } else if (daysUntilExpiry <= 60) {
                          statusColor = 'bg-amber-50 text-amber-600 border-amber-100';
                          statusText = 'Expiring (60d)';
                        } else if (daysUntilExpiry <= 90) {
                          statusColor = 'bg-blue-50 text-blue-600 border-blue-100';
                          statusText = 'Expiring (90d)';
                        } else if (daysUntilExpiry <= 120) {
                          statusColor = 'bg-indigo-50 text-indigo-600 border-indigo-100';
                          statusText = 'Expiring (120d)';
                        }

                        return (
                          <tr key={item.id} className="hover:bg-brand-bg/20 transition-colors">
                            <td className="px-8 py-5">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-brand-bg flex items-center justify-center text-brand-muted">
                                  <Package size={18} />
                                </div>
                                <span className="text-sm font-bold text-brand-text">{item.name}</span>
                              </div>
                            </td>
                            <td className="px-8 py-5 text-xs font-mono text-brand-muted uppercase tracking-widest">{item.sku}</td>
                            <td className="px-8 py-5 text-right font-bold text-brand-text">{item.stock}</td>
                            <td className="px-8 py-5 text-right text-sm text-brand-muted">
                              {expiryDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                            </td>
                            <td className="px-8 py-5">
                              <div className="flex justify-center">
                                <span className={cn(
                                  "inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border",
                                  statusColor
                                )}>
                                  {daysUntilExpiry < 0 && <AlertTriangle size={12} />}
                                  {statusText}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    {expiryData.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-8 py-20 text-center">
                          <div className="flex flex-col items-center gap-3 opacity-30">
                            <Calendar size={48} strokeWidth={1} />
                            <p className="font-medium">No products with expiry dates tracked</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'activities' && (
            <div className="card overflow-hidden border-none shadow-xl shadow-brand-accent/5">
              <div className="p-8 border-b border-brand-border flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-brand-bg/20">
                <div>
                  <h3 className="text-lg font-bold text-brand-text">Recent Activities</h3>
                  <p className="text-xs text-brand-muted mt-1">Track comprehensive changes to store data across the system.</p>
                </div>
                <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
                  <div className="flex gap-2 p-1 bg-brand-bg rounded-xl border border-brand-border">
                    {[
                      { id: '1', label: '24h' },
                      { id: '7', label: '7d' },
                      { id: '30', label: '30d' },
                      { id: '90', label: '90d' },
                    ].map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setActivityDays(f.id)}
                        className={cn(
                          "px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                          activityDays === f.id 
                            ? "bg-brand-accent text-white shadow-sm" 
                            : "text-brand-muted hover:text-brand-text"
                        )}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <div className="relative w-full md:w-64">
                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted" />
                    <input 
                      type="text" 
                      placeholder="Filter activities..." 
                      className="input-field pl-12 py-3 text-sm"
                      value={activitySearch}
                      onChange={(e) => setActivitySearch(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-brand-bg/30 border-b border-brand-border">
                      <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Time</th>
                      <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">User</th>
                      <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Action</th>
                      <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Entity</th>
                      <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border/50">
                    {activitiesData
                      .filter(activity => {
                        const searchLower = activitySearch.toLowerCase();
                        return activity.userName.toLowerCase().includes(searchLower) ||
                               activity.action.toLowerCase().includes(searchLower) ||
                               activity.entityName.toLowerCase().includes(searchLower) ||
                               activity.details.toLowerCase().includes(searchLower);
                      })
                      .map((activity) => {
                        const details = JSON.parse(activity.details);
                        
                        return (
                          <tr key={activity.id} className="hover:bg-brand-bg/20 transition-colors">
                            <td className="px-8 py-5 whitespace-nowrap text-xs text-brand-muted">
                              {new Date(activity.timestamp).toLocaleString(undefined, { 
                                month: 'short', 
                                day: 'numeric', 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })}
                            </td>
                            <td className="px-8 py-5 whitespace-nowrap text-sm font-bold text-brand-text">
                              {activity.userName}
                            </td>
                            <td className="px-8 py-5 whitespace-nowrap">
                              <span className={cn(
                                "capitalize px-3 py-1 rounded-full text-[10px] font-bold tracking-wider border",
                                activity.action.includes('added') ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                activity.action.includes('removed') ? "bg-rose-50 text-rose-600 border-rose-100" :
                                activity.action.includes('modified') ? "bg-amber-50 text-amber-600 border-amber-100" :
                                activity.action.includes('sale') ? "bg-blue-50 text-blue-600 border-blue-100" :
                                "bg-brand-bg text-brand-muted border-brand-border"
                              )}>
                                {activity.action.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="px-8 py-5 whitespace-nowrap text-sm font-medium text-brand-text">
                              {activity.entityName}
                            </td>
                            <td className="px-8 py-5">
                              <div className="max-w-md">
                                {activity.action === 'product_modified' ? (
                                  <div className="flex flex-wrap gap-2">
                                    {Object.entries(details).map(([field, val]: [string, any]) => (
                                      <div key={field} className="text-[10px] bg-brand-bg/50 px-2 py-1 rounded flex gap-1 items-center border border-brand-border">
                                        <span className="font-bold uppercase text-brand-muted">{field}:</span>
                                        <span className="text-rose-500 line-through">{String(val.old)}</span>
                                        <ArrowUpRight size={10} className="text-brand-muted" />
                                        <span className="text-emerald-500">{String(val.new)}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : activity.action === 'debt_added' ? (
                                  <div className="text-sm text-brand-muted">
                                    Added debt of <span className="font-bold text-rose-600">{formatCurrency(details.amount, settings.currencySymbol)}</span> 
                                    <span className="text-[10px] ml-2 block italic opacity-60">Receipt: {details.receiptId}</span>
                                  </div>
                                ) : activity.action === 'backdated_sale' ? (
                                  <div className="text-sm text-brand-muted">
                                    Sale at <span className="font-bold">{details.saleDate}</span> for {formatCurrency(details.totalAmount, settings.currencySymbol)}
                                  </div>
                                ) : activity.action === 'new_sale' ? (
                                  <div className="text-sm text-brand-muted">
                                    Completed sale for {formatCurrency(details.totalAmount, settings.currencySymbol)}
                                  </div>
                                ) : (
                                  <p className="text-xs text-brand-muted truncate max-w-xs">{JSON.stringify(details)}</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    {activitiesData.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-8 py-20 text-center">
                          <div className="flex flex-col items-center gap-3 opacity-30">
                            <History size={48} strokeWidth={1} />
                            <p className="font-medium">No system activities recorded for this period</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'accounts' && (
            <div className="card overflow-hidden border-none shadow-xl shadow-brand-accent/5">
              <div className="p-8 border-b border-brand-border flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-brand-bg/20">
                <div>
                  <h3 className="text-lg font-bold text-brand-text">Account Analysis</h3>
                  <p className="text-xs text-brand-muted mt-1">Track and manage outstanding account balances</p>
                </div>
                <div className="relative w-full md:w-80">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted" />
                  <input 
                    type="text" 
                    placeholder="Search by account or receipt..." 
                    className="input-field pl-12 py-3"
                    value={accountsSearch}
                    onChange={(e) => setAccountsSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-brand-bg/30 border-b border-brand-border">
                      <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Account</th>
                      <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Receipt ID</th>
                      <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Transaction Date</th>
                      <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Due Date</th>
                      <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Original</th>
                      <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Balance</th>
                      <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border/50">
                    {accountsData
                      .filter(d => 
                        d.accountName?.toLowerCase().includes(accountsSearch.toLowerCase()) || 
                        d.receiptId?.toLowerCase().includes(accountsSearch.toLowerCase())
                      )
                      .map((accountDebt, i) => (
                      <tr key={i} className="hover:bg-brand-bg/20 transition-colors">
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-brand-bg flex items-center justify-center text-brand-muted">
                              <History size={18} />
                            </div>
                            <span className="text-sm font-bold text-brand-text">{accountDebt.accountName}</span>
                          </div>
                        </td>
                        <td className="px-8 py-5 text-xs font-mono text-brand-muted uppercase tracking-widest">{accountDebt.receiptId || 'N/A'}</td>
                        <td className="px-8 py-5 text-sm text-brand-muted">{new Date(accountDebt.transactionDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
                        <td className="px-8 py-5 text-sm text-brand-muted">
                          {accountDebt.dueDate ? new Date(accountDebt.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A'}
                        </td>
                        <td className="px-8 py-5 text-right text-sm text-brand-muted">
                          {settings.currencySymbol}{(accountDebt.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-8 py-5 text-right">
                          <span className="text-sm font-bold text-rose-600">
                            {settings.currencySymbol}{(accountDebt.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex justify-center">
                            {selectedAccountId === accountDebt.id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  className="input-field py-1 px-3 w-24 text-xs"
                                  placeholder="Amount"
                                  value={paymentAmount}
                                  onChange={(e) => setPaymentAmount(e.target.value)}
                                  onFocus={(e) => { if (e.target.value === '0') e.target.value = ''; }}
                                  autoFocus
                                />
                                <button
                                  className="p-2 bg-brand-accent text-white rounded-xl shadow-lg shadow-brand-accent/20"
                                  onClick={async () => {
                                    const amount = parseFloat(paymentAmount);
                                    if (isNaN(amount) || amount <= 0 || amount > accountDebt.balance) return;
                                    try {
                                      await apiFetch(`/api/accounts/debts/${accountDebt.id}/pay`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ amount })
                                      });
                                      setSelectedAccountId(null);
                                      setPaymentAmount('');
                                      fetchData();
                                    } catch (err) {
                                      console.error('Payment failed', err);
                                    }
                                  }}
                                >
                                  <Sparkles size={14} />
                                </button>
                                <button
                                  className="p-2 bg-brand-bg text-brand-muted rounded-xl"
                                  onClick={() => {
                                    setSelectedAccountId(null);
                                    setPaymentAmount('');
                                  }}
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <button
                                className="px-6 py-2 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-100 transition-colors border border-emerald-100"
                                onClick={() => {
                                  setSelectedAccountId(accountDebt.id);
                                  setPaymentAmount(accountDebt.balance.toString());
                                }}
                              >
                                Record Payment
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {accountsData.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-8 py-20 text-center">
                          <div className="flex flex-col items-center gap-3 opacity-30">
                            <FileText size={48} strokeWidth={1} />
                            <p className="font-medium">No outstanding balances found</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'top-sellers' && (
            <div className="card overflow-hidden border-none shadow-xl shadow-brand-accent/5">
              <div className="p-8 border-b border-brand-border flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-brand-bg/20">
                <div>
                  <h3 className="text-lg font-bold text-brand-text">Top Selling Products</h3>
                  <p className="text-xs text-brand-muted mt-1">Products with the highest sales volume and revenue</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-brand-bg/30 border-b border-brand-border">
                      <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Product</th>
                      <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Quantity Sold</th>
                      <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Total Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border/50">
                    {topSellersData.map((item, i) => (
                      <tr key={i} className="hover:bg-brand-bg/20 transition-colors">
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-brand-bg flex items-center justify-center text-brand-muted">
                              <Sparkles size={18} />
                            </div>
                            <span className="text-sm font-bold text-brand-text">{item.name}</span>
                          </div>
                        </td>
                        <td className="px-8 py-5 text-right font-bold text-brand-text">{item.totalQuantity}</td>
                        <td className="px-8 py-5 text-right text-sm text-brand-muted">
                          {settings.currencySymbol}{(item.totalRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                    {topSellersData.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-8 py-20 text-center">
                          <div className="flex flex-col items-center gap-3 opacity-30">
                            <Sparkles size={48} strokeWidth={1} />
                            <p className="font-medium">No data available. Click "Generate Report" to fetch data.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'slow-sellers' && (
            <div className="card overflow-hidden border-none shadow-xl shadow-brand-accent/5">
              <div className="p-8 border-b border-brand-border flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-brand-bg/20">
                <div>
                  <h3 className="text-lg font-bold text-brand-text">Slow Selling Products</h3>
                  <p className="text-xs text-brand-muted mt-1">Products with low sales volume relative to stock</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-brand-bg/30 border-b border-brand-border">
                      <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Product</th>
                      <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Current Stock</th>
                      <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Quantity Sold</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border/50">
                    {slowSellersData.map((item, i) => (
                      <tr key={i} className="hover:bg-brand-bg/20 transition-colors">
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-brand-bg flex items-center justify-center text-brand-muted">
                              <AlertTriangle size={18} />
                            </div>
                            <span className="text-sm font-bold text-brand-text">{item.name}</span>
                          </div>
                        </td>
                        <td className="px-8 py-5 text-right font-bold text-brand-text">{item.stock}</td>
                        <td className="px-8 py-5 text-right text-sm text-brand-muted">{item.totalQuantity}</td>
                      </tr>
                    ))}
                    {slowSellersData.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-8 py-20 text-center">
                          <div className="flex flex-col items-center gap-3 opacity-30">
                            <AlertTriangle size={48} strokeWidth={1} />
                            <p className="font-medium">No data available. Click "Generate Report" to fetch data.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'negotiated-profits' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="card p-6 bg-brand-bg/20 border-none shadow-xl shadow-brand-accent/5">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                      <DollarSign size={24} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Total Actual Profit</p>
                      <p className="text-xl font-black text-brand-text">{settings.currencySymbol}{(totalNegotiatedProfit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                </div>
                <div className="card p-6 bg-brand-bg/20 border-none shadow-xl shadow-brand-accent/5">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center",
                      totalNegotiatedVariance >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                    )}>
                      {totalNegotiatedVariance >= 0 ? <ArrowUpRight size={24} /> : <ArrowDownRight size={24} />}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Negotiation Impact</p>
                      <p className={cn(
                        "text-xl font-black",
                        totalNegotiatedVariance >= 0 ? "text-emerald-600" : "text-rose-600"
                      )}>
                        {totalNegotiatedVariance >= 0 ? '+' : ''}{settings.currencySymbol}{(totalNegotiatedVariance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="card p-6 bg-brand-bg/20 border-none shadow-xl shadow-brand-accent/5">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-brand-bg flex items-center justify-center text-brand-muted">
                      <TrendingUp size={24} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Negotiated Items</p>
                      <p className="text-xl font-black text-brand-text">{negotiatedProfitsData.length}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card overflow-hidden border-none shadow-xl shadow-brand-accent/5">
                <div className="p-8 border-b border-brand-border flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-brand-bg/20">
                  <div>
                    <h3 className="text-lg font-bold text-brand-text">Negotiated Profits Report</h3>
                    <p className="text-xs text-brand-muted mt-1">Analysis of profits from sales with negotiated prices</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <select 
                      value={dateRange}
                      onChange={(e) => setDateRange(e.target.value)}
                      className="input-field py-2 text-sm w-40"
                    >
                      <option value="7days">Last 7 Days</option>
                      <option value="30days">Last 30 Days</option>
                      <option value="all">All Time</option>
                    </select>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-brand-bg/30 border-b border-brand-border">
                        <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Date</th>
                        <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Item</th>
                        <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Type</th>
                        <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Qty</th>
                        <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Orig. Price</th>
                        <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Sold Price</th>
                        <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Impact</th>
                        <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Actual Profit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border/50">
                      {negotiatedProfitsData.map((item, i) => (
                        <tr key={i} className="hover:bg-brand-bg/20 transition-colors">
                          <td className="px-8 py-5 text-sm text-brand-muted">{item.date}</td>
                          <td className="px-8 py-5">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-brand-bg flex items-center justify-center text-brand-muted">
                                {item.type === 'service' ? <TrendingUp size={18} /> : <DollarSign size={18} />}
                              </div>
                              <span className="text-sm font-bold text-brand-text">{item.name}</span>
                            </div>
                          </td>
                          <td className="px-8 py-5">
                            <span className={cn(
                              "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                              item.type === 'service' ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600"
                            )}>
                              {item.type || 'product'}
                            </span>
                          </td>
                          <td className="px-8 py-5 text-right font-bold text-brand-text">{item.quantity}</td>
                          <td className="px-8 py-5 text-right text-sm text-brand-muted">
                            {settings.currencySymbol}{(item.originalPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-8 py-5 text-right text-sm text-brand-muted">
                            {settings.currencySymbol}{(item.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-8 py-5 text-right">
                            <span className={cn(
                              "text-sm font-bold",
                              item.variance >= 0 ? "text-emerald-600" : "text-rose-600"
                            )}>
                              {item.variance >= 0 ? '+' : ''}{settings.currencySymbol}{(item.variance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td className="px-8 py-5 text-right">
                            <span className="text-sm font-bold text-brand-text">
                              {settings.currencySymbol}{(item.profit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {negotiatedProfitsData.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-8 py-20 text-center">
                            <div className="flex flex-col items-center gap-3 opacity-30">
                              <DollarSign size={48} strokeWidth={1} />
                              <p className="font-medium">No data available. Click "Generate Report" to fetch data.</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'sales-vs-services' && (
            <div className="space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="card p-10">
                  <h3 className="text-xl font-bold text-brand-text mb-8 text-center">Profit Distribution</h3>
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Products', value: salesVsServicesData.reduce((sum, item) => sum + item.productProfit, 0) },
                            { name: 'Services', value: salesVsServicesData.reduce((sum, item) => sum + item.serviceProfit, 0) }
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          <Cell fill="#0f172a" />
                          <Cell fill="#3b82f6" />
                        </Pie>
                        <Tooltip formatter={(value: any) => [`${settings.currencySymbol}${Number(value).toFixed(2)}`, 'Profit']} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="card p-10">
                  <h3 className="text-xl font-bold text-brand-text mb-8 text-center">Revenue Distribution</h3>
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Products', value: salesVsServicesData.reduce((sum, item) => sum + item.productRevenue, 0) },
                            { name: 'Services', value: salesVsServicesData.reduce((sum, item) => sum + item.serviceRevenue, 0) }
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          <Cell fill="#10b981" />
                          <Cell fill="#8b5cf6" />
                        </Pie>
                        <Tooltip formatter={(value: any) => [`${settings.currencySymbol}${Number(value).toFixed(2)}`, 'Revenue']} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="card overflow-hidden border-none shadow-xl shadow-brand-accent/5">
                <div className="p-8 border-b border-brand-border flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-brand-bg/20">
                  <div>
                    <h3 className="text-lg font-bold text-brand-text">Sales vs Services Summary</h3>
                    <p className="text-xs text-brand-muted mt-1">Comparison of performance between products and services</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <select 
                      value={dateRange}
                      onChange={(e) => setDateRange(e.target.value)}
                      className="input-field py-2 text-sm w-40"
                    >
                      <option value="7days">Last 7 Days</option>
                      <option value="30days">Last 30 Days</option>
                      <option value="all">All Time</option>
                    </select>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-brand-bg/30 border-b border-brand-border">
                        <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Date</th>
                        <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Product Revenue</th>
                        <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Service Revenue</th>
                        <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Product Profit</th>
                        <th className="px-8 py-5 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Service Profit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border/50">
                      {salesVsServicesData.map((item, i) => (
                        <tr key={i} className="hover:bg-brand-bg/20 transition-colors">
                          <td className="px-8 py-5 text-sm font-bold text-brand-text">{item.date}</td>
                          <td className="px-8 py-5 text-right text-sm text-brand-muted">
                            {settings.currencySymbol}{(item.productRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-8 py-5 text-right text-sm text-brand-muted">
                            {settings.currencySymbol}{(item.serviceRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-8 py-5 text-right text-sm font-bold text-emerald-600">
                            {settings.currencySymbol}{(item.productProfit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-8 py-5 text-right text-sm font-bold text-blue-600">
                            {settings.currencySymbol}{(item.serviceProfit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                      {salesVsServicesData.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-8 py-20 text-center">
                            <div className="flex flex-col items-center gap-3 opacity-30">
                              <TrendingUp size={48} strokeWidth={1} />
                              <p className="font-medium">No data available. Click "Generate Report" to fetch data.</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
