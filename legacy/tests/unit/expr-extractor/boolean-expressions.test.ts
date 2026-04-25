/**
 * Boolean-expression coverage: comparisons, logic ops, not, isPresent on
 * nullable fields, and the fallback for unsupported boolean shapes.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractBoolProbe } from "../harness.js";

describe("boolean comparisons — integer pairs", () => {
  it("3 > 5 maps to cmp(gt, 3, 5)", () => {
    const { ir } = extractBoolProbe("const __probe = 3 > 5;");
    assert.deepStrictEqual(ir, {
      cmp: { op: "gt", left: { lit: 3 }, right: { lit: 5 } },
    });
  });

  it("nested comparison inside logic: a > 0 && a < 10", () => {
    const { ir } = extractBoolProbe(`
      declare const a: number;
      const __probe = a > 0 && a < 10;
    `);
    assert.ok("logic" in ir);
    const logic = (ir as any).logic;
    assert.equal(logic.op, "and");
    assert.equal(logic.left.cmp.op, "gt");
    assert.equal(logic.right.cmp.op, "lt");
  });

  it("|| produces logic.op 'or'", () => {
    const { ir } = extractBoolProbe(`
      declare const a: number;
      const __probe = a > 0 || a < -10;
    `);
    assert.equal((ir as any).logic?.op, "or");
  });
});

describe("boolean negation", () => {
  it("`!(a > 0)` wraps in not()", () => {
    const { ir } = extractBoolProbe(`
      declare const a: number;
      const __probe = !(a > 0);
    `);
    assert.ok("not" in ir);
    assert.equal((ir as any).not.cmp?.op, "gt");
  });

  it("`!!(a > 0)` double-negates", () => {
    const { ir } = extractBoolProbe(`
      declare const a: number;
      const __probe = !!(a > 0);
    `);
    assert.ok("not" in ir);
    assert.ok("not" in (ir as any).not);
  });
});

describe("boolean isPresent on nullable field", () => {
  it("bare nullable field ref becomes isPresent", () => {
    const { ir } = extractBoolProbe(
      `declare const input: { amount?: number };
       const __probe = input.amount;`,
      { typeName: "Input", fieldNames: ["amount"], inputParamName: "input" },
    );
    assert.ok("isPresent" in ir);
  });

  it("bare non-nullable field ref does NOT become isPresent (falls to fallback)", () => {
    // A non-nullable field used as a boolean expression — parser can't
    // sensibly coerce it, falls through to the fallback.
    const { labels } = extractBoolProbe(
      `declare const input: { amount: number };
       const __probe = input.amount;`,
      { typeName: "Input", fieldNames: ["amount"], inputParamName: "input" },
    );
    // The unsupported-boolean fallback fires.
    assert.equal(labels[0], "unsupported-boolean");
  });
});

describe("boolean parenthesized / wrapping", () => {
  it("parenthesized comparison unwraps", () => {
    const { ir } = extractBoolProbe(`const __probe = (3 === 5);`);
    assert.equal((ir as any).cmp?.op, "eq");
  });
});

describe("boolean literals — true / false encode as trivial cmp", () => {
  it("`true` → cmp(eq, 1, 1) (tautologically true)", () => {
    const { ir, labels } = extractBoolProbe(`const __probe = true;`);
    assert.equal(labels.length, 0);
    assert.deepStrictEqual(ir, {
      cmp: { op: "eq", left: { lit: 1 }, right: { lit: 1 } },
    });
  });

  it("`false` → cmp(eq, 0, 1) (tautologically false)", () => {
    const { ir, labels } = extractBoolProbe(`const __probe = false;`);
    assert.equal(labels.length, 0);
    assert.deepStrictEqual(ir, {
      cmp: { op: "eq", left: { lit: 0 }, right: { lit: 1 } },
    });
  });
});

describe("boolean runtime type / class / presence checks", () => {
  it("`typeof x === 'number'` emits typeof-operator", () => {
    const { labels } = extractBoolProbe(`
      declare const x: unknown;
      const __probe = typeof x === "number";
    `);
    assert.equal(labels[0], "typeof-operator");
  });

  it("`x instanceof Y` emits instanceof-operator", () => {
    const { labels } = extractBoolProbe(`
      class Y {}
      declare const x: unknown;
      const __probe = x instanceof Y;
    `);
    assert.equal(labels[0], "instanceof-operator");
  });

  it("`'key' in obj` emits in-operator", () => {
    const { labels } = extractBoolProbe(`
      declare const obj: { key: number };
      const __probe = "key" in obj;
    `);
    assert.equal(labels[0], "in-operator");
  });
});
