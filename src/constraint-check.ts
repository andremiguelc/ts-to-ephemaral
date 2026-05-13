import ts from "typescript";
import type { CAE, Predicate } from "./canonical-ast.js";
import { suggestionFor } from "./diagnostics/catalog.js";
import type { NormalizeContext } from "./normalize/index.js";
import { recognizeAssert } from "./normalize/recognize-assert.js";
import type { TargetResult } from "./subset-gate.js";
import type { Diagnostic, DiscoveredSite } from "./types.js";

export interface ConstraintCheckResult {
  warnings: Diagnostic[];
  // Per-parameter list of predicates the parser confirmed via Assert lookback.
  // Each entry is one accepted Assert call; multiple entries are conjunctive.
  paramAsserts: Map<string, Predicate[]>;
}

export function checkConstraints(
  site: DiscoveredSite,
  targets: TargetResult[],
  ctx: NormalizeContext,
): ConstraintCheckResult {
  const warnings: Diagnostic[] = [];
  const paramAsserts = new Map<string, Predicate[]>();
  // Track which params already had an accepted Assert recorded for THIS site,
  // so a single Assert backing multiple targets doesn't duplicate predicates.
  const recorded = new Set<string>();

  for (const target of targets) {
    if (target.kind !== "accepted") continue;

    const usedParams = collectParamNames(target.cae);
    if (usedParams.size === 0) continue;

    const expr = site.targets.find((t) => t.fieldName === target.fieldName)
      ?.expression;
    if (!expr) continue;

    const stmt = enclosingStatement(expr);
    const block = stmt?.parent;
    if (!stmt || !block || !ts.isBlock(block)) {
      // Couldn't find a containing block — emit missing-assert per param without lookback.
      for (const p of usedParams) {
        warnings.push(
          buildDiagnostic(site, target.fieldName, p, "missing-assert"),
        );
      }
      continue;
    }

    for (const p of usedParams) {

      const paramSymbol = lookupParamSymbol(p, site.signature, ctx.checker, expr);
      if (!paramSymbol) {
        // Param name didn't resolve back to the function's signature. Skip — this
        // shouldn't happen for accepted CAE, but be defensive.
        continue;
      }

      const lookback = findLastStatementMentioning(stmt, block, paramSymbol, ctx.checker);

      if (lookback && isAssertCallStatement(lookback)) {
        const callExpr = (lookback as ts.ExpressionStatement).expression as ts.CallExpression;
        const recognized = recognizeAssert(callExpr, ctx);
        if (recognized.kind === "accepted" && recognized.argName === p) {
          // Constrained — record the predicate so ir-emit can ship it to the verifier.
          if (!recorded.has(p)) {
            const list = paramAsserts.get(p) ?? [];
            list.push(recognized.predicate);
            paramAsserts.set(p, list);
            recorded.add(p);
          }
          continue;
        }
        if (recognized.kind === "malformed") {
          warnings.push(
            buildDiagnosticAt(
              site,
              target.fieldName,
              p,
              "malformed-assert",
              recognized.reason,
              lookback.getStart(),
            ),
          );
          // Fall through — P still unconstrained, but the user already has a diagnostic to act on.
          continue;
        }
        // Recognized as miss (e.g., callee doesn't end in Assert). Treat as a non-Assert mention.
      }

      // Look for an Assert anywhere else in the function body that targets P.
      const elsewhere = scanForAssertOnParam(block, p, paramSymbol, ctx);
      if (elsewhere) {
        warnings.push(
          buildDiagnostic(site, target.fieldName, p, "misplaced-assert"),
        );
      } else {
        warnings.push(
          buildDiagnostic(site, target.fieldName, p, "missing-assert"),
        );
      }
    }
  }

  return { warnings, paramAsserts };
}

function collectParamNames(cae: CAE): Set<string> {
  const out = new Set<string>();
  walk(cae);
  return out;

  function walk(node: CAE): void {
    switch (node.kind) {
      case "ParamRef":
        out.add(node.name);
        return;
      case "Arith":
        walk(node.left);
        walk(node.right);
        return;
      case "Lit":
      case "FieldRef":
        return;
    }
  }
}

