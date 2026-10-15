'use client';

import React, { useState, useMemo } from 'react';
import { 
  LifeBuoy, Search, Filter, MessageSquare, Send, CheckCircle2, 
  Clock, AlertTriangle, User, Store, Phone, Mail, ChevronRight, 
  AlertCircle, Sparkles, Tag, ShieldCheck, RefreshCw, X, Plus, 
  CornerDownRight, Lock, Eye, Check, ExternalLink, Calendar,
  ArrowUpDown, Flame, HelpCircle, Layers, FileText
} from 'lucide-react';
import { 
  SupportTicket, 
  TicketMessage, 
  TicketStatus, 
  TicketPriority, 
  TicketCategory,
  Pharmacy
} from '@/lib/mock-data';
import { format } from 'date-fns';

interface SupportTicketsViewProps {
  tickets: SupportTicket[];
  pharmacies: Pharmacy[];
  onReplyTicket: (ticketId: string, messageText: string, options?: { isInternal?: boolean; newStatus?: TicketStatus }) => void;
  onUpdateTicketStatus: (ticketId: string, status: TicketStatus) => void;
  onUpdateTicketPriority: (ticketId: string, priority: TicketPriority) => void;
  onAssignTicket?: (ticketId: string, agentName: string) => void;
  onCreateTicket?: (newTicket: Omit<SupportTicket, 'id' | 'created_at' | 'updated_at' | 'messages'> & { initialMessage: string }) => void;
}

const CANNED_RESPONSES = [
  {
    title: 'Hardware Printer Reset',
    category: 'Technical & POS Hardware',
    text: 'Hello, please follow these steps to reset the Bluetooth printer pairing:\n1. Power off the thermal printer for 10 seconds.\n2. On the POS tablet, open Settings > Bluetooth, tap "Forget Device" for the printer.\n3. Power on printer while holding the Paper Feed button until test slip prints.\n4. Re-pair using PIN 0000 or 1234.\nOur technical team is on standby if you require remote desktop assistance.',
  },
  {
    title: 'Referral Payout Dispatched',
    category: 'Referral & Rewards',
    text: 'Greetings. We have verified your referral record and re-queued the cash bounty via NIBSS Instant Settlement. The funds will reflect in your designated bank/fintech wallet within 15-30 minutes. Thank you for championing PharmacyFlow.',
  },
  {
    title: 'NAFDAC Server Status',
    category: 'NAFDAC & Compliance',
    text: 'Hello Superintendent. The Federal NAFDAC Central Drug Registry is currently undergoing scheduled weekend database indexing. We have enabled local offline cached verification so your dispensing workflow is not interrupted.',
  },
  {
    title: 'Payment Reconciled & Renewed',
    category: 'Billing & Subscription',
    text: 'Hello Doctor. We have confirmed your Paystack transaction settlement. Your subscription license has been refreshed on the central server and your POS terminal status is now Active. The expiration warning banner has cleared.',
  },
  {
    title: 'Investigating with Engineers',
    category: 'General',
    text: 'Thank you for reporting this issue. Our Lagos engineering team has logged this investigation and is actively reviewing the server logs. We will provide an update within the next 2 hours.',
  },
];

const AGENTS = [
  'Aisha Bello (Technical Lead)',
  'Babatunde Fashola (Billing Specialist)',
  'Emeka Nwosu (Field Operations)',
  'Zainab Aliyu (Pharmacist Support)',
  'Unassigned',
];

