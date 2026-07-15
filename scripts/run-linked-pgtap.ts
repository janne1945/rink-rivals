import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { evaluateLinkedPgTapInvocation } from "./lib/linkedPgTap";

const testsDirectory = fileURLToPath(new URL("../supabase/tests/", import.meta.url));
const requestedFiles = process.argv.slice(2).filter((argument) => argument !== "--");
const testFiles = (requestedFiles.length > 0
  ? requestedFiles
  : readdirSync(testsDirectory).filter((fileName) => fileName.endsWith(".sql")))
  .map((fileName) => fileName.replace(/^supabase\/tests\//, ""))
  .sort();

let assertionTotal = 0;

for (const fileName of testFiles) {
  const testPath = `${testsDirectory}/${fileName}`;
  const invocation = spawnSync(
    "supabase",
    ["--output-format", "json", "db", "query", "--linked", "--file", testPath],
    { encoding: "utf8" },
  );

  try {
    const result = evaluateLinkedPgTapInvocation({
      exitCode: invocation.status,
      stdout: invocation.stdout,
      stderr: invocation.stderr,
    });
    assertionTotal += result.assertionCount;
    console.log(`PASS ${fileName} (${result.assertionCount} assertions)`);
  } catch (error) {
    console.error(`FAIL ${fileName}`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    break;
  }
}

if (!process.exitCode) {
  console.log(`Linked Management API pgTAP fallback passed: ${testFiles.length} files, ${assertionTotal} assertions.`);
}
