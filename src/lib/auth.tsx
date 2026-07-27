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
  signOutLocally: () => Promise<void>;
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
      signOutLocally,
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
    throw new Error(friendlyAuthMessage(error, "Could not sign in."));
  }
}

async function ensureAnonymousSession() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data: currentSession, error: currentSessionError } = await supabase.auth.getSession();

  if (currentSessionError) {
    throw new Error(friendlyAuthMessage(currentSessionError, "Could not check the current session."));
  }

  if (currentSession.session) {
    return currentSession.session;
  }

  const { data, error } = await supabase.auth.signInAnonymously();

  if (error) {
    throw new Error(friendlyAuthMessage(error, "Could not start a guest session."));
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
    throw new Error(
      friendlyAuthMessage(
        error,
        "Could not send the verification code."
      )
    );
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
    throw new Error(friendlyAuthMessage(error, "Could not verify that code."));
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
    throw new Error(friendlyAuthMessage(error, "Could not sign up."));
  }
}

async function signOut() {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(friendlyAuthMessage(error, "Could not sign out."));
  }
}

async function signOutLocally() {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.auth.signOut({ scope: "local" });

  if (error) {
    throw new Error(friendlyAuthMessage(error, "Could not clear the local session."));
  }
}

type AuthErrorDetails = {
  code?: string;
  message?: string;
  status?: number;
};

function friendlyAuthMessage(error: unknown, fallback: string) {
  const details = authErrorDetails(error);
  const searchable = [details.code, details.message].filter(Boolean).join(" ").toLowerCase();

  if (details.status === 500 || searchable.includes("unexpected_failure")) {
    return (
      "Supabase could not send the verification email. Check Auth email/SMTP settings, " +
      "sender verification, and provider logs, then try sending the code again."
    );
  }

  if (details.status === 429 || searchable.includes("rate limit")) {
    return "Please wait a minute before requesting another verification code.";
  }

  if (
    searchable.includes("anonymous_provider_disabled") ||
    (searchable.includes("anonymous") && searchable.includes("disabled"))
  ) {
    return (
      "Guest queue entry needs Anonymous sign-ins enabled in Supabase Auth. " +
      "Enable Anonymous sign-ins in the Supabase dashboard, then try joining again."
    );
  }

  if (searchable.includes("email address not authorized")) {
    return "Supabase is not allowed to email this address yet. Configure custom SMTP or use an authorized project team email.";
  }

  if (searchable.includes("otp") && (searchable.includes("expired") || searchable.includes("invalid"))) {
    return "That verification code is invalid or expired. Request a new code and try again.";
  }

  if (details.message && !looksLikeSerializedResponse(details.message)) {
    return details.message;
  }

  return fallback;
}

function authErrorDetails(error: unknown): AuthErrorDetails {
  const directDetails = detailsFromRecord(error);

  if (error instanceof Error && error.message) {
    const parsedDetails = detailsFromSerializedMessage(error.message);
    return {
      code: directDetails.code ?? parsedDetails.code,
      message: directDetails.message ?? parsedDetails.message ?? error.message,
      status: directDetails.status ?? parsedDetails.status
    };
  }

  if (typeof error === "string") {
    const parsedDetails = detailsFromSerializedMessage(error);
    return {
      ...parsedDetails,
      message: parsedDetails.message ?? error
    };
  }

  return directDetails;
}

function detailsFromSerializedMessage(message: string): AuthErrorDetails {
  try {
    return detailsFromRecord(JSON.parse(message));
  } catch {
    return {};
  }
}

function detailsFromRecord(value: unknown): AuthErrorDetails {
  if (!isRecord(value)) {
    return {};
  }

  const headers = isRecord(value.headers) ? value.headers : null;
  const headerMap = headers && isRecord(headers.map) ? headers.map : null;

  return {
    code: stringValue(value, "code") ?? stringValue(value, "error_code") ?? stringValue(headerMap, "x-sb-error-code"),
    message: stringValue(value, "message") ?? stringValue(value, "msg") ?? stringValue(value, "error"),
    status: numberValue(value, "status")
  };
}

function looksLikeSerializedResponse(message: string) {
  const trimmed = message.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function stringValue(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" ? value : undefined;
}
