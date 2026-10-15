'use client';

import React, { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, X, Clock, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, [mounted]);

  if (!mounted) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="fixed top-20 right-8 w-80 bg-card border border-border rounded-xl shadow-2xl z-[101] overflow-hidden"
          >
            <div className="p-4 border-b border-border flex items-center justify-between bg-white/5">
              <h3 className="font-semibold text-sm">System Settings</h3>
              <button
                onClick={onClose}
                className="p-1 hover:bg-white/10 rounded-md transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Date & Time Section */}
              <div className="space-y-3">
                <p className="data-grid-header">Current Time</p>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3 text-text-primary">
                    <Clock className="w-4 h-4 text-accent" />
                    <span className="text-2xl font-bold data-mono">
                      {format(currentTime, 'HH:mm:ss')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-text-secondary">
                    <Calendar className="w-4 h-4" />
                    <span className="text-sm">
                      {format(currentTime, 'EEEE, MMMM do, yyyy')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Appearance Section */}
              <div className="space-y-3">
                <p className="data-grid-header">Appearance</p>
                <div className="flex items-center justify-between p-3 bg-bg rounded-lg border border-border">
                  <div className="flex items-center gap-3">
                    {theme === 'dark' ? (
                      <Moon className="w-4 h-4 text-accent" />
                    ) : (
                      <Sun className="w-4 h-4 text-accent" />
                    )}
                    <span className="text-sm font-medium">
                      {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                    </span>
                  </div>
                  <button
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    className="relative w-12 h-6 bg-border rounded-full transition-colors focus:outline-none"
                  >
                    <motion.div
                      animate={{ x: theme === 'dark' ? 24 : 4 }}
                      className="absolute top-1 w-4 h-4 bg-accent rounded-full shadow-sm"
                    />
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 bg-white/5 border-t border-border text-center">
              <p className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">
                Pharmacy Flow v1.0.4
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
