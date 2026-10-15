import React, { useState, useEffect } from 'react';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useLanguage, Language } from '../context/LanguageContext';
import { apiFetch } from '../lib/api';
import { getDB, importDB } from '../lib/db';
import jsPDF from 'jspdf';
import { printerService } from '../services/printerService';
import CurrencyInput from './CurrencyInput';
import { Globe, DollarSign, Store, Shield, Bell, ChevronDown, ChevronUp, Layers, Plus, Minus, Trash2, X, AlertTriangle, Printer, Search, Database, Download, Upload, Camera, CreditCard, Wallet, Banknote, UserPlus, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { v4 as uuidv4 } from 'uuid';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { APP_VERSION, LAST_UPDATED } from '../version';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CollapsibleSectionProps {
  title: string;
  subtitle: string;
  icon: React.ElementType;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  color?: string;
}

function CollapsibleSection({ 
  title, 
  subtitle, 
  icon: Icon, 
  isOpen, 
  onToggle, 
  children, 
  disabled = false,
  color = '#0f172a'
}: CollapsibleSectionProps) {
  return (
    <div className={cn(
      "card overflow-hidden transition-all duration-300",
      disabled ? "opacity-60 grayscale pointer-events-none border-dashed" : "hover:border-brand-accent/30"
    )}>
      <button 
        onClick={onToggle}
        className="w-full flex items-center justify-between p-2 text-left group"
      >
        <div className="flex items-center gap-4">
          <div 
            className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
              isOpen ? "text-white" : "bg-brand-bg group-hover:bg-brand-accent/10"
            )}
            style={isOpen ? { backgroundColor: color } : { color: color }}
          >
            <Icon size={22} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-brand-text">{title}</h3>
            <p className="text-xs text-brand-muted">{subtitle}</p>
          </div>
        </div>
        <div 
          className={cn(
            "p-2 rounded-xl transition-colors",
            isOpen ? "bg-brand-bg" : "text-brand-muted group-hover:bg-brand-bg"
          )}
          style={isOpen ? { color: color } : {}}
        >
          {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <div className="px-2 pb-6 pt-8 border-t border-brand-border mt-6">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Settings({ 
  onDirtyChange, 
  triggerSave, 
  onSaveComplete 
}: { 
  onDirtyChange?: (dirty: boolean, sectionName?: string) => void;
  triggerSave?: boolean;
  onSaveComplete?: () => void;
}) {
  const { settings, updateSettings, resetSettings, playSound } = useSettings();
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const { t, language, setLanguage, isRTL } = useLanguage();
  const [isSaving, setIsSaving] = useState(false);
  const [localSettings, setLocalSettings] = useState(settings);
  const [openSection, setOpenSection] = useState<string | null>('store-info');
  const [categories, setCategories] = useState(Array.isArray(settings.categories) ? settings.categories : []);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSubcategoryName, setNewSubcategoryName] = useState<{ [key: string]: string }>({});
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [dirtySectionName, setDirtySectionName] = useState('');
  const [pendingSection, setPendingSection] = useState<string | null>(null);
  const [showInternalConfirm, setShowInternalConfirm] = useState(false);

  useEffect(() => {
    const isSettingsChanged = JSON.stringify(localSettings) !== JSON.stringify(settings);
    const isCategoriesChanged = JSON.stringify(categories) !== JSON.stringify(settings.categories);
    const dirty = isSettingsChanged || isCategoriesChanged;
    setHasUnsavedChanges(dirty);
    
    let dirtySection = '';
    if (dirty) {
      if (isCategoriesChanged) dirtySection = 'Categories';
      else if (localSettings.storeName !== settings.storeName || localSettings.phoneNumber !== settings.phoneNumber || localSettings.storeAddress !== settings.storeAddress) dirtySection = 'Store Information';
      else if (localSettings.currency !== settings.currency) dirtySection = 'Localization';
      else if (localSettings.taxType !== settings.taxType || localSettings.taxValue !== settings.taxValue) dirtySection = 'Tax Settings';
      else if (localSettings.lowStockAlerts !== settings.lowStockAlerts || localSettings.lowStockThreshold !== settings.lowStockThreshold || localSettings.soundVolume !== settings.soundVolume) dirtySection = 'Notifications';
      else if (localSettings.printMethod !== settings.printMethod || localSettings.paperSize !== settings.paperSize || localSettings.printBehavior !== settings.printBehavior || localSettings.printAccountName !== settings.printAccountName || localSettings.includeCustomerName !== settings.includeCustomerName) dirtySection = 'Printing & Receipts';
      else if (localSettings.debtLimitType !== settings.debtLimitType || localSettings.debtLimitAmount !== settings.debtLimitAmount || localSettings.allowSplitPayments !== settings.allowSplitPayments) dirtySection = 'Business Rules';
      else dirtySection = 'Settings';
    }
    setDirtySectionName(dirtySection);

    if (onDirtyChange) onDirtyChange(dirty, dirtySection);
  }, [localSettings, categories, settings, onDirtyChange]);

  useEffect(() => {
    if (triggerSave) {
      handleSaveAll().then((success) => {
        if (success && onSaveComplete) onSaveComplete();
      });
    }
  }, [triggerSave]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  const [search, setSearch] = useState('');
  const [isBluetoothAvailable, setIsBluetoothAvailable] = useState<boolean | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    const checkBluetooth = async () => {
      if (!printerService.isSupported()) {
        setIsBluetoothAvailable(false);
        return;
      }

      setIsBluetoothAvailable(true);
      try {
        // Just try an initial scan to populate the list if possible
        const devices = await printerService.scanBluetoothDevices();
        const printerList = devices.map(d => ({ id: d.address, name: d.name }));
        setLocalSettings(prev => ({
          ...prev,
          pairedPrinters: printerList
        }));
      } catch (e) {
        console.warn('Initial Bluetooth scan failed (might be off):', e);
        // We don't set it to false here, because it IS supported, just currently failing
      }
    };
    checkBluetooth();
  }, []);

  const handleConnectPrinter = async () => {
    try {
      setIsConnecting(true);
      
      console.log('Settings: isBluetoothAvailable:', isBluetoothAvailable);
      console.log('Settings: isSupported:', printerService.isSupported());

      if (!printerService.isSupported()) {
        showNotification('error', 'Bluetooth printing is not supported on this platform.');
        return;
      }

      showNotification('info', 'Scanning for Bluetooth printers... results in 5 seconds.');
      
      const devices = await printerService.scanBluetoothDevices();
      console.log('Settings: Found devices:', devices.length);
      
      const printerList = devices.map(d => ({ id: d.address, name: d.name }));
      
      if (devices.length === 0) {
        setLocalSettings(prev => ({ ...prev, pairedPrinters: [] }));
        showNotification('info', 'No Bluetooth printers found. Ensure your printer is ON, PAIRED in Android Settings, and Location Services are ENABLED on your phone.');
        return;
      }

      setLocalSettings(prev => {
        const nextSettings = { ...prev, pairedPrinters: printerList };
        // If no default is set, or current default is not in the new list, pick the first one
        if (!nextSettings.defaultPrinterId || !printerList.find(p => p.id === nextSettings.defaultPrinterId)) {
          const firstPrinter = printerList[0];
          nextSettings.defaultPrinterId = firstPrinter.id;
          nextSettings.defaultPrinterName = firstPrinter.name;
          nextSettings.printMethod = 'bluetooth';
          
          // Connect to this new default
          printerService.connect(firstPrinter.id).catch(e => console.error('Auto-connect failed:', e));
        }
        return nextSettings;
      });
      showNotification('success', `Found ${devices.length} Bluetooth devices. ${localSettings.defaultPrinterId ? '' : 'Default printer updated.'}`);
    } catch (err: any) {
      console.error('Settings: handleConnectPrinter error:', err);
      showNotification('error', err.message || 'Failed to scan for printers. Make sure Bluetooth and Location are ON.');
    } finally {
      setIsConnecting(false);
    }
  };

  const [showConfirm, setShowConfirm] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  useEffect(() => {
    setLocalSettings(settings);
    setCategories(Array.isArray(settings.categories) ? settings.categories : []);
  }, [settings]);

  useEffect(() => {
    if (openSection === 'notifications' && settings.lowStockAlerts) {
      apiFetch('/api/products')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            const lowStock = data.filter((p: any) => p.stock <= p.minStock);
            setLowStockProducts(lowStock);
          }
        });
    }
  }, [openSection, settings.lowStockAlerts]);

  const handleLocalBackup = async () => {
    try {
      const sqlite = await getDB();
      const data = sqlite.export();
      const blob = new Blob([data], { type: 'application/x-sqlite3' });
      const fileName = `store_backup_${new Date().toISOString().split('T')[0]}.db`;

      const { saveFile } = await import('../utils/fileSaver');
      await saveFile(fileName, blob, 'application/x-sqlite3');
      
      playSound('success');
      showNotification('success', 'Backup saved successfully to your device.');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error(err);
        playSound('alert');
        showNotification('error', 'Failed to save backup.');
      }
    }
  };

  const handleLocalRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setShowConfirm({
      show: true,
      title: 'Restore from Local File',
      message: 'Are you sure you want to restore this backup? All current data will be lost.',
      onConfirm: async () => {
        try {
          setIsSaving(true);
          const arrayBuffer = await file.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          
          const { migrationsPerformed } = await importDB(uint8Array);
          
          playSound('success');
          const message = migrationsPerformed 
            ? 'Database restored successfully. New fields and tables have also been updated successfully. The page will reload.' 
            : 'Database restored successfully. The page will reload.';
          showNotification('success', message);
          setTimeout(() => window.location.reload(), 2000);
        } catch (err: any) {
          console.error(err);
          playSound('alert');
          showNotification('error', err.message || 'An error occurred during restore.');
        } finally {
          setIsSaving(false);
          setShowConfirm(prev => ({ ...prev, show: false }));
        }
      }
    });
  };

  const handleSaveAll = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    try {
      await updateSettings({ 
        ...localSettings,
        categories 
      });
      playSound('success');
      showNotification('success', 'Settings saved successfully');
      return true;
    } catch (error) {
      playSound('alert');
      showNotification('error', 'Failed to save settings');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSectionToggle = (sectionId: string | null) => {
    if (hasUnsavedChanges && sectionId !== openSection && sectionId !== null) {
      setPendingSection(sectionId);
      setShowInternalConfirm(true);
    } else {
      setOpenSection(sectionId);
    }
  };

  const handleSaveCategories = async () => {
    await handleSaveAll();
  };

  const handleSaveStoreInfo = async (e: React.FormEvent) => {
    await handleSaveAll(e);
  };

  const addCategory = () => {
    if (!newCategoryName.trim()) return;
    setCategories([...categories, { id: uuidv4(), name: newCategoryName.trim(), subcategories: [] }]);
    setNewCategoryName('');
  };

  const removeCategory = (id: string) => {
    setCategories(categories.filter(c => c.id !== id));
  };

  const addSubcategory = (categoryId: string) => {
    const subName = newSubcategoryName[categoryId]?.trim();
    if (!subName) return;
    
    setCategories(categories.map(c => {
      if (c.id === categoryId && !c.subcategories.includes(subName)) {
        return { ...c, subcategories: [...c.subcategories, subName] };
      }
      return c;
    }));
    setNewSubcategoryName({ ...newSubcategoryName, [categoryId]: '' });
  };

  const removeSubcategory = (categoryId: string, subName: string) => {
    setCategories(categories.map(c => {
      if (c.id === categoryId) {
        return { ...c, subcategories: c.subcategories.filter(s => s !== subName) };
      }
      return c;
    }));
  };

  const currencies = [
    { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
    { code: 'GHS', symbol: '₵', name: 'Ghanaian Cedi' },
    { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
  ];

  const handleCurrencyChange = async (code: string) => {
    const selected = currencies.find(c => c.code === code);
    if (selected) {
      setLocalSettings({ 
        ...localSettings,
        currency: selected.code, 
        currencySymbol: selected.symbol 
      });
    }
  };

  const scrollToSection = (sectionId: string) => {
    if (hasUnsavedChanges && sectionId !== openSection) {
      setPendingSection(sectionId);
      setShowInternalConfirm(true);
    } else {
      setOpenSection(sectionId);
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const isAdmin = user?.role === 'admin' || user?.role === 'store owner';

  const sections = [
    { id: 'store-info', label: t('pharmacyInfo'), icon: Store, color: '#3b82f6', keywords: 'name, phone, address, logo, bank, account, receipt, pharmacy' },
    { id: 'categories', label: t('inventoryInfo'), icon: Layers, color: '#10b981', keywords: 'category, subcategory, scanner, camera, barcode, price, retail' },
    { id: 'localization', label: t('localization'), icon: Globe, color: '#8b5cf6', keywords: 'currency, symbol, money, region' },
    { id: 'language', label: t('language'), icon: Globe, color: '#f59e0b', keywords: 'lang, english, french, arabic, swahili, portuguese, hausa' },
    { id: 'tax', label: t('taxSettings'), icon: DollarSign, color: '#f59e0b', keywords: 'vat, tax, percentage, inclusive, exclusive' },
    { id: 'notifications', label: t('notifications'), icon: Bell, color: '#f43f5e', keywords: 'alert, stock, low, threshold, sound, volume' },
    { id: 'printing', label: t('printing'), icon: Printer, color: '#0ea5e9', keywords: 'receipt, printer, paper, size, bluetooth, thermal' },
    { id: 'business-rules', label: t('businessRules'), icon: Shield, color: '#f43f5e', keywords: 'debt, limit, split, payment, credit' },
    ...(isAdmin ? [{ id: 'database', label: t('database'), icon: Database, color: '#8b5cf6', keywords: 'backup, restore, local, export, import' }] : []),
  ];

  const filteredSections = sections.filter(s => {
    const searchLower = search.toLowerCase();
    return s.label.toLowerCase().includes(searchLower) || 
           s.keywords.toLowerCase().includes(searchLower);
  });

  const languages: { code: Language; name: string; flag: string }[] = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'ar', name: 'العربية', flag: '🇸🇦' },
    { code: 'sw', name: 'Kiswahili', flag: '🇰🇪' },
    { code: 'pt', name: 'Português', flag: '🇵🇹' },
    { code: 'ha', name: 'Hausa', flag: '🇳🇬' },
  ];

  return (
    <div className={cn("space-y-6 md:space-y-10 pb-20", isRTL && "font-arabic")}>
      <div className="flex flex-col items-center text-center gap-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-brand-text">Settings</h2>
          <p className="text-sm text-brand-muted mt-1">Configure your store environment and business rules</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full">
          <div className="relative w-full sm:w-80">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
            <input 
              type="text" 
              placeholder="Search settings..." 
              className="input-field pl-9 py-2 text-sm w-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold text-brand-muted uppercase tracking-widest bg-brand-bg px-4 py-2 rounded-full border border-brand-border w-fit whitespace-nowrap">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            System Online
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
        {/* Sidebar Navigator */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-28 space-y-8">
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold text-brand-muted uppercase tracking-widest px-4">Navigation</h4>
              <div className="space-y-1">
                {filteredSections.map((item) => (
                  <button 
                    key={item.id}
                    onClick={() => scrollToSection(item.id)}
                    style={openSection === item.id ? { backgroundColor: item.color, color: 'white', boxShadow: `0 10px 15px -3px ${item.color}33` } : {}}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all group",
                      openSection === item.id 
                        ? "font-bold scale-[1.02]" 
                        : "text-brand-muted hover:bg-brand-surface hover:text-brand-text hover:shadow-sm"
                    )}
                  >
                    <item.icon size={18} className={cn(
                      "transition-transform group-hover:scale-110",
                      openSection === item.id ? "text-white" : "text-brand-muted"
                    )} />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Settings Content - Cascading Accordions */}
        <div className="lg:col-span-3 space-y-6">
          {/* Store Information */}
          {filteredSections.some(s => s.id === 'store-info') && (
          <div id="store-info">
            <CollapsibleSection
              title={t('pharmacyInfo')}
              subtitle={t('pharmacyInfoSubtitle')}
              icon={Store}
              color="#3b82f6"
              isOpen={openSection === 'store-info'}
              onToggle={() => handleSectionToggle(openSection === 'store-info' ? null : 'store-info')}
            >
              <form onSubmit={handleSaveStoreInfo} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Pharmacy Name</label>
                    <input 
                      type="text"
                      className="input-field disabled:opacity-75 disabled:bg-brand-bg/50 disabled:cursor-not-allowed"
                      value={localSettings.storeName ?? ''}
                      onChange={(e) => setLocalSettings({ ...localSettings, storeName: e.target.value })}
                      disabled={true}
                      title="Pharmacy name cannot be changed after setup."
                    />
                    <p className="text-[10px] text-brand-muted">Pharmacy name cannot be changed.</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Phone Number</label>
                    <input 
                      type="text"
                      className="input-field"
                      value={localSettings.phoneNumber ?? ''}
                      onChange={(e) => setLocalSettings({ ...localSettings, phoneNumber: e.target.value })}
                      disabled={isSaving}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Pharmacy Email</label>
                    <input 
                      type="email"
                      className="input-field"
                      value={localSettings.storeEmail ?? ''}
                      onChange={(e) => setLocalSettings({ ...localSettings, storeEmail: e.target.value })}
                      disabled={isSaving}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Pharmacy Logo</label>
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-brand-border flex items-center justify-center overflow-hidden bg-brand-bg group relative">
                        {localSettings.storeLogo ? (
                          <>
                            <img src={localSettings.storeLogo} alt="Pharmacy Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                            <button 
                              type="button"
                              onClick={() => setLocalSettings({ ...localSettings, storeLogo: '' })}
                              className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                            >
                              <X size={20} />
                            </button>
                          </>
                        ) : (
                          <Upload size={24} className="text-brand-muted" />
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <input 
                          type="file" 
                          id="logo-upload" 
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setLocalSettings({ ...localSettings, storeLogo: reader.result as string });
                            };
                            reader.readAsDataURL(file);
                          }}
                        />
                        <label 
                          htmlFor="logo-upload"
                          className="px-4 py-2 bg-brand-bg border border-brand-border text-brand-text text-xs font-bold rounded-xl hover:bg-brand-surface transition-colors cursor-pointer inline-flex items-center gap-2"
                        >
                          <Upload size={14} />
                          Upload Logo
                        </label>
                        <p className="text-[10px] text-brand-muted">Recommended: Square PNG/JPG, max 500KB</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Pharmacy Account Details</label>
                    <div className="space-y-3">
                      <input 
                        type="text"
                        placeholder="Bank Name"
                        className="input-field py-2 text-sm"
                        value={localSettings.bankName ?? ''}
                        onChange={(e) => setLocalSettings({ ...localSettings, bankName: e.target.value })}
                        disabled={isSaving}
                      />
                      <input 
                        type="text"
                        placeholder="Account Name"
                        className="input-field py-2 text-sm"
                        value={localSettings.accountName ?? ''}
                        onChange={(e) => setLocalSettings({ ...localSettings, accountName: e.target.value })}
                        disabled={isSaving}
                      />
                      <input 
                        type="text"
                        placeholder="Account Number"
                        className="input-field py-2 text-sm"
                        value={localSettings.accountNumber ?? ''}
                        onChange={(e) => setLocalSettings({ ...localSettings, accountNumber: e.target.value })}
                        disabled={isSaving}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Pharmacy Address</label>
                  <input 
                    type="text"
                    className="input-field"
                    placeholder="e.g. 123 Health St, City, Country"
                    value={localSettings.storeAddress ?? ''}
                    onChange={(e) => setLocalSettings({ ...localSettings, storeAddress: e.target.value })}
                    disabled={isSaving}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Receipt Message</label>
                  <textarea 
                    className="input-field min-h-[100px] py-3"
                    placeholder="e.g. Thank you for shopping with us!"
                    value={localSettings.receiptMessage ?? ''}
                    onChange={(e) => setLocalSettings({ ...localSettings, receiptMessage: e.target.value })}
                    disabled={isSaving}
                  />
                </div>
                <div className="flex justify-end">
                  <button 
                    type="submit" 
                    disabled={isSaving}
                    className={cn(
                      "btn-primary px-10 transition-all duration-300",
                      hasUnsavedChanges ? "bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-200" : ""
                    )}
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </CollapsibleSection>
          </div>
          )}

          {/* Inventory Info */}
          {filteredSections.some(s => s.id === 'categories') && (
          <div id="categories">
            <CollapsibleSection
              title={t('inventoryInfo')}
              subtitle={t('inventoryInfoSubtitle')}
              icon={Layers}
              color="#10b981"
              isOpen={openSection === 'categories'}
              onToggle={() => handleSectionToggle(openSection === 'categories' ? null : 'categories')}
            >
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Scanner Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setLocalSettings({ ...localSettings, scannerType: 'camera' })}
                      className={cn(
                        "px-4 py-3 rounded-xl border text-sm font-bold transition-all flex items-center justify-center gap-2",
                        localSettings.scannerType === 'camera' 
                          ? "bg-brand-accent text-white border-brand-accent" 
                          : "bg-brand-bg text-brand-muted border-brand-border hover:border-brand-muted"
                      )}
                    >
                      <Camera size={18} />
                      Camera
                    </button>
                    <button
                      onClick={() => setLocalSettings({ ...localSettings, scannerType: 'barcode' })}
                      className={cn(
                        "px-4 py-3 rounded-xl border text-sm font-bold transition-all flex items-center justify-center gap-2",
                        localSettings.scannerType === 'barcode' 
                          ? "bg-brand-accent text-white border-brand-accent" 
                          : "bg-brand-bg text-brand-muted border-brand-border hover:border-brand-muted"
                      )}
                    >
                      <Search size={18} />
                      External Scanner
                    </button>
                  </div>
                  <p className="text-[10px] text-brand-muted mt-1">
                    {localSettings.scannerType === 'camera' 
                      ? "Uses your device's camera to scan barcodes." 
                      : "Optimized for hardware USB/Bluetooth barcode scanners."}
                  </p>
                </div>

                <div className="flex gap-2">
                  <input 
                    type="text"
                    className="input-field flex-1"
                    placeholder="New Category Name"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                    disabled={isSaving}
                  />
                  <button 
                    onClick={addCategory}
                    disabled={isSaving || !newCategoryName.trim()}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Plus size={18} /> Add
                  </button>
                </div>

                <div className="space-y-4">
                  {categories.map(category => (
                    <div key={category.id} className="border border-brand-border rounded-xl p-4 bg-brand-bg/50">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-bold text-brand-text">{category.name}</h4>
                        <button 
                          onClick={() => removeCategory(category.id)}
                          className="text-red-500 hover:text-red-600 p-1"
                          title="Remove Category"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                      
                      <div className="flex flex-wrap gap-2 mb-4">
                        {category.subcategories.map(sub => (
                          <div key={sub} className="flex items-center gap-1 bg-brand-surface border border-brand-border px-3 py-1 rounded-full text-sm">
                            <span>{sub}</span>
                            <button 
                              onClick={() => removeSubcategory(category.id, sub)}
                              className="text-brand-muted hover:text-red-500 ml-1"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <input 
                          type="text"
                          className="input-field py-1.5 text-sm flex-1"
                          placeholder="Add subcategory..."
                          value={newSubcategoryName[category.id] || ''}
                          onChange={(e) => setNewSubcategoryName({ ...newSubcategoryName, [category.id]: e.target.value })}
                          onKeyDown={(e) => e.key === 'Enter' && addSubcategory(category.id)}
                          disabled={isSaving}
                        />
                        <button 
                          onClick={() => addSubcategory(category.id)}
                          disabled={isSaving || !newSubcategoryName[category.id]?.trim()}
                          className="btn-secondary py-1.5 px-3 text-sm flex items-center gap-1"
                        >
                          <Plus size={16} /> Add
                        </button>
                      </div>
                    </div>
                  ))}
                  {categories.length === 0 && (
                    <div className="text-center py-6 text-brand-muted text-sm">
                      No categories added yet. Add one above.
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-4 border-t border-brand-border">
                  <button 
                    onClick={handleSaveCategories}
                    disabled={isSaving}
                    className={cn(
                      "btn-primary px-10 transition-all duration-300",
                      hasUnsavedChanges ? "bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-200" : ""
                    )}
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </CollapsibleSection>
          </div>
          )}

          {/* Localization */}
          {filteredSections.some(s => s.id === 'localization') && (
          <div id="localization">
            <CollapsibleSection
              title={t('localization')}
              subtitle={t('localizationSubtitle')}
              icon={Globe}
              color="#8b5cf6"
              isOpen={openSection === 'localization'}
              onToggle={() => handleSectionToggle(openSection === 'localization' ? null : 'localization')}
            >
              <div className="space-y-6">
                <div className="space-y-4">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Store Currency</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {currencies.map(c => (
                      <button
                        key={c.code}
                        onClick={() => handleCurrencyChange(c.code)}
                        disabled={isSaving}
                        className={cn(
                          "px-3 py-2 rounded-xl border text-xs font-bold transition-all flex flex-col items-center gap-1",
                          localSettings.currency === c.code 
                            ? "bg-brand-accent text-white border-brand-accent shadow-lg shadow-brand-accent/20" 
                            : "bg-brand-bg text-brand-text border-brand-border hover:border-brand-accent/50"
                        )}
                      >
                        <span className="text-lg">{c.symbol}</span>
                        <span>{c.code}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-brand-muted mt-2">
                    The selected currency will be used for all pricing and reports across the system.
                  </p>
                </div>

                <div className="flex justify-end pt-4 border-t border-brand-border">
                  <button 
                    onClick={() => handleSaveAll()}
                    disabled={isSaving}
                    className={cn(
                      "btn-primary px-10 transition-all duration-300",
                      hasUnsavedChanges ? "bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-200" : ""
                    )}
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </CollapsibleSection>
          </div>
          )}

          {/* Language */}
          {filteredSections.some(s => s.id === 'language') && (
          <div id="language">
            <CollapsibleSection
              title={t('language')}
              subtitle={t('languageDesc')}
              icon={Globe}
              color="#f59e0b"
              isOpen={openSection === 'language'}
              onToggle={() => handleSectionToggle(openSection === 'language' ? null : 'language')}
            >
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => setLanguage(lang.code)}
                      className={cn(
                        "flex items-center justify-start px-4 py-3 rounded-2xl border-2 transition-all group w-full",
                        language === lang.code 
                          ? "bg-brand-accent/10 border-brand-accent text-brand-accent shadow-md" 
                          : "bg-brand-bg dark:bg-brand-surface/50 border-brand-border hover:border-brand-accent/50 text-brand-text"
                      )}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <span className="text-2xl group-hover:scale-125 transition-transform">{lang.flag}</span>
                        <span className="font-bold text-sm text-left">{lang.name}</span>
                      </div>
                      {language === lang.code && (
                        <div className="w-2 h-2 rounded-full bg-brand-accent animate-pulse shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
                
                <div className="p-4 bg-brand-accent/5 rounded-2xl border border-brand-accent/10 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-brand-accent/10 flex items-center justify-center text-brand-accent shrink-0">
                    <Info size={18} />
                  </div>
                  <p className="text-xs text-brand-accent font-medium leading-relaxed">
                    Changing the language will update all interface labels, messages, and reports throughout the application.
                  </p>
                </div>
              </div>
            </CollapsibleSection>
          </div>
          )}

          {/* Tax Settings */}
          {filteredSections.some(s => s.id === 'tax') && (
          <div id="tax">
            <CollapsibleSection
              title={t('taxSettings')}
              subtitle={t('taxSettingsSubtitle')}
              icon={DollarSign}
              color="#f59e0b"
              isOpen={openSection === 'tax'}
              onToggle={() => handleSectionToggle(openSection === 'tax' ? null : 'tax')}
            >
              <div className="space-y-6">
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-brand-text uppercase tracking-wider">Tax Configuration</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Tax Type</label>
                      <select 
                        className="input-field appearance-none"
                        value={localSettings.taxType ?? 'none'}
                        onChange={(e) => setLocalSettings({ ...localSettings, taxType: e.target.value as any })}
                        disabled={isSaving}
                      >
                        <option value="none">No Tax</option>
                        <option value="percentage">Percentage (%)</option>
                        <option value="fixed">Fixed Amount</option>
                      </select>
                    </div>
                    
                    {(localSettings.taxType && localSettings.taxType !== 'none') && (
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">
                          Tax Value {localSettings.taxType === 'percentage' ? '(%)' : `(${settings.currencySymbol})`}
                        </label>
                        <CurrencyInput
                          value={localSettings.taxValue ?? 0}
                          onChange={val => setLocalSettings({ ...localSettings, taxValue: val === '' ? 0 : Number(val) })}
                          disabled={isSaving}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-brand-border">
                  <button 
                    onClick={() => handleSaveAll()}
                    disabled={isSaving}
                    className={cn(
                      "btn-primary px-10 transition-all duration-300",
                      hasUnsavedChanges ? "bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-200" : ""
                    )}
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </CollapsibleSection>
          </div>
          )}

          {/* Notifications */}
          {filteredSections.some(s => s.id === 'notifications') && (
          <div id="notifications">
            <CollapsibleSection
              title={t('notifications')}
              subtitle={t('notificationsSubtitle')}
              icon={Bell}
              color="#f43f5e"
              isOpen={openSection === 'notifications'}
              onToggle={() => handleSectionToggle(openSection === 'notifications' ? null : 'notifications')}
            >
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 border border-brand-border rounded-xl">
                  <div>
                    <h4 className="font-bold text-brand-text">Low Stock Alerts</h4>
                    <p className="text-xs text-brand-muted mt-1">Receive notifications when product inventory falls below threshold</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={localSettings.lowStockAlerts ?? true}
                      onChange={(e) => setLocalSettings({ ...localSettings, lowStockAlerts: e.target.checked })}
                      disabled={isSaving}
                    />
                    <div className="w-11 h-6 bg-brand-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-accent"></div>
                  </label>
                </div>

                <div className={cn("space-y-2 transition-opacity", !(localSettings.lowStockAlerts ?? true) && "opacity-50 pointer-events-none")}>
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Default Low Stock Threshold</label>
                  <CurrencyInput
                    value={localSettings.lowStockThreshold ?? 5}
                    onChange={val => setLocalSettings({ ...localSettings, lowStockThreshold: val === '' ? 0 : Number(val) })}
                    disabled={isSaving || !(localSettings.lowStockAlerts ?? true)}
                  />
                  <p className="text-[11px] text-brand-muted mt-2">
                    Default minimum stock level for new products. You can override this per product.
                  </p>
                </div>

                {settings.lowStockAlerts && (
                  <div className="mt-6 pt-6 border-t border-brand-border">
                    <div className="flex items-center gap-2 mb-4">
                      <AlertTriangle size={18} className="text-amber-500" />
                      <h4 className="font-bold text-brand-text">Current Low Stock Alerts</h4>
                    </div>
                    {lowStockProducts.length > 0 ? (
                      <div className="space-y-3">
                        {lowStockProducts.map(product => (
                          <div key={product.id} className="flex items-center justify-between p-3 bg-amber-50 border border-amber-100 rounded-xl">
                            <div>
                              <p className="font-medium text-amber-900">{product.name}</p>
                              <p className="text-xs text-amber-700">SKU: {product.sku}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-amber-600">{product.stock} in stock</p>
                              <p className="text-xs text-amber-700">Threshold: {product.minStock}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-center">
                        <p className="text-sm font-medium text-emerald-700">All products are adequately stocked.</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-6 pt-6 border-t border-brand-border space-y-4">
                  <div>
                    <h4 className="font-bold text-brand-text">Audio Notifications</h4>
                    <p className="text-xs text-brand-muted mt-1">Adjust the volume for system sounds like successful scans and sales.</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={localSettings.soundVolume ?? 50}
                      onChange={(e) => setLocalSettings({ ...localSettings, soundVolume: parseInt(e.target.value) || 0 })}
                      className="w-full h-2 bg-brand-border rounded-lg appearance-none cursor-pointer accent-brand-accent"
                    />
                    <span className="text-sm font-bold text-brand-text w-12 text-right">{localSettings.soundVolume ?? 50}%</span>
                  </div>
                  <button 
                    onClick={() => {
                      if (localSettings.soundVolume === 0) return;
                      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                      const oscillator = audioCtx.createOscillator();
                      const gainNode = audioCtx.createGain();
                      oscillator.connect(gainNode);
                      gainNode.connect(audioCtx.destination);
                      gainNode.gain.value = (localSettings.soundVolume ?? 50) / 100;
                      oscillator.type = 'sine';
                      oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime);
                      oscillator.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1);
                      gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.5);
                      oscillator.start(audioCtx.currentTime);
                      oscillator.stop(audioCtx.currentTime + 0.5);
                    }}
                    className="btn-secondary px-4 py-2 text-sm"
                  >
                    Test Sound
                  </button>
                </div>

                <div className="flex justify-end pt-4 border-t border-brand-border">
                  <button 
                    onClick={() => handleSaveAll()}
                    disabled={isSaving}
                    className={cn(
                      "btn-primary px-10 transition-all duration-300",
                      hasUnsavedChanges ? "bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-200" : ""
                    )}
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </CollapsibleSection>
          </div>
          )}

          {/* Printing Settings */}
          {filteredSections.some(s => s.id === 'printing') && (
          <div id="printing">
            <CollapsibleSection
              title={t('printing')}
              subtitle={t('printingSubtitle')}
              icon={Printer}
              color="#0ea5e9"
              isOpen={openSection === 'printing'}
              onToggle={() => handleSectionToggle(openSection === 'printing' ? null : 'printing')}
            >
              <div className="p-6 space-y-6">
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-brand-text uppercase tracking-wider">Print Method</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <label className={cn(
                      "flex items-start gap-3 p-4 border rounded-xl transition-all cursor-pointer",
                      localSettings.printMethod === 'android' ? "border-brand-accent bg-brand-accent/10 ring-2 ring-brand-accent/20" : "border-brand-border hover:border-brand-accent/20 dark:bg-brand-surface/30"
                    )}>
                      <input 
                        type="radio" 
                        name="printMethod" 
                        value="android"
                        checked={localSettings.printMethod === 'android'}
                        onChange={() => setLocalSettings({ ...localSettings, printMethod: 'android' })}
                        className="mt-1 text-brand-accent focus:ring-brand-accent"
                      />
                      <div>
                        <p className="font-bold text-brand-text">Share/Save Receipt</p>
                        <p className="text-xs text-brand-muted mt-1">Export receipt to PDF or image for sharing via WhatsApp/Email.</p>
                      </div>
                    </label>
                    <label className={cn(
                      "flex items-start gap-3 p-4 border rounded-xl transition-all cursor-pointer",
                      localSettings.printMethod === 'bluetooth' ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 ring-2 ring-emerald-500/20" : "border-brand-border hover:border-emerald-200 dark:bg-brand-surface/30",
                      isBluetoothAvailable === false && "opacity-60 grayscale cursor-not-allowed"
                    )}>
                      <input 
                        type="radio" 
                        name="printMethod" 
                        value="bluetooth"
                        checked={localSettings.printMethod === 'bluetooth'}
                        disabled={isBluetoothAvailable === false}
                        onChange={() => setLocalSettings({ ...localSettings, printMethod: 'bluetooth' })}
                        className="mt-1 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div>
                        <p className="font-bold text-brand-text">Thermal Bluetooth</p>
                        <p className="text-xs text-brand-muted mt-1">Directly print to a paired Bluetooth thermal printer (Recommended for APK).</p>
                        {isBluetoothAvailable === false && (
                          <div className="mt-2 p-2 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/30 rounded-lg">
                            <p className="text-[10px] text-rose-700 dark:text-rose-300 leading-relaxed">
                              <span className="font-bold">Warning:</span> Bluetooth might not be enabled or supported on this device/browser.
                            </p>
                          </div>
                        )}
                      </div>
                    </label>
                    <label className={cn(
                      "flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-all",
                      localSettings.printMethod === 'deeplink' ? "border-sky-500 bg-sky-50 dark:bg-sky-900/20 ring-2 ring-sky-500/20" : "border-brand-border hover:border-sky-200 dark:bg-brand-surface/30"
                    )}>
                      <input 
                        type="radio" 
                        name="printMethod" 
                        value="deeplink"
                        checked={localSettings.printMethod === 'deeplink'}
                        onChange={() => setLocalSettings({ ...localSettings, printMethod: 'deeplink' })}
                        className="mt-1 text-sky-600 focus:ring-sky-500"
                      />
                      <div>
                        <p className="font-bold text-brand-text">Bluetooth App</p>
                        <p className="text-xs text-brand-muted mt-1">Export via RawBT Bridge.</p>
                      </div>
                    </label>
                    <label className={cn(
                      "flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-all",
                      localSettings.printMethod === 'browser' ? "border-sky-500 bg-sky-50 dark:bg-sky-900/20 ring-2 ring-sky-500/20" : "border-brand-border hover:border-sky-200 dark:bg-brand-surface/30"
                    )}>
                      <input 
                        type="radio" 
                        name="printMethod" 
                        value="browser"
                        checked={localSettings.printMethod === 'browser'}
                        onChange={() => setLocalSettings({ ...localSettings, printMethod: 'browser' })}
                        className="mt-1 text-sky-600 focus:ring-sky-500"
                      />
                      <div>
                        <p className="font-bold text-brand-text">Browser Print</p>
                        <p className="text-xs text-brand-muted mt-1">Standard print dialog (PDF/A4).</p>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-brand-border">
                  <h4 className="text-sm font-bold text-brand-text uppercase tracking-wider">Paper Size</h4>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {['58mm', '80mm', 'thermal', 'a4', 'a2'].map((size) => (
                      <button
                        key={size}
                        onClick={() => setLocalSettings({ ...localSettings, paperSize: size as any })}
                        className={cn(
                          "px-4 py-3 rounded-xl border text-[10px] font-bold transition-all relative overflow-hidden",
                          localSettings.paperSize === size 
                            ? "bg-brand-accent text-white border-brand-accent shadow-lg shadow-brand-accent/20" 
                            : "bg-brand-bg text-brand-text border-brand-border hover:border-brand-accent/30"
                        )}
                      >
                        <span className="relative z-10">{size.toUpperCase()}</span>
                        {localSettings.paperSize === size && (
                          <motion.div 
                            layoutId="paper-size-glow"
                            className="absolute inset-0 bg-white/10"
                            initial={{ x: '-100%', skewX: -20 }}
                            animate={{ x: '200%', skewX: -20 }}
                            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-brand-muted">
                    Choose the paper format for your receipts. 58mm and 80mm are common thermal sizes. A4/A2 are standard documents.
                  </p>
                </div>

                <div className="space-y-4 pt-4 border-t border-brand-border">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-brand-text uppercase tracking-wider">Printer Management</h4>
                    <div className={cn(
                      "flex items-center gap-1.5 px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider border",
                      printerService.isSupported() 
                        ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                        : "bg-amber-50 text-amber-600 border-amber-100"
                    )}>
                      <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", printerService.isSupported() ? "bg-emerald-500" : "bg-amber-500")} />
                      {printerService.isSupported() ? "Native Bridge Active" : "Web Preview Mode"}
                    </div>
                  </div>
                  
                  {/* Bluetooth Default Printer */}
                  <div className="bg-brand-bg rounded-2xl border border-brand-border p-6 space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-500">
                          <Printer size={20} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-brand-text">Default Bluetooth Printer</p>
                          <p className="text-xs text-brand-muted">
                            {localSettings.defaultPrinterName ? `Linked: ${localSettings.defaultPrinterName}` : 'No printer linked. Connect to set a default.'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleConnectPrinter}
                        disabled={isConnecting || isBluetoothAvailable === false}
                        className={cn(
                          "px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2",
                          localSettings.defaultPrinterId 
                            ? "bg-brand-bg border border-brand-border text-brand-text hover:bg-brand-surface" 
                            : "bg-sky-500 text-white hover:bg-sky-600 shadow-md shadow-sky-200"
                        )}
                      >
                        {isConnecting ? (
                          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : <Plus size={14} />}
                        {localSettings.defaultPrinterId ? 'Change Printer' : 'Connect Printer'}
                      </button>
                    </div>

                    {localSettings.defaultPrinterId && (
                      <div className="pt-4 border-t border-brand-border/50 flex flex-wrap gap-2">
                        <div className="px-3 py-1.5 bg-brand-accent/10 border border-brand-accent/20 rounded-lg flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-pulse" />
                          <span className="text-[10px] font-bold text-brand-accent uppercase tracking-wider">Default</span>
                          <span className="text-xs text-brand-text font-medium">{localSettings.defaultPrinterName}</span>
                          <button 
                            type="button"
                            onClick={() => {
                              // When clicking X, we strictly remove the default. 
                              // If they want to use another one, they can pick from the list below.
                              setLocalSettings({ ...localSettings, defaultPrinterId: '', defaultPrinterName: '' });
                              showNotification('info', 'Default printer removed. Thermal printing will use the first available device if no default is set.');
                            }}
                            className="ml-1 p-0.5 hover:bg-brand-accent/20 rounded transition-colors text-brand-accent"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    )}

                    {(localSettings.pairedPrinters && localSettings.pairedPrinters.length > 0) && (
                      <div className="space-y-2 mt-4 pt-4 border-t border-brand-border/30">
                        <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Recently Linked Printers</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {(localSettings.pairedPrinters || []).map((device) => (
                            <div key={device.id} className="relative group">
                              <button
                                type="button"
                                onClick={async () => {
                                  setLocalSettings({
                                    ...localSettings,
                                    defaultPrinterId: device.id,
                                    defaultPrinterName: device.name || 'Bluetooth Printer',
                                    printMethod: 'bluetooth'
                                  });
                                  
                                  // Re-connect to the new printer immediately
                                  try {
                                    await printerService.connect(device.id);
                                    showNotification('success', `Connected to "${device.name || 'Bluetooth Printer'}" and set as default.`);
                                  } catch (e) {
                                    showNotification('info', `Set as default, but connection failed. It will retry when you print.`);
                                  }
                                }}
                                className={cn(
                                  "w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                                  localSettings.defaultPrinterId === device.id
                                    ? "border-sky-500 bg-sky-500/5 text-sky-600 dark:text-sky-400"
                                    : "border-brand-border hover:border-sky-200 hover:bg-brand-surface"
                                )}
                              >
                                <div className={cn(
                                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                                  localSettings.defaultPrinterId === device.id ? "bg-sky-500 text-white" : "bg-brand-surface text-brand-muted"
                                )}>
                                  <Printer size={16} />
                                </div>
                                <div className="min-w-0 pr-6">
                                  <p className="text-xs font-bold truncate">{device.name || 'Unknown Device'}</p>
                                  <p className="text-[10px] opacity-60 truncate">ID: {device.id.substring(0, 8)}...</p>
                                </div>
                              </button>
                              
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newList = (localSettings.pairedPrinters || []).filter(p => p.id !== device.id);
                                  const isDefault = localSettings.defaultPrinterId === device.id;
                                  setLocalSettings({
                                    ...localSettings,
                                    pairedPrinters: newList,
                                    defaultPrinterId: isDefault ? '' : localSettings.defaultPrinterId,
                                    defaultPrinterName: isDefault ? '' : localSettings.defaultPrinterName
                                  });
                                  showNotification('info', `Printer "${device.name}" removed from linked list.`);
                                }}
                                className="absolute top-2 right-2 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-all text-brand-muted"
                                title="Forget Printer"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Wired/USB Info */}
                  <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 rounded-xl">
                    <Info size={16} className="text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-amber-800 dark:text-amber-400">Wired (USB) Printers</p>
                      <p className="text-[10px] text-amber-700 dark:text-amber-500 mt-0.5 leading-relaxed">
                        For wired USB printers, please select <strong>Browser Print</strong> or <strong>Android APK Support</strong>. 
                        The system will automatically use the default printer configured on your device or operating system.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-brand-border">
                  <h4 className="text-sm font-bold text-brand-text uppercase tracking-wider">Print Behavior</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <label className={cn(
                      "flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-all",
                      localSettings.printBehavior === 'ask' ? "border-sky-500 bg-sky-50 dark:bg-sky-900/20" : "border-brand-border hover:border-sky-200 dark:bg-brand-surface/30"
                    )}>
                      <input 
                        type="radio" 
                        name="printBehavior" 
                        value="ask"
                        checked={localSettings.printBehavior === 'ask'}
                        onChange={() => setLocalSettings({ ...localSettings, printBehavior: 'ask' })}
                        className="mt-1 text-sky-600 focus:ring-sky-500"
                      />
                      <div>
                        <p className="font-bold text-brand-text">Ask to Print</p>
                        <p className="text-xs text-brand-muted mt-1">Prompt after every sale</p>
                      </div>
                    </label>
                    <label className={cn(
                      "flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-all",
                      localSettings.printBehavior === 'auto' ? "border-sky-500 bg-sky-50 dark:bg-sky-900/20" : "border-brand-border hover:border-sky-200 dark:bg-brand-surface/30"
                    )}>
                      <input 
                        type="radio" 
                        name="printBehavior" 
                        value="auto"
                        checked={localSettings.printBehavior === 'auto'}
                        onChange={() => setLocalSettings({ ...localSettings, printBehavior: 'auto' })}
                        className="mt-1 text-sky-600 focus:ring-sky-500"
                      />
                      <div>
                        <p className="font-bold text-brand-text">Auto Print</p>
                        <p className="text-xs text-brand-muted mt-1">Print immediately</p>
                      </div>
                    </label>
                    <label className={cn(
                      "flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-all",
                      localSettings.printBehavior === 'none' ? "border-sky-500 bg-sky-50 dark:bg-sky-900/20" : "border-brand-border hover:border-sky-200 dark:bg-brand-surface/30"
                    )}>
                      <input 
                        type="radio" 
                        name="printBehavior" 
                        value="none"
                        checked={localSettings.printBehavior === 'none'}
                        onChange={() => setLocalSettings({ ...localSettings, printBehavior: 'none' })}
                        className="mt-1 text-sky-600 focus:ring-sky-500"
                      />
                      <div>
                        <p className="font-bold text-brand-text">Do Not Print</p>
                        <p className="text-xs text-brand-muted mt-1">Disable receipt printing</p>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-brand-border">
                  <h4 className="text-sm font-bold text-brand-text uppercase tracking-wider">Receipt Customization</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 border rounded-xl border-brand-border bg-brand-bg/30 dark:bg-brand-surface/30">
                      <div>
                        <p className="font-bold text-brand-text">Print Attendant Name</p>
                        <p className="text-xs text-brand-muted mt-1">Include "Attendant was: [Name]" on the printed receipt.</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="sr-only peer"
                          checked={localSettings.printAccountName ?? true}
                          onChange={(e) => setLocalSettings({ ...localSettings, printAccountName: e.target.checked })}
                          disabled={isSaving}
                        />
                        <div className="w-11 h-6 bg-brand-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-accent"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-xl border-brand-border bg-brand-bg/30 dark:bg-brand-surface/30">
                      <div>
                        <p className="font-bold text-brand-text">Include Customer Name</p>
                        <p className="text-xs text-brand-muted mt-1">Allow salesperson to include customer's name on receipt during checkout.</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="sr-only peer"
                          checked={localSettings.includeCustomerName ?? true}
                          onChange={(e) => setLocalSettings({ ...localSettings, includeCustomerName: e.target.checked })}
                          disabled={isSaving}
                        />
                        <div className="w-11 h-6 bg-brand-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-accent"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-xl border-brand-border bg-brand-bg/30 dark:bg-brand-surface/30">
                      <div>
                        <p className="font-bold text-brand-text">Print Store Logo</p>
                        <p className="text-xs text-brand-muted mt-1">Show company logo on sales receipts (if uploaded).</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="sr-only peer"
                          checked={localSettings.printLogoOnReceipt ?? true}
                          onChange={(e) => setLocalSettings({ ...localSettings, printLogoOnReceipt: e.target.checked })}
                          disabled={isSaving}
                        />
                        <div className="w-11 h-6 bg-brand-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-accent"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-xl border-brand-border bg-brand-bg/30 dark:bg-brand-surface/30">
                      <div>
                        <p className="font-bold text-brand-text">Print Account Info on Debt</p>
                        <p className="text-xs text-brand-muted mt-1">Show bank details on receipts when a sale involves credit/debt.</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="sr-only peer"
                          checked={localSettings.printStoreAccountOnReceipt ?? true}
                          onChange={(e) => setLocalSettings({ ...localSettings, printStoreAccountOnReceipt: e.target.checked })}
                          disabled={isSaving}
                        />
                        <div className="w-11 h-6 bg-brand-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-accent"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-xl border-brand-border bg-brand-bg/30 dark:bg-brand-surface/30">
                      <div>
                        <p className="font-bold text-brand-text">Receipt Copies</p>
                        <p className="text-xs text-brand-muted mt-1">Number of copies to print for each sale.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          type="button"
                          onClick={() => setLocalSettings({ ...localSettings, receiptCopies: Math.max(1, (localSettings.receiptCopies || 1) - 1) })}
                          className="w-8 h-8 rounded-lg border border-brand-border flex items-center justify-center hover:bg-brand-bg dark:hover:bg-brand-surface transition-colors"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="text-sm font-bold w-4 text-center">{localSettings.receiptCopies || 1}</span>
                        <button 
                          type="button"
                          onClick={() => setLocalSettings({ ...localSettings, receiptCopies: (localSettings.receiptCopies || 1) + 1 })}
                          className="w-8 h-8 rounded-lg border border-brand-border flex items-center justify-center hover:bg-brand-bg dark:hover:bg-brand-surface transition-colors"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-brand-border">
                  <button 
                    onClick={() => handleSaveAll()}
                    disabled={isSaving}
                    className={cn(
                      "btn-primary px-10 transition-all duration-300",
                      hasUnsavedChanges ? "bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-200" : ""
                    )}
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </CollapsibleSection>
          </div>
          )}

          {/* Business Rules */}
          {filteredSections.some(s => s.id === 'business-rules') && (
          <div id="business-rules">
            <CollapsibleSection
              title={t('businessRules')}
              subtitle={t('businessRulesSubtitle')}
              icon={Shield}
              color="#f43f5e"
              isOpen={openSection === 'business-rules'}
              onToggle={() => handleSectionToggle(openSection === 'business-rules' ? null : 'business-rules')}
            >
              <div className="space-y-6">
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-brand-text uppercase tracking-wider">Account Debt Limits</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Limit Type</label>
                      <select 
                        className="input-field appearance-none"
                        value={localSettings.debtLimitType ?? 'unlimited'}
                        onChange={(e) => setLocalSettings({ ...localSettings, debtLimitType: e.target.value as any })}
                        disabled={isSaving}
                      >
                        <option value="unlimited">Unlimited Credit</option>
                        <option value="fixed">Fixed Amount</option>
                      </select>
                    </div>
                    
                    {localSettings.debtLimitType === 'fixed' && (
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">
                          Limit Amount ({settings.currencySymbol})
                        </label>
                        <CurrencyInput
                          value={localSettings.debtLimitAmount ?? 0}
                          onChange={val => setLocalSettings({ ...localSettings, debtLimitAmount: val === '' ? 0 : Number(val) })}
                          disabled={isSaving}
                        />
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-brand-muted">
                    Controls how much debt an account can accumulate before being blocked from further credit sales.
                  </p>
                </div>

                <div className="space-y-4 pt-4 border-t border-brand-border">
                  <h4 className="text-sm font-bold text-brand-text uppercase tracking-wider">Pricing Rules</h4>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Retail Price Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setLocalSettings({ ...localSettings, priceType: 'fixed' })}
                        className={cn(
                          "px-4 py-3 rounded-xl border text-sm font-bold transition-all flex items-center justify-center gap-2",
                          localSettings.priceType === 'fixed' 
                            ? "bg-brand-accent text-white border-brand-accent" 
                            : "bg-brand-bg text-brand-muted border-brand-border hover:border-brand-muted"
                        )}
                      >
                        Fixed
                      </button>
                      <button
                        onClick={() => setLocalSettings({ ...localSettings, priceType: 'negotiable' })}
                        className={cn(
                          "px-4 py-3 rounded-xl border text-sm font-bold transition-all flex items-center justify-center gap-2",
                          localSettings.priceType === 'negotiable' 
                            ? "bg-brand-accent text-white border-brand-accent" 
                            : "bg-brand-bg text-brand-muted border-brand-border hover:border-brand-muted"
                        )}
                      >
                        Negotiable
                      </button>
                    </div>
                    <p className="text-[10px] text-brand-muted mt-1">
                      {localSettings.priceType === 'fixed' 
                        ? "Retail prices are fixed and cannot be changed during sale." 
                        : "Retail prices can be adjusted/negotiated during sale."}
                    </p>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-brand-border">
                  <h4 className="text-sm font-bold text-brand-text uppercase tracking-wider">Payment Methods</h4>
                  <div className="flex items-center justify-between p-4 border rounded-xl border-brand-border bg-brand-bg/30">
                    <div>
                      <p className="font-bold text-brand-text">Allow Split Payments</p>
                      <p className="text-xs text-brand-muted mt-1">Enable multiple payment methods (Cash, Card, Transfer) in a single checkout.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={localSettings.allowSplitPayments ?? false}
                        onChange={(e) => setLocalSettings({ ...localSettings, allowSplitPayments: e.target.checked })}
                        disabled={isSaving}
                      />
                      <div className="w-11 h-6 bg-brand-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-accent"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-xl border-brand-border bg-brand-bg/30">
                    <div>
                      <p className="font-bold text-brand-text">Allow Pending Sales</p>
                      <p className="text-xs text-brand-muted mt-1">Enable putting a checkout on hold to process another sale.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={localSettings.allowPendingSales ?? false}
                        onChange={(e) => setLocalSettings({ ...localSettings, allowPendingSales: e.target.checked })}
                        disabled={isSaving}
                      />
                      <div className="w-11 h-6 bg-brand-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-accent"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-xl border-brand-border bg-brand-bg/30">
                    <div>
                      <p className="font-bold text-brand-text">Allow Backdated Sales</p>
                      <p className="text-xs text-brand-muted mt-1">Enable entering sales for previous days, weeks, or months.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={localSettings.allowBackdatedSales ?? false}
                        onChange={(e) => setLocalSettings({ ...localSettings, allowBackdatedSales: e.target.checked })}
                        disabled={isSaving}
                      />
                      <div className="w-11 h-6 bg-brand-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-accent"></div>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-brand-border">
                  <button 
                    onClick={() => handleSaveAll()}
                    disabled={isSaving}
                    className={cn(
                      "btn-primary px-10 transition-all duration-300",
                      hasUnsavedChanges ? "bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-200" : ""
                    )}
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </CollapsibleSection>
          </div>
          )}
          {filteredSections.some(s => s.id === 'database') && (
          <div id="database">
            <CollapsibleSection
              title={t('database')}
              subtitle={t('databaseSubtitle')}
              icon={Database}
              color="#8b5cf6"
              isOpen={openSection === 'database'}
              onToggle={() => handleSectionToggle(openSection === 'database' ? null : 'database')}
            >
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-6 bg-brand-bg/50 rounded-2xl border border-brand-border space-y-4">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                        <Download size={20} />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-bold text-brand-text">Local Backup & Restore</h4>
                        <p className="text-xs text-brand-muted mt-1">Save a copy of your database to your local device or restore from a file.</p>
                        <div className="flex flex-wrap gap-2 mt-4">
                          <button
                            onClick={handleLocalBackup}
                            className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-2"
                          >
                            <Download size={16} />
                            Save to Device
                          </button>
                          <label className="px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-2 cursor-pointer">
                            <Upload size={16} />
                            Restore from File
                            <input type="file" accept=".db,.sqlite,.sqlite3" className="hidden" onChange={handleLocalRestore} />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 bg-rose-50/50 rounded-2xl border border-rose-100 space-y-4">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                        <Upload size={20} />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-bold text-rose-900">Restore Database</h4>
                        <p className="text-xs text-rose-700 mt-1">
                          Upload a previously downloaded backup file. 
                          <strong> Warning: Overwrites all data.</strong>
                        </p>
                        <div className="mt-4 flex items-center gap-4">
                          <input 
                            type="file" 
                            id="db-upload" 
                            accept=".db"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              
                              setShowConfirm({
                                show: true,
                                title: 'Restore Database',
                                message: 'Are you sure you want to restore this database? All current data will be lost.',
                                onConfirm: async () => {
                                  try {
                                    setIsSaving(true);
                                    const arrayBuffer = await file.arrayBuffer();
                                    const uint8Array = new Uint8Array(arrayBuffer);
                                    
                                    const { migrationsPerformed } = await importDB(uint8Array);
                                    
                                    playSound('success');
                                    const message = migrationsPerformed 
                                      ? 'Database restored successfully. New fields and tables have also been updated successfully. The page will reload.' 
                                      : 'Database restored successfully. The page will reload.';
                                    showNotification('success', message);
                                    setTimeout(() => window.location.reload(), 2000);
                                  } catch (err) {
                                    console.error(err);
                                    playSound('alert');
                                    showNotification('error', 'An error occurred during restore.');
                                  } finally {
                                    setIsSaving(false);
                                    setShowConfirm(prev => ({ ...prev, show: false }));
                                  }
                                }
                              });
                              e.target.value = '';
                            }}
                          />
                          <label 
                            htmlFor="db-upload"
                            className="px-4 py-2 bg-rose-600 text-white text-sm font-bold rounded-xl hover:bg-rose-700 transition-colors cursor-pointer flex items-center gap-2"
                          >
                            <Upload size={16} />
                            Select Backup File
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-amber-50/50 rounded-2xl border border-amber-100 space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                      <AlertTriangle size={20} />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-amber-900">Reset App Settings</h4>
                      <p className="text-xs text-amber-700 mt-1">
                        Restore all application settings to their default values. 
                        <strong> Your products, sales, and accounts will NOT be affected.</strong>
                      </p>
                      <button
                        onClick={() => {
                          setShowConfirm({
                            show: true,
                            title: 'Reset App Settings',
                            message: 'Are you sure you want to reset all settings to defaults? This will revert your store name, currency, and other configurations, but your business data will remain safe.',
                            onConfirm: async () => {
                              try {
                                setIsSaving(true);
                                await resetSettings();
                                playSound('success');
                                showNotification('success', 'Settings have been reset to defaults. The page will reload.');
                                setTimeout(() => window.location.reload(), 2000);
                              } catch (err) {
                                console.error(err);
                                playSound('alert');
                                showNotification('error', 'An error occurred while resetting settings.');
                              } finally {
                                setIsSaving(false);
                                setShowConfirm(prev => ({ ...prev, show: false }));
                              }
                            }
                          });
                        }}
                        className="mt-4 px-4 py-2 bg-amber-600 text-white text-sm font-bold rounded-xl hover:bg-amber-700 transition-colors flex items-center gap-2"
                      >
                        <AlertTriangle size={16} />
                        Reset to Defaults
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-brand-bg/50 rounded-2xl border border-brand-border space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-brand-text">Auto-Backup Settings</h4>
                      <p className="text-xs text-brand-muted mt-1">Configure automatic database backups to ensure your data is safe.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={localSettings.autoBackupEnabled ?? false}
                        onChange={(e) => setLocalSettings({ ...localSettings, autoBackupEnabled: e.target.checked })}
                        disabled={isSaving}
                      />
                      <div className="w-11 h-6 bg-brand-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-accent"></div>
                    </label>
                  </div>
                  
                  {localSettings.autoBackupEnabled && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Backup Method</label>
                        <select 
                          className="input-field appearance-none"
                          value={localSettings.backupMethod ?? 'local'}
                          onChange={(e) => setLocalSettings({ ...localSettings, backupMethod: e.target.value as any })}
                          disabled={isSaving}
                        >
                          <option value="local">Local Server</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Backup Interval</label>
                        <select 
                          className="input-field appearance-none"
                          value={localSettings.backupInterval ?? 'daily'}
                          onChange={(e) => setLocalSettings({ ...localSettings, backupInterval: e.target.value as any })}
                          disabled={isSaving}
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </div>
                                      <div className="space-y-2">
                        <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Backup Time (24h)</label>
                        <input 
                          type="time" 
                          className="input-field"
                          value={localSettings.backupTime ?? '00:00'}
                          onChange={(e) => setLocalSettings({ ...localSettings, backupTime: e.target.value })}
                          disabled={isSaving}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Backup Path (Server)</label>
                        <input 
                          type="text" 
                          className="input-field"
                          placeholder="./backups"
                          value={localSettings.backupPath ?? './backups'}
                          onChange={(e) => setLocalSettings({ ...localSettings, backupPath: e.target.value })}
                          disabled={isSaving}
                        />
                      </div>
                    </div>
                  )}
                  
                  <div className="flex justify-end pt-4 mt-4 border-t border-brand-border">
                    <button 
                      onClick={async () => {
                        setIsSaving(true);
                        try {
                          await updateSettings({ 
                            autoBackupEnabled: localSettings.autoBackupEnabled,
                            backupMethod: 'local',
                            backupInterval: localSettings.backupInterval,
                            backupTime: localSettings.backupTime,
                            backupPath: localSettings.backupPath
                          });
                          showNotification('success', 'Auto-backup settings saved successfully.');
                          playSound('success');
                        } catch (error) {
                          showNotification('error', 'Failed to save auto-backup settings.');
                        } finally {
                          setIsSaving(false);
                        }
                      }}
                      disabled={isSaving}
                      className="btn-primary px-6 py-2 text-sm"
                    >
                      {isSaving ? 'Saving...' : 'Save Auto-Backup'}
                    </button>
                  </div>
                </div>
              </div>
            </CollapsibleSection>
          </div>
          )}

          {/* System Information */}
          <div className="mt-8 pt-8 border-t border-brand-border/50">
            <div className="flex flex-col items-center justify-center text-center gap-4">
              <div className="flex items-center gap-3 px-4 py-2 bg-brand-accent/5 rounded-2xl border border-brand-accent/10">
                <div className="w-8 h-8 rounded-lg bg-brand-accent/10 flex items-center justify-center text-brand-accent">
                  <Info size={18} />
                </div>
                <div className="text-left">
                  <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest leading-none mb-1">System Version</p>
                  <p className="text-sm font-bold text-brand-text">v{APP_VERSION}</p>
                </div>
              </div>
              <p className="text-[10px] text-brand-muted font-medium uppercase tracking-widest">
                Last Updated: {new Date(LAST_UPDATED).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
              <div className="flex items-center gap-2 text-[9px] font-bold text-brand-muted/50 uppercase tracking-[0.2em]">
                <span>Secure</span>
                <div className="w-1 h-1 rounded-full bg-emerald-500/50" />
                <span>Encrypted</span>
                <div className="w-1 h-1 rounded-full bg-emerald-500/50" />
                <span>Optimized</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isSaving && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-10 right-10 bg-brand-accent text-white px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest shadow-2xl z-50 flex items-center gap-3"
        >
          <div className="w-2 h-2 rounded-full bg-white animate-ping" />
          Saving changes...
        </motion.div>
      )}

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirm.show && (
          <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-20">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfirm(prev => ({ ...prev, show: false }))}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-brand-surface rounded-3xl shadow-2xl p-8 max-w-md w-full border border-brand-border"
            >
              <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mb-6">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-2xl font-bold text-brand-text mb-2">{showConfirm.title}</h3>
              <p className="text-brand-muted mb-8 leading-relaxed">
                {showConfirm.message}
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowConfirm(prev => ({ ...prev, show: false }))}
                  className="flex-1 px-6 py-3 rounded-xl border border-brand-border font-bold text-brand-text hover:bg-brand-bg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={showConfirm.onConfirm}
                  className="flex-1 px-6 py-3 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-700 transition-colors shadow-lg shadow-rose-500/20"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Internal Navigation Guard Modal */}
      <AnimatePresence>
        {showInternalConfirm && (
          <div className="fixed inset-0 z-[110] flex items-start justify-center p-4 pt-20">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowInternalConfirm(false);
                setPendingSection(null);
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-brand-surface rounded-3xl shadow-2xl p-8 max-w-md w-full border border-brand-border"
            >
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-6">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-2xl font-bold text-brand-text mb-2">Unsaved Changes</h3>
              <p className="text-brand-muted mb-8 leading-relaxed">
                You have unsaved changes in <span className="font-bold text-brand-text">{dirtySectionName}</span>. 
                Would you like to save them before moving to another section?
              </p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={async () => {
                    const success = await handleSaveAll();
                    if (success) {
                      if (pendingSection) {
                        setOpenSection(pendingSection);
                        setTimeout(() => {
                          const element = document.getElementById(pendingSection);
                          if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 100);
                      }
                      setShowInternalConfirm(false);
                      setPendingSection(null);
                    }
                  }}
                  className="w-full px-6 py-4 rounded-xl bg-brand-accent text-white font-bold hover:bg-brand-accent/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-accent/20"
                >
                  Save Now
                </button>
                <button 
                  onClick={() => {
                    setLocalSettings(settings);
                    setCategories(Array.isArray(settings.categories) ? settings.categories : []);
                    if (pendingSection) {
                      setOpenSection(pendingSection);
                      setTimeout(() => {
                        const element = document.getElementById(pendingSection);
                        if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }, 100);
                    }
                    setShowInternalConfirm(false);
                    setPendingSection(null);
                  }}
                  className="w-full px-6 py-4 rounded-xl border border-brand-border text-brand-text font-bold hover:bg-brand-bg transition-all"
                >
                  Ignore Changes
                </button>
                <button 
                  onClick={() => {
                    setShowInternalConfirm(false);
                    setPendingSection(null);
                  }}
                  className="w-full px-6 py-4 rounded-xl text-brand-muted font-bold hover:text-brand-text transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
