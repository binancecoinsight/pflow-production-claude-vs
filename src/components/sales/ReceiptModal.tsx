import React, { useRef } from 'react';
import { 
  X, 
  Printer, 
  CheckCircle2, 
  Clock, 
  Building2, 
  User, 
  CreditCard, 
  PlusCircle,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { ReceiptData } from '../../lib/sales/receipt';
import { formatMinorUnits, formatDate } from '../pos/formatters';

interface ReceiptModalProps {
  receipt: ReceiptData;
  onClose: () => void;
  onNewSale?: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  receipt,
  onClose,
  onNewSale
}) => {
  const receiptRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const isCommitted = receipt.syncStatus === 'COMMITTED';
  const isPending = receipt.isOfflinePending || receipt.syncStatus === 'PENDING SYNC';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150 print:p-0 print:bg-white print:static">
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-receipt-area, #printable-receipt-area * {
            visibility: visible;
          }
          #printable-receipt-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            max-width: 80mm;
            margin: 0 auto;
            padding: 10px;
            color: #000 !important;
            background: #fff !important;
            border: none !important;
            box-shadow: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div 
        className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh] print:max-w-none print:w-full print:border-none print:shadow-none print:bg-white print:text-black"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-title"
      >
        {/* Modal Top Bar (Hidden in Print) */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between no-print bg-slate-950/40">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Printer className="w-4 h-4" />
            </div>
            <h2 id="receipt-title" className="text-sm font-bold text-white tracking-tight">
              Customer Receipt
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Close receipt"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Receipt Body */}
        <div 
          id="printable-receipt-area" 
          ref={receiptRef}
          className="p-6 overflow-y-auto space-y-5 text-slate-200 print:text-black print:p-2 print:overflow-visible font-sans"
        >
          {/* Pharmacy Branding Header */}
          <div className="text-center space-y-1 pb-4 border-b border-dashed border-slate-700 print:border-black">
            <h1 className="text-lg font-black tracking-tight text-white print:text-black uppercase">
              {receipt.pharmacy.name}
            </h1>
            {receipt.branch.address && (
              <p className="text-xs text-slate-400 print:text-black">
                {receipt.branch.address}
              </p>
            )}
            {receipt.branch.phone && (
              <p className="text-xs text-slate-400 print:text-black">
                Tel: {receipt.branch.phone}
              </p>
            )}
            <div className="pt-1 flex items-center justify-center gap-1.5 text-[11px] text-emerald-400 print:text-black font-medium">
              <Building2 className="w-3.5 h-3.5 print:hidden" />
              <span>{receipt.branch.name}</span>
            </div>
          </div>

          {/* Transaction Metadata & Sync Status */}
          <div className="space-y-1.5 text-xs text-slate-300 print:text-black pb-3 border-b border-dashed border-slate-700 print:border-black">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 print:text-black">Receipt No:</span>
              <span className="font-mono font-bold text-white print:text-black">
                #{receipt.receiptNumber}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400 print:text-black">Date & Time:</span>
              <span>{formatDate(receipt.transactionTime)}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400 print:text-black">Cashier:</span>
              <span className="font-medium text-slate-200 print:text-black">
                {receipt.cashier.name}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400 print:text-black">Payment:</span>
              <span className="font-medium text-slate-200 print:text-black uppercase">
                {receipt.paymentMethod}
              </span>
            </div>

            {receipt.customer && (
              <div className="flex justify-between items-center">
                <span className="text-slate-400 print:text-black">Customer:</span>
                <span className="font-medium text-slate-200 print:text-black">
                  {receipt.customer.name || `Customer #${receipt.customer.id.slice(0, 8)}`}
                  {receipt.customer.phone && ` (${receipt.customer.phone})`}
                </span>
              </div>
            )}

            {/* Sync Status Badge */}
            <div className="flex justify-between items-center pt-1.5">
              <span className="text-slate-400 print:text-black">Status:</span>
              {isCommitted ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 print:border-none print:text-black">
                  <CheckCircle2 className="w-3 h-3 print:hidden" />
                  <span>COMMITTED</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 print:border-none print:text-black">
                  <Clock className="w-3 h-3 print:hidden" />
                  <span>PENDING SYNC</span>
                </span>
              )}
            </div>
          </div>

          {/* Line Items Table */}
          <div className="space-y-2">
            <div className="flex justify-between text-[11px] font-bold text-slate-400 print:text-black uppercase tracking-wider pb-1 border-b border-slate-800 print:border-black">
              <span>Item & Qty</span>
              <span className="text-right">Total</span>
            </div>

            <div className="space-y-2.5">
              {receipt.items.map((item) => (
                <div key={item.id} className="text-xs space-y-0.5">
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-medium text-slate-200 print:text-black leading-snug">
                      {item.productName}
                    </span>
                    <span className="font-mono font-semibold text-white print:text-black shrink-0">
                      {formatMinorUnits(item.lineTotal, receipt.currency)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-[11px] text-slate-400 print:text-black">
                    <span>
                      {item.quantity} × {formatMinorUnits(item.unitPrice, receipt.currency)}
                      {item.discount > 0 && ` (-${formatMinorUnits(item.discount, receipt.currency)})`}
                    </span>
                    {item.returnedQuantity && item.returnedQuantity > 0 && (
                      <span className="text-amber-400 print:text-black font-semibold text-[10px]">
                        ({item.returnedQuantity} returned)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Financial Calculation Totals */}
          <div className="pt-3 border-t border-dashed border-slate-700 print:border-black space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-400 print:text-black">
              <span>Subtotal:</span>
              <span className="font-mono">{formatMinorUnits(receipt.subtotal, receipt.currency)}</span>
            </div>

            {receipt.discount > 0 && (
              <div className="flex justify-between text-amber-400 print:text-black">
                <span>Discount:</span>
                <span className="font-mono">-{formatMinorUnits(receipt.discount, receipt.currency)}</span>
              </div>
            )}

            {receipt.tax > 0 && (
              <div className="flex justify-between text-slate-400 print:text-black">
                <span>Tax:</span>
                <span className="font-mono">+{formatMinorUnits(receipt.tax, receipt.currency)}</span>
              </div>
            )}

            <div className="flex justify-between items-center text-sm font-bold text-white print:text-black pt-2 border-t border-slate-800 print:border-black">
              <span>TOTAL:</span>
              <span className="font-mono text-base text-emerald-400 print:text-black">
                {formatMinorUnits(receipt.total, receipt.currency)}
              </span>
            </div>

            {/* Tender & Change Integrity Breakdown (Phase 5D-14) */}
            <div className="pt-2 border-t border-slate-800/80 print:border-black space-y-1 text-xs">
              <div className="flex justify-between text-slate-400 print:text-black">
                <span>Amount Tendered ({receipt.paymentMethod}):</span>
                <span className="font-mono text-slate-200 print:text-black">
                  {formatMinorUnits(receipt.amountTendered ?? receipt.total, receipt.currency)}
                </span>
              </div>
              {receipt.paymentMethod === 'CASH' && (
                <div className="flex justify-between text-slate-300 print:text-black font-semibold">
                  <span>Change Given:</span>
                  <span className="font-mono text-emerald-400 print:text-black">
                    {formatMinorUnits(receipt.changeDue ?? 0, receipt.currency)}
                  </span>
                </div>
              )}
              {receipt.paymentStatus && receipt.paymentStatus !== 'SETTLED' && (
                <div className="flex justify-between text-amber-400 print:text-black text-[11px]">
                  <span>Payment Status:</span>
                  <span className="font-semibold">{receipt.paymentStatus}</span>
                </div>
              )}
            </div>

            {/* Return & Refund Context if present */}
            {receipt.totalRefunded && receipt.totalRefunded > 0 && (
              <div className="pt-2 border-t border-slate-800/80 print:border-black space-y-1 text-xs">
                <div className="flex justify-between text-amber-400 print:text-black">
                  <span>Refunded Amount:</span>
                  <span className="font-mono font-semibold">
                    -{formatMinorUnits(receipt.totalRefunded, receipt.currency)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-200 print:text-black font-bold">
                  <span>Net Settled Total:</span>
                  <span className="font-mono text-emerald-400 print:text-black">
                    {formatMinorUnits(receipt.netTotal ?? receipt.total, receipt.currency)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Offline Pending Advisory Notice */}
          {isPending && (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 print:border-black print:text-black flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 print:hidden" />
              <span>
                <strong>Provisional Offline Receipt:</strong> This sale is stored in durable local storage and will be confirmed by the server when online.
              </span>
            </div>
          )}

          {/* Receipt Footer */}
          <div className="text-center pt-3 border-t border-dashed border-slate-800 print:border-black space-y-1">
            <p className="text-[11px] text-slate-400 print:text-black">
              Thank you for your patronage!
            </p>
            <p className="text-[10px] text-slate-500 print:text-black font-mono">
              Sale ID: {receipt.saleId.slice(0, 18)}...
            </p>
          </div>
        </div>

        {/* Modal Action Controls (Hidden in Print) */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between gap-3 no-print">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs flex items-center justify-center gap-2 border border-slate-700/80 transition-colors"
          >
            <Printer className="w-4 h-4 text-slate-300" />
            <span>Print Receipt</span>
          </button>

          {onNewSale && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onNewSale();
              }}
              className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              <span>New Sale</span>
            </button>
          )}

          {!onNewSale && (
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
