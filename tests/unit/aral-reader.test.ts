/**
 * Direct tests for readAralFile — the .aral metadata extractor.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readAralFile } from "../../src/aral-reader.js";

describe("aral-reader — basic parsing", () => {
  it("empty input produces empty target", () => {
    const t = readAralFile("");
    assert.equal(t.rootPrefix, "");
    assert.equal(t.typeName, "");
    assert.deepStrictEqual(t.fieldNames, []);
    assert.deepStrictEqual(t.collectionNames, []);
  });

  it("comment-only input produces empty target", () => {
    const t = readAralFile("# just a comment\n# another");
    assert.equal(t.rootPrefix, "");
  });

  it("single invariant with a root.field reference", () => {
    const t = readAralFile(`
      invariant totalIsNonNeg:
        payment.total >= 0
    `);
    assert.equal(t.rootPrefix, "payment");
    assert.equal(t.typeName, "Payment");
    assert.deepStrictEqual(t.fieldNames, ["total"]);
  });

  it("root prefix capitalizes correctly for camelCase", () => {
    const t = readAralFile(`
      invariant check:
        bookingLimit.seats > 0
    `);
    assert.equal(t.typeName, "BookingLimit");
  });

  it("multiple fields accumulate", () => {
    const t = readAralFile(`
      invariant c:
        order.total >= order.subtotal - order.discount
    `);
    assert.deepStrictEqual(
      new Set(t.fieldNames),
      new Set(["total", "subtotal", "discount"]),
    );
  });
});

describe("aral-reader — collections", () => {
  it("sum(root.collection, ...) registers the collection", () => {
    const t = readAralFile(`
      invariant matches:
        order.total == sum(order.items, quantity * unitPrice)
    `);
    assert.deepStrictEqual(t.collectionNames, ["items"]);
    assert.ok(t.collectionItemFields.has("items"));
    assert.deepStrictEqual(
      new Set(t.collectionItemFields.get("items")),
      new Set(["quantity", "unitPrice"]),
    );
    // `items` is registered as a collection, not a scalar field.
    assert.ok(!t.fieldNames.includes("items"));
  });

  it("each(root.collection, ...) works the same way", () => {
    const t = readAralFile(`
      invariant allPositive:
        each(order.items, price > 0)
    `);
    assert.deepStrictEqual(t.collectionNames, ["items"]);
  });

  it("reserved words inside collection body are filtered from item fields", () => {
    const t = readAralFile(`
      invariant v:
        each(order.items, price > 0 and quantity > 0)
    `);
    const fields = t.collectionItemFields.get("items") ?? [];
    assert.ok(fields.includes("price"));
    assert.ok(fields.includes("quantity"));
    assert.ok(!fields.includes("and"));
  });

  it("numeric literals in collection body don't become fields", () => {
    const t = readAralFile(`
      invariant v:
        each(order.items, quantity > 5)
    `);
    const fields = t.collectionItemFields.get("items") ?? [];
    assert.ok(fields.includes("quantity"));
    assert.ok(!fields.some((f) => /^\d+$/.test(f)));
  });
});

describe("aral-reader — mixed scalar and collection", () => {
  it("collection names are not added to fieldNames", () => {
    const t = readAralFile(`
      invariant c:
        order.total == sum(order.items, price)
        order.subtotal >= 0
    `);
    assert.ok(t.fieldNames.includes("total"));
    assert.ok(t.fieldNames.includes("subtotal"));
    assert.ok(!t.fieldNames.includes("items"));
    assert.ok(t.collectionNames.includes("items"));
  });
});
