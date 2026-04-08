/**
 * Expression extractor — maps TypeScript AST expression nodes to Aral-fn IR.
 *
 * The extractor never fails. Sub-expressions it can't resolve become
 * unconstrained parameters (free variables for verification).
 */

import ts from "typescript";
import type {
  Expr,
  BoolExpr,
  ArithOp,
  CompOp,
  RoundingMode,
} from "./types.js";

export interface ExtractionContext {
  /** The root type name (e.g., "Payment") */
  typeName: string;
  /** Known field names on the type */
  fieldNames: Set<string>;
  /** Known collection names on the type */
  collectionNames: Set<string>;
  /** Per-collection item field names */
  collectionItemFields: Map<string, string[]>;
  /** The TypeScript type checker */
  checker: ts.TypeChecker;
  /** The name of the input parameter (e.g., "payment" in f(payment: Payment)) */
  inputParamName: string | null;
  /** Accumulated unconstrained parameters */
  unconstrainedParams: Map<string, { node: ts.Node; reason: string }>;
  /** Counter for generating unique unconstrained param names */
  unkCounter: number;
}

export function createContext(
  typeName: string,
  fieldNames: string[],
  collectionNames: string[],
  collectionItemFields: Map<string, string[]>,
  checker: ts.TypeChecker,
): ExtractionContext {
  return {
    typeName,
    fieldNames: new Set(fieldNames),
    collectionNames: new Set(collectionNames),
    collectionItemFields,
    checker,
    inputParamName: null,
    unconstrainedParams: new Map(),
    unkCounter: 0,
  };
}

/**
 * Extract an Aral-fn Expr from a TS expression node.
 * Always succeeds — unknown patterns become unconstrained parameters.
 */
export function extractExpr(node: ts.Expression, ctx: ExtractionContext): Expr {
  // Unwrap parenthesized expressions
  if (ts.isParenthesizedExpression(node)) {
    return extractExpr(node.expression, ctx);
  }

  // Numeric literal: 42, -5, 3.14
  if (ts.isNumericLiteral(node)) {
    return { lit: Number(node.text) };
  }

  // Prefix unary: -expr (negative numbers not caught by NumericLiteral)
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return { lit: -Number(node.operand.text) };
  }

  // Property access: input.field
  if (ts.isPropertyAccessExpression(node)) {
    return extractPropertyAccess(node, ctx);
  }

  // Identifier: bare field name (e.g., in collection body context) or param
  if (ts.isIdentifier(node)) {
    return extractIdentifier(node, ctx);
  }

  // Binary expression: arithmetic, comparison (handled when used in ite condition)
  if (ts.isBinaryExpression(node)) {
    return extractBinaryExpr(node, ctx);
  }

  // Conditional (ternary): cond ? then : else
  if (ts.isConditionalExpression(node)) {
    return {
      ite: {
        cond: extractBoolExpr(node.condition, ctx),
        then: extractExpr(node.whenTrue, ctx),
        else: extractExpr(node.whenFalse, ctx),
      },
    };
  }

  // Call expression: Math.floor/ceil/round, .reduce()
  if (ts.isCallExpression(node)) {
    return extractCallExpr(node, ctx);
  }

  // Null coalescing: x ?? default
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
  ) {
    return extractNullCoalescing(node, ctx);
  }

  // Fallback: unconstrained parameter
  return makeUnconstrained(node, ctx, "unsupported expression");
}

/**
 * Extract a BoolExpr from a TS expression node.
 */
export function extractBoolExpr(
  node: ts.Expression,
  ctx: ExtractionContext,
): BoolExpr {
  // Unwrap parens
  if (ts.isParenthesizedExpression(node)) {
    return extractBoolExpr(node.expression, ctx);
  }

  // Prefix !
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.ExclamationToken
  ) {
    return { not: extractBoolExpr(node.operand, ctx) };
  }

  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;

    // Logical: && ||
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
      return {
        logic: {
          op: "and",
          left: extractBoolExpr(node.left, ctx),
          right: extractBoolExpr(node.right, ctx),
        },
      };
    }
    if (op === ts.SyntaxKind.BarBarToken) {
      return {
        logic: {
          op: "or",
          left: extractBoolExpr(node.left, ctx),
          right: extractBoolExpr(node.right, ctx),
        },
      };
    }

    // Comparison operators
    const compOp = mapComparisonOp(op);
    if (compOp) {
      return {
        cmp: {
          op: compOp,
          left: extractExpr(node.left, ctx),
          right: extractExpr(node.right, ctx),
        },
      };
    }
  }

  // Fallback: wrap an unconstrained param in a trivial comparison
  const param = makeUnconstrained(node, ctx, "unsupported boolean expression");
  return { cmp: { op: "gt", left: param, right: { lit: 0 } } };
}

// ─── Helpers ──────────────────────────────────────────────────────

