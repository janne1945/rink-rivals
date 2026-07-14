import { loadEnv } from "vite";

import { validateClientEnvironment } from "../src/infrastructure/supabase/environment";

const mode = process.env.NODE_ENV === "development" ? "development" : "production";
const environment = {
  ...loadEnv(mode, process.cwd(), "VITE_"),
  ...process.env,
};
const result = validateClientEnvironment(environment);
if (!result.valid) {
  console.error(result.message);
  process.exitCode = 1;
} else {
  console.log("Client environment check passed for Supabase URL and publishable key.");
}
