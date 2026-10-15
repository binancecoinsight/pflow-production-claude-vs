import React from 'react';
import { X, Sparkles, ArrowRight, Check } from 'lucide-react';
import { INVOICE_TEMPLATES, InvoiceTemplate } from '../constants/invoiceTemplates';
import InvoiceTemplateMiniPreview from './InvoiceTemplateMiniPreview';
import { useSettings } from '../context/SettingsContext';
import { motion } from 'motion/react';

interface InvoiceTemplateGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (templateId: string) => void;
  currentTemplateId?: string;
}

export default function InvoiceTemplateGalleryModal({
  isOpen,
  onClose,
  onSelectTemplate,
  currentTemplateId = 'classic'
}: InvoiceTemplateGalleryModalProps) {
  const { settings } = useSettings();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 lg:p-8 pt-12 lg:pt-16 overflow-y-auto">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/75 backdrop-blur-md z-0"
      />

      {/* Modal Dialog */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        className="relative z-10 w-full max-w-6xl bg-brand-surface rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-brand-border"
      >
        {/* Top Header */}
        <div className="p-6 sm:p-8 border-b border-brand-border bg-brand-surface/90 backdrop-blur-md flex items-center justify-between gap-4 sticky top-0 z-20">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-brand-accent/10 text-brand-accent">
                <Sparkles size={18} />
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-brand-text tracking-tight">
                Select Invoice Template
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-brand-muted font-medium">
              Click any template to open the dedicated editor with real-time live preview, paper size choices, and export options.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 hover:bg-brand-bg rounded-2xl transition-colors text-brand-muted hover:text-brand-text shrink-0"
            title="Close"
          >
            <X size={22} />
          </button>
        </div>

        {/* Gallery Grid */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 bg-brand-bg/40">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 sm:gap-6 justify-items-center">
            {INVOICE_TEMPLATES.map((template) => {
              const isSelected = currentTemplateId === template.id;

              return (
                <div 
                  key={template.id} 
                  className="flex flex-col items-center w-full max-w-[230px]"
                >
                  <InvoiceTemplateMiniPreview
                    template={template}
                    isSelected={isSelected}
                    onClick={() => onSelectTemplate(template.id)}
                    currencySymbol={settings?.currencySymbol || '₦'}
                    storeName={settings?.storeName || 'PHARMA-ABC'}
                  />

                  {/* Quick Select Button */}
                  <button
                    type="button"
                    onClick={() => onSelectTemplate(template.id)}
                    className="w-full mt-2 py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 border border-brand-border/70 hover:border-brand-accent hover:bg-brand-accent hover:text-white group"
                  >
                    <span>{isSelected ? 'Currently Selected' : 'Use Template'}</span>
                    <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Helper Bar */}
        <div className="p-4 sm:p-5 border-t border-brand-border bg-brand-surface flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-brand-muted">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>All 10 templates support A4, US Letter, A5, and 80mm/58mm Thermal receipts</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 hover:bg-brand-bg rounded-xl font-bold text-brand-text transition-colors"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}