function extractPropertyAccess(
  node: ts.PropertyAccessExpression,
  ctx: ExtractionContext,
): Expr {
  const fieldName = node.name.text;

  // Reject standalone optional chaining (obj?.field without || 0 or ?? default).
  // The result could be undefined, which is not a valid numeric expression.
  // When wrapped in || 0 or ??, the BarBarToken/QuestionQuestionToken handler
  // calls extractNullCoalescing which adds the isPresent guard.
  if (node.questionDotToken) {
    return makeUnconstrained(node, ctx,
      "optional chaining (?.) without null fallback — wrap in `expr ?? 0` or `expr || 0`");
  }

  // input.field → { field: { name: fieldName } }
  if (ts.isIdentifier(node.expression)) {
    const objName = node.expression.text;
    // If the object is the input parameter, this is a field reference
    if (objName === ctx.inputParamName || ctx.fieldNames.has(fieldName)) {
      return { field: { name: fieldName } };
    }
  }

  // Nested access: could be a qualified field ref (param.field)
  if (ts.isIdentifier(node.expression)) {
    const objName = node.expression.text;
    // Could be a typed parameter reference: typedParam.field
    // Emit as qualified field ref
    return { field: { qualifier: objName, name: fieldName } };
  }

  return makeUnconstrained(node, ctx, "complex property access");
}

function extractIdentifier(node: ts.Identifier, ctx: ExtractionContext): Expr {
  const name = node.text;

  // Known field on the type
  if (ctx.fieldNames.has(name)) {
    return { field: { name } };
  }

  // Could be a parameter or item field — treat as field ref
  // (The verifier will classify it as param if not in inputFields)
  return { field: { name } };
}

function extractBinaryExpr(
  node: ts.BinaryExpression,
  ctx: ExtractionContext,
): Expr {
  const op = node.operatorToken.kind;

  // Null coalescing: x ?? default
  if (op === ts.SyntaxKind.QuestionQuestionToken) {
    return extractNullCoalescing(node, ctx);
  }

  // Logical OR with falsy default: x || 0 → ite(isPresent(x), x, 0)
  // Common in real-world TS (e.g., Cal.com: `apps?.[id].price || 0`)
  if (op === ts.SyntaxKind.BarBarToken) {
    const right = node.right;
    if (ts.isNumericLiteral(right) && Number(right.text) === 0) {
      return extractNullCoalescing(node, ctx);
    }
    // Non-zero || default — fall through to unconstrained
  }

  // Arithmetic
  const arithOp = mapArithOp(op);
  if (arithOp) {
    return {
      arith: {
        op: arithOp,
        left: extractExpr(node.left, ctx),
        right: extractExpr(node.right, ctx),
      },
    };
  }

  // If it's a comparison, it shouldn't be here (should be in BoolExpr context)
  // but wrap it as an unconstrained parameter
  return makeUnconstrained(node, ctx, "non-arithmetic binary expression");
}

function extractCallExpr(
  node: ts.CallExpression,
  ctx: ExtractionContext,
): Expr {
  // Math.floor / Math.ceil / Math.round
  if (ts.isPropertyAccessExpression(node.expression)) {
    const method = node.expression.name.text;
    const obj = node.expression.expression;

    if (ts.isIdentifier(obj) && obj.text === "Math" && node.arguments.length === 1) {
      const roundMode = mapRoundingMode(method);
      if (roundMode) {
        return {
          round: {
            expr: extractExpr(node.arguments[0], ctx),
            mode: roundMode,
          },
        };
      }
    }

    // .reduce((acc, item) => acc + item.field, 0) → sum
    if (method === "reduce" && node.arguments.length === 2) {
      return extractReduceToSum(node, ctx);
    }
  }

  return makeUnconstrained(node, ctx, "function call");
}

