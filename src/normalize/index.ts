import ts from "typescript";
import type { CAE } from "../canonical-ast.js";
import type { DiagnosticLabel } from "../diagnostics/labels.js";
import type { ResolvedSignature, ResolvedTargetType } from "../types.js";
import { stripSugar } from "./strip-sugar.js";
import { recognizeLiteral } from "./recognize-literal.js";
import { recognizeFieldRef } from "./recognize-field-ref.js";

export interface NormalizeContext {
  checker: ts.TypeChecker;
  inputType: ResolvedTargetType;
  signature: ResolvedSignature;
}

export type NormalizeResult =
  | { kind: "accepted"; cae: CAE }
  | { kind: "rejected"; label: DiagnosticLabel; reason: string };

export function normalize(
  node: ts.Expression,
  ctx: NormalizeContext,
): NormalizeResult {
  const stripped = stripSugar(node);

  const literal = recognizeLiteral(stripped);
  if (literal.kind !== "miss") return literal;

  const fieldRef = recognizeFieldRef(stripped, ctx);
  if (fieldRef.kind !== "miss") return fieldRef;

  return {
    kind: "rejected",
    label: "unsupported-expression",
    reason: "this kind of expression is not yet supported.",
  };
}
