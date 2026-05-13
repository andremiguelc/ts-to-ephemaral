import ts from "typescript";
import type { CAE, Predicate } from "../canonical-ast.js";
import type { NormalizeContext } from "./index.js";
import { recognizePredicate } from "./recognize-predicate.js";

export type RecognizeAssertResult =
  | { kind: "miss" }
  | { kind: "accepted"; predicate: Predicate; argName: string }
  | { kind: "malformed"; reason: string };

export function recognizeAssert(
  call: ts.CallExpression,
  ctx: NormalizeContext,
): RecognizeAssertResult {
  if (call.expression.kind !== ts.SyntaxKind.Identifier) {
    return { kind: "miss" };
  }
  const callee = call.expression as ts.Identifier;
  if (!callee.text.endsWith("Assert")) return { kind: "miss" };

  const sym = ctx.checker.getSymbolAtLocation(callee);
  if (!sym || !sym.valueDeclaration) return { kind: "miss" };
  const decl = sym.valueDeclaration;
  if (!ts.isFunctionDeclaration(decl)) return { kind: "miss" };

  if (decl.parameters.length !== 1) {
    return {
      kind: "malformed",
      reason: `'${callee.text}' must take exactly one parameter.`,
    };
  }
  const assertParamName = decl.parameters[0]!.name.getText();

  if (!decl.body || decl.body.statements.length !== 1) {
    return {
      kind: "malformed",
      reason: `'${callee.text}' body must be a single \`if\` statement.`,
    };
  }
  const stmt = decl.body.statements[0]!;
  if (!ts.isIfStatement(stmt)) {
    return {
      kind: "malformed",
      reason: `'${callee.text}' body must be a single \`if\` statement.`,
    };
  }
  if (stmt.elseStatement) {
    return {
      kind: "malformed",
      reason: `'${callee.text}' \`if\` must not have an \`else\` branch.`,
    };
  }

  if (!ifBodyEndsExecution(stmt.thenStatement, ctx.checker)) {
    return {
      kind: "malformed",
      reason: `'${callee.text}' \`if\`-body must \`throw\` or call a \`never\`-typed helper; a plain \`return\` lets the caller continue with bad data.`,
    };
  }

  const predResult = recognizePredicate(stmt.expression, ctx);
  if (predResult.kind === "rejected") {
    return {
      kind: "malformed",
      reason: `'${callee.text}' predicate is not in the admitted language: ${predResult.reason}`,
    };
  }
  if (predResult.kind === "miss") {
    return {
      kind: "malformed",
      reason: `'${callee.text}' predicate must be a single comparison (boolean composition ships next).`,
    };
  }

  if (call.arguments.length !== 1) {
    return {
      kind: "malformed",
      reason: `'${callee.text}' call must pass exactly one argument.`,
    };
  }
  const arg = call.arguments[0]!;
  if (!ts.isIdentifier(arg)) {
    return {
      kind: "malformed",
      reason: `'${callee.text}' argument must be a parameter name (no transformations); bind to a \`const\` first if needed.`,
    };
  }

  const substituted = renameParam(predResult.predicate, assertParamName, arg.text);
  return { kind: "accepted", predicate: substituted, argName: arg.text };
}

function ifBodyEndsExecution(
  body: ts.Statement,
  checker: ts.TypeChecker,
): boolean {
  if (ts.isThrowStatement(body)) return true;
  if (ts.isExpressionStatement(body) && ts.isCallExpression(body.expression)) {
    const t = checker.getTypeAtLocation(body.expression);
    if (t.flags & ts.TypeFlags.Never) return true;
  }
  if (ts.isBlock(body) && body.statements.length === 1) {
    return ifBodyEndsExecution(body.statements[0]!, checker);
  }
  return false;
}

function renameParam(pred: Predicate, oldName: string, newName: string): Predicate {
  return {
    kind: "Cmp",
    op: pred.op,
    left: renameInCAE(pred.left, oldName, newName),
    right: renameInCAE(pred.right, oldName, newName),
  };
}

function renameInCAE(cae: CAE, oldName: string, newName: string): CAE {
  switch (cae.kind) {
    case "Lit":
      return cae;
    case "FieldRef":
      return cae;
    case "ParamRef":
      return cae.name === oldName ? { kind: "ParamRef", name: newName } : cae;
    case "Arith":
      return {
        kind: "Arith",
        op: cae.op,
        left: renameInCAE(cae.left, oldName, newName),
        right: renameInCAE(cae.right, oldName, newName),
      };
  }
}
