import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gate, type TargetResult } from "../../../src/subset-gate.js";
import { discover } from "../../unit/discovery/harness.js";

function runProbe(snippet: string): TargetResult {
  const { sites, checker } = discover(snippet, "Order", ["total"]);
  const result = gate(sites[0], checker);
  return result.targets[0];
}

function assertAcceptedParamRef(t: TargetResult, name: string): void {
  assert.equal(t.kind, "accepted", `expected accepted, got ${t.kind}`);
  if (t.kind !== "accepted") return;
  assert.deepEqual(t.cae, { kind: "ParamRef", name });
}

function assertRejected(t: TargetResult, label: string): void {
  assert.equal(t.kind, "rejected", `expected rejected, got ${t.kind}`);
  if (t.kind !== "rejected") return;
  assert.equal(t.diagnostic.label, label);
}

describe("probes — first-milestone — bare primitive parameter reference", () => {
  it("(x) admits — paren stripped", () => {
    assertAcceptedParamRef(
      runProbe(
        `interface Order { total: number }
         function f(x: number): Order { return { total: (x) }; }`,
      ),
      "x",
    );
  });

  it("x as number admits — as-cast stripped", () => {
    assertAcceptedParamRef(
      runProbe(
        `interface Order { total: number }
         function f(x: number): Order { return { total: x as number }; }`,
      ),
      "x",
    );
  });

  it("default-valued parameter admits", () => {
    assertAcceptedParamRef(
      runProbe(
        `interface Order { total: number }
         function f(x: number = 0): Order { return { total: x }; }`,
      ),
      "x",
    );
  });

  it("inner shadow: TypeChecker resolves to the inner const, not the outer parameter", () => {
    // The outer x is a parameter; the inner x is a const. The return is in the
    // inner block, so the symbol resolves to the const — not a parameter. With
    // const inlining in the dispatcher, the inner `const x = 42` admits as
    // Lit(42), confirming that resolution went to the inner binding (a Lit),
    // not the outer parameter (which would have produced ParamRef("x")).
    const t = runProbe(
      `interface Order { total: number }
       function f(x: number): Order {
         {
           const x = 42;
           return { total: x };
         }
       }`,
    );
    assert.equal(t.kind, "accepted");
    if (t.kind !== "accepted") return;
    assert.deepEqual(t.cae, { kind: "Lit", value: 42 });
  });

  it("identifier resolving to a top-level function declaration misses (not a parameter)", () => {
    assertRejected(
      runProbe(
        `interface Order { total: number }
         function helper(): number { return 1 }
         function f(): Order { return { total: helper as any }; }`,
      ),
      "unsupported-expression",
    );
  });

  it("destructured-parameter binding (known gap) misses with unsupported-expression", () => {
    // Per the plan: destructured params resolve to BindingElement, not Parameter.
    // Documented gap — admission belongs to a follow-up construct, not this one.
    assertRejected(
      runProbe(
        `interface Order { total: number }
         function f({ x }: { x: number }): Order { return { total: x }; }`,
      ),
      "unsupported-expression",
    );
  });

  it("type asked at the use site, not the declaration: a narrowing throw guard lets a once-nullable parameter admit", () => {
    // The recognizer asks the TypeChecker for the type *at the identifier's
    // use position*. After `if (x === undefined) throw`, the checker has
    // narrowed `x` to `number` at the return — so we admit. The parser does
    // not read the guard itself; it trusts the checker's narrowing.
    assertAcceptedParamRef(
      runProbe(
        `interface Order { total: number }
         function f(x: number | undefined): Order {
           if (x === undefined) throw new Error("nope");
           return { total: x };
         }`,
      ),
      "x",
    );
  });

  it("a nullable parameter without narrowing still rejects", () => {
    assertRejected(
      runProbe(
        `interface Order { total: number }
         function f(x: number | null): Order { return { total: x as number }; }`,
      ),
      "nullable-parameter",
    );
  });

  it("equivalent: x and (x) produce the same CAE", () => {
    const a = runProbe(
      `interface Order { total: number }
       function f(x: number): Order { return { total: x }; }`,
    );
    const b = runProbe(
      `interface Order { total: number }
       function f(x: number): Order { return { total: (x) }; }`,
    );
    assert.equal(a.kind, "accepted");
    assert.equal(b.kind, "accepted");
    if (a.kind !== "accepted" || b.kind !== "accepted") return;
    assert.deepEqual(a.cae, b.cae);
  });
});
