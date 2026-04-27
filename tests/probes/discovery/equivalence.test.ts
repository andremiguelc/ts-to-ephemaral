import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { discover } from "../../unit/discovery/harness.js";

function fieldsOf(code: string): string[] {
  const { sites } = discover(code, "Order", ["total", "tax"]);
  assert.equal(sites.length, 1);
  return sites[0].targets.map((t) => t.fieldName).sort();
}

describe("probes — discovery equivalence", () => {
  it("property shorthand and colon-explicit produce equivalent targets", () => {
    const shorthand = fieldsOf(`
      interface Order { total: number; tax: number }
      function f(total: number, tax: number): Order { return { total, tax }; }
    `);
    const explicit = fieldsOf(`
      interface Order { total: number; tax: number }
      function f(total: number, tax: number): Order { return { total: total, tax: tax }; }
    `);
    assert.deepEqual(shorthand, explicit);
    assert.deepEqual(shorthand, ["tax", "total"]);
  });

  it("whitespace and parens around the literal don't change the site", () => {
    const tight = fieldsOf(`
      interface Order { total: number; tax: number }
      function f(): Order { return {total:1,tax:0}; }
    `);
    const spaced = fieldsOf(`
      interface Order { total: number; tax: number }
      function f(): Order { return { total: 1, tax: 0 }; }
    `);
    const parens = fieldsOf(`
      interface Order { total: number; tax: number }
      function f(): Order { return ({ total: 1, tax: 0 }); }
    `);
    assert.deepEqual(tight, spaced);
    assert.deepEqual(spaced, parens);
  });

  it("aliased import of the target type still resolves through the symbol", () => {
    const aliased = fieldsOf(`
      interface Order { total: number; tax: number }
      type O = Order;
      function f(): O { return { total: 1, tax: 0 }; }
    `);
    assert.deepEqual(aliased, ["tax", "total"]);
  });
});
