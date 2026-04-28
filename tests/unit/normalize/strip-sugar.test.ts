import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { stripSugar } from "../../../src/normalize/strip-sugar.js";
import { expressionInsideFirstObjectLiteral } from "./harness.js";

describe("strip-sugar", () => {
  it("strips a single set of parentheses", () => {
    const expr = expressionInsideFirstObjectLiteral(
      `interface Order { total: number }
       function f(): Order { return { total: (42) }; }`,
      "total",
    );
    const stripped = stripSugar(expr);
    assert.equal(stripped.kind, ts.SyntaxKind.NumericLiteral);
  });

  it("strips deeply nested parentheses", () => {
    const expr = expressionInsideFirstObjectLiteral(
      `interface Order { total: number }
       function f(): Order { return { total: (((42))) }; }`,
      "total",
    );
    const stripped = stripSugar(expr);
    assert.equal(stripped.kind, ts.SyntaxKind.NumericLiteral);
  });

  it("strips an `as` cast", () => {
    const expr = expressionInsideFirstObjectLiteral(
      `interface Order { total: number }
       function f(): Order { return { total: 42 as const }; }`,
      "total",
    );
    const stripped = stripSugar(expr);
    assert.equal(stripped.kind, ts.SyntaxKind.NumericLiteral);
  });

  it("strips a `satisfies` expression", () => {
    const expr = expressionInsideFirstObjectLiteral(
      `interface Order { total: number }
       function f(): Order { return { total: 42 satisfies number }; }`,
      "total",
    );
    const stripped = stripSugar(expr);
    assert.equal(stripped.kind, ts.SyntaxKind.NumericLiteral);
  });

  it("leaves a non-sugared expression alone", () => {
    const expr = expressionInsideFirstObjectLiteral(
      `interface Order { total: number }
       function f(): Order { return { total: 42 }; }`,
      "total",
    );
    const stripped = stripSugar(expr);
    assert.equal(stripped, expr);
  });

  it("strips paren-around-as combinations", () => {
    const expr = expressionInsideFirstObjectLiteral(
      `interface Order { total: number }
       function f(): Order { return { total: ((42 as const)) }; }`,
      "total",
    );
    const stripped = stripSugar(expr);
    assert.equal(stripped.kind, ts.SyntaxKind.NumericLiteral);
  });
});
