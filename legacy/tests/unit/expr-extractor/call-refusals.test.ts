/**
 * Call-refusal unit tests that go beyond the single-label assertions in
 * diagnostic-labels.test.ts. Each test exercises a distinct refusal path
 * with enough surrounding context to verify the parser composes around
 * the refusal where it can.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractProbe } from "../harness.js";

describe("call refusals — partial site", () => {
  it("supported half composes while external half refuses", () => {
    // round3 wraps Math.round → `round` IR node. parseFloat refuses with
    // external-ambient. The sum arith(add) composes around the refusal.
    const { ir, labels } = extractProbe(`
      function round3(x: number): number { return Math.round(x * 1000) / 1000; }
      declare const raw: string;
      const __probe = round3(7) + parseFloat(raw);
    `);
    assert.equal(labels.length, 1);
    assert.equal(labels[0], "external-ambient");
    // Outer op: add. Left half contains a `round` node.
    assert.equal((ir as any).arith.op, "add");
    const left = (ir as any).arith.left;
    assert.equal(left.arith?.op, "div");
    assert.ok("round" in left.arith.left);
  });
});

describe("call refusals — refusal inside a deeper level", () => {
  it("f(g(x)) where g has a for-loop: f inlines and the loop refuses", () => {
    const { ir, labels } = extractProbe(`
      function g(x: number): number {
        let r = x;
        for (let i = 0; i < 3; i++) r += i;
        return r;
      }
      function f(x: number): number { return g(x) * 2; }
      const __probe = f(10);
    `);
    assert.deepStrictEqual(labels, ["callee-shape-not-inlineable"]);
    // f's body `g(x) * 2` still composed around the refusal.
    assert.equal((ir as any).arith?.op, "mul");
    assert.deepStrictEqual((ir as any).arith.right, { lit: 2 });
  });

  it("method call nested inside an otherwise-inlineable callee", () => {
    const { labels } = extractProbe(`
      class C { m(x: number): number { return x * 2; } }
      declare const c: C;
      function f(x: number): number { return c.m(x) + 1; }
      const __probe = f(5);
    `);
    assert.deepStrictEqual(labels, ["method-call"]);
  });
});

describe("call refusals — identifier variants", () => {
  it("IIFE: immediately-invoked arrow", () => {
    const { labels } = extractProbe("const __probe = ((x: number) => x * 2)(3);");
    assert.deepStrictEqual(labels, ["non-identifier-callee"]);
  });

  it(".bind()-style call produces a method-call or non-identifier refusal", () => {
    // Most such shapes resolve to `method-call` (the .bind() is the call).
    const { labels } = extractProbe(`
      declare const f: (x: number) => number;
      const __probe = f.bind(null)(3);
    `);
    assert.equal(labels.length, 1);
    assert.ok(
      labels[0] === "method-call" || labels[0] === "non-identifier-callee",
      `expected method-call or non-identifier-callee, got ${labels[0]}`,
    );
  });
});

describe("call refusals — recursive cycle detection", () => {
  it("direct recursion: f calls f", () => {
    const { labels } = extractProbe(`
      function f(x: number): number { return f(x - 1) + 1; }
      const __probe = f(10);
    `);
    // Outer f inlines; the inner f(x-1) hits the cycle guard.
    assert.deepStrictEqual(labels, ["recursive-call"]);
  });

  it("mutual recursion: a calls b calls a", () => {
    const { labels } = extractProbe(`
      function a(x: number): number { return b(x - 1); }
      function b(x: number): number { return a(x - 1); }
      const __probe = a(10);
    `);
    // a inlines, then b inlines inside a's body, then a(x-1) inside b hits
    // the cycle guard (a is still in _tracingCallSymbols).
    assert.deepStrictEqual(labels, ["recursive-call"]);
  });
});

describe("call refusals — callee with arg-count mismatch", () => {
  it("passing fewer args than the callee declares returns null from tryInlineCallChain", () => {
    // TypeScript would normally block this at type-check, but with `any`
    // we can construct the shape. The parser's arg/param count check should
    // refuse to inline cleanly and fall through to callee-shape-not-inlineable.
    const { labels } = extractProbe(`
      function f(x: number, y: number): number { return x + y; }
      declare const f2: any;
      const __probe = (f2 as typeof f)(3);
    `);
    assert.equal(labels.length, 1);
    // The exact label depends on how the call-site re-wraps; non-identifier
    // callee or shape-not-inlineable are both acceptable outcomes here.
    assert.ok(
      labels[0] === "non-identifier-callee" || labels[0] === "callee-shape-not-inlineable",
      `expected a non-inline refusal, got ${labels[0]}`,
    );
  });
});
