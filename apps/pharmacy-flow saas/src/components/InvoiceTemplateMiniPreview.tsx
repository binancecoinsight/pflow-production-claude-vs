import React from 'react';
import { CheckCircle, Sparkles } from 'lucide-react';
import { InvoiceTemplate } from '../constants/invoiceTemplates';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface MiniPreviewProps {
  template: InvoiceTemplate;
  isSelected?: boolean;
  onClick?: () => void;
  currencySymbol?: string;
  storeName?: string;
}

export default function InvoiceTemplateMiniPreview({
  template,
  isSelected = false,
  onClick,
  currencySymbol = '₦',
  storeName = 'PHARMA-ABC'
}: MiniPreviewProps) {
  const isDark = template.id === 'premium';
  const isMono = template.fontFamily === 'font-mono' || template.id === 'tech';
  const isSerif = template.fontFamily === 'font-serif' || template.id === 'elegant';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex flex-col w-56 shrink-0 text-left transition-all duration-300 rounded-2xl p-2",
        "border-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent",
        isSelected
          ? "border-brand-accent bg-brand-surface shadow-xl shadow-brand-accent/15 ring-2 ring-brand-accent/20 scale-[1.02]"
          : "border-brand-border/60 bg-brand-surface/70 hover:border-brand-accent/50 hover:bg-brand-surface hover:shadow-md"
      )}
    >
      {/* Selected Badge */}
      {isSelected && (
        <div className="absolute -top-2 -right-2 z-30 bg-brand-accent text-white rounded-full p-1 shadow-lg ring-2 ring-white dark:ring-slate-900 animate-in zoom-in-50 duration-200">
          <CheckCircle size={14} className="stroke-[3]" />
        </div>
      )}

      {/* Miniature Invoice Paper Container (A4 Ratio ~ 1 : 1.35) */}
      <div 
        className={cn(
          "w-full h-64 rounded-xl overflow-hidden relative shadow-inner transition-all flex flex-col justify-between border",
          isDark 
            ? "bg-slate-950 text-slate-100 border-slate-800" 
            : "bg-white text-slate-900 border-slate-200/90",
          isMono ? "font-mono" : isSerif ? "font-serif" : "font-sans"
        )}
      >
        {/* Template-Specific Background Textures / Watermarks */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30 z-0">
          {template.id === 'tech' && (
            <div 
              className="absolute inset-0 opacity-40" 
              style={{ 
                backgroundImage: 'radial-gradient(#10b981 1px, transparent 1px)', 
                backgroundSize: '8px 8px' 
              }} 
            />
          )}
          {template.id === 'creative' && (
            <div className="absolute -top-10 -right-10 w-24 h-24 rounded-full blur-xl bg-violet-600/30" />
          )}
          {template.id === 'sunset' && (
            <div className="absolute inset-0 bg-gradient-to-b from-orange-500/10 via-rose-500/5 to-transparent" />
          )}
          {template.id === 'elegant' && (
            <div className="absolute inset-1.5 border border-amber-600/20 rounded-xs pointer-events-none" />
          )}
          {template.id === 'ocean' && (
            <div className="absolute top-0 right-0 w-32 h-16 bg-sky-600/10 rounded-full blur-md" />
          )}
          {template.id === 'forest' && (
            <div className="absolute bottom-0 right-0 w-24 h-24 bg-emerald-600/10 rounded-full blur-md" />
          )}
          {template.id === 'bold' && (
            <div className="absolute top-0 right-0 w-16 h-full bg-amber-400/10 -skew-x-12" />
          )}
          {template.id === 'premium' && (
            <div 
              className="absolute inset-0 opacity-20" 
              style={{ 
                backgroundImage: 'linear-gradient(45deg, #334155 25%, transparent 25%, transparent 50%, #334155 50%, #334155 75%, transparent 75%, transparent)',
                backgroundSize: '12px 12px' 
              }} 
            />
          )}
        </div>

        {/* Micro Header */}
        <div className="relative z-10">
          {/* Header Banner / Color Line */}
          {template.gradient ? (
            <div 
              className={cn(
                "px-3 py-2 text-white flex items-center justify-between shadow-sm",
                `bg-gradient-to-r ${template.gradient}`
              )}
            >
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded bg-white/20 flex items-center justify-center text-[8px] font-black">
                  {storeName.charAt(0)}
                </div>
                <span className="text-[9px] font-black tracking-wider uppercase truncate max-w-[80px]">
                  {storeName}
                </span>
              </div>
              <span className="text-[8px] font-black uppercase tracking-widest bg-white/20 px-1.5 py-0.5 rounded">
                INVOICE
              </span>
            </div>
          ) : template.id === 'bold' ? (
            <div className="bg-black text-white px-3 py-2 flex items-center justify-between border-b-2 border-amber-400">
              <span className="text-[9px] font-black tracking-tight text-amber-400 truncate max-w-[85px]">
                {storeName}
              </span>
              <span className="text-[8px] font-black uppercase tracking-widest text-white">
                INVOICE
              </span>
            </div>
          ) : template.id === 'tech' ? (
            <div className="bg-emerald-950/80 text-emerald-400 px-3 py-1.5 border-b border-dashed border-emerald-500/40 flex items-center justify-between text-[8px]">
              <span className="font-bold truncate max-w-[80px]">[{storeName}]</span>
              <span className="font-bold tracking-widest">SYS.INV#01</span>
            </div>
          ) : template.id === 'elegant' ? (
            <div className="px-3 pt-2.5 pb-1 text-center border-b border-amber-600/30">
              <span className="text-[8px] font-serif font-black tracking-[0.25em] text-amber-700 dark:text-amber-400 uppercase">
                Official Invoice
              </span>
              <div className="text-[7px] text-slate-500 tracking-wider uppercase mt-0.5 font-sans">
                {storeName}
              </div>
            </div>
          ) : (
            <div 
              className="px-3 py-2 flex items-center justify-between border-b"
              style={{ 
                borderBottomColor: template.primaryColor + '40',
                backgroundColor: isDark ? '#111827' : template.primaryColor + '08' 
              }}
            >
              <div className="flex items-center gap-1.5">
                <div 
                  className="w-4 h-4 rounded flex items-center justify-center text-white text-[8px] font-black"
                  style={{ backgroundColor: template.primaryColor }}
                >
                  {storeName.charAt(0)}
                </div>
                <span 
                  className="text-[9px] font-black tracking-tight truncate max-w-[80px]"
                  style={{ color: isDark ? '#f8fafc' : template.primaryColor }}
                >
                  {storeName}
                </span>
              </div>
              <span 
                className="text-[8px] font-black uppercase tracking-wider"
                style={{ color: isDark ? '#cbd5e1' : template.primaryColor }}
              >
                INVOICE
              </span>
            </div>
          )}

          {/* Micro Metadata Row */}
          <div className="px-3 py-1.5 flex items-center justify-between text-[7px] border-b border-slate-100 dark:border-slate-800">
            <div>
              <span className="text-slate-400 dark:text-slate-500">NO: </span>
              <span className="font-bold">INV-0824</span>
            </div>
            <div>
              <span className="text-slate-400 dark:text-slate-500">DATE: </span>
              <span className="font-medium">Today</span>
            </div>
          </div>

          {/* Micro Customer "Bill To" */}
          <div className="px-3 py-1 bg-slate-50/70 dark:bg-slate-900/60 flex items-center justify-between text-[7px] border-b border-slate-100 dark:border-slate-800">
            <span className="text-slate-400 dark:text-slate-500 uppercase tracking-wider">Bill To:</span>
            <span className="font-bold truncate max-w-[90px] text-slate-700 dark:text-slate-300">City Healthcare Clinic</span>
          </div>
        </div>

        {/* Micro Items Table */}
        <div className="px-2.5 py-1.5 flex-1 relative z-10 flex flex-col justify-start">
          {/* Table Header */}
          <div 
            className="flex items-center justify-between text-[6.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-sm mb-1"
            style={{
              backgroundColor: template.gradient 
                ? template.primaryColor + '18' 
                : isDark ? '#1e293b' : template.primaryColor + '12',
              color: isDark ? '#e2e8f0' : template.primaryColor
            }}
          >
            <span className="flex-1">Item</span>
            <span className="w-5 text-center">Qty</span>
            <span className="w-10 text-right">Total</span>
          </div>

          {/* Sample Rows */}
          <div className="space-y-1 text-[7px]">
            <div className="flex items-center justify-between px-1 text-slate-600 dark:text-slate-300">
              <span className="flex-1 truncate pr-1">Amoxil 500mg</span>
              <span className="w-5 text-center text-slate-400 font-mono text-[6.5px]">2</span>
              <span className="w-10 text-right font-medium">{currencySymbol}4,500</span>
            </div>
            <div className="flex items-center justify-between px-1 text-slate-600 dark:text-slate-300">
              <span className="flex-1 truncate pr-1">Panadol Extra</span>
              <span className="w-5 text-center text-slate-400 font-mono text-[6.5px]">10</span>
              <span className="w-10 text-right font-medium">{currencySymbol}2,000</span>
            </div>
            <div className="flex items-center justify-between px-1 text-slate-600 dark:text-slate-300">
              <span className="flex-1 truncate pr-1">Vitamin C Zinc</span>
              <span className="w-5 text-center text-slate-400 font-mono text-[6.5px]">1</span>
              <span className="w-10 text-right font-medium">{currencySymbol}3,500</span>
            </div>
          </div>
        </div>

        {/* Micro Footer & Total Box */}
        <div className="relative z-10 px-3 pb-2 pt-1 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between mb-1 text-[6.5px] text-slate-400 dark:text-slate-500">
            <span>Subtotal</span>
            <span className="font-mono">{currencySymbol}10,000</span>
          </div>

          <div 
            className="flex items-center justify-between px-2 py-1 rounded-md text-white shadow-xs"
            style={{ 
              background: template.gradient 
                ? `linear-gradient(to right, ${template.primaryColor}, ${template.secondaryColor || template.primaryColor})` 
                : template.primaryColor 
            }}
          >
            <span className="text-[7.5px] font-black uppercase tracking-wider">Amount Due</span>
            <span className="text-[9px] font-black tracking-tight">{currencySymbol}10,000</span>
          </div>

          {/* Micro Signature Line */}
          <div className="mt-1 flex items-center justify-between text-[6px] text-slate-400 dark:text-slate-500 pt-0.5">
            <span className="truncate max-w-[80px]">Status: PAID</span>
            <span className="border-t border-slate-300 dark:border-slate-700 w-12 text-center pt-0.5">Authorized</span>
          </div>
        </div>
      </div>

      {/* Template Details Underneath */}
      <div className="mt-2.5 px-1">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <span className={cn(
            "font-black text-xs truncate",
            isSelected ? "text-brand-accent" : "text-brand-text"
          )}>
            {template.name}
          </span>
          <span 
            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs ring-1 ring-black/10" 
            style={{ backgroundColor: template.primaryColor }}
            title={template.primaryColor}
          />
        </div>
        <p className="text-[10px] text-brand-muted line-clamp-1 leading-normal">
          {template.description}
        </p>
      </div>
    </button>
  );
}
