'use client';

import React, { useState, useMemo } from 'react';
import { 
  X, Send, Bell, Smartphone, MessageSquare, Mail, Calendar, Clock, 
  CheckCircle2, Building2, Search, Check, Sparkles, AlertTriangle, Trash2 
} from 'lucide-react';
import { Pharmacy, ScheduledAlert } from '@/lib/mock-data';
import { format } from 'date-fns';

interface BroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  pharmacies: Pharmacy[];
  initialTargetMode?: 'all' | 'selected' | 'scheduled';
  scheduledAlerts: ScheduledAlert[];
  onDispatchBroadcast: (data: {
    title: string;
    message: string;
    channel: 'SMS' | 'In-App' | 'Email';
    targetType: 'all' | 'selected';
    selectedStores: Pharmacy[];
    isScheduled: boolean;
    scheduledFor?: string;
  }) => void;
  onCancelScheduledAlert: (alertId: string) => void;
}

const TEMPLATES = [
  {
    title: 'System Maintenance',
    subject: 'PharmacyFlow POS Cloud Maintenance Notification',
    message: 'Notice to all pharmacy branches: Scheduled infrastructure upgrade tonight at 02:00 AM. Terminal transactions will resume offline and sync automatically.',
  },
  {
    title: 'Regulatory NAFDAC Notice',
    subject: 'Mandatory NAFDAC Batch Log Regulatory Check',
    message: 'Superintendent Pharmacists: Please ensure all newly received antibiotics and narcotic consignments are fully registered on the digital inventory ledger before Friday.',
  },
  {
    title: 'Subscription Reminder',
    subject: 'Notice: Monthly Software License Renewal Window',
    message: 'Reminder: Your PharmacyFlow annual support plan is entering its renewal cycle. Please review billing invoices under Subscriptions to avoid terminal interruption.',
  },
  {
    title: 'Public Holiday Schedule',
    subject: 'Public Holiday Support Desk & Emergency Contacts',
    message: 'Our technical support lines remain active 24/7 during the national holiday. For urgent POS or dispensing issues, reach dispatch at +234 800 000 0000.',
  },
];

