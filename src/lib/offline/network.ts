/**
 * PharmacyFlow Network Awareness Utilities
 * 
 * Provides network status hints and connectivity event listeners.
 * Note: navigator.onLine is used as a heuristic hint, not an authoritative guarantee.
 */

export const isOnline = (): boolean => {
  if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
    return navigator.onLine;
  }
  return true;
};

export const subscribeToNetworkStatus = (
  callback: (online: boolean) => void
): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
};
