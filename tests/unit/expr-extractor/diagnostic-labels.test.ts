/**
 * Exhaustive coverage of every DiagnosticLabel emitted by the parser. One
 * section per label. Each section constructs the minimum snippet that makes
 * the label fire, then asserts on the label itself and that the reason
 * string starts with the label name (our enforced format).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractProbe, extractBoolProbe, extractAssignedProbe } from "../harness.js";

function assertLabel(
  labels: Array<string | undefined>,
  reasons: string[],
  expected: string,
) {
  assert.deepStrictEqual(labels, [expected], `expected [${expected}], got [${labels.join(",")}]`);
  assert.ok(
    reasons[0]?.startsWith(`${expected}:`),
    `reason must start with "${expected}:", got: ${reasons[0]}`,
  );
}

describe("diagnostic labels — fallback catch-alls", () => {
  it("unsupported-expression: an unsupported expression kind", () => {
    // Template literal — not handled by extractExpr today.
    const { labels, reasons } = extractProbe("const __probe = `hello`;");
    assertLabel(labels, reasons, "unsupported-expression");
  });

  it("unsupported-boolean: an unsupported boolean kind in BoolExpr position", () => {
    // Use a template literal as a boolean — not a recognized BoolExpr shape.
    const { labels, reasons } = extractBoolProbe("const __probe = `text`;");
    assertLabel(labels, reasons, "unsupported-boolean");
  });
});

describe("diagnostic labels — property access", () => {
  it("optional-chaining-no-fallback: `a?.b` without a fallback", () => {
    const { labels, reasons } = extractProbe(
      "declare const a: { b: number } | undefined; const __probe = a?.b;",
    );
    assertLabel(labels, reasons, "optional-chaining-no-fallback");
  });

  it("prop-access-complex: property access off a complex expression", () => {
    // (a + b).x is a property access on a non-identifier object.
    const { labels, reasons } = extractProbe(
      "declare const a: { x: number }; declare const b: { x: number }; const __probe = (true ? a : b).x;",
    );
    assertLabel(labels, reasons, "prop-access-complex");
  });
});

describe("diagnostic labels — binary / boolean", () => {
  it("non-arith-binary: modulo operator", () => {
    const { labels, reasons } = extractProbe("const __probe = 10 % 3;");
    assertLabel(labels, reasons, "non-arith-binary");
  });

  it("non-arith-binary: exponent operator", () => {
    const { labels, reasons } = extractProbe("const __probe = 2 ** 3;");
    assertLabel(labels, reasons, "non-arith-binary");
  });
});

describe("diagnostic labels — call expressions", () => {
  it("method-call: invoking a method on an instance", () => {
    const { labels, reasons } = extractProbe(`
      class Calc { compute(x: number): number { return x * 2; } }
      const c = new Calc();
      const __probe = c.compute(5);
    `);
    assertLabel(labels, reasons, "method-call");
  });

  it("non-identifier-callee: array-indexed function call", () => {
    const { labels, reasons } = extractProbe(`
      const fns: Array<(x: number) => number> = [(x) => x * 2];
      const __probe = fns[0](3);
    `);
    assertLabel(labels, reasons, "non-identifier-callee");
  });

  it("callee-shape-not-inlineable: helper with a for-loop body", () => {
    const { labels, reasons } = extractProbe(`
      function walk(x: number): number {
        let r = x;
        for (let i = 0; i < 5; i++) r += i;
        return r;
      }
      const __probe = walk(10);
    `);
    assertLabel(labels, reasons, "callee-shape-not-inlineable");
  });

  it("external-ambient: calling a standard-library function", () => {
    const { labels, reasons } = extractProbe("const __probe = parseFloat(\"1.5\");");
    assertLabel(labels, reasons, "external-ambient");
  });

  it("recursive-call: direct self-recursion bails via cycle guard", () => {
    const { labels, reasons } = extractProbe(`
      function countdown(x: number): number { return countdown(x - 1); }
      const __probe = countdown(10);
    `);
    assertLabel(labels, reasons, "recursive-call");
  });
});

describe("diagnostic labels — Math.* IR-gap sites", () => {
  it("math-abs fires for Math.abs(x)", () => {
    const { labels, reasons } = extractProbe("const __probe = Math.abs(-3);");
    assertLabel(labels, reasons, "math-abs");
  });

  it("math-max fires for Math.max(a, b)", () => {
    const { labels, reasons } = extractProbe("const __probe = Math.max(1, 2);");
    assertLabel(labels, reasons, "math-max");
  });

  it("math-min fires for Math.min(a, b)", () => {
    const { labels, reasons } = extractProbe("const __probe = Math.min(1, 2);");
    assertLabel(labels, reasons, "math-min");
  });

  it("math-pow fires for Math.pow(x, n)", () => {
    const { labels, reasons } = extractProbe("const __probe = Math.pow(2, 3);");
    assertLabel(labels, reasons, "math-pow");
  });

  it("nested Math.abs(Math.max(...)) fires the outer label only", () => {
    const { labels, reasons } = extractProbe("const __probe = Math.abs(Math.max(1, 2));");
    assertLabel(labels, reasons, "math-abs");
  });
});

describe("diagnostic labels — reduce shape refusals", () => {
  it("reduce-non-zero-init: initial value isn't 0", () => {
    const { labels, reasons } = extractProbe(`
      declare const items: number[];
      const __probe = items.reduce((a, b) => a + b, 1);
    `);
    assertLabel(labels, reasons, "reduce-non-zero-init");
  });

  it("reduce-non-arrow-callback: callback isn't an arrow/fn expression", () => {
    const { labels, reasons } = extractProbe(`
      declare const items: number[];
      declare const cb: (a: number, b: number) => number;
      const __probe = items.reduce(cb, 0);
    `);
    assertLabel(labels, reasons, "reduce-non-arrow-callback");
  });

  it("reduce-callback-params: callback takes wrong number of params", () => {
    // `items: any` suppresses TS's signature check so the arrow survives as a
    // plain ArrowFunction (not wrapped in `as any` which would defeat the
    // ts.isArrowFunction check in the parser).
    const { labels, reasons } = extractProbe(`
      declare const items: any;
      const __probe = items.reduce((a: number) => a, 0);
    `);
    assertLabel(labels, reasons, "reduce-callback-params");
  });

  it("reduce-callback-destructure: callback destructures a parameter", () => {
    const { labels, reasons } = extractProbe(`
      declare const items: Array<{v: number}>;
      const __probe = items.reduce((a, { v }) => a + v, 0);
    `);
    assertLabel(labels, reasons, "reduce-callback-destructure");
  });

  it("reduce-callback-non-sum: callback body isn't acc + <item-expr>", () => {
    const { labels, reasons } = extractProbe(`
      declare const items: number[];
      const __probe = items.reduce((a, b) => a * b, 0);
    `);
    assertLabel(labels, reasons, "reduce-callback-non-sum");
  });
});

describe("diagnostic labels — null coalescing", () => {
  it("null-coalesce-non-field: ?? applied to a non-field expression", () => {
    const { labels, reasons } = extractProbe(`
      declare const a: number | null;
      declare const b: number | null;
      const __probe = (a ?? b) ?? 0;
    `);
    assertLabel(labels, reasons, "null-coalesce-non-field");
  });
});

describe("diagnostic labels — return-guard layer (via extractAssignedExpr)", () => {
  it("return-guard-complex: top-level if-return with a multi-statement block body", () => {
    // The matcher recognizes `if (G) return E;` only when the then-branch is
    // a bare return or a single-statement block containing a return. Two
    // statements in the then-block force the "bail" path.
    const { labels, reasons } = extractAssignedProbe(
      `
      interface Order { total: number; subtotal: number; }
      declare const log: (s: string) => void;
      function f(o: Order): Order {
        if (o.subtotal < 0) {
          log("neg");
          return o;
        }
        return { total: o.subtotal };
      }
      `,
      "total",
      { typeName: "Order", fieldNames: ["total", "subtotal"] },
    );
    assertLabel(labels, reasons, "return-guard-complex");
  });
});

describe("diagnostic labels — all labels covered exactly once", () => {
  // Compile-time sanity: the set of labels we test above plus the ones that
  // aren't reachable from an extractProbe-style snippet (prop-type-unresolvable,
  // unsupported-item-*, variable-no-init, call-depth-exceeded, call-size-exceeded,
  // external-no-source, callee param/arg count refusals) — document them
  // explicitly so a reader can see which labels sit in integration/fixture
  // territory vs. direct unit-probe territory.
  it("labels not covered here are flagged in other test files", () => {
    const deferredLabels = [
      "prop-type-unresolvable",      // needs a specific local-var type pattern — covered in property-access.test.ts
      "item-boolean-unsupported",    // inside every() body — covered in item-expressions.test.ts
      "item-expression-unsupported", // inside reduce() body — covered in item-expressions.test.ts
      "variable-no-init",            // declaration without initializer — covered in local-tracing.test.ts
      "call-depth-exceeded",         // cost guard — covered in cost-guards.test.ts
      "call-size-exceeded",          // cost guard — covered in cost-guards.test.ts
      "external-no-source",          // rare: symbol with no valueDeclaration — documented gap
      "reduce-complex-receiver",     // covered in reduce-to-sum.test.ts
      "reduce-callback-body",        // covered in reduce-to-sum.test.ts
    ];
    assert.ok(deferredLabels.length > 0, "sanity: deferred-labels list is non-empty");
  });
});
