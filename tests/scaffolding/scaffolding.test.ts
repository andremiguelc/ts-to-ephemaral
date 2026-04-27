/**
 * Durable invariants from the refactor's setup phase:
 *   1. legacy parser is archived under legacy/, not src/
 *   2. tsc --noEmit passes
 *   3. legacy/ is invisible to the test runner and tsc
 *   4. CLI prints a usage line and exits non-zero when called without args
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;

describe("refactor invariants", () => {
  it("legacy parser is archived under legacy/src/", () => {
    assert.ok(existsSync(join(ROOT, "legacy/src/expr-extractor.ts")));
    assert.ok(existsSync(join(ROOT, "legacy/src/field-finder.ts")));
    assert.ok(!existsSync(join(ROOT, "src/expr-extractor.ts")));
    assert.ok(!existsSync(join(ROOT, "src/field-finder.ts")));
  });

  it("tsc --noEmit passes", () => {
    const r = spawnSync("npx", ["tsc", "--noEmit"], {
      cwd: ROOT,
      encoding: "utf-8",
    });
    assert.equal(r.status, 0, `tsc failed:\n${r.stdout}\n${r.stderr}`);
  });

  it("legacy/ is invisible to the test runner and the type checker", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
    for (const [name, cmd] of Object.entries(pkg.scripts as Record<string, string>)) {
      if (name.startsWith("test")) {
        assert.ok(!cmd.includes("legacy"), `script ${name} touches legacy/: ${cmd}`);
      }
    }
    const ts = JSON.parse(readFileSync(join(ROOT, "tsconfig.json"), "utf-8"));
    const exclude: string[] = ts.exclude ?? [];
    assert.ok(exclude.some((p) => p.startsWith("legacy")));
  });

  it("CLI prints usage and exits non-zero when called without args", () => {
    const r = spawnSync("npx", ["tsx", join(ROOT, "src/extract.ts")], {
      cwd: ROOT,
      encoding: "utf-8",
    });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /usage: extract.*\.aral.*--tsconfig/);
  });
});
