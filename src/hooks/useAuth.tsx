/**
 * Auth layer — clean rebuild.
 *
 * Rules (intentionally minimal — do NOT re-introduce the patches we removed):
 *  - ONE Supabase client (src/integrations/supabase/client.ts).
 *  - ONE AuthProvider, ONE onAuthStateChange listener.
 *  - getSession() runs once on mount to restore from storage.
 *  - onAuthStateChange is the single source of truth afterwards.
 *  - No awaits inside the listener callback (prevents Supabase deadlocks).
 *  - Hard 2s safety cap: if getSession never settles (offline / 504), we
 *    unblock the UI with session=null instead of an infinite spinner.
 *  - Failure of auth NEVER throws — AppShell stays mounted.
 *
 * Removed (Phase 6 hacks): readStoredSessionFallback, bootRetryTimer chain,
 * initialSessionResolved gating, duplicate listeners, lazy/suspense auth,
 * INITIAL_SESSION special-cases.
 */
import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { logSecurityEvent } from "@/lib/securityLog";
import { registerCurrentDevice } from "@/lib/deviceFingerprint";

const BOOT_SAFETY_MS = 2000;
const ACTION_TIMEOUT_MS = 15000;

type Profile = { full_name: string; email: string; avatar_url: string | null } | null;

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`${label} timeout`)), ms);
    Promise.resolve<T>(p as any).then(
      (v) => { window.clearTimeout(t); resolve(v); },
      (e) => { window.clearTimeout(t); reject(e); },
    );
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  // Fire-and-forget profile fetch — never blocks auth state.
  const loadProfile = (userId: string) => {
    supabase
      .from("profiles")
      .select("full_name, email, avatar_url")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error("[Auth] profile fetch:", error.message);
          return;
        }
        if (mounted.current && data) setProfile(data);
      });
  };

  useEffect(() => {
    mounted.current = true;
    let settled = false;

    const apply = (s: Session | null) => {
      if (!mounted.current) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        loadProfile(s.user.id);
        try { registerCurrentDevice(); } catch {}
      } else {
        setProfile(null);
      }
      if (!settled) {
        settled = true;
        setLoading(false);
      }
    };

    // 1) Listener first — single source of truth for changes.
    //    No awaits inside the callback (prevents Supabase auth deadlock).
    console.log("[MOUNT] AuthProvider");
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      console.log("[AUTH EVENT]", event, "hasSession=", !!s, "uid=", s?.user?.id ?? null);
      if (event === "TOKEN_REFRESHED") console.log("[AUTH] token refreshed");
      if (event === "INITIAL_SESSION") console.log("[AUTH] initial session resolved");
      apply(s);
      if (event === "SIGNED_OUT") {
        try {
          localStorage.removeItem("selected_workspace_id");
          localStorage.removeItem("invite_token");
          sessionStorage.removeItem("invite_token");
        } catch {}
      }
    });

    // 2) Restore existing session from storage. onAuthStateChange will also
    //    fire INITIAL_SESSION; whichever resolves first calls apply().
    console.log("[AUTH] getSession() boot");
    supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => {
        console.log("[AUTH] getSession resolved hasSession=", !!s);
        apply(s);
      })
      .catch((err) => {
        console.error("[Auth] getSession failed:", err);
        apply(null);
      });

    // 3) Safety cap — never leave the UI on an infinite spinner. If the
    //    auth endpoint is unreachable, fall through to logged-out state.
    const safety = window.setTimeout(() => {
      if (!settled && mounted.current) {
        console.warn("[AUTH] boot safety cap hit — proceeding without session");
        settled = true;
        setLoading(false);
      }
    }, BOOT_SAFETY_MS);

    return () => {
      console.log("[UNMOUNT] AuthProvider");
      mounted.current = false;
      window.clearTimeout(safety);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        ACTION_TIMEOUT_MS,
        "signInWithPassword",
      );
      // Fire-and-forget logging.
      supabase.from("backend_event_logs").insert({
        table_name: "auth",
        action: error ? "LOGIN_FAILED" : "LOGIN",
        payload: error ? ({ email, reason: error.message } as any) : ({ email } as any),
      }).then(() => {}, () => {});
      logSecurityEvent({
        type: error ? "login_failed" : "login",
        severity: error ? "warn" : "info",
        metadata: { email, reason: error?.message ?? null },
        riskScore: error ? 30 : 0,
      });
      return { error: (error as Error | null) ?? null };
    } catch (err) {
      console.error("[Auth] signIn error:", err);
      return { error: new Error("Login indisponível no momento. Tente novamente em instantes.") };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const inviteToken =
        localStorage.getItem("invite_token") || sessionStorage.getItem("invite_token") || undefined;
      const metadata: Record<string, string> = { full_name: fullName };
      if (inviteToken) metadata.invite_token = inviteToken;
      const redirectUrl = inviteToken
        ? `${window.location.origin}/join?token=${inviteToken}`
        : window.location.origin;

      const { error } = await withTimeout(
        supabase.auth.signUp({
          email,
          password,
          options: { data: metadata, emailRedirectTo: redirectUrl },
        }),
        ACTION_TIMEOUT_MS,
        "signUp",
      );

      if (!error) {
        supabase.from("backend_event_logs").insert({
          table_name: "auth",
          action: "SIGNUP",
          payload: { email, full_name: fullName, invite_token: inviteToken || null } as any,
        }).then(() => {}, () => {});
      }
      return { error: (error as Error | null) ?? null };
    } catch (err) {
      console.error("[Auth] signUp error:", err);
      return { error: err as Error };
    }
  };

  const signOut = async () => {
    try {
      logSecurityEvent({ type: "logout", severity: "info" });
      await withTimeout(supabase.auth.signOut(), ACTION_TIMEOUT_MS, "signOut");
    } catch (err) {
      console.error("[Auth] signOut error:", err);
    }
    if (mounted.current) {
      setSession(null);
      setUser(null);
      setProfile(null);
    }
    try {
      localStorage.removeItem("selected_workspace_id");
      localStorage.removeItem("invite_token");
      sessionStorage.removeItem("invite_token");
    } catch {}
    if (typeof window !== "undefined") window.location.replace("/auth");
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
