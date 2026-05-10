import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recognizeInlineConst } from "../../../src/normalize/inline-consts.js";
import { stripSugar } from "../../../src/normalize/strip-sugar.js";
import { compileWithFixture, findField, makeCtx } from "./harness.js";

function setup(code: string, field: string) {
  const fixture = compileWithFixture(code);
  const expr = stripSugar(findField(fixture.sourceFile, field));
  const ctx = makeCtx(fixture.checker, "Order", {
    total: "number",
    subtotal: "number",
    id: "number",
  });
  return { expr, ctx };
}

describe("recognize-inline-const", () => {
  it("admits a const aliasing a parameter — returns the initializer's CAE (ParamRef)", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number }
       function f(newTotal: number): Order { const t = newTotal; return { total: t }; }`,
      "total",
    );
    const r = recognizeInlineConst(expr, ctx);
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.deepEqual(r.cae, { kind: "ParamRef", name: "newTotal" });
  });

  it("admits a const aliasing a field reference — returns FieldRef", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number, subtotal: number }
       function f(order: Order): Order { const t = order.subtotal; return { total: t, subtotal: order.subtotal }; }`,
      "total",
    );
    const r = recognizeInlineConst(expr, ctx);
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.deepEqual(r.cae, { kind: "FieldRef", param: "order", field: "subtotal" });
  });

  it("admits a const aliasing a numeric literal — returns Lit", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number }
       function f(): Order { const t = 42; return { total: t }; }`,
      "total",
    );
    const r = recognizeInlineConst(expr, ctx);
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.deepEqual(r.cae, { kind: "Lit", value: 42 });
  });

  it("admits a chain — const u = t; const t = newTotal — recursing through both", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number }
       function f(newTotal: number): Order {
         const t = newTotal;
         const u = t;
         return { total: u };
       }`,
      "total",
    );
    const r = recognizeInlineConst(expr, ctx);
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.deepEqual(r.cae, { kind: "ParamRef", name: "newTotal" });
  });

  it("rejects reassignable-binding when the binding is `let`", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number }
       function f(newTotal: number): Order { let t = newTotal; return { total: t }; }`,
      "total",
    );
    const r = recognizeInlineConst(expr, ctx);
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "reassignable-binding");
  });

  it("rejects reassignable-binding when the binding is `var`", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number }
       function f(newTotal: number): Order { var t = newTotal; return { total: t }; }`,
      "total",
    );
    const r = recognizeInlineConst(expr, ctx);
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "reassignable-binding");
  });

  it("propagates the initializer's rejection — string literal const carries unsupported-literal through", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number }
       function f(): Order { const t = "x"; return { total: t as any }; }`,
      "total",
    );
    const r = recognizeInlineConst(expr, ctx);
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "unsupported-literal");
  });

  it("misses on a destructured binding — falls through to the dispatcher", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number }
       function f(obj: { x: number }): Order { const { x } = obj; return { total: x }; }`,
      "total",
    );
    const r = recognizeInlineConst(expr, ctx);
    assert.equal(r.kind, "miss");
  });

  it("misses on a parameter identifier — param-ref's territory, not this one's", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number }
       function f(newTotal: number): Order { return { total: newTotal }; }`,
      "total",
    );
    const r = recognizeInlineConst(expr, ctx);
    assert.equal(r.kind, "miss");
  });

  it("misses on a numeric literal (not its job)", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number }
       function f(): Order { return { total: 42 }; }`,
      "total",
    );
    const r = recognizeInlineConst(expr, ctx);
    assert.equal(r.kind, "miss");
  });
});
