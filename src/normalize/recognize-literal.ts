import ts from "typescript";
import type { CAE } from "../canonical-ast.js";
import type { DiagnosticLabel } from "../diagnostics/labels.js";

export type RecognizeResult =
  | { kind: "miss" }
  | { kind: "accepted"; cae: CAE }
  | { kind: "rejected"; label: DiagnosticLabel; reason: string };

const LITERAL_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateExpression,
  ts.SyntaxKind.BigIntLiteral,
]);

export function recognizeLiteral(node: ts.Expression): RecognizeResult {
  if (!LITERAL_KINDS.has(node.kind)) return { kind: "miss" };

  if (node.kind !== ts.SyntaxKind.NumericLiteral) {
    return reject(reasonForNonNumeric(node.kind));
  }

  const text = (node as ts.NumericLiteral).text;
  const n = Number(text);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return reject("fractional numbers are not supported.");
  }

  return { kind: "accepted", cae: { kind: "Lit", value: n } };
}

function reasonForNonNumeric(kind: ts.SyntaxKind): string {
  switch (kind) {
    case ts.SyntaxKind.StringLiteral:
      return "string literals are not supported.";
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
    case ts.SyntaxKind.TemplateExpression:
      return "template literals are not supported.";
    case ts.SyntaxKind.BigIntLiteral:
      return "BigInt literals are not supported.";
    default:
      return "this literal kind is not supported.";
  }
}

function reject(reason: string): RecognizeResult {
  return { kind: "rejected", label: "unsupported-literal", reason };
}
