import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gate } from "../../../src/subset-gate.js";
import { emitAralFn } from "../../../src/ir-emit.js";
import { discover } from "../../unit/discovery/harness.js";
import type { AralFn } from "../../../src/types.js";

describe("conformance — operators — binary arithmetic", () => {
  it("positive: a + b admits and emits the expected arith IR", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function f(a: number, b: number): Order { return { total: a + b }; }`,
      "Order",
      ["total"],
    );
    const result = gate(sites[0], checker);
    const target = result.targets[0];
    assert.equal(target.kind, "accepted");
    if (target.kind !== "accepted") return;
    assert.deepEqual(target.cae, {
      kind: "Arith",
      op: "add",
      left: { kind: "ParamRef", name: "a" },
      right: { kind: "ParamRef", name: "b" },
    });

    const fn = emitAralFn(result);
    assert.ok(fn);
    assert.deepEqual(fn!.assigns[0].value, {
      arith: {
        op: "add",
        left: { field: { name: "a" } },
        right: { field: { name: "b" } },
      },
    });
    assert.deepEqual(fn!.params, ["a", "b"]);
  });

  it("positive: deeply nested arithmetic emits a nested IR tree", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function f(a: number, b: number, c: number): Order { return { total: (a + b) * c }; }`,
      "Order",
      ["total"],
    );
    const fn = emitAralFn(gate(sites[0], checker));
    assert.ok(fn);
    assert.deepEqual(fn!.assigns[0].value, {
      arith: {
        op: "mul",
        left: {
          arith: {
            op: "add",
            left: { field: { name: "a" } },
            right: { field: { name: "b" } },
          },
        },
        right: { field: { name: "c" } },
      },
    });
    assert.deepEqual(fn!.params, ["a", "b", "c"]);
  });

  it("negative: a % b rejects with unsupported-operator", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function f(a: number, b: number): Order { return { total: a % b }; }`,
      "Order",
      ["total"],
    );
    const target = gate(sites[0], checker).targets[0];
    assert.equal(target.kind, "rejected");
    if (target.kind !== "rejected") return;
    assert.equal(target.diagnostic.label, "unsupported-operator");
  });

  it("negative: string-typed operand rejects with arith-on-string", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function f(s: string, n: number): Order { return { total: (s + n) as any }; }`,
      "Order",
      ["total"],
    );
    const target = gate(sites[0], checker).targets[0];
    assert.equal(target.kind, "rejected");
    if (target.kind !== "rejected") return;
    assert.equal(target.diagnostic.label, "arith-on-string");
  });

  it("ir round-trip: arithmetic IR parses back to a structurally-identical AralFn", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function f(a: number, b: number): Order { return { total: a * b - 1 }; }`,
      "Order",
      ["total"],
    );
    const fn = emitAralFn(gate(sites[0], checker));
    assert.ok(fn);
    const round = JSON.parse(JSON.stringify(fn)) as AralFn;
    assert.deepEqual(round, fn);
  });
});
