import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gate } from "../../../src/subset-gate.js";
import { emitAralFn } from "../../../src/ir-emit.js";
import { discover } from "../../unit/discovery/harness.js";
import type { AralFn } from "../../../src/types.js";

describe("conformance — first-milestone — single-assignment const inlining", () => {
  it("positive: const aliasing a parameter admits and emits IR identical to direct reference", () => {
    const { sites: sitesAlias, checker: checkerAlias } = discover(
      `interface Order { total: number }
       function f(newTotal: number): Order { const t = newTotal; return { total: t }; }`,
      "Order",
      ["total"],
    );
    const fnAlias = emitAralFn(gate(sitesAlias[0], checkerAlias));
    assert.ok(fnAlias);

    const { sites: sitesDirect, checker: checkerDirect } = discover(
      `interface Order { total: number }
       function f(newTotal: number): Order { return { total: newTotal }; }`,
      "Order",
      ["total"],
    );
    const fnDirect = emitAralFn(gate(sitesDirect[0], checkerDirect));
    assert.ok(fnDirect);

    // The substitution proof on disk: aliased and direct produce byte-identical IR.
    assert.deepEqual(fnAlias!.assigns, fnDirect!.assigns);
    assert.deepEqual(fnAlias!.params, fnDirect!.params);
  });

  it("positive: const aliasing a literal admits as Lit", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function f(): Order { const t = 42; return { total: t }; }`,
      "Order",
      ["total"],
    );
    const result = gate(sites[0], checker);
    const target = result.targets[0];
    assert.equal(target.kind, "accepted");
    if (target.kind !== "accepted") return;
    assert.deepEqual(target.cae, { kind: "Lit", value: 42 });
  });

  it("negative: let binding rejects with reassignable-binding and a use-const hint", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function f(newTotal: number): Order { let t = newTotal; return { total: t }; }`,
      "Order",
      ["total"],
    );
    const target = gate(sites[0], checker).targets[0];
    assert.equal(target.kind, "rejected");
    if (target.kind !== "rejected") return;
    assert.equal(target.diagnostic.label, "reassignable-binding");
    assert.match(target.diagnostic.suggestion ?? "", /const/);
  });

  it("negative: var binding rejects with reassignable-binding", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function f(newTotal: number): Order { var t = newTotal; return { total: t }; }`,
      "Order",
      ["total"],
    );
    const target = gate(sites[0], checker).targets[0];
    assert.equal(target.kind, "rejected");
    if (target.kind !== "rejected") return;
    assert.equal(target.diagnostic.label, "reassignable-binding");
  });

  it("propagation: a const whose initializer is out-of-subset reports the initializer's label", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function f(): Order { const t = "x"; return { total: t as any }; }`,
      "Order",
      ["total"],
    );
    const target = gate(sites[0], checker).targets[0];
    assert.equal(target.kind, "rejected");
    if (target.kind !== "rejected") return;
    // Not "reassignable-binding" — the const is transparent; the initializer's
    // rejection wins.
    assert.equal(target.diagnostic.label, "unsupported-literal");
  });

  it("ir round-trip: aliased-const IR parses back to a structurally-identical AralFn", () => {
    const { sites, checker } = discover(
      `interface Order { total: number }
       function f(newTotal: number): Order { const t = newTotal; return { total: t }; }`,
      "Order",
      ["total"],
    );
    const fn = emitAralFn(gate(sites[0], checker));
    assert.ok(fn);
    const round = JSON.parse(JSON.stringify(fn)) as AralFn;
    assert.deepEqual(round, fn);
  });
});
