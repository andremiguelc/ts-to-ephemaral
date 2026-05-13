import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { recognizeCmp } from "../../../src/normalize/recognize-cmp.js";
import { compileSnippet } from "../discovery/harness.js";
import type { NormalizeContext } from "../../../src/normalize/index.js";
import type { ResolvedTargetType } from "../../../src/types.js";

function firstBinary(sourceFile: ts.SourceFile): ts.BinaryExpression {
  let found: ts.BinaryExpression | null = null;
  function visit(n: ts.Node): void {
    if (found) return;
    if (ts.isBinaryExpression(n)) {
      found = n;
      return;
    }
    ts.forEachChild(n, visit);
  }
  visit(sourceFile);
  if (!found) throw new Error("no binary expression in snippet");
  return found;
}

function setup(code: string): { expr: ts.BinaryExpression; ctx: NormalizeContext } {
  const fixture = compileSnippet(code);
  const expr = firstBinary(fixture.sourceFile);
  const inputType: ResolvedTargetType = { name: "Order", fields: { total: "number" } };
  const ctx: NormalizeContext = {
    checker: fixture.checker,
    inputType,
    signature: { name: null, parameters: [], returnType: "Order" },
  };
  return { expr, ctx };
}

describe("recognize-cmp", () => {
  it("admits a < b as Cmp(lt, ParamRef, ParamRef)", () => {
    const { expr, ctx } = setup(
      `function f(a: number, b: number) { if (a < b) throw new Error(); }`,
    );
    const r = recognizeCmp(expr, ctx);
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.deepEqual(r.predicate, {
      kind: "Cmp",
      op: "lt",
      left: { kind: "ParamRef", name: "a" },
      right: { kind: "ParamRef", name: "b" },
    });
  });

  it("admits a > b as Cmp(gt)", () => {
    const { expr, ctx } = setup(
      `function f(a: number, b: number) { if (a > b) throw new Error(); }`,
    );
    const r = recognizeCmp(expr, ctx);
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.equal((r.predicate as { op: string }).op, "gt");
  });

  it("admits a <= b as Cmp(lte)", () => {
    const { expr, ctx } = setup(
      `function f(a: number, b: number) { if (a <= b) throw new Error(); }`,
    );
    const r = recognizeCmp(expr, ctx);
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.equal((r.predicate as { op: string }).op, "lte");
  });

  it("admits a >= b as Cmp(gte)", () => {
    const { expr, ctx } = setup(
      `function f(a: number, b: number) { if (a >= b) throw new Error(); }`,
    );
    const r = recognizeCmp(expr, ctx);
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.equal((r.predicate as { op: string }).op, "gte");
  });

  it("admits a === b as Cmp(eq) (strict equality on numbers)", () => {
    const { expr, ctx } = setup(
      `function f(a: number, b: number) { if (a === b) throw new Error(); }`,
    );
    const r = recognizeCmp(expr, ctx);
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.equal((r.predicate as { op: string }).op, "eq");
  });

  it("admits a == b as Cmp(eq) (loose equality on numbers — same CAE as strict)", () => {
    const { expr, ctx } = setup(
      `function f(a: number, b: number) { if (a == b) throw new Error(); }`,
    );
    const r = recognizeCmp(expr, ctx);
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.equal((r.predicate as { op: string }).op, "eq");
  });

  it("admits a !== b as Cmp(neq)", () => {
    const { expr, ctx } = setup(
      `function f(a: number, b: number) { if (a !== b) throw new Error(); }`,
    );
    const r = recognizeCmp(expr, ctx);
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.equal((r.predicate as { op: string }).op, "neq");
  });

  it("admits comparison against a literal — value < 0", () => {
    const { expr, ctx } = setup(
      `function f(value: number) { if (value < 0) throw new Error(); }`,
    );
    const r = recognizeCmp(expr, ctx);
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.deepEqual(r.predicate, {
      kind: "Cmp",
      op: "lt",
      left: { kind: "ParamRef", name: "value" },
      right: { kind: "Lit", value: 0 },
    });
  });

  it("rejects cmp-mixed-types when one side narrows to string and the other is number", () => {
    const { expr, ctx } = setup(
      `function f(a: number | string, b: number) {
         if (typeof a === "string") {
           if (a < b) throw new Error();
         }
       }`,
    );
    // The first BinaryExpression in the snippet is the typeof check (a === "string"),
    // not the comparison we want. Find the comparison inside the if-body.
    const fixture = compileSnippet(
      `function f(a: number | string, b: number) {
         if (typeof a === "string") {
           if (a < b) throw new Error();
         }
       }`,
    );
    let target: ts.BinaryExpression | null = null;
    function visit(n: ts.Node): void {
      if (target) return;
      if (
        ts.isBinaryExpression(n) &&
        n.operatorToken.kind === ts.SyntaxKind.LessThanToken
      ) {
        target = n;
        return;
      }
      ts.forEachChild(n, visit);
    }
    visit(fixture.sourceFile);
    if (!target) throw new Error("no `<` binary in snippet");
    const innerCtx: NormalizeContext = {
      checker: fixture.checker,
      inputType: { name: "Order", fields: { total: "number" } },
      signature: { name: null, parameters: [], returnType: "Order" },
    };
    const r = recognizeCmp(target, innerCtx);
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "cmp-mixed-types");
  });

  it("rejects cmp-non-numeric for ordering on booleans", () => {
    const { expr, ctx } = setup(
      `function f(a: boolean, b: boolean) { if (a < b) throw new Error(); }`,
    );
    const r = recognizeCmp(expr, ctx);
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "cmp-non-numeric");
  });

  it("rejects instanceof-operator", () => {
    const { expr, ctx } = setup(
      `class Foo {}; function f(x: any) { if (x instanceof Foo) throw new Error(); }`,
    );
    const r = recognizeCmp(expr, ctx);
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "instanceof-operator");
  });

  it("rejects in-operator", () => {
    const { expr, ctx } = setup(
      `function f(o: { a?: number }) { if ("a" in o) throw new Error(); }`,
    );
    const r = recognizeCmp(expr, ctx);
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "in-operator");
  });

  it("misses on arithmetic + (not its job)", () => {
    const { expr, ctx } = setup(
      `function f(a: number, b: number): number { return a + b; }`,
    );
    const r = recognizeCmp(expr, ctx);
    assert.equal(r.kind, "miss");
  });

  it("misses on logical && (not its job)", () => {
    const { expr, ctx } = setup(
      `function f(a: boolean, b: boolean) { if (a && b) throw new Error(); }`,
    );
    const r = recognizeCmp(expr, ctx);
    assert.equal(r.kind, "miss");
  });
});
