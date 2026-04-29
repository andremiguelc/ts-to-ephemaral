import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recognizeParamRef } from "../../../src/normalize/recognize-param-ref.js";
import { stripSugar } from "../../../src/normalize/strip-sugar.js";
import { compileWithFixture, findField } from "./harness.js";

function setup(code: string, field: string) {
  const fixture = compileWithFixture(code);
  const expr = stripSugar(findField(fixture.sourceFile, field));
  return { expr, checker: fixture.checker };
}

describe("recognize-param-ref", () => {
  it("admits a bare number parameter", () => {
    const { expr, checker } = setup(
      `interface Order { total: number }
       function f(newTotal: number): Order { return { total: newTotal }; }`,
      "total",
    );
    const r = recognizeParamRef(expr, { checker });
    assert.equal(r.kind, "accepted");
    if (r.kind !== "accepted") return;
    assert.deepEqual(r.cae, { kind: "ParamRef", name: "newTotal" });
  });

  it("admits a number parameter with a default value", () => {
    const { expr, checker } = setup(
      `interface Order { total: number }
       function f(newTotal: number = 0): Order { return { total: newTotal }; }`,
      "total",
    );
    const r = recognizeParamRef(expr, { checker });
    assert.equal(r.kind, "accepted");
  });

  it("rejects any-typed-parameter when the parameter has no declared type", () => {
    const { expr, checker } = setup(
      `interface Order { total: number }
       function f(newTotal: any): Order { return { total: newTotal }; }`,
      "total",
    );
    const r = recognizeParamRef(expr, { checker });
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "any-typed-parameter");
  });

  it("rejects nullable-parameter for number | null", () => {
    const { expr, checker } = setup(
      `interface Order { total: number }
       function f(newTotal: number | null): Order { return { total: newTotal as number }; }`,
      "total",
    );
    const r = recognizeParamRef(expr, { checker });
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "nullable-parameter");
  });

  it("rejects nullable-parameter for number | undefined", () => {
    const { expr, checker } = setup(
      `interface Order { total: number }
       function f(newTotal: number | undefined): Order { return { total: newTotal as number }; }`,
      "total",
    );
    const r = recognizeParamRef(expr, { checker });
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "nullable-parameter");
  });

  it("rejects nullable-parameter for an optional `?` parameter", () => {
    const { expr, checker } = setup(
      `interface Order { total: number }
       function f(newTotal?: number): Order { return { total: newTotal as number }; }`,
      "total",
    );
    const r = recognizeParamRef(expr, { checker });
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "nullable-parameter");
  });

  it("rejects param-not-primitive for string", () => {
    const { expr, checker } = setup(
      `interface Order { total: number }
       function f(name: string): Order { return { total: name as any }; }`,
      "total",
    );
    const r = recognizeParamRef(expr, { checker });
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "param-not-primitive");
  });

  it("rejects param-not-primitive for boolean", () => {
    const { expr, checker } = setup(
      `interface Order { total: number }
       function f(flag: boolean): Order { return { total: flag as any }; }`,
      "total",
    );
    const r = recognizeParamRef(expr, { checker });
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "param-not-primitive");
  });

  it("rejects param-not-primitive for an object-typed parameter referenced bare", () => {
    const { expr, checker } = setup(
      `interface Order { total: number }
       interface Args { v: number }
       function f(args: Args): Order { return { total: args as any }; }`,
      "total",
    );
    const r = recognizeParamRef(expr, { checker });
    assert.equal(r.kind, "rejected");
    if (r.kind !== "rejected") return;
    assert.equal(r.label, "param-not-primitive");
  });

  it("misses when the identifier resolves to a const local (not a parameter)", () => {
    const { expr, checker } = setup(
      `interface Order { total: number }
       function f(): Order { const t = 42; return { total: t }; }`,
      "total",
    );
    const r = recognizeParamRef(expr, { checker });
    assert.equal(r.kind, "miss");
  });

  it("misses when the identifier resolves to a destructured-param binding element", () => {
    const { expr, checker } = setup(
      `interface Order { total: number }
       function f({ x }: { x: number }): Order { return { total: x }; }`,
      "total",
    );
    const r = recognizeParamRef(expr, { checker });
    assert.equal(r.kind, "miss");
  });

  it("misses on a numeric literal (not its job)", () => {
    const { expr, checker } = setup(
      `interface Order { total: number }
       function f(): Order { return { total: 42 }; }`,
      "total",
    );
    const r = recognizeParamRef(expr, { checker });
    assert.equal(r.kind, "miss");
  });
});
