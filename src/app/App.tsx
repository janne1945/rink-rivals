import { lazy, Suspense } from "react";

import { AccountGate } from "../features/account/AccountGate";
import { createAccountRepository, createAuthService } from "../infrastructure/supabase";
import styles from "./App.module.css";

const GameApp = lazy(async () => {
  const module = await import("./GameApp");
  return { default: module.GameApp };
});

const cloudServices = (() => {
  try {
    return {
      ready: true as const,
      accountRepository: createAccountRepository(),
      authService: createAuthService(),
    };
  } catch (error) {
    console.error(error);
    return {
      ready: false as const,
      message: error instanceof Error
        ? error.message
        : "Rink Rivals could not start because the server configuration is invalid.",
    };
  }
})();

export function App() {
  if (!cloudServices.ready) {
    return (
      <main className={styles.loading}>
        <section className={styles.fatal} role="alert" aria-labelledby="configuration-error-heading">
          <p>Configuration required</p>
          <h1 id="configuration-error-heading">Rink Rivals could not start</h1>
          <p>{cloudServices.message}</p>
          <p>The deployment needs a Supabase URL and a publishable browser key.</p>
        </section>
      </main>
    );
  }

  return (
    <AccountGate auth={cloudServices.authService} repository={cloudServices.accountRepository}>
      {(account, actions) => (
        <Suspense fallback={<GameLoading />}>
          <GameApp account={account} actions={actions} />
        </Suspense>
      )}
    </AccountGate>
  );
}

function GameLoading() {
  return (
    <main className={styles.loading}>
      <div><div className={styles.puck} /><h1>Preparing the rink</h1><p>Loading the game catalog…</p></div>
    </main>
  );
}
