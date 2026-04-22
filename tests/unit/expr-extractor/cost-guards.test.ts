/**
 * Cost guards (call-depth-exceeded, call-size-exceeded) and their
 * env-variable overrides. The caps are module-level constants read at
 * import time, so we set env vars before re-importing the module.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractProbe } from "../harness.js";

describe("cost guards — depth cap", () => {
  it("a chain deeper than the default cap (64) fires call-depth-exceeded", () => {
    // Build a synthetic chain f0 → f1 → … → f70. With default MAX_CALL_DEPTH=64,
    // the deepest level triggers the refusal.
    const decls: string[] = [];
    for (let i = 0; i < 70; i++) {
      const next = i === 69 ? "x" : `f${i + 1}(x)`;
      decls.push(`function f${i}(x: number): number { return ${next}; }`);
    }
    const code = `${decls.join("\n")}\nconst __probe = f0(1);\n`;
    const { labels } = extractProbe(code);
    // Exactly one refusal with the depth-exceeded label.
    assert.equal(labels.length, 1);
    assert.equal(labels[0], "call-depth-exceeded");
  });

  it("a chain shallower than the cap composes cleanly (no refusal)", () => {
    const decls: string[] = [];
    for (let i = 0; i < 10; i++) {
      const next = i === 9 ? "x" : `f${i + 1}(x)`;
      decls.push(`function f${i}(x: number): number { return ${next}; }`);
    }
    const code = `${decls.join("\n")}\nconst __probe = f0(1);\n`;
    const { labels } = extractProbe(code);
    assert.equal(labels.length, 0);
  });
});
