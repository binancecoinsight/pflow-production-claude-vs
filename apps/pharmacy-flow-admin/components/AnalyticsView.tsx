'use client';

import React, { useState, useMemo } from 'react';
import { 
  BarChart3, Calendar, ArrowUpDown, Download, Search, Filter, 
  CreditCard, TrendingUp, DollarSign, Store, CheckCircle2, ChevronLeft, 
  ChevronRight, Building2, User, Clock, FileText, ArrowUpRight, 
  ExternalLink, X, ShieldCheck, Sparkles, RefreshCw, PlusCircle,
  Receipt, Repeat, Minus, Equal, AlertCircle, Trash2, Layers,
  PieChart, ArrowDownRight, Tag, Info, AlertTriangle
} from 'lucide-react';
import { 
  SubscriptionPayment, 
  AnalyticsTimeframe, 
  SubscriptionPlan,
  PLAN_PRICES,
  Expense,
  ExpenseType,
  ExpenseFrequency,
  ExpenseCategory,
  generateInitialExpenses
} from '@/lib/mock-data';
import { format } from 'date-fns';
import RecordExpenseModal from './RecordExpenseModal';

interface AnalyticsViewProps {
  payments: SubscriptionPayment[];
  expenses?: Expense[];
  onAddExpense?: (expense: Omit<Expense, 'id' | 'timestamp'>) => void;
  onDeleteExpense?: (id: string) => void;
  onOpenRenewModal?: () => void;
}

