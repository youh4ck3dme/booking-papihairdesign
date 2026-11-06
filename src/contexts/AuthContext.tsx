import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { clearLegacyPrivateCache, ensurePrivateWorker } from "@/lib/employee-dashboard";

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
}
export interface Membership {
  id: string;
  business_id: string;
  profile_id: string;
  role: "owner" | "admin" | "employee" | "customer";
}
interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  memberships: Membership[];
  loading: boolean;
  authError: string | null;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}
const AuthContext = createContext<AuthContextType>({
  user: null, session: null, profile: null, memberships: [], loading: true,
  authError: null, signOut: async () => {}, refreshProfile: async () => {},
});
export const useAuth = () => useContext(AuthContext);

function removePersistedSession() {
  const reference = new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split('.')[0];
  const key = `sb-${reference}-auth-token`;
  try {
    for (const suffix of ['', '-code-verifier', '-user']) localStorage.removeItem(`${key}${suffix}`);
  } catch { /* In-memory auth is still cleared when browser storage is unavailable. */ }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const generation = useRef(0);
  const identity = useRef<string | null>(null);
  const membershipIdentity = useRef('');

  const loadProfile = useCallback(async (userId: string, version: number) => {
    try {
      await ensurePrivateWorker();
      if (generation.current !== version || identity.current !== userId) return;
      const [profileResult, membershipResult] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).single(),
        supabase.from("memberships").select("*").eq("profile_id", userId),
      ]);
      if (generation.current !== version || identity.current !== userId) return;
      if (profileResult.error || membershipResult.error) throw new Error('Profile unavailable');
      const nextMemberships = (membershipResult.data ?? []) as Membership[];
      const nextIdentity = nextMemberships.map(item => `${item.business_id}:${item.role}`).sort().join('|');
      if (membershipIdentity.current !== nextIdentity) {
        await queryClient.cancelQueries(); queryClient.clear();
        if (generation.current !== version || identity.current !== userId) return;
        membershipIdentity.current = nextIdentity;
      }
      setProfile(profileResult.data as Profile);
      setMemberships(nextMemberships);
      setAuthError(null);
    } catch {
      if (generation.current !== version || identity.current !== userId) return;
      setProfile(null); setMemberships([]);
      setAuthError('Nepodarilo sa overiť účet. Pripojte sa na internet, aktualizujte aplikáciu a skúste znova.');
    } finally {
      if (generation.current === version && identity.current === userId) setLoading(false);
    }
  }, [queryClient]);

  const refreshProfile = useCallback(async () => {
    const userId = identity.current;
    if (!userId) return;
    const version = ++generation.current;
    setLoading(true); setAuthError(null);
    await loadProfile(userId, version);
  }, [loadProfile]);

  useEffect(() => {
    let alive = true;
    let authEventSeen = false;
    const applySession = (next: Session | null) => {
      if (!alive) return;
      const userId = next?.user.id ?? null;
      const changed = identity.current !== userId;
      const version = ++generation.current;
      identity.current = userId;
      if (changed) {
        membershipIdentity.current = '';
        void queryClient.cancelQueries();
        queryClient.clear();
        void clearLegacyPrivateCache().catch(() => {});
        setProfile(null); setMemberships([]);
      }
      setUser(next?.user ?? null); setSession(next); setAuthError(null);
      setLoading(Boolean(userId));
      if (userId) {
        // Keep asynchronous REST work outside the Supabase auth callback lock.
        window.setTimeout(() => {
          if (alive && generation.current === version) void loadProfile(userId, version);
        }, 0);
      } else { setProfile(null); setMemberships([]); }
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      authEventSeen = true; applySession(next);
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!alive || authEventSeen) return;
      applySession(error ? null : data.session);
    }).catch(() => { if (alive && !authEventSeen) applySession(null); });
    return () => { alive = false; ++generation.current; subscription.unsubscribe(); };
  }, [loadProfile, queryClient]);

  const signOut = useCallback(async () => {
    ++generation.current; identity.current = null; membershipIdentity.current = '';
    setUser(null); setSession(null); setProfile(null); setMemberships([]); setLoading(false); setAuthError(null);
    await queryClient.cancelQueries(); queryClient.clear();
    await clearLegacyPrivateCache().catch(() => {});
    // Local scope also removes this device's session; no other employee devices are logged out.
    if (!navigator.onLine) removePersistedSession();
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      removePersistedSession();
      // With no persisted session the SDK can clear its state/broadcast without a revoke request.
      await supabase.auth.signOut({ scope: 'local' });
    }
  }, [queryClient]);

  useEffect(() => {
    const beforeUnload = () => {
      if (sessionStorage.getItem('auth_session_tab_only') === 'true') {
        sessionStorage.removeItem('auth_session_tab_only');
        removePersistedSession();
        void supabase.auth.signOut({ scope: 'local' });
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  return <AuthContext.Provider value={{ user, session, profile, memberships, loading, authError, signOut, refreshProfile }}>{children}</AuthContext.Provider>;
};
