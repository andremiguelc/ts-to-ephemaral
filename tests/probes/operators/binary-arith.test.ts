import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gate, type TargetResult } from "../../../src/subset-gate.js";
import { discover } from "../../unit/discovery/harness.js";

function runProbe(snippet: string): TargetResult {
  const { sites, checker } = discover(snippet, "Order", ["total"]);
  return gate(sites[0], checker).targets[0];
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

describe("probes — operators — binary arithmetic", () => {
  it("paren-wrapped arithmetic admits — (a + b) and a + b produce identical CAEs", () => {
    const inner = runProbe(
      `interface Order { total: number }
       function f(a: number, b: number): Order { return { total: a + b }; }`,
    );
    const wrapped = runProbe(
      `interface Order { total: number }
       function f(a: number, b: number): Order { return { total: (a + b) }; }`,
    );
    assert.equal(inner.kind, "accepted");
    assert.equal(wrapped.kind, "accepted");
    if (inner.kind !== "accepted" || wrapped.kind !== "accepted") return;
    assert.deepEqual(inner.cae, wrapped.cae);
  });

  it("precedence: a + b * c groups multiplication tighter than addition (AST encodes precedence)", () => {
    assertAccepted(
      runProbe(
        `interface Order { total: number }
         function f(a: number, b: number, c: number): Order { return { total: a + b * c }; }`,
      ),
      {
        kind: "Arith",
        op: "add",
        left: { kind: "ParamRef", name: "a" },
        right: {
          kind: "Arith",
          op: "mul",
          left: { kind: "ParamRef", name: "b" },
          right: { kind: "ParamRef", name: "c" },
        },
      },
    );
  });

  it("const-aliased arithmetic admits — const c = a + 1; return c * 2 composes through admission 5", () => {
    assertAccepted(
      runProbe(
        `interface Order { total: number }
         function f(a: number): Order {
           const c = a + 1;
           return { total: c * 2 };
         }`,
      ),
      {
        kind: "Arith",
        op: "mul",
        left: {
          kind: "Arith",
          op: "add",
          left: { kind: "ParamRef", name: "a" },
          right: { kind: "Lit", value: 1 },
        },
        right: { kind: "Lit", value: 2 },
      },
    );
  });

  it("string concat probe — 'x' + a rejects on arith-on-string", () => {
    assertRejected(
      runProbe(
        `interface Order { total: number }
         function f(a: number): Order { return { total: ("x" + a) as any }; }`,
      ),
      "arith-on-string",
    );
  });

  it("modulo probe — a % b rejects with unsupported-operator (not the catch-all)", () => {
    assertRejected(
      runProbe(
        `interface Order { total: number }
         function f(a: number, b: number): Order { return { total: a % b }; }`,
      ),
      "unsupported-operator",
    );
  });

  it("comparison sneaks through arith's bay — a < b stays unsupported-expression (admission belongs to operators stage's next step, not this one)", () => {
    assertRejected(
      runProbe(
        `interface Order { total: number }
         function f(a: number, b: number): Order { return { total: (a < b) as any }; }`,
      ),
      "unsupported-expression",
    );
  });

  it("field-ref operands compose — order.total + order.subtotal admits", () => {
    assertAccepted(
      runProbe(
        `interface Order { total: number, subtotal: number }
         function f(order: Order): Order { return { total: order.total + order.subtotal, subtotal: 0 }; }`,
      ),
      {
        kind: "Arith",
        op: "add",
        left: { kind: "FieldRef", param: "order", field: "total" },
        right: { kind: "FieldRef", param: "order", field: "subtotal" },
      },
    );
  });
});
