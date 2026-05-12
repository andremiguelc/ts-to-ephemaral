import ts from "typescript";
import type { ArithOp, CAE } from "../canonical-ast.js";
import type { DiagnosticLabel } from "../diagnostics/labels.js";
import type { NormalizeContext } from "./index.js";
import { normalize } from "./index.js";

export type RecognizeResult =
  | { kind: "miss" }
  | { kind: "accepted"; cae: CAE }
  | { kind: "rejected"; label: DiagnosticLabel; reason: string };

type TokenClass =
  | { kind: "arith"; op: ArithOp }
  | { kind: "unsupported"; token: string }
  | { kind: "miss" };

export function recognizeArith(
  node: ts.Expression,
  ctx: NormalizeContext,
): RecognizeResult {
  if (node.kind !== ts.SyntaxKind.BinaryExpression) return { kind: "miss" };
  const bin = node as ts.BinaryExpression;

  const cls = classifyOperator(bin.operatorToken.kind);
  if (cls.kind === "miss") return { kind: "miss" };
  if (cls.kind === "unsupported") {
    return {
      kind: "rejected",
      label: "unsupported-operator",
      reason: `the \`${cls.token}\` operator is not yet supported.`,
    };
  }

  if (hasStringComponent(ctx.checker.getTypeAtLocation(bin.left))) {
    return {
      kind: "rejected",
      label: "arith-on-string",
      reason: `the left operand is a string; arithmetic operators only admit numeric operands.`,
    };
  }
  if (hasStringComponent(ctx.checker.getTypeAtLocation(bin.right))) {
    return {
      kind: "rejected",
      label: "arith-on-string",
      reason: `the right operand is a string; arithmetic operators only admit numeric operands.`,
    };
  }

  const left = normalize(bin.left, ctx);
  if (left.kind === "rejected") return left;

  const right = normalize(bin.right, ctx);
  if (right.kind === "rejected") return right;

  return {
    kind: "accepted",
    cae: { kind: "Arith", op: cls.op, left: left.cae, right: right.cae },
  };
}

function classifyOperator(kind: ts.SyntaxKind): TokenClass {
  switch (kind) {
    case ts.SyntaxKind.PlusToken:
      return { kind: "arith", op: "add" };
    case ts.SyntaxKind.MinusToken:
      return { kind: "arith", op: "sub" };
    case ts.SyntaxKind.AsteriskToken:
      return { kind: "arith", op: "mul" };
    case ts.SyntaxKind.SlashToken:
      return { kind: "arith", op: "div" };
    case ts.SyntaxKind.PercentToken:
      return { kind: "unsupported", token: "%" };
    case ts.SyntaxKind.AsteriskAsteriskToken:
      return { kind: "unsupported", token: "**" };
    case ts.SyntaxKind.AmpersandToken:
      return { kind: "unsupported", token: "&" };
    case ts.SyntaxKind.BarToken:
      return { kind: "unsupported", token: "|" };
    case ts.SyntaxKind.CaretToken:
      return { kind: "unsupported", token: "^" };
    case ts.SyntaxKind.LessThanLessThanToken:
      return { kind: "unsupported", token: "<<" };
    case ts.SyntaxKind.GreaterThanGreaterThanToken:
      return { kind: "unsupported", token: ">>" };
    case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken:
      return { kind: "unsupported", token: ">>>" };
    default:
      return { kind: "miss" };
  }
}

function hasStringComponent(type: ts.Type): boolean {
  const STRING_FLAGS = ts.TypeFlags.String | ts.TypeFlags.StringLiteral;
  if (type.flags & STRING_FLAGS) return true;
  if (type.isUnion()) {
    return type.types.some((t) => (t.flags & STRING_FLAGS) !== 0);
  }
  return false;
}
