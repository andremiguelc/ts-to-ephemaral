import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractProbe } from "../harness.js";

describe("null coalescing (??) — nullable field", () => {
  it("`obj.amount ?? 0` on nullable field becomes ite(isPresent, amount, 0)", () => {
    const { ir } = extractProbe(
      `declare const input: { amount?: number };
       const __probe = input.amount ?? 0;`,
      { fieldNames: ["amount"], inputParamName: "input" },
    );
    assert.ok("ite" in ir);
    assert.ok("isPresent" in (ir as any).ite.cond);
    assert.deepStrictEqual((ir as any).ite.then, { field: { name: "amount" } });
    assert.deepStrictEqual((ir as any).ite.else, { lit: 0 });
  });

  it("?? with arithmetic default still compiles", () => {
    const { ir } = extractProbe(
      `declare const input: { amount?: number };
       const __probe = input.amount ?? 10;`,
      { fieldNames: ["amount"], inputParamName: "input" },
    );
    assert.ok("ite" in ir);
    assert.deepStrictEqual((ir as any).ite.else, { lit: 10 });
  });
});

describe("null coalescing (??) — non-nullable field", () => {
  it("?? on non-nullable field collapses to the left side (fallback unreachable)", () => {
    const { ir } = extractProbe(
      `declare const input: { amount: number };
       const __probe = input.amount ?? 0;`,
      { fieldNames: ["amount"], inputParamName: "input" },
    );
    // Non-nullable → fallback is unreachable → parser emits the bare field.
    assert.deepStrictEqual(ir, { field: { name: "amount" } });
  });
});

describe("logical-or-zero (|| 0) shortcut", () => {
  it("`x || 0` is treated the same as `x ?? 0` on a nullable field", () => {
    const { ir } = extractProbe(
      `declare const input: { amount?: number };
       const __probe = input.amount || 0;`,
      { fieldNames: ["amount"], inputParamName: "input" },
    );
    assert.ok("ite" in ir);
  });
});
