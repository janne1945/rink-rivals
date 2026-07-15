import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

export interface AuthCredentials {
  readonly email: string;
  readonly password: string;
}

export interface RegistrationCredentials extends AuthCredentials {
  readonly displayName: string;
  readonly redirectTo?: string;
}

export type AuthStateListener = (
  event: AuthChangeEvent,
  session: Session | null,
) => void;

export interface AuthService {
  restoreSession(): Promise<Session | null>;
  subscribe(listener: AuthStateListener): () => void;
  register(credentials: RegistrationCredentials): Promise<Session | null>;
  login(credentials: AuthCredentials): Promise<Session>;
  logout(): Promise<void>;
}

function throwAuthError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export class SupabaseAuthService implements AuthService {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async restoreSession(): Promise<Session | null> {
    const { data, error } = await this.client.auth.getSession();
    throwAuthError(error);
    return data.session;
  }

  subscribe(listener: AuthStateListener): () => void {
    const { data } = this.client.auth.onAuthStateChange(listener);
    return () => data.subscription.unsubscribe();
  }

  async register({ email, password, displayName, redirectTo }: RegistrationCredentials): Promise<Session | null> {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName.trim() }, emailRedirectTo: redirectTo },
    });
    throwAuthError(error);
    return data.session;
  }

  async login(credentials: AuthCredentials): Promise<Session> {
    const { data, error } = await this.client.auth.signInWithPassword(credentials);
    throwAuthError(error);
    if (!data.session) throw new Error("Supabase returned no session after login.");
    return data.session;
  }

  async logout(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    throwAuthError(error);
  }
}
