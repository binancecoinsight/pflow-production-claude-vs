import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Plus, Trash2, Edit2, X, Clock, Info, AlertCircle, ChevronLeft, ChevronRight, User as UserIcon } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { User } from '../types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate?: string;
  type: 'holiday' | 'leave' | 'duty' | 'other';
  allDay: boolean;
  createdBy: string;
  createdAt: string;
  staffId?: string;
  staffName?: string;
}

export default function Calendar({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [viewDate, setViewDate] = useState(new Date());
  const [scheduleFilter, setScheduleFilter] = useState<'all' | 'holiday' | 'leave' | 'duty'>('all');
  const [schedulePeriod, setSchedulePeriod] = useState<'week' | 'month'>('month');
  
  const isAdmin = user?.role === 'admin' || user?.role === 'store owner';

  useEffect(() => {
    console.log('Calendar component user:', user);
    console.log('Calendar component isAdmin:', isAdmin);
  }, [user, isAdmin]);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    type: 'holiday' as 'holiday' | 'leave' | 'duty' | 'other',
    allDay: true,
    staffId: ''
  });

  useEffect(() => {
    const isDirty = isModalOpen && (
      formData.title !== (editingEvent?.title || '') ||
      formData.description !== (editingEvent?.description || '') ||
      formData.startDate !== (editingEvent?.startDate || new Date().toISOString().split('T')[0]) ||
      formData.endDate !== (editingEvent?.endDate || '') ||
      formData.type !== (editingEvent?.type || 'holiday') ||
      formData.allDay !== (editingEvent ? !!editingEvent.allDay : true) ||
      formData.staffId !== (editingEvent?.staffId || '')
    );
    console.log('Calendar isDirty:', isDirty, { isModalOpen, formData, editingEvent });
    if (onDirtyChange) onDirtyChange(isDirty);
    return () => { if (onDirtyChange) onDirtyChange(false); };
  }, [isModalOpen, formData, editingEvent, onDirtyChange]);

  useEffect(() => {
    fetchEvents();
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await apiFetch('/api/users');
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const fetchEvents = async () => {
    try {
      const res = await apiFetch('/api/calendar-events');
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch events:', error);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Submitting calendar event:', formData);
    if (!isAdmin) {
      console.error('User is not an admin, cannot save event');
      return;
    }

    try {
      const method = editingEvent ? 'PUT' : 'POST';
      const url = editingEvent ? `/api/calendar-events/${editingEvent.id}` : '/api/calendar-events';
      
      const selectedStaff = users.find(u => u.id === formData.staffId);

      const res = await apiFetch(url, {
        method,
        body: JSON.stringify({
          ...formData,
          staffName: selectedStaff?.name || '',
          createdBy: user?.name || 'Unknown'
        })
      });

      if (res.ok) {
        showNotification('success', editingEvent ? 'Event updated' : 'Event created');
        setIsModalOpen(false);
        setEditingEvent(null);
        setFormData({
          title: '',
          description: '',
          startDate: new Date().toISOString().split('T')[0],
          endDate: '',
          type: 'holiday',
          allDay: true,
          staffId: ''
        });
        fetchEvents();
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error('Failed to save event:', res.status, errorData);
        showNotification('error', errorData.error || 'Failed to save event');
      }
    } catch (error) {
      console.error('Error saving event:', error);
      showNotification('error', 'Failed to save event');
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin || !window.confirm('Are you sure you want to delete this event?')) return;

    try {
      const res = await apiFetch(`/api/calendar-events/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showNotification('success', 'Event deleted');
        fetchEvents();
      }
    } catch (error) {
      showNotification('error', 'Failed to delete event');
    }
  };

  const openEditModal = (event: CalendarEvent) => {
    setEditingEvent(event);
    setFormData({
      title: event.title,
      description: event.description || '',
      startDate: event.startDate,
      endDate: event.endDate || '',
      type: event.type,
      allDay: !!event.allDay,
      staffId: event.staffId || ''
    });
    setIsModalOpen(true);
  };

  // Calendar logic
  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const days = daysInMonth(year, month);
  const firstDay = firstDayOfMonth(year, month);

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.filter(e => {
      const isSameDay = e.startDate === dateStr;
      if (!isSameDay) return false;
      if (scheduleFilter === 'all') return true;
      return e.type === scheduleFilter;
    });
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'holiday': return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'leave': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'duty': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      default: return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center gap-6">
        <div>
          <h2 className="text-2xl font-bold text-brand-text">Calendar & Schedules</h2>
          <p className="text-sm text-brand-muted">Manage holidays, staff leaves, and duty schedules</p>
        </div>
        
        <div className="flex flex-wrap items-center justify-center gap-3 w-full max-w-4xl">
          <div className="flex p-1 bg-brand-bg rounded-2xl border border-brand-border overflow-x-auto no-scrollbar">
            {(['all', 'holiday', 'leave', 'duty'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setScheduleFilter(filter)}
                className={cn(
                  "px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap",
                  scheduleFilter === filter 
                    ? "bg-white dark:bg-brand-surface shadow-sm text-brand-accent" 
                    : "text-brand-muted hover:text-brand-text"
                )}
              >
                {filter === 'all' ? 'All Schedules' : filter === 'holiday' ? 'Holidays' : filter === 'leave' ? 'Staff Leave' : 'On Duty'}
              </button>
            ))}
          </div>

          <div className="flex p-1 bg-brand-bg rounded-2xl border border-brand-border">
            {(['week', 'month'] as const).map((period) => (
              <button
                key={period}
                onClick={() => setSchedulePeriod(period)}
                className={cn(
                  "px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap",
                  schedulePeriod === period 
                    ? "bg-white dark:bg-brand-surface shadow-sm text-brand-accent" 
                    : "text-brand-muted hover:text-brand-text"
                )}
              >
                {period === 'week' ? 'Weekly' : 'Monthly'}
              </button>
            ))}
          </div>

          {isAdmin && (
            <button 
              onClick={() => {
                setEditingEvent(null);
                setFormData({
                  title: '',
                  description: '',
                  startDate: new Date().toISOString().split('T')[0],
                  endDate: '',
                  type: 'holiday',
                  allDay: true,
                  staffId: ''
                });
                setIsModalOpen(true);
              }}
              className="btn-primary flex items-center gap-2"
            >
              <Plus size={18} />
              Add Event
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Calendar View */}
        <div className="lg:col-span-2 card p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-brand-text">
              {viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h3>
            <div className="flex gap-2">
              <button onClick={prevMonth} className="p-2 hover:bg-brand-bg rounded-full transition-colors">
                <ChevronLeft size={20} />
              </button>
              <button onClick={() => setViewDate(new Date())} className="px-3 py-1 text-xs font-medium hover:bg-brand-bg rounded-md transition-colors">
                Today
              </button>
              <button onClick={nextMonth} className="p-2 hover:bg-brand-bg rounded-full transition-colors">
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px bg-brand-border border border-brand-border rounded-xl overflow-hidden">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="bg-brand-surface p-2 text-center text-xs font-bold text-brand-muted uppercase tracking-wider">
                {day}
              </div>
            ))}
            {Array.from({ length: 42 }).map((_, i) => {
              const day = i - firstDay + 1;
              const isCurrentMonth = day > 0 && day <= days;
              const dayEvents = isCurrentMonth ? getEventsForDay(day) : [];
              const isToday = isCurrentMonth && day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();

              return (
                <div 
                  key={i} 
                  className={cn(
                    "bg-brand-surface min-h-[100px] p-2 transition-colors",
                    !isCurrentMonth && "opacity-30 bg-brand-bg/50"
                  )}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={cn(
                      "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
                      isToday ? "bg-brand-accent text-white" : "text-brand-text"
                    )}>
                      {isCurrentMonth ? day : ''}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {dayEvents.map(event => (
                      <div 
                        key={event.id}
                        onClick={() => openEditModal(event)}
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded border truncate cursor-pointer hover:brightness-95 transition-all",
                          getTypeColor(event.type)
                        )}
                      >
                        {event.staffName ? `${event.staffName}: ` : ''}{event.title}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming Events List */}
        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="text-lg font-bold text-brand-text mb-4 flex items-center gap-2">
              <Clock size={20} className="text-brand-accent" />
              Upcoming {scheduleFilter && scheduleFilter !== 'all' ? (scheduleFilter || '').charAt(0).toUpperCase() + (scheduleFilter || '').slice(1) + 's' : 'Events'}
            </h3>
            <div className="space-y-4">
              {events
                .filter(e => {
                  const eventDate = new Date(e.startDate);
                  const today = new Date(new Date().setHours(0,0,0,0));
                  const isUpcoming = eventDate >= today;
                  
                  if (!isUpcoming) return false;
                  
                  if (scheduleFilter !== 'all' && e.type !== scheduleFilter) return false;
                  
                  if (schedulePeriod === 'week') {
                    const nextWeek = new Date(today);
                    nextWeek.setDate(today.getDate() + 7);
                    return eventDate <= nextWeek;
                  }
                  
                  return true;
                })
                .slice(0, 10)
                .map(event => (
                  <div key={event.id} className="group flex gap-4 p-3 rounded-xl hover:bg-brand-bg transition-all border border-transparent hover:border-brand-border">
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 border",
                      getTypeColor(event.type)
                    )}>
                      <span className="text-[10px] font-bold uppercase">{new Date(event.startDate).toLocaleDateString('en-US', { month: 'short' })}</span>
                      <span className="text-lg font-bold leading-none">{new Date(event.startDate).getDate()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-brand-text truncate">{event.title}</h4>
                      {event.staffName && (
                        <p className="text-[10px] font-bold text-brand-accent flex items-center gap-1">
                          <UserIcon size={10} />
                          {event.staffName}
                        </p>
                      )}
                      <p className="text-xs text-brand-muted truncate">{event.description || 'No description'}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
                          getTypeColor(event.type)
                        )}>
                          {event.type}
                        </span>
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="opacity-0 group-hover:opacity-100 flex flex-col gap-1 transition-opacity">
                        <button onClick={() => openEditModal(event)} className="p-1.5 text-brand-muted hover:text-brand-accent transition-colors">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => handleDelete(event.id)} className="p-1.5 text-brand-muted hover:text-rose-500 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              {events.length === 0 && (
                <div className="text-center py-8 text-brand-muted">
                  <CalendarIcon size={32} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No upcoming events</p>
                </div>
              )}
            </div>
          </div>

          <div className="card p-6 bg-brand-accent/5 border-brand-accent/20">
            <h3 className="text-sm font-bold text-brand-text mb-3 flex items-center gap-2">
              <Info size={16} className="text-brand-accent" />
              Legend
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2 text-xs text-brand-muted">
                <div className="w-3 h-3 rounded bg-rose-100 border border-rose-200"></div>
                Holiday
              </div>
              <div className="flex items-center gap-2 text-xs text-brand-muted">
                <div className="w-3 h-3 rounded bg-amber-100 border border-amber-200"></div>
                Staff Leave
              </div>
              <div className="flex items-center gap-2 text-xs text-brand-muted">
                <div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200"></div>
                On Duty
              </div>
              <div className="flex items-center gap-2 text-xs text-brand-muted">
                <div className="w-3 h-3 rounded bg-blue-100 border border-blue-200"></div>
                Other
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="fixed inset-0 bg-brand-bg/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              className="relative w-full max-w-md bg-brand-surface rounded-3xl shadow-2xl border border-brand-border overflow-hidden my-8"
            >
              <div className="p-6 border-b border-brand-border flex justify-between items-center">
                <h3 className="text-xl font-bold text-brand-text">
                  {editingEvent ? 'Edit Event' : 'Add New Event'}
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-brand-bg rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Event Title</label>
                  <input 
                    type="text"
                    required
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    className="input-field"
                    placeholder="e.g. Independence Day"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Description</label>
                  <textarea 
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    className="input-field min-h-[100px]"
                    placeholder="Add more details..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Start Date</label>
                    <input 
                      type="date"
                      required
                      value={formData.startDate}
                      onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                      className="input-field"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">End Date (Optional)</label>
                    <input 
                      type="date"
                      value={formData.endDate}
                      onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                      className="input-field"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Event Type</label>
                  <select 
                    value={formData.type}
                    onChange={e => {
                      const newType = e.target.value as any;
                      setFormData({ 
                        ...formData, 
                        type: newType,
                        // Reset staffId if not leave/duty
                        staffId: (newType === 'leave' || newType === 'duty') ? formData.staffId : ''
                      });
                    }}
                    className="input-field"
                  >
                    <option value="holiday">Holiday</option>
                    <option value="leave">Staff Leave</option>
                    <option value="duty">On Duty Schedule</option>
                    <option value="other">Other Event</option>
                  </select>
                </div>

                {(formData.type === 'leave' || formData.type === 'duty') && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-1"
                  >
                    <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Select Staff</label>
                    <select 
                      required
                      value={formData.staffId}
                      onChange={e => setFormData({ ...formData, staffId: e.target.value })}
                      className="input-field"
                    >
                      <option value="">Select staff member...</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.roleName || u.role})</option>
                      ))}
                    </select>
                  </motion.div>
                )}

                <div className="flex items-center gap-3 p-3 bg-brand-bg rounded-xl">
                  <input 
                    type="checkbox"
                    id="allDay"
                    checked={formData.allDay}
                    onChange={e => setFormData({ ...formData, allDay: e.target.checked })}
                    className="w-4 h-4 rounded border-brand-border text-brand-accent focus:ring-brand-accent"
                  />
                  <label htmlFor="allDay" className="text-sm font-medium text-brand-text">All Day Event</label>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="btn-primary flex-1"
                  >
                    {editingEvent ? 'Update Event' : 'Create Event'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
