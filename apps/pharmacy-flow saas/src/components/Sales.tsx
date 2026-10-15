import React, { useEffect, useState } from 'react';
import { Search, ShoppingCart, Trash2, CreditCard, Banknote, Plus, Minus, Package, ArrowRight, Users, Camera, FileText, ArrowRightLeft, Clock, X, Moon, Sun, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, SaleItem, Account } from '../types';

interface PendingSale {
  id: string;
  cart: SaleItem[];
  paymentMethod: 'cash' | 'card' | 'transfer' | 'debt';
  splitPayments: { cash: number; card: number; transfer: number; debt: number };
  selectedAccountId: string;
  amountPaid: string;
  dueDate: string;
  isAmountPaidManual: boolean;
  pricingMode: 'retail' | 'wholesale';
  timestamp: Date;
}

const AnimatedClock = ({ size, className, isFast, hasItems }: { size: number, className?: string, isFast?: boolean, hasItems?: boolean }) => {
  return (
    <div 
      style={{ width: size, height: size }} 
      className={cn(
        "relative rounded-full transition-all duration-500 flex items-center justify-center", 
        hasItems && "shadow-[0_0_25px_var(--color-brand-accent)] bg-brand-accent/10 border border-brand-accent/20",
        className
      )}
    >
      {hasItems && (
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <div className="absolute inset-0 bg-white/20 -translate-x-full animate-[shimmer_2s_infinite] skew-x-[-20deg]" />
        </div>
      )}
      <svg
        width={size * 0.8}
        height={size * 0.8}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("relative z-10", hasItems && "text-brand-accent")}
      >
        <circle cx="12" cy="12" r="10" className="opacity-20" />
        {/* Minute hand */}
        <motion.line
          x1="12"
          y1="12"
          x2="12"
          y2="6"
          animate={isFast ? { rotate: 360 } : { rotate: 0 }}
          transition={isFast ? { 
            duration: 0.5, 
            repeat: Infinity, 
            ease: "linear" 
          } : { duration: 0.5 }}
          style={{ originX: "12px", originY: "12px" }}
        />
        {/* Hour hand */}
        <motion.line
          x1="12"
          y1="12"
          x2="16"
          y2="12"
          animate={isFast ? { rotate: 360 } : { rotate: 0 }}
          transition={isFast ? { 
            duration: 2, 
            repeat: Infinity, 
            ease: "easeInOut"
          } : { duration: 0.5 }}
          style={{ originX: "12px", originY: "12px" }}
        />
      </svg>
    </div>
  );
};

import { apiFetch } from '../lib/api';
import { useSettings } from '../context/SettingsContext';
import { useNotification } from '../context/NotificationContext';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import BarcodeScanner from './BarcodeScanner';
import { printerService, ReceiptData, ReceiptItem } from '../services/printerService';
import type { PrintData } from '../utils/printer';
import CurrencyInput from './CurrencyInput';

