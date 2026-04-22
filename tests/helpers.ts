/**
 * Test helpers — extract expressions from fixture files using the expression-level pipeline.
 * No subprocess, no file I/O — direct function calls.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import ts from "typescript";
import { readAralFile } from "../src/aral-reader.js";
import { createProgramFromConfig, findAssignmentSites, type AssignmentSite } from "../src/field-finder.js";
import { extractAssignedExpr, createContext } from "../src/expr-extractor.js";
import type { AralFn, Expr, BoolExpr } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, "fixtures");
const TSCONFIG_PATH = resolve(FIXTURES_DIR, "tsconfig.json");

export interface ExtractedSite extends AralFn {
  /** Source file path */
  filePath: string;
  /** 1-based line number */
  line: number;
  /** Number of unconstrained parameters */
  unconstrainedCount: number;
  /** Stable diagnostic labels, one per unconstrained parameter, in emission order.
   *  Entries are undefined for any site that hasn't been migrated to the new
   *  labeling scheme yet; tests should use this array as the primary contract. */
  unconstrainedLabels: Array<string | undefined>;
}

/** Extract all assignment sites for the given .aral file. */
export function extractAll(aralName: string): ExtractedSite[] {
  const aralPath = resolve(FIXTURES_DIR, aralName);
  const aralContent = readFileSync(aralPath, "utf-8");
  const target = readAralFile(aralContent);

  if (!target.typeName) {
    throw new Error(`No type references found in ${aralName}`);
  }

  const program = createProgramFromConfig(TSCONFIG_PATH);
  const allFields = [...target.fieldNames, ...target.collectionNames];
  const sites = findAssignmentSites(program, target.typeName, allFields);
  const results: ExtractedSite[] = [];

  for (const site of sites) {
    const ctx = createContext(
      target.typeName,
      target.fieldNames,
      target.collectionNames,
      target.collectionItemFields,
      program.getTypeChecker(),
    );
    ctx.inputParamName = detectInputParam(site);

    const expr = extractAssignedExpr(site, ctx);
    const referencedFields = collectFieldNames(expr);

    const knownFields = new Set(
      Array.from(referencedFields).filter((f) =>
        target.fieldNames.includes(f) || target.collectionNames.includes(f)
      )
    );
    knownFields.add(site.fieldName);

    const result: ExtractedSite = {
      name: `${site.containerName}-${site.fieldName}`,
      inputType: target.typeName,
      inputFields: Array.from(knownFields),
      params: [
        ...Array.from(ctx.unconstrainedParams.keys()),
        ...Array.from(ctx.functionParams),
        ...collectQualifiedParamNames(expr),
      ],
      assigns: [{ fieldName: site.fieldName, value: expr }],
      filePath: site.filePath,
      line: site.line,
      unconstrainedCount: ctx.unconstrainedParams.size,
      unconstrainedLabels: Array.from(ctx.unconstrainedParams.values()).map((v) => v.label),
    };

    // Add typedParams if any were discovered
    if (ctx.typedParams.size > 0) {
      result.typedParams = Array.from(ctx.typedParams.entries()).map(
        ([name, type]) => ({ name, type })
      );
    }

    // Add optionalFields for any simple-name field referenced by an isPresent node.
    const optionalFields = Array.from(collectOptionalFields(expr));
    if (optionalFields.length > 0) {
      result.optionalFields = optionalFields;
    }

    results.push(result);
  }

  return results;
}

/**
 * Extract a single site by field name with optional filters.
 * Use `sourceFile` to disambiguate when multiple fixtures define the same function name.
 */
export function extractOne(
  aralName: string,
  fieldName: string,
  opts?: { container?: string; sourceFile?: string },
): ExtractedSite {
  const all = extractAll(aralName);
  const matches = all.filter((s) => {
    if (s.assigns[0].fieldName !== fieldName) return false;
    if (opts?.container && !s.name.startsWith(opts.container + "-")) return false;
    if (opts?.sourceFile && !s.filePath.endsWith(opts.sourceFile)) return false;
    return true;
  });

  if (matches.length === 0) {
    const available = all.map((s) => `${s.name} (${s.filePath.split("/").pop()})`).join(", ");
    throw new Error(
      `No site found for field="${fieldName}"${opts?.container ? ` container="${opts.container}"` : ""}` +
      `${opts?.sourceFile ? ` source="${opts.sourceFile}"` : ""}. Available: ${available || "(none)"}`,
    );
  }
  if (matches.length > 1) {
    const names = matches.map((s) => `${s.name} (${s.filePath.split("/").pop()})`).join(", ");
    throw new Error(
      `Multiple sites for field="${fieldName}": ${names}. Use sourceFile or container to disambiguate.`,
    );
  }
  return matches[0];
}

