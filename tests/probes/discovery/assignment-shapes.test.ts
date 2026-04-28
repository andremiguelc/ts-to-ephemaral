import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { discover } from "../../unit/discovery/harness.js";

describe("probes — assignment shapes", () => {
  it("constructor with three `this.field = expr` lines yields three sites", () => {
    const { sites } = discover(
      `
        class Service {
          a: number;
          b: number;
          c: number;
          constructor(x: number, y: number, z: number) {
            this.a = x;
            this.b = y;
            this.c = z;
          }
        }
      `,
      "Service",
      ["a", "b", "c"],
    );
    assert.equal(sites.length, 3);
    assert.deepEqual(
      sites.map((s) => s.targets[0].fieldName).sort(),
      ["a", "b", "c"],
    );
  });

  it("`this.field = literal` produces one assignment site, not two", () => {
    const { sites } = discover(
      `
        interface Inner { x: number }
        class Holder {
          inner: Inner = { x: 0 };
          reset(): void {
            this.inner = { x: 1 };
          }
        }
      `,
      "Holder",
      ["inner"],
    );
    assert.equal(sites.length, 1);
    assert.equal(sites[0].targets.length, 1);
    assert.equal(sites[0].targets[0].fieldName, "inner");
  });

  it("`obj.field = expr` on a typed parameter produces a site", () => {
    const { sites } = discover(
      `
        interface Order { total: number }
        function reset(o: Order, n: number): void {
          o.total = n;
        }
      `,
      "Order",
      ["total"],
    );
    assert.equal(sites.length, 1);
    assert.equal(sites[0].targets[0].fieldName, "total");
  });

  it("multi-hop LHS anchors on the receiver of the final access", () => {
    const { sites } = discover(
      `
        interface Order { total: number }
        class Holder {
          order: Order;
          constructor(o: Order) { this.order = o; }
        }
        function bump(h: Holder, n: number): void {
          h.order.total = n;
        }
      `,
      "Order",
      ["total"],
    );
    assert.equal(sites.length, 1);
    assert.equal(sites[0].targetType.name, "Order");
    assert.equal(sites[0].targets[0].fieldName, "total");
  });

  it("compound assignment `+=` does not produce a site", () => {
    const { sites } = discover(
      `
        interface Order { total: number }
        function bump(o: Order, n: number): void {
          o.total += n;
        }
      `,
      "Order",
      ["total"],
    );
    assert.equal(sites.length, 0);
  });

  it("a class without the target type produces no sites for its assignments", () => {
    const { sites } = discover(
      `
        interface Order { total: number }
        class Other {
          value: number = 0;
          bump(n: number): void {
            this.value = n;
          }
        }
      `,
      "Order",
      ["total"],
    );
    assert.equal(sites.length, 0);
  });

  it("does not match a subclass receiver against a parent-class target (documented limitation)", () => {
    // Symbol identity matches the receiver's own type, not its base types.
    // Users who want sites on both `Parent` and `Child` instances must
    // declare both names in their `.aral` (or declare the most-derived
    // name they care about). Without that, subclass receivers go
    // undiscovered against a parent-class target.
    const { sites } = discover(
      `
        class Order { total: number = 0 }
        class Sub extends Order { extra: number = 0 }
        function bump(s: Sub, n: number): void {
          s.total = n;
        }
      `,
      "Order",
      ["total"],
    );
    assert.equal(sites.length, 0);
  });

  it("does not match an extending-interface receiver against the base interface target (documented limitation)", () => {
    // Same limitation as the subclass case: an interface that extends
    // another keeps its own symbol identity and won't match the base.
    const { sites } = discover(
      `
        interface Order { total: number }
        interface ExtendedOrder extends Order { extra: number }
        function bump(o: ExtendedOrder, n: number): void {
          o.total = n;
        }
      `,
      "Order",
      ["total"],
    );
    assert.equal(sites.length, 0);
  });
});
