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
const KEY_PLACEHOLDER =
  !SUPABASE_KEY ||
  SUPABASE_KEY.includes("PASTE_") ||
  SUPABASE_KEY.includes("placeholder");
const IS_DEV_MODE =
  !REAL_SUPABASE_URL.test(SUPABASE_URL) ||
  KEY_PLACEHOLDER ||
  (!JWT_LIKE && !PUBLISHABLE_LIKE);

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isDevMode: boolean;
  signInWithEmail: (email: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null } | void>;
  signUp: (
    email: string,
    meta: { full_name: string; phone: string; team: string }
  ) => Promise<{ error: Error | null; sessionReady?: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** OAuth / magic link must return to current origin (localhost vs Vercel). */
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

  async function signInWithEmail(email: string) {
    if (IS_DEV_MODE) {
      setUser({ email } as unknown as User);
      return { error: null };
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: authRedirectUrl(),
      },
    });
    return { error: error ? new Error(error.message) : null };
  }

  async function signInWithGoogle() {
    if (IS_DEV_MODE) {
      setUser({ email: "dev@google.local" } as unknown as User);
      return { error: null };
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: authRedirectUrl() },
    });
    return { error: error ? new Error(error.message) : null };
  }

  async function signUp(
    email: string,
    meta: { full_name: string; phone: string; team: string }
  ) {
    if (IS_DEV_MODE) {
      setUser({ email, user_metadata: meta } as unknown as User);
      return { error: null, sessionReady: true };
    }
    try {
      const { data, error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          data: meta,
          emailRedirectTo: authRedirectUrl(),
        },
      });
      if (error) {
        const raw = error.message || "";
        let msg = raw;
        if (/rate.?limit|too many/i.test(raw)) {
          msg = "Hệ thống đang giới hạn gửi email. Vui lòng thử lại sau ít phút hoặc dùng nút Google ở trên.";
        } else if (/smtp|send|deliver|confirmation|email/i.test(raw)) {
          msg = "Không gửi được email xác thực. Vui lòng dùng nút Đăng ký bằng Google ở trên.";
        }
        return { error: new Error(msg) };
      }
      const session = (data as { session?: Session | null }).session;
      if (session?.user) {
        setSession(session);
        setUser(session.user);
        return { error: null, sessionReady: true };
      }
      return { error: null, sessionReady: false };
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      return { error: new Error(`Lỗi đăng ký: ${m}. Hãy thử Google.`) };
    }
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
        signInWithEmail,
        signInWithGoogle,
        signUp,
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
