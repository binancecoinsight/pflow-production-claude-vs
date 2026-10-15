import React, { useEffect, useState } from 'react';
import { TrendingUp, Package, AlertTriangle, DollarSign, ShoppingCart, Calendar, ChevronLeft, ChevronRight, Moon, Sun, TrendingDown, Sparkles, Info, Clock, X, History, RotateCcw, AlertCircle, Activity } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { DashboardStats } from '../types';
import { apiFetch } from '../lib/api';
import { useSettings } from '../context/SettingsContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import AppLogo from './AppLogo';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'motion/react';
import { APP_VERSION } from '../version';
import { formatCurrency, formatNumber } from '../utils/formatters';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const timeRangeOptions = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '3days', label: '3 Days Ago' },
  { id: 'week', label: 'Last Week' },
  { id: 'month', label: 'Last Month' },
];

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentSlide, setCurrentSlide] = useState(0);
  const [timeRange, setTimeRange] = useState('today');
  const { settings } = useSettings();
  const { theme, toggleTheme } = useTheme();
  const { t, isRTL } = useLanguage();

  const [showEmptyInventoryPopup, setShowEmptyInventoryPopup] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showAllNotificationsModal, setShowAllNotificationsModal] = useState(false);
  const [dismissedHistory, setDismissedHistory] = useState<any[]>([]);

  const fetchHistory = async () => {
    try {
      const response = await apiFetch('/api/notifications/dismissed');
      const data = await response.json();
      setDismissedHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch history:', err);
      setDismissedHistory([]);
    }
  };

  const restoreNotification = async (refId: string, type: string) => {
    try {
      await apiFetch('/api/notifications/restore', {
        method: 'POST',
        body: JSON.stringify({ refId, type })
      });
      fetchHistory();
      fetchStats(timeRange);
    } catch (err) {
      console.error('Failed to restore notification:', err);
    }
  };

  const dismissNotification = async (refId: string, type: string) => {
    try {
      await apiFetch('/api/notifications/dismiss', {
        method: 'POST',
        body: JSON.stringify({ refId, type })
      });
      fetchStats(timeRange);
    } catch (err) {
      console.error('Failed to dismiss notification:', err);
    }
  };

  const fetchStats = (range: string) => {
    setLoading(true);
    apiFetch(`/api/stats?range=${range}`)
      .then(res => res.json())
      .then(data => {
        if (data && !data.error) {
          setStats(data);
          if (settings.setupCompleted && data.totalProducts === 0) {
            setShowEmptyInventoryPopup(true);
          }
        } else {
          setStats(null);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch stats:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchStats(timeRange);

    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRange]);

  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'store owner';

  const rangeLabel = timeRangeOptions.find(o => o.id === timeRange)?.label || timeRange;

  const cards = [
    { 
      label: timeRange === 'today' ? t('todaysRevenue') : `Revenue (${rangeLabel})`, 
      value: formatCurrency(stats?.totalRevenue || 0, settings.currencySymbol), 
      icon: DollarSign, 
      color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400', 
      trend: stats?.revenueChange || '+0.0%',
      adminOnly: true
    },
    { 
      label: timeRange === 'today' ? t('todaysProfit') : `Profit (${rangeLabel})`, 
      value: formatCurrency(stats?.totalProfit || 0, settings.currencySymbol), 
      icon: (stats?.totalProfit || 0) < 0 ? TrendingDown : TrendingUp, 
      color: (stats?.totalProfit || 0) < 0 
        ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400' 
        : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400', 
      trend: (stats?.totalProfit || 0) < 0 ? 'Loss Detected' : (stats?.profitChange || '+0.0%'),
      adminOnly: true
    },
    { 
      label: t('todaysExpenses'), 
      value: formatCurrency(stats?.dailyExpenses || 0, settings.currencySymbol), 
      icon: TrendingDown, 
      color: 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400', 
      trend: t('spending'),
      adminOnly: true
    },
    { 
      label: t('netProfit'), 
      value: formatCurrency(stats?.netProfit || 0, settings.currencySymbol), 
      icon: (stats?.netProfit || 0) < 0 ? TrendingDown : AppLogo, 
      color: (stats?.netProfit || 0) < 0 
        ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400' 
        : 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400', 
      trend: (stats?.netProfit || 0) < 0 ? 'Negative Margin' : t('afterExpenses'),
      adminOnly: true
    },
    { 
      label: timeRange === 'today' ? t('todaysSales') : `Sales (${rangeLabel})`, 
      value: formatNumber(stats?.totalSales || 0), 
      icon: ShoppingCart, 
      color: 'bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400', 
      trend: stats?.salesChange || '+0.0%' 
    },
    { 
      label: t('lowStockItems'), 
      value: formatNumber(stats?.lowStockCount || 0), 
      icon: AlertTriangle, 
      color: 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400', 
      trend: stats?.lowStockCount && stats.lowStockCount > 0 ? t('actionNeeded') : t('allGood') 
    },
    { 
      label: t('expiringSoon'), 
      value: formatNumber(stats?.expiringSoonCount || 0), 
      icon: Calendar, 
      color: 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400', 
      trend: stats?.expiringSoonCount && stats.expiringSoonCount > 0 ? 'Next 60 Days' : t('allClear') 
    },
  ].filter(card => !card.adminOnly || isAdmin);

  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  useEffect(() => {
    if (!isAutoPlaying) return;
    const slideTimer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % cards.length);
    }, 5000);
    return () => clearInterval(slideTimer);
  }, [cards.length, isAutoPlaying]);

  const nextSlide = () => {
    setIsAutoPlaying(false);
    setCurrentSlide((prev) => (prev + 1) % cards.length);
  };
  const prevSlide = () => {
    setIsAutoPlaying(false);
    setCurrentSlide((prev) => (prev - 1 + cards.length) % cards.length);
  };

  if (loading && !stats) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-accent"></div>
    </div>
  );

  return (
    <div className="space-y-8 md:space-y-12 relative">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none -z-10 overflow-hidden">
        <Activity size={400} strokeWidth={1} className="opacity-[0.05] dark:opacity-[0.08] text-brand-accent -rotate-12" />
      </div>
      <div className="flex flex-col items-center text-center gap-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-brand-text">Dashboard</h2>
          <p className="text-sm text-brand-muted mt-1">Real-time performance overview</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {timeRangeOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => setTimeRange(option.id)}
              className={cn(
                "px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2",
                timeRange === option.id 
                  ? "bg-brand-accent text-white shadow-lg shadow-brand-accent/25" 
                  : "bg-brand-surface text-brand-muted hover:text-brand-text border border-brand-border"
              )}
            >
              <Clock size={14} />
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sliding Cards */}
      <div className="relative overflow-hidden rounded-3xl bg-brand-surface border border-brand-border p-6 md:p-10 shadow-lg select-none touch-pan-y">
        <button onClick={prevSlide} className="absolute top-1/2 -translate-y-1/2 left-4 z-10 p-2 rounded-full bg-brand-bg/80 backdrop-blur-sm text-brand-text hover:bg-brand-accent hover:text-white transition-colors shadow-md">
          <ChevronLeft size={24} />
        </button>
        <button onClick={nextSlide} className="absolute top-1/2 -translate-y-1/2 right-4 z-10 p-2 rounded-full bg-brand-bg/80 backdrop-blur-sm text-brand-text hover:bg-brand-accent hover:text-white transition-colors shadow-md">
          <ChevronRight size={24} />
        </button>
        
        <div className="overflow-hidden">
          <motion.div 
            className="flex cursor-default"
            animate={{ x: `-${currentSlide * 100}%` }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            drag={false}
          >
            {cards.map((card, i) => (
              <div key={i} className="min-w-full px-12 flex flex-col items-center text-center">
                <p className="text-2xl font-bold text-brand-text mb-6 uppercase tracking-wider">{card.label}</p>
                <div className={cn("p-6 rounded-2xl mb-6 shadow-inner", card.color)}>
                  <card.icon size={48} />
                </div>
                <h3 className="text-5xl md:text-7xl font-bold text-brand-text tracking-tight font-sans mb-4">{card.value}</h3>
                <span className={cn(
                  "text-sm font-bold px-4 py-2 rounded-full uppercase tracking-wider transition-colors",
                  (card.label === 'Low Stock Items' || card.label === t('lowStockItems')) && stats?.lowStockCount && stats.lowStockCount > 0 
                    ? "bg-rose-500/10 text-rose-500" 
                    : (card.label === t('expiringSoon') || card.label === 'Expiring Soon') && stats?.expiringSoonCount && stats.expiringSoonCount > 0
                    ? "bg-orange-500/10 text-orange-500"
                    : card.trend.startsWith('-') || card.trend.includes('Loss') || card.trend.includes('Negative') || card.trend.includes('spending')
                    ? "bg-rose-500/10 text-rose-500"
                    : "bg-emerald-500/10 text-emerald-500"
                )}>
                  {card.trend}
                </span>
                
                {card.label === t('expiringSoon') && stats?.expiringSoonProducts && stats.expiringSoonProducts.length > 0 && (
                  <div className="mt-6 w-full max-w-md bg-brand-bg/50 rounded-xl p-4 border border-brand-border">
                    <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mb-2">Countdown</p>
                    <div className="space-y-2">
                      {stats.expiringSoonProducts.slice(0, 3).map((p, idx) => {
                        const daysLeft = Math.ceil((new Date(p.expiryDate!).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                        return (
                          <div key={idx} className="flex justify-between items-center text-xs">
                            <span className="font-medium text-brand-text">{p.name}</span>
                            <span className={cn(
                              "font-bold",
                              daysLeft <= 7 ? "text-rose-500" : daysLeft <= 30 ? "text-orange-500" : "text-brand-accent"
                            )}>
                              {daysLeft} days left
                            </span>
                          </div>
                        );
                      })}
                      {stats.expiringSoonProducts.length > 3 && (
                        <p className="text-[10px] text-brand-muted italic">And {stats.expiringSoonProducts.length - 3} more...</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </motion.div>
        </div>
        
        <div className="flex justify-center gap-2 mt-8">
          {cards.map((_, i) => (
            <button 
              key={i} 
              onClick={() => setCurrentSlide(i)}
              className={cn(
                "w-2 h-2 rounded-full transition-all duration-300",
                currentSlide === i ? "w-8 bg-brand-accent" : "bg-brand-border hover:bg-brand-muted"
              )}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="card lg:col-span-2">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-lg font-bold text-brand-text">Revenue Overview</h3>
            <div className="flex gap-4">
              <span className="flex items-center gap-1.5 text-xs font-medium text-brand-muted">
                <div className="w-2 h-2 rounded-full bg-brand-accent"></div>
                Revenue
              </span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-brand-muted">
                <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                Expenses
              </span>
            </div>
          </div>
          <div className="h-64 flex items-end justify-between gap-2 px-2">
            {(stats?.weeklyRevenue || []).map((item, i) => {
              const revenue = item.amount;
              const expenses = item.expenses || 0;
              const maxVal = Math.max(...(stats?.weeklyRevenue?.map(d => Math.max(d.amount, d.expenses)) || [1]), 1);
              const revHeight = (revenue / maxVal) * 100;
              const expHeight = (expenses / maxVal) * 100;
              
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-3 group relative h-full">
                  <div className="flex-1 w-full flex items-end justify-center gap-1">
                    <div 
                      className="w-1/2 bg-brand-accent rounded-t-sm transition-all duration-500 group-hover:brightness-110 relative" 
                      style={{ height: `${Math.max(revHeight, 2)}%` }}
                    >
                       <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-brand-accent text-white text-[10px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                        Rev: {settings.currencySymbol}{revenue.toFixed(0)}
                      </div>
                    </div>
                    <div 
                      className="w-1/2 bg-rose-500 rounded-t-sm transition-all duration-500 group-hover:brightness-110 relative" 
                      style={{ height: `${Math.max(expHeight, 2)}%` }}
                    >
                       <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                        Exp: {settings.currencySymbol}{expenses.toFixed(0)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-6 px-2">
            {(stats?.weeklyRevenue || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']).map((item, i) => (
              <span key={i} className="text-[11px] font-bold text-brand-muted uppercase tracking-wider">
                {typeof item === 'string' ? item : item.day}
              </span>
            ))}
          </div>
        </div>

        <div className="card h-full flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-brand-text">System Notifications</h3>
            <button 
              onClick={() => {
                setShowHistoryModal(true);
                fetchHistory();
              }}
              className="p-2 rounded-lg hover:bg-brand-bg text-brand-muted transition-colors"
              title="Notification History"
            >
              <History size={18} />
            </button>
          </div>
          
          <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {(stats?.reminders || []).length > 0 && (
              <div className="space-y-4">
                {(stats?.reminders || []).map((reminder) => (
                  <div key={reminder.id} className="flex flex-col gap-3 p-4 rounded-xl border border-brand-accent/20 bg-brand-accent/5 text-brand-text relative group transition-all hover:border-brand-accent/40">
                    <button 
                      onClick={() => dismissNotification(reminder.id, reminder.type)}
                      className="absolute top-2 right-2 p-1 rounded-lg hover:bg-brand-bg text-brand-muted opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={14} />
                    </button>
                    <div className="flex gap-4">
                      <Clock size={18} className="text-brand-accent flex-shrink-0" />
                      <div className="space-y-1 pr-6">
                        <p className="text-sm font-bold">
                          {reminder.type === 'invoice' ? 'Invoice Payment Due' : 'Debt Payment Due'}
                        </p>
                        <p className="text-xs opacity-80">
                          {reminder.customer}: {formatCurrency(reminder.amount, settings.currencySymbol)}
                        </p>
                      </div>
                    </div>
                    <div className="pl-8 flex justify-between items-center">
                      <div className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">
                        Due: {new Date(reminder.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                      <div className="text-[10px] px-2 py-0.5 rounded bg-brand-accent/10 text-brand-accent font-bold">
                        {reminder.title}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(stats?.upcomingEvents?.length || 0) > 0 && (
                <div className="flex flex-col gap-4 p-4 rounded-xl border border-brand-accent/20 bg-brand-accent/5 text-brand-text">
                  <div className="flex gap-4">
                    <Calendar size={18} className="text-brand-accent flex-shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-bold">Upcoming Calendar Events</p>
                      <p className="text-xs opacity-80">Events scheduled for the next 30 days.</p>
                    </div>
                  </div>
                  <div className="pl-8 space-y-2">
                    {(stats?.upcomingEvents || []).map((event, i) => {
                    const eventDate = new Date(event.startDate);
                    const today = new Date();
                    const diffTime = eventDate.getTime() - today.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    return (
                      <div key={i} className="flex flex-col gap-0.5 relative group/event">
                        <button 
                          onClick={() => dismissNotification(event.id, 'calendar')}
                          className="absolute -top-1 -right-1 p-1 rounded hover:bg-brand-bg text-brand-muted opacity-0 group-hover/event:opacity-100 transition-opacity"
                          title="Dismiss this event"
                        >
                          <X size={10} />
                        </button>
                        <div className="flex justify-between text-[10px] font-bold">
                          <span>{event.title}</span>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded-full uppercase tracking-tighter text-[8px]",
                            event.type === 'holiday' ? "bg-rose-500/10 text-rose-500" :
                            event.type === 'leave' ? "bg-amber-500/10 text-amber-500" :
                            event.type === 'duty' ? "bg-emerald-500/10 text-emerald-500" :
                            "bg-blue-500/10 text-blue-500"
                          )}>
                            {event.type}
                          </span>
                        </div>
                        <div className="flex justify-between text-[9px] text-brand-muted">
                          <span>{eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                          <span className="font-medium italic">
                            {diffDays === 0 ? 'Today' : diffDays === 1 ? 'Tomorrow' : `in ${diffDays} days`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {(stats?.lowStockCount || 0) > 0 ? (
                <div className="flex flex-col gap-4 p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 text-brand-text relative group">
                  <button 
                    onClick={() => dismissNotification('alert-low-stock', 'alert')}
                    className="absolute top-2 right-2 p-1 rounded-lg hover:bg-rose-500/10 text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Dismiss alert"
                  >
                    <X size={14} />
                  </button>
                  <div className="flex gap-4">
                    <AlertTriangle size={18} className="text-rose-500 flex-shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-bold">Low Stock Warning</p>
                      <p className="text-xs opacity-80">{stats?.lowStockCount} items are below minimum stock levels.</p>
                    </div>
                  </div>
                  <div className="pl-8 space-y-1">
                    {stats?.lowStockProducts?.map((p, i) => (
                      <div key={i} className="flex justify-between text-[10px] font-medium">
                        <span>{p.name}</span>
                        <span className="font-bold">{p.stock} left</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-brand-muted italic py-4 text-center border-2 border-dashed border-brand-border rounded-xl">
                  No critical alerts at this time.
                </div>
              )}

              {(stats?.expiringSoonCount || 0) > 0 && (
                <div className="flex flex-col gap-4 p-4 rounded-xl border border-orange-500/20 bg-orange-500/5 text-brand-text relative group">
                  <button 
                    onClick={() => dismissNotification('alert-expiring-soon', 'alert')}
                    className="absolute top-2 right-2 p-1 rounded-lg hover:bg-orange-500/10 text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Dismiss alert"
                  >
                    <X size={14} />
                  </button>
                  <div className="flex gap-4">
                    <Calendar size={18} className="text-orange-500 flex-shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-bold">Expiring Soon</p>
                      <p className="text-xs opacity-80">{stats?.expiringSoonCount} items expiring within 60 days.</p>
                    </div>
                  </div>
                  <div className="pl-8 space-y-1">
                    {stats?.expiringSoonProducts?.map((p, i) => (
                      <div key={i} className="flex justify-between text-[10px] font-medium">
                        <span>{p.name}</span>
                        <span className="font-bold">{new Date(p.expiryDate!).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
          <button 
            onClick={() => setShowAllNotificationsModal(true)}
            className="w-full mt-8 py-3 text-sm font-bold text-brand-muted hover:text-brand-text transition-colors border-t border-brand-border"
          >
            VIEW ALL NOTIFICATIONS
          </button>
        </div>
      </div>

      {showEmptyInventoryPopup && (
        <div className="fixed inset-0 bg-brand-text/20 backdrop-blur-sm flex items-start justify-center z-[100] p-4 pt-10">
          <div className="bg-brand-surface rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-brand-border">
            <div className="p-8 text-center space-y-6">
              <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-500 mx-auto">
                <Package size={32} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-brand-text">Your Inventory is Empty!</h3>
                <p className="text-brand-muted mt-2">
                  You need to add products and services to start selling.
                </p>
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => setShowEmptyInventoryPopup(false)}
                  className="btn-secondary flex-1"
                >
                  Dismiss
                </button>
                <button 
                  onClick={() => {
                    setShowEmptyInventoryPopup(false);
                    // We need a way to navigate to inventory. 
                    // Since Dashboard doesn't have setActiveTab, we can dispatch a custom event
                    window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'inventory' }));
                  }}
                  className="btn-primary flex-1"
                >
                  Go to Inventory
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notification History Modal */}
      <AnimatePresence>
        {showHistoryModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistoryModal(false)}
              className="absolute inset-0 bg-brand-text/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-brand-surface rounded-3xl shadow-2xl border border-brand-border overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-brand-border flex justify-between items-center bg-brand-bg/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-brand-accent/10 rounded-xl text-brand-accent">
                    <History size={20} />
                  </div>
                  <h3 className="text-xl font-bold text-brand-text">Notification History</h3>
                </div>
                <button 
                  onClick={() => setShowHistoryModal(false)}
                  className="p-2 hover:bg-brand-bg rounded-xl text-brand-muted transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                {!Array.isArray(dismissedHistory) || dismissedHistory.length === 0 ? (
                  <div className="text-center py-12 space-y-3">
                    <div className="w-12 h-12 bg-brand-bg rounded-full flex items-center justify-center text-brand-muted mx-auto">
                      <History size={24} />
                    </div>
                    <p className="text-brand-muted font-medium">No dismissed notifications found.</p>
                  </div>
                ) : (
                  dismissedHistory.map((item, i) => (
                    <div key={item.dismissalId} className="flex items-center justify-between p-4 rounded-2xl bg-brand-bg/50 border border-brand-border group transition-all hover:bg-brand-bg">
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-brand-text">{item.title}</p>
                        <p className="text-[10px] text-brand-muted font-medium uppercase tracking-wider">
                          Dismissed on {new Date(item.dismissedAt).toLocaleString()}
                        </p>
                      </div>
                      <button 
                        onClick={() => restoreNotification(item.refId, item.type)}
                        className="p-2 bg-brand-surface border border-brand-border rounded-xl text-brand-accent hover:bg-brand-accent hover:text-white transition-all shadow-sm"
                        title="Restore to dashboard"
                      >
                        <RotateCcw size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
              
              <div className="p-6 bg-brand-bg/30 border-t border-brand-border">
                <p className="text-center text-xs text-brand-muted font-medium">
                  Restoring a notification will make it visible on your dashboard again.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* All Notifications Modal */}
      <AnimatePresence>
        {showAllNotificationsModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAllNotificationsModal(false)}
              className="absolute inset-0 bg-brand-text/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl bg-brand-surface rounded-3xl shadow-2xl border border-brand-border overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="p-6 border-b border-brand-border flex justify-between items-center bg-brand-bg/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-brand-accent/10 rounded-xl text-brand-accent">
                    <AlertCircle size={20} />
                  </div>
                  <h3 className="text-xl font-bold text-brand-text">All System Notifications</h3>
                </div>
                <button 
                  onClick={() => setShowAllNotificationsModal(false)}
                  className="p-2 hover:bg-brand-bg rounded-xl text-brand-muted transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                {/* Reminders section in full view */}
                {(stats?.reminders || []).length > 0 && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-brand-muted uppercase tracking-[0.2em]">Pending Payments</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {(stats?.reminders || []).map((reminder) => (
                        <div key={reminder.id} className="p-5 rounded-2xl border border-brand-accent/20 bg-brand-accent/5 flex flex-col gap-3 group relative">
                          <button 
                            onClick={() => dismissNotification(reminder.id, reminder.type)}
                            className="absolute top-2 right-2 p-1.5 rounded-lg hover:bg-brand-bg text-brand-muted md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                          >
                            <X size={14} />
                          </button>
                          <div className="flex gap-4">
                            <Clock size={18} className="text-brand-accent flex-shrink-0" />
                            <div className="space-y-1">
                              <p className="text-sm font-bold text-brand-text">{reminder.customer}</p>
                              <p className="text-xs text-brand-muted font-medium">{reminder.type === 'invoice' ? 'Invoice' : 'Debt'} - {reminder.title}</p>
                            </div>
                          </div>
                          <div className="flex justify-between items-end mt-2">
                            <div className="space-y-0.5">
                              <p className="text-[10px] text-brand-muted font-bold uppercase tracking-wider text-[8px]">Amount Due</p>
                              <p className="text-lg font-black text-brand-text">{formatCurrency(reminder.amount, settings.currencySymbol)}</p>
                            </div>
                            <div className="px-3 py-1 bg-brand-accent text-white text-[10px] font-black rounded-lg">
                              DUE {new Date(reminder.dueDate).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Calendar section in full view */}
                {(stats?.upcomingEvents || []).length > 0 && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-brand-muted uppercase tracking-[0.2em]">Upcoming Events</h4>
                    <div className="space-y-3">
                      {(stats?.upcomingEvents || []).map((event: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-brand-bg/50 border border-brand-border group relative">
                          <button 
                            onClick={() => dismissNotification(event.id, 'calendar')}
                            className="absolute top-1 right-1 p-1 rounded-lg hover:bg-brand-bg text-brand-muted md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                          >
                            <X size={12} />
                          </button>
                          <div className="flex items-center gap-4">
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm",
                              event.type === 'holiday' ? "bg-rose-500/10 text-rose-500" :
                              event.type === 'leave' ? "bg-amber-500/10 text-amber-500" :
                              event.type === 'duty' ? "bg-emerald-500/10 text-emerald-500" :
                              "bg-blue-500/10 text-blue-500"
                            )}>
                              {new Date(event.startDate).getDate()}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-brand-text">{event.title}</p>
                              <p className="text-[10px] text-brand-muted font-black uppercase">{event.type} • {new Date(event.startDate).toLocaleDateString()}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Alerts section in full view */}
                {((stats?.lowStockCount || 0) > 0 || (stats?.expiringSoonCount || 0) > 0) && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-brand-muted uppercase tracking-[0.2em]">Critical Warnings</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {(stats?.lowStockCount || 0) > 0 && (
                        <div className="p-5 rounded-2xl border border-rose-500/20 bg-rose-500/5 relative group">
                          <button 
                            onClick={() => dismissNotification('alert-low-stock', 'alert')}
                            className="absolute top-2 right-2 p-1.5 rounded-lg hover:bg-brand-bg text-brand-muted md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                          >
                            <X size={14} />
                          </button>
                          <div className="flex items-center gap-3 mb-4">
                            <AlertTriangle size={18} className="text-rose-500" />
                            <p className="text-sm font-black text-rose-500 uppercase tracking-tight">Low Stock</p>
                          </div>
                          <p className="text-xs text-brand-text font-bold mb-4">{stats?.lowStockCount} items below minimum level.</p>
                          <div className="space-y-1.5">
                            {stats?.lowStockProducts?.slice(0, 5).map((p, i) => (
                              <div key={i} className="flex justify-between items-center text-[10px] font-medium p-1.5 bg-white/50 rounded-lg">
                                <span className="truncate pr-2">{p.name}</span>
                                <span className="font-black text-rose-600">{p.stock}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {(stats?.expiringSoonCount || 0) > 0 && (
                        <div className="p-5 rounded-2xl border border-orange-500/20 bg-orange-500/5 relative group">
                          <button 
                            onClick={() => dismissNotification('alert-expiring-soon', 'alert')}
                            className="absolute top-2 right-2 p-1.5 rounded-lg hover:bg-brand-bg text-brand-muted md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                          >
                            <X size={14} />
                          </button>
                          <div className="flex items-center gap-3 mb-4">
                            <Calendar size={18} className="text-orange-500" />
                            <p className="text-sm font-black text-orange-500 uppercase tracking-tight">Expiring Soon</p>
                          </div>
                          <p className="text-xs text-brand-text font-bold mb-4">{stats?.expiringSoonCount} items expiring within 60 days.</p>
                          <div className="space-y-1.5">
                            {stats?.expiringSoonProducts?.slice(0, 5).map((p, i) => (
                              <div key={i} className="flex justify-between items-center text-[10px] font-medium p-1.5 bg-white/50 rounded-lg">
                                <span className="truncate pr-2">{p.name}</span>
                                <span className="font-black text-orange-600">{new Date(p.expiryDate!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {((stats?.reminders || []).length === 0 && (stats?.upcomingEvents || []).length === 0 && (stats?.lowStockCount || 0) === 0 && (stats?.expiringSoonCount || 0) === 0) && (
                  <div className="text-center py-20 px-6 backdrop-blur-sm border-2 border-dashed border-brand-border rounded-3xl">
                    <p className="text-brand-muted font-bold">Excellent! No active notifications or warnings.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
