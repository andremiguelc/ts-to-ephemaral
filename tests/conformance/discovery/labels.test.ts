import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { discover } from "../../unit/discovery/harness.js";

describe("conformance — discovery labels", () => {
  it("unsupported-expression: a clean object literal targeting a resolvable interface", () => {
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

  it("target-type-not-readable: alias chain ends in a shape with no listable members", () => {
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
    assert.equal(diagnostics[0].label, "target-type-not-readable");
    assert.match(diagnostics[0].message, /Order/);
    assert.match(diagnostics[0].message, /cannot list/);
  });

  it("target-type-not-declared: the .aral target name has no declaration in the program", () => {
    const { sites, diagnostics } = discover(
      `
        interface Other { value: number }
        function f(): Other { return { value: 1 }; }
      `,
      "Order",
      ["total"],
    );
    assert.equal(sites.length, 0);
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].label, "target-type-not-declared");
    assert.equal(diagnostics[0].filePath, undefined);
    assert.equal(diagnostics[0].line, undefined);
    assert.match(diagnostics[0].message, /No interface or type alias named Order/);
    assert.match(diagnostics[0].suggestion ?? "", /Add `interface Order/);
  });
});
