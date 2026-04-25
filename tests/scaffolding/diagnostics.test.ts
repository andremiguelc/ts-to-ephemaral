import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CATALOG } from "../../src/diagnostics/catalog.js";
import { emit } from "../../src/diagnostics/emit.js";

describe("diagnostics — empty shape", () => {
  it("catalog starts empty", () => {
    assert.deepStrictEqual(CATALOG, {});
  });

  it("emit is exported", () => {
    assert.equal(typeof emit, "function");
  });
});
