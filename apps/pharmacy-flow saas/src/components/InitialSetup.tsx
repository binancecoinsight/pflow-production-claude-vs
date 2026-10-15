import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import AppLogo from './AppLogo';
import { Pill, HeartPulse, Activity, Settings as SettingsIcon, Users, Package, ArrowRight, ArrowLeft, Check, X, Globe, Printer, Camera, DollarSign, Building, Phone, MapPin, Receipt, ShieldCheck } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { useLanguage, Language } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import { useNotification } from '../context/NotificationContext';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import CurrencyInput from './CurrencyInput';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function InitialSetup({ onComplete, onSkip }: { onComplete: () => void, onSkip: () => void }) {
  const { settings, updateSettings } = useSettings();
  const { t, language, setLanguage, isRTL } = useLanguage();
  const { user } = useAuth();
  const { showNotification } = useNotification();
  
  const [step, setStep] = useState(0); // 0: Welcome, 1: Store Info, 2: Hardware, 3: Staff, 4: Products, 5: Finish
  const [isSaving, setIsSaving] = useState(false);
  
  // Step 1 State
  const [storeName, setStoreName] = useState(settings.storeName || '');
  const [storeAddress, setStoreAddress] = useState(settings.storeAddress || '');
  const [phoneNumber, setPhoneNumber] = useState(settings.phoneNumber || '');
  const [bankName, setBankName] = useState(settings.bankName || '');
  const [accountName, setAccountName] = useState(settings.accountName || '');
  const [accountNumber, setAccountNumber] = useState(settings.accountNumber || '');
  const [currency, setCurrency] = useState(settings.currency || 'USD');
  const [priceType, setPriceType] = useState(settings.priceType || 'fixed');
  const [taxType, setTaxType] = useState(settings.taxType || 'none');
  const [taxValue, setTaxValue] = useState(settings.taxValue?.toString() || '0');
  const [allowSplitPayments, setAllowSplitPayments] = useState(settings.allowSplitPayments);
  const [allowPendingSales, setAllowPendingSales] = useState(settings.allowPendingSales);
  const [allowBackdatedSales, setAllowBackdatedSales] = useState(settings.allowBackdatedSales);
  
  // Step 2 State
  const [paperSize, setPaperSize] = useState(settings.paperSize || 'thermal');
  const [printBehavior, setPrintBehavior] = useState(settings.printBehavior || 'ask');
  const [receiptCopies, setReceiptCopies] = useState(settings.receiptCopies?.toString() || '1');
  const [scannerType, setScannerType] = useState(settings.scannerType || 'camera');
  const [printAccountName, setPrintAccountName] = useState(settings.printAccountName);
  const [includeCustomerName, setIncludeCustomerName] = useState(settings.includeCustomerName);
  const [printStoreAccountOnReceipt, setPrintStoreAccountOnReceipt] = useState(settings.printStoreAccountOnReceipt);
  
  // Step 3 State (Staff)
  const [staffList, setStaffList] = useState<any[]>([]);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffUsername, setNewStaffUsername] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('cashier');
  const [roles, setRoles] = useState<any[]>([]);

  // Step 4 State (Products)
  const [newProductName, setNewProductName] = useState('');
  const [newProductCategory, setNewProductCategory] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductStock, setNewProductStock] = useState('');
  const [productList, setProductList] = useState<any[]>([]);

  useEffect(() => {
    if (step === 3) {
      fetchStaffAndRoles();
    }
    if (step === 4) {
      fetchProducts();
    }
  }, [step]);

  const fetchProducts = async () => {
    try {
      const res = await apiFetch('/api/products');
      const data = await res.json();
      setProductList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch products', err);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName || !newProductPrice) return;

    try {
      setIsSaving(true);
      const res = await apiFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProductName,
          category: newProductCategory || 'General',
          price: parseFloat(newProductPrice),
          stock: parseInt(newProductStock) || 0,
          minStock: 5,
          unit: 'pcs'
        })
      });
      if (res.ok) {
        setNewProductName('');
        setNewProductCategory('');
        setNewProductPrice('');
        setNewProductStock('');
        showNotification('success', 'Product added successfully');
        fetchProducts();
      } else {
        const data = await res.json();
        showNotification('error', data.error || 'Failed to add product');
      }
    } catch (err) {
      showNotification('error', 'An unexpected error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  const fetchStaffAndRoles = async () => {
    try {
      const [usersRes, rolesRes] = await Promise.all([
        apiFetch('/api/users'),
        apiFetch('/api/roles')
      ]);
      const usersData = await usersRes.json();
      const rolesData = await rolesRes.json();
      setStaffList(Array.isArray(usersData) ? usersData : []);
      setRoles(Array.isArray(rolesData) ? rolesData : []);
    } catch (err) {
      console.error('Failed to fetch staff/roles', err);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName || !newStaffUsername || !newStaffPassword) return;
    
    const roleObj = roles.find(r => r.name === newStaffRole);
    
    try {
      const res = await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newStaffName,
          username: newStaffUsername,
          password: newStaffPassword,
          roleId: roleObj?.id
        })
      });
      if (res.ok) {
        setNewStaffName('');
        setNewStaffUsername('');
        setNewStaffPassword('');
        showNotification('success', 'Staff member added successfully');
        fetchStaffAndRoles();
      } else {
        const data = await res.json();
        showNotification('error', data.error || 'Failed to add staff member');
      }
    } catch (err) {
      showNotification('error', 'An unexpected error occurred');
      console.error('Failed to add staff', err);
    }
  };

  const handleSaveStep1 = async () => {
    if (!storeName.trim()) {
      showNotification('error', 'Pharmacy name is required');
      return;
    }
    setIsSaving(true);
    await updateSettings({
      storeName,
      storeAddress,
      phoneNumber,
      bankName,
      accountName,
      accountNumber,
      currency,
      priceType: priceType as any,
      taxType: taxType as any,
      taxValue: parseFloat(taxValue) || 0,
      allowSplitPayments,
      allowPendingSales,
      allowBackdatedSales
    });
    setIsSaving(false);
    setStep(2);
  };

  const handleSaveStep2 = async () => {
    setIsSaving(true);
    await updateSettings({
      paperSize: paperSize as any,
      printBehavior: printBehavior as any,
      receiptCopies: parseInt(receiptCopies) || 1,
      scannerType: scannerType as any,
      printAccountName,
      includeCustomerName,
      printStoreAccountOnReceipt
    });
    setIsSaving(false);
    setStep(3);
  };

  const handleFinish = async () => {
    setIsSaving(true);
    await updateSettings({ setupCompleted: true });
    setIsSaving(false);
    onComplete();
  };

  const handleSkip = async () => {
    setIsSaving(true);
    await updateSettings({ setupCompleted: true });
    setIsSaving(false);
    onSkip();
  };

  const languages: { code: Language; name: string; flag: string }[] = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'ar', name: 'العربية', flag: '🇸🇦' },
    { code: 'sw', name: 'Kiswahili', flag: '🇰🇪' },
    { code: 'pt', name: 'Português', flag: '🇵🇹' },
    { code: 'ha', name: 'Hausa', flag: '🇳🇬' },
  ];

  return (
    <div className={cn("min-h-screen bg-brand-bg flex flex-col items-center justify-center p-4 overflow-hidden overflow-x-hidden select-none touch-pan-y", isRTL && "font-arabic")}>
      <div className="w-full max-w-4xl bg-brand-surface rounded-3xl shadow-2xl border border-brand-border overflow-hidden relative overscroll-none overscroll-x-none">
        
        {/* Header Progress */}
        {step > 0 && (
          <div className="bg-brand-surface border-b border-brand-border p-6 flex items-center justify-between sticky top-0 z-20">
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map(s => (
                <div key={s} className="flex items-center">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors",
                    step >= s ? "bg-brand-accent text-white" : "bg-brand-bg text-brand-muted"
                  )}>
                    {step > s ? <Check size={16} /> : s}
                  </div>
                  {s < 5 && (
                    <div className={cn(
                      "w-12 h-1 transition-colors",
                      step > s ? "bg-brand-accent" : "bg-brand-bg"
                    )} />
                  )}
                </div>
              ))}
            </div>
            <button 
              onClick={handleSkip}
              className="text-brand-muted hover:text-brand-text text-sm font-bold transition-colors"
            >
              Skip & do this later
            </button>
          </div>
        )}

        <div className="p-8 md:p-12 max-h-[80vh] overflow-y-auto">
          <AnimatePresence mode="wait">
            {/* Step 0: Welcome */}
            {step === 0 && (
              <motion.div
                key="step0"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="text-center space-y-8 py-12"
              >
                <div className="w-24 h-24 bg-brand-accent/10 rounded-3xl flex items-center justify-center text-brand-accent mx-auto shadow-inner">
                  <AppLogo size={56} className="text-brand-accent" />
                </div>
                <div className="space-y-4">
                  <h1 className="text-4xl font-black text-brand-text">Welcome to Pharmacy Flow!</h1>
                  <p className="text-xl text-brand-muted max-w-2xl mx-auto">
                    To fully experience the power of Pharmacy Flow, you need to set up your pharmacy store. We've created a quick wizard to get you started.
                  </p>
                </div>
                <div className="pt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                  <button
                    onClick={() => setStep(1)}
                    className="btn-primary px-8 py-4 text-lg w-full sm:w-auto"
                  >
                    Click here to begin
                  </button>
                  <button
                    onClick={handleSkip}
                    className="btn-secondary px-8 py-4 text-lg w-full sm:w-auto"
                  >
                    Skip & do this later
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 1: Store Info & Business Rules */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-brand-text flex items-center gap-3">
                    <AppLogo size={24} className="text-brand-accent" /> Pharmacy Information & Rules
                  </h2>
                  <p className="text-brand-muted">Let's start with the basics of your pharmacy and how you want to handle sales.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <h3 className="text-lg font-bold text-brand-text border-b border-brand-border pb-2">Basic Info</h3>
                    
                    <div>
                      <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-2">App Language</label>
                      <div className="grid grid-cols-3 gap-2">
                        {languages.map(lang => (
                          <button
                            key={lang.code}
                            onClick={() => setLanguage(lang.code)}
                            className={cn(
                              "p-2 rounded-xl border text-sm flex items-center justify-center gap-2 transition-colors",
                              language === lang.code ? "bg-brand-accent/10 border-brand-accent text-brand-accent" : "border-brand-border text-brand-text hover:bg-brand-bg"
                            )}
                          >
                            <span>{lang.flag}</span>
                            <span>{lang.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-2">Pharmacy Name</label>
                      <input type="text" value={storeName} onChange={e => setStoreName(e.target.value)} className="input-field" placeholder="My Awesome Pharmacy" />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-2">Pharmacy Address</label>
                      <input type="text" value={storeAddress} onChange={e => setStoreAddress(e.target.value)} className="input-field" placeholder="123 Pharma St" />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-2">Phone Number</label>
                      <input type="text" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} className="input-field" placeholder="+1 234 567 8900" />
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h3 className="text-lg font-bold text-brand-text border-b border-brand-border pb-2">Business & Pricing Rules</h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-2">Currency</label>
                        <select value={currency} onChange={e => setCurrency(e.target.value)} className="input-field">
                          <option value="USD">USD ($)</option>
                          <option value="EUR">EUR (€)</option>
                          <option value="GBP">GBP (£)</option>
                          <option value="NGN">NGN (₦)</option>
                          <option value="KES">KES (KSh)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-2">Pricing Rule</label>
                        <select value={priceType} onChange={e => setPriceType(e.target.value as 'fixed' | 'negotiable')} className="input-field">
                          <option value="fixed">Fixed (Strict)</option>
                          <option value="negotiable">Negotiable (Flexible)</option>
                        </select>
                        <p className="text-[10px] text-brand-muted mt-1">Fixed prevents cashiers from changing prices during sale.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-2">Tax Type</label>
                        <select value={taxType} onChange={e => setTaxType(e.target.value as 'none' | 'percentage' | 'fixed')} className="input-field">
                          <option value="none">No Tax</option>
                          <option value="percentage">Percentage (%)</option>
                          <option value="fixed">Fixed Amount</option>
                        </select>
                      </div>
                      {taxType !== 'none' && (
                        <div>
                          <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-2">Tax Value</label>
                          <CurrencyInput value={taxValue} onChange={val => setTaxValue(val.toString())} />
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 pt-2">
                      <label className="flex items-center gap-3 p-3 rounded-xl border border-brand-border hover:bg-brand-bg cursor-pointer">
                        <input type="checkbox" checked={allowSplitPayments} onChange={e => setAllowSplitPayments(e.target.checked)} className="w-5 h-5 rounded text-brand-accent focus:ring-brand-accent bg-brand-surface border-brand-border" />
                        <div>
                          <p className="font-bold text-brand-text text-sm">Allow Split Payments</p>
                          <p className="text-xs text-brand-muted">Customers can pay with multiple methods (e.g., Cash + Card).</p>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 p-3 rounded-xl border border-brand-border hover:bg-brand-bg cursor-pointer">
                        <input type="checkbox" checked={allowPendingSales} onChange={e => setAllowPendingSales(e.target.checked)} className="w-5 h-5 rounded text-brand-accent focus:ring-brand-accent bg-brand-surface border-brand-border" />
                        <div>
                          <p className="font-bold text-brand-text text-sm">Allow Pending Sales</p>
                          <p className="text-xs text-brand-muted">Save a cart and resume it later.</p>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 p-3 rounded-xl border border-brand-border hover:bg-brand-bg cursor-pointer">
                        <input type="checkbox" checked={allowBackdatedSales} onChange={e => setAllowBackdatedSales(e.target.checked)} className="w-5 h-5 rounded text-brand-accent focus:ring-brand-accent bg-brand-surface border-brand-border" />
                        <div>
                          <p className="font-bold text-brand-text text-sm">Allow Backdated Sales</p>
                          <p className="text-xs text-brand-muted">Enable entering sales for previous days or months.</p>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-6 border-t border-brand-border">
                  <button onClick={handleSaveStep1} disabled={isSaving} className="btn-primary px-8 flex items-center gap-2">
                    Next Step <ArrowRight size={20} />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 2: Hardware Setup */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-brand-text flex items-center gap-3">
                    <Printer className="text-brand-accent" /> Hardware & Receipts
                  </h2>
                  <p className="text-brand-muted">Configure how you interact with physical devices.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <h3 className="text-lg font-bold text-brand-text border-b border-brand-border pb-2">Devices</h3>
                    
                    <div>
                      <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-2">Scanner Type</label>
                      <select value={scannerType} onChange={e => setScannerType(e.target.value as 'camera' | 'barcode')} className="input-field">
                        <option value="camera">Device Camera (Mobile/Tablet)</option>
                        <option value="barcode">External Barcode Scanner (USB/Bluetooth)</option>
                      </select>
                      <p className="text-[10px] text-brand-muted mt-1">Camera uses your device's lens. External listens for keyboard input.</p>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-2">Printer Paper Size</label>
                      <select value={paperSize} onChange={e => setPaperSize(e.target.value as 'thermal' | 'a4' | 'a2')} className="input-field">
                        <option value="thermal">Thermal Receipt (58mm/80mm)</option>
                        <option value="a4">A4 Standard</option>
                        <option value="a2">A2 Large</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-2">Print Behavior</label>
                        <select value={printBehavior} onChange={e => setPrintBehavior(e.target.value as 'ask' | 'auto' | 'none')} className="input-field">
                          <option value="ask">Ask before printing</option>
                          <option value="auto">Auto-print after sale</option>
                          <option value="none">Don't print</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-2">Copies</label>
                        <input type="number" min="1" max="5" value={receiptCopies} onChange={e => setReceiptCopies(e.target.value)} className="input-field" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h3 className="text-lg font-bold text-brand-text border-b border-brand-border pb-2">Receipt Customization</h3>
                    
                    <div className="space-y-3 pt-2">
                      <label className="flex items-center gap-3 p-3 rounded-xl border border-brand-border hover:bg-brand-bg cursor-pointer">
                        <input type="checkbox" checked={printAccountName} onChange={e => setPrintAccountName(e.target.checked)} className="w-5 h-5 rounded text-brand-accent focus:ring-brand-accent bg-brand-surface border-brand-border" />
                        <div>
                          <p className="font-bold text-brand-text text-sm">Print Cashier Name</p>
                          <p className="text-xs text-brand-muted">Show who processed the transaction.</p>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 p-3 rounded-xl border border-brand-border hover:bg-brand-bg cursor-pointer">
                        <input type="checkbox" checked={includeCustomerName} onChange={e => setIncludeCustomerName(e.target.checked)} className="w-5 h-5 rounded text-brand-accent focus:ring-brand-accent bg-brand-surface border-brand-border" />
                        <div>
                          <p className="font-bold text-brand-text text-sm">Print Customer Name</p>
                          <p className="text-xs text-brand-muted">Show customer details if attached to sale.</p>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 p-3 rounded-xl border border-brand-border hover:bg-brand-bg cursor-pointer">
                        <input type="checkbox" checked={printStoreAccountOnReceipt} onChange={e => setPrintStoreAccountOnReceipt(e.target.checked)} className="w-5 h-5 rounded text-brand-accent focus:ring-brand-accent bg-brand-surface border-brand-border" />
                        <div>
                          <p className="font-bold text-brand-text text-sm">Print Pharmacy Bank Details</p>
                          <p className="text-xs text-brand-muted">Useful for bank transfer payments.</p>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between pt-6 border-t border-brand-border">
                  <button onClick={() => setStep(1)} className="btn-secondary px-6 flex items-center gap-2">
                    <ArrowLeft size={20} /> Back
                  </button>
                  <button onClick={handleSaveStep2} disabled={isSaving} className="btn-primary px-8 flex items-center gap-2">
                    Next Step <ArrowRight size={20} />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Add Staff */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-brand-text flex items-center gap-3">
                    <Users className="text-brand-accent" /> Add Staff
                  </h2>
                  <p className="text-brand-muted">Add workers to your pharmacy. You can also do this later.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-brand-bg p-6 rounded-2xl border border-brand-border">
                    <h3 className="text-lg font-bold text-brand-text mb-4">Create New User</h3>
                    <form onSubmit={handleAddStaff} className="space-y-4">
                      <div>
                        <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-1">Full Name</label>
                        <input type="text" value={newStaffName} onChange={e => setNewStaffName(e.target.value)} className="input-field" placeholder="John Doe" required />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-1">Username</label>
                        <input type="text" value={newStaffUsername} onChange={e => setNewStaffUsername(e.target.value)} className="input-field" placeholder="johndoe" required />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-1">Password</label>
                        <input type="password" value={newStaffPassword} onChange={e => setNewStaffPassword(e.target.value)} className="input-field" placeholder="••••••••" required />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-1">Role</label>
                        <select value={newStaffRole} onChange={e => setNewStaffRole(e.target.value)} className="input-field">
                          {roles.map(r => (
                            <option key={r.id} value={r.name}>{r.name}</option>
                          ))}
                        </select>
                      </div>
                      <button type="submit" className="btn-primary w-full py-3 mt-2">Add Staff Member</button>
                    </form>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-brand-text mb-4">Current Staff ({staffList.length})</h3>
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                      {staffList.map(staff => (
                        <div key={staff.id} className="p-4 bg-brand-surface border border-brand-border rounded-xl flex items-center justify-between">
                          <div>
                            <p className="font-bold text-brand-text">{staff.name}</p>
                            <p className="text-xs text-brand-muted">@{staff.username}</p>
                          </div>
                          <span className="px-3 py-1 bg-brand-accent/10 text-brand-accent text-xs font-bold rounded-full uppercase">
                            {staff.roleName || staff.role}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between pt-6 border-t border-brand-border">
                  <button onClick={() => setStep(2)} className="btn-secondary px-6 flex items-center gap-2">
                    <ArrowLeft size={20} /> Back
                  </button>
                  <button onClick={() => setStep(4)} className="btn-primary px-8 flex items-center gap-2">
                    Next Step <ArrowRight size={20} />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 4: Initial Products */}
            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-brand-text flex items-center gap-3">
                    <Package className="text-brand-accent" /> Initial Products
                  </h2>
                  <p className="text-brand-muted">Add some products to your inventory. You can skip this and add more later.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-brand-bg p-6 rounded-2xl border border-brand-border">
                    <h3 className="text-lg font-bold text-brand-text mb-4">Add Product</h3>
                    <form onSubmit={handleAddProduct} className="space-y-4">
                      <div>
                        <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-1">Product Name</label>
                        <input type="text" value={newProductName} onChange={e => setNewProductName(e.target.value)} className="input-field" placeholder="e.g. Coca Cola" required />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-1">Price ({settings.currencySymbol})</label>
                          <CurrencyInput value={newProductPrice} onChange={val => setNewProductPrice(val.toString())} placeholder="0.00" required />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-1">Stock</label>
                          <CurrencyInput value={newProductStock} onChange={val => setNewProductStock(val.toString())} placeholder="0" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-1">Category</label>
                        <input type="text" value={newProductCategory} onChange={e => setNewProductCategory(e.target.value)} className="input-field" placeholder="e.g. Drinks" />
                      </div>
                      <button type="submit" disabled={isSaving} className="btn-primary w-full py-3 mt-2">
                        {isSaving ? 'Adding...' : 'Add Product'}
                      </button>
                    </form>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-brand-text mb-4">Added Products ({productList.length})</h3>
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                      {productList.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed border-brand-border rounded-2xl">
                          <Package size={48} className="text-brand-muted mx-auto mb-4 opacity-20" />
                          <p className="text-brand-muted font-medium">No products added yet</p>
                        </div>
                      ) : (
                        productList.map(product => (
                          <div key={product.id} className="p-4 bg-brand-surface border border-brand-border rounded-xl flex items-center justify-between">
                            <div>
                              <p className="font-bold text-brand-text">{product.name}</p>
                              <p className="text-xs text-brand-muted">{product.category}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-brand-accent">{settings.currencySymbol}{product.price}</p>
                              <p className="text-[10px] text-brand-muted uppercase font-bold">{product.stock} in stock</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between pt-6 border-t border-brand-border">
                  <button onClick={() => setStep(3)} className="btn-secondary px-6 flex items-center gap-2">
                    <ArrowLeft size={20} /> Back
                  </button>
                  <button onClick={() => setStep(5)} className="btn-primary px-8 flex items-center gap-2">
                    Next Step <ArrowRight size={20} />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 5: Finish */}
            {step === 5 && (
              <motion.div
                key="step5"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="text-center space-y-8 py-12"
              >
                <div className="w-24 h-24 bg-emerald-500/10 rounded-3xl flex items-center justify-center text-emerald-500 mx-auto shadow-inner">
                  <ShieldCheck size={48} />
                </div>
                <div className="space-y-4">
                  <h1 className="text-4xl font-black text-brand-text">Congratulations!</h1>
                  <p className="text-xl text-brand-muted max-w-2xl mx-auto">
                    Your pharmacy is now set up. Start adding drugs and products to finish this wizard and see the power of Pharmacy Flow.
                  </p>
                  <p className="text-sm text-brand-muted mt-4">
                    Feel free to contact support if you have any challenges.
                  </p>
                </div>
                <div className="pt-8 flex justify-center">
                  <button
                    onClick={handleFinish}
                    disabled={isSaving}
                    className="btn-primary px-12 py-4 text-lg flex items-center gap-3"
                  >
                    <Package size={24} /> Finish & Go to Inventory
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
