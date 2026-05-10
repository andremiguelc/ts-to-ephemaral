import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gate, type TargetResult } from "../../../src/subset-gate.js";
import { discover } from "../../unit/discovery/harness.js";

function runProbe(snippet: string): TargetResult {
  const { sites, checker } = discover(snippet, "Order", ["total"]);
  const result = gate(sites[0], checker);
  return result.targets[0];
}

function assertAccepted(t: TargetResult, cae: unknown): void {
  assert.equal(t.kind, "accepted", `expected accepted, got ${t.kind}`);
  if (t.kind !== "accepted") return;
  assert.deepEqual(t.cae, cae);
}

function assertRejected(t: TargetResult, label: string): void {
  assert.equal(t.kind, "rejected", `expected rejected, got ${t.kind}`);
  if (t.kind !== "rejected") return;
  assert.equal(t.diagnostic.label, label);
}

describe("probes — first-milestone — single-assignment const inlining", () => {
  it("two-step chain admits — recursion through both consts", () => {
    assertAccepted(
      runProbe(
        `interface Order { total: number }
         function f(newTotal: number): Order {
           const t = newTotal;
           const u = t;
           return { total: u };
         }`,
      ),
      { kind: "ParamRef", name: "newTotal" },
    );
  });

  it("paren-wrapped initializer admits — stripSugar runs inside the recursion", () => {
    assertAccepted(
      runProbe(
        `interface Order { total: number }
         function f(newTotal: number): Order {
           const t = (newTotal);
           return { total: t };
         }`,
      ),
      { kind: "ParamRef", name: "newTotal" },
    );
  });

  it("a `let` assigned exactly once still rejects — the rule is syntactic, not semantic", () => {
    assertRejected(
      runProbe(
        `interface Order { total: number }
         function f(newTotal: number): Order { let t = newTotal; return { total: t }; }`,
      ),
      "reassignable-binding",
    );
  });

  it("const aliasing a single-hop field reference admits as FieldRef", () => {
    assertAccepted(
      runProbe(
        `interface Order { total: number, subtotal: number }
         function f(order: Order): Order {
           const s = order.subtotal;
           return { total: s };
         }`,
      ),
      { kind: "FieldRef", param: "order", field: "subtotal" },
    );
  });

  it("destructured const binding misses — falls through to unsupported-expression (gap belongs to assignment-patterns)", () => {
    assertRejected(
      runProbe(
        `interface Order { total: number }
         function f(obj: { x: number }): Order {
           const { x } = obj;
           return { total: x };
         }`,
      ),
      "unsupported-expression",
    );
  });

  it("equivalence: const-aliased and direct-reference produce the same CAE", () => {
    const aliased = runProbe(
      `interface Order { total: number }
       function f(newTotal: number): Order { const t = newTotal; return { total: t }; }`,
    );
    const direct = runProbe(
      `interface Order { total: number }
       function f(newTotal: number): Order { return { total: newTotal }; }`,
    );
    assert.equal(aliased.kind, "accepted");
    assert.equal(direct.kind, "accepted");
    if (aliased.kind !== "accepted" || direct.kind !== "accepted") return;
    assert.deepEqual(aliased.cae, direct.cae);
  });
});