export default function BroadcastModal({
  isOpen,
  onClose,
  pharmacies,
  initialTargetMode = 'all',
  scheduledAlerts,
  onDispatchBroadcast,
  onCancelScheduledAlert,
}: BroadcastModalProps) {
  const [activeTab, setActiveTab] = useState<'compose' | 'scheduled'>(
    initialTargetMode === 'scheduled' ? 'scheduled' : 'compose'
  );
  
  // Compose options
  const [targetType, setTargetType] = useState<'all' | 'selected'>(
    initialTargetMode === 'selected' ? 'selected' : 'all'
  );
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [searchStore, setSearchStore] = useState('');
  
  const [channel, setChannel] = useState<'SMS' | 'In-App' | 'Email'>('SMS');
  const [subject, setSubject] = useState(TEMPLATES[0].subject);
  const [message, setMessage] = useState(TEMPLATES[0].message);
  
  // Scheduling state
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(() => {
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
    return format(tomorrow, 'yyyy-MM-dd');
  });
  const [scheduleTime, setScheduleTime] = useState('09:00');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Filtered pharmacies for multi-select
  const filteredPharmacies = useMemo(() => {
    if (!searchStore.trim()) return pharmacies.slice(0, 50);
    const q = searchStore.toLowerCase();
    return pharmacies.filter(p => 
      p.business_name.toLowerCase().includes(q) ||
      p.owner_name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      (p.state && p.state.toLowerCase().includes(q))
    ).slice(0, 50);
  }, [pharmacies, searchStore]);

  const toggleSelectStore = (id: string) => {
    setSelectedStoreIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllVisible = () => {
    const ids = filteredPharmacies.map(p => p.id);
    setSelectedStoreIds(prev => Array.from(new Set([...prev, ...ids])));
  };

  const handleClearSelection = () => {
    setSelectedStoreIds([]);
  };

  const handleApplyTemplate = (tpl: typeof TEMPLATES[0]) => {
    setSubject(tpl.subject);
    setMessage(tpl.message);
  };

  const handleSendOrSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !subject.trim()) return;

    if (targetType === 'selected' && selectedStoreIds.length === 0) {
      alert('Please select at least one pharmacy store to receive this broadcast.');
      return;
    }

    setIsSubmitting(true);

    const selectedPharmacies = pharmacies.filter(p => selectedStoreIds.includes(p.id));
    const scheduledDateTime = isScheduled 
      ? new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString()
      : undefined;

    setTimeout(() => {
      onDispatchBroadcast({
        title: subject,
        message,
        channel,
        targetType,
        selectedStores: selectedPharmacies,
        isScheduled,
        scheduledFor: scheduledDateTime,
      });

      setIsSubmitting(false);
      setSuccessNotice(
        isScheduled
          ? `Broadcast scheduled successfully for ${format(new Date(`${scheduleDate}T${scheduleTime}:00`), 'MMM dd, yyyy @ hh:mm a')}!`
          : `Broadcast dispatched immediately to ${targetType === 'all' ? `all ${pharmacies.length} pharmacies` : `${selectedPharmacies.length} selected stores`}!`
      );

      setTimeout(() => {
        setSuccessNotice(null);
        onClose();
      }, 1400);
    }, 400);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[220] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div 
        className="bg-card border border-border w-full max-w-2xl rounded-xl shadow-2xl flex flex-col my-auto max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-card/90">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-text-primary">
                Store Push Broadcast Manager
              </h3>
              <p className="text-xs text-text-secondary">
                Dispatch or schedule urgent alerts, regulatory announcements, and POS banners.
              </p>
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

        {/* Tab Navigation */}
        <div className="flex border-b border-border bg-bg/50 px-5 pt-2 gap-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('compose')}
            className={`pb-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'compose'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Compose Broadcast</span>
          </button>

          <button
            onClick={() => setActiveTab('scheduled')}
            className={`pb-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'scheduled'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Scheduled Alerts ({scheduledAlerts.filter(a => a.status === 'pending').length})</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {successNotice && (
            <div className="bg-success/15 border border-success/30 rounded-lg p-3.5 flex items-center gap-3 text-success">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <p className="text-xs font-semibold">{successNotice}</p>
            </div>
          )}

          {activeTab === 'compose' ? (
            <form onSubmit={handleSendOrSchedule} className="space-y-4">
              {/* Target Scope */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                  Target Audience
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetType('all')}
                    className={`p-3 rounded-lg border text-left text-xs transition-all ${
                      targetType === 'all'
                        ? 'border-accent bg-accent/10 ring-1 ring-accent'
                        : 'border-border bg-bg/40 text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-text-primary">Send to All Stores</span>
                      {targetType === 'all' && <Check className="w-3.5 h-3.5 text-accent" />}
                    </div>
                    <p className="text-[11px] text-text-secondary">
                      Entire network ({pharmacies.length} active &amp; registered pharmacies)
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetType('selected')}
                    className={`p-3 rounded-lg border text-left text-xs transition-all ${
                      targetType === 'selected'
                        ? 'border-accent bg-accent/10 ring-1 ring-accent'
                        : 'border-border bg-bg/40 text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-text-primary">Select Specific Stores</span>
                      {targetType === 'selected' && <Check className="w-3.5 h-3.5 text-accent" />}
                    </div>
                    <p className="text-[11px] text-text-secondary">
                      {selectedStoreIds.length > 0 
                        ? `${selectedStoreIds.length} stores currently selected` 
                        : 'Filter & handpick individual stores'}
                    </p>
                  </button>
                </div>
              </div>

              {/* Multi-store selector if targetType is 'selected' */}
              {targetType === 'selected' && (
                <div className="p-3 bg-bg/50 border border-border rounded-lg space-y-2 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary" />
                      <input
                        type="text"
                        placeholder="Search store name, location, or owner..."
                        value={searchStore}
                        onChange={(e) => setSearchStore(e.target.value)}
                        className="w-full bg-card border border-border rounded pl-8 pr-3 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                    <div className="flex gap-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={handleSelectAllVisible}
                        className="px-2 py-1 bg-card border border-border rounded text-text-secondary hover:text-accent"
                      >
                        Select Visible
                      </button>
                      {selectedStoreIds.length > 0 && (
                        <button
                          type="button"
                          onClick={handleClearSelection}
                          className="px-2 py-1 bg-card border border-border rounded text-red-500 hover:underline"
                        >
                          Clear ({selectedStoreIds.length})
                        </button>
                      )}
                    </div>
                  </div>

                  {/* List of selectable pharmacies */}
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {filteredPharmacies.map((p) => {
                      const isChecked = selectedStoreIds.includes(p.id);
                      return (
                        <div
                          key={p.id}
                          onClick={() => toggleSelectStore(p.id)}
                          className={`p-2 rounded border flex items-center justify-between text-xs cursor-pointer transition-colors ${
                            isChecked
                              ? 'bg-accent/10 border-accent/60 text-text-primary'
                              : 'bg-card border-border/70 text-text-secondary hover:bg-white/5'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate pr-2">
                            <input 
                              type="checkbox" 
                              checked={isChecked} 
                              onChange={() => {}} 
                              className="accent-accent pointer-events-none" 
                            />
                            <span className="font-semibold text-text-primary truncate">{p.business_name}</span>
                            <span className="text-[10px] text-text-secondary">({p.state})</span>
                          </div>
                          <span className="text-[10px] font-mono text-text-secondary shrink-0">{p.id}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Delivery Channels */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                  Delivery Channel
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'SMS' as const, label: 'SMS Notice', icon: Smartphone, note: 'Direct to Owner Mobile' },
                    { id: 'In-App' as const, label: 'POS Terminal Banner', icon: MessageSquare, note: 'Appears at Checkout' },
                    { id: 'Email' as const, label: 'Email Dispatch', icon: Mail, note: 'Official Store Email' },
                  ].map((c) => {
                    const Icon = c.icon;
                    const isSelected = channel === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setChannel(c.id)}
                        className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                          isSelected
                            ? 'border-accent bg-accent/15 text-accent shadow-sm'
                            : 'border-border bg-bg/40 text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Icon className="w-3.5 h-3.5" />
                          <span className="font-bold">{c.label}</span>
                        </div>
                        <span className="text-[10px] text-text-secondary block">{c.note}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quick Template Fillers */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
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
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  Broadcast Title / Subject
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              {/* Message Body */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  Message Content
                </label>
                <textarea
                  required
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full bg-bg border border-border rounded-lg p-3 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              {/* Scheduling Section */}
              <div className="p-3 bg-bg/50 border border-border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-accent" />
                    <div>
                      <p className="text-xs font-bold text-text-primary">Schedule for Later</p>
                      <p className="text-[11px] text-text-secondary">Queue this announcement to trigger at a future date &amp; time</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    id="schedule-toggle"
                    checked={isScheduled}
                    onChange={(e) => setIsScheduled(e.target.checked)}
                    className="w-4 h-4 accent-accent cursor-pointer"
                  />
                </div>

                {isScheduled && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border animate-in fade-in duration-150">
                    <div>
                      <label className="block text-[11px] font-semibold text-text-secondary mb-1">Dispatch Date</label>
                      <input
                        type="date"
                        required={isScheduled}
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        className="w-full bg-card border border-border rounded px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-text-secondary mb-1">Time (WAT / Nigeria)</label>
                      <input
                        type="time"
                        required={isScheduled}
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                        className="w-full bg-card border border-border rounded px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Actions Footer */}
              <div className="pt-2 flex items-center justify-between border-t border-border">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-2 text-xs text-text-secondary hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-accent text-white hover:bg-accent/90 px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>Processing...</span>
                  ) : isScheduled ? (
                    <>
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Queue Scheduled Broadcast</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Send Broadcast Now</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Scheduled Alerts Tab */
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-text-secondary">
                  Upcoming announcements queued for automated dispatch:
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('compose')}
                  className="text-xs text-accent font-semibold hover:underline"
                >
                  + New Broadcast
                </button>
              </div>

              {scheduledAlerts.map((alert) => (
                <div 
                  key={alert.id}
                  className="p-3.5 rounded-lg border border-border bg-bg/50 space-y-2 hover:border-accent/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-text-primary">{alert.title}</span>
                        <span className={`text-[10px] px-2 py-0.2 rounded font-semibold ${
                          alert.status === 'pending'
                            ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                            : 'bg-text-secondary/15 text-text-secondary'
                        }`}>
                          {alert.status.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary mt-1">{alert.message}</p>
                    </div>

                    {alert.status === 'pending' && (
                      <button
                        onClick={() => onCancelScheduledAlert(alert.id)}
                        className="text-xs text-red-500 hover:text-red-600 p-1.5 rounded hover:bg-red-500/10 transition-colors shrink-0"
                        title="Cancel this scheduled alert"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-text-secondary border-t border-border/50">
                    <span className="flex items-center gap-1 font-mono text-text-primary">
                      <Clock className="w-3 h-3 text-accent" />
                      Scheduled: {format(new Date(alert.scheduled_for), 'MMM dd, yyyy @ hh:mm a')}
                    </span>
                    <span>• Channel: <strong className="text-text-primary">{alert.channel}</strong></span>
                    <span>• Targets: <strong className="text-text-primary">{alert.target_type === 'all' ? 'All Stores (500+)' : `${alert.target_count} Stores`}</strong></span>
                    <span className="text-[10px] text-text-secondary">By: {alert.created_by}</span>
                  </div>
                </div>
              ))}

              {scheduledAlerts.length === 0 && (
                <div className="text-center py-8 border border-dashed border-border rounded-lg text-text-secondary text-xs">
                  No upcoming scheduled broadcasts in queue.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
