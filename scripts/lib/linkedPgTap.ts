export type LinkedPgTapInvocation = {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

export type LinkedPgTapResult = {
  readonly assertionCount: number;
  readonly tapLines: readonly string[];
};

type QueryPayload = {
  readonly rows?: readonly Record<string, unknown>[];
};

function extractTapLines(stdout: string): string[] {
  let payload: QueryPayload;
  try {
    payload = JSON.parse(stdout) as QueryPayload;
  } catch {
    throw new Error(`Linked pgTAP runner returned invalid JSON: ${stdout.trim() || "<empty>"}`);
  }

  if (!Array.isArray(payload.rows)) {
    throw new Error("Linked pgTAP runner returned no SQL result rows.");
  }

  return payload.rows.flatMap((row) =>
    Object.values(row).filter((value): value is string => typeof value === "string"),
  );
}

export function evaluateLinkedPgTapInvocation(invocation: LinkedPgTapInvocation): LinkedPgTapResult {
  if (invocation.exitCode !== 0) {
    const detail = [invocation.stderr.trim(), invocation.stdout.trim()].filter(Boolean).join("\n");
    throw new Error(`Linked pgTAP SQL execution failed.${detail ? `\n${detail}` : ""}`);
  }

  const tapLines = extractTapLines(invocation.stdout);
  const failure = tapLines.find((line) =>
    line.startsWith("not ok ") || line.startsWith("# Looks like "),
  );
  if (failure) {
    throw new Error(`Linked pgTAP assertion failure: ${failure}`);
  }

  const plan = tapLines
    .map((line) => /^1\.\.(\d+)$/.exec(line))
    .find((match): match is RegExpExecArray => match !== null);
  const lastAssertion = tapLines
    .map((line) => /^ok (\d+)(?:\s|$)/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .at(-1);
  const assertionCount = Number(plan?.[1] ?? lastAssertion?.[1]);

  if (!Number.isInteger(assertionCount) || assertionCount < 1) {
    throw new Error(`Linked pgTAP runner returned no successful TAP plan or assertion: ${tapLines.join(" | ")}`);
  }

  return { assertionCount, tapLines };
}
