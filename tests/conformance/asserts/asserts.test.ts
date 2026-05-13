import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gate } from "../../../src/subset-gate.js";
import { emitAralFn } from "../../../src/ir-emit.js";
import { discover } from "../../unit/discovery/harness.js";

describe("conformance — asserts (parser-side, end-to-end through emit)", () => {
  it("positive: assert + assignment emits valid IR with no warnings", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function totalAssert(value: number): void {
         if (value < 0) throw new Error();
       }
       function setTotal(input: Order, x: number): Order {
         totalAssert(x);
         return { ...input, total: x };
       }`,
      "Order",
      ["total"],
    );
    const result = gate(sites[0], checker);
    assert.equal(result.warnings.length, 0);
    const fn = emitAralFn(result);
    assert.ok(fn);
    assert.deepEqual(fn!.assigns[0], {
      fieldName: "total",
      value: { field: { name: "x" } },
    });
    assert.deepEqual(fn!.params, ["x"]);
  });

  it("positive: multi-param with three asserts in a row — all emit, no warnings", () => {
    const { sites, checker } = discover(
      `interface Triple { a: number; b: number; c: number }
       function aAssert(value: number): void { if (value < 0) throw new Error(); }
       function bAssert(value: number): void { if (value < 0) throw new Error(); }
       function cAssert(value: number): void { if (value < 0) throw new Error(); }
       function setAll(input: Triple, a: number, b: number, c: number): Triple {
         aAssert(a);
         bAssert(b);
         cAssert(c);
         return { ...input, a: a, b: b, c: c };
       }`,
      "Triple",
      ["a", "b", "c"],
    );
    const result = gate(sites[0], checker);
    assert.equal(result.warnings.length, 0);
    const fn = emitAralFn(result);
    assert.ok(fn);
    assert.equal(fn!.assigns.length, 3);
    assert.deepEqual(fn!.params.sort(), ["a", "b", "c"]);
  });

  it("negative: missing assert emits IR but warns at parse time", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function setTotal(input: Order, x: number): Order {
         return { ...input, total: x };
       }`,
      "Order",
      ["total"],
    );
    const result = gate(sites[0], checker);
    assert.equal(result.targets[0].kind, "accepted");
    assert.equal(result.warnings.length, 1);
    assert.equal(result.warnings[0].label, "missing-assert");
    // The IR is still emitted — the warning is advisory, not a hard rejection.
    const fn = emitAralFn(result);
    assert.ok(fn);
    assert.deepEqual(fn!.params, ["x"]);
  });

  it("negative: comparison in value position is still rejected (operators stage didn't ship cmp-as-value)", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function f(a: number, b: number): Order { return { total: (a < b) as any }; }`,
      "Order",
      ["total"],
    );
    const result = gate(sites[0], checker);
    assert.equal(result.targets[0].kind, "rejected");
    if (result.targets[0].kind !== "rejected") return;
    // The comparison recognizer is predicate-context-only; value-context misses
    // and falls through to the existing unsupported-expression label.
    assert.equal(result.targets[0].diagnostic.label, "unsupported-expression");
  });
});
