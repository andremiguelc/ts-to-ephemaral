import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {
  findEnclosingFunction,
  resolveSignature,
} from "../../../src/discovery/resolve-signature.js";
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

function signatureAroundFirstLiteral(code: string) {
  const { sourceFile, checker } = compileSnippet(code);
  const literal = findFirstObjectLiteral(sourceFile);
  const fn = findEnclosingFunction(literal);
  if (!fn) throw new Error("no enclosing function");
  return resolveSignature(fn, checker);
}

describe("resolve-signature", () => {
  it("resolves a typed-object parameter", () => {
    const sig = signatureAroundFirstLiteral(`
      interface Input { x: number }
      interface Order { total: number }
      function f(input: Input): Order { return { total: input.x }; }
    `);
    assert.deepEqual(sig.parameters, [{ name: "input", type: "Input" }]);
  });

  it("resolves a primitive parameter", () => {
    const sig = signatureAroundFirstLiteral(`
      interface Order { total: number }
      function f(x: number): Order { return { total: x }; }
    `);
    assert.deepEqual(sig.parameters, [{ name: "x", type: "number" }]);
  });

  it("resolves an annotated return type", () => {
    const sig = signatureAroundFirstLiteral(`
      interface Order { total: number }
      function f(): Order { return { total: 1 }; }
    `);
    assert.equal(sig.returnType, "Order");
  });

  it("resolves an inferred return type via the TypeChecker", () => {
    const sig = signatureAroundFirstLiteral(`
      interface Order { total: number }
      function f() {
        const o: Order = { total: 1 };
        return o;
      }
    `);
    assert.equal(sig.returnType, "Order");
  });

  it("resolves multiple parameters in order", () => {
    const sig = signatureAroundFirstLiteral(`
      interface Order { total: number }
      function f(a: number, b: string): Order { return { total: a }; }
    `);
    assert.deepEqual(sig.parameters, [
      { name: "a", type: "number" },
      { name: "b", type: "string" },
    ]);
  });

  it("resolves a destructured object parameter", () => {
    const sig = signatureAroundFirstLiteral(`
      interface Input { subtotal: number; tax: number }
      interface Order { total: number }
      function f({ subtotal, tax }: Input): Order { return { total: subtotal + tax }; }
    `);
    assert.deepEqual(sig.parameters, [
      { name: "subtotal", type: "number" },
      { name: "tax", type: "number" },
    ]);
  });

  it("records the renamed local for destructured-with-rename", () => {
    const sig = signatureAroundFirstLiteral(`
      interface Input { subtotal: number; tax: number }
      interface Order { total: number }
      function f({ subtotal: s, tax: t }: Input): Order { return { total: s + t }; }
    `);
    assert.deepEqual(sig.parameters, [
      { name: "s", type: "number" },
      { name: "t", type: "number" },
    ]);
  });

  it("mixes identifier and destructured parameters in declaration order", () => {
    const sig = signatureAroundFirstLiteral(`
      interface Input { subtotal: number }
      interface Order { total: number }
      function f(prefix: string, { subtotal }: Input): Order { return { total: subtotal }; }
    `);
    assert.deepEqual(sig.parameters, [
      { name: "prefix", type: "string" },
      { name: "subtotal", type: "number" },
    ]);
  });
});
