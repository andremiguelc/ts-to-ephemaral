import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gate, type TargetResult } from "../../../src/subset-gate.js";
import { discover } from "../../unit/discovery/harness.js";

function runProbe(snippet: string): TargetResult {
  const { sites, checker } = discover(snippet, "Order", ["total"]);
  const result = gate(sites[0], checker);
  return result.targets[0];
}

function assertAcceptedLit(t: TargetResult, value: number): void {
  assert.equal(t.kind, "accepted", `expected accepted, got ${t.kind}`);
  if (t.kind !== "accepted") return;
  assert.deepEqual(t.cae, { kind: "Lit", value });
}

function assertRejected(t: TargetResult, label: string): void {
  assert.equal(t.kind, "rejected", `expected rejected, got ${t.kind}`);
  if (t.kind !== "rejected") return;
  assert.equal(t.diagnostic.label, label);
}

describe("probes — first-milestone — numeric literal", () => {
  it("(42) admits as Lit(42) — paren stripped", () => {
    assertAcceptedLit(
      runProbe(`interface Order { total: number }
                function f(): Order { return { total: (42) }; }`),
      42,
    );
  });

  it("(((42))) admits as Lit(42) — deep parens stripped", () => {
    assertAcceptedLit(
      runProbe(`interface Order { total: number }
                function f(): Order { return { total: (((42))) }; }`),
      42,
    );
  });

  it("42 as const admits as Lit(42) — as-cast stripped", () => {
    assertAcceptedLit(
      runProbe(`interface Order { total: number }
                function f(): Order { return { total: 42 as const }; }`),
      42,
    );
  });

  it("42 satisfies number admits as Lit(42) — satisfies stripped", () => {
    assertAcceptedLit(
      runProbe(`interface Order { total: number }
                function f(): Order { return { total: 42 satisfies number }; }`),
      42,
    );
  });

  it("+42 (unary plus) rejects — unary operators not yet admitted", () => {
    assertRejected(
      runProbe(`interface Order { total: number }
                function f(): Order { return { total: +42 }; }`),
      "unsupported-expression",
    );
  });

  it("-42 (unary minus) rejects — unary operators not yet admitted", () => {
    assertRejected(
      runProbe(`interface Order { total: number }
                function f(): Order { return { total: -42 }; }`),
      "unsupported-expression",
    );
  });

  it("42.5 (fractional) rejects with unsupported-literal", () => {
    assertRejected(
      runProbe(`interface Order { total: number }
                function f(): Order { return { total: 42.5 }; }`),
      "unsupported-literal",
    );
  });

  it('"42" (string) rejects with unsupported-literal', () => {
    assertRejected(
      runProbe(`interface Order { total: any }
                function f(): Order { return { total: "42" }; }`),
      "unsupported-literal",
    );
  });

  it("`abc` (no-substitution template) rejects with unsupported-literal", () => {
    assertRejected(
      runProbe(
        "interface Order { total: any }\nfunction f(): Order { return { total: `abc` }; }",
      ),
      "unsupported-literal",
    );
  });

  it("`a${1}b` (template expression) rejects with unsupported-literal", () => {
    assertRejected(
      runProbe(
        "interface Order { total: any }\nfunction f(): Order { return { total: `a${1}b` }; }",
      ),
      "unsupported-literal",
    );
  });

  it("42n (BigInt literal) rejects with unsupported-literal", () => {
    assertRejected(
      runProbe(`interface Order { total: any }
                function f(): Order { return { total: 42n }; }`),
      "unsupported-literal",
    );
  });

  it("equivalent: `(42)` and `42 as const` produce the same CAE", () => {
    const a = runProbe(`interface Order { total: number }
                        function f(): Order { return { total: (42) }; }`);
    const b = runProbe(`interface Order { total: number }
                        function f(): Order { return { total: 42 as const }; }`);
    assert.equal(a.kind, "accepted");
    assert.equal(b.kind, "accepted");
    if (a.kind !== "accepted" || b.kind !== "accepted") return;
    assert.deepEqual(a.cae, b.cae);
  });
});
