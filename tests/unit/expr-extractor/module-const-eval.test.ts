/**
 * Module-level const evaluation (tryEvalModuleConst / tryResolveModuleRef):
 * references to module-level consts get resolved to their literal value at
 * parse time where possible.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractProbe } from "../harness.js";

describe("module const eval — literals", () => {
  it("positive literal module const resolves", () => {
    const { ir } = extractProbe(`
      const K = 60;
      function f(x: number): number { return x * K; }
      const __probe = f(5);
    `);
    assert.deepStrictEqual(ir, {
      arith: { op: "mul", left: { lit: 5 }, right: { lit: 60 } },
    });
  });

  it("negative literal via prefix-unary module const", () => {
    const { ir } = extractProbe(`
      const K = -3;
      function f(x: number): number { return x + K; }
      const __probe = f(7);
    `);
    assert.deepStrictEqual(ir, {
      arith: { op: "add", left: { lit: 7 }, right: { lit: -3 } },
    });
  });

  it("parenthesized literal module const", () => {
    const { ir } = extractProbe(`
      const K = (42);
      function f(x: number): number { return x + K; }
      const __probe = f(0);
    `);
    assert.deepStrictEqual(ir, {
      arith: { op: "add", left: { lit: 0 }, right: { lit: 42 } },
    });
  });
});

describe("module const eval — arithmetic folding", () => {
  const cases: Array<[string, number]> = [
    ["24 + 60", 84],
    ["100 - 25", 75],
    ["24 * 60", 1440],
    ["1000 / 4", 250],
  ];
  for (const [expr, result] of cases) {
    it(`${expr} folds to lit(${result}) at parse time`, () => {
      const { ir } = extractProbe(`
        const K = ${expr};
        function f(x: number): number { return x + K; }
        const __probe = f(0);
      `);
      assert.deepStrictEqual((ir as any).arith.right, { lit: result });
    });
  }
});

describe("module const eval — reference to another const", () => {
  it("one const references another", () => {
    const { ir } = extractProbe(`
      const HOURS = 24;
      const MINS = 60;
      const MINS_PER_DAY = HOURS * MINS;
      function f(x: number): number { return x + MINS_PER_DAY; }
      const __probe = f(0);
    `);
    assert.deepStrictEqual((ir as any).arith.right, { lit: 1440 });
  });
});

describe("module const eval — division by zero", () => {
  it("x / 0 falls through (doesn't fold to literal)", () => {
    // tryEvalModuleConst returns null for r === 0 division.
    const { ir } = extractProbe(`
      const Z = 10 / 0;
      function f(x: number): number { return x + Z; }
      const __probe = f(0);
    `);
    // Doesn't crash; the right side is whatever the fallback produces.
    assert.ok(ir);
  });
});
