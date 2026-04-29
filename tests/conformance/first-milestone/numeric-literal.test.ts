import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gate } from "../../../src/subset-gate.js";
import { emitAralFn } from "../../../src/ir-emit.js";
import { discover } from "../../unit/discovery/harness.js";
import type { AralFn, Expr } from "../../../src/types.js";

describe("conformance — first-milestone — numeric literal", () => {
  it("positive: a numeric literal admits as Lit and emits valid IR", () => {
    const { sites, diagnostics, checker } = discover(
      `interface Order { total: number }
       function f(): Order { return { total: 42 }; }`,
      "Order",
      ["total"],
    );
    assert.equal(diagnostics.length, 0);
    assert.equal(sites.length, 1);
    const result = gate(sites[0], checker);
    assert.equal(result.targets[0].kind, "accepted");

    const fn = emitAralFn(result);
    assert.ok(fn);
    assert.deepEqual(fn!.assigns[0].value, { lit: 42 });
  });

  it("negative: a string literal at the same site rejects with unsupported-literal", () => {
    const { sites, checker } = discover(
      `interface Order { total: any }
       function f(): Order { return { total: "42" }; }`,
      "Order",
      ["total"],
    );
    const result = gate(sites[0], checker);
    const t = result.targets[0];
    assert.equal(t.kind, "rejected");
    if (t.kind !== "rejected") return;
    assert.equal(t.diagnostic.label, "unsupported-literal");
    assert.match(t.diagnostic.message, /Order\.total/);
    assert.match(t.diagnostic.message, /string literals are not supported/);
    assert.equal(t.diagnostic.suggestion, undefined);
  });

  it("ir round-trip: emitted JSON parses back to a structurally-identical AralFn", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function f(): Order { return { total: 7 }; }`,
      "Order",
      ["total"],
    );
    const fn = emitAralFn(gate(sites[0], checker));
    assert.ok(fn);
    const round = JSON.parse(JSON.stringify(fn)) as AralFn;
    assert.deepEqual(round, fn);
    assertLitOnlyShape(fn!);
  });
});

function assertLitOnlyShape(fn: AralFn): void {
  assert.equal(typeof fn.name, "string");
  assert.equal(typeof fn.inputType, "string");
  assert.ok(Array.isArray(fn.inputFields));
  assert.ok(Array.isArray(fn.params));
  assert.ok(Array.isArray(fn.assigns));
  for (const a of fn.assigns) {
    assert.equal(typeof a.fieldName, "string");
    assertLitExpr(a.value);
  }
}

function assertLitExpr(expr: Expr): void {
  assert.ok("lit" in expr, `expected lit, got ${JSON.stringify(expr)}`);
  if (!("lit" in expr)) return;
  assert.equal(typeof expr.lit, "number");
  assert.ok(Number.isInteger(expr.lit), `lit must be an integer, got ${expr.lit}`);
}
