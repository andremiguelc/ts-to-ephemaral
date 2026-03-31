"""Layer 1: Parser tests — TS → Aral-fn JSON structure assertions."""

import pytest
from conftest import parse_fixture, parse_fixture_error, run_parser, write_snapshot


# ============================================================
# Helper: dig into nested Expr structure
# ============================================================

def get_assign(result: dict, index: int = 0) -> dict:
    """Get the value of the Nth field assignment."""
    return result["assigns"][index]["value"]


def get_assign_name(result: dict, index: int = 0) -> str:
    """Get the fieldName of the Nth field assignment."""
    return result["assigns"][index]["fieldName"]


# ============================================================
# Happy path: basic expressions
# ============================================================

class TestBasicExpressions:
    def test_assign_literal(self):
        r = parse_fixture("assign_literal.ts")
        assert r["name"] == "resetTotal"
        assert r["inputType"] == "Order"
        assert "total" in r["inputFields"]
        assert get_assign(r) == {"lit": 100}

    def test_field_copy(self):
        r = parse_fixture("field_copy.ts")
        assert r["name"] == "syncTotal"
        assert get_assign_name(r) == "total"
        assert get_assign(r) == {"field": {"name": "subtotal"}}

    def test_const_inline(self):
        """Const declarations should be inlined into the assign expression."""
        r = parse_fixture("const_inline.ts")
        assert r["name"] == "applyDiscount"
        assert "discountAmount" in r["params"]
        val = get_assign(r)
        assert "arith" in val
        assert val["arith"]["op"] == "sub"


# ============================================================
# Happy path: arithmetic operators
# ============================================================

class TestArithmetic:
    def test_add(self):
        r = parse_fixture("arith_add.ts")
        val = get_assign(r)
        assert val["arith"]["op"] == "add"
        assert val["arith"]["left"] == {"field": {"name": "balance"}}
        assert val["arith"]["right"] == {"field": {"name": "amount"}}

    def test_sub(self):
        r = parse_fixture("arith_sub.ts")
        val = get_assign(r)
        assert val["arith"]["op"] == "sub"

    def test_mul(self):
        r = parse_fixture("arith_mul.ts")
        val = get_assign(r)
        assert val["arith"]["op"] == "mul"
        assert val["arith"]["left"] == {"field": {"name": "subtotal"}}
        assert val["arith"]["right"] == {"lit": 2}

    def test_div(self):
        r = parse_fixture("arith_div.ts")
        val = get_assign(r)
        assert val["arith"]["op"] == "div"

    def test_precedence_mul_before_add(self):
        """a + b * 2 should parse as add(a, mul(b, 2))."""
        r = parse_fixture("precedence.ts")
        val = get_assign(r)
        assert val["arith"]["op"] == "add"
        assert val["arith"]["right"]["arith"]["op"] == "mul"

    def test_parens_override_precedence(self):
        """(a + 10) * b should parse as mul(add(a, 10), b)."""
        r = parse_fixture("parens.ts")
        val = get_assign(r)
        assert val["arith"]["op"] == "mul"
        assert val["arith"]["left"]["arith"]["op"] == "add"


# ============================================================
# Happy path: rounding
# ============================================================

class TestRounding:
    def test_floor(self):
        r = parse_fixture("round_floor.ts")
        val = get_assign(r)
        assert val["round"]["mode"] == "floor"
        assert val["round"]["expr"] == {"field": {"name": "subtotal"}}

    def test_ceil(self):
        r = parse_fixture("round_ceil.ts")
        val = get_assign(r)
        assert val["round"]["mode"] == "ceil"

    def test_half_up(self):
        r = parse_fixture("round_half_up.ts")
        val = get_assign(r)
        assert val["round"]["mode"] == "half_up"


# ============================================================
# Happy path: comparisons (as ite conditions)
# ============================================================

