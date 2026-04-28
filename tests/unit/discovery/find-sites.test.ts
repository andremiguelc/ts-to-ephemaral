import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { findSiteCandidates } from "../../../src/discovery/find-sites.js";
import { resolveTargetSymbols } from "../../../src/discovery/resolve-target-symbols.js";
import { compileSnippet } from "./harness.js";

function find(program: ts.Program, name: string) {
  return findSiteCandidates(program, resolveTargetSymbols(name, program));
}

describe("find-sites", () => {
  it("finds object literal in a return statement", () => {
    const { program } = compileSnippet(`
      interface Order { total: number }
      function f(): Order { return { total: 1 }; }
    `);
    assert.equal(find(program, "Order").length, 1);
  });

  it("finds object literal in a typed const declaration", () => {
    const { program } = compileSnippet(`
      interface Order { total: number }
      const o: Order = { total: 1 };
    `);
    assert.equal(find(program, "Order").length, 1);
  });

  it("finds object literal as a typed function argument", () => {
    const { program } = compileSnippet(`
      interface Order { total: number }
      function consume(o: Order): void {}
      consume({ total: 1 });
    `);
    assert.equal(find(program, "Order").length, 1);
  });

  it("does not find object literals without a matching contextual type", () => {
    const { program } = compileSnippet(`
      interface Order { total: number }
      const x = { total: 1 };
    `);
    assert.equal(find(program, "Order").length, 0);
  });

  it("matches the target name case-insensitively", () => {
    const { program } = compileSnippet(`
      interface Order { total: number }
      function f(): Order { return { total: 1 }; }
    `);
    assert.equal(find(program, "order").length, 1);
  });

  it("walks union constituents", () => {
    const { program } = compileSnippet(`
      interface Order { total: number }
      function f(b: boolean): Order | null {
        if (b) return null;
        return { total: 1 };
      }
    `);
    assert.equal(find(program, "Order").length, 1);
  });

  it("matches through a transparent type alias", () => {
    const { program } = compileSnippet(`
      interface Inner { total: number }
      type Order = Inner;
      function f(): Order { return { total: 1 }; }
    `);
    assert.equal(find(program, "Order").length, 1);
  });

  it("matches through an aliased Pick utility type", () => {
    const { program } = compileSnippet(`
      interface Inner { total: number; tax: number; subtotal: number }
      type Order = Pick<Inner, "total" | "tax">;
      function f(): Order { return { total: 1, tax: 0 }; }
    `);
    assert.equal(find(program, "Order").length, 1);
  });

  it("matches through an aliased conditional type (z.infer-style)", () => {
    const { program } = compileSnippet(`
      type Infer<T> = T extends { _out: infer O } ? O : never;
      declare const schema: { _out: { total: number; tax: number } };
      type Order = Infer<typeof schema>;
      function f(): Order { return { total: 1, tax: 0 }; }
    `);
    assert.equal(find(program, "Order").length, 1);
  });

  it("returns no candidates when the target has no matching declaration", () => {
    const { program } = compileSnippet(`
      interface Other { value: number }
      function f(): Other { return { value: 1 }; }
    `);
    assert.equal(find(program, "Order").length, 0);
  });

  it("records source location of each candidate", () => {
    const { program, sourceFile } = compileSnippet(`
      interface Order { total: number }
      function f(): Order { return { total: 1 }; }
    `);
    const [c] = find(program, "Order");
    const line = sourceFile.getLineAndCharacterOfPosition(c.literal.getStart()).line + 1;
    assert.equal(c.sourceFile.fileName, "/virtual/snippet.ts");
    assert.equal(line, 3);
  });
});
