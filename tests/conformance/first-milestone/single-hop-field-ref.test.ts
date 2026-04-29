import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gate } from "../../../src/subset-gate.js";
import { emitAralFn } from "../../../src/ir-emit.js";
import { discover } from "../../unit/discovery/harness.js";
import type { AralFn, Expr } from "../../../src/types.js";

describe("conformance — first-milestone — single-hop field reference", () => {
  it("positive: order.subtotal admits as FieldRef and emits valid IR", () => {
    const { sites, diagnostics, checker } = discover(
      `interface Order { total: number; subtotal: number }
       function f(order: Order): Order { return { total: order.subtotal }; }`,
      "Order",
      ["total", "subtotal"],
    );
    assert.equal(diagnostics.length, 0);
    assert.equal(sites.length, 1);
    const result = gate(sites[0], checker);
    assert.equal(result.targets[0].kind, "accepted");

    const fn = emitAralFn(result);
    assert.ok(fn);
    assert.deepEqual(fn!.assigns[0].value, { field: { name: "subtotal" } });
    assert.deepEqual(fn!.inputFields.sort(), ["subtotal", "total"]);
  });

  it("negative: chained-field reference rejects with chained-field-access and a single-hop rewrite hint", () => {
    const { sites, checker } = discover(
      `interface Customer { id: string }
       interface Order { total: number; subtotal: number; customer: Customer }
       function f(order: Order): Order { return { total: (order.customer.id as unknown) as number }; }`,
      "Order",
      ["total", "subtotal", "customer"],
    );
    const result = gate(sites[0], checker);
    const t = result.targets[0];
    assert.equal(t.kind, "rejected");
    if (t.kind !== "rejected") return;
    assert.equal(t.diagnostic.label, "chained-field-access");
    assert.match(t.diagnostic.message, /Order\.total/);
    assert.match(t.diagnostic.message, /chained field references/);
    assert.match(t.diagnostic.suggestion ?? "", /single-hop/);
  });

  it("negative: unknown field rejects with unknown-field and names the missing field", () => {
    const { sites, checker } = discover(
      `interface Order { total: number; subtotal: number }
       function f(order: Order): Order { return { total: ((order as any).totlal) as number }; }`,
      "Order",
      ["total", "subtotal"],
    );
    const result = gate(sites[0], checker);
    const t = result.targets[0];
    assert.equal(t.kind, "rejected");
    if (t.kind !== "rejected") return;
    assert.equal(t.diagnostic.label, "unknown-field");
    assert.match(t.diagnostic.message, /no field 'totlal'/);
    assert.equal(t.diagnostic.suggestion, undefined);
  });

  it("ir round-trip: emitted JSON parses back to a structurally-identical AralFn", () => {
    const { sites, checker } = discover(
      `interface Order { total: number; subtotal: number }
       function f(order: Order): Order { return { total: order.subtotal }; }`,
      "Order",
      ["total", "subtotal"],
    );
    const fn = emitAralFn(gate(sites[0], checker));
    assert.ok(fn);
    const round = JSON.parse(JSON.stringify(fn)) as AralFn;
    assert.deepEqual(round, fn);
    assertFieldRefShape(fn!.assigns[0].value);
  });
});

function assertFieldRefShape(expr: Expr): void {
  assert.ok("field" in expr, `expected field, got ${JSON.stringify(expr)}`);
  if (!("field" in expr)) return;
  assert.equal(typeof expr.field, "object");
  assert.equal(typeof (expr.field as { name: string }).name, "string");
}
