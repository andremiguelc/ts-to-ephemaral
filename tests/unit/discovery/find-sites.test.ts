import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findSiteCandidates } from "../../../src/discovery/find-sites.js";
import { compileSnippet } from "./harness.js";

describe("find-sites", () => {
  it("finds object literal in a return statement", () => {
    const { program } = compileSnippet(`
      interface Order { total: number }
      function f(): Order { return { total: 1 }; }
    `);
    assert.equal(findSiteCandidates(program, "Order").length, 1);
  });

  it("finds object literal in a typed const declaration", () => {
    const { program } = compileSnippet(`
      interface Order { total: number }
      const o: Order = { total: 1 };
    `);
    assert.equal(findSiteCandidates(program, "Order").length, 1);
  });

  it("finds object literal as a typed function argument", () => {
    const { program } = compileSnippet(`
      interface Order { total: number }
      function consume(o: Order): void {}
      consume({ total: 1 });
    `);
    assert.equal(findSiteCandidates(program, "Order").length, 1);
  });

  it("does not find object literals without a matching contextual type", () => {
    const { program } = compileSnippet(`
      interface Order { total: number }
      const x = { total: 1 };
    `);
    assert.equal(findSiteCandidates(program, "Order").length, 0);
  });

  it("matches the target name case-insensitively", () => {
    const { program } = compileSnippet(`
      interface Order { total: number }
      function f(): Order { return { total: 1 }; }
    `);
    assert.equal(findSiteCandidates(program, "order").length, 1);
  });

  it("walks union constituents", () => {
    const { program } = compileSnippet(`
      interface Order { total: number }
      function f(b: boolean): Order | null {
        if (b) return null;
        return { total: 1 };
      }
    `);
    assert.equal(findSiteCandidates(program, "Order").length, 1);
  });

  it("records source location of each candidate", () => {
    const { program, sourceFile } = compileSnippet(`
      interface Order { total: number }
      function f(): Order { return { total: 1 }; }
    `);
    const [c] = findSiteCandidates(program, "Order");
    const line = sourceFile.getLineAndCharacterOfPosition(c.literal.getStart()).line + 1;
    assert.equal(c.sourceFile.fileName, "/virtual/snippet.ts");
    assert.equal(line, 3);
  });
});
