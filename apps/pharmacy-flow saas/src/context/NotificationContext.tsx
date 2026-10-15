import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type NotificationType = 'success' | 'error' | 'info';

interface Notification {
  id: string;
  type: NotificationType;
  message: string;
}

interface NotificationContextType {
  showNotification: (type: NotificationType, message: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const showNotification = useCallback((type: NotificationType, message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications((prev) => [...prev, { id, type, message }]);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5000);
  }, []);

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] flex flex-col items-center gap-2 w-full max-w-sm px-4 pointer-events-none">
        <AnimatePresence>
          {notifications.map((notification) => (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="pointer-events-auto w-full"
            >
              <div
                className={`flex items-center gap-3 p-4 rounded-2xl shadow-lg border backdrop-blur-md ${
                  notification.type === 'success'
                    ? 'bg-emerald-50/90 border-emerald-100 text-emerald-800'
                    : notification.type === 'error'
                    ? 'bg-rose-50/90 border-rose-100 text-rose-800'
                    : 'bg-blue-50/90 border-blue-100 text-blue-800'
                }`}
              >
                {notification.type === 'success' && <CheckCircle size={20} className="shrink-0" />}
                {notification.type === 'error' && <AlertCircle size={20} className="shrink-0" />}
                {notification.type === 'info' && <Info size={20} className="shrink-0" />}
                
                <p className="text-sm font-medium flex-1">{notification.message}</p>
                
                <button
                  onClick={() => removeNotification(notification.id)}
                  className="p-1 hover:bg-black/5 rounded-lg transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}
