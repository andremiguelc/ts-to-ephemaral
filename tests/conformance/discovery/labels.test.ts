import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { discover } from "../../unit/discovery/harness.js";

describe("conformance — discovery labels", () => {
  it("not-yet-admitted: a clean object literal targeting a resolvable interface", () => {
    const { sites, diagnostics } = discover(
      `
        interface Order { total: number; tax: number }
        function f(input: { x: number }): Order {
          return { total: input.x, tax: 0 };
        }
      `,
      "Order",
      ["total", "tax"],
    );
    assert.equal(sites.length, 1);
    assert.equal(diagnostics.length, 0);
    assert.deepEqual(
      sites[0].targets.map((t) => t.fieldName).sort(),
      ["tax", "total"],
    );
  });

  it("target-type-unresolvable: alias chain ends in a shape with no readable properties", () => {
    const { sites, diagnostics } = discover(
      `
        type Order = Record<string, never>;
        function f(): Order { return {}; }
      `,
      "Order",
      ["total"],
    );
    assert.equal(sites.length, 0);
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].label, "target-type-unresolvable");
    assert.match(diagnostics[0].reason, /no readable properties/);
  });
});
