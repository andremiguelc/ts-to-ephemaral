import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recognizeArith } from "../../../src/normalize/recognize-arith.js";
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

describe("recognize-arith", () => {
  it("admits a + b as Arith(add, ParamRef, ParamRef)", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number }
       function f(a: number, b: number): Order { return { total: a + b }; }`,
      "total",
    );
    const r = recognizeArith(expr, ctx);
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.deepEqual(r.cae, {
      kind: "Arith",
      op: "add",
      left: { kind: "ParamRef", name: "a" },
      right: { kind: "ParamRef", name: "b" },
    });
  });

  it("admits a - b as Arith(sub)", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number }
       function f(a: number, b: number): Order { return { total: a - b }; }`,
      "total",
    );
    const r = recognizeArith(expr, ctx);
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.equal((r.cae as { op: string }).op, "sub");
  });

  it("admits a * b as Arith(mul)", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number }
       function f(a: number, b: number): Order { return { total: a * b }; }`,
      "total",
    );
    const r = recognizeArith(expr, ctx);
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.equal((r.cae as { op: string }).op, "mul");
  });

  it("admits a / b as Arith(div)", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number }
       function f(a: number, b: number): Order { return { total: a / b }; }`,
      "total",
    );
    const r = recognizeArith(expr, ctx);
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.equal((r.cae as { op: string }).op, "div");
  });

  it("admits nested arithmetic following AST precedence — a + b * c", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number }
       function f(a: number, b: number, c: number): Order { return { total: a + b * c }; }`,
      "total",
    );
    const r = recognizeArith(expr, ctx);
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    // TS AST groups b*c into the right operand of `+`
    assert.deepEqual(r.cae, {
      kind: "Arith",
      op: "add",
      left: { kind: "ParamRef", name: "a" },
      right: {
        kind: "Arith",
        op: "mul",
        left: { kind: "ParamRef", name: "b" },
        right: { kind: "ParamRef", name: "c" },
      },
    });
  });

  it("admits mixed literal and parameter — a + 1", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number }
       function f(a: number): Order { return { total: a + 1 }; }`,
      "total",
    );
    const r = recognizeArith(expr, ctx);
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.deepEqual(r.cae, {
      kind: "Arith",
      op: "add",
      left: { kind: "ParamRef", name: "a" },
      right: { kind: "Lit", value: 1 },
    });
  });

  it("admits arithmetic on a const-aliased operand — const c = a + 1; return c * 2", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number }
       function f(a: number): Order { const c = a + 1; return { total: c * 2 }; }`,
      "total",
    );
    const r = recognizeArith(expr, ctx);
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.deepEqual(r.cae, {
      kind: "Arith",
      op: "mul",
      left: {
        kind: "Arith",
        op: "add",
        left: { kind: "ParamRef", name: "a" },
        right: { kind: "Lit", value: 1 },
      },
      right: { kind: "Lit", value: 2 },
    });
  });

  it("admits field-ref operands — order.total + order.subtotal", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number, subtotal: number }
       function f(order: Order): Order { return { total: order.total + order.subtotal, subtotal: 0 }; }`,
      "total",
    );
    const r = recognizeArith(expr, ctx);
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.deepEqual(r.cae, {
      kind: "Arith",
      op: "add",
      left: { kind: "FieldRef", param: "order", field: "total" },
      right: { kind: "FieldRef", param: "order", field: "subtotal" },
    });
  });

  it("rejects unsupported-operator for %", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number }
       function f(a: number, b: number): Order { return { total: a % b }; }`,
      "total",
    );
    const r = recognizeArith(expr, ctx);
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "unsupported-operator");
  });

  it("rejects unsupported-operator for **", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number }
       function f(a: number, b: number): Order { return { total: a ** b }; }`,
      "total",
    );
    const r = recognizeArith(expr, ctx);
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "unsupported-operator");
  });

  it("rejects unsupported-operator for bitwise &", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number }
       function f(a: number, b: number): Order { return { total: a & b }; }`,
      "total",
    );
    const r = recognizeArith(expr, ctx);
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "unsupported-operator");
  });

  it("rejects arith-on-string when left operand is string", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number }
       function f(s: string, n: number): Order { return { total: (s + n) as any }; }`,
      "total",
    );
    const r = recognizeArith(expr, ctx);
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "arith-on-string");
  });

  it("rejects arith-on-string when right operand is a string literal", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number }
       function f(n: number): Order { return { total: (n + "x") as any }; }`,
      "total",
    );
    const r = recognizeArith(expr, ctx);
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "arith-on-string");
  });

  it("propagates the operand's rejection — null literal inside arithmetic carries the inner label through", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number }
       function f(n: number): Order { return { total: n + (null as any) }; }`,
      "total",
    );
    const r = recognizeArith(expr, ctx);
    // The inner operand `null` falls through to unsupported-expression; the
    // arith recognizer propagates that label, not a binding-level label.
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "unsupported-expression");
  });

  it("misses on a comparison (<) — not its job", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number }
       function f(a: number, b: number): Order { return { total: (a < b) as any }; }`,
      "total",
    );
    const r = recognizeArith(expr, ctx);
    assert.equal(r.kind, "miss");
  });

  it("misses on a logical && — not its job", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number }
       function f(a: boolean, b: boolean): Order { return { total: (a && b) as any }; }`,
      "total",
    );
    const r = recognizeArith(expr, ctx);
    assert.equal(r.kind, "miss");
  });

  it("misses on a numeric literal alone", () => {
    const { expr, ctx } = setup(
      `interface Order { total: number }
       function f(): Order { return { total: 42 }; }`,
      "total",
    );
    const r = recognizeArith(expr, ctx);
    assert.equal(r.kind, "miss");
  });
});
