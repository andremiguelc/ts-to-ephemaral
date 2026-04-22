/**
 * Table-driven coverage of the arithmetic, comparison, and rounding operator
 * maps. Each arith op produces an `arith` node with the right `op`; each
 * comparison produces a `cmp` node with the right `op`; each rounding op
 * produces a `round` with the right `mode`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractProbe, extractBoolProbe } from "../harness.js";

describe("arithmetic operator map", () => {
  const cases: Array<[string, string]> = [
    ["+", "add"],
    ["-", "sub"],
    ["*", "mul"],
    ["/", "div"],
  ];
  for (const [operator, op] of cases) {
    it(`${operator} maps to arith.op "${op}"`, () => {
      const { ir } = extractProbe(`const __probe = 6 ${operator} 2;`);
      assert.equal((ir as any).arith?.op, op);
      assert.deepStrictEqual((ir as any).arith.left, { lit: 6 });
      assert.deepStrictEqual((ir as any).arith.right, { lit: 2 });
    });
  }
});

describe("comparison operator map", () => {
  const cases: Array<[string, string]> = [
    ["===", "eq"],
    ["==", "eq"],
    ["!==", "neq"],
    ["!=", "neq"],
    [">", "gt"],
    [">=", "gte"],
    ["<", "lt"],
    ["<=", "lte"],
  ];
  for (const [operator, op] of cases) {
    it(`${operator} maps to cmp.op "${op}"`, () => {
      const { ir } = extractBoolProbe(`const __probe = 3 ${operator} 5;`);
      assert.equal((ir as any).cmp?.op, op);
      assert.deepStrictEqual((ir as any).cmp.left, { lit: 3 });
      assert.deepStrictEqual((ir as any).cmp.right, { lit: 5 });
    });
  }
});

describe("rounding mode map", () => {
  it("Math.floor → floor", () => {
    const { ir } = extractProbe("const __probe = Math.floor(1.7);");
    assert.equal((ir as any).round?.mode, "floor");
  });
  it("Math.ceil → ceil", () => {
    const { ir } = extractProbe("const __probe = Math.ceil(1.2);");
    assert.equal((ir as any).round?.mode, "ceil");
  });
  it("Math.round → half_up", () => {
    const { ir } = extractProbe("const __probe = Math.round(1.5);");
    assert.equal((ir as any).round?.mode, "half_up");
  });
  it("Math.trunc is NOT a recognized rounding mode (falls through)", () => {
    // Math.trunc exists at runtime but we don't map it. Falls through to the
    // Math.abs/max/min/pow check (none match), then the generic ambient path.
    const { labels } = extractProbe("const __probe = Math.trunc(1.7);");
    assert.equal(labels.length, 1);
    // The current fall-through for unknown Math.* is method-call (because
    // it's a property-access callee that doesn't match any whitelist).
    assert.equal(labels[0], "method-call");
  });
});
