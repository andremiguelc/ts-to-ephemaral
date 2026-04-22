/**
 * Top-level return-guard layer (collectReturnGuards + matchReturnGuard +
 * extractEarlyValue + applyGuardsToExpr). Covers bare-return guards,
 * block-wrapped single-return guards, throw-guard skip behavior, and
 * bail shapes.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractAssignedProbe } from "../harness.js";

describe("return-guard layer — bare if-return", () => {
  it("single guard lifts to ite wrapping the assignment", () => {
    const { ir } = extractAssignedProbe(
      `
      interface Input { v: number; }
      function f(input: Input): { v: number } {
        if (input.v < 0) return input;
        return { v: input.v * 2 };
      }
      `,
      "v",
      { typeName: "Input", fieldNames: ["v"] },
    );
    assert.ok("ite" in ir);
    const ite = (ir as any).ite;
    assert.equal(ite.cond.cmp.op, "lt");
    // The early branch: `return input` on field v → passthrough.
    assert.deepStrictEqual(ite.then, { field: { name: "v" } });
  });

  it("two sequential guards lift to nested ite", () => {
    const { ir } = extractAssignedProbe(
      `
      interface Input { v: number; }
      function f(input: Input): { v: number } {
        if (input.v < 0) return input;
        if (input.v > 100) return input;
        return { v: input.v * 2 };
      }
      `,
      "v",
      { typeName: "Input", fieldNames: ["v"] },
    );
    assert.ok("ite" in ir);
    assert.ok("ite" in (ir as any).ite.else);
  });
});

describe("return-guard layer — single-statement block", () => {
  it("`if (G) { return E; }` single-statement block is accepted", () => {
    const { ir } = extractAssignedProbe(
      `
      interface Input { v: number; }
      function f(input: Input): { v: number } {
        if (input.v < 0) { return input; }
        return { v: input.v * 2 };
      }
      `,
      "v",
      { typeName: "Input", fieldNames: ["v"] },
    );
    assert.ok("ite" in ir);
  });
});

describe("return-guard layer — throw guards (skipped)", () => {
  it("`if (G) throw ...;` is silently skipped, not bailed on", () => {
    const { ir } = extractAssignedProbe(
      `
      interface Input { v: number; }
      function f(input: Input): { v: number } {
        if (input.v < 0) throw new Error("neg");
        return { v: input.v * 2 };
      }
      `,
      "v",
      { typeName: "Input", fieldNames: ["v"] },
    );
    // Throw-guard doesn't add an ite; the assignment resolves to its
    // fallthrough value directly.
    assert.equal((ir as any).arith?.op, "mul");
  });
});

describe("return-guard layer — bail shapes", () => {
  it("if-else branches both pass-through-returning: bails with return-guard-complex", () => {
    // Both branches return `input` (passthrough — no `v:` in either), so the
    // only `v:` property is in the fallthrough final return. The if-else
    // then triggers the bail because of its else branch.
    const { labels } = extractAssignedProbe(
      `
      interface Input { v: number; }
      function f(input: Input): { v: number } {
        if (input.v < 0) return input;
        else return input;
        return { v: input.v };
      }
      `,
      "v",
      { typeName: "Input", fieldNames: ["v"] },
    );
    assert.equal(labels[0], "return-guard-complex");
  });

  it("multi-statement block in then: bails with return-guard-complex", () => {
    const { labels } = extractAssignedProbe(
      `
      interface Input { v: number; }
      declare const log: (s: string) => void;
      function f(input: Input): { v: number } {
        if (input.v < 0) { log("neg"); return input; }
        return { v: input.v * 2 };
      }
      `,
      "v",
      { typeName: "Input", fieldNames: ["v"] },
    );
    assert.equal(labels[0], "return-guard-complex");
  });
});

describe("return-guard layer — early-value extraction", () => {
  it("early return of object literal with spread: passthrough for fields not named", () => {
    const { ir } = extractAssignedProbe(
      `
      interface Input { v: number; w: number; }
      function f(input: Input): { v: number; w: number } {
        if (input.v < 0) return { ...input, w: 0 };
        return { v: input.v * 2, w: input.w };
      }
      `,
      "v",
      { typeName: "Input", fieldNames: ["v", "w"] },
    );
    // The guard's early branch (for field "v") is passthrough because spread
    // is present and "v" isn't assigned in the early-return object.
    assert.ok("ite" in ir);
    assert.deepStrictEqual((ir as any).ite.then, { field: { name: "v" } });
  });

  // Note: we don't unit-test the "early return assigning the same field name"
  // path via extractAssignedProbe because the harness's findNode always picks
  // the first property-assignment match in AST order, which lands inside the
  // early-return block — not the fallthrough site we'd want to dominate.
  // Integration tests in `tests/extract.test.ts` cover that behavior via
  // multi-site extraction across separate fixture files.
});
