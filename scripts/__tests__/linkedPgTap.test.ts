import { describe, expect, it } from "vitest";

import { evaluateLinkedPgTapInvocation } from "../lib/linkedPgTap";

function invocation(rows: readonly Record<string, string>[]) {
  return {
    exitCode: 0,
    stderr: "Initialising login role...",
    stdout: JSON.stringify({ rows }),
  };
}

describe("linked Management API pgTAP result evaluation", () => {
  it("accepts a successful fixed-plan suite", () => {
    expect(evaluateLinkedPgTapInvocation(invocation([{ is: "ok 14 - final assertion" }]))).toMatchObject({
      assertionCount: 14,
    });
  });

  it("accepts a successful no-plan suite", () => {
    expect(evaluateLinkedPgTapInvocation(invocation([{ finish: "1..57" }]))).toMatchObject({
      assertionCount: 57,
    });
  });

  it.each([
    "# Looks like you failed 1 test of 57",
    "# Looks like you planned 13 tests but ran 14",
    "not ok 12 - an assertion regressed",
  ])("rejects TAP failure output: %s", (failure) => {
    expect(() => evaluateLinkedPgTapInvocation(invocation([{ finish: failure }]))).toThrow(
      /assertion failure/,
    );
  });

  it("never turns an uncaught database error into a passing expected-error assertion", () => {
    expect(() =>
      evaluateLinkedPgTapInvocation({
        exitCode: 1,
        stderr: "ERROR: P0001: Not enough Credits.",
        stdout: "",
      }),
    ).toThrow(/SQL execution failed/);
  });
});
