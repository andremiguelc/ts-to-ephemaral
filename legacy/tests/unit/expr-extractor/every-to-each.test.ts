/**
 * Array.prototype.every → BoolExpr.each. Gated on receiver type being
 * Array / ReadonlyArray via the type checker (not the method name alone).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractBoolProbe } from "../harness.js";

describe("every → each — type gating", () => {
  it("Array<T>.every produces each", () => {
    const { ir } = extractBoolProbe(`
      declare const items: Array<number>;
      const __probe = items.every((item) => item > 0);
    `);
    assert.ok("each" in ir);
  });

  it("ReadonlyArray<T>.every produces each", () => {
    const { ir } = extractBoolProbe(`
      declare const items: ReadonlyArray<number>;
      const __probe = items.every((item) => item > 0);
    `);
    assert.ok("each" in ir);
  });

  it("non-array `.every` is NOT gated in (receiver type isn't Array)", () => {
    // A custom object with an `.every` method shouldn't hit the every-to-each
    // path because the type-checker's apparent type isn't Array.
    const { labels } = extractBoolProbe(`
      declare const obj: { every: (cb: (x: number) => boolean) => boolean };
      const __probe = obj.every((x) => x > 0);
    `);
    // Falls through the every gate; lands on the unsupported-boolean fallback.
    assert.equal(labels[0], "unsupported-boolean");
  });
});

describe("every → each — callback shapes", () => {
  it("arrow with expression body", () => {
    const { ir } = extractBoolProbe(`
      declare const items: Array<{ x: number }>;
      const __probe = items.every((item) => item.x > 0);
    `);
    assert.ok("each" in ir);
  });

  it("arrow with block-return body", () => {
    const { ir } = extractBoolProbe(`
      declare const items: Array<{ x: number }>;
      const __probe = items.every((item) => { return item.x > 0; });
    `);
    assert.ok("each" in ir);
  });

  it("non-arrow callback refuses (falls to unsupported-boolean)", () => {
    const { labels } = extractBoolProbe(`
      declare const items: Array<{ x: number }>;
      declare const cb: (item: { x: number }) => boolean;
      const __probe = items.every(cb);
    `);
    assert.equal(labels[0], "unsupported-boolean");
  });

  it("destructured parameter refuses", () => {
    const { labels } = extractBoolProbe(`
      declare const items: Array<{ x: number }>;
      const __probe = items.every(({ x }) => x > 0);
    `);
    assert.equal(labels[0], "unsupported-boolean");
  });
});
