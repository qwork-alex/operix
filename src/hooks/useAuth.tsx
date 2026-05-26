import { createContext, useContext, useEffect, useState, ReactNode, useRef } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { logSecurityEvent } from "@/lib/securityLog";
import { registerCurrentDevice } from "@/lib/deviceFingerprint";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: { full_name: string; email: string; avatar_url: string | null } | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthContextType["profile"]>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const fetchUserData = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, email, avatar_url")
        .eq("id", userId)
        .maybeSingle();
      if (error) {
        console.error("[Auth] Profile fetch error:", error.message);
        return;
      }
      if (mounted.current && data) setProfile(data);
    } catch (err) {
      console.error("[Auth] fetchUserData error:", err);
    }
  };

  useEffect(() => {
    mounted.current = true;

    // 1. Get existing session first
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted.current) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchUserData(s.user.id);
        // Phase 5.5 — register device fingerprint (silent, best-effort)
        registerCurrentDevice();
      }
      setLoading(false);
    }).catch((err) => {
      console.error("[Auth] getSession error:", err);
      if (mounted.current) setLoading(false);
    });

    // 2. Listen for auth changes — no awaits inside callback
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, s) => {
        if (!mounted.current) return;
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) {
          // Fire-and-forget profile fetch + device register (no await)
          setTimeout(() => {
            fetchUserData(s.user.id);
            registerCurrentDevice();
          }, 0);
        } else {
          setProfile(null);
        }
        setLoading(false);
        // Hard reset on sign-out / user-switch to prevent stale shell, query
        // cache, workspace, RBAC or tenant state from surviving the change.
        if (event === "SIGNED_OUT") {
          try {
            localStorage.removeItem("selected_workspace_id");
            localStorage.removeItem("invite_token");
            sessionStorage.removeItem("invite_token");
          } catch {}
        }
      }
    );

    return () => {
      mounted.current = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      // Fire-and-forget logging
      supabase.from("backend_event_logs").insert({
        table_name: "auth",
        action: error ? "LOGIN_FAILED" : "LOGIN",
        payload: error
          ? { email, reason: error.message } as any
          : { email } as any,
      }).then(() => {}, (err) => console.error("[Auth] Log error:", err));
      // Phase 5 — security trail
      logSecurityEvent({
        type: error ? "login_failed" : "login",
        severity: error ? "warn" : "info",
        metadata: { email, reason: error?.message ?? null },
        riskScore: error ? 30 : 0,
      });
      return { error: error as Error | null };
    } catch (err) {
      console.error("[Auth] signIn error:", err);
      return { error: err as Error };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const inviteToken = localStorage.getItem("invite_token") || sessionStorage.getItem("invite_token") || undefined;
      const metadata: Record<string, string> = { full_name: fullName };
      if (inviteToken) {
        metadata.invite_token = inviteToken;
      }

      const redirectUrl = inviteToken
        ? `${window.location.origin}/join?token=${inviteToken}`
        : window.location.origin;

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata,
          emailRedirectTo: redirectUrl,
        },
      });

      if (!error) {
        supabase.from("backend_event_logs").insert({
          table_name: "auth", action: "SIGNUP",
          payload: { email, full_name: fullName, invite_token: inviteToken || null } as any,
        }).then(() => {}, (err) => console.error("[Auth] Log error:", err));
      }
      return { error: error as Error | null };
    } catch (err) {
      console.error("[Auth] signUp error:", err);
      return { error: err as Error };
    }
  };

  const signOut = async () => {
    try {
      logSecurityEvent({ type: "logout", severity: "info" });
      await supabase.auth.signOut();
    } catch (err) {
      console.error("[Auth] signOut error:", err);
    }
    // Clear local context immediately so guards redirect.
    if (mounted.current) {
      setSession(null);
      setUser(null);
      setProfile(null);
    }
    // Wipe all client-side state (query cache, workspace selection, RBAC,
    // tenant, in-memory contexts) by forcing a full reload to /auth. This is
    // the only reliable way to fully unmount the AppShell and prevent the
    // previous session's shell/data from surviving the switch.
    try {
      localStorage.removeItem("selected_workspace_id");
      localStorage.removeItem("invite_token");
      sessionStorage.removeItem("invite_token");
    } catch {}
    if (typeof window !== "undefined") {
      window.location.replace("/auth");
    }
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