export default function AnalyticsView({
  payments,
  expenses: propExpenses,
  onAddExpense: propOnAddExpense,
  onDeleteExpense: propOnDeleteExpense,
  onOpenRenewModal,
}: AnalyticsViewProps) {
  // Local state for expenses if not passed from parent
  const [internalExpenses, setInternalExpenses] = useState<Expense[]>(generateInitialExpenses);
  const expenses = propExpenses || internalExpenses;

  // Active view section tab
  const [activeSection, setActiveSection] = useState<'all' | 'financial_summary' | 'expenses' | 'subscriptions'>('all');

  // Timeframe and modals
  const [timeframe, setTimeframe] = useState<AnalyticsTimeframe>('1month');
  const [isRecordExpenseModalOpen, setIsRecordExpenseModalOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);

  // Filter for Subscriptions Ledger
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState<'all' | SubscriptionPlan>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [selectedReceipt, setSelectedReceipt] = useState<SubscriptionPayment | null>(null);

  // Filter for Expenses Ledger
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseTypeFilter, setExpenseTypeFilter] = useState<'all' | ExpenseType>('all');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<string>('all');

  // Sorting for Payments Table
  const [sortField, setSortField] = useState<keyof SubscriptionPayment>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Pagination for Payments Table
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [refTime] = useState(() => Date.now());

  // Handle adding an expense
  const handleAddExpense = (newExpense: Omit<Expense, 'id' | 'timestamp'>) => {
    if (propOnAddExpense) {
      propOnAddExpense(newExpense);
    } else {
      const created: Expense = {
        ...newExpense,
        id: `exp-${Date.now()}`,
        timestamp: new Date(newExpense.date).getTime() || Date.now(),
      };
      setInternalExpenses(prev => [created, ...prev]);
    }
  };

  // Handle deleting an expense
  const handleDeleteExpense = (id: string) => {
    if (propOnDeleteExpense) {
      propOnDeleteExpense(id);
    } else {
      setInternalExpenses(prev => prev.filter(e => e.id !== id));
    }
    setExpenseToDelete(null);
  };

  // Timeframe configurations in milliseconds
  const timeframeMeta = useMemo(() => {
    const dayMs = 24 * 3600 * 1000;
    const now = refTime;
    let durationMs: number;
    let durationDays: number;
    let label: string;
    let shortLabel: string;
    let barCount: number;

    switch (timeframe) {
      case '7days':
        durationDays = 7;
        durationMs = 7 * dayMs;
        label = 'Past 7 Days';
        shortLabel = '7D';
        barCount = 7;
        break;
      case '14days':
        durationDays = 14;
        durationMs = 14 * dayMs;
        label = 'Past 14 Days';
        shortLabel = '14D';
        barCount = 14;
        break;
      case '1month':
        durationDays = 30;
        durationMs = 30 * dayMs;
        label = 'Past 1 Month (30 Days)';
        shortLabel = '1M';
        barCount = 10;
        break;
      case '3month':
        durationDays = 90;
        durationMs = 90 * dayMs;
        label = 'Past 3 Months (90 Days)';
        shortLabel = '3M';
        barCount = 12;
        break;
      case '6month':
        durationDays = 180;
        durationMs = 180 * dayMs;
        label = 'Past 6 Months (180 Days)';
        shortLabel = '6M';
        barCount = 12;
        break;
      case '1year':
        durationDays = 365;
        durationMs = 365 * dayMs;
        label = 'Past 1 Year (365 Days)';
        shortLabel = '1Y';
        barCount = 12;
        break;
    }

    const cutoffTime = now - durationMs;
    const priorCutoffTime = now - (durationMs * 2);

    return { durationMs, durationDays, label, shortLabel, barCount, cutoffTime, priorCutoffTime, now };
  }, [timeframe, refTime]);

  // Filter payments within the selected active timeframe
  const timeframePayments = useMemo(() => {
    return payments.filter(p => p.timestamp >= timeframeMeta.cutoffTime);
  }, [payments, timeframeMeta.cutoffTime]);

  // Payments in prior equivalent window (for comparative growth calculation)
  const priorPeriodPayments = useMemo(() => {
    return payments.filter(
      p => p.timestamp >= timeframeMeta.priorCutoffTime && p.timestamp < timeframeMeta.cutoffTime
    );
  }, [payments, timeframeMeta.cutoffTime, timeframeMeta.priorCutoffTime]);

  // GROSS REVENUE: Total sum of subscriptions paid for the selected timeframe
  const sumSubscriptionPaid = useMemo(() => {
    return timeframePayments.reduce((acc, p) => acc + p.amount_paid, 0);
  }, [timeframePayments]);

  const priorSumSubscriptionPaid = useMemo(() => {
    return priorPeriodPayments.reduce((acc, p) => acc + p.amount_paid, 0);
  }, [priorPeriodPayments]);

  // -------------------------------------------------------------
  // OPERATING EXPENSES CALCULATION ENGINE (ONE-TIME & RECURRING)
  // Factored in before total earnings are summarized!
  // -------------------------------------------------------------

  // Helper: calculate the cost of a recurring expense for the given duration in days
  const calculateRecurringCostForDays = (expense: Expense, days: number): number => {
    if (expense.type !== 'recurring') return 0;
    const freq = expense.frequency || 'monthly';
    let baseDays = 30;
    if (freq === 'weekly') baseDays = 7;
    else if (freq === 'monthly') baseDays = 30;
    else if (freq === 'quarterly') baseDays = 90;
    else if (freq === 'annual') baseDays = 365;

    return Math.round(expense.amount * (days / baseDays));
  };

  // 1. One-time expenses within the active timeframe window
  const timeframeOneTimeExpenses = useMemo(() => {
    return expenses.filter(
      e => e.type === 'onetime' && e.timestamp >= timeframeMeta.cutoffTime && e.timestamp <= timeframeMeta.now
    );
  }, [expenses, timeframeMeta.cutoffTime, timeframeMeta.now]);

  const sumOneTimeExpenses = useMemo(() => {
    return timeframeOneTimeExpenses.reduce((acc, e) => acc + e.amount, 0);
  }, [timeframeOneTimeExpenses]);

  // 2. Active recurring expenses and their allocation for the active timeframe
  const activeRecurringExpenses = useMemo(() => {
    return expenses.filter(e => e.type === 'recurring');
  }, [expenses]);

  const sumRecurringExpenses = useMemo(() => {
    return activeRecurringExpenses.reduce(
      (acc, e) => acc + calculateRecurringCostForDays(e, timeframeMeta.durationDays), 
      0
    );
  }, [activeRecurringExpenses, timeframeMeta.durationDays]);

  // 3. Monthly recurring run-rate (standardized monthly burn)
  const monthlyRecurringRunRate = useMemo(() => {
    return activeRecurringExpenses.reduce(
      (acc, e) => acc + calculateRecurringCostForDays(e, 30), 
      0
    );
  }, [activeRecurringExpenses]);

  // 4. TOTAL FACTORED OPERATING EXPENSES FOR THE SELECTED TIMEFRAME
  const totalFactoredExpenses = useMemo(() => {
    return sumOneTimeExpenses + sumRecurringExpenses;
  }, [sumOneTimeExpenses, sumRecurringExpenses]);

  // -------------------------------------------------------------
  // TOTAL NET EARNINGS SUMMARISED:
  // "it should be factored in before total earnings are summarised"
  // Gross Collections LESS Total Factored Expenses = Total Net Earnings
  // -------------------------------------------------------------
  const totalNetEarnings = useMemo(() => {
    return sumSubscriptionPaid - totalFactoredExpenses;
  }, [sumSubscriptionPaid, totalFactoredExpenses]);

  // Net Profit Margin & Operating Expense Ratio
  const netProfitMargin = useMemo(() => {
    if (sumSubscriptionPaid === 0) return 0;
    return Number(((totalNetEarnings / sumSubscriptionPaid) * 100).toFixed(1));
  }, [totalNetEarnings, sumSubscriptionPaid]);

  const expenseRatio = useMemo(() => {
    if (sumSubscriptionPaid === 0) return 0;
    return Number(((totalFactoredExpenses / sumSubscriptionPaid) * 100).toFixed(1));
  }, [totalFactoredExpenses, sumSubscriptionPaid]);

  // Comparative prior net earnings
  const priorPeriodTotalExpenses = useMemo(() => {
    // Prior one-time
    const priorOneTime = expenses
      .filter(e => e.type === 'onetime' && e.timestamp >= timeframeMeta.priorCutoffTime && e.timestamp < timeframeMeta.cutoffTime)
      .reduce((acc, e) => acc + e.amount, 0);
    // Prior recurring
    const priorRec = activeRecurringExpenses.reduce(
      (acc, e) => acc + calculateRecurringCostForDays(e, timeframeMeta.durationDays), 
      0
    );
    return priorOneTime + priorRec;
  }, [expenses, activeRecurringExpenses, timeframeMeta.priorCutoffTime, timeframeMeta.cutoffTime, timeframeMeta.durationDays]);

  const priorTotalNetEarnings = useMemo(() => {
    return priorSumSubscriptionPaid - priorPeriodTotalExpenses;
  }, [priorSumSubscriptionPaid, priorPeriodTotalExpenses]);

  const netGrowthPercentage = useMemo(() => {
    if (priorTotalNetEarnings === 0) return 0;
    const diff = totalNetEarnings - priorTotalNetEarnings;
    return Number(((diff / Math.abs(priorTotalNetEarnings)) * 100).toFixed(1));
  }, [totalNetEarnings, priorTotalNetEarnings]);

  // Annualized & Monthly Net Run-Rates
  const annualizedNetARR = useMemo(() => {
    return Math.round((totalNetEarnings / timeframeMeta.durationMs) * (365 * 24 * 3600 * 1000));
  }, [totalNetEarnings, timeframeMeta.durationMs]);

  const monthlyNetMRR = useMemo(() => {
    return Math.round((totalNetEarnings / timeframeMeta.durationMs) * (30 * 24 * 3600 * 1000));
  }, [totalNetEarnings, timeframeMeta.durationMs]);

  // Average Payment ticket
  const averagePaymentTicket = useMemo(() => {
    if (timeframePayments.length === 0) return 0;
    return Math.round(sumSubscriptionPaid / timeframePayments.length);
  }, [sumSubscriptionPaid, timeframePayments.length]);

  // Highest Single Payment
  const highestPayment = useMemo(() => {
    if (timeframePayments.length === 0) return 0;
    return Math.max(...timeframePayments.map(p => p.amount_paid));
  }, [timeframePayments]);

  // Plan Breakdown
  const planBreakdown = useMemo(() => {
    const plans: SubscriptionPlan[] = ['Basic', 'Standard', 'Premium', 'Enterprise'];
    return plans.map(plan => {
      const filtered = timeframePayments.filter(p => p.plan === plan);
      const totalSum = filtered.reduce((acc, p) => acc + p.amount_paid, 0);
      const count = filtered.length;
      const percentage = sumSubscriptionPaid > 0 ? ((totalSum / sumSubscriptionPaid) * 100).toFixed(1) : '0';
      return { plan, totalSum, count, percentage };
    });
  }, [timeframePayments, sumSubscriptionPaid]);

  // Cycle Breakdown
  const cycleBreakdown = useMemo(() => {
    const cycles = ['Monthly', 'Quarterly', 'Annual'] as const;
    return cycles.map(cycle => {
      const filtered = timeframePayments.filter(p => p.cycle === cycle);
      const totalSum = filtered.reduce((acc, p) => acc + p.amount_paid, 0);
      const count = filtered.length;
      const percentage = sumSubscriptionPaid > 0 ? ((totalSum / sumSubscriptionPaid) * 100).toFixed(1) : '0';
      return { cycle, totalSum, count, percentage };
    });
  }, [timeframePayments, sumSubscriptionPaid]);

  // Method Breakdown
  const methodBreakdown = useMemo(() => {
    const methods = [
      'NIBSS Instant Settlement',
      'Debit Card (Paystack/Flutterwave)',
      'Direct Bank Deposit',
      'POS Terminal Transfer',
    ];
    return methods.map(method => {
      const filtered = timeframePayments.filter(p => p.payment_method === method);
      const totalSum = filtered.reduce((acc, p) => acc + p.amount_paid, 0);
      const count = filtered.length;
      const percentage = sumSubscriptionPaid > 0 ? ((totalSum / sumSubscriptionPaid) * 100).toFixed(1) : '0';
      return { method, totalSum, count, percentage };
    });
  }, [timeframePayments, sumSubscriptionPaid]);

  // Chart data buckets
  const chartBuckets = useMemo(() => {
    const { barCount, durationMs, now } = timeframeMeta;
    const bucketDuration = durationMs / barCount;
    const buckets: {
      label: string;
      sublabel: string;
      sum: number;
      count: number;
    }[] = [];

    for (let i = barCount - 1; i >= 0; i--) {
      const bStart = now - ((i + 1) * bucketDuration);
      const bEnd = now - (i * bucketDuration);
      const inBucket = timeframePayments.filter(p => p.timestamp >= bStart && p.timestamp < bEnd);
      const sum = inBucket.reduce((acc, p) => acc + p.amount_paid, 0);

      let label = '';
      let sublabel = '';
      if (timeframe === '7days') {
        label = format(new Date(bStart), 'EEE');
        sublabel = format(new Date(bStart), 'MMM d');
      } else if (timeframe === '14days') {
        label = format(new Date(bStart), 'dd');
        sublabel = format(new Date(bStart), 'MMM');
      } else if (timeframe === '1month') {
        label = `W${Math.abs(barCount - i)}`;
        sublabel = format(new Date(bStart), 'd MMM');
      } else if (timeframe === '3month' || timeframe === '6month') {
        label = format(new Date(bStart), 'MMM');
        sublabel = format(new Date(bStart), 'yyyy');
      } else {
        label = format(new Date(bStart), 'MMM');
        sublabel = `'${format(new Date(bStart), 'yy')}`;
      }

      buckets.push({
        label,
        sublabel,
        sum,
        count: inBucket.length,
      });
    }

    const maxBucketSum = Math.max(...buckets.map(b => b.sum), 1);
    return { buckets, maxBucketSum };
  }, [timeframeMeta, timeframePayments, timeframe]);

  // Filtered & Sorted Payments Table
  const filteredAndSortedPayments = useMemo(() => {
    return timeframePayments
      .filter(p => {
        if (planFilter !== 'all' && p.plan !== planFilter) return false;
        if (methodFilter !== 'all' && p.payment_method !== methodFilter) return false;

        if (search.trim()) {
          const q = search.toLowerCase();
          const inStore = p.pharmacy_name.toLowerCase().includes(q);
          const inOwner = p.owner_name.toLowerCase().includes(q);
          const inRef = p.reference_no.toLowerCase().includes(q);
          const inState = p.state.toLowerCase().includes(q);
          if (!inStore && !inOwner && !inRef && !inState) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aVal = a[sortField] ?? '';
        const bVal = b[sortField] ?? '';
        if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
  }, [timeframePayments, planFilter, methodFilter, search, sortField, sortOrder]);

  // Paginated payments
  const totalPages = Math.ceil(filteredAndSortedPayments.length / itemsPerPage) || 1;
  const paginatedPayments = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedPayments.slice(start, start + itemsPerPage);
  }, [filteredAndSortedPayments, currentPage]);

  const toggleSort = (field: keyof SubscriptionPayment) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Filtered Expenses List
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      // Type filter
      if (expenseTypeFilter !== 'all' && e.type !== expenseTypeFilter) return false;
      // Category filter
      if (expenseCategoryFilter !== 'all' && e.category !== expenseCategoryFilter) return false;
      // Search query
      if (expenseSearch.trim()) {
        const q = expenseSearch.toLowerCase();
        const inTitle = e.title.toLowerCase().includes(q);
        const inVendor = e.vendor.toLowerCase().includes(q);
        const inCategory = e.category.toLowerCase().includes(q);
        const inRef = e.receipt_ref ? e.receipt_ref.toLowerCase().includes(q) : false;
        if (!inTitle && !inVendor && !inCategory && !inRef) return false;
      }
      return true;
    }).sort((a, b) => b.timestamp - a.timestamp);
  }, [expenses, expenseTypeFilter, expenseCategoryFilter, expenseSearch]);

  // Expense Categories breakdown for visual pills
  const expenseCategoriesBreakdown = useMemo(() => {
    const categories: ExpenseCategory[] = [
      'Infrastructure & Cloud',
      'Salaries & Field Support',
      'SMS & Telecom APIs',
      'Marketing & Outreach',
      'Hardware & POS Terminals',
      'Compliance & Licensing',
      'Office & Operations',
    ];

    return categories.map(cat => {
      const catExpenses = expenses.filter(e => e.category === cat);
      const totalAmount = catExpenses.reduce((acc, e) => {
        if (e.type === 'onetime') {
          return e.timestamp >= timeframeMeta.cutoffTime ? acc + e.amount : acc;
        } else {
          return acc + calculateRecurringCostForDays(e, timeframeMeta.durationDays);
        }
      }, 0);
      return { category: cat, totalAmount, count: catExpenses.length };
    }).filter(c => c.count > 0);
  }, [expenses, timeframeMeta.cutoffTime, timeframeMeta.durationDays]);

  // Export Subscription Payments CSV
  const handleExportCSV = () => {
    const headers = [
      'Reference No',
      'Pharmacy Store',
      'Owner Name',
      'State',
      'Plan Tier',
      'Billing Cycle',
      'Amount Paid (NGN)',
      'Payment Method',
      'Payment Timestamp',
      'Status'
    ];

    const rows = filteredAndSortedPayments.map(p => [
      p.reference_no,
      `"${p.pharmacy_name}"`,
      `"${p.owner_name}"`,
      `"${p.state}"`,
      p.plan,
      p.cycle,
      p.amount_paid,
      `"${p.payment_method}"`,
      p.payment_date,
      p.status
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `pharmacyflow_subscriptions_revenue_${timeframe}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Operating Expenses CSV
  const handleExportExpensesCSV = () => {
    const headers = [
      'Expense ID',
      'Title',
      'Category',
      'Type',
      'Frequency',
      'Base Incurred Amount (NGN)',
      'Allocated to Timeframe (NGN)',
      'Date Incurred',
      'Vendor',
      'Payment Method',
      'Receipt Ref',
      'Status'
    ];

    const rows = filteredExpenses.map(e => {
      const allocated = e.type === 'onetime'
        ? (e.timestamp >= timeframeMeta.cutoffTime ? e.amount : 0)
        : calculateRecurringCostForDays(e, timeframeMeta.durationDays);

      return [
        e.id,
        `"${e.title}"`,
        `"${e.category}"`,
        e.type,
        e.frequency || 'N/A',
        e.amount,
        allocated,
        e.date,
        `"${e.vendor}"`,
        `"${e.payment_method}"`,
        e.receipt_ref || '',
        e.status
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `pharmacyflow_operating_expenses_${timeframe}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* TOP HEADER BAR */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-xl bg-accent/15 text-accent border border-accent/30 flex items-center justify-center shadow-sm">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text-primary flex items-center gap-2">
                <span>Revenue &amp; Net Earnings Analytics</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold uppercase">
                  P&amp;L Factored
                </span>
              </h1>
              <span className="text-[11px] text-text-secondary">
                Aggregated subscription collections, operating overheads, and true net profit across Nigeria.
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 flex-wrap">
          {/* Quick Record Expense Primary CTA */}
          <button
            onClick={() => setIsRecordExpenseModalOpen(true)}
            className="bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm group"
          >
            <PlusCircle className="w-3.5 h-3.5 text-rose-400 group-hover:rotate-90 transition-transform" />
            <span>Record Expense</span>
          </button>

          {/* Timeframe Navigation Pills */}
          <div className="bg-card border border-border rounded-xl p-1 flex items-center gap-0.5 overflow-x-auto shadow-sm">
            {[
              { id: '7days', label: '7 Days' },
              { id: '14days', label: '14 Days' },
              { id: '1month', label: '1 Month' },
              { id: '3month', label: '3 Months' },
              { id: '6month', label: '6 Months' },
              { id: '1year', label: '1 Year' },
            ].map((tf) => {
              const isActive = timeframe === tf.id;
              return (
                <button
                  key={tf.id}
                  onClick={() => {
                    setTimeframe(tf.id as AnalyticsTimeframe);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-accent text-white shadow-sm font-bold'
                      : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                  }`}
                >
                  {tf.label}
                </button>
              );
            })}
          </div>

          {/* Export Dropdown / Button */}
          <button
            onClick={handleExportCSV}
            className="border border-border bg-card hover:bg-white/5 text-text-primary px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export Subscriptions</span>
          </button>
        </div>
      </div>

      {/* QUICK SECTION JUMP TABS */}
      <div className="flex items-center gap-2 border-b border-border/80 pb-2 overflow-x-auto">
        {[
          { id: 'all', label: 'Complete Financial Overview', icon: Layers, count: undefined },
          { id: 'financial_summary', label: 'Net Earnings Waterfall', icon: DollarSign, count: undefined },
          { id: 'expenses', label: 'Operating Expenses Ledger', icon: Receipt, count: expenses.length },
          { id: 'subscriptions', label: 'Subscription Revenue Ledger', icon: FileText, count: timeframePayments.length },
        ].map((tab) => {
          const isActive = activeSection === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id as any)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-card border border-accent/40 text-accent font-bold shadow-sm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/5 border border-transparent'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                  isActive ? 'bg-accent/20 text-accent' : 'bg-white/5 text-text-secondary'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* 1. FINANCIAL WATERFALL: FACTORING EXPENSES BEFORE SUMMARISING EARNINGS */}
      {/* ------------------------------------------------------------------- */}
      {(activeSection === 'all' || activeSection === 'financial_summary') && (
        <div className="bg-gradient-to-r from-card via-card to-bg border border-accent/30 rounded-2xl p-5 shadow-lg relative overflow-hidden space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/80 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <span>Net Earnings Formulation</span>
                  <span className="text-text-secondary font-normal font-mono text-xs">
                    ({timeframeMeta.label})
                  </span>
                </h3>
              </div>
              <p className="text-xs text-text-secondary mt-0.5">
                Expenses are classified as one-time or recurring and strictly deducted before bottom-line total earnings are summarised.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-white/5 border border-border text-text-secondary">
                Formula: <strong className="text-text-primary">Net = Gross Revenue − Total Operating Expenses</strong>
              </span>
            </div>
          </div>

          {/* Three-Stage Waterfall Calculation Display */}
          <div className="grid grid-cols-1 md:grid-cols-11 gap-3 items-center">
            
            {/* Step 1: Gross Subscription Collections */}
            <div className="md:col-span-3 bg-bg/80 border border-border/80 rounded-xl p-4 shadow-sm relative">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5 text-accent" />
                  <span>1. Gross Revenue</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/15 text-accent font-bold">
                  + Inflow
                </span>
              </div>
              <div className="font-mono text-xl sm:text-2xl font-extrabold text-text-primary">
                ₦{sumSubscriptionPaid.toLocaleString()}
              </div>
              <p className="text-[11px] text-text-secondary mt-1">
                {timeframePayments.length} pharmacy POS renewals collected
              </p>
            </div>

            {/* Minus Sign */}
            <div className="md:col-span-1 flex items-center justify-center py-1 md:py-0">
              <div className="w-8 h-8 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shadow-sm">
                <Minus className="w-4 h-4" />
              </div>
            </div>

            {/* Step 2: Total Operating Expenses (Factored in) */}
            <div className="md:col-span-3 bg-rose-500/5 border border-rose-500/30 rounded-xl p-4 shadow-sm relative">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1">
                  <Receipt className="w-3.5 h-3.5" />
                  <span>2. Factored Expenses</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 font-bold">
                  - Deductions
                </span>
              </div>
              <div className="font-mono text-xl sm:text-2xl font-extrabold text-rose-400">
                -₦{totalFactoredExpenses.toLocaleString()}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-text-secondary mt-1 font-mono">
                <span className="text-blue-400 font-semibold">₦{sumOneTimeExpenses.toLocaleString()} One-Time</span>
                <span>•</span>
                <span className="text-purple-400 font-semibold">₦{sumRecurringExpenses.toLocaleString()} Recurring</span>
              </div>
            </div>

            {/* Equal Sign */}
            <div className="md:col-span-1 flex items-center justify-center py-1 md:py-0">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-sm">
                <Equal className="w-4 h-4" />
              </div>
            </div>

            {/* Step 3: Summarised Net Earnings */}
            <div className={`md:col-span-3 rounded-xl p-4 shadow-md relative border ${
              totalNetEarnings >= 0 
                ? 'bg-emerald-500/10 border-emerald-500/40 text-text-primary' 
                : 'bg-amber-500/10 border-amber-500/40 text-amber-400'
            }`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>3. Summarised Net Earnings</span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-extrabold">
                  {netProfitMargin}% Margin
                </span>
              </div>
              <div className={`font-mono text-2xl sm:text-3xl font-extrabold tracking-tight ${
                totalNetEarnings >= 0 ? 'text-emerald-400' : 'text-amber-400'
              }`}>
                ₦{totalNetEarnings.toLocaleString()}
              </div>
              <p className="text-[11px] text-text-secondary mt-1 flex items-center gap-1.5">
                <span className="font-semibold text-emerald-400">100% Reconciled Net</span>
                <span>·</span>
                <span>Take-home SaaS profit</span>
              </p>
            </div>

          </div>

          {/* Quick Expense Allocation Ratio Bar */}
          <div className="pt-2">
            <div className="flex items-center justify-between text-xs text-text-secondary mb-1.5">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="font-semibold text-text-primary">Net Retained Earnings ({netProfitMargin}%)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  <span>Recurring Commitments ({sumSubscriptionPaid > 0 ? ((sumRecurringExpenses / sumSubscriptionPaid) * 100).toFixed(1) : 0}%)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span>One-Time Overheads ({sumSubscriptionPaid > 0 ? ((sumOneTimeExpenses / sumSubscriptionPaid) * 100).toFixed(1) : 0}%)</span>
                </span>
              </div>
              <span className="font-mono text-[11px] text-text-secondary">
                Operating Cost Ratio: {expenseRatio}%
              </span>
            </div>

            <div className="h-2 w-full bg-bg rounded-full overflow-hidden flex">
              <div 
                className="h-full bg-emerald-500 transition-all duration-500" 
                style={{ width: `${Math.max(Math.min(netProfitMargin, 100), 0)}%` }} 
                title={`Net Retained: ${netProfitMargin}%`}
              />
              <div 
                className="h-full bg-purple-500 transition-all duration-500" 
                style={{ width: `${sumSubscriptionPaid > 0 ? (sumRecurringExpenses / sumSubscriptionPaid) * 100 : 0}%` }} 
                title={`Recurring: ₦${sumRecurringExpenses.toLocaleString()}`}
              />
              <div 
                className="h-full bg-blue-500 transition-all duration-500" 
                style={{ width: `${sumSubscriptionPaid > 0 ? (sumOneTimeExpenses / sumSubscriptionPaid) * 100 : 0}%` }} 
                title={`One-Time: ₦${sumOneTimeExpenses.toLocaleString()}`}
              />
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 2. HERO KPI SUMMARY: SUMMARISED EARNINGS & KEY SAAS RUN-RATES */}
      {/* ------------------------------------------------------------------- */}
      {(activeSection === 'all' || activeSection === 'financial_summary') && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main Hero Card: Summarised Net Earnings & Gross Comparison */}
          <div className="lg:col-span-2 bg-card border border-accent/30 rounded-2xl p-6 shadow-md relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-full blur-3xl pointer-events-none" />

            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <span>Summarised Net Earnings ({timeframeMeta.label})</span>
                </span>

                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono">
                  <TrendingUp className="w-3 h-3" />
                  {netGrowthPercentage >= 0 ? `+${netGrowthPercentage}%` : `${netGrowthPercentage}%`} Net vs prior {timeframeMeta.shortLabel}
                </span>
              </div>

              {/* Large Prominent Net Earnings Sum */}
              <div className="mt-3 flex items-baseline gap-2.5">
                <span className="text-3xl sm:text-4xl lg:text-5xl font-extrabold font-mono tracking-tight text-emerald-400">
                  ₦{totalNetEarnings.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-text-secondary uppercase">
                  NGN Net (After Expenses)
                </span>
              </div>

              <div className="text-xs text-text-secondary mt-1.5 flex items-center gap-2 flex-wrap">
                <span>Gross Inflow: <strong className="text-text-primary font-mono">₦{sumSubscriptionPaid.toLocaleString()}</strong></span>
                <span>·</span>
                <span>Factored Overheads: <strong className="text-rose-400 font-mono">-₦{totalFactoredExpenses.toLocaleString()}</strong></span>
                <span>·</span>
                <span className="text-emerald-400 font-semibold">{netProfitMargin}% Net Profit Margin</span>
              </div>
            </div>

            {/* Mini Quick Indicators */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-border/80">
              <div>
                <span className="text-[10px] text-text-secondary uppercase block font-semibold">Average Store Fee</span>
                <span className="font-mono font-bold text-base text-text-primary mt-0.5 block">
                  ₦{averagePaymentTicket.toLocaleString()}
                </span>
                <span className="text-[10px] text-text-secondary">Gross per settlement</span>
              </div>

              <div>
                <span className="text-[10px] text-text-secondary uppercase block font-semibold">Recurring Monthly Burn</span>
                <span className="font-mono font-bold text-base text-purple-400 mt-0.5 block">
                  ₦{monthlyRecurringRunRate.toLocaleString()}
                </span>
                <span className="text-[10px] text-text-secondary">{activeRecurringExpenses.length} recurring contracts</span>
              </div>

              <div>
                <span className="text-[10px] text-text-secondary uppercase block font-semibold">Net Annualized ARR</span>
                <span className="font-mono font-bold text-base text-accent mt-0.5 block">
                  ₦{Math.round(annualizedNetARR / 1000000).toLocaleString()}M
                </span>
                <span className="text-[10px] text-text-secondary">Net projected run rate</span>
              </div>

              <div>
                <span className="text-[10px] text-text-secondary uppercase block font-semibold">Net Monthly MRR</span>
                <span className="font-mono font-bold text-base text-teal-400 mt-0.5 block">
                  ₦{Math.round(monthlyNetMRR / 1000000).toLocaleString()}M
                </span>
                <span className="text-[10px] text-text-secondary">Net profit velocity</span>
              </div>
            </div>
          </div>

          {/* Plan Revenue Share Box */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                  Revenue by Plan Tier
                </span>
                <span className="text-[11px] font-mono text-text-secondary">
                  {timeframeMeta.shortLabel} Window
                </span>
              </div>

              <div className="space-y-3.5 mt-4">
                {planBreakdown.map((item) => (
                  <div key={item.plan} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-text-primary flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${
                          item.plan === 'Enterprise' ? 'bg-purple-500' :
                          item.plan === 'Premium' ? 'bg-accent' :
                          item.plan === 'Standard' ? 'bg-emerald-500' : 'bg-blue-500'
                        }`} />
                        <span>{item.plan}</span>
                        <span className="text-[10px] text-text-secondary font-mono">({item.count})</span>
                      </span>
                      <div className="font-mono text-right">
                        <span className="font-bold text-text-primary">₦{item.totalSum.toLocaleString()}</span>
                        <span className="text-[10px] text-text-secondary ml-1.5">({item.percentage}%)</span>
                      </div>
                    </div>
                    {/* Visual Bar */}
                    <div className="h-1.5 w-full bg-bg rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          item.plan === 'Enterprise' ? 'bg-purple-500' :
                          item.plan === 'Premium' ? 'bg-accent' :
                          item.plan === 'Standard' ? 'bg-emerald-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${Math.max(Number(item.percentage), 2)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-border/70 flex items-center justify-between text-xs text-text-secondary">
              <span>Total Stores Renewed:</span>
              <span className="font-bold text-text-primary font-mono">{timeframePayments.length} stores</span>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 3. OPERATING EXPENSES SECTION (Record & Review One-Time vs Recurring) */}
      {/* ------------------------------------------------------------------- */}
      {(activeSection === 'all' || activeSection === 'expenses') && (
        <div id="operating-expenses-section" className="space-y-4 pt-2">
          
          {/* Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card border border-border rounded-2xl p-5 shadow-sm">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                    <span>Operating Expenses &amp; Expenditure Tracker</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 border border-border text-text-secondary">
                      {expenses.length} Records
                    </span>
                  </h3>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Record one-time overheads and recurring operational liabilities deducted before total earnings are summarised.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportExpensesCSV}
                className="border border-border bg-bg hover:bg-white/5 text-text-secondary hover:text-text-primary px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Expenses CSV</span>
              </button>
              <button
                onClick={() => setIsRecordExpenseModalOpen(true)}
                className="bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>+ Record New Expense</span>
              </button>
            </div>
          </div>

          {/* Quick Expense KPI Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-card border border-border rounded-xl p-3.5 shadow-sm">
              <div className="flex items-center justify-between text-xs text-text-secondary mb-1">
                <span>Total Factored in {timeframeMeta.shortLabel}</span>
                <Receipt className="w-3.5 h-3.5 text-rose-400" />
              </div>
              <div className="font-mono text-lg font-bold text-rose-400">
                ₦{totalFactoredExpenses.toLocaleString()}
              </div>
              <span className="text-[10px] text-text-secondary">
                Deducted from gross collections
              </span>
            </div>

            <div className="bg-card border border-border rounded-xl p-3.5 shadow-sm">
              <div className="flex items-center justify-between text-xs text-text-secondary mb-1">
                <span>One-Time Expenses</span>
                <Clock className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="font-mono text-lg font-bold text-blue-400">
                ₦{sumOneTimeExpenses.toLocaleString()}
              </div>
              <span className="text-[10px] text-text-secondary">
                {timeframeOneTimeExpenses.length} records in active window
              </span>
            </div>

            <div className="bg-card border border-border rounded-xl p-3.5 shadow-sm">
              <div className="flex items-center justify-between text-xs text-text-secondary mb-1">
                <span>Recurring Commitments</span>
                <Repeat className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <div className="font-mono text-lg font-bold text-purple-400">
                ₦{sumRecurringExpenses.toLocaleString()}
              </div>
              <span className="text-[10px] text-text-secondary">
                ₦{monthlyRecurringRunRate.toLocaleString()} monthly base burn
              </span>
            </div>

            <div className="bg-card border border-border rounded-xl p-3.5 shadow-sm">
              <div className="flex items-center justify-between text-xs text-text-secondary mb-1">
                <span>Operating Burn Ratio</span>
                <TrendingUp className="w-3.5 h-3.5 text-accent" />
              </div>
              <div className="font-mono text-lg font-bold text-text-primary">
                {expenseRatio}%
              </div>
              <span className="text-[10px] text-text-secondary">
                Of total gross revenue consumed
              </span>
            </div>
          </div>

          {/* Filter Bar for Expenses */}
          <div className="bg-card border border-border rounded-xl p-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
              <input
                type="text"
                placeholder="Search expenses by title, vendor, category, or receipt ref..."
                value={expenseSearch}
                onChange={(e) => setExpenseSearch(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg pl-9 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Type Filter Buttons */}
              <div className="bg-bg border border-border rounded-lg p-0.5 flex items-center gap-0.5">
                {[
                  { id: 'all', label: 'All Types' },
                  { id: 'onetime', label: 'One-Time Only' },
                  { id: 'recurring', label: 'Recurring Only' },
                ].map((tf) => (
                  <button
                    key={tf.id}
                    onClick={() => setExpenseTypeFilter(tf.id as any)}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
                      expenseTypeFilter === tf.id
                        ? 'bg-card text-text-primary shadow-sm font-bold'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>

              {/* Category Filter Dropdown */}
              <select
                value={expenseCategoryFilter}
                onChange={(e) => setExpenseCategoryFilter(e.target.value)}
                className="bg-bg border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="all">All Categories</option>
                <option value="Infrastructure & Cloud">Infrastructure &amp; Cloud</option>
                <option value="Salaries & Field Support">Salaries &amp; Field Support</option>
                <option value="SMS & Telecom APIs">SMS &amp; Telecom APIs</option>
                <option value="Marketing & Outreach">Marketing &amp; Outreach</option>
                <option value="Hardware & POS Terminals">Hardware &amp; POS Terminals</option>
                <option value="Compliance & Licensing">Compliance &amp; Licensing</option>
                <option value="Office & Operations">Office &amp; Operations</option>
              </select>
            </div>
          </div>

          {/* Expenses Ledger Table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-bg/60 border-b border-border text-[11px] font-bold text-text-secondary uppercase tracking-wider select-none">
                    <th className="py-3 px-4">Expense Title &amp; Payee</th>
                    <th className="py-3 px-4">Classification &amp; Cadence</th>
                    <th className="py-3 px-4">Cost Category</th>
                    <th className="py-3 px-4">Date / Incurred</th>
                    <th className="py-3 px-4 text-right">Base Amount (₦)</th>
                    <th className="py-3 px-4 text-right">Factored in {timeframeMeta.shortLabel}</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-text-secondary">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Receipt className="w-8 h-8 text-text-secondary/40" />
                          <p className="font-semibold text-sm">No expenses match your search or filter criteria.</p>
                          <p className="text-xs text-text-secondary/70">Record a new expense to factor into net earnings calculations.</p>
                          <button
                            onClick={() => setIsRecordExpenseModalOpen(true)}
                            className="mt-2 bg-accent text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-accent/90"
                          >
                            + Record First Expense
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredExpenses.map((e) => {
                      const isOneTime = e.type === 'onetime';
                      const isInWindow = isOneTime
                        ? e.timestamp >= timeframeMeta.cutoffTime && e.timestamp <= timeframeMeta.now
                        : true;
                      
                      const allocatedAmount = isOneTime
                        ? (isInWindow ? e.amount : 0)
                        : calculateRecurringCostForDays(e, timeframeMeta.durationDays);

                      return (
                        <tr key={e.id} className="hover:bg-white/[0.02] transition-colors group">
                          {/* Title & Payee */}
                          <td className="py-3.5 px-4">
                            <div>
                              <span className="font-bold text-text-primary block">{e.title}</span>
                              <div className="text-[11px] text-text-secondary flex items-center gap-1.5 mt-0.5">
                                <span>Payee: <strong className="text-text-primary/90">{e.vendor}</strong></span>
                                {e.receipt_ref && (
                                  <>
                                    <span>·</span>
                                    <span className="font-mono text-accent">{e.receipt_ref}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Classification: One-Time vs Recurring */}
                          <td className="py-3.5 px-4">
                            {isOneTime ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                                <Clock className="w-3 h-3" />
                                <span>One-Time</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30">
                                <Repeat className="w-3 h-3" />
                                <span className="capitalize">Recurring ({e.frequency || 'Monthly'})</span>
                              </span>
                            )}
                          </td>

                          {/* Cost Category */}
                          <td className="py-3.5 px-4">
                            <span className="text-xs text-text-primary font-medium px-2 py-0.5 rounded bg-white/5 border border-border">
                              {e.category}
                            </span>
                          </td>

                          {/* Date Incurred */}
                          <td className="py-3.5 px-4 font-mono text-[11px] text-text-secondary">
                            <span className="text-text-primary font-semibold block">
                              {format(new Date(e.date), 'MMM dd, yyyy')}
                            </span>
                            <span className="text-[10px] text-text-secondary">
                              via {e.payment_method}
                            </span>
                          </td>

                          {/* Base Amount */}
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-xs text-text-primary">
                            ₦{e.amount.toLocaleString()}
                          </td>

                          {/* Factored in this timeframe */}
                          <td className="py-3.5 px-4 text-right font-mono">
                            <span className={`font-extrabold text-sm block ${
                              allocatedAmount > 0 ? 'text-rose-400' : 'text-text-secondary opacity-50'
                            }`}>
                              -₦{allocatedAmount.toLocaleString()}
                            </span>
                            <span className="text-[10px] text-text-secondary">
                              {isOneTime 
                                ? (isInWindow ? `Incurred in ${timeframeMeta.shortLabel}` : 'Outside window')
                                : `${timeframeMeta.durationDays}d allocation`
                              }
                            </span>
                          </td>

                          {/* Action Button: Delete */}
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => setExpenseToDelete(e)}
                              className="p-1.5 text-text-secondary hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors"
                              title="Delete Expense"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 4. SUBSCRIPTION COLLECTION VELOCITY TIMELINE & BREAKDOWN */}
      {/* ------------------------------------------------------------------- */}
      {(activeSection === 'all' || activeSection === 'subscriptions') && (
        <>
          {/* Visual Timeline Bar Chart of Subscription Revenue Collections */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-accent" />
                  <span>Subscription Collection Velocity Timeline</span>
                </h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  Chronological aggregation of fees received across {timeframeMeta.label.toLowerCase()}.
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs text-text-secondary font-mono">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-accent" />
                  <span>Daily Collections (₦)</span>
                </span>
                <span>·</span>
                <span>Max Period Peak: ₦{chartBuckets.maxBucketSum.toLocaleString()}</span>
              </div>
            </div>

            {/* SVG/CSS Bar Chart Grid */}
            <div className="pt-4 pb-2">
              <div className="h-44 sm:h-52 w-full flex items-end gap-1.5 sm:gap-3 border-b border-border/80 px-2">
                {chartBuckets.buckets.map((b, idx) => {
                  const heightPercent = chartBuckets.maxBucketSum > 0 
                    ? Math.max(Math.round((b.sum / chartBuckets.maxBucketSum) * 100), 4)
                    : 4;

                  return (
                    <div 
                      key={idx}
                      className="flex-1 flex flex-col items-center justify-end h-full group relative cursor-pointer"
                    >
                      {/* Tooltip on hover */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full mb-2 bg-card border border-border text-text-primary p-2.5 rounded-xl shadow-xl z-20 pointer-events-none text-left whitespace-nowrap min-w-[140px]">
                        <p className="text-[10px] text-text-secondary uppercase font-semibold">{b.label} ({b.sublabel})</p>
                        <p className="text-xs font-mono font-bold text-accent mt-0.5">₦{b.sum.toLocaleString()}</p>
                        <p className="text-[10px] text-emerald-400 mt-0.5">{b.count} pharmacy subscriptions</p>
                      </div>

                      {/* Amount display on tall desktop bars */}
                      {b.sum > 0 && (
                        <span className="text-[9px] font-mono text-text-secondary/70 mb-1 hidden md:block truncate">
                          ₦{Math.round(b.sum / 1000)}k
                        </span>
                      )}

                      {/* Bar */}
                      <div 
                        className="w-full rounded-t-md transition-all duration-300 group-hover:bg-accent/80 bg-accent/30 border-t border-x border-accent/50 group-hover:border-accent"
                        style={{ height: `${heightPercent}%` }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Bar Chart Labels */}
              <div className="flex items-center justify-between gap-1.5 sm:gap-3 px-2 pt-2 text-[10px] text-text-secondary font-mono">
                {chartBuckets.buckets.map((b, idx) => (
                  <div key={idx} className="flex-1 text-center truncate">
                    <span className="font-semibold block">{b.label}</span>
                    <span className="text-[9px] opacity-70 hidden sm:block">{b.sublabel}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Cycle & Payment Method Breakdown Panels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Billing Cycle Distribution */}
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-accent" />
                  <span>Billing Cycle Distribution</span>
                </h4>
                <span className="text-[10px] font-mono text-text-secondary">Volume Breakdown</span>
              </div>

              <div className="space-y-3 pt-1">
                {cycleBreakdown.map((item) => (
                  <div key={item.cycle} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-text-primary">
                        {item.cycle} Subscriptions
                      </span>
                      <div className="font-mono text-right">
                        <span className="font-bold text-text-primary">₦{item.totalSum.toLocaleString()}</span>
                        <span className="text-[10px] text-text-secondary ml-1.5">({item.percentage}%)</span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-bg rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-accent rounded-full"
                        style={{ width: `${Math.max(Number(item.percentage), 2)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Settlement Channels */}
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-accent" />
                  <span>Settlement Channel Performance</span>
                </h4>
                <span className="text-[10px] font-mono text-emerald-400">100% Verified</span>
              </div>

              <div className="space-y-3 pt-1">
                {methodBreakdown.map((item) => (
                  <div key={item.method} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-text-primary truncate max-w-[200px]">
                        {item.method}
                      </span>
                      <div className="font-mono text-right shrink-0">
                        <span className="font-bold text-text-primary">₦{item.totalSum.toLocaleString()}</span>
                        <span className="text-[10px] text-text-secondary ml-1.5">({item.percentage}%)</span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-bg rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${Math.max(Number(item.percentage), 2)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 5. SUBSCRIPTION PAYMENTS LEDGER TABLE */}
      {/* ------------------------------------------------------------------- */}
      {(activeSection === 'all' || activeSection === 'subscriptions') && (
        <div className="space-y-3 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-text-primary flex items-center gap-2">
                <FileText className="w-4 h-4 text-accent" />
                <span>Subscription Payments Ledger ({timeframeMeta.label})</span>
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Click on column headers to sort by amount paid, payment date, store name, or plan tier.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCSV}
                className="border border-border bg-card hover:bg-white/5 text-text-primary px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export {timeframeMeta.shortLabel} Ledger</span>
              </button>
            </div>
          </div>

          {/* Filter bar */}
          <div className="bg-card border border-border rounded-xl p-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
              <input
                type="text"
                placeholder="Search by store name, owner, reference, or state..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full bg-bg border border-border rounded-lg pl-9 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={planFilter}
                onChange={(e) => {
                  setPlanFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="bg-bg border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="all">All Plans</option>
                <option value="Basic">Basic Tier</option>
                <option value="Standard">Standard Tier</option>
                <option value="Premium">Premium Tier</option>
                <option value="Enterprise">Enterprise Tier</option>
              </select>

              <select
                value={methodFilter}
                onChange={(e) => {
                  setMethodFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-bg border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="all">All Payment Channels</option>
                <option value="NIBSS Instant Settlement">NIBSS Settlement</option>
                <option value="Debit Card (Paystack/Flutterwave)">Debit Card</option>
                <option value="Direct Bank Deposit">Direct Bank Deposit</option>
                <option value="POS Terminal Transfer">POS Terminal</option>
              </select>
            </div>
          </div>

          {/* High Density Table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-bg/60 border-b border-border text-[11px] font-bold text-text-secondary uppercase tracking-wider select-none">
                    <th 
                      className="py-3 px-4 cursor-pointer hover:text-text-primary transition-colors"
                      onClick={() => toggleSort('amount_paid')}
                    >
                      <div className="flex items-center gap-1.5 text-accent font-extrabold">
                        <span>Amount Paid (₦)</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>

                    <th 
                      className="py-3 px-4 cursor-pointer hover:text-text-primary transition-colors"
                      onClick={() => toggleSort('timestamp')}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Payment Date &amp; Time</span>
                        <ArrowUpDown className="w-3 h-3 opacity-60" />
                      </div>
                    </th>

                    <th 
                      className="py-3 px-4 cursor-pointer hover:text-text-primary transition-colors"
                      onClick={() => toggleSort('pharmacy_name')}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Pharmacy Store</span>
                        <ArrowUpDown className="w-3 h-3 opacity-60" />
                      </div>
                    </th>

                    <th 
                      className="py-3 px-4 cursor-pointer hover:text-text-primary transition-colors"
                      onClick={() => toggleSort('plan')}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Plan &amp; Cycle</span>
                        <ArrowUpDown className="w-3 h-3 opacity-60" />
                      </div>
                    </th>

                    <th className="py-3 px-4">Channel &amp; Reference</th>
                    <th className="py-3 px-4 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedPayments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-text-secondary">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <CreditCard className="w-8 h-8 text-text-secondary/40" />
                          <p className="font-semibold text-sm">No subscription payments found for {timeframeMeta.label}.</p>
                          <p className="text-xs text-text-secondary/70">Try choosing a wider timeframe like 3 Months or 1 Year.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="py-3.5 px-4 font-mono font-bold text-sm text-emerald-400">
                          ₦{p.amount_paid.toLocaleString()}
                        </td>

                        <td className="py-3.5 px-4 font-mono text-[11px] text-text-secondary">
                          <span className="text-text-primary font-semibold block">
                            {format(new Date(p.payment_date), 'MMM dd, yyyy')}
                          </span>
                          <span className="text-[10px]">
                            {format(new Date(p.payment_date), 'hh:mm:ss a')}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <div>
                            <span className="font-bold text-text-primary block">{p.pharmacy_name}</span>
                            <div className="text-[11px] text-text-secondary flex items-center gap-1.5 mt-0.5">
                              <span>{p.owner_name}</span>
                              <span>·</span>
                              <span>{p.state}</span>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div>
                            <span className="font-semibold text-text-primary block">{p.plan} Tier</span>
                            <span className="text-[11px] text-text-secondary">
                              {p.cycle} Cycle
                            </span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div>
                            <span className="font-semibold text-text-primary block truncate max-w-[180px]">
                              {p.payment_method}
                            </span>
                            <span className="font-mono text-[10px] text-accent block">
                              {p.reference_no}
                            </span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => setSelectedReceipt(p)}
                            className="border border-border hover:bg-white/5 text-text-secondary hover:text-text-primary px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors inline-flex items-center gap-1"
                          >
                            <FileText className="w-3 h-3 text-accent" />
                            <span>Slip</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="p-3 border-t border-border flex items-center justify-between text-xs text-text-secondary bg-bg/40">
              <span>
                Showing {Math.min(filteredAndSortedPayments.length, (currentPage - 1) * itemsPerPage + 1)} to {Math.min(filteredAndSortedPayments.length, currentPage * itemsPerPage)} of {filteredAndSortedPayments.length} payments
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded border border-border disabled:opacity-30 hover:bg-white/5 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 font-mono text-[11px] font-bold text-text-primary">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded border border-border disabled:opacity-30 hover:bg-white/5 transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POPUP RECEIPT SLIP MODAL */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-border flex items-center justify-between bg-bg/50">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-sm text-text-primary">Payment Settlement Receipt</h3>
              </div>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="p-1 text-text-secondary hover:text-text-primary rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs font-mono">
              <div className="text-center pb-3 border-b border-dashed border-border">
                <span className="text-[10px] text-text-secondary uppercase">PharmacyFlow Nigeria</span>
                <p className="text-xl font-extrabold text-emerald-400 mt-1">
                  ₦{selectedReceipt.amount_paid.toLocaleString()}
                </p>
                <span className="text-[11px] text-text-primary font-bold">
                  {selectedReceipt.plan} License ({selectedReceipt.cycle})
                </span>
              </div>

              <div className="space-y-2 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Pharmacy Store:</span>
                  <span className="text-text-primary font-bold">{selectedReceipt.pharmacy_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Superintendent:</span>
                  <span className="text-text-primary">{selectedReceipt.owner_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">State Jurisdiction:</span>
                  <span className="text-text-primary">{selectedReceipt.state}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Payment Method:</span>
                  <span className="text-text-primary">{selectedReceipt.payment_method}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Settlement Reference:</span>
                  <span className="text-accent font-bold">{selectedReceipt.reference_no}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Timestamp:</span>
                  <span className="text-text-primary">{format(new Date(selectedReceipt.payment_date), 'PPpp')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Settlement Status:</span>
                  <span className="text-emerald-400 font-bold uppercase">Successful / Paid</span>
                </div>
              </div>

              <div className="pt-3 border-t border-dashed border-border text-[10px] text-text-secondary text-center">
                Electronic verified transaction record. Certified for NAFDAC &amp; PCN compliance archives.
              </div>
            </div>

            <div className="p-3 border-t border-border flex justify-end bg-bg/40">
              <button
                onClick={() => setSelectedReceipt(null)}
                className="px-4 py-1.5 bg-card border border-border rounded-lg text-xs font-semibold text-text-secondary hover:text-text-primary"
              >
                Close Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECORD OPERATING EXPENSE MODAL */}
      <RecordExpenseModal
        isOpen={isRecordExpenseModalOpen}
        onClose={() => setIsRecordExpenseModalOpen(false)}
        onSaveExpense={handleAddExpense}
      />

      {/* DELETE EXPENSE CONFIRMATION MODAL */}
      {expenseToDelete && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-text-primary">Delete Operating Expense?</h4>
                <p className="text-xs text-text-secondary">This will recalculate net earnings.</p>
              </div>
            </div>

            <p className="text-xs text-text-secondary bg-bg p-3 rounded-xl border border-border">
              Are you sure you want to delete <strong className="text-text-primary">{expenseToDelete.title}</strong> (₦{expenseToDelete.amount.toLocaleString()})?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setExpenseToDelete(null)}
                className="px-3.5 py-1.5 rounded-lg border border-border text-xs font-semibold text-text-secondary hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteExpense(expenseToDelete.id)}
                className="bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs px-4 py-1.5 rounded-lg shadow-sm"
              >
                Delete Expense
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