class TestComparisons:
    def _get_cmp_op(self, fixture: str) -> str:
        """Extract the comparison operator from a guard-style fixture."""
        r = parse_fixture(fixture)
        val = get_assign(r)
        # Guard wraps in ite — dig into the condition
        assert "ite" in val
        cond = val["ite"]["cond"]
        # May be wrapped in logic or not
        if "cmp" in cond:
            return cond["cmp"]["op"]
        # For nested guards, the outermost ite has the first guard's cmp
        return cond["cmp"]["op"] if "cmp" in cond else None

    def test_gt(self):
        r = parse_fixture("cmp_gt.ts")
        val = get_assign(r)
        assert val["ite"]["cond"]["cmp"]["op"] == "gt"

    def test_lt(self):
        r = parse_fixture("cmp_lt.ts")
        val = get_assign(r)
        assert val["ite"]["cond"]["cmp"]["op"] == "lt"

    def test_gte(self):
        r = parse_fixture("cmp_gte.ts")
        val = get_assign(r)
        assert val["ite"]["cond"]["cmp"]["op"] == "gte"

    def test_lte(self):
        r = parse_fixture("cmp_lte.ts")
        val = get_assign(r)
        assert val["ite"]["cond"]["cmp"]["op"] == "lte"

    def test_eq(self):
        r = parse_fixture("cmp_eq.ts")
        val = get_assign(r)
        assert val["ite"]["cond"]["cmp"]["op"] == "eq"

    def test_neq(self):
        r = parse_fixture("cmp_neq.ts")
        val = get_assign(r)
        assert val["ite"]["cond"]["cmp"]["op"] == "neq"


# ============================================================
# Happy path: boolean logic
# ============================================================

class TestBooleanLogic:
    def test_and(self):
        r = parse_fixture("logic_and.ts")
        val = get_assign(r)
        cond = val["ite"]["cond"]
        assert "logic" in cond
        assert cond["logic"]["op"] == "and"

    def test_or(self):
        r = parse_fixture("logic_or.ts")
        val = get_assign(r)
        cond = val["ite"]["cond"]
        assert "logic" in cond
        assert cond["logic"]["op"] == "or"

    def test_not(self):
        r = parse_fixture("logic_not.ts")
        val = get_assign(r)
        cond = val["ite"]["cond"]
        assert "not" in cond


# ============================================================
# Happy path: ternary and guards
# ============================================================

class TestConditionals:
    def test_ternary(self):
        """Ternary should produce ite with both branches."""
        r = parse_fixture("ternary.ts")
        val = get_assign(r)
        assert "ite" in val
        assert "cond" in val["ite"]
        assert "then" in val["ite"]
        assert "else" in val["ite"]
        # else branch is literal 0
        assert val["ite"]["else"] == {"lit": 0}

    def test_single_guard(self):
        """if (cond) return input → ite wrapping the main assign."""
        r = parse_fixture("guard_single.ts")
        val = get_assign(r)
        assert "ite" in val
        # then branch is the identity (guard fires → return unchanged)
        assert val["ite"]["then"] == {"field": {"name": "balance"}}
        # else branch is the real computation
        assert "arith" in val["ite"]["else"]

    def test_nested_guards(self):
        """Multiple if-guards → nested ite chain."""
        r = parse_fixture("guard_nested.ts")
        val = get_assign(r)
        assert "ite" in val
        # First guard: amount <= 0
        assert val["ite"]["cond"]["cmp"]["op"] == "lte"
        # Else branch has another ite (second guard)
        inner = val["ite"]["else"]
        assert "ite" in inner
        assert inner["ite"]["cond"]["cmp"]["op"] == "gt"


# ============================================================
# Happy path: multiple assignments
# ============================================================

class TestMultipleAssigns:
    def test_multi_assign(self):
        r = parse_fixture("multi_assign.ts")
        assert len(r["assigns"]) == 2
        names = {a["fieldName"] for a in r["assigns"]}
        assert names == {"balance", "dailyWithdrawn"}


# ============================================================
# Happy path: metadata
# ============================================================

class TestMetadata:
    def test_input_type(self):
        r = parse_fixture("arith_add.ts")
        assert r["inputType"] == "Account"

    def test_params_extracted(self):
        r = parse_fixture("arith_add.ts")
        assert "amount" in r["params"]

    def test_input_fields_extracted(self):
        r = parse_fixture("multi_assign.ts")
        assert "balance" in r["inputFields"]
        assert "dailyWithdrawn" in r["inputFields"]

    def test_no_params_when_none(self):
        r = parse_fixture("assign_literal.ts")
        assert r["params"] == []


