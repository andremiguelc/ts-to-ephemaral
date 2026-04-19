#!/usr/bin/env npx tsx
/**
 * Expression-level extractor — CLI entry point
 *
 * Usage:
 *   npx tsx src/extract.ts <file.aral> --tsconfig <path/to/tsconfig.json> [--out <dir>]
 *
 * Reads the .aral file to identify the target type and fields, then scans
 * the TypeScript project for every assignment to those fields. Produces
 * one .aral-fn.json per assignment site.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, basename, dirname, join } from "path";
import { readAralFile } from "./aral-reader.js";
import { createProgramFromConfig, findAssignmentSites } from "./field-finder.js";
import {
  extractAssignedExpr,
  createContext,
  type ExtractionContext,
} from "./expr-extractor.js";
import type { AralFn, Expr } from "./types.js";
import { ARAL_FN_VERSION } from "./types.js";

// ─── CLI argument parsing ────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

const aralPath = args.find((a) => !a.startsWith("--"));
const tsconfigPath = getArg("--tsconfig");
const outDir = getArg("--out");

if (!aralPath || !tsconfigPath) {
  console.error("Usage: npx tsx src/extract.ts <file.aral> --tsconfig <path> [--out <dir>]");
  console.error("");
  console.error("  <file.aral>     Path to the .aral invariant file");
  console.error("  --tsconfig      Path to the project's tsconfig.json");
  console.error("  --out           Output directory for .aral-fn.json files");
  console.error("                  (default: .ephemaral/parsed/<aral-name>/)");
  process.exit(1);
}

// ─── Read .aral file ─────────────────────────────────────────────

const aralContent = readFileSync(resolve(aralPath), "utf-8");
const target = readAralFile(aralContent);

if (!target.typeName) {
  console.error(`No type references found in ${aralPath}`);
  process.exit(1);
}

const aralName = basename(aralPath, ".aral");

// ─── Create TS program ──────────────────────────────────────────

const program = createProgramFromConfig(resolve(tsconfigPath));

// Count scanned files (non-declaration, non-node_modules)
const scannedFiles = program.getSourceFiles().filter(
  (sf) => !sf.isDeclarationFile && !sf.fileName.includes("node_modules")
).length;

console.log(`\n  ${target.typeName} (${basename(aralPath)})\n`);

// ─── Find assignment sites ───────────────────────────────────────

const allFields = [...target.fieldNames, ...target.collectionNames];
const sites = findAssignmentSites(program, target.typeName, allFields);

if (sites.length === 0) {
  console.log(`  (no assignment sites found)\n`);
  console.log(`  0 passed, 0 with gaps`);
  console.log(`  Scanned ${scannedFiles} files via ${basename(tsconfigPath)}`);
  process.exit(0);
}

// ─── Extract expressions and write JSON ──────────────────────────

// Determine output directory
const outputBase = outDir
  ? resolve(outDir)
  : join(dirname(resolve(aralPath)), "..", "parsed", aralName);

mkdirSync(outputBase, { recursive: true });

// Group sites by field for reporting
const sitesByField = new Map<string, typeof sites>();
for (const site of sites) {
  const existing = sitesByField.get(site.fieldName) ?? [];
  existing.push(site);
  sitesByField.set(site.fieldName, existing);
}

let totalExtracted = 0;
let totalFull = 0;
let totalWithGaps = 0;
const outputs: string[] = [];

for (const [fieldName, fieldSites] of sitesByField) {
  console.log(`    ${fieldName}`);

  for (const site of fieldSites) {
    const ctx = createContext(
      target.typeName,
      target.fieldNames,
      target.collectionNames,
      target.collectionItemFields,
      program.getTypeChecker(),
    );

    // Try to detect the input parameter name from the containing function
    ctx.inputParamName = detectInputParam(site);

    const expr = extractAssignedExpr(site, ctx);

    // Collect all fields referenced in the expression
    const referencedFields = collectFieldNames(expr);

    // Build the AralFn JSON
    // inputFields must include the assigned field + any referenced fields from the type
    const knownFields = new Set(
      Array.from(referencedFields).filter((f) =>
        target.fieldNames.includes(f) || target.collectionNames.includes(f)
      )
    );
    knownFields.add(fieldName); // assigned field must always be in inputFields
    const aralFn: AralFn = {
      name: `${site.containerName}-${fieldName}`,
      inputType: target.typeName,
      inputFields: Array.from(knownFields),
      params: [
        ...Array.from(ctx.unconstrainedParams.keys()),
        ...collectQualifiedParamNames(expr),
      ],
      assigns: [{ fieldName, value: expr }],
    };

    // Add typedParams if any were discovered
    if (ctx.typedParams.size > 0) {
      aralFn.typedParams = Array.from(ctx.typedParams.entries()).map(
        ([name, type]) => ({ name, type })
      );
    }

    // Add optionalFields for any simple-name field referenced by an isPresent node.
    // The walker only collects simple-name refs, so qualified (typed-param) refs
    // don't land here — they flow through params via collectQualifiedParamNames.
    const optionalFields = Array.from(collectOptionalFields(expr));
    if (optionalFields.length > 0) {
      aralFn.optionalFields = optionalFields;
    }

    // Write the JSON file
    const shortFile = makeShortPath(site.filePath);
    const hash = hashId(`${site.filePath}:${site.line}:${fieldName}`);
    const jsonName = `${shortFile}-${hash}-${fieldName}.aral-fn.json`;
    const jsonPath = join(outputBase, jsonName);
    writeFileSync(jsonPath, JSON.stringify(aralFn, null, 2) + "\n");
    outputs.push(jsonPath);

    // Report — test-runner style
    const hasGaps = ctx.unconstrainedParams.size > 0;
    totalExtracted++;
    const lineRef = `${shortFile}.ts:${site.line}`;
    if (hasGaps) {
      totalWithGaps++;
      const paramNames = Array.from(ctx.unconstrainedParams.keys());
      console.log(`      ⚠ ${lineRef} — ${site.containerName}  (${paramNames.join(", ")})`);
    } else {
      totalFull++;
      console.log(`      ✓ ${lineRef} — ${site.containerName}`);
    }
  }
}

// ─── Summary ─────────────────────────────────────────────────────

console.log("");
console.log(`  ${totalFull} passed, ${totalWithGaps} with gaps`);
console.log(`  Scanned ${scannedFiles} files via ${basename(tsconfigPath)}`);
console.log(`  Output: ${outputBase}/`);

// ─── Helpers ─────────────────────────────────────────────────────

import ts from "typescript";

/**
 * Create a short but unique file identifier from an absolute path.
 * For "packages/app-store/stripepayment/lib/PaymentService.ts" → "stripepayment-PaymentService"
 * Uses the last non-"lib"/"src" directory + filename.
 */
