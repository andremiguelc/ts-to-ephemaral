import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gate } from "../../../src/subset-gate.js";
import { emitAralFn } from "../../../src/ir-emit.js";
import { discover } from "../../unit/discovery/harness.js";
import type { AralFn, Expr } from "../../../src/types.js";

describe("conformance — first-milestone — bare primitive parameter reference", () => {
  it("positive: bare number param admits as ParamRef and emits valid IR", () => {
    const { sites, diagnostics, checker } = discover(
      `interface Order { total: number }
       function f(newTotal: number): Order { return { total: newTotal }; }`,
      "Order",
      ["total"],
    );
    assert.equal(diagnostics.length, 0);
    assert.equal(sites.length, 1);
    const result = gate(sites[0], checker);
    assert.equal(result.targets[0].kind, "accepted");

    const fn = emitAralFn(result);
    assert.ok(fn);
    assert.deepEqual(fn!.assigns[0].value, { field: { name: "newTotal" } });
    assert.deepEqual(fn!.params, ["newTotal"]);
    assert.deepEqual(fn!.inputFields, ["total"]);
  });

  it("negative: string parameter rejects with param-not-primitive and a rewrite hint", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function f(name: string): Order { return { total: name as any }; }`,
      "Order",
      ["total"],
    );
    const t = gate(sites[0], checker).targets[0];
    assert.equal(t.kind, "rejected");
    if (t.kind !== "rejected") return;
    assert.equal(t.diagnostic.label, "param-not-primitive");
    assert.match(t.diagnostic.suggestion ?? "", /single `number`/);
  });

  it("negative: boolean parameter rejects with param-not-primitive", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function f(flag: boolean): Order { return { total: flag as any }; }`,
      "Order",
      ["total"],
    );
    const t = gate(sites[0], checker).targets[0];
    assert.equal(t.kind, "rejected");
    if (t.kind !== "rejected") return;
    assert.equal(t.diagnostic.label, "param-not-primitive");
  });

  it("negative: any-typed parameter rejects with any-typed-parameter", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function f(x: any): Order { return { total: x }; }`,
      "Order",
      ["total"],
    );
    const t = gate(sites[0], checker).targets[0];
    assert.equal(t.kind, "rejected");
    if (t.kind !== "rejected") return;
    assert.equal(t.diagnostic.label, "any-typed-parameter");
    assert.match(t.diagnostic.suggestion ?? "", /Declare the parameter's type/);
  });

  it("negative: object-typed parameter referenced bare rejects with param-not-primitive", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       interface Args { v: number }
       function f(args: Args): Order { return { total: args as any }; }`,
      "Order",
      ["total"],
    );
    const t = gate(sites[0], checker).targets[0];
    assert.equal(t.kind, "rejected");
    if (t.kind !== "rejected") return;
    assert.equal(t.diagnostic.label, "param-not-primitive");
  });

  it("negative: number | null parameter rejects with nullable-parameter and a narrowing hint", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function f(newTotal: number | null): Order { return { total: newTotal as number }; }`,
      "Order",
      ["total"],
    );
    const t = gate(sites[0], checker).targets[0];
    assert.equal(t.kind, "rejected");
    if (t.kind !== "rejected") return;
    assert.equal(t.diagnostic.label, "nullable-parameter");
    assert.match(t.diagnostic.suggestion ?? "", /narrow|drop the/);
  });

  it("negative: optional `?` parameter rejects with nullable-parameter", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function f(newTotal?: number): Order { return { total: newTotal as number }; }`,
      "Order",
      ["total"],
    );
    const t = gate(sites[0], checker).targets[0];
    assert.equal(t.kind, "rejected");
    if (t.kind !== "rejected") return;
    assert.equal(t.diagnostic.label, "nullable-parameter");
  });

  it("ir round-trip: emitted JSON parses back to a structurally-identical AralFn", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function f(newTotal: number): Order { return { total: newTotal }; }`,
      "Order",
      ["total"],
    );
    const fn = emitAralFn(gate(sites[0], checker));
    assert.ok(fn);
    const round = JSON.parse(JSON.stringify(fn)) as AralFn;
    assert.deepEqual(round, fn);
    assertFieldRefShape(fn!.assigns[0].value);
  });
});

function assertFieldRefShape(expr: Expr): void {
  assert.ok("field" in expr, `expected field, got ${JSON.stringify(expr)}`);
  if (!("field" in expr)) return;
  assert.equal(typeof expr.field, "object");
  assert.equal(typeof (expr.field as { name: string }).name, "string");
}