# ============================================================
# Typed parameters
# ============================================================

class TestTypedParams:
    def test_typed_param_emitted(self):
        """Non-primitive param type emits typedParams."""
        r = parse_fixture("typed_param.ts")
        assert "typedParams" in r
        assert r["typedParams"] == [{"name": "discount", "type": "Discount"}]

    def test_primitive_param_no_typed_params(self):
        """Primitive param types (number) don't emit typedParams."""
        r = parse_fixture("guard_single.ts")
        assert "typedParams" not in r

    def test_dot_access_qualified_ref(self):
        """discount.percent produces qualified FieldRef."""
        r = parse_fixture("typed_param_dot.ts")
        assert r["typedParams"] == [{"name": "discount", "type": "Discount"}]
        assert "discount-percent" in r["params"]
        assert "discount-percent" not in r["inputFields"]
        val = get_assign(r)
        # The expression tree contains a qualified field ref
        right = val["arith"]["right"]  # subtotal * discount.percent / 100
        # Navigate to find the qualified ref (discount.percent is in a nested arith)
        assert r["typedParams"] == [{"name": "discount", "type": "Discount"}]

    def test_nested_param_dot_error(self):
        """discount.details.percent is rejected (nested access)."""
        err = parse_fixture_error("err_nested_param.ts")
        assert "REWRITE" in err
        assert "Nested field access" in err


# ============================================================
# Error cases: REWRITE
# ============================================================

class TestRewriteErrors:
    def test_arrow_function(self):
        err = parse_fixture_error("err_arrow.ts")
        assert "REWRITE" in err
        assert "Arrow functions" in err
        assert "function name(input: Type" in err
        write_snapshot("parser_err_arrow", f"INPUT: err_arrow.ts (arrow function)\n\n{err}")

    def test_let_var(self):
        err = parse_fixture_error("err_let.ts")
        assert "REWRITE" in err
        assert "'let'" in err or "'var'" in err
        assert "const" in err
        write_snapshot("parser_err_let", f"INPUT: err_let.ts (let/var)\n\n{err}")

    def test_throw(self):
        err = parse_fixture_error("err_throw.ts")
        assert "REWRITE" in err
        assert "throw" in err
        assert "guard" in err.lower() or "return" in err.lower()
        write_snapshot("parser_err_throw", f"INPUT: err_throw.ts (throw statement)\n\n{err}")

    def test_nested_field_access(self):
        err = parse_fixture_error("err_nested_field.ts")
        assert "REWRITE" in err
        assert "Nested field access" in err
        assert "parameter" in err.lower()
        write_snapshot("parser_err_nested_field", f"INPUT: err_nested_field.ts (order.discount.percent)\n\n{err}")

    def test_cross_type_field_now_valid(self):
        """discount.percent is now valid — produces qualified FieldRef."""
        r = parse_fixture("err_cross_type.ts")
        assert r["typedParams"] == [{"name": "discount", "type": "Discount"}]
        assert "discount-percent" in r["params"]
        val = get_assign(r)
        assert val["arith"]["right"] == {"field": {"qualifier": "discount", "name": "percent"}}

    def test_no_return(self):
        err = parse_fixture_error("err_no_return.ts")
        assert "REWRITE" in err
        assert "return" in err.lower()
        write_snapshot("parser_err_no_return", f"INPUT: err_no_return.ts (no return)\n\n{err}")

    def test_no_spread(self):
        err = parse_fixture_error("err_no_spread.ts")
        assert "REWRITE" in err
        assert "spread" in err.lower()
        write_snapshot("parser_err_no_spread", f"INPUT: err_no_spread.ts (no spread)\n\n{err}")

    def test_missing_parens(self):
        err = parse_fixture_error("err_missing_parens.ts")
        assert "REWRITE" in err
        write_snapshot("parser_err_missing_parens", f"INPUT: err_missing_parens.ts (no parens)\n\n{err}")

    def test_unmatched_ternary(self):
        err = parse_fixture_error("err_unmatched_ternary.ts")
        assert "REWRITE" in err
        write_snapshot("parser_err_unmatched_ternary", f"INPUT: err_unmatched_ternary.ts (? without :)\n\n{err}")

    def test_if_no_return(self):
        err = parse_fixture_error("err_if_no_return.ts")
        assert "REWRITE" in err
        assert "return" in err.lower()
        write_snapshot("parser_err_if_no_return", f"INPUT: err_if_no_return.ts (if body mutates)\n\n{err}")


