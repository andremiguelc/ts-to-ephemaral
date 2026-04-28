import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { resolveTargetType } from "../../../src/discovery/resolve-target-type.js";
import { compileSnippet } from "./harness.js";

function findFirstObjectLiteral(sf: ts.SourceFile): ts.ObjectLiteralExpression {
  let found: ts.ObjectLiteralExpression | null = null;
  function visit(n: ts.Node) {
    if (found) return;
    if (ts.isObjectLiteralExpression(n)) {
      found = n;
      return;
    }
    ts.forEachChild(n, visit);
  }
  visit(sf);
  if (!found) throw new Error("no object literal in snippet");
  return found;
}

function resolveContextualOf(code: string) {
  const { sourceFile, checker } = compileSnippet(code);
  const literal = findFirstObjectLiteral(sourceFile);
  const ctxType = checker.getContextualType(literal);
  if (!ctxType) throw new Error("snippet's literal has no contextual type");
  return resolveTargetType(ctxType, checker, literal);
}

describe("resolve-target-type", () => {
  it("resolves a plain interface", () => {
    const result = resolveContextualOf(`
      interface Order { total: number; tax: number }
      function f(): Order { return { total: 1, tax: 0 }; }
    `);
    assert.equal(result.kind, "resolved");
    if (result.kind === "resolved") {
      assert.equal(result.type.name, "Order");
      assert.deepEqual(Object.keys(result.type.fields).sort(), ["tax", "total"]);
      assert.equal(result.type.fields.total, "number");
    }
  });

  it("resolves a plain type alias to a literal", () => {
    const result = resolveContextualOf(`
      type Order = { total: number };
      function f(): Order { return { total: 1 }; }
    `);
    assert.equal(result.kind, "resolved");
    if (result.kind === "resolved") {
      assert.equal(result.type.name, "Order");
      assert.deepEqual(Object.keys(result.type.fields), ["total"]);
    }
  });

  it("resolves a deep alias chain ending in an interface", () => {
    const result = resolveContextualOf(`
      interface Inner { total: number }
      type Mid = Inner;
      type Order = Mid;
      function f(): Order { return { total: 1 }; }
    `);
    assert.equal(result.kind, "resolved");
    if (result.kind === "resolved") {
      assert.deepEqual(Object.keys(result.type.fields), ["total"]);
    }
  });

  it("rejects when the alias chain ends in a shape with no readable properties", () => {
    const result = resolveContextualOf(`
      type Order = Record<string, never>;
      function f(): Order { return {}; }
    `);
    assert.equal(result.kind, "unresolvable");
    if (result.kind === "unresolvable") {
      assert.match(result.reason, /cannot list this type's members/);
    }
  });
});
