'use client';

import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Clock, Calendar } from 'lucide-react';

export default function HeaderDateTime() {
  const [time, setTime] = useState(new Date());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center gap-2 md:gap-4 px-3 md:px-4 py-1.5 bg-accent/5 border border-accent/10 rounded-full opacity-0">
        <div className="flex items-center gap-2 text-accent">
          <Clock className="w-3.5 h-3.5" />
          <span className="text-xs font-bold data-mono tracking-wider">00:00:00</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 md:gap-4 px-3 md:px-4 py-1.5 bg-accent/5 border border-accent/10 rounded-full">
      <div className="flex items-center gap-2 text-accent">
        <Clock className="w-3.5 h-3.5" />
        <span className="text-xs font-bold data-mono tracking-wider">{format(time, 'HH:mm:ss')}</span>
      </div>
      <div className="hidden sm:block w-px h-3 bg-border" />
      <div className="hidden sm:flex items-center gap-2 text-text-secondary">
        <Calendar className="w-3.5 h-3.5" />
        <span className="text-[10px] font-medium uppercase tracking-tight">{format(time, 'EEE, MMM do')}</span>
      </div>
    </div>
  );
}
