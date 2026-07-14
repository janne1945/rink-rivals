import { useState, type FormEvent } from "react";

import type {
  AuthCredentials,
  RegistrationCredentials,
} from "../../infrastructure/supabase";
import styles from "./AccountFlow.module.css";

interface AuthScreenProps {
  readonly busy: boolean;
  readonly errorMessage: string;
  readonly successMessage: string;
  readonly onLogin: (credentials: AuthCredentials) => Promise<void>;
  readonly onRegister: (credentials: RegistrationCredentials) => Promise<void>;
}

export function AuthScreen({
  busy,
  errorMessage,
  successMessage,
  onLogin,
  onRegister,
}: AuthScreenProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  function switchMode(nextMode: "login" | "register") {
    if (busy) return;
    setMode(nextMode);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (mode === "register") {
      await onRegister({ email, password, displayName });
      return;
    }
    await onLogin({ email, password });
  }

  return (
    <main className={styles.accountPage}>
      <section className={styles.authCard} aria-labelledby="auth-heading">
        <div className={styles.brandLockup}>
          <span className={styles.brandMark} aria-hidden="true">RR</span>
          <span>Rink Rivals</span>
        </div>
        <p className={styles.eyebrow}>Your club starts here</p>
        <h1 id="auth-heading">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className={styles.intro}>
          Sign in to keep your Collection, Rivalry Points, and lineup tied to your account.
        </p>

        <div className={styles.modeSwitch} role="tablist" aria-label="Account action">
          <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => switchMode("login")}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === "register"} onClick={() => switchMode("register")}>Register</button>
        </div>

        <form className={styles.form} onSubmit={(event) => void submit(event)}>
          {mode === "register" && (
            <label>
              Display name
              <input name="displayName" autoComplete="nickname" minLength={2} required value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </label>
          )}
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>

          {errorMessage && <p className={styles.error} role="alert">{errorMessage}</p>}
          {successMessage && <p className={styles.success} role="status">{successMessage}</p>}
          <button className={styles.primaryButton} type="submit" disabled={busy}>
            {busy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
        <p className={styles.prototypeNote}>Unofficial, non-commercial hockey prototype.</p>
      </section>
      <aside className={styles.authVisual} aria-hidden="true">
        <div className={styles.rinkLines} />
        <p>Build the six.<br /><span>Own the ice.</span></p>
      </aside>
    </main>
  );
}
