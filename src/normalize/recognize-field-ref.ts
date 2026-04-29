import ts from "typescript";
import type { CAE } from "../canonical-ast.js";
import type { DiagnosticLabel } from "../diagnostics/labels.js";
import type { ResolvedTargetType } from "../types.js";
import { stripSugar } from "./strip-sugar.js";

export type RecognizeResult =
  | { kind: "miss" }
  | { kind: "accepted"; cae: CAE }
  | { kind: "rejected"; label: DiagnosticLabel; reason: string };

export interface FieldRefContext {
  checker: ts.TypeChecker;
  inputType: ResolvedTargetType;
}

export function recognizeFieldRef(
  node: ts.Expression,
  ctx: FieldRefContext,
): RecognizeResult {
  if (node.kind !== ts.SyntaxKind.PropertyAccessExpression) {
    return { kind: "miss" };
  }
  const access = node as ts.PropertyAccessExpression;
  const receiverExpr = stripSugar(access.expression);

  if (receiverExpr.kind !== ts.SyntaxKind.Identifier) {
    return {
      kind: "rejected",
      label: "chained-field-access",
      reason: "chained field references are not supported.",
    };
  }
  const receiver = receiverExpr as ts.Identifier;

  const symbol = ctx.checker.getSymbolAtLocation(receiver);
  if (!symbol || !symbol.valueDeclaration) return { kind: "miss" };
  if (symbol.valueDeclaration.kind !== ts.SyntaxKind.Parameter) {
    return { kind: "miss" };
  }

  const paramType = ctx.checker.getTypeAtLocation(symbol.valueDeclaration);
  if (!typeMatchesInput(paramType, ctx.inputType.name)) {
    return { kind: "miss" };
  }

  const fieldName = access.name.text;
  if (!(fieldName in ctx.inputType.fields)) {
    return {
      kind: "rejected",
      label: "unknown-field",
      reason: `${ctx.inputType.name} has no field '${fieldName}'.`,
    };
  }

  return {
    kind: "accepted",
    cae: { kind: "FieldRef", param: receiver.text, field: fieldName },
  };
}

function typeMatchesInput(type: ts.Type, inputName: string): boolean {
  const direct = type.getSymbol();
  if (direct && direct.getName() === inputName) return true;
  const alias = type.aliasSymbol;
  if (alias && alias.getName() === inputName) return true;
  return false;
}
