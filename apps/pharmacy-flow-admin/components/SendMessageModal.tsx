'use client';

import React, { useState } from 'react';
import { X, Send, MessageSquare, Mail, Smartphone, CheckCircle2, Building2, Sparkles } from 'lucide-react';
import { Pharmacy } from '@/lib/mock-data';

interface SendMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  pharmacy: Pharmacy | null;
  onSendMessage: (data: {
    pharmacy: Pharmacy;
    channel: 'SMS' | 'In-App' | 'Email';
    subject: string;
    message: string;
  }) => void;
}

const TEMPLATES = [
  {
    title: 'Expiry Notice',
    subject: 'Urgent: Your PharmacyFlow Subscription is Expiring Soon',
    message: 'Dear Pharmacist, your PharmacyFlow subscription is due for renewal within the next few days. Please renew now to maintain uninterrupted POS dispensing and NAFDAC audit sync.',
  },
  {
    title: 'Overdue Alert',
    subject: 'Action Required: Pharmacy POS Access Suspended Notice',
    message: 'Your pharmacy cloud subscription is currently past due. Please make payment via NIBSS or debit card to reactivate your store terminals immediately.',
  },
  {
    title: 'NAFDAC Compliance',
    subject: 'Regulatory Update: NAFDAC Controlled Drug Batch Log',
    message: 'Please ensure your branch registers all scheduled narcotics and controlled drugs on the centralized regulatory tracker before end of week.',
  },
];

export default function SendMessageModal({
  isOpen,
  onClose,
  pharmacy,
  onSendMessage,
}: SendMessageModalProps) {
  const [channel, setChannel] = useState<'SMS' | 'In-App' | 'Email'>('SMS');
  const [subject, setSubject] = useState(TEMPLATES[0].subject);
  const [message, setMessage] = useState(TEMPLATES[0].message);
  const [isSending, setIsSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  if (!isOpen || !pharmacy) return null;

  const handleApplyTemplate = (tpl: typeof TEMPLATES[0]) => {
    setSubject(tpl.subject);
    setMessage(tpl.message);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setIsSending(true);
    setTimeout(() => {
      onSendMessage({
        pharmacy,
        channel,
        subject,
        message,
      });
      setIsSending(false);
      setSentSuccess(true);

      setTimeout(() => {
        setSentSuccess(false);
        onClose();
      }, 1200);
    }, 400);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[210] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div 
        className="bg-card border border-border w-full max-w-lg rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-card/90">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-text-primary">Send Message to Pharmacy</h3>
              <p className="text-xs text-text-secondary truncate max-w-xs">{pharmacy.business_name}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-text-secondary hover:text-text-primary rounded-lg hover:bg-white/10"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {sentSuccess ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-success/20 text-success flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-text-primary">Message Dispatched!</h4>
            <p className="text-xs text-text-secondary">
              Successfully sent via <span className="font-semibold text-text-primary">{channel}</span> to {pharmacy.owner_name} ({pharmacy.phone || pharmacy.email || 'Registered Contact'}).
            </p>
          </div>
        ) : (
          <form onSubmit={handleSend} className="p-5 space-y-4">
            {/* Pharmacy Recipient Card */}
            <div className="p-3 bg-bg/50 border border-border rounded-lg flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <Building2 className="w-4 h-4 text-accent" />
                <div>
                  <p className="font-semibold text-text-primary">{pharmacy.business_name}</p>
                  <p className="text-[11px] text-text-secondary">
                    {pharmacy.owner_name} • {pharmacy.phone || '+234 803 000 0000'}
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-mono uppercase bg-card px-2 py-0.5 rounded border border-border">
                {pharmacy.id}
              </span>
            </div>

            {/* Channel Selection */}
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">Dispatch Channel</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'SMS' as const, label: 'SMS Notice', icon: Smartphone },
                  { id: 'In-App' as const, label: 'In-App Banner', icon: MessageSquare },
                  { id: 'Email' as const, label: 'Email Dispatch', icon: Mail },
                ].map((c) => {
                  const Icon = c.icon;
                  const isSelected = channel === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setChannel(c.id)}
                      className={`p-2 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                        isSelected
                          ? 'border-accent bg-accent/15 text-accent shadow-sm'
                          : 'border-border bg-bg/40 text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Templates */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-text-secondary">Quick Templates</label>
                <span className="text-[10px] text-accent flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Auto-fill
                </span>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.title}
                    type="button"
                    onClick={() => handleApplyTemplate(tpl)}
                    className="px-2.5 py-1 rounded bg-bg border border-border text-[11px] text-text-secondary hover:text-accent hover:border-accent/40 transition-colors"
                  >
                    {tpl.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">Subject / Header</label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            {/* Body */}
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">Message Body</label>
              <textarea
                required
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg p-3 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            {/* Footer */}
            <div className="pt-2 flex items-center justify-between border-t border-border">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSending}
                className="bg-accent text-white hover:bg-accent/90 px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
              >
                {isSending ? (
                  <span>Sending...</span>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Notice</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
