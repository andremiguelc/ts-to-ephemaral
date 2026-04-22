/**
 * Transparent type annotations and the non-null assertion are runtime
 * no-ops — the parser unwraps them at the top of extractExpr / extractBoolExpr
 * and inside the reduce/every callback detection. These tests lock in that
 * behavior.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractProbe, extractBoolProbe } from "../harness.js";

describe("transparent wrappers — AsExpression (x as T)", () => {
  it("on literal: `(42 as number)` → lit(42)", () => {
    const { ir, labels } = extractProbe(`const __probe = (42 as number);`);
    assert.deepStrictEqual(ir, { lit: 42 });
    assert.equal(labels.length, 0);
  });

  it("on input field: `input.amount as number` → field(amount)", () => {
    const { ir } = extractProbe(
      `declare const input: { amount: number };
       const __probe = input.amount as number;`,
      { fieldNames: ["amount"], inputParamName: "input" },
    );
    assert.deepStrictEqual(ir, { field: { name: "amount" } });
  });

  it("on arithmetic: `(x + 1) as number` → arith(add)", () => {
    const { ir } = extractProbe(
      `declare const x: number;
       const __probe = (x + 1) as number;`,
    );
    assert.deepStrictEqual(ir, {
      arith: { op: "add", left: { field: { name: "x" } }, right: { lit: 1 } },
    });
  });

  it("chained casts: `(x as number) as any` → field(x)", () => {
    const { ir } = extractProbe(
      `declare const x: number;
       const __probe = (x as number) as any;`,
    );
    assert.deepStrictEqual(ir, { field: { name: "x" } });
  });
});

describe("transparent wrappers — TypeAssertionExpression (<T>x)", () => {
  it("`<number>42` → lit(42)", () => {
    const { ir } = extractProbe(`const __probe = <number>42;`);
    assert.deepStrictEqual(ir, { lit: 42 });
  });
});

describe("transparent wrappers — SatisfiesExpression (x satisfies T)", () => {
  it("`42 satisfies number` → lit(42)", () => {
    const { ir } = extractProbe(`const __probe = 42 satisfies number;`);
    assert.deepStrictEqual(ir, { lit: 42 });
  });
});

describe("transparent wrappers — non-null assertion (x!)", () => {
  it("on a nullable field: `input.amount!` → field(amount)", () => {
    const { ir } = extractProbe(
      `declare const input: { amount?: number };
       const __probe = input.amount!;`,
      { fieldNames: ["amount"], inputParamName: "input" },
    );
    assert.deepStrictEqual(ir, { field: { name: "amount" } });
  });

  it("on literal via cast: `(42 as number | null)!` → lit(42)", () => {
    const { ir } = extractProbe(`const __probe = (42 as number | null)!;`);
    assert.deepStrictEqual(ir, { lit: 42 });
  });
});

describe("transparent wrappers — in BoolExpr position", () => {
  it("`(a > b) as boolean` unwraps to a cmp node", () => {
    const { ir } = extractBoolProbe(`
      declare const a: number;
      declare const b: number;
      const __probe = (a > b) as boolean;
    `);
    assert.equal((ir as any).cmp?.op, "gt");
  });
});

describe("transparent wrappers — reduce / every callbacks see through casts", () => {
  it("reduce callback wrapped in `as any` is still recognized as an arrow", () => {
    const { ir, labels } = extractProbe(`
      declare const items: number[];
      const __probe = items.reduce(((a: number, b: number) => a + b) as any, 0);
    `);
    assert.equal(labels.length, 0);
    assert.ok("sum" in ir);
  });

  it("every callback wrapped in `as any` is still recognized as an arrow", () => {
    const { ir, labels } = extractBoolProbe(`
      declare const items: Array<{ x: number }>;
      const __probe = items.every(((item: { x: number }) => item.x > 0) as any);
    `);
    assert.equal(labels.length, 0);
    assert.ok("each" in ir);
  });
});
