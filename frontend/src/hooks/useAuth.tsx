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
const DEV_USER_KEY = "dev_user";

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
  /** True after magic-link recovery or verifyOtp(recovery) — user may set a new password */
  passwordRecovery: boolean;
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
  clearPasswordRecovery: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function authRedirectUrl() {
  return `${window.location.origin}/`;
}

function passwordResetRedirectUrl() {
  return `${window.location.origin}/forgot-password`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    if (IS_DEV_MODE) {
      const saved = localStorage.getItem(DEV_USER_KEY);
      if (saved) setUser(JSON.parse(saved) as User);
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(prev => prev?.id === s?.user?.id ? prev : (s?.user ?? null));
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function signInWithPassword(email: string, password: string) {
    if (IS_DEV_MODE) {
      const devUser = { email } as unknown as User;
      setUser(devUser);
      localStorage.setItem(DEV_USER_KEY, JSON.stringify(devUser));
      return { error: null };
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: new Error(error.message) };
    return { error: null };
  }

  async function signInWithGoogle() {
    if (IS_DEV_MODE) {
      const devUser = { email: "dev@google.local" } as unknown as User;
      setUser(devUser);
      localStorage.setItem(DEV_USER_KEY, JSON.stringify(devUser));
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
      const devUser = { email, user_metadata: meta } as unknown as User;
      setUser(devUser);
      localStorage.setItem(DEV_USER_KEY, JSON.stringify(devUser));
      return { error: null };
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { ...meta, is_activated: false },
        emailRedirectTo: authRedirectUrl(),
      },
    });
    if (error) return { error: new Error(error.message) };
    return { error: null };
  }

  async function sendPasswordReset(email: string) {
    if (IS_DEV_MODE) return { error: null };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: passwordResetRedirectUrl(),
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
      setPasswordRecovery(true);
    }
    return { error: null };
  }

  async function updatePassword(newPassword: string) {
    if (IS_DEV_MODE) return { error: null };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: new Error(error.message) };
    setPasswordRecovery(false);
    return { error: null };
  }

  function clearPasswordRecovery() {
    setPasswordRecovery(false);
  }

  async function signOut() {
    if (IS_DEV_MODE) {
      setUser(null);
      setPasswordRecovery(false);
      localStorage.removeItem(DEV_USER_KEY);
      return;
    }
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setPasswordRecovery(false);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isDevMode: IS_DEV_MODE,
        passwordRecovery,
        signInWithPassword,
        signInWithGoogle,
        signUpWithPassword,
        sendPasswordReset,
        verifyOtp,
        updatePassword,
        clearPasswordRecovery,
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
