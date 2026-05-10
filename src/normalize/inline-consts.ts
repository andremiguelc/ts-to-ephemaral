import ts from "typescript";
import type { CAE } from "../canonical-ast.js";
import type { DiagnosticLabel } from "../diagnostics/labels.js";
import type { NormalizeContext } from "./index.js";
import { normalize } from "./index.js";

export type RecognizeResult =
  | { kind: "miss" }
  | { kind: "accepted"; cae: CAE }
  | { kind: "rejected"; label: DiagnosticLabel; reason: string };

export function recognizeInlineConst(
  node: ts.Expression,
  ctx: NormalizeContext,
): RecognizeResult {
  if (node.kind !== ts.SyntaxKind.Identifier) return { kind: "miss" };
  const ident = node as ts.Identifier;

  const symbol = ctx.checker.getSymbolAtLocation(ident);
  if (!symbol || !symbol.valueDeclaration) return { kind: "miss" };
  if (symbol.valueDeclaration.kind !== ts.SyntaxKind.VariableDeclaration) {
    return { kind: "miss" };
  }
  const declaration = symbol.valueDeclaration as ts.VariableDeclaration;

  const declList = declaration.parent;
  if (!ts.isVariableDeclarationList(declList)) return { kind: "miss" };

  if ((declList.flags & ts.NodeFlags.Const) === 0) {
    return {
      kind: "rejected",
      label: "reassignable-binding",
      reason: `'${ident.text}' is bound with \`let\` or \`var\`; only \`const\` bindings can be inlined.`,
    };
  }

  if (!declaration.initializer) return { kind: "miss" };

  return normalize(declaration.initializer, ctx);
}
