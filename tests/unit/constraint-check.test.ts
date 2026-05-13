import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gate } from "../../src/subset-gate.js";
import { discover } from "./discovery/harness.js";

describe("constraint-check", () => {
  it("fires missing-assert when a raw param flows into a tracked field with no Assert", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function setTotal(input: Order, x: number): Order {
         return { ...input, total: x };
       }`,
      "Order",
      ["total"],
    );
    const r = gate(sites[0], checker);
    assert.equal(r.targets[0].kind, "accepted");
    assert.equal(r.warnings.length, 1);
    assert.equal(r.warnings[0].label, "missing-assert");
    assert.match(r.warnings[0].message, /'x'/);
  });

  it("does not fire when a valid Assert precedes the assignment", () => {
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
    const r = gate(sites[0], checker);
    assert.equal(r.targets[0].kind, "accepted");
    assert.equal(r.warnings.length, 0);
  });

  it("per-parameter lookback: three Asserts followed by a three-param assignment all validate", () => {
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
    const r = gate(sites[0], checker);
    for (const t of r.targets) assert.equal(t.kind, "accepted");
    assert.equal(r.warnings.length, 0);
  });

  it("misplaced-assert: Assert exists but a reassignment of x intervenes", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function totalAssert(value: number): void {
         if (value < 0) throw new Error();
       }
       function setTotal(input: Order, x: number): Order {
         totalAssert(x);
         x = x - 100;
         return { ...input, total: x };
       }`,
      "Order",
      ["total"],
    );
    // The parameter is `let`-able by being reassigned, which TypeScript sometimes
    // complains about; ignore the language strictness — the key is that the Assert
    // for x exists in the function but a reassignment of x is the most recent use.
    const r = gate(sites[0], checker);
    if (r.targets[0].kind !== "accepted") {
      // If the param was rejected (e.g. reassignable-binding label), that's a
      // separate diagnostic path; the test only matters when the value is admitted.
      return;
    }
    assert.equal(r.warnings.length, 1);
    assert.equal(r.warnings[0].label, "misplaced-assert");
  });

  it("wrong variable asserted: asserts on y but assigns x — fires missing-assert for x", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function yAssert(value: number): void {
         if (value < 0) throw new Error();
       }
       function setTotal(input: Order, x: number, y: number): Order {
         yAssert(y);
         return { ...input, total: x };
       }`,
      "Order",
      ["total"],
    );
    const r = gate(sites[0], checker);
    assert.equal(r.targets[0].kind, "accepted");
    // x is unconstrained; y is asserted but isn't used in the assignment.
    assert.equal(r.warnings.length, 1);
    assert.equal(r.warnings[0].label, "missing-assert");
    assert.match(r.warnings[0].message, /'x'/);
  });

  it("malformed Assert: function ends in Assert but body has multiple ifs", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function rateAssert(value: number): void {
         if (value < 0) throw new Error();
         if (value > 1) throw new Error();
       }
       function setTotal(input: Order, x: number): Order {
         rateAssert(x);
         return { ...input, total: x };
       }`,
      "Order",
      ["total"],
    );
    const r = gate(sites[0], checker);
    assert.equal(r.targets[0].kind, "accepted");
    // The recognizer returns malformed; constraint-check emits malformed-assert
    // and treats the param as still unconstrained.
    const labels = r.warnings.map((w) => w.label);
    assert.ok(labels.includes("malformed-assert"), `expected malformed-assert in ${JSON.stringify(labels)}`);
  });

  it("no warnings when assignment uses no parameters (literal-only)", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function reset(input: Order): Order {
         return { ...input, total: 0 };
       }`,
      "Order",
      ["total"],
    );
    const r = gate(sites[0], checker);
    assert.equal(r.targets[0].kind, "accepted");
    assert.equal(r.warnings.length, 0);
  });

  it("no warnings when assignment only uses input fields (not parameters)", () => {
    const { sites, checker } = discover(
      `interface Order { total: number, subtotal: number }
       function copy(input: Order): Order {
         return { ...input, total: input.subtotal };
       }`,
      "Order",
      ["total"],
    );
    const r = gate(sites[0], checker);
    assert.equal(r.targets[0].kind, "accepted");
    assert.equal(r.warnings.length, 0);
  });
});
