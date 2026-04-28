import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { discover } from "../../unit/discovery/harness.js";

describe("probes — symbol-identity matching", () => {
  it("transparent alias to a named interface still matches", () => {
    const { sites } = discover(
      `
        interface Inner { total: number; tax: number }
        type Order = Inner;
        function f(): Order { return { total: 1, tax: 0 }; }
      `,
      "Order",
      ["total", "tax"],
    );
    assert.equal(sites.length, 1);
  });

  it("aliased Pick utility matches and exposes the picked fields", () => {
    const { sites } = discover(
      `
        interface Inner { total: number; tax: number; subtotal: number }
        type Order = Pick<Inner, "total" | "tax">;
        function f(): Order { return { total: 1, tax: 0 }; }
      `,
      "Order",
      ["total", "tax"],
    );
    assert.equal(sites.length, 1);
    assert.deepEqual(
      sites[0].targets.map((t) => t.fieldName).sort(),
      ["tax", "total"],
    );
  });

  it("aliased Omit utility matches", () => {
    const { sites } = discover(
      `
        interface Inner { total: number; tax: number; subtotal: number }
        type Order = Omit<Inner, "subtotal">;
        function f(): Order { return { total: 1, tax: 0 }; }
      `,
      "Order",
      ["total", "tax"],
    );
    assert.equal(sites.length, 1);
  });

  it("aliased conditional type (z.infer-style) matches", () => {
    const { sites } = discover(
      `
        type Infer<T> = T extends { _out: infer O } ? O : never;
        declare const schema: { _out: { total: number; tax: number } };
        type Order = Infer<typeof schema>;
        function f(): Order { return { total: 1, tax: 0 }; }
      `,
      "Order",
      ["total", "tax"],
    );
    assert.equal(sites.length, 1);
  });

  it("union of aliased alias and null still matches the live constituent", () => {
    const { sites } = discover(
      `
        interface Inner { total: number }
        type Order = Inner;
        function f(b: boolean): Order | null {
          if (b) return null;
          return { total: 1 };
        }
      `,
      "Order",
      ["total"],
    );
    assert.equal(sites.length, 1);
  });

  it("emits a single top-level diagnostic when the target is undeclared", () => {
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
    assert.match(diagnostics[0].message, /No interface or type alias named Order/);
    assert.equal(diagnostics[0].filePath, undefined);
    assert.equal(diagnostics[0].line, undefined);
    assert.match(diagnostics[0].suggestion ?? "", /Add `interface Order/);
  });
});
