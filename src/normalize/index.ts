import ts from "typescript";
import type { CAE } from "../canonical-ast.js";
import type { DiagnosticLabel } from "../diagnostics/labels.js";
import type { ResolvedSignature, ResolvedTargetType } from "../types.js";
import { stripSugar } from "./strip-sugar.js";
import { recognizeLiteral } from "./recognize-literal.js";
import { recognizeFieldRef } from "./recognize-field-ref.js";
import { recognizeParamRef } from "./recognize-param-ref.js";
import { recognizeInlineConst } from "./inline-consts.js";
import { recognizeArith } from "./recognize-arith.js";

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

  const paramRef = recognizeParamRef(stripped, ctx);
  if (paramRef.kind !== "miss") return paramRef;

  const inlineConst = recognizeInlineConst(stripped, ctx);
  if (inlineConst.kind !== "miss") return inlineConst;

  const arith = recognizeArith(stripped, ctx);
  if (arith.kind !== "miss") return arith;

  return {
    kind: "rejected",
    label: "unsupported-expression",
    reason: "this kind of expression is not yet supported.",
  };
}
