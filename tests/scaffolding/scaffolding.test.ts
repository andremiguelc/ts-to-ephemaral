/**
 * Scaffolding invariants — segment 1 (cliff-edge).
 *
 * Four small checks that prove the refactor's setup state holds:
 *   1. legacy parser is at legacy/, not src/
 *   2. CLI errors with the scaffolding message
 *   3. tsc --noEmit passes (no dangling imports in src/)
 *   4. legacy/ is invisible to the test runner and tsc
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;
const PHRASE = "parser: not implemented (stage: scaffolding)";

describe("scaffolding — segment 1 invariants", () => {
  it("legacy parser is archived under legacy/src/", () => {
    assert.ok(existsSync(join(ROOT, "legacy/src/expr-extractor.ts")));
    assert.ok(existsSync(join(ROOT, "legacy/src/field-finder.ts")));
    assert.ok(!existsSync(join(ROOT, "src/expr-extractor.ts")));
    assert.ok(!existsSync(join(ROOT, "src/field-finder.ts")));
  });

  it("CLI errors with the scaffolding message and points at the roadmap", () => {
    const r = spawnSync("npx", ["tsx", join(ROOT, "src/extract.ts")], {
      cwd: ROOT,
      encoding: "utf-8",
    });
    assert.notEqual(r.status, 0);
    assert.ok(r.stderr.includes(PHRASE), `stderr was: ${r.stderr}`);
    assert.match(r.stderr, /roadmap\/parser-refactor\/INDEX\.md/);
  });

  it("tsc --noEmit passes (no dangling imports left by the move)", () => {
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
});
