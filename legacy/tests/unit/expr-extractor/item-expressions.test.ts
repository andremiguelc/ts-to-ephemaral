/**
 * Item-scope expression extraction — inside `.reduce(...)` and `.every(...)`
 * callback bodies, identifiers resolve differently than in the main scope.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractProbe, extractBoolProbe } from "../harness.js";

describe("reduce body — item expression extraction", () => {
  it("acc + item.field shape produces sum(collection, field(field))", () => {
    const { ir, ctx } = extractProbe(`
      declare const items: Array<{ price: number }>;
      const __probe = items.reduce((acc, item) => acc + item.price, 0);
    `);
    assert.ok("sum" in ir);
    assert.equal((ir as any).sum.collection, "items");
    assert.deepStrictEqual((ir as any).sum.body, { field: { name: "price" } });
    assert.equal(ctx.unconstrainedParams.size, 0);
  });

  it("acc + bare identifier in item scope", () => {
    const { ir } = extractProbe(`
      declare const items: Array<number>;
      const __probe = items.reduce((acc, item) => acc + item, 0);
    `);
    assert.ok("sum" in ir);
    // Bare `item` in item scope resolves to { field: { name: "item" } }.
    assert.deepStrictEqual((ir as any).sum.body, { field: { name: "item" } });
  });

  it("acc + item.field * constant (arithmetic in item body)", () => {
    const { ir } = extractProbe(`
      declare const items: Array<{ price: number }>;
      const __probe = items.reduce((acc, item) => acc + item.price * 2, 0);
    `);
    assert.ok("sum" in ir);
    assert.equal((ir as any).sum.body.arith?.op, "mul");
  });

  it("acc + numeric literal (item body is a literal)", () => {
    const { ir } = extractProbe(`
      declare const items: Array<number>;
      const __probe = items.reduce((acc, item) => acc + 1, 0);
    `);
    assert.ok("sum" in ir);
    assert.deepStrictEqual((ir as any).sum.body, { lit: 1 });
  });

  it("unsupported item expression falls back with item-expression-unsupported", () => {
    const { labels } = extractProbe(`
      declare const items: Array<{ price: number }>;
      const __probe = items.reduce((acc, item) => acc + (item.price ? 1 : 0), 0);
    `);
    // Ternary inside item-body isn't supported by extractItemExpr.
    assert.equal(labels[0], "item-expression-unsupported");
  });
});

describe("every body — item boolean extraction", () => {
  it("item.field > 0 produces each(collection, cmp(...))", () => {
    const { ir } = extractBoolProbe(`
      declare const items: Array<{ price: number }>;
      const __probe = items.every((item) => item.price > 0);
    `);
    assert.ok("each" in ir);
    assert.equal((ir as any).each.collection, "items");
    assert.equal((ir as any).each.body.cmp?.op, "gt");
  });

  it("item.a && item.b in every body produces nested logic", () => {
    const { ir } = extractBoolProbe(`
      declare const items: Array<{ a: number; b: number }>;
      const __probe = items.every((item) => item.a > 0 && item.b < 10);
    `);
    assert.ok("each" in ir);
    assert.equal((ir as any).each.body.logic?.op, "and");
  });

  it("!(item.x > 0) in every body produces not()", () => {
    const { ir } = extractBoolProbe(`
      declare const items: Array<{ x: number }>;
      const __probe = items.every((item) => !(item.x > 0));
    `);
    assert.ok("each" in ir);
    assert.ok("not" in (ir as any).each.body);
  });

  it("unsupported boolean inside every body falls back with item-boolean-unsupported", () => {
    const { labels } = extractBoolProbe(`
      declare const items: Array<{ x: number }>;
      const __probe = items.every((item) => item.x === 1 ? true : false);
    `);
    // Ternary as boolean inside every isn't recognized.
    assert.equal(labels[0], "item-boolean-unsupported");
  });
});