/** Get the value of the first (or Nth) field assignment. */
export function getAssign(result: AralFn, index = 0): Expr {
  return result.assigns[index].value;
}

// ─── Internals (copied from extract.ts to avoid coupling to CLI) ─────

function detectInputParam(site: AssignmentSite): string | null {
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

function collectQualifiedParamNames(expr: Expr): string[] {
  const names = new Set<string>();
  walk(expr);
  return Array.from(names);

  function walk(e: Expr) {
    if ("lit" in e) return;
    if ("field" in e) {
      if ("qualifier" in e.field) names.add(e.field.qualifier + "-" + e.field.name);
      return;
    }
    if ("arith" in e) { walk(e.arith.left); walk(e.arith.right); return; }
    if ("ite" in e) { walkBool(e.ite.cond); walk(e.ite.then); walk(e.ite.else); return; }
    if ("round" in e) { walk(e.round.expr); return; }
    if ("sum" in e) { walk(e.sum.body); return; }
  }

  function walkBool(b: BoolExpr) {
    if ("cmp" in b) { walk(b.cmp.left); walk(b.cmp.right); }
    else if ("logic" in b) { walkBool(b.logic.left); walkBool(b.logic.right); }
    else if ("not" in b) { walkBool(b.not); }
    else if ("isPresent" in b) {
      if ("qualifier" in b.isPresent) {
        const key = b.isPresent.qualifier + "-" + b.isPresent.name;
        names.add(key);
        names.add("has-" + key);
      }
    }
    else if ("each" in b) { walkBool(b.each.body); }
  }
}

function collectOptionalFields(expr: Expr): Set<string> {
  const names = new Set<string>();
  walk(expr);
  return names;

  function walk(e: Expr) {
    if ("lit" in e || "field" in e) return;
    if ("arith" in e) { walk(e.arith.left); walk(e.arith.right); return; }
    if ("ite" in e) { walkBool(e.ite.cond); walk(e.ite.then); walk(e.ite.else); return; }
    if ("round" in e) { walk(e.round.expr); return; }
    if ("sum" in e) { walk(e.sum.body); return; }
  }

  function walkBool(b: BoolExpr) {
    if ("cmp" in b) { walk(b.cmp.left); walk(b.cmp.right); }
    else if ("logic" in b) { walkBool(b.logic.left); walkBool(b.logic.right); }
    else if ("not" in b) { walkBool(b.not); }
    else if ("isPresent" in b) {
      if ("name" in b.isPresent && !("qualifier" in b.isPresent)) {
        names.add(b.isPresent.name);
      }
    }
    else if ("each" in b) { walkBool(b.each.body); }
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
    if ("arith" in e) { walkExpr(e.arith.left); walkExpr(e.arith.right); return; }
    if ("ite" in e) { walkBoolExpr(e.ite.cond); walkExpr(e.ite.then); walkExpr(e.ite.else); return; }
    if ("round" in e) { walkExpr(e.round.expr); return; }
    if ("sum" in e) { names.add(e.sum.collection); walkExpr(e.sum.body); return; }
  }

  function walkBoolExpr(b: BoolExpr) {
    if ("cmp" in b) { walkExpr(b.cmp.left); walkExpr(b.cmp.right); }
    else if ("logic" in b) { walkBoolExpr(b.logic.left); walkBoolExpr(b.logic.right); }
    else if ("not" in b) { walkBoolExpr(b.not); }
    else if ("isPresent" in b) { if ("name" in b.isPresent) names.add(b.isPresent.name); }
    else if ("each" in b) {
      names.add(b.each.collection);
      walkBoolExpr(b.each.body);
    }
  }
}