/** 8-char hex hash of a string (FNV-1a, no crypto dep needed) */
function hashId(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function makeShortPath(filePath: string): string {
  const parts = filePath.replace(/\.tsx?$/, "").split("/");
  const fileName = parts[parts.length - 1];
  // Walk backwards to find a meaningful parent dir (skip lib, src, utils, etc.)
  const skipDirs = new Set(["lib", "src", "utils", "helpers", "services", "api"]);
  for (let i = parts.length - 2; i >= 0; i--) {
    if (!skipDirs.has(parts[i])) {
      return `${parts[i]}-${fileName}`;
    }
  }
  return fileName;
}

function detectInputParam(site: (typeof sites)[0]): string | null {
  // Walk up from the expression node to find the containing function's first parameter
  let current: ts.Node | undefined = site.expressionNode.parent;
  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isArrowFunction(current) ||
      ts.isFunctionExpression(current) ||
      ts.isMethodDeclaration(current)
    ) {
      const params = current.parameters;
      if (params.length > 0 && ts.isIdentifier(params[0].name)) {
        return params[0].name.text;
      }
      return null;
    }
    current = current.parent;
  }
  return null;
}

/** Collect simple-name field refs appearing inside isPresent nodes.
 *  These populate the top-level optionalFields — isPresent(f) is only meaningful
 *  when f is declared optional, and the pipeline uses optionalFields to generate
 *  has-<field> presence constants that the isPresent compilation depends on. */
