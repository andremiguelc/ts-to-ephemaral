import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalize } from "../../../src/normalize/index.js";
import {
  compileWithFixture,
  expressionInsideFirstObjectLiteral,
  findField,
  makeCtx,
  stubCtx,
} from "./harness.js";

describe("normalize/index — dispatcher", () => {
  it("admits a numeric literal as Lit through the dispatcher", () => {
    const expr = expressionInsideFirstObjectLiteral(
      `interface Order { total: number }
       function f(): Order { return { total: 42 }; }`,
      "total",
    );
    const r = normalize(expr, stubCtx());
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.deepEqual(r.cae, { kind: "Lit", value: 42 });
  });

  it("transparently strips parens before dispatching", () => {
    const expr = expressionInsideFirstObjectLiteral(
      `interface Order { total: number }
       function f(): Order { return { total: ((42)) }; }`,
      "total",
    );
    const r = normalize(expr, stubCtx());
    assert.equal(r.kind, "accepted");
  });

  it("transparently strips `as const` before dispatching", () => {
    const expr = expressionInsideFirstObjectLiteral(
      `interface Order { total: number }
       function f(): Order { return { total: 42 as const }; }`,
      "total",
    );
    const r = normalize(expr, stubCtx());
    assert.equal(r.kind, "accepted");
  });

  it("rejects a string literal with unsupported-literal", () => {
    const expr = expressionInsideFirstObjectLiteral(
      `interface Order { total: any }
       function f(): Order { return { total: "42" }; }`,
      "total",
    );
    const r = normalize(expr, stubCtx());
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "unsupported-literal");
  });

  it("admits a bare number parameter as ParamRef through the dispatcher", () => {
    const fixture = compileWithFixture(
      `interface Order { total: number }
       function f(x: number): Order { return { total: x }; }`,
    );
    const expr = findField(fixture.sourceFile, "total");
    const ctx = makeCtx(fixture.checker, "Order", { total: "number" });
    const r = normalize(expr, ctx);
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.deepEqual(r.cae, { kind: "ParamRef", name: "x" });
  });

  it("rejects a binary expression with unsupported-expression", () => {
    const expr = expressionInsideFirstObjectLiteral(
      `interface Order { total: number }
       function f(): Order { return { total: 1 + 1 }; }`,
      "total",
    );
    const r = normalize(expr, stubCtx());
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "unsupported-expression");
  });

  it("rejects a non-integer literal with unsupported-literal (the recognizer's specific label, not the dispatcher's fallback)", () => {
    const expr = expressionInsideFirstObjectLiteral(
      `interface Order { total: number }
       function f(): Order { return { total: 0.5 }; }`,
      "total",
    );
    const r = normalize(expr, stubCtx());
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "unsupported-literal");
  });
});
