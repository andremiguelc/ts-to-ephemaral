import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { discover } from "../../unit/discovery/harness.js";

describe("probes — destructured parameters", () => {
  it("flat destructuring exposes each local as a parameter", () => {
    const { sites } = discover(
      `
        interface Input { ctx: number; input: number }
        interface Order { total: number }
        function f({ ctx, input }: Input): Order { return { total: ctx + input }; }
      `,
      "Order",
      ["total"],
    );
    assert.equal(sites.length, 1);
    assert.deepEqual(
      sites[0].signature.parameters.map((p) => p.name).sort(),
      ["ctx", "input"],
    );
  });

  it("destructured-with-rename records the local name", () => {
    const { sites } = discover(
      `
        interface Input { subtotal: number; tax: number }
        interface Order { total: number }
        function f({ subtotal: s, tax: t }: Input): Order { return { total: s + t }; }
      `,
      "Order",
      ["total"],
    );
    assert.equal(sites.length, 1);
    assert.deepEqual(
      sites[0].signature.parameters.map((p) => p.name).sort(),
      ["s", "t"],
    );
  });

  it("destructured params keep their resolved types", () => {
    const { sites } = discover(
      `
        interface Input { count: number; label: string }
        interface Order { total: number }
        function f({ count, label }: Input): Order { return { total: count }; }
      `,
      "Order",
      ["total"],
    );
    const params = sites[0].signature.parameters;
    assert.equal(params.find((p) => p.name === "count")?.type, "number");
    assert.equal(params.find((p) => p.name === "label")?.type, "string");
  });
});
