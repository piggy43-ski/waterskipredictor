import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Server-synced clock. All Vault countdowns run off DB time, never the device clock.
 * Returns the current server time in ms, ticking once per second.
 */
export function useVaultClock() {
  const offsetRef = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t0 = Date.now();
      const { data, error } = await supabase.rpc('vault_server_time');
      if (cancelled || error || !data) return;
      const rtt = (Date.now() - t0) / 2;
      offsetRef.current = new Date(data as unknown as string).getTime() + rtt - Date.now();
      setSynced(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offsetRef.current), 1000);
    return () => clearInterval(id);
  }, []);

  return { now: now + (synced ? 0 : 0), synced };
}