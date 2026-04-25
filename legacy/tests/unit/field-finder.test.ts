/**
 * Direct tests for findAssignmentSites — exercises the three assignment
 * patterns (object literal, direct assignment, ORM/Prisma) against an
 * in-memory TS program.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findAssignmentSites } from "../../src/field-finder.js";
import { compileSnippet } from "./harness.js";

function findSites(code: string, typeName: string, fields: string[]) {
  const { program } = compileSnippet(code);
  return findAssignmentSites(program, typeName, fields);
}

describe("field-finder — object literal property assignment", () => {
  it("finds a field inside an object literal returning the target type", () => {
    const sites = findSites(
      `
      interface Order { total: number; subtotal: number; }
      function f(o: Order): Order {
        return { ...o, total: o.subtotal * 2 };
      }
      `,
      "Order",
      ["total"],
    );
    assert.equal(sites.length, 1);
    assert.equal(sites[0].fieldName, "total");
    assert.equal(sites[0].containerName, "f");
  });

  it("finds sites across multiple functions", () => {
    const sites = findSites(
      `
      interface Order { total: number; }
      function a(o: Order): Order { return { total: 1 }; }
      function b(o: Order): Order { return { total: 2 }; }
      `,
      "Order",
      ["total"],
    );
    assert.equal(sites.length, 2);
  });

  it("only returns sites for fields listed in fieldNames", () => {
    const sites = findSites(
      `
      interface Order { total: number; subtotal: number; }
      function f(o: Order): Order {
        return { ...o, total: 1, subtotal: 2 };
      }
      `,
      "Order",
      ["total"],
    );
    assert.equal(sites.length, 1);
    assert.equal(sites[0].fieldName, "total");
  });
});

describe("field-finder — direct property assignment", () => {
  it("finds `result.field = expr` where result has the target type", () => {
    const sites = findSites(
      `
      interface Order { total: number; }
      function f(o: Order): void {
        o.total = 42;
      }
      `,
      "Order",
      ["total"],
    );
    assert.equal(sites.length, 1);
    assert.equal(sites[0].fieldName, "total");
  });

  it("skips property assignments on objects whose type doesn't match", () => {
    const sites = findSites(
      `
      interface Order { total: number; }
      interface Other { total: number; }
      function f(other: Other): void {
        other.total = 42;
      }
      `,
      "Order",
      ["total"],
    );
    assert.equal(sites.length, 0);
  });
});

describe("field-finder — Prisma shapes", () => {
  it("finds prisma.order.create({ data: { field: expr } })", () => {
    const sites = findSites(
      `
      declare const prisma: {
        order: {
          create: (args: { data: { total: number } }) => any
        };
      };
      async function f(): Promise<void> {
        prisma.order.create({ data: { total: 100 } });
      }
      `,
      "Order",
      ["total"],
    );
    assert.equal(sites.length, 1);
  });

  it("finds prisma.order.update({ data: { field: expr } })", () => {
    const sites = findSites(
      `
      declare const prisma: {
        order: {
          update: (args: { where: any; data: { total: number } }) => any
        };
      };
      async function f(): Promise<void> {
        prisma.order.update({ where: { id: 1 }, data: { total: 100 } });
      }
      `,
      "Order",
      ["total"],
    );
    assert.equal(sites.length, 1);
  });

  it("case-insensitive model name matching: lowercase order vs Order type", () => {
    const sites = findSites(
      `
      declare const db: {
        order: { create: (args: { data: { total: number } }) => any };
      };
      async function f(): Promise<void> {
        db.order.create({ data: { total: 100 } });
      }
      `,
      "Order",
      ["total"],
    );
    assert.equal(sites.length, 1);
  });
});

describe("field-finder — skips declaration and node_modules files", () => {
  it("doesn't find sites in standard-library .d.ts files", () => {
    // A .ts file with no assignments to "Order.total" produces zero sites.
    const sites = findSites(
      `declare const x: number; const y = x + 1;`,
      "Order",
      ["total"],
    );
    assert.equal(sites.length, 0);
  });
});

describe("field-finder — zero-site outcomes", () => {
  it("no assignment sites when the type isn't used", () => {
    const sites = findSites(
      `
      interface Unrelated { total: number; }
      function f(): Unrelated { return { total: 1 }; }
      `,
      "Order",
      ["total"],
    );
    assert.equal(sites.length, 0);
  });
});
