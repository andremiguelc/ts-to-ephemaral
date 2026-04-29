import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gate } from "../../src/subset-gate.js";
import { discover } from "./discovery/harness.js";

describe("subset-gate", () => {
  it("admits a single numeric-literal target", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function f(): Order { return { total: 42 }; }`,
      "Order",
      ["total"],
    );
    assert.equal(sites.length, 1);
    const r = gate(sites[0], checker);
    assert.equal(r.targets.length, 1);
    assert.equal(r.targets[0].kind, "accepted");
    if (r.targets[0].kind !== "accepted") return;
    assert.deepEqual(r.targets[0].cae, { kind: "Lit", value: 42 });
  });

  it("rejects a target whose expression is not yet admitted (binary expression)", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function f(): Order { return { total: 1 + 1 }; }`,
      "Order",
      ["total"],
    );
    assert.equal(sites.length, 1);
    const r = gate(sites[0], checker);
    assert.equal(r.targets.length, 1);
    assert.equal(r.targets[0].kind, "rejected");
    if (r.targets[0].kind !== "rejected") return;
    assert.equal(r.targets[0].diagnostic.label, "unsupported-expression");
    assert.match(r.targets[0].diagnostic.message, /Order\.total/);
  });

  it("rejects a string literal target with unsupported-literal", () => {
    const { sites, checker } = discover(
      `interface Order { total: any }
       function f(): Order { return { total: "42" }; }`,
      "Order",
      ["total"],
    );
    assert.equal(sites.length, 1);
    const r = gate(sites[0], checker);
    assert.equal(r.targets[0].kind, "rejected");
    if (r.targets[0].kind !== "rejected") return;
    assert.equal(r.targets[0].diagnostic.label, "unsupported-literal");
    assert.equal(r.targets[0].diagnostic.suggestion, undefined);
  });

  it("preserves coverage across mixed targets — one accepts, one rejects", () => {
    const { sites, checker } = discover(
      `interface Pair { a: number; b: number }
       function f(s: string): Pair { return { a: 7, b: s as any }; }`,
      "Pair",
      ["a", "b"],
    );
    assert.equal(sites.length, 1);
    const r = gate(sites[0], checker);
    assert.equal(r.targets.length, 2);
    const byField = Object.fromEntries(r.targets.map((t) => [t.fieldName, t]));
    assert.equal(byField.a.kind, "accepted");
    assert.equal(byField.b.kind, "rejected");
  });

  it("attaches file path and line to rejection diagnostics", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function f(): Order { return { total: "42" as any }; }`,
      "Order",
      ["total"],
    );
    const r = gate(sites[0], checker);
    if (r.targets[0].kind !== "rejected") {
      assert.fail("expected rejection");
    }
    assert.ok(r.targets[0].diagnostic.filePath);
    assert.ok((r.targets[0].diagnostic.line ?? 0) > 0);
  });
});
