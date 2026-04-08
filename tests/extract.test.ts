/**
 * Expression-level extraction tests.
 *
 * Each test extracts from real fixture .ts files via .aral-driven search,
 * then asserts the Aral-fn IR structure is correct.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractOne, extractAll, getAssign } from "./helpers.js";

// Shorthand: extract from a specific fixture file
const fromOrder = (field: string, file: string) =>
  extractOne("order.aral", field, { sourceFile: file });
const fromAccount = (field: string, file: string) =>
  extractOne("account.aral", field, { sourceFile: file });

// ─── Basic expressions ──────────────────────────────────────────

describe("basic expressions", () => {
  it("literal assignment", () => {
    const r = fromOrder("total", "assign_literal.ts");
    assert.deepStrictEqual(getAssign(r), { lit: 100 });
  });

  it("field copy", () => {
    const r = fromOrder("total", "field_copy.ts");
    assert.deepStrictEqual(getAssign(r), { field: { name: "subtotal" } });
  });
});

// ─── Arithmetic ─────────────────────────────────────────────────

describe("arithmetic", () => {
  it("add", () => {
    const r = fromAccount("balance", "arith_add.ts");
    const v = getAssign(r);
    assert.equal(v.arith.op, "add");
    assert.deepStrictEqual(v.arith.left, { field: { name: "balance" } });
    assert.deepStrictEqual(v.arith.right, { field: { name: "amount" } });
  });

  it("sub", () => {
    const v = getAssign(fromAccount("balance", "arith_sub.ts"));
    assert.equal(v.arith.op, "sub");
  });

  it("mul", () => {
    const v = getAssign(fromOrder("total", "arith_mul.ts"));
    assert.equal(v.arith.op, "mul");
    assert.deepStrictEqual(v.arith.left, { field: { name: "subtotal" } });
    assert.deepStrictEqual(v.arith.right, { lit: 2 });
  });

  it("div", () => {
    const v = getAssign(fromOrder("total", "arith_div.ts"));
    assert.equal(v.arith.op, "div");
  });

  it("precedence: a + b * 2 → add(a, mul(b, 2))", () => {
    const v = getAssign(fromOrder("total", "precedence.ts"));
    assert.equal(v.arith.op, "add");
    assert.equal(v.arith.right.arith.op, "mul");
  });

  it("parens: (a + 10) * b → mul(add(a, 10), b)", () => {
    const v = getAssign(fromOrder("total", "parens.ts"));
    assert.equal(v.arith.op, "mul");
    assert.equal(v.arith.left.arith.op, "add");
  });
});

// ─── Rounding ───────────────────────────────────────────────────

describe("rounding", () => {
  it("Math.floor → floor", () => {
    const v = getAssign(fromOrder("total", "round_floor.ts"));
    assert.equal(v.round.mode, "floor");
    assert.deepStrictEqual(v.round.expr, { field: { name: "subtotal" } });
  });

  it("Math.ceil → ceil", () => {
    const v = getAssign(fromOrder("total", "round_ceil.ts"));
    assert.equal(v.round.mode, "ceil");
  });

  it("Math.round → half_up", () => {
    const v = getAssign(fromOrder("total", "round_half_up.ts"));
    assert.equal(v.round.mode, "half_up");
  });
});

// ─── Ternary / conditionals ────────────────────────────────────

describe("conditionals", () => {
  it("ternary produces ite with both branches", () => {
    const v = getAssign(fromAccount("balance", "ternary.ts"));
    assert.ok("ite" in v);
    assert.ok("cond" in v.ite);
    assert.ok("then" in v.ite);
    assert.deepStrictEqual(v.ite.else, { lit: 0 });
  });

  it("ternary condition has comparison", () => {
    const v = getAssign(fromAccount("balance", "ternary.ts"));
    assert.equal(v.ite.cond.cmp.op, "gte");
  });
});

// ─── Comparisons (via ternary conditions in cmp_*.ts) ──────────

describe("comparisons", () => {
  // The cmp_*.ts fixtures use if-guards, but the extractor only sees
  // the assignment expression (balance + amount), not the guard condition.
  // The gte comparison is tested via ternary.ts above.
  // For direct comparison testing, we check cmp_gte.ts which uses a ternary.

  it("gte via ternary", () => {
    const v = getAssign(fromAccount("balance", "cmp_gte.ts"));
    // cmp_gte.ts uses: account.balance - amount >= 0 ? ... : 0
    assert.ok("ite" in v);
    assert.equal(v.ite.cond.cmp.op, "gte");
  });
});

// ─── Nullable / coalescing ──────────────────────────────────────

describe("nullable", () => {
  it("?? 0 → ite(isPresent, field, 0)", () => {
    const r = fromOrder("total", "nullable_coalesce.ts");
    const v = getAssign(r);
    assert.equal(v.arith.op, "sub");
    const ite = v.arith.right.ite;
    assert.deepStrictEqual(ite.cond, { isPresent: { name: "discount" } });
    assert.deepStrictEqual(ite.then, { field: { name: "discount" } });
    assert.deepStrictEqual(ite.else, { lit: 0 });
  });

  it("|| 0 → same as ?? (ite with isPresent)", () => {
    const r = fromOrder("total", "nullable_or_default.ts");
    const v = getAssign(r);
    assert.equal(v.arith.op, "sub");
    const ite = v.arith.right.ite;
    assert.deepStrictEqual(ite.cond, { isPresent: { name: "discount" } });
    assert.deepStrictEqual(ite.else, { lit: 0 });
  });

  it("nested ?? becomes unconstrained (level 0 strictness)", () => {
    const r = fromOrder("total", "nullable_nested.ts");
    // Chained ?? (a ?? b ?? 0) is too complex for expression extractor → __unk
    assert.ok(r.params.length > 0, "chained ?? should produce unconstrained params");
  });
});

// ─── Collection sum ─────────────────────────────────────────────

describe("collection sum", () => {
  it("simple reduce → sum", () => {
    const r = fromOrder("total", "sum_simple.ts");
    const v = getAssign(r);
    assert.ok("sum" in v);
    assert.equal(v.sum.collection, "lineItems");
  });

  it("arithmetic reduce body → sum with arith", () => {
    const r = fromOrder("total", "sum_arith_body.ts");
    const v = getAssign(r);
    assert.ok("sum" in v);
    assert.equal(v.sum.collection, "lineItems");
    assert.equal(v.sum.body.arith.op, "mul");
    assert.deepStrictEqual(v.sum.body.arith.left, { field: { name: "price" } });
    assert.deepStrictEqual(v.sum.body.arith.right, { field: { name: "quantity" } });
  });
});

// ─── Multiple assignments ───────────────────────────────────────

describe("multiple assignments", () => {
  it("multi_assign extracts both fields", () => {
    const all = extractAll("account.aral");
    const fromMulti = all.filter((s) => s.filePath.endsWith("multi_assign.ts"));
    assert.equal(fromMulti.length, 2);
    const fields = new Set(fromMulti.map((s) => s.assigns[0].fieldName));
    assert.ok(fields.has("balance"));
    assert.ok(fields.has("dailyWithdrawn"));
  });
});

// ─── Metadata ───────────────────────────────────────────────────

describe("metadata", () => {
  it("inputType matches .aral target", () => {
    const r = fromAccount("balance", "arith_add.ts");
    assert.equal(r.inputType, "Account");
  });

  it("inputType for order fixtures", () => {
    const r = fromOrder("total", "assign_literal.ts");
    assert.equal(r.inputType, "Order");
  });

  it("field names collected in inputFields", () => {
    const r = fromAccount("balance", "arith_add.ts");
    assert.ok(r.inputFields.includes("balance"));
  });
});

// ─── Multi-site extraction ──────────────────────────────────────

describe("multi-site extraction", () => {
  it("account.aral finds sites across multiple fixture files", () => {
    const all = extractAll("account.aral");
    assert.ok(all.length > 10, `Expected >10 sites, got ${all.length}`);
    const files = new Set(all.map((s) => s.filePath.split("/").pop()));
    assert.ok(files.size > 5, `Expected sites from >5 files, got ${files.size}`);
  });

  it("order.aral finds sites across multiple fixture files", () => {
    const all = extractAll("order.aral");
    assert.ok(all.length > 15, `Expected >15 sites, got ${all.length}`);
  });
});
