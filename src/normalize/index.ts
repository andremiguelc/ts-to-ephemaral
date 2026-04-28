import ts from "typescript";
import type { CAE } from "../canonical-ast.js";
import type { DiagnosticLabel } from "../diagnostics/labels.js";
import { stripSugar } from "./strip-sugar.js";
import { recognizeLiteral, type RecognizeResult } from "./recognize-literal.js";

export type NormalizeResult =
  | { kind: "accepted"; cae: CAE }
  | { kind: "rejected"; label: DiagnosticLabel; reason: string };

type Recognizer = (node: ts.Expression) => RecognizeResult;

const RECOGNIZERS: Recognizer[] = [recognizeLiteral];

export function normalize(node: ts.Expression): NormalizeResult {
  const stripped = stripSugar(node);

  for (const recognize of RECOGNIZERS) {
    const result = recognize(stripped);
    if (result.kind === "miss") continue;
    return result;
  }

  return {
    kind: "rejected",
    label: "unsupported-expression",
    reason: "this kind of expression is not yet supported.",
  };
}
