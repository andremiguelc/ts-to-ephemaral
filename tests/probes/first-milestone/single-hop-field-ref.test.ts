import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gate, type TargetResult } from "../../../src/subset-gate.js";
import { discover } from "../../unit/discovery/harness.js";

function runProbe(snippet: string): TargetResult {
  const { sites, checker } = discover(snippet, "Order", ["total", "subtotal"]);
  const result = gate(sites[0], checker);
  return result.targets[0];
}

function assertAcceptedFieldRef(t: TargetResult, param: string, field: string): void {
  assert.equal(t.kind, "accepted", `expected accepted, got ${t.kind}`);
  if (t.kind !== "accepted") return;
  assert.deepEqual(t.cae, { kind: "FieldRef", param, field });
}

function assertRejected(t: TargetResult, label: string): void {
  assert.equal(t.kind, "rejected", `expected rejected, got ${t.kind}`);
  if (t.kind !== "rejected") return;
  assert.equal(t.diagnostic.label, label);
}

describe("probes — first-milestone — single-hop field reference", () => {
  it("(order.subtotal) admits — paren stripped", () => {
    assertAcceptedFieldRef(
      runProbe(
        `interface Order { total: number; subtotal: number }
         function f(order: Order): Order { return { total: (order.subtotal) }; }`,
      ),
      "order",
      "subtotal",
    );
  });

  it("order.subtotal as number admits — as-cast stripped", () => {
    assertAcceptedFieldRef(
      runProbe(
        `interface Order { total: number; subtotal: number }
         function f(order: Order): Order { return { total: order.subtotal as number }; }`,
      ),
      "order",
      "subtotal",
    );
  });

  it("order.customer.id rejects with chained-field-access", () => {
    assertRejected(
      runProbe(
        `interface Customer { id: string }
         interface Order { total: number; subtotal: number; customer: Customer }
         function f(order: Order): Order { return { total: (order.customer.id as unknown) as number }; }`,
      ),
      "chained-field-access",
    );
  });

  it("order['subtotal'] (bracket access) falls through to unsupported-expression", () => {
    assertRejected(
      runProbe(
        `interface Order { total: number; subtotal: number }
         function f(order: Order): Order { return { total: order['subtotal'] }; }`,
      ),
      "unsupported-expression",
    );
  });

  it("order.totlal (typo) rejects with unknown-field", () => {
    assertRejected(
      runProbe(
        `interface Order { total: number; subtotal: number }
         function f(order: Order): Order { return { total: ((order as any).totlal) as number }; }`,
      ),
      "unknown-field",
    );
  });

  it("an identifier in value position is not field-ref's concern", () => {
    // A bare identifier is not a property access; field-ref misses and the
    // dispatcher hands off to the next recognizer. With param-ref admitted,
    // this primitive number parameter now accepts cleanly.
    const t = runProbe(
      `interface Order { total: number; subtotal: number }
       function f(order: Order, x: number): Order { return { total: x }; }`,
    );
    assert.equal(t.kind, "accepted");
  });

  it("renamed import on the input parameter type still resolves by symbol identity", () => {
    // TypeScript imports the type under a different name; the parameter still has the same symbol.
    // Recognizer resolves to the parameter and admits.
    assertAcceptedFieldRef(
      runProbe(
        `interface Order { total: number; subtotal: number }
         type Renamed = Order;
         function f(order: Renamed): Order { return { total: order.subtotal }; }`,
      ),
      "order",
      "subtotal",
    );
  });

  it("equivalent: order.subtotal and (order.subtotal) produce the same CAE", () => {
    const a = runProbe(
      `interface Order { total: number; subtotal: number }
       function f(order: Order): Order { return { total: order.subtotal }; }`,
    );
    const b = runProbe(
      `interface Order { total: number; subtotal: number }
       function f(order: Order): Order { return { total: (order.subtotal) }; }`,
    );
    assert.equal(a.kind, "accepted");
    assert.equal(b.kind, "accepted");
    if (a.kind !== "accepted" || b.kind !== "accepted") return;
    assert.deepEqual(a.cae, b.cae);
  });
});