function enclosingStatement(node: ts.Node): ts.Statement | undefined {
  let current: ts.Node | undefined = node;
  while (current) {
    if (
      ts.isReturnStatement(current) ||
      ts.isExpressionStatement(current) ||
      ts.isVariableStatement(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}

function lookupParamSymbol(
  name: string,
  signature: { parameters: Array<{ name: string }> },
  checker: ts.TypeChecker,
  scopeNode: ts.Node,
): ts.Symbol | undefined {
  // Walk up to the function declaration, then look up the parameter by name.
  let current: ts.Node | undefined = scopeNode;
  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current)
    ) {
      for (const param of current.parameters) {
        if (ts.isIdentifier(param.name) && param.name.text === name) {
          return checker.getSymbolAtLocation(param.name);
        }
      }
      return undefined;
    }
    current = current.parent;
  }
  return undefined;
}

function findLastStatementMentioning(
  before: ts.Statement,
  block: ts.Block,
  paramSymbol: ts.Symbol,
  checker: ts.TypeChecker,
): ts.Statement | undefined {
  const idx = block.statements.indexOf(before);
  if (idx <= 0) return undefined;
  for (let i = idx - 1; i >= 0; i--) {
    const stmt = block.statements[i]!;
    if (statementMentionsParam(stmt, paramSymbol, checker)) {
      return stmt;
    }
  }
  return undefined;
}

function statementMentionsParam(
  stmt: ts.Node,
  paramSymbol: ts.Symbol,
  checker: ts.TypeChecker,
): boolean {
  let found = false;
  function visit(node: ts.Node): void {
    if (found) return;
    if (ts.isIdentifier(node)) {
      const sym = checker.getSymbolAtLocation(node);
      if (sym === paramSymbol) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(stmt);
  return found;
}

function isAssertCallStatement(stmt: ts.Statement): boolean {
  if (!ts.isExpressionStatement(stmt)) return false;
  if (!ts.isCallExpression(stmt.expression)) return false;
  const callee = stmt.expression.expression;
  if (!ts.isIdentifier(callee)) return false;
  return callee.text.endsWith("Assert");
}

function scanForAssertOnParam(
  block: ts.Block,
  paramName: string,
  paramSymbol: ts.Symbol,
  ctx: NormalizeContext,
): boolean {
  let found = false;
  function visit(node: ts.Node): void {
    if (found) return;
    if (
      ts.isExpressionStatement(node) &&
      ts.isCallExpression(node.expression)
    ) {
      const call = node.expression;
      const callee = call.expression;
      if (
        ts.isIdentifier(callee) &&
        callee.text.endsWith("Assert") &&
        call.arguments.length === 1 &&
        ts.isIdentifier(call.arguments[0]!)
      ) {
        const argSym = ctx.checker.getSymbolAtLocation(call.arguments[0]!);
        if (argSym === paramSymbol) {
          found = true;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(block);
  return found;
}

function buildDiagnostic(
  site: DiscoveredSite,
  fieldName: string,
  paramName: string,
  label: "missing-assert" | "malformed-assert" | "misplaced-assert",
): Diagnostic {
  return buildDiagnosticAt(
    site,
    fieldName,
    paramName,
    label,
    null,
    null,
  );
}

function buildDiagnosticAt(
  site: DiscoveredSite,
  fieldName: string,
  paramName: string,
  label: "missing-assert" | "malformed-assert" | "misplaced-assert",
  extraReason: string | null,
  startPos: number | null,
): Diagnostic {
  const subject = `${site.targetType.name}.${fieldName}`;
  const baseReason = baseReasonFor(label, paramName);
  const reason = extraReason ? `${baseReason} ${extraReason}` : baseReason;
  const suggestion = suggestionFor(label, site.targetType.name);
  const line =
    startPos !== null
      ? site.sourceFile.getLineAndCharacterOfPosition(startPos).line + 1
      : site.line;
  return {
    label,
    message: `${subject} — ${reason}`,
    ...(suggestion ? { suggestion } : {}),
    filePath: site.filePath,
    line,
  };
}

function baseReasonFor(
  label: "missing-assert" | "malformed-assert" | "misplaced-assert",
  paramName: string,
): string {
  switch (label) {
    case "missing-assert":
      return `parameter '${paramName}' has no rule limiting its values.`;
    case "malformed-assert":
      return `the Assert function near parameter '${paramName}' doesn't match the recognized shape:`;
    case "misplaced-assert":
      return `parameter '${paramName}' is asserted elsewhere in this function, but used or reassigned again before this assignment.`;
  }
}
