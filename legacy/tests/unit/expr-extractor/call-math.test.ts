/**
 * Math.* call extraction: floor/ceil/round succeed; abs/max/min/pow refuse
 * with dedicated labels; unrecognized Math methods fall to method-call.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractProbe } from "../harness.js";

describe("Math.floor / Math.ceil / Math.round — composed", () => {
  it("Math.floor(x) produces round(floor)", () => {
    const { ir } = extractProbe("const __probe = Math.floor(1.9);");
    assert.deepStrictEqual(ir, { round: { expr: { lit: 1.9 }, mode: "floor" } });
  });

  it("Math.ceil(x) produces round(ceil)", () => {
    const { ir } = extractProbe("const __probe = Math.ceil(0.1);");
    assert.deepStrictEqual(ir, { round: { expr: { lit: 0.1 }, mode: "ceil" } });
  });

  it("Math.round(x) produces round(half_up)", () => {
    const { ir } = extractProbe("const __probe = Math.round(1.5);");
    assert.deepStrictEqual(ir, { round: { expr: { lit: 1.5 }, mode: "half_up" } });
  });

  it("Math.floor of arithmetic expression nests correctly", () => {
    const { ir } = extractProbe("const __probe = Math.floor(7.5 * 2);");
    assert.ok("round" in ir);
    assert.equal((ir as any).round.mode, "floor");
    assert.equal((ir as any).round.expr.arith?.op, "mul");
  });
});

describe("Math.abs / max / min / pow — refuse with dedicated labels", () => {
  const cases: Array<[string, string]> = [
    ["Math.abs(-3)", "math-abs"],
    ["Math.max(1, 2)", "math-max"],
    ["Math.min(1, 2)", "math-min"],
    ["Math.pow(2, 3)", "math-pow"],
  ];
  for (const [expr, label] of cases) {
    it(`${expr} refuses with ${label}`, () => {
      const { labels } = extractProbe(`const __probe = ${expr};`);
      assert.equal(labels[0], label);
    });
  }

  it("nested Math.abs(Math.max(a, b)) fires outer label only", () => {
    const { labels } = extractProbe("const __probe = Math.abs(Math.max(1, 2));");
    assert.deepStrictEqual(labels, ["math-abs"]);
  });
});

describe("Math.* unrecognized methods — fall to method-call", () => {
  it("Math.trunc falls to method-call (not whitelisted)", () => {
    const { labels } = extractProbe("const __probe = Math.trunc(1.7);");
    assert.equal(labels[0], "method-call");
  });

  it("Math.sqrt falls to method-call", () => {
    const { labels } = extractProbe("const __probe = Math.sqrt(4);");
    assert.equal(labels[0], "method-call");
  });
});

describe("call refusal — async / generator callees", () => {
  it("async arrow callee emits async-callee", () => {
    const { labels } = extractProbe(`
      const f = async (x: number) => x * 2;
      const __probe: any = f(5);
    `);
    assert.equal(labels[0], "async-callee");
  });

  it("async function declaration emits async-callee", () => {
    const { labels } = extractProbe(`
      async function f(x: number): Promise<number> { return x * 2; }
      const __probe: any = f(5);
    `);
    assert.equal(labels[0], "async-callee");
  });

  it("generator function emits generator-callee", () => {
    const { labels } = extractProbe(`
      function* f(x: number): Generator<number> { yield x; }
      const __probe: any = f(5);
    `);
    assert.equal(labels[0], "generator-callee");
  });
});
