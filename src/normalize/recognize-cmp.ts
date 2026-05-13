import ts from "typescript";
import type { CompOp, Predicate } from "../canonical-ast.js";
import type { DiagnosticLabel } from "../diagnostics/labels.js";
import type { NormalizeContext } from "./index.js";
import { normalize } from "./index.js";

export type RecognizePredicateResult =
  | { kind: "miss" }
  | { kind: "accepted"; predicate: Predicate }
  | { kind: "rejected"; label: DiagnosticLabel; reason: string };

type TokenClass =
  | { kind: "cmp"; op: CompOp; ordering: boolean }
  | { kind: "instanceof" }
  | { kind: "in" }
  | { kind: "miss" };

export function recognizeCmp(
  node: ts.Expression,
  ctx: NormalizeContext,
): RecognizePredicateResult {
  if (node.kind !== ts.SyntaxKind.BinaryExpression) return { kind: "miss" };
  const bin = node as ts.BinaryExpression;

  const cls = classifyOperator(bin.operatorToken.kind);
  if (cls.kind === "miss") return { kind: "miss" };
  if (cls.kind === "instanceof") {
    return {
      kind: "rejected",
      label: "instanceof-operator",
      reason: "the `instanceof` operator is not in the admitted subset.",
    };
  }
  if (cls.kind === "in") {
    return {
      kind: "rejected",
      label: "in-operator",
      reason: "the `in` operator is not in the admitted subset.",
    };
  }

  const leftKind = primitiveKind(ctx.checker.getTypeAtLocation(bin.left));
  const rightKind = primitiveKind(ctx.checker.getTypeAtLocation(bin.right));

  if (leftKind === "other" || rightKind === "other") {
    return {
      kind: "rejected",
      label: "cmp-non-numeric",
      reason: "comparison operands must be a primitive number.",
    };
  }
  if (leftKind !== rightKind) {
    return {
      kind: "rejected",
      label: "cmp-mixed-types",
      reason: `comparison operands have different primitive types (\`${leftKind}\` vs \`${rightKind}\`).`,
    };
  }
  if (leftKind !== "number") {
    return {
      kind: "rejected",
      label: "cmp-non-numeric",
      reason: cls.ordering
        ? `ordering comparisons require numeric operands; got \`${leftKind}\`.`
        : `comparison operands must be a primitive number; got \`${leftKind}\`.`,
    };
  }

  const left = normalize(bin.left, ctx);
  if (left.kind === "rejected") return left;
  const right = normalize(bin.right, ctx);
  if (right.kind === "rejected") return right;

  return {
    kind: "accepted",
    predicate: {
      kind: "Cmp",
      op: cls.op,
      left: left.cae,
      right: right.cae,
    },
  };
}

function classifyOperator(kind: ts.SyntaxKind): TokenClass {
  switch (kind) {
    case ts.SyntaxKind.LessThanToken:
      return { kind: "cmp", op: "lt", ordering: true };
    case ts.SyntaxKind.LessThanEqualsToken:
      return { kind: "cmp", op: "lte", ordering: true };
    case ts.SyntaxKind.GreaterThanToken:
      return { kind: "cmp", op: "gt", ordering: true };
    case ts.SyntaxKind.GreaterThanEqualsToken:
      return { kind: "cmp", op: "gte", ordering: true };
    case ts.SyntaxKind.EqualsEqualsToken:
    case ts.SyntaxKind.EqualsEqualsEqualsToken:
      return { kind: "cmp", op: "eq", ordering: false };
    case ts.SyntaxKind.ExclamationEqualsToken:
    case ts.SyntaxKind.ExclamationEqualsEqualsToken:
      return { kind: "cmp", op: "neq", ordering: false };
    case ts.SyntaxKind.InstanceOfKeyword:
      return { kind: "instanceof" };
    case ts.SyntaxKind.InKeyword:
      return { kind: "in" };
    default:
      return { kind: "miss" };
  }
}

type PrimitiveKind = "number" | "string" | "boolean" | "other";

function primitiveKind(type: ts.Type): PrimitiveKind {
  if (type.flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral)) {
    return "number";
  }
  if (type.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral)) {
    return "string";
  }
  if (
    type.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)
  ) {
    return "boolean";
  }
  if (type.isUnion()) {
    const kinds = type.types.map(primitiveKind);
    const unique = new Set(kinds);
    if (unique.size === 1) return kinds[0]!;
  }
  return "other";
}
