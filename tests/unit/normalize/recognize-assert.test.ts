import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { recognizeAssert } from "../../../src/normalize/recognize-assert.js";
import { compileSnippet } from "../discovery/harness.js";
import type { NormalizeContext } from "../../../src/normalize/index.js";

function firstAssertCall(sourceFile: ts.SourceFile): ts.CallExpression {
  let found: ts.CallExpression | null = null;
  function visit(n: ts.Node): void {
    if (found) return;
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text.endsWith("Assert")
    ) {
      found = n;
      return;
    }
    ts.forEachChild(n, visit);
  }
  visit(sourceFile);
  if (!found) throw new Error("no Assert call in snippet");
  return found;
}

function setup(code: string): { call: ts.CallExpression; ctx: NormalizeContext } {
  const fixture = compileSnippet(code);
  const call = firstAssertCall(fixture.sourceFile);
  const ctx: NormalizeContext = {
    checker: fixture.checker,
    inputType: { name: "Order", fields: { total: "number" } },
    signature: {
      name: null,
      parameters: [{ name: "x", type: "number" }],
      returnType: "Order",
    },
  };
  return { call, ctx };
}

describe("recognize-assert", () => {
  it("admits a basic Assert with throw and a single comparison", () => {
    const { call, ctx } = setup(
      `function totalAssert(value: number): void {
         if (value < 0) throw new Error("must be non-negative");
       }
       function setTotal(x: number) {
         totalAssert(x);
       }`,
    );
    const r = recognizeAssert(call, ctx);
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.equal(r.argName, "x");
    assert.deepEqual(r.predicate, {
      kind: "Cmp",
      op: "lt",
      left: { kind: "ParamRef", name: "x" }, // substituted from "value" at call site
      right: { kind: "Lit", value: 0 },
    });
  });

  it("admits an Assert that calls a `never`-typed helper instead of throw", () => {
    const { call, ctx } = setup(
      `function bailOut(v: unknown): never { throw new Error(); }
       function totalAssert(value: number): void {
         if (value < 0) bailOut(value);
       }
       function setTotal(x: number) {
         totalAssert(x);
       }`,
    );
    const r = recognizeAssert(call, ctx);
    assert.equal(r.kind, "accepted");
  });

  it("admits an Assert with a block body containing a single throw", () => {
    const { call, ctx } = setup(
      `function totalAssert(value: number): void {
         if (value < 0) { throw new Error(); }
       }
       function setTotal(x: number) {
         totalAssert(x);
       }`,
    );
    const r = recognizeAssert(call, ctx);
    assert.equal(r.kind, "accepted");
  });

  it("rejects malformed when body has multiple if statements", () => {
    const { call, ctx } = setup(
      `function rateAssert(value: number): void {
         if (value < 0) throw new Error();
         if (value > 1) throw new Error();
       }
       function f(x: number) { rateAssert(x); }`,
    );
    const r = recognizeAssert(call, ctx);
    assert.equal(r.kind, "malformed");
  });

  it("rejects malformed when if-body is `return` (lets caller continue)", () => {
    const { call, ctx } = setup(
      `function rateAssert(value: number): void {
         if (value < 0) return;
       }
       function f(x: number) { rateAssert(x); }`,
    );
    const r = recognizeAssert(call, ctx);
    assert.equal(r.kind, "malformed");
  });

  it("rejects malformed when if-body is a void-returning call (e.g. logger.error)", () => {
    const { call, ctx } = setup(
      `const logger = { error(_msg: string): void {} };
       function rateAssert(value: number): void {
         if (value < 0) logger.error("bad");
       }
       function f(x: number) { rateAssert(x); }`,
    );
    const r = recognizeAssert(call, ctx);
    assert.equal(r.kind, "malformed");
  });

  it("rejects malformed when the function has more than one parameter", () => {
    const { call, ctx } = setup(
      `function pairAssert(low: number, high: number): void {
         if (low > high) throw new Error();
       }
       function f(x: number, y: number) { pairAssert(x, y); }`,
    );
    const r = recognizeAssert(call, ctx);
    assert.equal(r.kind, "malformed");
  });

  it("rejects malformed when the call argument is a transformation (not an Identifier)", () => {
    const { call, ctx } = setup(
      `function totalAssert(value: number): void {
         if (value < 0) throw new Error();
       }
       function f(x: number) { totalAssert(x - 100); }`,
    );
    const r = recognizeAssert(call, ctx);
    assert.equal(r.kind, "malformed");
  });

  it("rejects malformed when the predicate uses an unsupported call (e.g. Math.abs)", () => {
    const { call, ctx } = setup(
      `function rateAssert(value: number): void {
         if (Math.abs(value - 0.5) > 0.5) throw new Error();
       }
       function f(x: number) { rateAssert(x); }`,
    );
    const r = recognizeAssert(call, ctx);
    assert.equal(r.kind, "malformed");
  });

  it("misses when the callee doesn't end in Assert", () => {
    const fixture = compileSnippet(
      `function checkValue(value: number): void {
         if (value < 0) throw new Error();
       }
       function f(x: number) { checkValue(x); }`,
    );
    let found: ts.CallExpression | null = null;
    function visit(n: ts.Node): void {
      if (found) return;
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "checkValue") {
        found = n;
        return;
      }
      ts.forEachChild(n, visit);
    }
    visit(fixture.sourceFile);
    if (!found) throw new Error("checkValue call not found");
    const innerCtx: NormalizeContext = {
      checker: fixture.checker,
      inputType: { name: "Order", fields: { total: "number" } },
      signature: { name: null, parameters: [{ name: "x", type: "number" }], returnType: "Order" },
    };
    const r = recognizeAssert(found, innerCtx);
    assert.equal(r.kind, "miss");
  });

  it("misses when the call has an extra argument count", () => {
    const fixture = compileSnippet(
      `function totalAssert(value: number): void {
         if (value < 0) throw new Error();
       }
       function f(x: number) { (totalAssert as any)(x, 1); }`,
    );
    let found: ts.CallExpression | null = null;
    function visit(n: ts.Node): void {
      if (found) return;
      if (ts.isCallExpression(n) && n.arguments.length === 2) {
        found = n;
        return;
      }
      ts.forEachChild(n, visit);
    }
    visit(fixture.sourceFile);
    if (!found) throw new Error("two-arg call not found");
    const innerCtx: NormalizeContext = {
      checker: fixture.checker,
      inputType: { name: "Order", fields: { total: "number" } },
      signature: { name: null, parameters: [{ name: "x", type: "number" }], returnType: "Order" },
    };
    const r = recognizeAssert(found, innerCtx);
    // The callee is wrapped in (... as any), not a direct Identifier — so we miss before reaching the count check.
    assert.equal(r.kind, "miss");
  });
});
