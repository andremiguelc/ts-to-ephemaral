import ts from "typescript";
import type { NormalizeContext } from "./index.js";
import { stripSugar } from "./strip-sugar.js";
import {
  recognizeCmp,
  type RecognizePredicateResult,
} from "./recognize-cmp.js";

export type { RecognizePredicateResult } from "./recognize-cmp.js";

export function recognizePredicate(
  node: ts.Expression,
  ctx: NormalizeContext,
): RecognizePredicateResult {
  const stripped = stripSugar(node);

  const cmp = recognizeCmp(stripped, ctx);
  if (cmp.kind !== "miss") return cmp;

  return { kind: "miss" };
}
