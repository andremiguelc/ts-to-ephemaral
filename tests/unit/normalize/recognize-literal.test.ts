import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recognizeLiteral } from "../../../src/normalize/recognize-literal.js";
import { expressionInsideFirstObjectLiteral } from "./harness.js";

describe("recognize-literal", () => {
  it("admits a positive integer numeric literal as Lit", () => {
    const expr = expressionInsideFirstObjectLiteral(
      `interface Order { total: number }
       function f(): Order { return { total: 42 }; }`,
      "total",
    );
    const r = recognizeLiteral(expr);
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.deepEqual(r.cae, { kind: "Lit", value: 42 });
  });

  it("admits a zero literal", () => {
    const expr = expressionInsideFirstObjectLiteral(
      `interface Order { total: number }
       function f(): Order { return { total: 0 }; }`,
      "total",
    );
    const r = recognizeLiteral(expr);
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.deepEqual(r.cae, { kind: "Lit", value: 0 });
  });

  it("misses on identifiers (not its job)", () => {
    const expr = expressionInsideFirstObjectLiteral(
      `interface Order { total: number }
       function f(x: number): Order { return { total: x }; }`,
      "total",
    );
    const r = recognizeLiteral(expr);
    assert.equal(r.kind, "miss");
  });

  it("rejects a string literal with unsupported-literal", () => {
    const expr = expressionInsideFirstObjectLiteral(
      `interface Order { total: any }
       function f(): Order { return { total: "42" }; }`,
      "total",
    );
    const r = recognizeLiteral(expr);
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "unsupported-literal");
    assert.match(r.reason, /string literal/);
  });

  it("rejects a template literal with unsupported-literal", () => {
    const expr = expressionInsideFirstObjectLiteral(
      "interface Order { total: any }\nfunction f(): Order { return { total: `${1}` }; }",
      "total",
    );
    const r = recognizeLiteral(expr);
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "unsupported-literal");
    assert.match(r.reason, /template literal/);
  });

  it("rejects a no-substitution template (`abc`) with unsupported-literal", () => {
    const expr = expressionInsideFirstObjectLiteral(
      "interface Order { total: any }\nfunction f(): Order { return { total: `42` }; }",
      "total",
    );
    const r = recognizeLiteral(expr);
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "unsupported-literal");
  });

  it("rejects a BigInt literal with unsupported-literal", () => {
    const expr = expressionInsideFirstObjectLiteral(
      `interface Order { total: any }
       function f(): Order { return { total: 42n }; }`,
      "total",
    );
    const r = recognizeLiteral(expr);
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "unsupported-literal");
    assert.match(r.reason, /BigInt/);
  });

  it("rejects a non-integer numeric literal with unsupported-literal", () => {
    const expr = expressionInsideFirstObjectLiteral(
      `interface Order { total: number }
       function f(): Order { return { total: 42.5 }; }`,
      "total",
    );
    const r = recognizeLiteral(expr);
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "unsupported-literal");
    assert.match(r.reason, /fractional numbers/);
  });
});
