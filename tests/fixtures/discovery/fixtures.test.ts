import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { discover } from "../../unit/discovery/harness.js";

const ROOT = new URL(".", import.meta.url).pathname;

function read(name: string): string {
  return readFileSync(join(ROOT, name), "utf-8");
}

describe("fixtures — discovery patterns", () => {
  it("validation-result: every return literal becomes a labelled site", () => {
    const code = read("validation-result.ts");
    const { sites, diagnostics } = discover(code, "ValidationResult", [
      "isValid",
      "error",
    ]);
    assert.equal(diagnostics.length, 0);
    assert.equal(sites.length, 4);
    for (const site of sites) {
      assert.equal(site.targetType.name, "ValidationResult");
      assert.ok(site.targets.length >= 1);
    }
  });

  it("time-interval: factory return and typed const both surface as sites", () => {
    const code = read("time-interval.ts");
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

  it("aliased-pick: the aliased utility-type surfaces with its picked fields", () => {
    const code = read("aliased-pick.ts");
    const { sites, diagnostics } = discover(code, "ICSCalendarEvent", [
      "uid",
      "startTime",
      "endTime",
      "title",
    ]);
    assert.equal(diagnostics.length, 0);
    assert.equal(sites.length, 1);
    assert.equal(sites[0].targetType.name, "ICSCalendarEvent");
    assert.deepEqual(
      sites[0].targets.map((t) => t.fieldName).sort(),
      ["endTime", "startTime", "title", "uid"],
    );
  });

  it("destructured-handler: destructured params flow through the signature", () => {
    const code = read("destructured-handler.ts");
    const { sites, diagnostics } = discover(code, "PermissionResult", [
      "authorized",
      "reason",
    ]);
    assert.equal(diagnostics.length, 0);
    assert.equal(sites.length, 1);
    assert.deepEqual(
      sites[0].signature.parameters.map((p) => p.name).sort(),
      ["ctx", "input"],
    );
  });
});
