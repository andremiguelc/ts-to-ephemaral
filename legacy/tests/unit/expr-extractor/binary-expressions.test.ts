/**
 * Binary-expression coverage: every supported arith shape composes; every
 * unsupported operator refuses with `non-arith-binary`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractProbe } from "../harness.js";

describe("binary arithmetic — nesting", () => {
  it("respects precedence: a + b * c", () => {
    const { ir } = extractProbe("const __probe = 2 + 3 * 4;");
    assert.equal((ir as any).arith.op, "add");
    assert.deepStrictEqual((ir as any).arith.left, { lit: 2 });
    assert.equal((ir as any).arith.right.arith.op, "mul");
  });

  it("parenthesized: (a + b) * c", () => {
    const { ir } = extractProbe("const __probe = (2 + 3) * 4;");
    assert.equal((ir as any).arith.op, "mul");
    assert.equal((ir as any).arith.left.arith.op, "add");
  });

  it("chained same-precedence left-associates: a - b - c", () => {
    const { ir } = extractProbe("const __probe = 10 - 3 - 2;");
    assert.equal((ir as any).arith.op, "sub");
    assert.deepStrictEqual((ir as any).arith.right, { lit: 2 });
    assert.equal((ir as any).arith.left.arith.op, "sub");
  });

  it("mixed arith with field references", () => {
    const { ir } = extractProbe(
      "declare const x: number; const __probe = x * 2 + 1;",
      { fieldNames: [] },
    );
    assert.equal((ir as any).arith.op, "add");
    assert.equal((ir as any).arith.left.arith.op, "mul");
  });
});

describe("binary non-arith refusals", () => {
  const cases: Array<[string, string]> = [
    ["%", "modulo"],
    ["**", "exponent"],
    ["&", "bitwise and"],
    ["|", "bitwise or"],
    ["^", "bitwise xor"],
    ["<<", "left shift"],
    [">>", "right shift"],
  ];
  for (const [op, name] of cases) {
    it(`${op} (${name}) refuses with non-arith-binary`, () => {
      const { labels } = extractProbe(`const __probe = 10 ${op} 3;`);
      assert.equal(labels.length, 1);
      assert.equal(labels[0], "non-arith-binary");
    });
  }
});

describe("logical OR with zero fallback", () => {
  it("`x || 0` on a nullable field becomes ite(isPresent, x, 0)", () => {
    const { ir } = extractProbe(
      `declare const input: { amount?: number };
       const __probe = input.amount || 0;`,
      { typeName: "Input", fieldNames: ["amount"], inputParamName: "input" },
    );
    assert.ok("ite" in ir);
    const ite = (ir as any).ite;
    assert.ok("isPresent" in ite.cond);
    assert.deepStrictEqual(ite.else, { lit: 0 });
  });

  it("`x || 5` (non-zero default) is flagged as logical-as-value", () => {
    const { labels } = extractProbe(
      `declare const input: { amount?: number };
       const __probe = input.amount || 5;`,
      { typeName: "Input", fieldNames: ["amount"], inputParamName: "input" },
    );
    // Not the `|| 0` shortcut, so it hits the dedicated logical-as-value
    // label introduced to replace the misleading non-arith-binary hint.
    assert.equal(labels[0], "logical-as-value");
  });
});

describe("binary — specific labels for semantically-mismatched operators", () => {
  it("comma operator `(a, b)` emits comma-operator", () => {
    const { labels } = extractProbe(`
      declare const a: number;
      declare const b: number;
      const __probe = (a, b);
    `);
    assert.equal(labels[0], "comma-operator");
  });

  it("`a && b` as a numeric value emits logical-as-value", () => {
    const { labels } = extractProbe(`
      declare const a: number;
      declare const b: number;
      const __probe = a && b;
    `);
    assert.equal(labels[0], "logical-as-value");
  });
});
