import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

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

  const fetchUserData = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, email, avatar_url")
      .eq("id", userId)
      .maybeSingle();
    if (data) setProfile(data);
  };

  useEffect(() => {
    // IMPORTANT: restore session first, then listen for changes
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchUserData(session.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => fetchUserData(session.user.id), 0);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    // Log auth event
    if (!error) {
      supabase.from("backend_event_logs").insert({
        table_name: "auth", action: "LOGIN", payload: { email } as any,
      }).then();
    } else {
      supabase.from("backend_event_logs").insert({
        table_name: "auth", action: "LOGIN_FAILED", payload: { email, reason: error.message } as any,
      }).then();
    }
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    // Check for pending invite token to pass to backend trigger
    const inviteToken = localStorage.getItem("invite_token") || sessionStorage.getItem("invite_token") || undefined;
    console.log("TOKEN NO SIGNUP:", inviteToken);
    const metadata: Record<string, string> = { full_name: fullName };
    if (inviteToken) {
      metadata.invite_token = inviteToken;
    }
    console.log("SIGNUP METADATA:", JSON.stringify(metadata));
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
        emailRedirectTo: window.location.origin,
      },
    });
    // Log signup event
    if (!error) {
      supabase.from("backend_event_logs").insert({
        table_name: "auth", action: "SIGNUP", payload: { email, full_name: fullName, invite_token: inviteToken || null } as any,
      }).then();
    }
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
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
