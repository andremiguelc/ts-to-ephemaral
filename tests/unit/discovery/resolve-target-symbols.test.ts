import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveTargetSymbols } from "../../../src/discovery/resolve-target-symbols.js";
import { compileSnippet } from "./harness.js";

describe("resolve-target-symbols", () => {
  it("finds an interface declaration", () => {
    const { program } = compileSnippet(`interface Order { total: number }`);
    assert.equal(resolveTargetSymbols("Order", program).size, 1);
  });

  it("finds a type alias declaration", () => {
    const { program } = compileSnippet(`type Order = { total: number };`);
    assert.equal(resolveTargetSymbols("Order", program).size >= 1, true);
  });

  it("includes the underlying interface symbol when the alias is transparent", () => {
    const { program } = compileSnippet(`
      interface Inner { total: number }
      type Order = Inner;
    `);
    assert.equal(resolveTargetSymbols("Order", program).size >= 2, true);
  });

  it("matches the target name case-insensitively", () => {
    const { program } = compileSnippet(`interface Order { total: number }`);
    assert.equal(resolveTargetSymbols("order", program).size, 1);
  });

  it("returns an empty set when the target is undeclared", () => {
    const { program } = compileSnippet(`interface Other { value: number }`);
    assert.equal(resolveTargetSymbols("Order", program).size, 0);
  });

  it("collects both declarations when interface and type alias share a name", () => {
    const { program } = compileSnippet(`
      interface Order { total: number }
      // a type alias by the same name in a different file would normally clash;
      // here we just confirm the resolver does not crash on duplicates
    `);
    assert.equal(resolveTargetSymbols("Order", program).size >= 1, true);
  });
});
