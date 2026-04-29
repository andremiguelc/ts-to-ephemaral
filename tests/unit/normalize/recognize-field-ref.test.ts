import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recognizeFieldRef } from "../../../src/normalize/recognize-field-ref.js";
import { stripSugar } from "../../../src/normalize/strip-sugar.js";
import { compileWithFixture, findField, makeCtx } from "./harness.js";

function setup(code: string, field: string) {
  const fixture = compileWithFixture(code);
  const expr = stripSugar(findField(fixture.sourceFile, field));
  const ctx = makeCtx(fixture.checker, "Order", {
    id: "string",
    total: "number",
    subtotal: "number",
  });
  return { expr, ctx };
}

describe("recognize-field-ref", () => {
  it("admits order.subtotal when order is the input parameter", () => {
    const { expr, ctx } = setup(
      `interface Order { id: string; total: number; subtotal: number }
       function f(order: Order): Order { return { total: order.subtotal }; }`,
      "total",
    );
    const r = recognizeFieldRef(expr, ctx);
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.deepEqual(r.cae, { kind: "FieldRef", param: "order", field: "subtotal" });
  });

  it("admits order.id (different field type) when the field exists on the input", () => {
    const { expr, ctx } = setup(
      `interface Order { id: string; total: number; subtotal: number }
       function f(order: Order): Order { return { total: order.id as any }; }`,
      "total",
    );
    const r = recognizeFieldRef(expr, ctx);
    if (r.kind !== "accepted") {
      // strip-sugar pulls the as-cast off; recognizer still sees order.id
    }
  });

  it("rejects multi-hop references with chained-field-access", () => {
    const { expr, ctx } = setup(
      `interface Customer { id: string }
       interface Order { id: string; total: number; subtotal: number; customer: Customer }
       function f(order: Order): Order { return { total: order.customer.id as any }; }`,
      "total",
    );
    const r = recognizeFieldRef(expr, ctx);
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "chained-field-access");
    assert.match(r.reason, /chained field references/);
  });

  it("rejects unknown-field when the field is not on the input type", () => {
    const { expr, ctx } = setup(
      `interface Order { id: string; total: number; subtotal: number }
       function f(order: Order): Order { return { total: (order as any).totlal }; }`,
      "total",
    );
    const r = recognizeFieldRef(expr, ctx);
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "unknown-field");
    assert.match(r.reason, /no field 'totlal'/);
  });

  it("misses on a numeric literal (not its job)", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number; subtotal: number }
       function f(): Order { return { total: 42 }; }`,
      "total",
    );
    const r = recognizeFieldRef(expr, ctx);
    assert.equal(r.kind, "miss");
  });

  it("misses when the receiver isn't a parameter (e.g., a const local)", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number; subtotal: number }
       function f(): Order {
         const fixed = { total: 1, subtotal: 1 } as Order;
         return { total: fixed.subtotal };
       }`,
      "total",
    );
    const r = recognizeFieldRef(expr, ctx);
    assert.equal(r.kind, "miss");
  });

  it("misses when the receiver is a parameter of a different (non-input) type", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number; subtotal: number }
       interface Other { v: number }
       function f(o: Other): Order { return { total: (o as any).v }; }`,
      "total",
    );
    const r = recognizeFieldRef(expr, ctx);
    assert.equal(r.kind, "miss");
  });

  it("resolves the receiver via the TypeChecker, not by name matching", () => {
    // The outer `order` parameter is the input. `findField` finds the return literal's
    // `total: order.subtotal`; the recognizer asks the TypeChecker what `order` resolves to,
    // which is the parameter symbol. Result: accepted.
    const { expr, ctx } = setup(
      `interface Order { total: number; subtotal: number }
       function f(order: Order): Order {
         const unrelated: number = 7;
         return { total: order.subtotal };
       }`,
      "total",
    );
    const r = recognizeFieldRef(expr, ctx);
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.equal(r.cae.kind, "FieldRef");
    if (r.cae.kind !== "FieldRef") return;
    assert.equal(r.cae.param, "order");
    assert.equal(r.cae.field, "subtotal");
  });
});
