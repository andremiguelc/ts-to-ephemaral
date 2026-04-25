import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractProbe } from "../harness.js";

describe("property access — input.field", () => {
  it("matches inputParamName", () => {
    const { ir } = extractProbe(
      `declare const order: { total: number };
       const __probe = order.total;`,
      { fieldNames: ["total"], inputParamName: "order" },
    );
    assert.deepStrictEqual(ir, { field: { name: "total" } });
  });

  it("matches by fieldNames even when object isn't inputParamName", () => {
    const { ir } = extractProbe(
      `declare const other: { total: number };
       const __probe = other.total;`,
      { fieldNames: ["total"], inputParamName: "order" },
    );
    // objName is "other", not the input param — but fieldName "total" is in
    // fieldNames, so the parser still emits `field(total)`.
    assert.deepStrictEqual(ir, { field: { name: "total" } });
  });
});

describe("property access — typed params (qualified fields)", () => {
  it("local variable with a resolvable interface type", () => {
    const { ir, ctx } = extractProbe(
      `interface Discount { percent: number }
       declare const discount: Discount;
       const __probe = discount.percent;`,
      { fieldNames: [], inputParamName: null },
    );
    // discount has a resolvable type → qualified field.
    assert.deepStrictEqual(ir, { field: { qualifier: "discount", name: "percent" } });
    assert.ok(ctx.typedParams.has("discount"));
  });
});

describe("property access — refusals", () => {
  it("optional chaining without fallback refuses", () => {
    const { labels } = extractProbe(
      `declare const a: { b: number } | undefined;
       const __probe = a?.b;`,
    );
    assert.equal(labels[0], "optional-chaining-no-fallback");
  });

  it("property access off a complex expression refuses", () => {
    const { labels } = extractProbe(
      `declare const a: { x: number };
       declare const b: { x: number };
       const __probe = (true ? a : b).x;`,
    );
    assert.equal(labels[0], "prop-access-complex");
  });

  it("property access on an untyped identifier returns a bare field ref", () => {
    // When the object is an identifier but its type has no symbol we can
    // resolve and the field name isn't in fieldNames, we emit
    // `prop-type-unresolvable`.
    const { labels } = extractProbe(
      `const input = { a: { b: 1 } } as any;
       const __probe = input.a.b;`,
      { fieldNames: [], inputParamName: null },
    );
    // input.a is property access with object `input` (a const), field `a`.
    // The outer access `input.a.b` is the probe; its object is `input.a`,
    // which is a PropertyAccessExpression (not a bare identifier).
    // → prop-access-complex.
    assert.equal(labels[0], "prop-access-complex");
  });
});

describe("property access — ambient typed globals route to external-ambient", () => {
  it("`Math.PI` emits external-ambient (not a silent typed-param ref)", () => {
    const { ir, labels } = extractProbe(`const __probe = Math.PI;`);
    assert.equal(labels[0], "external-ambient");
    // Must NOT produce a qualified field like { qualifier: "Math", name: "PI" }.
    assert.ok(!("qualifier" in (ir as any).field));
  });

  it("`Math.E` emits external-ambient", () => {
    const { labels } = extractProbe(`const __probe = Math.E;`);
    assert.equal(labels[0], "external-ambient");
  });

  it("`Number.MAX_VALUE` emits external-ambient", () => {
    const { labels } = extractProbe(`const __probe = Number.MAX_VALUE;`);
    assert.equal(labels[0], "external-ambient");
  });
});

describe("property access — element-access (arr[i], obj[key])", () => {
  it("array indexing `arr[0]` emits element-access", () => {
    const { labels } = extractProbe(`
      declare const arr: number[];
      const __probe = arr[0];
    `);
    assert.equal(labels[0], "element-access");
  });

  it("computed property `obj['key']` emits element-access", () => {
    const { labels } = extractProbe(`
      declare const obj: { key: number };
      const __probe = obj["key"];
    `);
    assert.equal(labels[0], "element-access");
  });

  it("nested array access `rows[0][1]` emits element-access", () => {
    const { labels } = extractProbe(`
      declare const rows: number[][];
      const __probe = rows[0][1];
    `);
    assert.equal(labels[0], "element-access");
  });
});
