import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getActiveDeviceIdentity } from '../lib/crypto/deviceIdentity';
import { SyncDispatcher } from '../lib/offline/dispatcher';

const DISPATCH_INTERVAL_MS = 30_000;

/**
 * Authenticated runtime bridge for the durable IndexedDB outbox. It starts only
 * with a resolved tenant context and registered local device identity; queue
 * leasing remains authoritative across browser tabs.
 */
export function OfflineSyncRuntime() {
  const { state, pharmacy } = useAuth();

  useEffect(() => {
    if (state !== 'authenticated_ready' || !pharmacy) return;

    let stopped = false;
    const dispatcher = new SyncDispatcher({
      rpcGetClientOpStatus: async (pharmacyId, clientOpId) => {
        const { data, error } = await supabase.rpc('rpc_get_client_op_status', {
          p_pharmacy_id: pharmacyId,
          p_client_op_id: clientOpId
        });
        if (error) throw error;
        return Array.isArray(data) ? data[0] || null : data || null;
      }
    });

    const dispatch = async () => {
      if (stopped || !navigator.onLine) return;
      const [{ data: sessionData }, deviceIdentity] = await Promise.all([
        supabase.auth.getSession(),
        getActiveDeviceIdentity()
      ]);
      if (stopped || !sessionData.session?.access_token || !deviceIdentity) return;
      await dispatcher.dispatch(pharmacy.id, deviceIdentity, sessionData.session.access_token);
    };

    const onOnline = () => { void dispatch(); };
    void dispatch();
    window.addEventListener('online', onOnline);
    const interval = window.setInterval(() => { void dispatch(); }, DISPATCH_INTERVAL_MS);

    return () => {
      stopped = true;
      window.removeEventListener('online', onOnline);
      window.clearInterval(interval);
    };
  }, [state, pharmacy?.id]);

  return null;
}
