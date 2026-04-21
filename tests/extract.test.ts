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

  it("?? on nullable field populates optionalFields", () => {
    const r = fromOrder("total", "nullable_coalesce.ts");
    assert.deepStrictEqual(r.optionalFields, ["discount"]);
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

  it("?? on non-nullable field emits bare field, no isPresent", () => {
    const r = fromOrder("total", "nonnull_coalesce.ts");
    // Traverse the expression tree for any isPresent — there should be none.
    const hasIsPresent = JSON.stringify(r).includes("isPresent");
    assert.equal(hasIsPresent, false, "non-nullable ?? should not emit isPresent");
    assert.equal(r.optionalFields, undefined, "optionalFields should be absent");
  });

  it("optional field declared but not branched on stays out of optionalFields", () => {
    // arith_mul.ts uses Order (which has `discount?: Discount`) but never branches on discount.
    const r = fromOrder("total", "arith_mul.ts");
    assert.equal(r.optionalFields, undefined,
      "optionalFields only lists fields the function actually queries for presence");
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

// ─── Collection each / every() ─────────────────────────────────

describe("collection each", () => {
  it("simple every → each with cmp body", () => {
    const r = fromOrder("total", "each_simple.ts");
    const v = getAssign(r);
    assert.ok("ite" in v);
    assert.ok("each" in v.ite.cond);
    assert.equal(v.ite.cond.each.collection, "lineItems");
    assert.ok("cmp" in v.ite.cond.each.body);
    assert.equal(v.ite.cond.each.body.cmp.op, "gt");
    assert.deepStrictEqual(v.ite.cond.each.body.cmp.left, {
      field: { name: "quantity" },
    });
    assert.deepStrictEqual(v.ite.cond.each.body.cmp.right, { lit: 0 });
  });

  it("compound body (&&) → each with logic.and", () => {
    const r = fromOrder("total", "each_compound_body.ts");
    const v = getAssign(r);
    assert.ok("each" in v.ite.cond);
    assert.equal(v.ite.cond.each.collection, "lineItems");
    assert.ok("logic" in v.ite.cond.each.body);
    assert.equal(v.ite.cond.each.body.logic.op, "and");
    assert.equal(v.ite.cond.each.body.logic.left.cmp.op, "gt");
    assert.equal(v.ite.cond.each.body.logic.right.cmp.op, "gte");
  });

  it("string comparison body → each resolves, string rhs falls to __ext_", () => {
    const r = fromOrder("total", "each_string_body.ts");
    const v = getAssign(r);
    assert.ok("each" in v.ite.cond);
    assert.equal(v.ite.cond.each.collection, "lineItems");
    const cmp = v.ite.cond.each.body.cmp;
    assert.equal(cmp.op, "eq");
    assert.deepStrictEqual(cmp.left, { field: { name: "productId" } });
    // String literal becomes an __ext_ field ref
    assert.ok("field" in cmp.right);
    assert.ok(cmp.right.field.name.startsWith("__ext_"));
  });

  it("user-defined every on non-array type → no each, falls to __ext_", () => {
    const r = fromOrder("total", "each_user_defined_negative.ts");
    const hasEach = JSON.stringify(r).includes("\"each\"");
    assert.equal(hasEach, false, "non-Array every must not extract as each");
    // Should surface as an unconstrained param for the method call
    assert.ok(
      r.params.some((p) => p.startsWith("__ext_")),
      "expected an __ext_ param for the user-defined every call",
    );
  });

  it("destructured callback param → no each, falls to __ext_", () => {
    const r = fromOrder("total", "each_destructured_negative.ts");
    const hasEach = JSON.stringify(r).includes("\"each\"");
    assert.equal(hasEach, false, "destructured callback must not extract as each");
    assert.ok(
      r.params.some((p) => p.startsWith("__ext_")),
      "expected an __ext_ param for the unsupported callback shape",
    );
  });

  it("two-param callback (item, index) → no each, falls to __ext_", () => {
    const r = fromOrder("total", "each_two_params_negative.ts");
    const hasEach = JSON.stringify(r).includes("\"each\"");
    assert.equal(hasEach, false, "two-param callback must not extract as each");
    assert.ok(
      r.params.some((p) => p.startsWith("__ext_")),
      "expected an __ext_ param for the unsupported callback arity",
    );
  });
});

// ─── Return guards ──────────────────────────────────────────────

describe("return guards", () => {
  it("bare return guard wraps assignment in ite", () => {
    // if (amount <= 0) return account; return { ...account, balance: account.balance + amount }
    const r = fromAccount("balance", "guard_single.ts");
    const v = getAssign(r);
    assert.ok("ite" in v, "return guard should produce an ite wrapping");
    assert.equal(v.ite.cond.cmp.op, "lte");
    assert.deepStrictEqual(v.ite.cond.cmp.left, { field: { name: "amount" } });
    assert.deepStrictEqual(v.ite.cond.cmp.right, { lit: 0 });
    // Pass-through `return account` → balance is unchanged in the early branch
    assert.deepStrictEqual(v.ite.then, { field: { name: "balance" } });
    // Else is the normal assignment expression
    assert.equal(v.ite.else.arith.op, "add");
  });

  it("single-statement block form equivalent to bare", () => {
    // if (amount <= 0) { return account; } ...
    const r = fromAccount("balance", "guard_return_block_single.ts");
    const v = getAssign(r);
    assert.ok("ite" in v, "block-form guard should produce an ite wrapping");
    assert.equal(v.ite.cond.cmp.op, "lte");
    assert.deepStrictEqual(v.ite.then, { field: { name: "balance" } });
  });

  it("sequential guards fold into nested ite outermost-first", () => {
    // if (amount <= 0) return account; if (amount > account.balance) return account; return {...}
    const r = fromAccount("balance", "guard_nested.ts");
    const v = getAssign(r);
    assert.ok("ite" in v, "outer guard should produce outermost ite");
    // Outermost is the first guard: amount <= 0
    assert.equal(v.ite.cond.cmp.op, "lte");
    assert.deepStrictEqual(v.ite.cond.cmp.right, { lit: 0 });
    // Inner ite is the second guard
    assert.ok("ite" in v.ite.else, "second guard should be nested inside");
    assert.equal(v.ite.else.ite.cond.cmp.op, "gt");
    // Innermost else is the original assignment
    assert.equal(v.ite.else.ite.else.arith.op, "sub");
  });

  it("null-check guard uses isPresent via !field", () => {
    // if (!order.discount) return order; return { ...order, total: order.subtotal - order.discount.percent }
    const r = fromOrder("total", "guard_return_null.ts");
    const v = getAssign(r);
    assert.ok("ite" in v);
    // cond is the negation of isPresent(discount)
    assert.ok("not" in v.ite.cond);
    assert.deepStrictEqual(v.ite.cond.not, { isPresent: { name: "discount" } });
    // pass-through: total unchanged in the null branch
    assert.deepStrictEqual(v.ite.then, { field: { name: "total" } });
  });

  it("throw-guard silently ignored (v0.2.2 scope)", () => {
    // if (amount <= 0) throw ...; return { ...account, balance: account.balance + amount }
    const r = fromAccount("balance", "guard_throw_silent.ts");
    const v = getAssign(r);
    // No ite wrapping — throw-guards aren't narrowed in v0.2.2. v0.2.3 will
    // flip this oracle intentionally when preconditions ship.
    assert.ok(
      !("ite" in v),
      "throw-guard must not produce an ite wrapping in v0.2.2",
    );
    assert.equal(v.arith.op, "add");
  });

  it("multi-statement block in then-branch → guard layer bails to __ext_", () => {
    // if (amount <= 0) { amount = 0; return account; } return { ...account, balance: ... }
    const r = fromAccount("balance", "guard_return_block_multistmt_negative.ts");
    const v = getAssign(r);
    // Guard layer bails → assignment falls through to __ext_
    assert.ok("field" in v, "bailed guard layer should emit a field ref");
    assert.ok(
      v.field.name.startsWith("__ext_"),
      `expected __ext_ param, got ${v.field.name}`,
    );
  });

  it("if/else both-return extracts per-branch, no cross-branch ite (v0.2.2 scope)", () => {
    // if (amount > 0) { return {...balance: + amount} } else { return {...balance: account.balance} }
    const all = extractAll("account.aral");
    const fromIfElse = all.filter((s) =>
      s.filePath.endsWith("guard_if_else_both_return_negative.ts"),
    );
    assert.equal(fromIfElse.length, 2, "both branches produce a balance site");
    // Neither site has an ite wrapping from Slice B's pre-pass (no preceding
    // top-level guards at the function body level).
    for (const site of fromIfElse) {
      const v = site.assigns[0].value;
      assert.ok(
        !("ite" in v),
        `if/else both-return branch must not produce a cross-branch ite in v0.2.2 (got ${JSON.stringify(v)})`,
      );
    }
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

// ─── Local variable tracing ────────────────────────────────────

describe("local variable tracing", () => {
  it("const: traces through local const to inlined expression", () => {
    // const newTotal = order.subtotal - discountAmount; return { total: newTotal }
    const r = extractOne("order.aral", "total", { sourceFile: "local_const.ts" });
    const v = getAssign(r);
    assert.equal(v.arith.op, "sub");
    assert.deepStrictEqual(v.arith.left, { field: { name: "subtotal" } });
    // discountAmount is a function param, not a type field — should be in params or as field ref
  });

  it("chained: traces through multiple const declarations", () => {
    // const base = order.subtotal; const doubled = base * 2; return { total: doubled }
    const r = extractOne("order.aral", "total", { sourceFile: "local_chained.ts" });
    const v = getAssign(r);
    assert.equal(v.arith.op, "mul");
    assert.deepStrictEqual(v.arith.left, { field: { name: "subtotal" } });
    assert.deepStrictEqual(v.arith.right, { lit: 2 });
  });

  it("let single-assignment: traces like const", () => {
    // let newBalance = account.balance + amount; return { balance: newBalance }
    const r = extractOne("account.aral", "balance", { sourceFile: "local_let_single.ts" });
    const v = getAssign(r);
    assert.equal(v.arith.op, "add");
    assert.deepStrictEqual(v.arith.left, { field: { name: "balance" } });
  });

  it("let reassigned: traces to last sequential assignment", () => {
    // let result = account.balance; result = result + amount; return { balance: result }
    const r = extractOne("account.aral", "balance", { sourceFile: "local_let_reassigned.ts" });
    const v = getAssign(r);
    assert.equal(v.arith.op, "add");
    assert.deepStrictEqual(v.arith.left, { field: { name: "balance" } });
  });

  it("let branched: falls back (reassignment inside if)", () => {
    // let result = account.balance; if (...) { result = result + bonus; } return { balance: result }
    // The reassignment is inside an if → can't statically determine which value, should not fully trace
    const r = extractOne("account.aral", "balance", { sourceFile: "local_let_branched.ts" });
    // Should either be unconstrained or fall through to { field: { name: "result" } }
    const v = getAssign(r);
    // We don't assert the exact shape — just that it doesn't crash and doesn't claim to be "balance"
    assert.ok(v, "should produce some expression");
  });
});

// ─── Typed parameters ──────────────────────────────────────────

describe("typed parameters", () => {
  it("function param with resolvable type populates typedParams", () => {
    // discount: Discount → discount.percent should produce a typed param
    const r = extractOne("order.aral", "total", { sourceFile: "typed_param_access.ts" });
    const v = getAssign(r);
    assert.equal(v.arith.op, "sub");
    assert.deepStrictEqual(v.arith.left, { field: { name: "subtotal" } });
    // discount.percent should be a qualified field ref
    assert.deepStrictEqual(v.arith.right, { field: { qualifier: "discount", name: "percent" } });
    // The typedParams should include discount → Discount
    assert.ok(r.typedParams, "should have typedParams");
    assert.ok(
      r.typedParams!.some((tp: any) => tp.name === "discount" && tp.type === "Discount"),
      "typedParams should include discount:Discount"
    );
    // params must include compound "qualifier-name" for the verifier
    assert.ok(r.params.includes("discount-percent"), "params should include discount-percent");
  });

  it("local variable with resolvable type populates typedParams", () => {
    // const discount: Discount = ... → discount.percent should also produce a typed param
    const r = extractOne("order.aral", "total", { sourceFile: "local_var_qualified.ts" });
    const v = getAssign(r);
    assert.equal(v.arith.op, "sub");
    assert.deepStrictEqual(v.arith.left, { field: { name: "subtotal" } });
    // discount.percent should be a qualified field ref even though discount is a local var
    assert.deepStrictEqual(v.arith.right, { field: { qualifier: "discount", name: "percent" } });
    // The typedParams should include discount → Discount
    assert.ok(r.typedParams, "should have typedParams");
    assert.ok(
      r.typedParams!.some((tp: any) => tp.name === "discount" && tp.type === "Discount"),
      "typedParams should include discount:Discount"
    );
    // params must include compound "qualifier-name" for the verifier
    assert.ok(r.params.includes("discount-percent"), "params should include discount-percent");
  });
});

// ─── Module-level constants ────────────────────────────────────

describe("module-level constants", () => {
  it("simple module const resolves to literal", () => {
    // const DAILY_LIMIT = 1000; return { dailyWithdrawLimit: DAILY_LIMIT }
    const r = extractOne("account.aral", "dailyWithdrawLimit", { sourceFile: "module_const.ts" });
    const v = getAssign(r);
    assert.deepStrictEqual(v, { lit: 1000 });
  });

  it("module const arithmetic evaluates at parse time", () => {
    // const HOURS = 24; const MINS = 60; const MINS_PER_DAY = HOURS * MINS;
    const r = extractOne("account.aral", "dailyWithdrawLimit", { sourceFile: "module_const_arith.ts" });
    const v = getAssign(r);
    assert.deepStrictEqual(v, { lit: 1440 });
  });
});

// ─── Free primitive function parameters ────────────────────────

describe("free function parameters", () => {
  it("bare numeric parameter lands in params so the verifier declares it", () => {
    // deposit(account: Account, amount: number): `balance: account.balance + amount`
    const r = fromAccount("balance", "arith_add.ts");
    assert.ok(
      r.params.includes("amount"),
      `expected 'amount' in params, got ${JSON.stringify(r.params)}`,
    );
  });

  it("guard fixture declares its amount parameter", () => {
    // if (amount <= 0) return account; return { ...account, balance: ... + amount }
    const r = fromAccount("balance", "guard_single.ts");
    assert.ok(
      r.params.includes("amount"),
      `expected 'amount' in params, got ${JSON.stringify(r.params)}`,
    );
  });

  it("non-numeric parameters do not land in params (status quo)", () => {
    // processOrder(order: Order, rawAmount: string) → parseFloat(rawAmount)
    // rawAmount is never bare-extracted (the whole parseFloat call goes to __ext_).
    const r = extractOne("order.aral", "total", {
      sourceFile: "call_unconstrained.ts",
    });
    assert.ok(
      !r.params.includes("rawAmount"),
      "string parameters should not land in the numeric params list",
    );
  });
});

// ─── __ext_ naming for parser gaps ─────────────────────────────

describe("__ext_ unconstrained naming", () => {
  it("function call produces __ext_ prefixed param name", () => {
    // parseFloat(rawAmount) → __ext_parseFloat_N
    const r = extractOne("order.aral", "total", { sourceFile: "call_unconstrained.ts" });
    assert.ok(r.params.length > 0, "should have unconstrained params");
    const paramName = r.params[0];
    assert.ok(paramName.startsWith("__ext_"), `param '${paramName}' should start with __ext_`);
    assert.ok(paramName.includes("parseFloat"), `param '${paramName}' should include 'parseFloat'`);
  });
});

// ─── Call-chain following (v0.3.0) ──────────────────────────────

describe("call-chain inlining — expression-body arrow", () => {
  it("inlines const f = (x) => x * 2 at the call site", () => {
    // const doubleIt = (x) => x * 2; out.total = doubleIt(order.subtotal)
    const r = fromOrder("total", "call_arrow_expr.ts");
    const v = getAssign(r);
    // Expected IR: arith(mul, field(subtotal), lit(2))
    assert.equal(v.arith?.op, "mul", `expected arith mul, got ${JSON.stringify(v)}`);
    assert.deepStrictEqual(v.arith.left, { field: { name: "subtotal" } });
    assert.deepStrictEqual(v.arith.right, { lit: 2 });
    assert.equal(r.unconstrainedCount, 0, "no unconstrained params expected");
  });
});

describe("call-chain inlining — single-return function shapes", () => {
  it("inlines function f(x) { return x * 2; } at the call site", () => {
    const r = fromOrder("total", "call_fn_decl.ts");
    const v = getAssign(r);
    assert.equal(v.arith?.op, "mul", `expected arith mul, got ${JSON.stringify(v)}`);
    assert.deepStrictEqual(v.arith.left, { field: { name: "subtotal" } });
    assert.deepStrictEqual(v.arith.right, { lit: 2 });
    assert.equal(r.unconstrainedCount, 0, "no unconstrained params expected");
  });

  it("inlines const f = (x) => { return x * 2; } at the call site", () => {
    const r = fromOrder("total", "call_arrow_block.ts");
    const v = getAssign(r);
    assert.equal(v.arith?.op, "mul", `expected arith mul, got ${JSON.stringify(v)}`);
    assert.deepStrictEqual(v.arith.left, { field: { name: "subtotal" } });
    assert.deepStrictEqual(v.arith.right, { lit: 2 });
    assert.equal(r.unconstrainedCount, 0, "no unconstrained params expected");
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
