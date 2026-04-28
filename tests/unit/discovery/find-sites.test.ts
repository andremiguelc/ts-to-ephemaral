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
    assert.equal(c.kind, "literal");
    if (c.kind !== "literal") return;
    const line = sourceFile.getLineAndCharacterOfPosition(c.literal.getStart()).line + 1;
    assert.equal(c.sourceFile.fileName, "/virtual/snippet.ts");
    assert.equal(line, 3);
  });

  it("finds a `this.field = expr` assignment in a constructor", () => {
    const { program } = compileSnippet(`
      interface Order { total: number }
      class Service {
        order: Order;
        constructor(o: Order) {
          this.order = o;
        }
      }
    `);
    const candidates = find(program, "Service");
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].kind, "assignment");
  });

  it("finds an `obj.field = expr` assignment on a typed parameter", () => {
    const { program } = compileSnippet(`
      interface Order { total: number }
      function reset(o: Order, n: number): void {
        o.total = n;
      }
    `);
    const candidates = find(program, "Order");
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].kind, "assignment");
  });

  it("finds a multi-hop LHS where the receiver of the final access matches", () => {
    const { program } = compileSnippet(`
      interface Order { total: number }
      class Holder { order: Order = { total: 0 }; }
      function bump(h: Holder, n: number): void {
        h.order.total = n;
      }
    `);
    const candidates = find(program, "Order");
    const assigns = candidates.filter((c) => c.kind === "assignment");
    assert.equal(assigns.length, 1);
  });

  it("does not find a `this.field = expr` when the class type is not the target", () => {
    const { program } = compileSnippet(`
      interface Order { total: number }
      class Other {
        value: number = 0;
        bump(n: number): void {
          this.value = n;
        }
      }
    `);
    const candidates = find(program, "Order");
    assert.equal(candidates.filter((c) => c.kind === "assignment").length, 0);
  });

  it("ignores compound assignments like `+=`", () => {
    const { program } = compileSnippet(`
      interface Order { total: number }
      function bump(o: Order, n: number): void {
        o.total += n;
      }
    `);
    const candidates = find(program, "Order");
    assert.equal(candidates.filter((c) => c.kind === "assignment").length, 0);
  });
});
