import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { discover } from "../../unit/discovery/harness.js";

const ROOT = new URL(".", import.meta.url).pathname;

function read(name: string): string {
  return readFileSync(join(ROOT, name), "utf-8");
}

describe("real-codebase fixtures — discovery", () => {
  it("cal.com SSRFValidationResult: every return literal becomes a labelled site", () => {
    const code = read("calcom-validation-result.ts");
    const { sites, diagnostics } = discover(code, "SSRFValidationResult", [
      "isValid",
      "error",
    ]);
    assert.equal(diagnostics.length, 0);
    assert.equal(sites.length, 4);
    for (const site of sites) {
      assert.equal(site.targetType.name, "SSRFValidationResult");
      assert.ok(site.targets.length >= 1);
    }
  });

  it("strapi TimeInterval: factory return and typed const both surface as sites", () => {
    const code = read("strapi-time-interval.ts");
    const { sites, diagnostics } = discover(code, "TimeInterval", ["start", "end"]);
    assert.equal(diagnostics.length, 0);
    assert.equal(sites.length, 2);
    for (const site of sites) {
      assert.equal(site.targetType.name, "TimeInterval");
      assert.deepEqual(
        site.targets.map((t) => t.fieldName).sort(),
        ["end", "start"],
      );
    }
  });
});
