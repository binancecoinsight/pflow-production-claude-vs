import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Wallet, 
  Coins, 
  ArrowUpRight, 
  ArrowDownRight, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Lock, 
  Calculator, 
  FileText, 
  Calendar, 
  Building2, 
  User, 
  Plus, 
  Check, 
  X, 
  CreditCard, 
  Banknote, 
  ArrowRightLeft 
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { 
  CashRegisterSession, 
  ShiftReconciliationSummary, 
  getActiveCashRegisterSession, 
  openCashRegisterSession, 
  closeCashRegisterSession, 
  fetchShiftMetrics, 
  listCashRegisterSessions, 
  calculateDenominationsTotal, 
  DenominationCount 
} from '../../lib/cash/reconciliation';
import { formatMinorUnits, formatDate } from '../pos/formatters';
import { CapabilityAsyncBoundary } from '../../lib/subscription/capabilityBoundary';

const DEFAULT_DENOMINATIONS = [1000, 500, 200, 100, 50];

export const CashReconciliationView: React.FC<{ openShiftAllowed?: boolean; reconcileExistingShiftAllowed?: boolean }> = ({
  openShiftAllowed = true,
  reconcileExistingShiftAllowed = true,
}) => {
  const { user, pharmacy, branch, role } = useAuth();
  const currency = pharmacy?.currency || 'NGN';

  // Active Session State
  const [activeSession, setActiveSession] = useState<CashRegisterSession | null>(null);
  const [shiftSummary, setShiftSummary] = useState<ShiftReconciliationSummary | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Open Shift Form State
  const [openFloatMajor, setOpenFloatMajor] = useState<string>('10000');
  const [openNotes, setOpenNotes] = useState<string>('');
  const [isOpeningShift, setIsOpeningShift] = useState<boolean>(false);

  // Close Shift Form State
  const [isCloseModalOpen, setIsCloseModalOpen] = useState<boolean>(false);
  const [countedCashMajor, setCountedCashMajor] = useState<string>('');
  const [closeNotes, setCloseNotes] = useState<string>('');
  const [isClosingShift, setIsClosingShift] = useState<boolean>(false);

  // Denominations Breakdown State
  const [isDenomModalOpen, setIsDenomModalOpen] = useState<boolean>(false);
  const [denominationCounts, setDenominationCounts] = useState<Record<number, number>>({
    1000: 0,
    500: 0,
    200: 0,
    100: 0,
    50: 0
  });

  // History State
  const [sessionHistory, setSessionHistory] = useState<CashRegisterSession[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');

  // Messages
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const openBoundaryRef = useRef(new CapabilityAsyncBoundary('', openShiftAllowed));

  useEffect(() => {
    if (openBoundaryRef.current.update(`${pharmacy?.id || ''}:${branch?.id || ''}:${user?.id || ''}`, openShiftAllowed)) {
      setIsOpeningShift(false);
    }
  }, [pharmacy?.id, branch?.id, user?.id, openShiftAllowed]);

  useEffect(() => () => openBoundaryRef.current.invalidate(), []);

  // 1. Load Active Session and Shift Metrics
  const loadActiveSession = useCallback(async () => {
    if (!pharmacy?.id || !user?.id) return;
    setIsLoadingSession(true);
    setErrorMessage(null);

    try {
      const session = await getActiveCashRegisterSession(
        supabase,
        pharmacy.id,
        user.id,
        branch?.id
      );
      setActiveSession(session);

      if (session) {
        const metrics = await fetchShiftMetrics(
          supabase,
          pharmacy.id,
          session.branch_id,
          session.cashier_id,
          session.opened_at,
          session.opening_cash
        );
        setShiftSummary(metrics);
        setCountedCashMajor((metrics.expectedCash / 100).toFixed(2));
      } else {
        setShiftSummary(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load register session';
      setErrorMessage(msg);
    } finally {
      setIsLoadingSession(false);
    }
  }, [pharmacy?.id, user?.id, branch?.id]);

  // 2. Load History
  const loadHistory = useCallback(async () => {
    if (!pharmacy?.id) return;
    setIsLoadingHistory(true);
    try {
      const list = await listCashRegisterSessions(supabase, pharmacy.id, {
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        limit: 40
      });
      setSessionHistory(list);
    } catch {
      // Ignored
    } finally {
      setIsLoadingHistory(false);
    }
  }, [pharmacy?.id, statusFilter]);

  useEffect(() => {
    loadActiveSession();
    loadHistory();
  }, [loadActiveSession, loadHistory]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadActiveSession(), loadHistory()]);
    setIsRefreshing(false);
  };

  // 3. Handle Open Shift
  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const mutationToken = openBoundaryRef.current.begin();
    if (!openShiftAllowed || !mutationToken) return;
    if (!pharmacy?.id || !branch?.id || !user?.id) {
      setErrorMessage('Active pharmacy, branch, and cashier identity are required');
      return;
    }

    const floatMajor = parseFloat(openFloatMajor);
    if (isNaN(floatMajor) || floatMajor < 0) {
      setErrorMessage('Opening float must be a non-negative amount');
      return;
    }

    setIsOpeningShift(true);
    setErrorMessage(null);

    try {
      const openingCashMinor = Math.round(floatMajor * 100);
      const res = await openCashRegisterSession(supabase, {
        pharmacyId: pharmacy.id,
        branchId: branch.id,
        cashierId: user.id,
        openingCash: openingCashMinor,
        notes: openNotes
      });
      if (!openBoundaryRef.current.accepts(mutationToken)) return;

      if (!res.success || !res.session) {
        setErrorMessage(res.error || 'Failed to open register shift');
        return;
      }

      setSuccessMessage('Register shift opened successfully');
      await loadActiveSession();
      await loadHistory();
    } catch (err: unknown) {
      if (!openBoundaryRef.current.accepts(mutationToken)) return;
      const msg = err instanceof Error ? err.message : 'Error opening shift';
      setErrorMessage(msg);
    } finally {
      if (openBoundaryRef.current.accepts(mutationToken)) setIsOpeningShift(false);
    }
  };

  // 4. Handle Close Shift
  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconcileExistingShiftAllowed || !activeSession || !pharmacy?.id || !shiftSummary) return;

    const countedMajor = parseFloat(countedCashMajor);
    if (isNaN(countedMajor) || countedMajor < 0) {
      setErrorMessage('Counted cash must be a non-negative amount');
      return;
    }

    setIsClosingShift(true);
    setErrorMessage(null);

    try {
      const countedMinor = Math.round(countedMajor * 100);
      const res = await closeCashRegisterSession(supabase, {
        sessionId: activeSession.id,
        pharmacyId: pharmacy.id,
        countedCash: countedMinor,
        expectedCash: shiftSummary.expectedCash,
        notes: closeNotes
      });

      if (!res.success) {
        setErrorMessage(res.error || 'Failed to close register shift');
        return;
      }

      setSuccessMessage('Register shift reconciled and closed successfully');
      setIsCloseModalOpen(false);
      await loadActiveSession();
      await loadHistory();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error closing shift';
      setErrorMessage(msg);
    } finally {
      setIsClosingShift(false);
    }
  };

  // 5. Apply Denominations Count
  const applyDenominations = () => {
    const list: DenominationCount[] = Object.entries(denominationCounts).map(([denom, count]) => ({
      denomination: parseInt(denom, 10),
      count
    }));
    const totalMinor = calculateDenominationsTotal(list, 100);
    setCountedCashMajor((totalMinor / 100).toFixed(2));
    setIsDenomModalOpen(false);
  };

  // Compute live variance in close modal
  const countedMinor = Math.round((parseFloat(countedCashMajor) || 0) * 100);
  const liveVariance = shiftSummary ? countedMinor - shiftSummary.expectedCash : 0;

  return (
    <div className="space-y-6">
      {!openShiftAllowed && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200" role="status">
          Advisory subscription containment: opening a new cash shift is disabled. Historical shifts remain readable, and a server-known existing shift may still be closed and reconciled under existing authority.
        </div>
      )}
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900/90 border border-slate-800/80 shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-emerald-500/20">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span>Cash Register & Tender Reconciliation</span>
              {activeSession ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  SHIFT OPEN
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                  NO ACTIVE SHIFT
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Cashier drawer accountability, cash counts, shift settlement, and tender auditing
            </p>
          </div>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer self-start sm:self-auto border border-slate-700/60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Section: Active Shift or Open Shift Form */}
      {isLoadingSession ? (
        <div className="p-12 text-center text-slate-500 space-y-2 rounded-2xl bg-slate-900 border border-slate-800">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-400" />
          <p className="text-xs font-medium">Checking register shift status...</p>
        </div>
      ) : activeSession && shiftSummary ? (
        /* Active Shift Dashboard */
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  Active Drawer Session
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  #{activeSession.id.slice(0, 8).toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Opened at: {formatDate(activeSession.opened_at)}</span>
              </p>
            </div>

            <button
              onClick={() => { if (reconcileExistingShiftAllowed) setIsCloseModalOpen(true); }}
              disabled={!reconcileExistingShiftAllowed}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-rose-900/20 transition cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>Close Shift & Count Drawer</span>
            </button>
          </div>

          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Opening Float */}
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Opening Cash Float
              </span>
              <div className="text-xl font-bold font-mono text-white">
                {formatMinorUnits(shiftSummary.openingCash, currency)}
              </div>
              <p className="text-[10px] text-slate-500">Starting drawer balance</p>
            </div>

            {/* Cash Collected */}
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
              <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Cash Sales (+)</span>
              </span>
              <div className="text-xl font-bold font-mono text-emerald-400">
                {formatMinorUnits(shiftSummary.sales.cashSales, currency)}
              </div>
              <p className="text-[10px] text-slate-500">
                From {shiftSummary.sales.salesCount} sale transactions
              </p>
            </div>

            {/* Cash Refunds */}
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
              <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider flex items-center gap-1">
                <ArrowDownRight className="w-3.5 h-3.5" />
                <span>Cash Refunds (-)</span>
              </span>
              <div className="text-xl font-bold font-mono text-rose-400">
                {formatMinorUnits(shiftSummary.returns.cashRefunds, currency)}
              </div>
              <p className="text-[10px] text-slate-500">
                From {shiftSummary.returns.returnsCount} returned items
              </p>
            </div>

            {/* Expected Drawer Cash */}
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
              <span className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">
                Expected In Drawer
              </span>
              <div className="text-xl font-bold font-mono text-emerald-300">
                {formatMinorUnits(shiftSummary.expectedCash, currency)}
              </div>
              <p className="text-[10px] text-emerald-400/80">Opening + Cash Sales - Refunds</p>
            </div>
          </div>

          {/* Tender Breakdown Breakdown */}
          <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/60 space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Shift Tender Breakdown (All Methods)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1.5 mb-1">
                  <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Cash</span>
                </span>
                <span className="font-mono font-bold text-white">
                  {formatMinorUnits(shiftSummary.sales.cashSales, currency)}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1.5 mb-1">
                  <CreditCard className="w-3.5 h-3.5 text-blue-400" />
                  <span>Card</span>
                </span>
                <span className="font-mono font-bold text-white">
                  {formatMinorUnits(shiftSummary.sales.cardSales, currency)}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1.5 mb-1">
                  <ArrowRightLeft className="w-3.5 h-3.5 text-purple-400" />
                  <span>Bank Transfer</span>
                </span>
                <span className="font-mono font-bold text-white">
                  {formatMinorUnits(shiftSummary.sales.transferSales, currency)}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1.5 mb-1">
                  <Wallet className="w-3.5 h-3.5 text-amber-400" />
                  <span>Total Sales</span>
                </span>
                <span className="font-mono font-bold text-emerald-400">
                  {formatMinorUnits(shiftSummary.sales.totalSales, currency)}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Open Shift Form */
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-5 max-w-xl mx-auto">
          <div className="text-center space-y-1">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-2">
              <Wallet className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-white">Open Cash Register Shift</h2>
            <p className="text-xs text-slate-400">
              Record your opening cash float to begin processing POS sales with full cash accountability.
            </p>
          </div>

          <form onSubmit={handleOpenShift} className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Opening Cash Float ({currency})
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={openFloatMajor}
                  onChange={(e) => setOpenFloatMajor(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-base font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Quick Float Shortcuts */}
              <div className="flex items-center gap-2 mt-2">
                {[0, 5000, 10000, 20000, 50000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setOpenFloatMajor(amt.toString())}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 transition"
                  >
                    ₦{amt.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Shift Notes (Optional)
              </label>
              <input
                type="text"
                value={openNotes}
                onChange={(e) => setOpenNotes(e.target.value)}
                placeholder="e.g. Morning shift, register #1"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button
              type="submit"
              disabled={isOpeningShift || !openFloatMajor || !openShiftAllowed}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50"
            >
              {isOpeningShift ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Opening Register Shift...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Confirm & Open Register Shift</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Close Shift Modal */}
      {reconcileExistingShiftAllowed && isCloseModalOpen && activeSession && shiftSummary && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                <span>Reconcile & Close Cash Drawer</span>
              </h2>
              <button
                onClick={() => setIsCloseModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCloseShift} className="space-y-4">
              {/* Expected Cash Reminder */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center text-xs">
                <span className="text-slate-400">System Expected Cash:</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">
                  {formatMinorUnits(shiftSummary.expectedCash, currency)}
                </span>
              </div>

              {/* Counted Cash Input & Denominations Helper Button */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Physical Counted Cash ({currency})
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsDenomModalOpen(true)}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1"
                  >
                    <Calculator className="w-3.5 h-3.5" />
                    <span>Count by Bills</span>
                  </button>
                </div>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={countedCashMajor}
                  onChange={(e) => setCountedCashMajor(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-base font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Live Variance Calculation */}
              <div
                className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${
                  liveVariance === 0
                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                    : liveVariance > 0
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                <span>Reconciliation Variance:</span>
                <span className="font-mono font-bold text-sm">
                  {liveVariance === 0
                    ? 'Balanced (₦0.00)'
                    : liveVariance > 0
                    ? `Over by ${formatMinorUnits(liveVariance, currency)}`
                    : `Short by ${formatMinorUnits(Math.abs(liveVariance), currency)}`}
                </span>
              </div>

              {/* Shift Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Closing Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  placeholder="Explain any variance or bank drop details..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCloseModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isClosingShift || !countedCashMajor}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isClosingShift && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Confirm & Close Shift</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Denominations Helper Modal */}
      {isDenomModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-emerald-400" />
                <span>Denomination Bill Counter</span>
              </h3>
              <button
                onClick={() => setIsDenomModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              {DEFAULT_DENOMINATIONS.map((denom) => (
                <div key={denom} className="flex items-center justify-between gap-3">
                  <span className="w-20 font-mono font-semibold text-slate-300">
                    ₦{denom.toLocaleString()}
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={denominationCounts[denom] || 0}
                    onChange={(e) => {
                      const count = Math.max(0, parseInt(e.target.value, 10) || 0);
                      setDenominationCounts((prev) => ({ ...prev, [denom]: count }));
                    }}
                    className="w-20 px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-center font-mono font-bold text-white"
                  />
                  <span className="w-24 text-right font-mono text-slate-400">
                    ₦{((denominationCounts[denom] || 0) * denom).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-xs font-bold text-white">
              <span>Total Calculated:</span>
              <span className="text-emerald-400 font-mono text-sm">
                ₦{Object.entries(denominationCounts)
                  .reduce((acc, [d, c]) => acc + parseInt(d, 10) * (c || 0), 0)
                  .toLocaleString()}
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsDenomModalOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyDenominations}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
              >
                Use Counted Total
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shift History & Reconciliation Logs */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Shift Settlement & Audit History
            </h2>
            <p className="text-xs text-slate-400">
              Permanent register records with authoritative timestamps and variance tracking
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            {(['ALL', 'OPEN', 'CLOSED'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  statusFilter === filter
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {/* History Table */}
        <div className="overflow-x-auto">
          {isLoadingHistory ? (
            <div className="py-8 text-center text-slate-500 text-xs">Loading shift records...</div>
          ) : sessionHistory.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              No shift reconciliation sessions found
            </div>
          ) : (
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Shift / Date</th>
                  <th className="py-3 px-4">Opening Float</th>
                  <th className="py-3 px-4">Expected Cash</th>
                  <th className="py-3 px-4">Counted Cash</th>
                  <th className="py-3 px-4">Variance</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {sessionHistory.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4">
                      <div className="font-sans font-medium text-white">{formatDate(s.opened_at)}</div>
                      <div className="text-[10px] text-slate-500">#{s.id.slice(0, 8).toUpperCase()}</div>
                    </td>
                    <td className="py-3 px-4">{formatMinorUnits(s.opening_cash, currency)}</td>
                    <td className="py-3 px-4">
                      {s.expected_cash !== null && s.expected_cash !== undefined
                        ? formatMinorUnits(s.expected_cash, currency)
                        : '—'}
                    </td>
                    <td className="py-3 px-4">
                      {s.counted_cash !== null && s.counted_cash !== undefined
                        ? formatMinorUnits(s.counted_cash, currency)
                        : '—'}
                    </td>
                    <td className="py-3 px-4">
                      {s.variance !== null && s.variance !== undefined ? (
                        <span
                          className={`font-bold ${
                            s.variance === 0
                              ? 'text-blue-400'
                              : s.variance > 0
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {s.variance === 0
                            ? '₦0.00'
                            : s.variance > 0
                            ? `+${formatMinorUnits(s.variance, currency)}`
                            : `-${formatMinorUnits(Math.abs(s.variance), currency)}`}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 px-4 font-sans">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          s.status === 'OPEN'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-400 text-[11px] max-w-[200px] truncate">
                      {s.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