export default function SupportTicketsView({
  tickets,
  pharmacies,
  onReplyTicket,
  onUpdateTicketStatus,
  onUpdateTicketPriority,
  onAssignTicket,
  onCreateTicket,
}: SupportTicketsViewProps) {
  const [selectedTicketId, setSelectedTicketId] = useState<string>(() => tickets[0]?.id || '');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TicketStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | TicketPriority>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Reply Composer State
  const [replyText, setReplyText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [markStatusOnSend, setMarkStatusOnSend] = useState<TicketStatus | ''>('');

  // New Ticket Modal State
  const [newTicketModalOpen, setNewTicketModalOpen] = useState(false);
  const [newPharmacyId, setNewPharmacyId] = useState(pharmacies[0]?.id || '');
  const [newSubject, setNewSubject] = useState('');
  const [newCategory, setNewCategory] = useState<TicketCategory>('Technical & POS Hardware');
  const [newPriority, setNewPriority] = useState<TicketPriority>('medium');
  const [newChannel, setNewChannel] = useState<'Client Portal' | 'In-App POS' | 'WhatsApp' | 'Phone Call' | 'Email'>('Phone Call');
  const [newInitialMessage, setNewInitialMessage] = useState('');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Selected Ticket
  const activeTicket = useMemo(() => {
    return tickets.find(t => t.id === selectedTicketId) || tickets[0] || null;
  }, [tickets, selectedTicketId]);

  // Filtered Tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const inNum = t.ticket_number.toLowerCase().includes(q);
        const inStore = t.pharmacy_name.toLowerCase().includes(q);
        const inClient = t.client_name.toLowerCase().includes(q);
        const inSubj = t.subject.toLowerCase().includes(q);
        const inMsg = t.messages.some(m => m.message.toLowerCase().includes(q));
        if (!inNum && !inStore && !inClient && !inSubj && !inMsg) return false;
      }
      return true;
    }).sort((a, b) => b.updated_at - a.updated_at);
  }, [tickets, statusFilter, priorityFilter, categoryFilter, search]);

  // Statistics
  const openCount = useMemo(() => tickets.filter(t => t.status === 'open').length, [tickets]);
  const inProgressCount = useMemo(() => tickets.filter(t => t.status === 'in_progress').length, [tickets]);
  const resolvedCount = useMemo(() => tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length, [tickets]);
  const urgentCount = useMemo(() => tickets.filter(t => t.priority === 'urgent' && t.status !== 'closed' && t.status !== 'resolved').length, [tickets]);

  // Handle Send Reply
  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket || !replyText.trim()) return;

    onReplyTicket(activeTicket.id, replyText.trim(), {
      isInternal: isInternalNote,
      newStatus: markStatusOnSend || undefined,
    });

    setReplyText('');
    setIsInternalNote(false);
    setMarkStatusOnSend('');
  };

  // Handle Quick Canned Response click
  const handleApplyCanned = (text: string) => {
    setReplyText(prev => prev ? `${prev}\n\n${text}` : text);
  };

  // Copy helper
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Handle Create Ticket Submit
  const handleCreateTicketSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || !newInitialMessage.trim()) return;

    const pharm = pharmacies.find(p => p.id === newPharmacyId) || pharmacies[0];
    if (onCreateTicket && pharm) {
      onCreateTicket({
        ticket_number: `TICK-${Math.floor(1000 + Math.random() * 9000)}`,
        pharmacy_id: pharm.id,
        pharmacy_name: pharm.business_name,
        client_name: pharm.owner_name,
        client_email: pharm.email || 'client@pharmacyflow.ng',
        client_phone: pharm.phone || '+234 800 000 0000',
        state: pharm.state || 'Lagos',
        subject: newSubject.trim(),
        category: newCategory,
        priority: newPriority,
        status: 'open',
        channel: newChannel,
        assigned_to: 'Unassigned',
        initialMessage: newInitialMessage.trim(),
      });
    }

    setNewTicketModalOpen(false);
    setNewSubject('');
    setNewInitialMessage('');
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      
      {/* Top Header & Overview Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-xl bg-accent/15 text-accent border border-accent/30 flex items-center justify-center shadow-sm">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text-primary flex items-center gap-2">
                <span>Client Support Tickets &amp; Helpdesk</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold uppercase">
                  {openCount} Open Issues
                </span>
              </h1>
              <span className="text-[11px] text-text-secondary">
                View, triage, and reply directly to client-side support requests, POS hardware issues, and billing inquiries.
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {urgentCount > 0 && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 animate-pulse">
              <Flame className="w-3.5 h-3.5" />
              <span>{urgentCount} Urgent Tickets Need Reply</span>
            </div>
          )}

          <button
            onClick={() => setNewTicketModalOpen(true)}
            className="bg-accent hover:bg-accent/90 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>+ Log Client Ticket</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-text-secondary mb-1">
            <span>Open Tickets</span>
            <AlertCircle className="w-4 h-4 text-rose-400" />
          </div>
          <span className="font-mono text-xl font-bold text-rose-400 block">{openCount}</span>
          <span className="text-[10px] text-text-secondary">Awaiting support response</span>
        </div>

        <div className="bg-card border border-border rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-text-secondary mb-1">
            <span>In Progress</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <span className="font-mono text-xl font-bold text-amber-400 block">{inProgressCount}</span>
          <span className="text-[10px] text-text-secondary">Being investigated by team</span>
        </div>

        <div className="bg-card border border-border rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-text-secondary mb-1">
            <span>Resolved Tickets</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="font-mono text-xl font-bold text-emerald-400 block">{resolvedCount}</span>
          <span className="text-[10px] text-text-secondary">Successfully closed cases</span>
        </div>

        <div className="bg-card border border-border rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-text-secondary mb-1">
            <span>Avg Response Time</span>
            <Sparkles className="w-4 h-4 text-accent" />
          </div>
          <span className="font-mono text-xl font-bold text-accent block">28 mins</span>
          <span className="text-[10px] text-text-secondary">Super admin SLA guarantee</span>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-card border border-border rounded-xl p-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
          <input
            type="text"
            placeholder="Search tickets by #ID, pharmacy store, client name, subject, or message text..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-bg border border-border rounded-lg pl-9 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Pills */}
          <div className="bg-bg border border-border rounded-lg p-0.5 flex items-center gap-0.5 overflow-x-auto">
            {[
              { id: 'all', label: 'All', count: tickets.length },
              { id: 'open', label: 'Open', count: openCount },
              { id: 'in_progress', label: 'In Progress', count: inProgressCount },
              { id: 'resolved', label: 'Resolved', count: resolvedCount },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => setStatusFilter(s.id as any)}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-all ${
                  statusFilter === s.id
                    ? 'bg-card text-text-primary shadow-sm font-bold'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <span>{s.label}</span>
                <span className="text-[9px] opacity-75 font-mono">({s.count})</span>
              </button>
            ))}
          </div>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as any)}
            className="bg-bg border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent Priority</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-bg border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="all">All Categories</option>
            <option value="Technical & POS Hardware">Technical &amp; POS Hardware</option>
            <option value="Billing & Subscription">Billing &amp; Subscription</option>
            <option value="Referral & Rewards">Referral &amp; Rewards</option>
            <option value="NAFDAC & Compliance">NAFDAC &amp; Compliance</option>
            <option value="Account & Access">Account &amp; Access</option>
          </select>
        </div>
      </div>

      {/* MASTER-DETAIL SPLIT WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[640px]">
        
        {/* LEFT COLUMN: TICKETS LIST (lg:col-span-5) */}
        <div className="lg:col-span-5 space-y-2.5 max-h-[720px] overflow-y-auto pr-1">
          {filteredTickets.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-10 text-center space-y-3">
              <LifeBuoy className="w-10 h-10 text-text-secondary/40 mx-auto" />
              <p className="font-semibold text-sm text-text-primary">No tickets found</p>
              <p className="text-xs text-text-secondary max-w-xs mx-auto">
                No support requests match your active search or filter selection.
              </p>
            </div>
          ) : (
            filteredTickets.map((t) => {
              const isSelected = activeTicket?.id === t.id;
              const lastMsg = t.messages[t.messages.length - 1];

              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedTicketId(t.id)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer relative group ${
                    isSelected
                      ? 'bg-accent/10 border-accent shadow-md ring-1 ring-accent'
                      : 'bg-card border-border hover:border-border/80 hover:bg-white/[0.02]'
                  }`}
                >
                  {/* Top line: Ticket ID, Priority, Status */}
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-accent">
                        {t.ticket_number}
                      </span>
                      <span className="text-[10px] text-text-secondary">·</span>
                      <span className="text-[10px] font-mono text-text-secondary">
                        {t.channel}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Priority Badge */}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase font-mono ${
                        t.priority === 'urgent' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                        t.priority === 'high' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                        t.priority === 'medium' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                        'bg-white/5 text-text-secondary'
                      }`}>
                        {t.priority}
                      </span>

                      {/* Status Badge */}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                        t.status === 'open' ? 'bg-rose-500/15 text-rose-400' :
                        t.status === 'in_progress' ? 'bg-amber-500/15 text-amber-400' :
                        t.status === 'resolved' ? 'bg-emerald-500/15 text-emerald-400' :
                        'bg-white/5 text-text-secondary'
                      }`}>
                        {t.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  {/* Subject */}
                  <h4 className="font-bold text-xs sm:text-sm text-text-primary line-clamp-1 group-hover:text-accent transition-colors">
                    {t.subject}
                  </h4>

                  {/* Pharmacy & Client */}
                  <div className="flex items-center justify-between text-[11px] text-text-secondary mt-1">
                    <span className="font-medium text-text-primary/90 flex items-center gap-1 truncate max-w-[190px]">
                      <Store className="w-3 h-3 text-text-secondary shrink-0" />
                      <span>{t.pharmacy_name}</span>
                    </span>
                    <span className="text-[10px] font-mono text-text-secondary">
                      {format(new Date(t.updated_at), 'MMM dd, hh:mm a')}
                    </span>
                  </div>

                  {/* Message preview snippet */}
                  {lastMsg && (
                    <p className="text-[11px] text-text-secondary/80 line-clamp-1 mt-1.5 italic bg-bg/50 px-2 py-1 rounded">
                      <strong className="text-text-primary/90 not-italic font-semibold">{lastMsg.sender_name}:</strong> {lastMsg.message}
                    </p>
                  )}

                  {/* Category Pill Footer */}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50 text-[10px] text-text-secondary">
                    <span className="px-1.5 py-0.5 rounded bg-white/5 border border-border/60">
                      {t.category}
                    </span>
                    <span className="font-mono">
                      {t.messages.length} {t.messages.length === 1 ? 'msg' : 'msgs'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* RIGHT COLUMN: ACTIVE TICKET DETAIL & RESPONSE WORKSPACE (lg:col-span-7) */}
        <div className="lg:col-span-7 bg-card border border-border rounded-2xl flex flex-col shadow-md overflow-hidden">
          {activeTicket ? (
            <>
              {/* Header: Ticket Controls */}
              <div className="p-4 sm:p-5 border-b border-border bg-bg/40 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-accent bg-accent/15 px-2 py-0.5 rounded border border-accent/30">
                      {activeTicket.ticket_number}
                    </span>
                    <span className="text-xs font-bold text-text-secondary uppercase">
                      via {activeTicket.channel}
                    </span>
                  </div>

                  {/* Quick Status, Priority & Agent Controls */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Status Dropdown */}
                    <select
                      value={activeTicket.status}
                      onChange={(e) => onUpdateTicketStatus(activeTicket.id, e.target.value as TicketStatus)}
                      className={`text-xs font-bold px-2.5 py-1 rounded-lg border focus:outline-none focus:ring-1 focus:ring-accent ${
                        activeTicket.status === 'open' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' :
                        activeTicket.status === 'in_progress' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                        activeTicket.status === 'resolved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                        'bg-bg text-text-secondary border-border'
                      }`}
                    >
                      <option value="open">Status: Open</option>
                      <option value="in_progress">Status: In Progress</option>
                      <option value="resolved">Status: Resolved</option>
                      <option value="closed">Status: Closed</option>
                    </select>

                    {/* Priority Dropdown */}
                    <select
                      value={activeTicket.priority}
                      onChange={(e) => onUpdateTicketPriority(activeTicket.id, e.target.value as TicketPriority)}
                      className="bg-bg border border-border rounded-lg px-2.5 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                    >
                      <option value="urgent">Urgent Priority</option>
                      <option value="high">High Priority</option>
                      <option value="medium">Medium Priority</option>
                      <option value="low">Low Priority</option>
                    </select>

                    {/* Assignee Dropdown */}
                    {onAssignTicket && (
                      <select
                        value={activeTicket.assigned_to || 'Unassigned'}
                        onChange={(e) => onAssignTicket(activeTicket.id, e.target.value)}
                        className="bg-bg border border-border rounded-lg px-2.5 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent hidden sm:inline"
                      >
                        {AGENTS.map((agent) => (
                          <option key={agent} value={agent}>{agent}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* Subject Title */}
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-text-primary leading-snug">
                    {activeTicket.subject}
                  </h2>
                </div>

                {/* Client Metadata Bar */}
                <div className="bg-bg/60 p-2.5 rounded-xl border border-border/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-semibold text-text-primary flex items-center gap-1.5">
                      <Store className="w-3.5 h-3.5 text-accent" />
                      <span>{activeTicket.pharmacy_name}</span>
                      <span className="text-[10px] text-text-secondary font-normal">({activeTicket.state})</span>
                    </span>

                    <span className="text-text-secondary flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-text-secondary" />
                      <span>{activeTicket.client_name}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopy(activeTicket.client_phone)}
                      className="border border-border bg-card hover:bg-white/5 px-2 py-0.5 rounded text-[11px] font-mono text-text-secondary hover:text-text-primary flex items-center gap-1 transition-colors"
                      title="Copy Phone Number"
                    >
                      <Phone className="w-3 h-3 text-accent" />
                      <span>{copiedText === activeTicket.client_phone ? 'Copied!' : activeTicket.client_phone}</span>
                    </button>
                    <button
                      onClick={() => handleCopy(activeTicket.client_email)}
                      className="border border-border bg-card hover:bg-white/5 px-2 py-0.5 rounded text-[11px] text-text-secondary hover:text-text-primary flex items-center gap-1 transition-colors hidden sm:flex"
                      title="Copy Email"
                    >
                      <Mail className="w-3 h-3 text-accent" />
                      <span>{copiedText === activeTicket.client_email ? 'Copied!' : activeTicket.client_email}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Chat Thread Area */}
              <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4 max-h-[380px] bg-bg/20">
                {activeTicket.messages.map((msg) => {
                  const isClient = msg.sender_type === 'client';
                  const isNote = msg.internal_note;

                  if (isNote) {
                    return (
                      <div key={msg.id} className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs space-y-1 my-2">
                        <div className="flex items-center justify-between text-[11px] text-amber-400 font-bold">
                          <span className="flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            <span>Internal Staff Note · {msg.sender_name}</span>
                          </span>
                          <span className="font-mono text-[10px] opacity-80">
                            {format(new Date(msg.timestamp), 'PPpp')}
                          </span>
                        </div>
                        <p className="text-text-primary whitespace-pre-wrap">{msg.message}</p>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isClient ? 'items-start' : 'items-end'}`}
                    >
                      {/* Sender header */}
                      <div className="flex items-center gap-2 mb-1 px-1 text-[11px] text-text-secondary">
                        <span className="font-bold text-text-primary">{msg.sender_name}</span>
                        {msg.sender_role && (
                          <span className="text-[10px] text-accent">({msg.sender_role})</span>
                        )}
                        <span>·</span>
                        <span className="font-mono text-[10px]">
                          {format(new Date(msg.timestamp), 'hh:mm a, MMM dd')}
                        </span>
                      </div>

                      {/* Bubble */}
                      <div
                        className={`rounded-2xl p-3.5 max-w-[85%] text-xs leading-relaxed whitespace-pre-wrap shadow-sm ${
                          isClient
                            ? 'bg-card border border-border text-text-primary rounded-tl-sm'
                            : 'bg-accent text-white rounded-tr-sm shadow-accent/20'
                        }`}
                      >
                        {msg.message}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Response Composer Area */}
              <div className="p-4 sm:p-5 border-t border-border bg-card space-y-3">
                
                {/* Canned Quick Responses Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-text-secondary">
                    <span className="font-semibold flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-accent" />
                      <span>One-Click Quick Canned Responses</span>
                    </span>
                    <span className="text-[10px]">Click to insert response draft</span>
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {CANNED_RESPONSES.map((cr) => (
                      <button
                        key={cr.title}
                        type="button"
                        onClick={() => handleApplyCanned(cr.text)}
                        className="bg-bg hover:bg-white/5 border border-border text-text-secondary hover:text-text-primary px-2.5 py-1 rounded-lg text-[10px] font-semibold whitespace-nowrap transition-colors"
                      >
                        {cr.title}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Textarea Form */}
                <form onSubmit={handleSendReply} className="space-y-3">
                  <div className="relative">
                    <textarea
                      rows={3}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={
                        isInternalNote
                          ? "Add an internal staff note (visible only to support engineers, hidden from client)..."
                          : `Type response to ${activeTicket.client_name} at ${activeTicket.pharmacy_name}...`
                      }
                      className={`w-full rounded-xl p-3 text-xs text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-1 resize-none ${
                        isInternalNote
                          ? 'bg-amber-500/5 border border-amber-500/40 focus:ring-amber-500'
                          : 'bg-bg border border-border focus:ring-accent'
                      }`}
                    />
                  </div>

                  {/* Actions & Submit Button */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    
                    <div className="flex items-center gap-3 flex-wrap">
                      {/* Toggle Internal Note */}
                      <label className="flex items-center gap-1.5 cursor-pointer select-none text-text-secondary hover:text-text-primary">
                        <input
                          type="checkbox"
                          checked={isInternalNote}
                          onChange={(e) => setIsInternalNote(e.target.checked)}
                          className="accent-amber-500 rounded"
                        />
                        <span className="flex items-center gap-1 text-[11px] font-medium">
                          <Lock className="w-3 h-3 text-amber-400" />
                          <span>Internal Staff Note</span>
                        </span>
                      </label>

                      {/* Optional Status on Send */}
                      <div className="flex items-center gap-1.5 text-[11px] text-text-secondary">
                        <span>And set:</span>
                        <select
                          value={markStatusOnSend}
                          onChange={(e) => setMarkStatusOnSend(e.target.value as any)}
                          className="bg-bg border border-border rounded px-2 py-0.5 text-[11px] text-text-primary focus:outline-none"
                        >
                          <option value="">Keep Current Status</option>
                          <option value="in_progress">Mark as In Progress</option>
                          <option value="resolved">Mark as Resolved</option>
                          <option value="closed">Mark as Closed</option>
                        </select>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={!replyText.trim()}
                      className={`font-bold text-xs px-4 py-2 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all disabled:opacity-40 ${
                        isInternalNote
                          ? 'bg-amber-500 hover:bg-amber-600 text-black'
                          : 'bg-accent hover:bg-accent/90 text-white'
                      }`}
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isInternalNote ? 'Save Internal Note' : 'Send Reply to Client'}</span>
                    </button>
                  </div>
                </form>

              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center p-12 text-center text-text-secondary">
              <div className="space-y-3">
                <LifeBuoy className="w-12 h-12 text-text-secondary/40 mx-auto" />
                <h3 className="font-bold text-base text-text-primary">Select a Support Ticket</h3>
                <p className="text-xs max-w-sm mx-auto">
                  Choose a ticket from the left panel to review the client inquiry, examine logs, and dispatch your reply.
                </p>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* CREATE MANUAL TICKET MODAL */}
      {newTicketModalOpen && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <LifeBuoy className="w-5 h-5 text-accent" />
                <h3 className="font-bold text-base text-text-primary">Log Client Support Ticket</h3>
              </div>
              <button
                onClick={() => setNewTicketModalOpen(false)}
                className="p-1 text-text-secondary hover:text-text-primary rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTicketSubmit} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-text-secondary uppercase">Select Pharmacy Store</label>
                <select
                  value={newPharmacyId}
                  onChange={(e) => setNewPharmacyId(e.target.value)}
                  className="w-full bg-bg border border-border rounded-lg p-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  {pharmacies.slice(0, 50).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.business_name} ({p.owner_name} • {p.state})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-text-secondary uppercase">Ticket Subject</label>
                <input
                  type="text"
                  placeholder="e.g. Printer offline error or subscription renewal query"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  required
                  className="w-full bg-bg border border-border rounded-lg p-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-text-secondary uppercase">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as TicketCategory)}
                    className="w-full bg-bg border border-border rounded-lg p-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    <option value="Technical & POS Hardware">Technical &amp; POS Hardware</option>
                    <option value="Billing & Subscription">Billing &amp; Subscription</option>
                    <option value="Referral & Rewards">Referral &amp; Rewards</option>
                    <option value="NAFDAC & Compliance">NAFDAC &amp; Compliance</option>
                    <option value="Account & Access">Account &amp; Access</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-text-secondary uppercase">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as TicketPriority)}
                    className="w-full bg-bg border border-border rounded-lg p-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-text-secondary uppercase">Initial Client Message / Problem Description</label>
                <textarea
                  rows={3}
                  placeholder="Describe the client request or issue as reported..."
                  value={newInitialMessage}
                  onChange={(e) => setNewInitialMessage(e.target.value)}
                  required
                  className="w-full bg-bg border border-border rounded-lg p-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                />
              </div>

              <div className="pt-2 border-t border-border flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewTicketModalOpen(false)}
                  className="px-4 py-2 border border-border rounded-lg text-xs font-semibold text-text-secondary hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-accent hover:bg-accent/90 text-white rounded-lg text-xs font-bold shadow-sm"
                >
                  Create &amp; Triage Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
