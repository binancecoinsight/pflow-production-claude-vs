import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Package, ShoppingCart, History, Settings, Menu, X, BarChart2, Users, Wifi, WifiOff, LogOut, CreditCard, Truck, Calendar, Clock, Banknote, FileText, HelpCircle, Sun, Moon, Sparkles, Plus, Minus, Pill, Stethoscope, Syringe, Thermometer, BriefcaseMedical, HeartPulse, Activity, Gift, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import AppLogo from '../AppLogo';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { APP_VERSION } from '../../version';
import { BUSINESS_TIPS } from '../../constants/tips';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const MedicalPattern = () => {
  const icons = [
    { Icon: Pill, color: 'text-emerald-500' },
    { Icon: Stethoscope, color: 'text-blue-500' },
    { Icon: Syringe, color: 'text-indigo-500' },
    { Icon: Thermometer, color: 'text-amber-500' },
    { Icon: BriefcaseMedical, color: 'text-rose-500' },
    { Icon: HeartPulse, color: 'text-red-500' },
    { Icon: Activity, color: 'text-cyan-500' }
  ];
  
  return (
    <div className="fixed inset-0 z-0 pointer-events-none opacity-[0.15] dark:opacity-[0.10] overflow-hidden select-none">
      <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-10 gap-x-8 gap-y-16 p-10 h-full w-full">
        {Array.from({ length: 80 }).map((_, i) => {
          const { Icon, color } = icons[i % icons.length];
          const rotation = (i * 137.5) % 360;
          return (
            <div key={i} className={cn("flex items-center justify-center", color)}>
              <Icon 
                size={i % 3 === 0 ? 48 : i % 3 === 1 ? 32 : 40} 
                strokeWidth={1.5} 
                style={{ transform: `rotate(${rotation}deg)` }} 
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

const MenuPattern = () => {
  const icons = [
    { Icon: Pill, color: 'text-emerald-500/40' },
    { Icon: Stethoscope, color: 'text-blue-500/40' },
    { Icon: Syringe, color: 'text-indigo-500/40' },
    { Icon: Thermometer, color: 'text-amber-500/40' },
    { Icon: BriefcaseMedical, color: 'text-rose-500/40' },
    { Icon: HeartPulse, color: 'text-red-500/40' },
    { Icon: Activity, color: 'text-cyan-500/40' }
  ];

  return (
    <div className="absolute inset-0 z-0 pointer-events-none opacity-20 overflow-hidden">
      <div className="grid grid-cols-3 gap-8 p-4 h-full w-full">
        {Array.from({ length: 30 }).map((_, i) => {
          const { Icon, color } = icons[i % icons.length];
          const rotation = (i * 137.5) % 360;
          return (
            <div key={i} className={cn("flex items-center justify-center translate-y-4", color)}>
              <Icon 
                size={20} 
                strokeWidth={2} 
                style={{ transform: `rotate(${rotation}deg)` }} 
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function Layout({ children, activeTab, setActiveTab }: LayoutProps) {
  const { settings } = useSettings();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t, isRTL } = useLanguage();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [currentTime, setCurrentTime] = useState(new Date());
  const getGreetingType = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  };

  const [appZoom, setAppZoom] = useState<number>(() => {
    const saved = localStorage.getItem('app_zoom_level');
    return saved ? parseFloat(saved) : 1;
  });

  const [isZoomActive, setIsZoomActive] = useState(false);

  useEffect(() => {
    if (isZoomActive) {
      const timer = setTimeout(() => setIsZoomActive(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isZoomActive]);

  useEffect(() => {
    localStorage.setItem('app_zoom_level', appZoom.toString());
  }, [appZoom]);

  const greetingType = getGreetingType();

  useEffect(() => {
    const saved = localStorage.getItem('greeting_clicks_data');
    if (saved) {
      const data = JSON.parse(saved);
      if (data.greetingType !== greetingType) {
        setGreetingClicks(0);
      }
    }
  }, [greetingType]);

  const [greetingClicks, setGreetingClicks] = useState<number>(() => {
    const saved = localStorage.getItem('greeting_clicks_data');
    if (saved) {
      const data = JSON.parse(saved);
      if (data.greetingType === greetingType && data.user === user?.id) {
        return data.count;
      }
    }
    return 0;
  });

  useEffect(() => {
    localStorage.setItem('greeting_clicks_data', JSON.stringify({
      count: greetingClicks,
      greetingType: greetingType,
      user: user?.id
    }));
  }, [greetingClicks, user?.id, greetingType]);

  const [showGreetingPopup, setShowGreetingPopup] = useState(false);
  const [showTipPopup, setShowTipPopup] = useState(false);
  const [randomTip, setRandomTip] = useState('');

  useEffect(() => {
    sessionStorage.setItem('greeting_clicks', greetingClicks.toString());
  }, [greetingClicks]);

  // Daily Tip Logic
  const getDailyTip = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = (now.getTime() - start.getTime()) + ((start.getTimezoneOffset() - now.getTimezoneOffset()) * 60 * 1000);
    const oneDay = 1000 * 60 * 60 * 24;
    const day = Math.floor(diff / oneDay);
    return BUSINESS_TIPS[day % BUSINESS_TIPS.length];
  };

  const dailyTip = getDailyTip();

  const handleTipClick = () => {
    const randomIndex = Math.floor(Math.random() * BUSINESS_TIPS.length);
    setRandomTip(BUSINESS_TIPS[randomIndex]);
    setShowTipPopup(true);
  };

  const handleGreetingClick = () => {
    if (activeTab !== 'dashboard' && activeTab !== 'sales') return;
    if (greetingClicks >= 4) return;

    setGreetingClicks((prev: number) => prev + 1);
    setShowGreetingPopup(true);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const checkConnectivity = async () => {
      if (!navigator.onLine) {
        if (isMounted) setIsOnline(false);
        return;
      }
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const res = await fetch(`/favicon.ico?_ping=${Date.now()}`, {
          method: 'HEAD',
          cache: 'no-store',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (isMounted) {
          setIsOnline(res.ok || res.status < 500);
        }
      } catch (err) {
        if (isMounted) {
          setIsOnline(false);
        }
      }
    };

    const handleOnline = () => {
      checkConnectivity();
    };
    const handleOffline = () => {
      if (isMounted) setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    checkConnectivity();

    // Check connectivity periodically every 15 seconds
    const interval = setInterval(checkConnectivity, 15000);

    return () => {
      isMounted = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const sectionColors: Record<string, string> = {
    dashboard: '#2563eb', // blue-600
    inventory: '#059669', // emerald-600
    sales: '#7c3aed', // violet-600
    accounts: '#0ea5e9', // sky-500
    history: '#d97706', // amber-600
    reports: '#e11d48', // rose-600
    expenses: '#ea580c', // orange-600
    purchases: '#0891b2', // cyan-600
    'market-list': '#f59e0b', // amber-500
    calendar: '#8b5cf6', // violet-500
    returns: '#10b981', // emerald-500
    payroll: '#f59e0b', // amber-500
    referrals: '#ec4899', // pink-500
    subscriptions: '#6366f1', // indigo-500
    invoices: '#6366f1', // indigo-500
    tutorials: '#10b981', // emerald-600
    settings: '#475569', // slate-600
    users: '#0891b2', // cyan-600
  };

  const activeColor = sectionColors[activeTab] || '#0f172a';

  const navItems = [
    { id: 'dashboard', label: t('overview'), icon: LayoutDashboard },
    { id: 'inventory', label: t('inventory'), icon: Package },
    { id: 'sales', label: t('newSale'), icon: ShoppingCart },
    { id: 'accounts', label: t('debtBook'), icon: Users },
    { id: 'history', label: t('history'), icon: History },
    { id: 'reports', label: t('reports'), icon: BarChart2 },
    { id: 'expenses', label: t('expenses'), icon: CreditCard },
    { id: 'invoices', label: t('invoices'), icon: FileText },
    { id: 'payroll', label: t('payroll'), icon: Banknote },
    { id: 'purchases', label: t('purchases'), icon: Truck },
    { id: 'market-list', label: t('marketOrders'), icon: ShoppingCart },
    { id: 'calendar', label: t('calendar'), icon: Calendar },
    { id: 'returns', label: t('returns'), icon: History },
    { id: 'referrals', label: t('referrals') || 'Refer & Earn', icon: Gift },
    { id: 'subscriptions', label: t('subscriptions') || 'Subscriptions', icon: Zap },
    { id: 'tutorials', label: t('tutorials'), icon: HelpCircle },
    { id: 'users', label: t('usersRoles'), icon: Users },
    { id: 'settings', label: t('settings'), icon: Settings },
  ];

  const isAdmin = user?.role === 'admin' || user?.role === 'store owner';

  const filteredNavItems = navItems.filter(item => 
    isAdmin || !user?.permissions || user.permissions.includes(item.id)
  );

  const handleNavClick = (id: string) => {
    setActiveTab(id);
    setIsMobileMenuOpen(false);
  };

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return t('goodMorning');
    if (hour < 17) return t('goodAfternoon');
    return t('goodEvening');
  };

  return (
    <div 
      className={cn("flex h-[100dvh] overflow-hidden overflow-x-hidden bg-brand-bg select-none touch-pan-y overscroll-none overscroll-x-none", isRTL && "font-arabic")}
      dir={isRTL ? 'rtl' : 'ltr'}
      style={{ 
        '--color-brand-accent': activeColor,
      } as React.CSSProperties}
    >
      <MedicalPattern />
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 z-[70] w-[85%] sm:w-72 border-brand-border/50 flex flex-col bg-brand-bg/80 backdrop-blur-xl transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 overflow-hidden",
        isRTL ? "right-0 border-l" : "left-0 border-r",
        isMobileMenuOpen 
          ? "translate-x-0" 
          : (isRTL ? "translate-x-full" : "-translate-x-full")
      )}>
        <MenuPattern />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none -z-10 overflow-hidden opacity-[0.4]">
          <Activity size={260} strokeWidth={1} className="text-brand-accent/20 -rotate-12" />
        </div>
        <div className="relative z-10 flex flex-col h-full bg-transparent">
          <div className="p-8 flex justify-between items-start">
          <div className="flex items-center gap-3 mb-1">
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-lg transition-colors duration-300 overflow-hidden"
              style={{ backgroundColor: activeColor, boxShadow: `0 4px 14px 0 ${activeColor}40` }}
            >
              {settings.storeLogo ? (
                <img src={settings.storeLogo} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <AppLogo size={20} className="text-white" />
              )}
            </div>
            <div className="flex flex-col">
              <h1 className="text-xl font-display font-bold tracking-tight text-brand-text truncate max-w-[160px]">{settings.storeName || 'Your Pharmacy'}</h1>
            </div>
          </div>
          <button 
            className="lg:hidden p-2 text-brand-text hover:bg-brand-bg rounded-lg"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 overflow-y-auto mt-4 pb-24 no-scrollbar">
          {filteredNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all group relative overflow-hidden",
                activeTab === item.id 
                  ? "bg-brand-accent/90 backdrop-blur-md text-white border border-white/20" 
                  : "text-brand-text hover:bg-brand-bg/50 hover:shadow-md"
              )}
              style={activeTab === item.id ? { 
                boxShadow: `0 0 20px ${activeColor}80, 0 0 40px ${activeColor}40`,
                backgroundColor: activeColor 
              } : {}}
            >
              {activeTab === item.id && (
                <motion.div 
                  className="absolute inset-0 bg-white/20"
                  initial={{ x: '-100%', skewX: -20 }}
                  animate={{ x: '200%', skewX: -20 }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear", repeatDelay: 3 }}
                />
              )}
              <motion.div
                animate={{ 
                  scale: activeTab === item.id ? 1.2 : 1,
                  color: activeTab === item.id ? '#ffffff' : undefined,
                  filter: activeTab === item.id ? `drop-shadow(0 0 8px rgba(255,255,255,0.8))` : 'none'
                }}
                whileHover={{ 
                  scale: 1.25,
                  color: activeTab === item.id ? '#ffffff' : sectionColors[item.id],
                  filter: `drop-shadow(0 0 8px ${sectionColors[item.id]}80)`
                }}
                whileTap={{ scale: 0.85 }}
                transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                className={cn("relative z-10", activeTab !== item.id && "text-brand-text dark:text-brand-text")}
              >
                <item.icon size={18} />
              </motion.div>
              <span className="relative z-10 font-display font-bold">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col min-w-0 bg-transparent relative no-scrollbar overscroll-none overscroll-x-none">
        <header className="h-16 lg:h-20 border-b border-brand-border/30 flex items-center justify-between px-4 lg:px-8 bg-brand-surface/60 backdrop-blur-xl sticky top-0 z-30 shrink-0 shadow-sm">
          <div className="flex items-center gap-4 flex-1">
            <button 
              className="lg:hidden p-2 text-brand-text bg-brand-bg/50 backdrop-blur-sm border border-brand-border hover:text-brand-accent hover:bg-brand-accent/10 rounded-xl transition-all"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu size={22} />
            </button>
            
            <div className="hidden lg:flex items-center gap-4">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-brand-muted uppercase tracking-[0.2em] leading-none mb-1">Current Session</span>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-2.5 py-1 bg-brand-bg/50 rounded-lg border border-brand-border/50">
                    <Calendar size={12} className="text-brand-accent" />
                    <span className="text-xs font-bold text-brand-text">
                      {currentTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 px-2.5 py-1 bg-brand-bg/50 rounded-lg border border-brand-border/50">
                    <motion.div
                      animate={{ opacity: [1, 0.5, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="w-1.5 h-1.5 rounded-full bg-brand-accent"
                    />
                    <span className="text-xs font-mono font-bold text-brand-text">
                      {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-center flex-1">
            <div className="flex items-center gap-2.5 group cursor-default">
              <div 
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-lg transition-all duration-500 group-hover:rotate-12"
                style={{ backgroundColor: activeColor, boxShadow: `0 8px 16px -4px ${activeColor}66` }}
              >
                <AppLogo size={22} className="text-white" />
              </div>
              <div className="flex flex-col leading-tight">
                <h1 className="text-xl font-display font-black tracking-tight text-brand-text">
                  Pharmacy Flow
                </h1>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold text-brand-accent/80 uppercase tracking-widest">Enterprise</span>
                  <div className="w-1 h-1 rounded-full bg-brand-border" />
                  <span className="text-[9px] font-bold text-brand-muted">v{APP_VERSION}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 lg:gap-5 flex-1">
            <div className="hidden sm:flex items-center gap-2">
              <button 
                onClick={toggleTheme}
                className="p-2 text-brand-text hover:bg-brand-bg rounded-xl border border-transparent hover:border-brand-border transition-all"
                title={theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
              >
                {theme === 'dark' ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} className="text-brand-accent" />}
              </button>
            </div>

            <div className="h-8 w-px bg-brand-border/50 hidden sm:block" />

            {isOnline ? (
              <div 
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full border border-emerald-500/20 transition-all shadow-sm"
                title="Internet connection active"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <Wifi size={13} className="hidden sm:inline shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-wider">{t('systemOnline') || 'System Online'}</span>
              </div>
            ) : (
              <div 
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-full border border-amber-500/30 transition-all shadow-sm"
                title="No internet connection. Pharmacy Flow is working offline with local database storage."
              >
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                <WifiOff size={13} className="text-amber-500 shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-wider">{t('workingOffline') || 'Working Offline'}</span>
              </div>
            )}
            
            <div 
              className="px-2.5 py-1 text-brand-text/80 bg-brand-bg/50 border border-brand-border/60 rounded-xl flex items-center gap-1.5"
              title="Full Administrative Access Active for Testing"
            >
              <div className="w-2 h-2 rounded-full bg-indigo-500" />
              <span className="text-[11px] font-bold hidden xl:inline">Admin Mode</span>
            </div>
          </div>
        </header>

        {/* Vertical Zoom Slider (Fixed Viewport Floating Control) */}
        {activeTab === 'dashboard' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: isZoomActive ? 1 : 0.3 }}
            onHoverStart={() => setIsZoomActive(true)}
            onClick={() => setIsZoomActive(true)}
            className="fixed right-3 sm:right-5 top-48 sm:top-56 z-50 flex flex-col items-center gap-2 p-1.5 bg-brand-surface/90 backdrop-blur-xl border border-brand-border rounded-xl shadow-2xl group transition-all hover:bg-brand-surface hover:opacity-100"
          >
            <button 
              onClick={(e) => { e.stopPropagation(); setAppZoom(Math.min(1.5, parseFloat((appZoom + 0.1).toFixed(2)))); setIsZoomActive(true); }}
              className="p-1 text-brand-muted hover:text-brand-accent hover:bg-brand-accent/10 rounded-lg transition-all"
              title="Zoom In"
            >
              <Plus size={14} strokeWidth={3} />
            </button>
            
            <div className="h-20 sm:h-24 flex items-center justify-center py-1">
              <input 
                type="range" 
                min="0.5" 
                max="1.5" 
                step="0.05" 
                value={appZoom} 
                onChange={(e) => { setAppZoom(parseFloat(e.target.value)); setIsZoomActive(true); }}
                className="w-1 h-20 sm:h-24 bg-brand-border rounded-lg appearance-none cursor-pointer accent-brand-accent"
                style={{ WebkitAppearance: 'slider-vertical' } as any}
              />
            </div>

            <button 
              onClick={(e) => { e.stopPropagation(); setAppZoom(Math.max(0.5, parseFloat((appZoom - 0.1).toFixed(2)))); setIsZoomActive(true); }}
              className="p-1 text-brand-muted hover:text-brand-accent hover:bg-brand-accent/10 rounded-lg transition-all"
              title="Zoom Out"
            >
              <Minus size={14} strokeWidth={3} />
            </button>

            <div className="pt-1.5 border-t border-brand-border w-full text-center">
              <button 
                onClick={(e) => { e.stopPropagation(); setAppZoom(1); setIsZoomActive(true); }}
                className="text-[8px] font-black text-brand-text hover:text-brand-accent transition-colors"
                title="Reset Zoom"
              >
                {Math.round(appZoom * 100)}%
              </button>
            </div>
          </motion.div>
        )}

        {/* Scrollable Content Container with Zoom and dynamic bottom clearance */}
        <div 
          className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full relative z-10 transition-[zoom] duration-150"
          style={{ 
            zoom: appZoom,
            paddingBottom: `max(180px, calc(220px / ${appZoom}))`,
            minHeight: `calc(100% / ${appZoom})`
          }}
        >

          {activeTab === 'dashboard' && (
            <div className="flex justify-center mb-8">
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-brand-surface border border-brand-border px-6 py-3 rounded-2xl shadow-sm flex items-center gap-6"
              >
                <div className="flex items-center gap-3 border-r border-brand-border pr-6">
                  <Calendar size={18} className="text-brand-accent" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Today's Date</span>
                    <span className="text-sm font-bold text-brand-text">
                      {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Clock size={18} className="text-brand-accent" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Current Time</span>
                    <span className="text-sm font-bold text-brand-text font-mono">
                      {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                </div>
              </motion.div>
            </div>
          )}

          {activeTab === 'dashboard' && (
            <div className="flex flex-col items-center text-center gap-8 mb-12 relative overflow-hidden py-10 rounded-[3rem]">
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none -z-10 opacity-50">
                <Activity size={500} strokeWidth={1} className="text-brand-accent/5 rotate-[30deg]" />
              </div>
              <div className="space-y-3 flex flex-col items-center">
                <div className="flex items-center gap-2 text-brand-accent mb-1">
                  <AppLogo size={14} className="text-brand-accent" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.3em]">{getGreetingType()} update</span>
                </div>
                <h2 
                  onClick={handleGreetingClick}
                  className="text-4xl md:text-5xl lg:text-6xl font-display font-black tracking-tight cursor-pointer transition-all hover:scale-105 active:scale-95"
                  style={{ color: activeColor }}
                >
                  {getGreeting()}
                </h2>
                <p 
                  onClick={handleTipClick}
                  className="text-brand-muted text-sm md:text-base font-medium max-w-2xl cursor-pointer hover:text-brand-accent transition-colors"
                >
                  {dailyTip}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-bold text-brand-muted uppercase tracking-widest mb-2">Active Store</span>
                  <div className="flex items-center gap-3 px-5 py-2.5 bg-brand-surface/80 backdrop-blur-sm border border-brand-border rounded-2xl shadow-lg">
                    <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: activeColor }} />
                    <span className="text-sm font-bold text-brand-text">{settings.storeName || 'Your Pharmacy'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className={cn(
            "bg-brand-surface/80 backdrop-blur-md rounded-[2rem] border border-brand-border/50 shadow-xl min-h-[600px] relative",
            activeTab === 'sales' ? "p-3 md:p-6 lg:p-8" : "p-6 md:p-8 lg:p-10",
            (activeTab !== 'dashboard' && activeTab !== 'sales') && "mt-4"
          )}>
            <div className="absolute top-0 right-0 w-64 h-64 bg-brand-accent/5 rounded-full -mr-32 -mt-32 blur-3xl" />
            <div className="relative z-20">
              {children}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none -z-10 overflow-hidden">
                <Activity size={400} strokeWidth={1} className="opacity-[0.08] dark:opacity-[0.1] text-brand-accent rotate-12" />
              </div>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {showGreetingPopup && (
            <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-10 bg-black/40 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-brand-surface rounded-[2rem] shadow-2xl border border-brand-border p-8 max-w-[calc(100%-1rem)] sm:max-w-md w-full relative overflow-hidden"
              >
                {/* Background Glow */}
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-brand-accent/10 blur-3xl rounded-full" />
                <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-brand-accent/10 blur-3xl rounded-full" />

                <div className="relative z-10 flex flex-col items-center text-center space-y-6">
                  <div className="w-16 h-16 bg-brand-accent/10 rounded-2xl flex items-center justify-center text-brand-accent">
                    <AppLogo size={40} className="text-brand-accent" />
                  </div>

                  <div className="space-y-4 w-full">
                    {greetingClicks === 1 && (
                      <motion.h3 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-xl font-bold text-brand-text capitalize"
                      >
                        Hope your {getGreetingType()} is going well
                      </motion.h3>
                    )}

                    {greetingClicks === 2 && (
                      <>
                        <motion.h3 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-xl font-bold text-brand-text"
                        >
                          Tip of the Day
                        </motion.h3>
                        <div className="relative min-h-[4rem] flex items-center justify-center overflow-hidden bg-brand-bg/50 rounded-xl border border-brand-border/50 px-6 py-4">
                          <motion.p
                            initial={{ x: '-100%', opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                            className="text-sm font-medium text-brand-text/80 italic text-center"
                          >
                            {dailyTip}
                          </motion.p>
                        </div>
                      </>
                    )}

                    {greetingClicks === 3 && (
                      <motion.h3 
                        initial={{ x: -50, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        className="text-xl font-bold text-brand-text"
                      >
                        Hope you are enjoying Pharmacy Flow Business App
                      </motion.h3>
                    )}

                    {greetingClicks === 4 && (
                      <motion.h3 
                        initial={{ x: 50, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        className="text-xl font-bold text-brand-text"
                      >
                        Do you know you can learn more about this app on the tutorial section?
                      </motion.h3>
                    )}
                  </div>

                  <button
                    onClick={() => setShowGreetingPopup(false)}
                    className="btn-primary w-full py-4 rounded-2xl shadow-lg shadow-brand-accent/20 hover:shadow-brand-accent/40 transition-all font-bold tracking-wide"
                  >
                    Got it!
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {showTipPopup && (
            <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-10 bg-black/40 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-brand-surface rounded-[2rem] shadow-2xl border border-brand-border p-8 max-w-md w-full relative overflow-hidden"
              >
                {/* Background Glow */}
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-brand-accent/10 blur-3xl rounded-full" />
                <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-brand-accent/10 blur-3xl rounded-full" />

                <div className="relative z-10 flex flex-col items-center text-center space-y-6">
                  <div className="w-16 h-16 bg-brand-accent/10 rounded-2xl flex items-center justify-center text-brand-accent">
                    <AppLogo size={40} className="text-brand-accent" />
                  </div>

                  <div className="space-y-4 w-full">
                    <motion.h3 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-xl font-bold text-brand-text"
                    >
                      Business Tip of the Moment
                    </motion.h3>
                    <div className="relative min-h-[4rem] flex items-center justify-center overflow-hidden bg-brand-bg/50 rounded-xl border border-brand-border/50 px-6 py-4">
                      <motion.p
                        initial={{ x: '-100%', opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                        className="text-sm font-medium text-brand-text/80 italic text-center"
                      >
                        {randomTip}
                      </motion.p>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowTipPopup(false)}
                    className="btn-primary w-full py-4 rounded-2xl shadow-lg shadow-brand-accent/20 hover:shadow-brand-accent/40 transition-all font-bold tracking-wide"
                  >
                    Got it!
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Bottom Navigation (Mobile) */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-[60] bg-brand-bg/90 backdrop-blur-xl border-t border-brand-border/50 flex justify-around items-center pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(0,0,0,0.1)]">
          {filteredNavItems.slice(0, 4).map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={cn(
                "flex flex-col items-center justify-center w-full py-3 space-y-1 transition-all duration-300 group relative overflow-hidden",
                activeTab === item.id ? "text-brand-accent" : "text-brand-text/70 hover:text-brand-text dark:text-brand-text/90 dark:hover:text-brand-text"
              )}
            >
              {activeTab === item.id && (
                <>
                  <motion.div 
                    layoutId="active-nav-indicator"
                    className="absolute inset-0 bg-brand-accent/10 dark:bg-brand-accent/20 rounded-xl backdrop-blur-sm border border-brand-accent/20"
                    initial={false}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                  <div className="absolute inset-0 bg-white/30 -translate-x-full animate-[shimmer_2s_infinite] skew-x-[-20deg]" />
                </>
              )}
              <motion.div
                animate={{ 
                  scale: activeTab === item.id ? 1.5 : 1,
                  y: activeTab === item.id ? -8 : 0,
                  color: activeTab === item.id ? (theme === 'dark' ? '#ffffff' : activeColor) : undefined,
                  filter: activeTab === item.id ? `drop-shadow(0 8px 16px ${activeColor}80)` : 'drop-shadow(0 0px 0px rgba(0,0,0,0))'
                }}
                whileHover={{ 
                  scale: activeTab === item.id ? 1.5 : 1.3,
                  y: activeTab === item.id ? -8 : -4,
                  color: sectionColors[item.id],
                  filter: `drop-shadow(0 8px 16px ${sectionColors[item.id]}80)`
                }}
                whileTap={{ scale: 0.7, y: 4 }}
                transition={{ type: 'spring', stiffness: 500, damping: 10, mass: 1 }}
                className={cn("relative z-10", activeTab !== item.id && "text-brand-muted")}
              >
                <item.icon size={20} />
              </motion.div>
              <motion.span 
                animate={{
                  opacity: activeTab === item.id ? 1 : 0.8,
                  scale: activeTab === item.id ? 1.05 : 1,
                  fontWeight: activeTab === item.id ? 800 : 600
                }}
                className={cn("text-[10px] relative z-10", activeTab !== item.id && "text-brand-muted")}
              >
                {item.label}
              </motion.span>
            </button>
          ))}
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="flex flex-col items-center justify-center w-full py-3 space-y-1 text-brand-text hover:text-brand-text dark:text-brand-text dark:hover:text-brand-text transition-all duration-300 group relative overflow-hidden"
          >
            {isMobileMenuOpen && (
              <div className="absolute inset-0 bg-white/30 -translate-x-full animate-[shimmer_2s_infinite] skew-x-[-20deg]" />
            )}
            <motion.div
              animate={{ 
                scale: isMobileMenuOpen ? 1.5 : 1,
                y: isMobileMenuOpen ? -8 : 0,
                filter: isMobileMenuOpen ? 'drop-shadow(0 8px 16px rgba(71,85,105,0.8))' : 'drop-shadow(0 0px 0px rgba(0,0,0,0))'
              }}
              whileHover={{ 
                scale: 1.3,
                y: -4,
                color: '#475569',
                filter: 'drop-shadow(0 8px 16px rgba(71,85,105,0.8))'
              }}
              whileTap={{ scale: 0.7, y: 4 }}
              transition={{ type: 'spring', stiffness: 500, damping: 10, mass: 1 }}
              className="relative z-10"
            >
              <Menu size={20} />
            </motion.div>
            <span className="text-[10px] font-bold relative z-10">More</span>
          </button>
        </nav>
      </main>
    </div>
  );
}
