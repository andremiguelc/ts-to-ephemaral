import ts from "typescript";
import type { CAE } from "../canonical-ast.js";
import type { DiagnosticLabel } from "../diagnostics/labels.js";

export type RecognizeResult =
  | { kind: "miss" }
  | { kind: "accepted"; cae: CAE }
  | { kind: "rejected"; label: DiagnosticLabel; reason: string };

export interface ParamRefContext {
  checker: ts.TypeChecker;
}

export function recognizeParamRef(
  node: ts.Expression,
  ctx: ParamRefContext,
): RecognizeResult {
  if (node.kind !== ts.SyntaxKind.Identifier) return { kind: "miss" };
  const ident = node as ts.Identifier;

  const symbol = ctx.checker.getSymbolAtLocation(ident);
  if (!symbol || !symbol.valueDeclaration) return { kind: "miss" };
  if (symbol.valueDeclaration.kind !== ts.SyntaxKind.Parameter) {
    return { kind: "miss" };
  }

  const type = ctx.checker.getTypeOfSymbolAtLocation(symbol, ident);

  if (type.flags & ts.TypeFlags.Any) {
    return {
      kind: "rejected",
      label: "any-typed-parameter",
      reason: `parameter '${ident.text}' has no declared type.`,
    };
  }

  if (isNullable(type)) {
    return {
      kind: "rejected",
      label: "nullable-parameter",
      reason: `parameter '${ident.text}' may be null or undefined.`,
    };
  }

  if (!isPrimitiveNumber(type)) {
    return {
      kind: "rejected",
      label: "param-not-primitive",
      reason: `parameter '${ident.text}' is not a number.`,
    };
  }

  return {
    kind: "accepted",
    cae: { kind: "ParamRef", name: ident.text },
  };
}

function isNullable(type: ts.Type): boolean {
  if (!type.isUnion()) return false;
  return type.types.some(
    (t) => (t.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) !== 0,
  );
}

function isPrimitiveNumber(type: ts.Type): boolean {
  const NUMERIC = ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral;
  if (type.flags & NUMERIC) return true;
  return false;
}
