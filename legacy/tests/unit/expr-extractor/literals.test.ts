import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractProbe } from "../harness.js";

describe("literals — numeric", () => {
  it("positive integer", () => {
    const { ir, ctx } = extractProbe(`const __probe = 42;`);
    assert.deepStrictEqual(ir, { lit: 42 });
    assert.equal(ctx.unconstrainedParams.size, 0);
  });

  it("zero", () => {
    const { ir } = extractProbe(`const __probe = 0;`);
    assert.deepStrictEqual(ir, { lit: 0 });
  });

  it("float", () => {
    const { ir } = extractProbe(`const __probe = 3.14;`);
    assert.deepStrictEqual(ir, { lit: 3.14 });
  });

  it("negative integer via prefix unary", () => {
    const { ir } = extractProbe(`const __probe = -7;`);
    assert.deepStrictEqual(ir, { lit: -7 });
  });

  it("negative float via prefix unary", () => {
    const { ir } = extractProbe(`const __probe = -0.5;`);
    assert.deepStrictEqual(ir, { lit: -0.5 });
  });

  it("parenthesized literal unwraps", () => {
    const { ir } = extractProbe(`const __probe = (42);`);
    assert.deepStrictEqual(ir, { lit: 42 });
  });

  it("parenthesized negative literal unwraps", () => {
    const { ir } = extractProbe(`const __probe = (-3);`);
    assert.deepStrictEqual(ir, { lit: -3 });
  });

  it("doubly parenthesized literal unwraps", () => {
    const { ir } = extractProbe(`const __probe = ((5));`);
    assert.deepStrictEqual(ir, { lit: 5 });
  });

  it("very large integer preserved", () => {
    const { ir } = extractProbe(`const __probe = 1000000;`);
    assert.deepStrictEqual(ir, { lit: 1000000 });
  });

  it("very small float preserved", () => {
    const { ir } = extractProbe(`const __probe = 0.0001;`);
    assert.deepStrictEqual(ir, { lit: 0.0001 });
  });
});

describe("literals — alternate numeric forms", () => {
  it("hex `0xff` → lit(255)", () => {
    const { ir } = extractProbe(`const __probe = 0xff;`);
    assert.deepStrictEqual(ir, { lit: 255 });
  });

  it("binary `0b1010` → lit(10)", () => {
    const { ir } = extractProbe(`const __probe = 0b1010;`);
    assert.deepStrictEqual(ir, { lit: 10 });
  });

  it("octal `0o17` → lit(15)", () => {
    const { ir } = extractProbe(`const __probe = 0o17;`);
    assert.deepStrictEqual(ir, { lit: 15 });
  });

  it("scientific notation `1.5e3` → lit(1500)", () => {
    const { ir } = extractProbe(`const __probe = 1.5e3;`);
    assert.deepStrictEqual(ir, { lit: 1500 });
  });

  it("underscore separator `1_000_000` → lit(1000000)", () => {
    const { ir } = extractProbe(`const __probe = 1_000_000;`);
    assert.deepStrictEqual(ir, { lit: 1000000 });
  });
});

describe("literals — unary plus is the identity", () => {
  it("`+42` on a literal → lit(42)", () => {
    const { ir } = extractProbe(`const __probe = +42;`);
    assert.deepStrictEqual(ir, { lit: 42 });
  });

  it("`+x` on a field → field(x)", () => {
    const { ir } = extractProbe(
      `declare const x: number; const __probe = +x;`,
    );
    assert.deepStrictEqual(ir, { field: { name: "x" } });
  });
});