# ============================================================
# Error cases: NOT VERIFIABLE
# ============================================================

class TestNotVerifiableErrors:
    def test_non_sum_reduce(self):
        err = parse_fixture_error("err_reduce_non_sum.ts")
        assert "NOT VERIFIABLE" in err
        assert "reduce" in err
        write_snapshot("parser_err_non_sum_reduce", f"INPUT: err_reduce_non_sum.ts (non-sum .reduce)\n\n{err}")

    def test_array_bracket(self):
        err = parse_fixture_error("err_array_bracket.ts")
        assert "NOT VERIFIABLE" in err
        assert "Array" in err
        write_snapshot("parser_err_array_bracket", f"INPUT: err_array_bracket.ts ([...] syntax)\n\n{err}")

    def test_return_type_mismatch(self):
        err = parse_fixture_error("err_return_type.ts")
        assert "NOT VERIFIABLE" in err
        assert "boolean" in err
        write_snapshot("parser_err_return_type", f"INPUT: err_return_type.ts (returns boolean)\n\n{err}")


# ============================================================
# Happy path: nullable / coalesce
# ============================================================

class TestNullableCoalesce:
    def test_coalesce_basic(self):
        """order.discount ?? 0 → ite(isPresent(discount), discount, 0)"""
        r = parse_fixture("nullable_coalesce.ts")
        val = get_assign(r)
        # outer: sub(subtotal, ite(...))
        assert val["arith"]["op"] == "sub"
        ite = val["arith"]["right"]["ite"]
        assert ite["cond"] == {"isPresent": {"name": "discount"}}
        assert ite["then"] == {"field": {"name": "discount"}}
        assert ite["else"] == {"lit": 0}

    def test_coalesce_optional_fields(self):
        """optionalFields should include fields used in ?? expressions."""
        r = parse_fixture("nullable_coalesce.ts")
        assert "discount" in r.get("optionalFields", [])

    def test_coalesce_nested(self):
        """a ?? b ?? 0 → ite(isPresent(a), a, ite(isPresent(b), b, 0))"""
        r = parse_fixture("nullable_nested.ts")
        val = get_assign(r)
        ite = val["arith"]["right"]["ite"]
        assert ite["cond"] == {"isPresent": {"name": "discount"}}
        inner_ite = ite["else"]["ite"]
        assert inner_ite["cond"] == {"isPresent": {"name": "defaultDiscount"}}
        assert inner_ite["else"] == {"lit": 0}

    def test_nested_optional_fields(self):
        """Both fields in a ?? b ?? 0 should be in optionalFields."""
        r = parse_fixture("nullable_nested.ts")
        opt = r.get("optionalFields", [])
        assert "discount" in opt
        assert "defaultDiscount" in opt


# ============================================================
# Happy path: collection sum
# ============================================================

class TestCollectionSum:
    def test_sum_simple(self):
        """items.reduce((s, i) => s + i.subtotal, 0) → sum with field body"""
        r = parse_fixture("sum_simple.ts")
        val = get_assign(r)
        assert "sum" in val
        assert val["sum"]["collection"] == "lineItems"
        assert val["sum"]["body"] == {"field": {"name": "subtotal"}}

    def test_sum_arith_body(self):
        """items.reduce((a, i) => a + i.price * i.quantity, 0) → sum with arith body"""
        r = parse_fixture("sum_arith_body.ts")
        val = get_assign(r)
        assert "sum" in val
        assert val["sum"]["collection"] == "lineItems"
        body = val["sum"]["body"]
        assert body["arith"]["op"] == "mul"
        assert body["arith"]["left"] == {"field": {"name": "price"}}
        assert body["arith"]["right"] == {"field": {"name": "quantity"}}

    def test_sum_from_old_err_array(self):
        """The old err_array.ts is now a valid sum pattern."""
        r = parse_fixture("err_array.ts")
        val = get_assign(r)
        assert "sum" in val
        assert val["sum"]["collection"] == "lineItems"
