import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gate } from "../../src/subset-gate.js";
import { emitAralFn } from "../../src/ir-emit.js";
import { discover } from "./discovery/harness.js";

describe("ir-emit", () => {
  it("emits a one-field AralFn for an accepted Lit site", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function f(): Order { return { total: 42 }; }`,
      "Order",
      ["total"],
    );
    const result = gate(sites[0], checker);
    const fn = emitAralFn(result);
    assert.ok(fn);
    assert.equal(fn!.inputType, "Order");
    assert.deepEqual(fn!.inputFields, ["total"]);
    assert.deepEqual(fn!.params, []);
    assert.equal(fn!.assigns.length, 1);
    assert.equal(fn!.assigns[0].fieldName, "total");
    assert.deepEqual(fn!.assigns[0].value, { lit: 42 });
  });

  it("returns null when no targets accepted", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function f(s: string): Order { return { total: s as any }; }`,
      "Order",
      ["total"],
    );
    const result = gate(sites[0], checker);
    const fn = emitAralFn(result);
    assert.equal(fn, null);
  });

  it("emits only the accepted targets when the site is partial", () => {
    const { sites, checker } = discover(
      `interface Pair { a: number; b: number }
       function f(s: string): Pair { return { a: 7, b: s as any }; }`,
      "Pair",
      ["a", "b"],
    );
    const result = gate(sites[0], checker);
    const fn = emitAralFn(result);
    assert.ok(fn);
    assert.deepEqual(fn!.inputFields, ["a"]);
    assert.equal(fn!.assigns.length, 1);
    assert.deepEqual(fn!.assigns[0], { fieldName: "a", value: { lit: 7 } });
  });

  it("emits ParamRef as field-shape and lists the name in params", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function f(newTotal: number): Order { return { total: newTotal }; }`,
      "Order",
      ["total"],
    );
    const fn = emitAralFn(gate(sites[0], checker));
    assert.ok(fn);
    assert.deepEqual(fn!.assigns[0].value, { field: { name: "newTotal" } });
    assert.deepEqual(fn!.params, ["newTotal"]);
  });

  it("synthesizes a name as <functionName>-<fieldName>", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function f(): Order { return { total: 42 }; }`,
      "Order",
      ["total"],
    );
    const fn = emitAralFn(gate(sites[0], checker));
    assert.ok(fn);
    assert.equal(fn!.name, "f-total");
  });

  it("uses the const-bound name when the function is an arrow", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       const build = (): Order => ({ total: 42 });`,
      "Order",
      ["total"],
    );
    const fn = emitAralFn(gate(sites[0], checker));
    assert.ok(fn);
    assert.equal(fn!.name, "build-total");
  });

  it("falls back to anon-l<line> when no function name is available", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       export default (): Order => ({ total: 42 });`,
      "Order",
      ["total"],
    );
    const fn = emitAralFn(gate(sites[0], checker));
    assert.ok(fn);
    assert.match(fn!.name, /^anon-l\d+-total$/);
  });
});
