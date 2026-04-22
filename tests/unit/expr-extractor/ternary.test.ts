import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractProbe } from "../harness.js";

describe("ternary — simple", () => {
  it("literal branches", () => {
    const { ir } = extractProbe(`const __probe = 5 > 0 ? 1 : 2;`);
    assert.ok("ite" in ir);
    const ite = (ir as any).ite;
    assert.equal(ite.cond.cmp.op, "gt");
    assert.deepStrictEqual(ite.then, { lit: 1 });
    assert.deepStrictEqual(ite.else, { lit: 2 });
  });

  it("arithmetic in branches", () => {
    const { ir } = extractProbe(`
      declare const x: number;
      const __probe = x > 0 ? x * 2 : x + 1;
    `);
    assert.ok("ite" in ir);
    assert.equal((ir as any).ite.then.arith.op, "mul");
    assert.equal((ir as any).ite.else.arith.op, "add");
  });

  it("nested ternary", () => {
    const { ir } = extractProbe(`
      declare const x: number;
      const __probe = x > 0 ? 1 : (x < 0 ? -1 : 0);
    `);
    assert.ok("ite" in ir);
    assert.ok("ite" in (ir as any).ite.else);
  });

  it("condition with logical and", () => {
    const { ir } = extractProbe(`
      declare const x: number;
      const __probe = x > 0 && x < 10 ? x : 0;
    `);
    assert.ok("ite" in ir);
    assert.equal((ir as any).ite.cond.logic?.op, "and");
  });
});
