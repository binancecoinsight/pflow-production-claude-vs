import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';

interface Category {
  id: string;
  name: string;
  subcategories: string[];
}

interface Settings {
  currency: string;
  currencySymbol: string;
  storeName: string;
  phoneNumber: string;
  storeAddress: string;
  storeEmail: string;
  receiptMessage: string;
  categories: Category[];
  lowStockAlerts: boolean;
  lowStockThreshold: number;
  printMethod: 'bluetooth' | 'deeplink' | 'browser' | 'android';
  paperSize: '58mm' | '80mm' | 'thermal' | 'a4' | 'a2';
  printBehavior: 'ask' | 'auto' | 'none';
  soundVolume: number;
  autoBackupEnabled: boolean;
  backupMethod: 'local';
  backupInterval: 'daily' | 'weekly' | 'monthly';
  backupTime: string;
  backupPath: string;
  backupDayOfWeek: string;
  backupDayOfMonth: string;
  taxType: 'percentage' | 'fixed' | 'none';
  taxValue: number;
  scannerType: 'camera' | 'barcode';
  priceType: 'fixed' | 'negotiable';
  printAccountName: boolean;
  includeCustomerName: boolean;
  debtLimitType: 'unlimited' | 'fixed';
  debtLimitAmount: number;
  allowSplitPayments: boolean;
  allowPendingSales: boolean;
  allowBackdatedSales: boolean;
  bankName: string;
  accountName: string;
  accountNumber: string;
  storeLogo: string;
  receiptCopies: number;
  printLogoOnReceipt: boolean;
  printStoreAccountOnReceipt: boolean;
  setupCompleted: boolean;
  defaultPrinterId?: string;
  defaultPrinterName?: string;
  pairedPrinters?: { id: string, name: string }[];
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseEmail?: string;
  supabasePassword?: string;
}

interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>;
  resetSettings: () => Promise<void>;
  loading: boolean;
  playSound: (type: 'success' | 'scan' | 'alert') => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>({ 
    currency: 'NGN', 
    currencySymbol: '₦',
    storeName: 'PHARMACY ABC',
    phoneNumber: '',
    storeAddress: '',
    storeEmail: '',
    receiptMessage: 'Thanks for your patronage!',
    categories: [],
    lowStockAlerts: true,
    lowStockThreshold: 5,
    printMethod: 'android',
    paperSize: '80mm',
    printBehavior: 'ask',
    soundVolume: 50,
    autoBackupEnabled: false,
    backupMethod: 'local',
    backupInterval: 'daily',
    backupTime: '00:00',
    backupPath: './backups',
    backupDayOfWeek: '0',
    backupDayOfMonth: '1',
    taxType: 'none',
    taxValue: 0,
    scannerType: 'camera',
    priceType: 'fixed',
    printAccountName: true,
    includeCustomerName: true,
    debtLimitType: 'unlimited',
    debtLimitAmount: 0,
    allowSplitPayments: false,
    allowPendingSales: true,
    allowBackdatedSales: false,
    bankName: '',
    accountName: '',
    accountNumber: '',
    storeLogo: '',
    receiptCopies: 1,
    printLogoOnReceipt: true,
    printStoreAccountOnReceipt: true,
    setupCompleted: false,
    defaultPrinterId: '',
    defaultPrinterName: '',
    pairedPrinters: [],
    supabaseUrl: '',
    supabaseAnonKey: '',
    supabaseEmail: '',
    supabasePassword: ''
  });
  const [loading, setLoading] = useState(true);

  const playSound = (type: 'success' | 'scan' | 'alert') => {
    if (settings.soundVolume === 0) return;
    
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    gainNode.gain.value = settings.soundVolume / 100;
    
    if (type === 'success') {
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      oscillator.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1); // E5
      gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.5);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.5);
    } else if (type === 'scan') {
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.1);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'alert') {
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(440, audioCtx.currentTime); // A4
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime + 0.2); // A5
      gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.4);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.4);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await apiFetch('/api/settings');
      const data = await res.json();
      
      // Load logo from device storage
      const localLogo = localStorage.getItem('store_logo') || '';

      if (data) {
        setSettings(prev => ({ 
          ...prev, 
          ...data,
          storeLogo: localLogo,
          categories: Array.isArray(data.categories) ? data.categories : prev.categories,
          soundVolume: data.soundVolume !== undefined ? Number(data.soundVolume) : prev.soundVolume,
          lowStockThreshold: data.lowStockThreshold !== undefined ? Number(data.lowStockThreshold) : prev.lowStockThreshold,
          debtLimitAmount: data.debtLimitAmount !== undefined ? Number(data.debtLimitAmount) : prev.debtLimitAmount,
          taxValue: data.taxValue !== undefined ? Number(data.taxValue) : prev.taxValue,
          lowStockAlerts: data.lowStockAlerts !== undefined ? (typeof data.lowStockAlerts === 'boolean' ? data.lowStockAlerts : String(data.lowStockAlerts) === 'true') : prev.lowStockAlerts,
          autoBackupEnabled: data.autoBackupEnabled !== undefined ? (typeof data.autoBackupEnabled === 'boolean' ? data.autoBackupEnabled : String(data.autoBackupEnabled) === 'true') : prev.autoBackupEnabled,
          printAccountName: data.printAccountName !== undefined ? (typeof data.printAccountName === 'boolean' ? data.printAccountName : String(data.printAccountName) === 'true') : prev.printAccountName,
          allowSplitPayments: data.allowSplitPayments !== undefined ? (typeof data.allowSplitPayments === 'boolean' ? data.allowSplitPayments : String(data.allowSplitPayments) === 'true') : prev.allowSplitPayments,
          allowPendingSales: data.allowPendingSales !== undefined ? (typeof data.allowPendingSales === 'boolean' ? data.allowPendingSales : String(data.allowPendingSales) === 'true') : prev.allowPendingSales,
          allowBackdatedSales: data.allowBackdatedSales !== undefined ? (typeof data.allowBackdatedSales === 'boolean' ? data.allowBackdatedSales : String(data.allowBackdatedSales) === 'true') : prev.allowBackdatedSales
        }));
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const updateSettings = async (newSettings: Partial<Settings>) => {
    try {
      // Handle logo separately for device storage
      if ('storeLogo' in newSettings) {
        if (newSettings.storeLogo) {
          localStorage.setItem('store_logo', newSettings.storeLogo);
        } else {
          localStorage.removeItem('store_logo');
        }
      }

      // Remove storeLogo from the data sent to the database
      const { storeLogo, ...settingsToSave } = newSettings;

      const res = await apiFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsToSave),
      });
      if (res.ok) {
        setSettings(prev => ({ ...prev, ...newSettings }));
      }
    } catch (err) {
      console.error('Failed to update settings:', err);
    }
  };

  const resetSettings = async () => {
    try {
      const res = await apiFetch('/api/settings/reset', {
        method: 'POST'
      });
      if (res.ok) {
        await fetchSettings();
      }
    } catch (err) {
      console.error('Failed to reset settings:', err);
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings, loading, playSound }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
