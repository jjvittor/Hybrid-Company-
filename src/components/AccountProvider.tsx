import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from '@tanstack/react-router';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

const AccountContext = createContext<{ user: User | null; ready: boolean; recovery: boolean }>({ user: null, ready: false, recovery: false });
export const useAccount = () => useContext(AccountContext);

export function AccountProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    let live = true;
    const refresh = async () => {
      const { data } = await supabase.auth.getUser();
      if (live) { setUser(data.user); setReady(true); }
    };
    void refresh();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') { setRecovery(true); sessionStorage.setItem('ybrd-recovery', 'true'); }
      if (event === 'SIGNED_OUT') { setUser(null); setRecovery(false); sessionStorage.removeItem('ybrd-recovery'); }
      if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT' && event !== 'USER_UPDATED' && event !== 'PASSWORD_RECOVERY') return;
      // Auth callbacks must not await another auth method while the auth lock is held.
      setTimeout(() => { if (live) { void refresh(); void router.invalidate(); if (event !== 'SIGNED_OUT') void router.options.context?.queryClient.invalidateQueries(); } }, 0);
    });
    if (new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery' || sessionStorage.getItem('ybrd-recovery') === 'true') setRecovery(true);
    return () => { live = false; subscription.unsubscribe(); };
  }, [router]);
  return <AccountContext.Provider value={{ user, ready, recovery }}>{children}</AccountContext.Provider>;
}