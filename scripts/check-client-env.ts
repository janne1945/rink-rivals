import { validateClientEnvironment } from "../src/infrastructure/supabase/environment";

const result = validateClientEnvironment(process.env);
if (!result.valid) {
  console.error(result.message);
  process.exitCode = 1;
} else {
  console.log("Client environment check passed for Supabase URL and publishable key.");
}
