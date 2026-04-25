/**
 * Unit-test harness for ts-to-ephemaral.
 *
 * `extractProbe(code, opts)` compiles a TypeScript snippet in memory, finds
 * the initializer of a `const __probe = <expr>;` declaration, and runs the
 * public expression-level API against it. Tests assert on the resulting IR
 * and the context's diagnostic state.
 *
 * The snippet convention: put any supporting declarations (callees, types,
 * consts, fn params) above the probe, then close with `const __probe = <expr>;`.
 */

import ts from "typescript";
import {
  createContext,
  extractExpr,
  extractBoolExpr,
  extractAssignedExpr,
  type ExtractionContext,
} from "../../src/expr-extractor.js";
import type { Expr, BoolExpr } from "../../src/types.js";
import type { AssignmentSite } from "../../src/field-finder.js";

const VIRTUAL_ROOT = "/virtual";
const SNIPPET_PATH = `${VIRTUAL_ROOT}/snippet.ts`;

export interface CompileResult {
  program: ts.Program;
  sourceFile: ts.SourceFile;
  checker: ts.TypeChecker;
}

/**
 * Compile a TS snippet in memory. The snippet lives at a virtual path so no
 * disk I/O happens. Standard-library definitions (lib.es2020.d.ts etc.) are
 * still pulled from disk by the compiler — unavoidable, but fast.
 */
export function compileSnippet(code: string): CompileResult {
  const files = new Map<string, string>([[SNIPPET_PATH, code]]);

  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    moduleResolution: ts.ModuleResolutionKind.Node10,
  };

  const realHost = ts.createCompilerHost(compilerOptions, true);
  const host: ts.CompilerHost = {
    ...realHost,
    getSourceFile: (fileName, languageVersion, onError, shouldCreate) => {
      if (files.has(fileName)) {
        return ts.createSourceFile(fileName, files.get(fileName)!, languageVersion, true);
      }
      return realHost.getSourceFile(fileName, languageVersion, onError, shouldCreate);
    },
    fileExists: (fileName) => files.has(fileName) || realHost.fileExists(fileName),
    readFile: (fileName) => files.get(fileName) ?? realHost.readFile(fileName),
    writeFile: () => {},
    getCurrentDirectory: () => VIRTUAL_ROOT,
  };

  const program = ts.createProgram([SNIPPET_PATH], compilerOptions, host);
  const sourceFile = program.getSourceFile(SNIPPET_PATH);
  if (!sourceFile) {
    throw new Error("compileSnippet: virtual source file not found in program");
  }
  return { program, sourceFile, checker: program.getTypeChecker() };
}

/** Find the first node in `sf` matching the predicate. */
export function findNode<T extends ts.Node>(
  sf: ts.SourceFile,
  predicate: (node: ts.Node) => node is T,
): T {
  let match: T | null = null;
  function walk(n: ts.Node) {
    if (match) return;
    if (predicate(n)) {
      match = n;
      return;
    }
    ts.forEachChild(n, walk);
  }
  walk(sf);
  if (!match) throw new Error("findNode: no matching node found");
  return match;
}

/** Find the initializer of the first `const __probe = <expr>;` declaration. */
export function findProbeInitializer(sf: ts.SourceFile): ts.Expression {
  const decl = findNode(sf, (n): n is ts.VariableDeclaration =>
    ts.isVariableDeclaration(n) &&
    ts.isIdentifier(n.name) &&
    n.name.text === "__probe"
  );
  if (!decl.initializer) {
    throw new Error("findProbeInitializer: __probe has no initializer");
  }
  return decl.initializer;
}

export interface ProbeOpts {
  typeName?: string;
  fieldNames?: string[];
  collectionNames?: string[];
  collectionItemFields?: Map<string, string[]>;
  inputParamName?: string | null;
}

export interface ProbeResult {
  ir: Expr;
  ctx: ExtractionContext;
  labels: Array<string | undefined>;
  reasons: string[];
}

export interface BoolProbeResult {
  ir: BoolExpr;
  ctx: ExtractionContext;
  labels: Array<string | undefined>;
  reasons: string[];
}

function buildContext(checker: ts.TypeChecker, opts: ProbeOpts): ExtractionContext {
  const ctx = createContext(
    opts.typeName ?? "Order",
    opts.fieldNames ?? [],
    opts.collectionNames ?? [],
    opts.collectionItemFields ?? new Map(),
    checker,
  );
  ctx.inputParamName = opts.inputParamName ?? null;
  return ctx;
}

function collectDiagnostics(ctx: ExtractionContext) {
  const entries = Array.from(ctx.unconstrainedParams.values());
  return {
    labels: entries.map((e) => e.label),
    reasons: entries.map((e) => e.reason),
  };
}

/**
 * Extract the initializer of `const __probe = <expr>;` as an `Expr`.
 */
export function extractProbe(code: string, opts: ProbeOpts = {}): ProbeResult {
  const { sourceFile, checker } = compileSnippet(code);
  const init = findProbeInitializer(sourceFile);
  const ctx = buildContext(checker, opts);
  const ir = extractExpr(init, ctx);
  return { ir, ctx, ...collectDiagnostics(ctx) };
}

/**
 * Extract the initializer of `const __probe = <expr>;` as a `BoolExpr`.
 */
export function extractBoolProbe(code: string, opts: ProbeOpts = {}): BoolProbeResult {
  const { sourceFile, checker } = compileSnippet(code);
  const init = findProbeInitializer(sourceFile);
  const ctx = buildContext(checker, opts);
  const ir = extractBoolExpr(init, ctx);
  return { ir, ctx, ...collectDiagnostics(ctx) };
}

/**
 * Extract the first object-literal property assignment named `<fieldName>`
 * inside the snippet via the full `extractAssignedExpr` pipeline (applies
 * the top-level return-guard layer).
 */
export function extractAssignedProbe(
  code: string,
  fieldName: string,
  opts: ProbeOpts = {},
): ProbeResult {
  const { sourceFile, checker } = compileSnippet(code);
  const prop = findNode(sourceFile, (n): n is ts.PropertyAssignment =>
    ts.isPropertyAssignment(n) &&
    ts.isIdentifier(n.name) &&
    n.name.text === fieldName
  );
  const containerFn = (function findEnclosingFn(n: ts.Node): ts.FunctionLikeDeclaration | null {
    let c: ts.Node | undefined = n.parent;
    while (c) {
      if (
        ts.isFunctionDeclaration(c) ||
        ts.isArrowFunction(c) ||
        ts.isFunctionExpression(c) ||
        ts.isMethodDeclaration(c)
      ) {
        return c as ts.FunctionLikeDeclaration;
      }
      c = c.parent;
    }
    return null;
  })(prop);

  const site: AssignmentSite = {
    fieldName,
    expressionNode: prop.initializer,
    filePath: SNIPPET_PATH,
    line: sourceFile.getLineAndCharacterOfPosition(prop.getStart()).line + 1,
    containerName:
      (containerFn && "name" in containerFn && containerFn.name && ts.isIdentifier(containerFn.name))
        ? containerFn.name.text
        : "anonymous",
    sourceFile,
  };

  const ctx = buildContext(checker, opts);
  if (opts.inputParamName === undefined && containerFn?.parameters.length) {
    const p0 = containerFn.parameters[0];
    if (ts.isIdentifier(p0.name)) ctx.inputParamName = p0.name.text;
  }
  const ir = extractAssignedExpr(site, ctx);
  return { ir, ctx, ...collectDiagnostics(ctx) };
}