function extractReduceToSum(
  node: ts.CallExpression,
  ctx: ExtractionContext,
): Expr {
  const callee = node.expression as ts.PropertyAccessExpression;
  const callback = node.arguments[0];
  const initialValue = node.arguments[1];

  // Verify initial value is 0
  if (!ts.isNumericLiteral(initialValue) || Number(initialValue.text) !== 0) {
    return makeUnconstrained(node, ctx, "reduce with non-zero initial value");
  }

  // The collection is the object .reduce() is called on
  let collectionName: string | null = null;
  if (ts.isPropertyAccessExpression(callee.expression)) {
    collectionName = callee.expression.name.text;
  } else if (ts.isIdentifier(callee.expression)) {
    collectionName = callee.expression.text;
  }

  if (!collectionName) {
    return makeUnconstrained(node, ctx, "reduce on complex expression");
  }

  // Parse callback: (acc, item) => acc + item.field
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) {
    return makeUnconstrained(node, ctx, "reduce with non-arrow callback");
  }

  const params = callback.parameters;
  if (params.length !== 2) {
    return makeUnconstrained(node, ctx, "reduce callback needs 2 params");
  }

  const accName = ts.isIdentifier(params[0].name) ? params[0].name.text : null;
  const itemName = ts.isIdentifier(params[1].name) ? params[1].name.text : null;

  if (!accName || !itemName) {
    return makeUnconstrained(node, ctx, "reduce callback destructured params");
  }

  // Get the body expression
  let bodyExpr: ts.Expression | undefined;
  if (ts.isBlock(callback.body)) {
    // { return expr; }
    const stmts = callback.body.statements;
    if (stmts.length === 1 && ts.isReturnStatement(stmts[0]) && stmts[0].expression) {
      bodyExpr = stmts[0].expression;
    }
  } else {
    // Arrow shorthand: => expr
    bodyExpr = callback.body;
  }

  if (!bodyExpr) {
    return makeUnconstrained(node, ctx, "reduce callback complex body");
  }

  // Expect: acc + <item-expr>
  if (
    ts.isBinaryExpression(bodyExpr) &&
    bodyExpr.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = bodyExpr.left;
    // Left should be the accumulator
    if (ts.isIdentifier(left) && left.text === accName) {
      // Right is the per-item expression — extract in item scope
      const itemExpr = extractItemExpr(bodyExpr.right, itemName, ctx);
      return { sum: { collection: collectionName, body: itemExpr } };
    }
  }

  return makeUnconstrained(node, ctx, "reduce callback non-sum pattern");
}

/**
 * Extract an expression in item scope (inside a collection body).
 * Item fields are accessed as item.field → { field: { name: "field" } }
 */
function extractItemExpr(
  node: ts.Expression,
  itemParamName: string,
  ctx: ExtractionContext,
): Expr {
  if (ts.isParenthesizedExpression(node)) {
    return extractItemExpr(node.expression, itemParamName, ctx);
  }

  if (ts.isNumericLiteral(node)) {
    return { lit: Number(node.text) };
  }

  // item.field → bare field name
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
    if (node.expression.text === itemParamName) {
      return { field: { name: node.name.text } };
    }
  }

  // Bare identifier in item context
  if (ts.isIdentifier(node)) {
    return { field: { name: node.text } };
  }

  // Arithmetic in item body
  if (ts.isBinaryExpression(node)) {
    const arithOp = mapArithOp(node.operatorToken.kind);
    if (arithOp) {
      return {
        arith: {
          op: arithOp,
          left: extractItemExpr(node.left, itemParamName, ctx),
          right: extractItemExpr(node.right, itemParamName, ctx),
        },
      };
    }
  }

  return makeUnconstrained(node, ctx, "unsupported item expression");
}

function extractNullCoalescing(
  node: ts.BinaryExpression,
  ctx: ExtractionContext,
): Expr {
  const leftExpr = extractExpr(node.left, ctx);
  const rightExpr = extractExpr(node.right, ctx);

  // x ?? default → ite(isPresent(x), x, default)
  if ("field" in leftExpr) {
    return {
      ite: {
        cond: { isPresent: leftExpr.field },
        then: leftExpr,
        else: rightExpr,
      },
    };
  }

  // Complex left side — just treat as unconstrained
  return makeUnconstrained(node, ctx, "null coalescing on non-field");
}

function makeUnconstrained(
  node: ts.Node,
  ctx: ExtractionContext,
  reason: string,
): Expr {
  const name = `__unk_${ctx.unkCounter++}`;
  ctx.unconstrainedParams.set(name, { node, reason });
  return { field: { name } };
}

// ─── Operator maps ───────────────────────────────────────────────

function mapArithOp(kind: ts.SyntaxKind): ArithOp | null {
  switch (kind) {
    case ts.SyntaxKind.PlusToken: return "add";
    case ts.SyntaxKind.MinusToken: return "sub";
    case ts.SyntaxKind.AsteriskToken: return "mul";
    case ts.SyntaxKind.SlashToken: return "div";
    default: return null;
  }
}

function mapComparisonOp(kind: ts.SyntaxKind): CompOp | null {
  switch (kind) {
    case ts.SyntaxKind.GreaterThanToken: return "gt";
    case ts.SyntaxKind.LessThanToken: return "lt";
    case ts.SyntaxKind.GreaterThanEqualsToken: return "gte";
    case ts.SyntaxKind.LessThanEqualsToken: return "lte";
    case ts.SyntaxKind.EqualsEqualsToken: return "eq";
    case ts.SyntaxKind.EqualsEqualsEqualsToken: return "eq";
    case ts.SyntaxKind.ExclamationEqualsToken: return "neq";
    case ts.SyntaxKind.ExclamationEqualsEqualsToken: return "neq";
    default: return null;
  }
}

function mapRoundingMode(method: string): RoundingMode | null {
  switch (method) {
    case "floor": return "floor";
    case "ceil": return "ceil";
    case "round": return "half_up";
    default: return null;
  }
}
