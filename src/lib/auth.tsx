import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { bindSupabaseAuthRefreshToAppState, isSupabaseConfigured, supabase } from "./supabase";

type AuthContextValue = {
  configured: boolean;
  initializing: boolean;
  session: Session | null;
  ensureAnonymousSession: () => Promise<Session>;
  sendEmailOtp: (email: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  verifyEmailOtp: (email: string, token: string) => Promise<Session>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [initializing, setInitializing] = useState(isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!supabase) {
      setInitializing(false);
      return undefined;
    }

    const unbindRefresh = bindSupabaseAuthRefreshToAppState();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitializing(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_, nextSession) => {
      setSession(nextSession);
      setInitializing(false);
    });

    return () => {
      subscription.unsubscribe();
      unbindRefresh();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      ensureAnonymousSession,
      initializing,
      sendEmailOtp,
      session,
      signIn,
      signOut,
      signUp,
      verifyEmailOtp
    }),
    [initializing, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return value;
}

async function signIn(email: string, password: string) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    throw error;
  }
}

async function ensureAnonymousSession() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data: currentSession, error: currentSessionError } = await supabase.auth.getSession();

  if (currentSessionError) {
    throw currentSessionError;
  }

  if (currentSession.session) {
    return currentSession.session;
  }

  const { data, error } = await supabase.auth.signInAnonymously();

  if (error) {
    throw error;
  }

  if (!data.session) {
    throw new Error("Could not start a guest session.");
  }

  return data.session;
}

async function sendEmailOtp(email: string) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true
    }
  });

  if (error) {
    throw error;
  }
}

async function verifyEmailOtp(email: string, token: string) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email"
  });

  if (error) {
    throw error;
  }

  if (!data.session) {
    throw new Error("Email verification did not return a session.");
  }

  return data.session;
}

async function signUp(email: string, password: string) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    throw error;
  }
}

async function signOut() {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}
