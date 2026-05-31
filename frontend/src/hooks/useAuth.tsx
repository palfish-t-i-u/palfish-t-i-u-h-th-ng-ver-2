import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

const REAL_SUPABASE_URL = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "";
const JWT_LIKE = SUPABASE_KEY.split(".").length === 3;
const PUBLISHABLE_LIKE = SUPABASE_KEY.startsWith("sb_publishable_");
const GOOGLE_OAUTH_QUERY_PARAMS = { prompt: "select_account" } as const;
const KEY_PLACEHOLDER =
  !SUPABASE_KEY ||
  SUPABASE_KEY.includes("PASTE_") ||
  SUPABASE_KEY.includes("placeholder");
const IS_DEV_MODE =
  !REAL_SUPABASE_URL.test(SUPABASE_URL) ||
  KEY_PLACEHOLDER ||
  (!JWT_LIKE && !PUBLISHABLE_LIKE);

export interface SignUpMeta {
  full_name: string;
  phone: string;
  department: string;
  team: string;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isDevMode: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null } | void>;
  signUpWithPassword: (
    email: string,
    password: string,
    meta: SignUpMeta
  ) => Promise<{ error: Error | null }>;
  sendPasswordReset: (email: string) => Promise<{ error: Error | null }>;
  verifyOtp: (email: string, token: string) => Promise<{ error: Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function authRedirectUrl() {
  return `${window.location.origin}/`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (IS_DEV_MODE) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function signInWithPassword(email: string, password: string) {
    if (IS_DEV_MODE) {
      setUser({ email } as unknown as User);
      return { error: null };
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: new Error(error.message) };
    return { error: null };
  }

  async function signInWithGoogle() {
    if (IS_DEV_MODE) {
      setUser({ email: "dev@google.local" } as unknown as User);
      return { error: null };
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: authRedirectUrl(),
        queryParams: GOOGLE_OAUTH_QUERY_PARAMS,
      },
    });
    return { error: error ? new Error(error.message) : null };
  }

  async function signUpWithPassword(
    email: string,
    password: string,
    meta: SignUpMeta
  ) {
    if (IS_DEV_MODE) {
      setUser({ email, user_metadata: meta } as unknown as User);
      return { error: null };
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: meta,
        emailRedirectTo: authRedirectUrl(),
      },
    });
    if (error) return { error: new Error(error.message) };
    return { error: null };
  }

  async function sendPasswordReset(email: string) {
    if (IS_DEV_MODE) return { error: null };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return { error: new Error(error.message) };
    return { error: null };
  }

  async function verifyOtp(email: string, token: string) {
    if (IS_DEV_MODE) return { error: null };
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "recovery",
    });
    if (error) return { error: new Error(error.message) };
    if (data.session) {
      setSession(data.session);
      setUser(data.session.user);
    }
    return { error: null };
  }

  async function updatePassword(newPassword: string) {
    if (IS_DEV_MODE) return { error: null };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: new Error(error.message) };
    return { error: null };
  }

  async function signOut() {
    if (IS_DEV_MODE) {
      setUser(null);
      return;
    }
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isDevMode: IS_DEV_MODE,
        signInWithPassword,
        signInWithGoogle,
        signUpWithPassword,
        sendPasswordReset,
        verifyOtp,
        updatePassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