import { formatCurrency, formatNumber } from '../utils/formatters';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Sales({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const { showNotification } = useNotification();
  const { theme, toggleTheme } = useTheme();
  const [products, setProducts] = useState<Product[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer' | 'debt'>('cash');

  const [splitPayments, setSplitPayments] = useState<{
    cash: number;
    card: number;
    transfer: number;
    debt: number;
  }>({ cash: 0, card: 0, transfer: 0, debt: 0 });
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [isAmountPaidManual, setIsAmountPaidManual] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [saleDate, setSaleDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [viewType, setViewType] = useState<'product' | 'service'>('product');
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastPrintData, setLastPrintData] = useState<PrintData | null>(null);
  const [accountMode, setAccountMode] = useState<'existing' | 'new'>('existing');
  const [pricingMode, setPricingMode] = useState<'retail' | 'wholesale'>('retail');
  const [customerName, setCustomerName] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountPhone, setNewAccountPhone] = useState('');
  const [newAccountEmail, setNewAccountEmail] = useState('');
  const [newAccountAddress, setNewAccountAddress] = useState('');
  const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
  const [isPendingModalOpen, setIsPendingModalOpen] = useState(false);
  const { settings, playSound } = useSettings();
  const { user } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
    const isDirty = cart.length > 0 || customerName !== '';
    if (onDirtyChange) onDirtyChange(isDirty);
    return () => { if (onDirtyChange) onDirtyChange(false); };
  }, [cart, customerName, onDirtyChange]);

  const [isClockFast, setIsClockFast] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [barcodeBuffer, setBarcodeBuffer] = useState('');
  const [expiredWarning, setExpiredWarning] = useState<{ name: string; days: number } | null>(null);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Only listen if scanner type is barcode and no modal is open
      if (settings.scannerType !== 'barcode' || showPrintModal || showSuccessModal || isScannerOpen) return;

      // Ignore if typing in an input field (unless it's the search field)
      if (document.activeElement?.tagName === 'INPUT' && document.activeElement !== document.querySelector('input[type="text"]')) return;

      if (e.key === 'Enter') {
        const trimmedBuffer = barcodeBuffer.trim();
        if (trimmedBuffer.length > 2) {
          const product = products.find(p => 
            p.sku === trimmedBuffer || 
            (p.alias && p.alias.toLowerCase() === trimmedBuffer.toLowerCase())
          );
          if (product) {
            addToCart(product);
            playSound('success');
          } else {
            playSound('alert');
          }
        }
        setBarcodeBuffer('');
      } else if (e.key.length === 1) {
        setBarcodeBuffer(prev => prev + e.key);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [settings.scannerType, barcodeBuffer, products, showPrintModal, showSuccessModal, isScannerOpen]);

  useEffect(() => {
    apiFetch('/api/products')
      .then(res => res.json())
      .then(data => setProducts(Array.isArray(data) ? data : []))
      .catch(err => {
        console.error('Failed to fetch products:', err);
        setProducts([]);
      });
    apiFetch('/api/accounts')
      .then(res => res.json())
      .then(data => setAccounts(Array.isArray(data) ? data : []))
      .catch(err => {
        console.error('Failed to fetch accounts:', err);
        setAccounts([]);
      });

    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const filteredProducts = products.filter(p => {
    if (search.length === 0) return false;
    
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      (p.alias && p.alias.toLowerCase().includes(search.toLowerCase()));
    
    return matchesSearch && (p.type || 'product') === viewType;
  });

  const [showConfirm, setShowConfirm] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const addToCart = (product: Product) => {
    // Trigger fast clock animation
    setIsClockFast(true);
    setTimeout(() => setIsClockFast(false), 2000);

    // Clear search after adding to cart
    setSearch('');

    // Check for expiry
    if (product.expiryDate && new Date(product.expiryDate) < new Date()) {
      const expiryDate = new Date(product.expiryDate);
      const diffTime = Math.abs(new Date().getTime() - expiryDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      setExpiredWarning({ name: product.name, days: diffDays });
      playSound('alert');
      
      // Auto-remove from store and inventory
      apiFetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock: 0, active: 0 })
      }).then(() => {
        setProducts(products.map(p => p.id === product.id ? { ...p, stock: 0, active: 0 } : p));
        showNotification('error', `${product.name} has expired and been removed from the store.`);
      });

      setTimeout(() => setExpiredWarning(null), 5000);
      return;
    }

    // FIFO/FEFO Implementation: Check if there's a batch of the same product that expires sooner
    // We look for products with the same name (or SKU if preferred, but name is safer for different batches of same product)
    const soonerExpiryProduct = products
      .filter(p => 
        p.name === product.name && 
        p.stock > 0 && 
        p.id !== product.id && 
        p.expiryDate && 
        new Date(p.expiryDate) > new Date() // Must not be expired
      )
      .sort((a, b) => new Date(a.expiryDate!).getTime() - new Date(b.expiryDate!).getTime())[0];

    const productToUse = (soonerExpiryProduct && product.expiryDate && 
      new Date(soonerExpiryProduct.expiryDate!).getTime() < new Date(product.expiryDate).getTime())
      ? soonerExpiryProduct
      : product;

    if (productToUse.id !== product.id) {
      showNotification('info', `FIFO Recommendation: A batch of "${productToUse.name}" expiring sooner (${productToUse.expiryDate}) has been selected instead.`);
    }

    const price = pricingMode === 'wholesale' && productToUse.wholesalePrice 
      ? productToUse.wholesalePrice 
      : productToUse.price;

    const existing = cart.find(item => item.productId === productToUse.id);
    if (existing) {
      setCart(cart.map(item => 
        item.productId === productToUse.id 
          ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.price }
          : item
      ));
    } else {
      setCart([...cart, {
        productId: productToUse.id,
        productName: productToUse.name,
        quantity: 1,
        price: price,
        cost: productToUse.cost,
        originalPrice: price,
        total: price
      }]);
    }
    playSound('success');
  };

  const handleHoldSale = () => {
    if (cart.length === 0) return;
    
    const newPendingSale: PendingSale = {
      id: Math.random().toString(36).substr(2, 9),
      cart: [...cart],
      paymentMethod,
      splitPayments: { ...splitPayments },
      selectedAccountId,
      amountPaid,
      dueDate,
      isAmountPaidManual,
      pricingMode,
      timestamp: new Date()
    };

    setPendingSales(prev => [newPendingSale, ...prev]);
    
    // Trigger fast clock animation
    setIsClockFast(true);
    setTimeout(() => setIsClockFast(false), 2000);
    
    // Reset current sale
    setCart([]);
    setPaymentMethod('cash');
    setSplitPayments({ cash: 0, card: 0, transfer: 0, debt: 0 });
    setSelectedAccountId('');
    setAmountPaid('');
    setDueDate('');
    setIsAmountPaidManual(false);
    setPricingMode('retail');
    
    showNotification('success', 'Sale put on hold.');
    playSound('success');
  };

  const handleResumeSale = (pending: PendingSale) => {
    if (cart.length > 0) {
      // If there's already something in the cart, maybe we should ask or just hold the current one too?
      // For simplicity, let's hold the current one if it's not empty
      handleHoldSale();
    }

    setCart(pending.cart);
    setPaymentMethod(pending.paymentMethod);
    setSplitPayments(pending.splitPayments);
    setSelectedAccountId(pending.selectedAccountId);
    setAmountPaid(pending.amountPaid);
    setDueDate(pending.dueDate);
    setIsAmountPaidManual(pending.isAmountPaidManual);
    setPricingMode(pending.pricingMode);

    setPendingSales(prev => prev.filter(p => p.id !== pending.id));
    setIsPendingModalOpen(false);
    showNotification('info', 'Sale resumed.');
    playSound('success');
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.productId === productId) {
        const newQty = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQty, total: newQty * item.price };
      }
      return item;
    }));
  };

  const updatePrice = (productId: string, price: number) => {
    setCart(cart.map(item => {
      if (item.productId === productId) {
        return { ...item, price, total: item.quantity * price };
      }
      return item;
    }));
  };

  const removeFromCart = (productId: string) => {
    const item = cart.find(i => i.productId === productId);
    if (!item) return;

    setShowConfirm({
      show: true,
      title: 'Remove Item',
      message: `Are you sure you want to remove ${item.productName} from the cart?`,
      onConfirm: () => {
        setCart(cart.filter(i => i.productId !== productId));
        setShowConfirm(prev => ({ ...prev, show: false }));
        playSound('alert');
      }
    });
  };

  const updateSerialNumber = (productId: string, serialNumber: string) => {
    setCart(cart.map(item => 
      item.productId === productId 
        ? { ...item, serialNumber }
        : item
    ));
  };

  const subTotal = cart.reduce((sum, item) => sum + item.total, 0);
  let taxAmount = 0;
  if (settings.taxType === 'percentage') {
    taxAmount = subTotal * ((settings.taxValue || 0) / 100);
  } else if (settings.taxType === 'fixed') {
    taxAmount = settings.taxValue || 0;
  }
  const totalAmount = subTotal + taxAmount;

  // Auto-fill amount paid when total changes or account is cleared
  useEffect(() => {
    if (totalAmount === 0) {
      setIsAmountPaidManual(false);
      setAmountPaid('0');
      setSplitPayments({ cash: 0, card: 0, transfer: 0, debt: 0 });
    } else if (paymentMethod === 'debt') {
      setAmountPaid('0');
      setSplitPayments({ cash: 0, card: 0, transfer: 0, debt: totalAmount });
    } else if (!selectedAccountId || !isAmountPaidManual) {
      setAmountPaid(totalAmount.toString());
      if (paymentMethod === 'cash') setSplitPayments({ cash: totalAmount, card: 0, transfer: 0, debt: 0 });
      if (paymentMethod === 'card') setSplitPayments({ cash: 0, card: totalAmount, transfer: 0, debt: 0 });
      if (paymentMethod === 'transfer') setSplitPayments({ cash: 0, card: 0, transfer: totalAmount, debt: 0 });
    }
  }, [totalAmount, selectedAccountId, isAmountPaidManual, paymentMethod]);

  const [accountSearch, setAccountSearch] = useState('');

  const filteredAccounts = accounts.filter(c => 
    c.name.toLowerCase().includes(accountSearch.toLowerCase()) || 
    c.phone.includes(accountSearch)
  );

  const handlePaymentMethodChange = (method: 'cash' | 'card' | 'transfer' | 'debt') => {
    setPaymentMethod(method);
    if (method === 'debt') {
      if (!selectedAccountId) {
        setIsAccountModalOpen(true);
      }
    } else {
      setSelectedAccountId('');
    }
  };

  const validatePhoneNumber = (phone: string) => {
    const digitsOnly = phone.replace(/\D/g, '');
    return digitsOnly.length === 11 && digitsOnly === phone;
  };

  const checkDuplicateAccount = (phone: string) => {
    return accounts.find(c => c.phone === phone);
  };

  const handleRegisterAccount = async () => {
    if (!newAccountName.trim()) {
      showNotification('error', 'Please enter a name for the new account.');
      return;
    }
    if (!validatePhoneNumber(newAccountPhone)) {
      showNotification('error', 'Phone number must be exactly 11 digits (numbers only).');
      return;
    }

    const existing = checkDuplicateAccount(newAccountPhone);
    if (existing) {
      showNotification('info', `An account with this phone number already exists: ${existing.name}`);
      setSelectedAccountId(existing.id);
      setIsAccountModalOpen(false);
      setAccountMode('existing');
      return;
    }

    setIsProcessing(true);
    try {
      const accountRes = await apiFetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: newAccountName, 
          phone: newAccountPhone,
          email: newAccountEmail,
          address: newAccountAddress
        })
      });
      if (accountRes.ok) {
        const newAccount = await accountRes.json();
        setAccounts(prev => [...prev, newAccount]);
        setSelectedAccountId(newAccount.id);
        setIsAccountModalOpen(false);
        setNewAccountName('');
        setNewAccountPhone('');
        setNewAccountEmail('');
        setNewAccountAddress('');
        setAccountMode('existing');
        playSound('success');
      } else {
        const err = await accountRes.json();
        showNotification('error', `Failed to create account: ${err.error}`);
      }
    } catch (err) {
      showNotification('error', 'Error creating account.');
    } finally {
      setIsProcessing(false);
    }
  };

  const executePrint = async (data: any) => {
    const copies = settings.receiptCopies || 1;
    
    // Map to new ReceiptData format
    const receiptData: ReceiptData = {
      shopName: data.storeName,
      shopAddress: data.storeAddress,
      shopPhone: data.phoneNumber,
      orderId: data.receiptId || '0000',
      date: data.date.toLocaleString(),
      items: data.items.map((item: any) => ({
        name: item.productName,
        price: item.price,
        qty: item.quantity,
        total: item.price * item.quantity
      })),
      subtotal: data.subTotal || data.totalAmount,
      tax: data.taxAmount || 0,
      discount: 0, // Sales data doesn't seem to have discount explicitly in PrintData yet
      grandTotal: data.totalAmount,
      receivedAmount: data.amountPaid,
      changeAmount: data.change,
      customerName: data.customerName,
      footerMessage: data.receiptMessage
    };

    for (let i = 0; i < copies; i++) {
      try {
        if (settings.printMethod === 'bluetooth') {
          const printerId = settings.defaultPrinterId || (settings.pairedPrinters && settings.pairedPrinters.length > 0 ? settings.pairedPrinters[0].id : null);
          
          if (!printerId) {
            throw new Error('No Bluetooth printer selected. Please connect and select a printer in Settings.');
          }

          // Ensure connected to the CORRECT printer
          if (!printerService.isConnectedTo(printerId)) {
            await printerService.connect(printerId);
          }
          await printerService.printReceipt(receiptData, settings.currencySymbol);
        } else {
          // Fallback to legacy printer utility for non-bluetooth or if no printer selected
          // We can eventually migrate all of them, but the user specifically asked for Bluetooth with the new plugin
          // For now, let's keep the others using the old utility or implement them in printerService
          
          // Re-importing old utility dynamically or keeping it for now
          const { receiptPrinter } = await import('../utils/printer');
          const bytes = receiptPrinter.generateReceipt(data, settings.paperSize);
          
          if (settings.printMethod === 'android') {
            await receiptPrinter.printViaAndroid(bytes);
          } else if (settings.printMethod === 'browser') {
            receiptPrinter.printViaBrowser(data, settings.paperSize || '80mm');
          } else {
            receiptPrinter.printViaDeepLink(bytes);
          }
        }
      } catch (err: any) {
        console.error('Printing failed:', err);
        showNotification('error', err.message || 'Printing failed. Please check your printer connection.');
        break; // Stop if one copy fails
      }
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;

    if (cart.some(item => item.quantity <= 0)) {
      showNotification('error', 'Some items have 0 quantity. Please update or remove them.');
      return;
    }
    
    // Validation
    const parsedAmount = parseFloat(amountPaid);
    const finalAmountPaid = isNaN(parsedAmount) ? 0 : parsedAmount;

    // Split Payment Validation
    if (settings.allowSplitPayments) {
      const splitTotal = (Object.values(splitPayments) as number[]).reduce((sum, val) => sum + (val || 0), 0);
      const diff = Math.abs(splitTotal - totalAmount);
      
      if (diff > 0.01) {
        const isMore = splitTotal > totalAmount;
        const diffText = `${settings.currencySymbol}${diff.toFixed(2)}`;
        showNotification('error', `Split payment total (${settings.currencySymbol}${splitTotal.toFixed(2)}) does not match cart total (${settings.currencySymbol}${totalAmount.toFixed(2)}). It is ${isMore ? 'more' : 'less'} by ${diffText}.`);
        setIsProcessing(false);
        return;
      }
    }
    
    let accountId = selectedAccountId;
    const account = accounts.find(c => c.id === accountId);

    // Debt Limit Check
    const totalDebtAmount = paymentMethod === 'debt' ? totalAmount : (totalAmount - finalAmountPaid);
    if (totalDebtAmount > 0 && account) {
      // Priority: Account-specific limit > App-wide limit
      let effectiveLimit = Infinity;
      if (account.debtLimit !== undefined && account.debtLimit !== null) {
        effectiveLimit = Number(account.debtLimit);
      } else if (settings.debtLimitType === 'fixed') {
        effectiveLimit = settings.debtLimitAmount || 0;
      }

      if ((account.totalDebt + totalDebtAmount) > effectiveLimit) {
        showNotification('error', `Debt limit exceeded! This account's total debt would be ${settings.currencySymbol}${(account.totalDebt + totalDebtAmount || 0).toLocaleString()}, which is above the limit of ${settings.currencySymbol}${(effectiveLimit || 0).toLocaleString()}.`);
        setIsProcessing(false);
        return;
      }
    }

    if ((paymentMethod === 'debt' || finalAmountPaid < totalAmount) && !accountId) {
      showNotification('error', 'Please select or register an account for debt/partial payment.');
      setIsAccountModalOpen(true);
      setIsProcessing(false);
      return;
    }

    setIsProcessing(true);
    try {
      const res = await apiFetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart,
          totalAmount,
          paymentMethod: settings.allowSplitPayments ? 'split' : paymentMethod,
          splitPayments: settings.allowSplitPayments ? splitPayments : undefined,
          accountId: accountId || undefined,
          amountPaid: finalAmountPaid,
          dueDate: dueDate || undefined,
          saleDate: settings.allowBackdatedSales ? saleDate : undefined,
          userId: user?.id,
          customerName: customerName || undefined
        })
      });
      if (res.ok) {
        const responseData = await res.json();
        const printData: PrintData = {
          storeName: settings.storeName || 'Store',
          storeAddress: settings.storeAddress || '',
          phoneNumber: settings.phoneNumber || '',
          receiptMessage: (settings.receiptMessage || 'Thank you!').replace('{storeName}', settings.storeName || 'Store'),
          items: cart,
          totalAmount,
          paymentMethod: settings.allowSplitPayments ? 'Split Payment' : paymentMethod,
          accountName: settings.printAccountName ? (account?.name || newAccountName || 'Attendant') : undefined,
          customerName: settings.includeCustomerName ? customerName : undefined,
          date: new Date(),
          currencySymbol: settings.currencySymbol || '$',
          receiptId: responseData.receiptId || responseData.saleId,
          taxType: settings.taxType,
          taxValue: settings.taxValue,
          taxAmount,
          subTotal,
          bankName: settings.bankName,
          accountNameDetails: settings.accountName,
          accountNumber: settings.accountNumber,
          storeLogo: settings.storeLogo,
          printLogoOnReceipt: settings.printLogoOnReceipt,
          printStoreAccountOnReceipt: settings.printStoreAccountOnReceipt && (paymentMethod === 'debt' || splitPayments.debt > 0)
        };

        if (settings.printBehavior === 'auto') {
          executePrint(printData);
          setShowSuccessModal(true);
        } else if (settings.printBehavior === 'ask') {
          setLastPrintData(printData);
          setShowPrintModal(true);
        } else {
          setShowSuccessModal(true);
        }
        playSound('success');

        setCart([]);
        setSelectedAccountId('');
        setNewAccountName('');
        setCustomerName('');
        setNewAccountPhone('');
        setAccountMode('existing');
        setAmountPaid('');
        setDueDate('');
        setSaleDate(new Date().toISOString().split('T')[0]);
        setIsAmountPaidManual(false);
        setPaymentMethod('cash');
        apiFetch('/api/products')
          .then(res => res.json())
          .then(setProducts)
          .catch(err => console.error('Failed to refresh products:', err));
      } else {
        const err = await res.json();
        showNotification('error', `Checkout failed: ${err.error || 'Unknown error'}`);
        console.error(`Error processing sale: ${err.error}`);
      }
    } catch (err) {
      showNotification('error', 'Error processing sale. Please check your connection.');
      console.error('Error processing sale');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrintConfirm = () => {
    if (lastPrintData) {
      executePrint(lastPrintData);
    }
    setShowPrintModal(false);
    setShowSuccessModal(true);
  };

  const handlePrintCancel = () => {
    setShowPrintModal(false);
    setShowSuccessModal(true);
  };

  return (
    <div className="space-y-0 relative">
      <AnimatePresence>
        {expiredWarning && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4"
          >
            <div className="bg-rose-600 text-white p-6 rounded-3xl shadow-2xl border-4 border-white/20 flex flex-col items-center text-center gap-4 animate-pulse">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                <AlertTriangle size={32} className="text-white" />
              </div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter">Expired Product!</h3>
                <p className="text-sm font-bold opacity-90 mt-1">
                  "{expiredWarning.name}" recently added to cart has expired {expiredWarning.days} days ago.
                </p>
                <p className="text-xs mt-3 bg-black/20 py-2 px-4 rounded-full inline-block">
                  Item removed from cart & store. Inventory updated.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col items-center text-center gap-1 mb-2 lg:mb-4">
        <div className="hidden sm:block">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-brand-text">
            New Sale
          </h2>
          <p className="text-sm text-brand-muted mt-1">Process transactions and manage customer orders</p>
        </div>
      </div>

      {/* Top Quick Search Bar */}
      <div className="px-4 py-2 max-w-4xl mx-auto w-full z-20 bg-brand-surface lg:static lg:bg-transparent lg:border-none lg:backdrop-blur-none">
        <div className="flex flex-col gap-4">
          <div className="relative flex gap-2">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted" />
              <input 
                type="text" 
                placeholder="Quick scan or search products..." 
                className="input-field pl-12 pr-10 py-3 text-sm shadow-sm focus:ring-2 focus:ring-brand-accent/20"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
              {search && (
                <button 
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-brand-bg rounded-full text-brand-muted"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              onClick={() => {
                if (settings.scannerType === 'camera') {
                  setIsScannerOpen(true);
                }
              }}
              className={cn(
                "p-3 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 shadow-sm",
                settings.scannerType === 'camera' 
                  ? "bg-brand-bg hover:bg-brand-border text-brand-text" 
                  : "bg-emerald-50 text-emerald-600 border border-emerald-100 cursor-default"
              )}
              title={settings.scannerType === 'camera' ? "Scan Barcode" : "External Scanner Active"}
            >
              {settings.scannerType === 'camera' ? <Camera size={20} /> : <Search size={20} />}
            </button>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex border-b border-brand-border p-1 bg-brand-bg/50 rounded-2xl w-fit">
              <button
                onClick={() => setViewType('product')}
                className={cn(
                  "px-6 py-2 text-[10px] font-black uppercase tracking-widest transition-all duration-300 rounded-xl relative overflow-hidden group",
                  viewType === 'product' 
                    ? "bg-brand-accent text-white shadow-[0_4px_12px_rgba(124,58,237,0.2)] border border-white/20" 
                    : "text-brand-muted hover:text-brand-text hover:bg-brand-surface/50"
                )}
              >
                <div className="flex items-center gap-2 relative z-10">
                  <Package size={14} />
                  <span>Products</span>
                </div>
              </button>
              <button
                onClick={() => setViewType('service')}
                className={cn(
                  "px-6 py-2 text-[10px] font-black uppercase tracking-widest transition-all duration-300 rounded-xl relative overflow-hidden group",
                  viewType === 'service' 
                    ? "bg-brand-accent text-white shadow-[0_4px_12px_rgba(124,58,237,0.2)] border border-white/20" 
                    : "text-brand-muted hover:text-brand-text hover:bg-brand-surface/50"
                )}
              >
                <div className="flex items-center gap-2 relative z-10">
                  <Clock size={14} />
                  <span>Services</span>
                </div>
              </button>
            </div>

            <div className="flex items-center gap-2 bg-brand-bg/50 p-1 rounded-2xl border border-brand-border/50">
              <button
                onClick={() => setPricingMode('retail')}
                className={cn(
                  "px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all duration-300 rounded-xl relative overflow-hidden",
                  pricingMode === 'retail' 
                    ? "bg-brand-accent text-white shadow-[0_4px_12px_rgba(124,58,237,0.2)] border border-white/20" 
                    : "text-brand-muted hover:text-brand-text"
                )}
              >
                <span className="relative z-10">Retail</span>
              </button>
              <button
                onClick={() => setPricingMode('wholesale')}
                className={cn(
                  "px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all duration-300 rounded-xl relative overflow-hidden",
                  pricingMode === 'wholesale' 
                    ? "bg-brand-accent text-white shadow-[0_4px_12px_rgba(124,58,237,0.2)] border border-white/20" 
                    : "text-brand-muted hover:text-brand-text"
                )}
              >
                <span className="relative z-10">Wholesale</span>
              </button>
            </div>
          </div>
        </div>

        {/* Search Results Section */}
        {search && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 card p-4 border-brand-accent/30 bg-brand-accent/5 shadow-lg"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-brand-accent">Search Results</h3>
              <span className="text-[10px] text-brand-muted">{filteredProducts.length} items found</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 max-h-[40vh] overflow-y-auto no-scrollbar">
              {filteredProducts.length === 0 ? (
                <div className="col-span-full py-8 text-center text-brand-muted opacity-60">
                  <p className="text-sm">No products found matching "{search}"</p>
                </div>
              ) : (
                filteredProducts.map(product => (
                  <button
                    key={product.id}
                    disabled={product.type !== 'service' && product.stock <= 0}
                    onClick={() => {
                      addToCart(product);
                      setSearch('');
                    }}
                    className="card group hover:border-brand-accent transition-all text-left p-3 flex flex-col justify-between disabled:opacity-50 disabled:grayscale bg-brand-surface"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <div className="w-6 h-6 rounded bg-brand-bg flex items-center justify-center text-brand-muted group-hover:bg-brand-accent group-hover:text-white transition-colors">
                          {product.type === 'service' ? <Clock size={12} /> : <Package size={12} />}
                        </div>
                        <span className="text-xs font-bold text-brand-text">
                          {settings.currencySymbol}{product.price.toFixed(2)}
                        </span>
                      </div>
                      <h4 className="text-[11px] font-bold text-brand-text line-clamp-2 leading-tight">{product.name}</h4>
                    </div>
                    <div className="mt-2 flex justify-between items-center">
                      <span className="text-[9px] font-bold uppercase text-brand-muted">
                        {product.type === 'service' ? 'Service' : `${product.stock} stock`}
                      </span>
                      <Plus size={14} className="text-brand-accent" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </div>

      <div className="flex flex-col lg:grid lg:grid-cols-4 gap-4 h-[calc(100vh-13rem)] lg:h-[calc(100vh-12rem)] relative">
        <div className="lg:col-span-1 hidden lg:block" />
        <div className="lg:col-span-2 h-full">
          {/* Cart / Checkout */}
          <div className="card flex flex-col border-brand-border p-0 h-full overflow-y-auto no-scrollbar mt-1 lg:mt-0">
        <div className="p-4 lg:p-6 border-b border-brand-border bg-brand-bg/30 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart size={20} className="text-brand-accent" />
              <h3 className="text-lg font-bold text-brand-text">Current Sale</h3>
            </div>
            <div className="flex items-center gap-2">
              {settings.allowPendingSales && (
                <button
                  onClick={() => setIsPendingModalOpen(true)}
                  className="relative p-2 hover:bg-brand-bg rounded-xl text-white transition-colors"
                  title="Pending Sales"
                >
                  <motion.div
                    animate={pendingSales.length > 0 ? {
                      y: [0, -4, 0],
                    } : {}}
                    transition={{
                      duration: 0.5,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  >
                    <AnimatedClock size={60} className="text-brand-accent" isFast={isClockFast} hasItems={pendingSales.length > 0} />
                  </motion.div>
                  {pendingSales.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-brand-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-brand-surface">
                      {pendingSales.length}
                    </span>
                  )}
                </button>
              )}
              <span className="bg-brand-accent text-white text-[10px] font-bold px-2 py-1 rounded-full">
                {cart.length} ITEMS
              </span>
            </div>
          </div>
        </div>

        <div className="flex-none p-3 lg:p-4 space-y-3">
          {cart.map(item => (
            <div key={item.productId} className="flex flex-col gap-3 p-4 rounded-2xl border border-brand-border bg-brand-bg/10">
              <div className="flex justify-between items-start gap-4">
                <span className="text-sm font-bold text-brand-text leading-tight">{item.productName}</span>
                <button onClick={() => removeFromCart(item.productId)} className="text-brand-muted hover:text-rose-600 transition-colors">
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1 bg-brand-surface rounded-lg border border-brand-border p-1">
                  <button onClick={() => updateQuantity(item.productId, -1)} className="p-1 hover:bg-brand-bg rounded-md text-brand-muted">
                    <Minus size={12} />
                  </button>
                    <input
                    type="number"
                    className="text-xs font-bold w-12 text-center bg-transparent border-none focus:ring-0 p-0"
                    value={item.quantity === 0 ? '' : item.quantity}
                    onChange={(e) => {
                      const valStr = e.target.value;
                      if (valStr === '') {
                        updateQuantity(item.productId, -item.quantity);
                        return;
                      }
                      const val = parseInt(valStr);
                      if (!isNaN(val)) {
                        updateQuantity(item.productId, val - item.quantity);
                      }
                    }}
                  />
                  <button onClick={() => updateQuantity(item.productId, 1)} className="p-1 hover:bg-brand-bg rounded-md text-brand-muted">
                    <Plus size={12} />
                  </button>
                </div>
                 <div className="flex flex-col items-end gap-1">
                   {settings.priceType === 'negotiable' ? (
                     <div className="relative w-24">
                       <CurrencyInput
                         value={item.price === 0 ? '' : item.price}
                         onChange={val => updatePrice(item.productId, val === '' ? 0 : Number(val))}
                         inputClassName={cn(
                           "pl-5 py-1 text-xs font-bold text-right",
                           item.price < item.cost && "border-rose-500 text-rose-600"
                         )}
                         prefix={settings.currencySymbol}
                       />
                       {item.price < item.cost && (
                         <div className="absolute -top-3 right-0 bg-rose-500 text-white p-0.5 rounded shadow-sm scale-75 origin-right">
                           <AlertTriangle size={10} />
                         </div>
                       )}
                     </div>
                   ) : (
                     <span className={cn(
                       "text-sm font-bold text-brand-text",
                       item.price < item.cost && "text-rose-600"
                     )}>
                       {formatCurrency(item.total, settings.currencySymbol)}
                     </span>
                   )}
                   {item.price < item.cost && (
                     <span className="text-[8px] text-rose-500 font-bold -mt-1">Below Cost!</span>
                   )}
                   {settings.priceType === 'negotiable' && (
                     <span className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">
                       Total: {formatCurrency(item.total, settings.currencySymbol)}
                     </span>
                   )}
                 </div>
              </div>
              <div className="mt-2">
                <input
                  type="text"
                  placeholder="Enter Serial Number (Optional)"
                  className="input-field py-1 text-xs"
                  value={item.serialNumber || ''}
                  onChange={(e) => updateSerialNumber(item.productId, e.target.value)}
                />
              </div>
            </div>
          ))}
          {cart.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-brand-muted opacity-40 space-y-4 py-8 lg:py-12">
              <div className="w-16 h-16 rounded-full bg-brand-bg flex items-center justify-center">
                <ShoppingCart size={32} strokeWidth={1.5} />
              </div>
              <p className="text-sm font-medium">Your cart is empty</p>
            </div>
          )}
        </div>

        <div className="p-3 lg:p-4 border-t border-brand-border bg-brand-bg/30 space-y-4 shrink-0 mt-auto pb-24">
          <div className="space-y-4">
            {paymentMethod === 'debt' && (
              <div className="space-y-3">
                {selectedAccountId ? (
                  <div className="flex items-center justify-between p-3 rounded-xl border border-brand-border bg-brand-bg/20">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-accent/10 flex items-center justify-center text-brand-accent">
                        <Users size={16} />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-brand-text">
                          {accounts.find(c => c.id === selectedAccountId)?.name || 'Unknown Account'}
                        </div>
                        <div className="text-[10px] text-brand-muted">
                          {accounts.find(c => c.id === selectedAccountId)?.phone}
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        setSelectedAccountId('');
                        setIsAccountModalOpen(true);
                      }}
                      className="text-brand-muted hover:text-rose-600 p-1"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setIsAccountModalOpen(true)}
                    className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-brand-border text-brand-muted hover:text-brand-accent hover:border-brand-accent transition-all"
                  >
                    <Plus size={16} />
                    <span className="text-sm font-medium">Select or Register Account</span>
                  </button>
                )}
              </div>
            )}

            {settings.allowSplitPayments ? (
              <div className="space-y-4 pt-2 border-t border-brand-border">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-brand-text">Split Payment</span>
                  <span className={cn(
                    "text-xs font-bold px-2 py-1 rounded-lg",
                    Math.abs((Object.values(splitPayments) as number[]).reduce((a, b) => a + b, 0) - totalAmount) < 0.01 
                      ? "bg-emerald-500/10 text-emerald-500" 
                      : "bg-rose-500/10 text-rose-500"
                  )}>
                    {Math.abs((Object.values(splitPayments) as number[]).reduce((a, b) => a + b, 0) - totalAmount) < 0.01 
                      ? "Balanced" 
                      : `Remaining: ${formatCurrency(totalAmount - (Object.values(splitPayments) as number[]).reduce((a, b) => a + b, 0), settings.currencySymbol)}`}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'cash', label: 'Cash', icon: Banknote },
                    { id: 'card', label: 'Card', icon: CreditCard },
                    { id: 'transfer', label: 'Transfer', icon: ArrowRightLeft },
                    { id: 'debt', label: 'Credit', icon: Clock },
                  ].map(method => (
                    <div key={method.id} className="space-y-1">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-brand-muted uppercase tracking-wider">
                        <method.icon size={12} />
                        {method.label}
                      </div>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-brand-muted font-bold">
                          {settings.currencySymbol}
                        </span>
                        <CurrencyInput
                          value={splitPayments[method.id as keyof typeof splitPayments] || ''}
                          onChange={val => {
                            const numericVal = val === '' ? 0 : Number(val);
                            const newSplit = { ...splitPayments, [method.id]: numericVal };
                            setSplitPayments(newSplit);
                            setAmountPaid((newSplit.cash + newSplit.card + newSplit.transfer).toString());
                            setIsAmountPaidManual(true);
                            if (method.id === 'debt' && numericVal > 0 && !selectedAccountId) {
                              setIsAccountModalOpen(true);
                            }
                          }}
                          inputClassName="pl-5 py-1.5 text-xs font-bold text-right"
                          prefix={settings.currencySymbol}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {splitPayments.debt > 0 && (
                  <div className="flex justify-between items-center pt-2 border-t border-brand-border">
                    <span className="text-sm font-medium text-brand-muted">Due Date</span>
                    <input
                      type="date"
                      className="input-field py-1 text-sm w-auto"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-brand-muted">Payment Method</span>
                  <div className="flex gap-1 bg-brand-surface p-1 rounded-xl border border-brand-border">
                    {[
                      { id: 'cash', icon: Banknote, label: 'Cash' },
                      { id: 'card', icon: CreditCard, label: 'Card' },
                      { id: 'transfer', icon: ArrowRightLeft, label: 'Transfer' },
                      { id: 'debt', icon: Clock, label: 'Credit' },
                    ].map(method => (
                      <button
                        key={method.id}
                        onClick={() => handlePaymentMethodChange(method.id as any)}
                        className={cn(
                          "p-2 rounded-lg transition-all flex items-center gap-1",
                          paymentMethod === method.id ? "bg-brand-accent text-white" : "text-brand-muted hover:bg-brand-bg"
                        )}
                        title={method.label}
                      >
                        <method.icon size={16} />
                        <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline-block">{method.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {settings.taxType && settings.taxType !== 'none' && (
                  <>
                    <div className="flex justify-between items-end">
                      <span className="text-sm font-medium text-brand-muted">Subtotal</span>
                      <span className="text-lg font-bold tracking-tight text-brand-text">{settings.currencySymbol}{subTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-end">
                      <span className="text-sm font-medium text-brand-muted">
                        Tax ({settings.taxType === 'percentage' ? `${settings.taxValue}%` : 'Fixed'})
                      </span>
                      <span className="text-lg font-bold tracking-tight text-brand-text">{settings.currencySymbol}{taxAmount.toFixed(2)}</span>
                    </div>
                  </>
                )}

                {settings.allowBackdatedSales && (
                  <div className="flex flex-col gap-2 pt-2 border-t border-brand-border">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-brand-muted">Sale Date</span>
                        {saleDate !== new Date().toISOString().split('T')[0] && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500 text-[8px] font-bold uppercase tracking-widest border border-amber-500/20 animate-pulse">
                            Backdated Mode
                          </span>
                        )}
                      </div>
                      <input
                        type="date"
                        className={cn(
                          "input-field py-1 text-sm w-auto transition-all",
                          saleDate !== new Date().toISOString().split('T')[0] && "border-amber-500 ring-1 ring-amber-500/20 bg-amber-500/5"
                        )}
                        value={saleDate}
                        max={new Date().toISOString().split('T')[0]}
                        onChange={(e) => setSaleDate(e.target.value)}
                      />
                    </div>
                    {saleDate !== new Date().toISOString().split('T')[0] && (
                      <p className="text-[10px] text-amber-500 font-medium italic">
                        * This sale will be recorded for {new Date(saleDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                )}

                {settings.includeCustomerName && (
                  <div className="flex flex-col gap-2 pt-2 border-t border-brand-border">
                    <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Customer Name (Optional)</label>
                    <input
                      type="text"
                      placeholder="Enter customer name..."
                      className="input-field py-1.5 text-sm"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                  </div>
                )}

                <div className="flex justify-between items-end pt-1 border-t border-brand-border">
                  <span className="text-xs font-medium text-brand-muted">Total Amount</span>
                  <span className="text-xl lg:text-2xl font-bold tracking-tight text-brand-text">{settings.currencySymbol}{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>

                {(selectedAccountId || accountMode === 'new') && (
                  <div className="flex justify-between items-center pt-2 border-t border-brand-border">
                    <span className="text-sm font-medium text-brand-muted">Amount Paid</span>
                    <div className="relative w-32">
                      <CurrencyInput
                        value={amountPaid}
                        onChange={val => {
                          setAmountPaid(val.toString());
                          setIsAmountPaidManual(true);
                          const numericVal = val === '' ? 0 : Number(val);
                          if (paymentMethod === 'cash') setSplitPayments({ ...splitPayments, cash: numericVal, debt: totalAmount - numericVal });
                          else if (paymentMethod === 'card') setSplitPayments({ ...splitPayments, card: numericVal, debt: totalAmount - numericVal });
                          else if (paymentMethod === 'transfer') setSplitPayments({ ...splitPayments, transfer: numericVal, debt: totalAmount - numericVal });
                        }}
                        prefix={settings.currencySymbol}
                        inputClassName="pl-7 py-1 text-right font-bold"
                      />
                    </div>
                  </div>
                )}
                
                {(selectedAccountId || accountMode === 'new') && (amountPaid === '' || parseFloat(amountPaid) < totalAmount) && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-rose-500 bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                      <span className="text-xs font-bold uppercase tracking-wider">Added to Credit</span>
                      <span className="text-sm font-bold">{settings.currencySymbol}{(totalAmount - (isNaN(parseFloat(amountPaid)) ? 0 : parseFloat(amountPaid))).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-brand-border">
                      <span className="text-sm font-medium text-brand-muted">Due Date</span>
                      <input
                        type="date"
                        className="input-field py-1 text-sm w-auto"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex gap-2">
            {settings.allowPendingSales && (
              <button 
                disabled={cart.length === 0 || isProcessing}
                onClick={handleHoldSale}
                className={cn(
                  "p-3 lg:p-4 bg-brand-accent/10 text-brand-accent flex items-center justify-center rounded-xl transition-all hover:bg-brand-accent/20 active:scale-[0.95] disabled:opacity-50",
                  cart.length > 0 && "scale-95 opacity-80"
                )}
                title="Hold Sale"
              >
                <Clock size={20} />
              </button>
            )}
            <button 
              disabled={cart.length === 0 || isProcessing}
              onClick={handleCheckout}
              className={cn(
                "btn-primary py-3 lg:py-4 flex-1 flex items-center justify-center gap-2 transition-all font-black uppercase tracking-widest text-white",
                cart.length > 0 && !isProcessing && "shadow-[0_4px_20px_var(--color-brand-accent)] border-white/40 z-20"
              )}
            >
              {isProcessing ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <>
                  Complete Sale
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>

      {/* Pending Sales Modal */}
      {isPendingModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-[110] p-4 pt-20">
          <div className="bg-brand-surface rounded-3xl p-6 max-w-md w-full shadow-2xl border border-brand-border">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <Clock size={20} className="text-brand-accent" />
                <h3 className="text-lg font-bold text-brand-text">Pending Sales</h3>
              </div>
              <button onClick={() => setIsPendingModalOpen(false)} className="p-2 hover:bg-brand-bg rounded-xl text-brand-muted">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 no-scrollbar">
              {pendingSales.length === 0 ? (
                <div className="text-center py-12 text-brand-muted opacity-40">
                  <Clock size={48} className="mx-auto mb-4" strokeWidth={1} />
                  <p className="text-sm font-medium">No pending sales found</p>
                </div>
              ) : (
                pendingSales.map(pending => (
                  <div key={pending.id} className="p-4 rounded-2xl border border-brand-border bg-brand-bg/20 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-sm font-bold text-brand-text">
                          {pending.cart.length} Items - {settings.currencySymbol}{pending.cart.reduce((a, b) => a + b.total, 0).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-brand-muted uppercase tracking-wider mt-0.5">
                          {new Date(pending.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setPendingSales(prev => prev.filter(p => p.id !== pending.id));
                            showNotification('info', 'Pending sale removed.');
                          }}
                          className="p-2 hover:bg-rose-500/10 rounded-lg text-brand-muted hover:text-rose-500 transition-colors"
                          title="Remove"
                        >
                          <Trash2 size={16} />
                        </button>
                        <button
                          onClick={() => handleResumeSale(pending)}
                          className="px-3 py-1.5 bg-brand-accent text-white text-xs font-bold rounded-lg hover:bg-brand-accent/90 transition-colors flex items-center gap-1.5"
                        >
                          <ArrowRightLeft size={14} />
                          Resume
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {pending.cart.slice(0, 3).map((item, idx) => (
                        <span key={idx} className="text-[10px] px-2 py-0.5 bg-brand-surface rounded-full border border-brand-border text-brand-muted">
                          {item.productName} x{item.quantity}
                        </span>
                      ))}
                      {pending.cart.length > 3 && (
                        <span className="text-[10px] px-2 py-0.5 text-brand-muted">
                          +{pending.cart.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirm.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4">
          <div className="bg-brand-surface rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-brand-border">
            <h3 className="text-lg font-bold text-brand-text mb-2">{showConfirm.title}</h3>
            <p className="text-sm text-brand-muted mb-6 whitespace-pre-wrap">{showConfirm.message}</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowConfirm(prev => ({ ...prev, show: false }))}
                className="flex-1 px-4 py-2 rounded-xl border border-brand-border text-brand-text font-bold hover:bg-brand-bg transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={showConfirm.onConfirm}
                className="flex-1 px-4 py-2 rounded-xl bg-brand-accent text-white font-bold hover:bg-brand-accent/90 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {isScannerOpen && (
        <BarcodeScanner
          onClose={() => setIsScannerOpen(false)}
          onScan={(decodedText) => {
            const trimmedText = decodedText.trim();
            setSearch(trimmedText);
            setIsScannerOpen(false);
            
            // Auto-add if exact match found
            const match = products.find(p => 
              p.sku === trimmedText || 
              (p.alias && p.alias.toLowerCase() === trimmedText.toLowerCase())
            );
            if (match && (match.type === 'service' || match.stock > 0)) {
              addToCart(match);
              playSound('scan');
              setSearch(''); // Clear search after auto-adding
            } else if (match && match.stock <= 0) {
              showNotification('error', 'Product is out of stock');
              playSound('alert');
            }
          }}
        />
      )}

      {/* Account Selection Modal */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4">
          <div className="bg-brand-surface rounded-3xl p-6 max-w-md w-full shadow-2xl border border-brand-border">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-brand-text">Account Required for Credit</h3>
              <button onClick={() => { setIsAccountModalOpen(false); setPaymentMethod('cash'); }} className="p-2 hover:bg-brand-bg rounded-xl text-brand-muted">
                <X size={20} />
              </button>
            </div>

            <div className="flex gap-2 bg-brand-bg p-1 rounded-xl border border-brand-border mb-6">
              <button
                onClick={() => setAccountMode('existing')}
                className={cn(
                  "flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all",
                  accountMode === 'existing' ? "bg-brand-surface text-brand-text shadow-sm" : "text-brand-muted hover:text-brand-text"
                )}
              >
                Existing
              </button>
              <button
                onClick={() => setAccountMode('new')}
                className={cn(
                  "flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all",
                  accountMode === 'new' ? "bg-brand-surface text-brand-text shadow-sm" : "text-brand-muted hover:text-brand-text"
                )}
              >
                New
              </button>
            </div>

            {accountMode === 'existing' ? (
              <div className="space-y-4">
                <div className="relative">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted" />
                  <input 
                    type="text" 
                    placeholder="Search existing accounts..." 
                    className="input-field pl-12 py-2 text-sm"
                    autoFocus
                    value={accountSearch}
                    onChange={(e) => setAccountSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-60 overflow-y-auto space-y-2 pr-2 no-scrollbar">
                  {filteredAccounts.map(c => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedAccountId(c.id);
                        setIsAccountModalOpen(false);
                        setAccountSearch('');
                      }}
                      className="w-full text-left p-3 rounded-xl border border-brand-border hover:border-brand-accent hover:bg-brand-bg transition-all group"
                    >
                      <div className="font-bold text-brand-text group-hover:text-brand-accent">{c.name}</div>
                      <div className="text-xs text-brand-muted">{c.phone}</div>
                    </button>
                  ))}
                  {filteredAccounts.length === 0 && (
                    <p className="text-center py-8 text-brand-muted text-sm italic">No accounts found</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Full Name</label>
                  <input
                    type="text"
                    placeholder="e.g. John Doe"
                    className="input-field"
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Phone Number (11 Digits)</label>
                  <input
                    type="text"
                    placeholder="e.g. 08012345678"
                    maxLength={11}
                    className="input-field"
                    value={newAccountPhone}
                    onChange={(e) => setNewAccountPhone(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Email Address</label>
                  <input
                    type="email"
                    placeholder="e.g. john@example.com"
                    className="input-field"
                    value={newAccountEmail}
                    onChange={(e) => setNewAccountEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Physical Address</label>
                  <textarea
                    placeholder="e.g. 123 Main St, Lagos"
                    className="input-field min-h-[80px] py-2"
                    value={newAccountAddress}
                    onChange={(e) => setNewAccountAddress(e.target.value)}
                  />
                </div>
                <button 
                  onClick={handleRegisterAccount}
                  disabled={isProcessing}
                  className="btn-primary w-full py-3 mt-2 flex items-center justify-center gap-2"
                >
                  {isProcessing ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : 'Register & Select'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Print Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 pt-20">
          <div className="bg-brand-surface rounded-2xl p-6 max-w-sm w-full shadow-xl border border-brand-border">
            <h3 className="text-lg font-bold text-brand-text mb-2">Sale Completed!</h3>
            <p className="text-brand-muted mb-6">Would you like to print a receipt for this transaction?</p>
            <div className="flex gap-3">
              <button 
                onClick={handlePrintCancel}
                className="flex-1 px-4 py-2 border border-brand-border rounded-xl text-brand-text font-medium hover:bg-brand-bg transition-colors"
              >
                No, skip
              </button>
              <button 
                onClick={handlePrintConfirm}
                className="flex-1 px-4 py-2 bg-brand-accent text-white rounded-xl font-medium hover:bg-brand-accent/90 transition-colors"
              >
                Yes, print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 pt-20">
          <div className="bg-brand-surface rounded-2xl p-6 max-w-sm w-full shadow-xl text-center border border-brand-border">
            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-brand-text mb-2">Sale Successful</h3>
            <p className="text-brand-muted mb-6">The transaction has been recorded.</p>
            <button 
              onClick={() => setShowSuccessModal(false)}
              className="w-full px-4 py-2 bg-brand-accent text-white rounded-xl font-medium hover:bg-brand-accent/90 transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  </div>
);
}
