/**
 * Unit tests for call-chain inlining through the public API. Each test probes
 * one supported shape or combination with a hand-crafted snippet.
 *
 * Scope ladder reminder: within a callee body, an identifier resolves through
 * paramSubstitution → tryTraceLocal → fieldNames fallback. These tests push
 * on the substitution and tracing paths explicitly.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractProbe } from "../harness.js";

describe("call-chain inlining — callee declaration forms", () => {
  it("expression-body arrow: const f = (x) => x * 2", () => {
    const { ir, ctx } = extractProbe(`
      const f = (x: number) => x * 2;
      const __probe = f(7);
    `);
    assert.deepStrictEqual(ir, {
      arith: { op: "mul", left: { lit: 7 }, right: { lit: 2 } },
    });
    assert.equal(ctx.unconstrainedParams.size, 0);
  });

  it("block-body arrow: const f = (x) => { return x * 2; }", () => {
    const { ir, ctx } = extractProbe(`
      const f = (x: number) => { return x * 2; };
      const __probe = f(5);
    `);
    assert.deepStrictEqual(ir, {
      arith: { op: "mul", left: { lit: 5 }, right: { lit: 2 } },
    });
    assert.equal(ctx.unconstrainedParams.size, 0);
  });

  it("named function declaration with single return", () => {
    const { ir, ctx } = extractProbe(`
      function f(x: number): number { return x * 2; }
      const __probe = f(3);
    `);
    assert.deepStrictEqual(ir, {
      arith: { op: "mul", left: { lit: 3 }, right: { lit: 2 } },
    });
    assert.equal(ctx.unconstrainedParams.size, 0);
  });

  it("function expression: const f = function (x) { return x * 2; }", () => {
    const { ir, ctx } = extractProbe(`
      const f = function (x: number): number { return x * 2; };
      const __probe = f(4);
    `);
    assert.deepStrictEqual(ir, {
      arith: { op: "mul", left: { lit: 4 }, right: { lit: 2 } },
    });
    assert.equal(ctx.unconstrainedParams.size, 0);
  });
});

describe("call-chain inlining — body shapes", () => {
  it("guard-chain body lifts to nested ite", () => {
    const { ir, ctx } = extractProbe(`
      function clamp(x: number, lo: number, hi: number): number {
        if (x < lo) return lo;
        if (x > hi) return hi;
        return x;
      }
      const __probe = clamp(5, 0, 10);
    `);
    assert.ok("ite" in ir);
    assert.equal(ctx.unconstrainedParams.size, 0);
  });

  it("leading const binding: const y = x * 2; return y + 1;", () => {
    const { ir, ctx } = extractProbe(`
      function f(x: number): number {
        const y = x * 2;
        return y + 1;
      }
      const __probe = f(10);
    `);
    // Expected: (10 * 2) + 1 — the local `y` dissolves into its initializer.
    assert.deepStrictEqual(ir, {
      arith: {
        op: "add",
        left: { arith: { op: "mul", left: { lit: 10 }, right: { lit: 2 } } },
        right: { lit: 1 },
      },
    });
    assert.equal(ctx.unconstrainedParams.size, 0);
  });

  it("combination: const binding + guard chain", () => {
    const { ir, ctx } = extractProbe(`
      function price(x: number, floor: number): number {
        const ceiling = floor + 1000;
        if (x < floor) return floor;
        if (x > ceiling) return ceiling;
        return x;
      }
      const __probe = price(50, 10);
    `);
    assert.ok("ite" in ir);
    assert.equal(ctx.unconstrainedParams.size, 0);
  });
});

describe("call-chain inlining — parameter substitution", () => {
  it("substitutes at every leaf of a four-param body", () => {
    const { ir, ctx } = extractProbe(`
      function combine(x: number, y: number, z: number, w: number): number {
        return x * y + z - w;
      }
      const __probe = combine(1, 2, 3, 4);
    `);
    // (1 * 2 + 3) - 4
    assert.equal((ir as any).arith.op, "sub");
    assert.deepStrictEqual((ir as any).arith.right, { lit: 4 });
    assert.equal(ctx.unconstrainedParams.size, 0);
  });

  it("substitutes into both branches of a ternary body", () => {
    const { ir } = extractProbe(`
      function pos(x: number): number { return x > 0 ? x * 2 : 0; }
      const __probe = pos(5);
    `);
    assert.ok("ite" in ir);
    // Condition, then, and else all must reference the substituted argument.
    const ite = (ir as any).ite;
    assert.deepStrictEqual(ite.cond.cmp.left, { lit: 5 });
    assert.deepStrictEqual(ite.then.arith.left, { lit: 5 });
  });

  it("substitutes through two-hop const tracing", () => {
    const { ir, ctx } = extractProbe(`
      function f(x: number, y: number): number {
        const a = x;
        const b = a * 2;
        return b + y;
      }
      const __probe = f(10, 3);
    `);
    // (10 * 2) + 3
    assert.deepStrictEqual(ir, {
      arith: {
        op: "add",
        left: { arith: { op: "mul", left: { lit: 10 }, right: { lit: 2 } } },
        right: { lit: 3 },
      },
    });
    assert.equal(ctx.unconstrainedParams.size, 0);
  });
});

describe("call-chain inlining — nested composition", () => {
  it("two-level: outer(x) = inner(x) * 2", () => {
    const { ir, ctx } = extractProbe(`
      function inner(x: number): number { return x + 1; }
      function outer(x: number): number { return inner(x) * 2; }
      const __probe = outer(5);
    `);
    // (5 + 1) * 2
    assert.deepStrictEqual(ir, {
      arith: {
        op: "mul",
        left: { arith: { op: "add", left: { lit: 5 }, right: { lit: 1 } } },
        right: { lit: 2 },
      },
    });
    assert.equal(ctx.unconstrainedParams.size, 0);
  });

  it("eight-level chain composes without hitting the depth cap", () => {
    const { ir, ctx } = extractProbe(`
      function f8(x: number): number { return x + 8; }
      function f7(x: number): number { return f8(x) + 7; }
      function f6(x: number): number { return f7(x) + 6; }
      function f5(x: number): number { return f6(x) + 5; }
      function f4(x: number): number { return f5(x) + 4; }
      function f3(x: number): number { return f4(x) + 3; }
      function f2(x: number): number { return f3(x) + 2; }
      function f1(x: number): number { return f2(x) + 1; }
      const __probe = f1(0);
    `);
    assert.equal(ctx.unconstrainedParams.size, 0);
    assert.equal((ir as any).arith?.op, "add");
  });

  it("argument itself is a call: f(g(h(x)) + 1)", () => {
    const { ir, ctx } = extractProbe(`
      function h(x: number): number { return x + 1; }
      function g(x: number): number { return x * 2; }
      function f(x: number): number { return x - 3; }
      const __probe = f(g(h(10)) + 1);
    `);
    assert.equal(ctx.unconstrainedParams.size, 0);
    // outer: ((g(h(10)) + 1)) - 3
    assert.equal((ir as any).arith.op, "sub");
    assert.deepStrictEqual((ir as any).arith.right, { lit: 3 });
  });

  it("wide-arity callee: eight parameters substituted individually", () => {
    const { ir, ctx } = extractProbe(`
      function g(a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number): number {
        return a + b + c + d + e + f + g + h;
      }
      const __probe = g(1, 2, 3, 4, 5, 6, 7, 8);
    `);
    assert.equal(ctx.unconstrainedParams.size, 0);
    // Every arg should be a literal leaf somewhere in the tree.
    const seen = new Set<number>();
    (function walk(e: any) {
      if (!e || typeof e !== "object") return;
      if ("lit" in e && typeof e.lit === "number") seen.add(e.lit);
      for (const v of Object.values(e)) walk(v);
    })(ir);
    assert.deepStrictEqual(seen, new Set([1, 2, 3, 4, 5, 6, 7, 8]));
  });
});

describe("call-chain inlining — name isolation", () => {
  it("callee param named `subtotal` doesn't conflate with input field `subtotal`", () => {
    const { ir, ctx } = extractProbe(
      `
      function scale(subtotal: number): number { return subtotal * 2; }
      declare const input: { subtotal: number; };
      const __probe = scale(input.subtotal);
      `,
      {
        typeName: "Input",
        fieldNames: ["subtotal"],
        inputParamName: "input",
      },
    );
    // Expected: arith(mul, field(subtotal), lit(2))
    assert.deepStrictEqual(ir, {
      arith: {
        op: "mul",
        left: { field: { name: "subtotal" } },
        right: { lit: 2 },
      },
    });
    assert.equal(ctx.unconstrainedParams.size, 0);
  });

  it("callee local const named `subtotal` resolves to initializer, not field", () => {
    const { ir, ctx } = extractProbe(
      `
      function f(y: number): number {
        const subtotal = 42;
        return subtotal + y;
      }
      declare const input: { subtotal: number; };
      const __probe = f(input.subtotal);
      `,
      {
        typeName: "Input",
        fieldNames: ["subtotal"],
        inputParamName: "input",
      },
    );
    // The callee's local `subtotal` must win over the field-name fallback.
    assert.deepStrictEqual(ir, {
      arith: {
        op: "add",
        left: { lit: 42 },
        right: { field: { name: "subtotal" } },
      },
    });
    assert.equal(ctx.unconstrainedParams.size, 0);
  });
});