function collectOptionalFields(expr: Expr): Set<string> {
  const names = new Set<string>();
  walkExpr(expr);
  return names;

  function walkExpr(e: Expr) {
    if ("lit" in e) return;
    if ("field" in e) return;
    if ("arith" in e) {
      walkExpr(e.arith.left);
      walkExpr(e.arith.right);
      return;
    }
    if ("ite" in e) {
      walkBoolExpr(e.ite.cond);
      walkExpr(e.ite.then);
      walkExpr(e.ite.else);
      return;
    }
    if ("round" in e) {
      walkExpr(e.round.expr);
      return;
    }
    if ("sum" in e) {
      walkExpr(e.sum.body);
      return;
    }
  }

  function walkBoolExpr(b: BoolExpr) {
    if ("cmp" in b) {
      walkExpr(b.cmp.left);
      walkExpr(b.cmp.right);
    } else if ("logic" in b) {
      walkBoolExpr(b.logic.left);
      walkBoolExpr(b.logic.right);
    } else if ("not" in b) {
      walkBoolExpr(b.not);
    } else if ("isPresent" in b) {
      if ("name" in b.isPresent && !("qualifier" in b.isPresent)) {
        names.add(b.isPresent.name);
      }
    } else if ("each" in b) {
      walkBoolExpr(b.each.body);
    }
  }
}

function collectFieldNames(expr: Expr): Set<string> {
  const names = new Set<string>();
  walkExpr(expr);
  return names;

  function walkExpr(e: Expr) {
    if ("lit" in e) return;
    if ("field" in e) {
      if ("name" in e.field && !("qualifier" in e.field)) {
        names.add(e.field.name);
      }
      return;
    }
    if ("arith" in e) {
      walkExpr(e.arith.left);
      walkExpr(e.arith.right);
      return;
    }
    if ("ite" in e) {
      walkBoolExpr(e.ite.cond);
      walkExpr(e.ite.then);
      walkExpr(e.ite.else);
      return;
    }
    if ("round" in e) {
      walkExpr(e.round.expr);
      return;
    }
    if ("sum" in e) {
      names.add(e.sum.collection);
      walkExpr(e.sum.body);
      return;
    }
  }

  function walkBoolExpr(b: BoolExpr) {
    if ("cmp" in b) {
      walkExpr(b.cmp.left);
      walkExpr(b.cmp.right);
    } else if ("logic" in b) {
      walkBoolExpr(b.logic.left);
      walkBoolExpr(b.logic.right);
    } else if ("not" in b) {
      walkBoolExpr(b.not);
    } else if ("isPresent" in b) {
      if ("name" in b.isPresent) names.add(b.isPresent.name);
    } else if ("each" in b) {
      names.add(b.each.collection);
      walkBoolExpr(b.each.body);
    }
  }
}

/** Collect compound "qualifier-name" strings from qualified field refs in an expression.
 *  For isPresent on qualified fields, also emits the "has-qualifier-name" presence key. */
function collectQualifiedParamNames(expr: Expr): string[] {
  const names = new Set<string>();
  walkExpr(expr);
  return Array.from(names);

  function walkExpr(e: Expr) {
    if ("lit" in e) return;
    if ("field" in e) {
      if ("qualifier" in e.field) {
        names.add(e.field.qualifier + "-" + e.field.name);
      }
      return;
    }
    if ("arith" in e) {
      walkExpr(e.arith.left);
      walkExpr(e.arith.right);
      return;
    }
    if ("ite" in e) {
      walkBoolExpr(e.ite.cond);
      walkExpr(e.ite.then);
      walkExpr(e.ite.else);
      return;
    }
    if ("round" in e) {
      walkExpr(e.round.expr);
      return;
    }
    if ("sum" in e) {
      walkExpr(e.sum.body);
      return;
    }
  }

  function walkBoolExpr(b: BoolExpr) {
    if ("cmp" in b) {
      walkExpr(b.cmp.left);
      walkExpr(b.cmp.right);
    } else if ("logic" in b) {
      walkBoolExpr(b.logic.left);
      walkBoolExpr(b.logic.right);
    } else if ("not" in b) {
      walkBoolExpr(b.not);
    } else if ("isPresent" in b) {
      if ("qualifier" in b.isPresent) {
        const key = b.isPresent.qualifier + "-" + b.isPresent.name;
        names.add(key);
        names.add("has-" + key);
      }
    } else if ("each" in b) {
      walkBoolExpr(b.each.body);
    }
  }
}
