/**
 * Array.prototype.reduce → Expr.sum. Happy path + every refusal label.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractProbe } from "../harness.js";

describe("reduce → sum — happy paths", () => {
  it("acc + item.field with numeric literal 0 init", () => {
    const { ir, ctx } = extractProbe(`
      declare const items: Array<{ price: number }>;
      const __probe = items.reduce((acc, item) => acc + item.price, 0);
    `);
    assert.deepStrictEqual(ir, {
      sum: { collection: "items", body: { field: { name: "price" } } },
    });
    assert.equal(ctx.unconstrainedParams.size, 0);
  });

  it("acc + item.field * constant in body", () => {
    const { ir } = extractProbe(`
      declare const items: Array<{ price: number }>;
      const __probe = items.reduce((acc, item) => acc + item.price * 2, 0);
    `);
    assert.ok("sum" in ir);
    assert.equal((ir as any).sum.body.arith?.op, "mul");
  });

  it("block-body callback with single return", () => {
    const { ir } = extractProbe(`
      declare const items: Array<{ price: number }>;
      const __probe = items.reduce((acc, item) => { return acc + item.price; }, 0);
    `);
    assert.ok("sum" in ir);
  });
});

describe("reduce → sum — refusal labels", () => {
  it("non-zero initial value", () => {
    const { labels } = extractProbe(`
      declare const items: Array<number>;
      const __probe = items.reduce((a, b) => a + b, 5);
    `);
    assert.equal(labels[0], "reduce-non-zero-init");
  });

  it("complex receiver (neither bare identifier nor obj.field)", () => {
    // Receiver is an indexed expression (arr[0].reduce) — doesn't match
    // bare identifier or property-access shapes.
    const { labels } = extractProbe(`
      declare const nested: Array<Array<number>>;
      const __probe = nested[0].reduce((a, b) => a + b, 0);
    `);
    assert.equal(labels[0], "reduce-complex-receiver");
  });

  it("non-arrow callback", () => {
    const { labels } = extractProbe(`
      declare const items: Array<number>;
      declare const cb: (a: number, b: number) => number;
      const __probe = items.reduce(cb, 0);
    `);
    assert.equal(labels[0], "reduce-non-arrow-callback");
  });

  it("callback with wrong param count", () => {
    const { labels } = extractProbe(`
      declare const items: any;
      const __probe = items.reduce((a: number) => a, 0);
    `);
    assert.equal(labels[0], "reduce-callback-params");
  });

  it("destructured callback parameters", () => {
    const { labels } = extractProbe(`
      declare const items: Array<{ v: number }>;
      const __probe = items.reduce((a, { v }) => a + v, 0);
    `);
    assert.equal(labels[0], "reduce-callback-destructure");
  });

  it("complex callback body (block with multi-statements)", () => {
    const { labels } = extractProbe(`
      declare const items: Array<{ v: number }>;
      const __probe = items.reduce((a, item) => {
        const doubled = item.v * 2;
        return a + doubled;
      }, 0);
    `);
    // Block body with >1 statement — extractReduceToSum doesn't handle this.
    assert.equal(labels[0], "reduce-callback-body");
  });

  it("non-sum body shape (acc * item instead of acc + item)", () => {
    const { labels } = extractProbe(`
      declare const items: Array<number>;
      const __probe = items.reduce((a, b) => a * b, 0);
    `);
    assert.equal(labels[0], "reduce-callback-non-sum");
  });
});
