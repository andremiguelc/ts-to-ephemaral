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
import type { AssignmentSite } from "./field-finder.js";

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
  /** Accumulated typed parameters (non-input function params with resolvable types) */
  typedParams: Map<string, string>; // paramName → typeName
  /** Accumulated bare primitive function parameters used as free variables.
   *  These land in the output `params` list so the verifier declares them as
   *  SMT constants instead of rejecting them as unknown references. */
  functionParams: Set<string>;
  /** Symbols currently being traced (cycle detection) */
  _tracingSymbols: Set<ts.Symbol>;
  /** Override for self-references in reassignment RHS (maps to prior value) */
  _selfRefOverride: { symbol: ts.Symbol; expr: Expr } | null;
  /** Callee-param substitution: during call-chain inlining, maps a callee
   *  parameter's symbol to the caller's pre-extracted argument IR. Checked
   *  at the top of extractIdentifier before field/param resolution. */
  paramSubstitution: Map<ts.Symbol, Expr>;
  /** Callee symbols currently being inlined (cycle detection for calls).
   *  Distinct from _tracingSymbols which tracks local variable tracing. */
  _tracingCallSymbols: Set<ts.Symbol>;
  /** Current nesting depth of call-chain inlining. Phase 1 caps this at 1;
   *  later phases raise the cap and enforce it as a cost guard. */
  _callDepth: number;
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
    typedParams: new Map(),
    functionParams: new Set(),
    _tracingSymbols: new Set(),
    _selfRefOverride: null,
    paramSubstitution: new Map(),
    _tracingCallSymbols: new Set(),
    _callDepth: 0,
  };
}

/**
 * Extract an assignment-site value, applying enclosing return-guards as
 * nested `ite` wrappers. Pure parser work: uses existing `ite` IR only.
 *
 * Handles three guard shapes (bare `if (G) return X;`, single-stmt block,
 * and sequential stacks). Throw-guards are silently ignored — narrowing them
 * correctly needs a preconditions field in Aral-fn JSON, deferred.
 */
export function extractAssignedExpr(
  site: AssignmentSite,
  ctx: ExtractionContext,
): Expr {
  const body = extractExpr(site.expressionNode, ctx);
  const guards = collectReturnGuards(site.expressionNode, site.fieldName, ctx);
  if (guards === "bail") {
    return makeUnconstrained(
      site.expressionNode,
      ctx,
      "return-guard layer bailed (complex guard form)",
    );
  }
  return applyGuardsToExpr(body, guards);
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

  // Array.prototype.every → BoolExpr.each
  if (ts.isCallExpression(node)) {
    const each = tryExtractEvery(node, ctx);
    if (each) return each;
  }

  // Bare field ref on a nullable type used as a boolean → isPresent.
  // Covers `if (!obj.field)` and `if (field)` on optional fields.
  if (ts.isPropertyAccessExpression(node) || ts.isIdentifier(node)) {
    const type = ctx.checker.getTypeAtLocation(node);
    if (typeIsNullable(type, ctx.checker)) {
      const expr = extractExpr(node, ctx);
      if ("field" in expr) return { isPresent: expr.field };
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
  if (node.questionDotToken) {
    return makeUnconstrained(node, ctx,
      "optional chaining (?.) without null fallback — wrap in `expr ?? 0` or `expr || 0`");
  }

  // input.field → { field: { name: fieldName } }
  if (ts.isIdentifier(node.expression)) {
    const objName = node.expression.text;
    if (objName === ctx.inputParamName || ctx.fieldNames.has(fieldName)) {
      return { field: { name: fieldName } };
    }
  }

  // Check if the object is a local variable we can trace
  if (ts.isIdentifier(node.expression)) {
    const objName = node.expression.text;
    const symbol = ctx.checker.getSymbolAtLocation(node.expression);

    // Is this a function parameter or local variable with a resolvable type? → typed param
    if (symbol?.valueDeclaration && (
      ts.isParameter(symbol.valueDeclaration) ||
      ts.isVariableDeclaration(symbol.valueDeclaration)
    )) {
      const paramType = ctx.checker.getTypeAtLocation(symbol.valueDeclaration);
      const typeSymbol = paramType.getSymbol() ?? paramType.aliasSymbol;
      if (typeSymbol) {
        const resolvedTypeName = typeSymbol.getName();
        ctx.typedParams.set(objName, resolvedTypeName);
        return { field: { qualifier: objName, name: fieldName } };
      }
    }

    // Type couldn't be resolved — fall back to __ext_ naming
    return makeUnconstrained(node, ctx, "property access on variable with unresolvable type");
  }

  return makeUnconstrained(node, ctx, "complex property access");
}

function extractIdentifier(node: ts.Identifier, ctx: ExtractionContext): Expr {
  const name = node.text;
  const symbol = ctx.checker.getSymbolAtLocation(node);

  // Callee-param substitution: during call-chain inlining, a reference to a
  // callee parameter resolves to the caller's pre-extracted argument IR.
  // Checked before anything else so a callee param never falls through to
  // the caller's fieldNames (which would mis-route if the names coincide).
  if (symbol && ctx.paramSubstitution.has(symbol)) {
    return ctx.paramSubstitution.get(symbol)!;
  }

  // Known field on the type → direct field reference
  if (ctx.fieldNames.has(name)) {
    return { field: { name } };
  }

  // Try to resolve via symbol — trace local variables back to their initializers
  if (symbol) {
    const resolved = tryTraceLocal(symbol, node, ctx);
    if (resolved) return resolved;

    // Bare primitive function parameter (not the input param) → declare as a
    // free variable in ctx.functionParams so the verifier creates an SMT
    // constant for it. Only numeric primitives — other kinds stay as bare
    // field refs (status quo; the verifier will reject them as today).
    const decl = symbol.valueDeclaration;
    if (
      decl &&
      ts.isParameter(decl) &&
      name !== ctx.inputParamName
    ) {
      const paramType = ctx.checker.getTypeAtLocation(decl);
      if ((paramType.flags & ts.TypeFlags.NumberLike) !== 0) {
        ctx.functionParams.add(name);
        return { field: { name } };
      }
    }
  }

  // Unresolvable identifier — could be a parameter or item field
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

  // Phase 1: bare-identifier callee resolving to an arrow with expression body.
  if (ts.isIdentifier(node.expression)) {
    const inlined = tryInlineCallChain(node, ctx);
    if (inlined !== null) return inlined;
  }

  return makeUnconstrained(node, ctx, "function call");
}

/**
 * Call-chain following (v0.3.0). Supports these callee shapes:
 *   Phase 1:  const f = (x, y, ...) => <expr>
 *   Phase 2:  const f = (x) => { return <expr>; }
 *             const f = function(x) { return <expr>; }
 *             function f(x) { return <expr>; }
 *
 * Extracts each argument in the caller's context, binds the callee's param
 * symbols to those IRs via ctx.paramSubstitution, then extracts the callee's
 * return expression. References to callee params route through the
 * substitution and compose into the caller's tree as one continuous IR.
 *
 * Returns:
 *   - the inlined IR on success
 *   - null if the shape doesn't match what we can inline (caller falls
 *     through to the existing makeUnconstrained path)
 *   - an unconstrained IR with a specific reason when we can identify the
 *     callee but refuse to inline (external, cycle, depth cap)
 */
function tryInlineCallChain(
  node: ts.CallExpression,
  ctx: ExtractionContext,
): Expr | null {
  // Phase 1/2 cap: only inline at the top level. Nested calls keep today's
  // fallthrough until Phase 5 lifts the cap and relies on _tracingCallSymbols.
  if (ctx._callDepth >= 1) return null;

  const callee = node.expression as ts.Identifier;
  const calleeName = callee.text;
  const symbol = ctx.checker.getSymbolAtLocation(callee);
  if (!symbol) return null;

  // Follow through import aliases to the underlying declaration symbol.
  const resolvedSymbol =
    (symbol.flags & ts.SymbolFlags.Alias) !== 0
      ? ctx.checker.getAliasedSymbol(symbol)
      : symbol;

  const decl = resolvedSymbol.valueDeclaration;
  if (!decl) {
    return makeUnconstrained(
      node,
      ctx,
      `external function '${calleeName}' — no source in project to follow`,
    );
  }

  // Declarations in ambient .d.ts (standard lib, third-party types) have no
  // body we can read. Flag with a specific reason.
  if (decl.getSourceFile().isDeclarationFile) {
    return makeUnconstrained(
      node,
      ctx,
      `external function '${calleeName}' — declared in ambient .d.ts, no body to follow`,
    );
  }

  // Resolve the callee to (params, raw body node). Body-shape analysis lives
  // downstream in extractCalleeBody so each phase widens one layer.
  const shape = resolveCalleeShape(decl);
  if (!shape) return null;
  const { params, body: calleeBody } = shape;

  // Cycle guard. With depth capped at 1 in Phase 1/2/3 this can't fire yet,
  // but the scaffolding is in place so Phase 5 needs no further wiring.
  if (ctx._tracingCallSymbols.has(resolvedSymbol)) {
    return makeUnconstrained(
      node,
      ctx,
      `recursive call '${calleeName}' — cycles not followed; consider a bounded iteration form`,
    );
  }

  // Arity and param-shape checks.
  if (node.arguments.length !== params.length) return null;
  const paramSymbols: ts.Symbol[] = [];
  for (const p of params) {
    if (!ts.isIdentifier(p.name)) return null; // no destructured params yet
    if (p.dotDotDotToken) return null; // no rest params yet
    const s = ctx.checker.getSymbolAtLocation(p.name);
    if (!s) return null;
    paramSymbols.push(s);
  }

  // Extract each argument in the *caller's* current context. This runs
  // before we mutate ctx so the args see whatever scope the call site is in.
  const argExprs: Expr[] = node.arguments.map((a) =>
    extractExpr(a as ts.Expression, ctx),
  );

  // Enter callee scope.
  const priorSubstitution = ctx.paramSubstitution;
  const nextSubstitution = new Map(priorSubstitution);
  for (let i = 0; i < paramSymbols.length; i++) {
    nextSubstitution.set(paramSymbols[i], argExprs[i]);
  }
  ctx.paramSubstitution = nextSubstitution;
  ctx._tracingCallSymbols.add(resolvedSymbol);
  ctx._callDepth += 1;

  const body = extractCalleeBody(calleeBody, ctx);

  // Restore caller scope.
  ctx.paramSubstitution = priorSubstitution;
  ctx._tracingCallSymbols.delete(resolvedSymbol);
  ctx._callDepth -= 1;

  // If the body shape wasn't one we can inline, fall through to the outer
  // makeUnconstrained path rather than emitting a partial IR.
  return body;
}

/**
 * Map a callee's declaration node to its (parameters, raw body) pair, if the
 * declaration's shape is one we can inspect. Returns null for unsupported
 * shapes (methods, constructors). Body-shape decisions happen in
 * extractCalleeBody, not here.
 */
function resolveCalleeShape(
  decl: ts.Declaration,
): { params: ReadonlyArray<ts.ParameterDeclaration>; body: ts.ConciseBody } | null {
  // `const f = (...) => ...` or `const f = function(...) { ... }`
  if (ts.isVariableDeclaration(decl) && decl.initializer) {
    const init = decl.initializer;
    if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
      return { params: init.parameters, body: init.body };
    }
    return null;
  }

  // `function f(...) { return ...; }` (named function declaration)
  if (ts.isFunctionDeclaration(decl) && decl.body) {
    return { params: decl.parameters, body: decl.body };
  }

  return null;
}

/**
 * Extract the return-value IR from a callee body, in the caller's current
 * paramSubstitution scope. Supported shapes:
 *   - Arrow expression body (`=> x * 2`)
 *   - Block with `{ return <expr>; }`
 *   - Block shaped like `if (G1) return E1; if (G2) return E2; return Ef;` —
 *     lifted to nested `ite(G1, E1, ite(G2, E2, Ef))` (Phase 3).
 *   - Block with leading `const y = …;` bindings followed by guards and a
 *     final return (Phase 4). The consts resolve implicitly via tryTraceLocal
 *     when the return expression references them — no explicit IR node is
 *     emitted for the binding itself.
 * Returns null for block shapes we don't handle yet (let/var reassignments,
 * throws in non-guard positions, loops) — the caller falls through to the
 * outer unconstrained path.
 */
function extractCalleeBody(
  body: ts.ConciseBody,
  ctx: ExtractionContext,
): Expr | null {
  // Arrow expression body: extract directly.
  if (!ts.isBlock(body)) return extractExpr(body, ctx);

  const stmts = body.statements;
  if (stmts.length === 0) return null;

  // Leading statements may be either a pure `const` binding (skipped — the
  // existing symbol tracer handles references to it) or an `if-return` guard.
  const guards: Array<{ cond: BoolExpr; early: Expr }> = [];
  for (let i = 0; i < stmts.length - 1; i++) {
    const stmt = stmts[i];
    if (ts.isVariableStatement(stmt)) {
      if (!isPureConstBinding(stmt)) return null;
      continue;
    }
    const g = matchCalleeReturnGuard(stmt, ctx);
    if (!g) return null;
    guards.push(g);
  }

  const last = stmts[stmts.length - 1];
  if (!ts.isReturnStatement(last) || !last.expression) return null;
  const tail = extractExpr(last.expression, ctx);

  // Fold innermost → outermost so the first guard wraps the outermost `ite`.
  let result = tail;
  for (let i = guards.length - 1; i >= 0; i--) {
    const { cond, early } = guards[i];
    result = { ite: { cond, then: early, else: result } };
  }
  return result;
}

/**
 * Recognize a `const y = <expr>;` statement with one or more simple-named
 * bindings, each with an initializer. References to these names in the rest
 * of the callee body resolve via the existing tryTraceLocal symbol tracer,
 * so we don't need to emit any IR for the declaration itself — we just
 * tolerate it being present in the block.
 */
function isPureConstBinding(stmt: ts.VariableStatement): boolean {
  const declList = stmt.declarationList;
  if ((declList.flags & ts.NodeFlags.Const) === 0) return false;
  for (const decl of declList.declarations) {
    if (!decl.initializer) return false;
    if (!ts.isIdentifier(decl.name)) return false; // no destructuring yet
  }
  return true;
}

/**
 * Match an `if (G) return E;` statement inside a callee body (bare or single-
 * statement block). No else branches, no throws, no other wrappers. Returns
 * null for anything else so the caller can bail on the body shape.
 */
function matchCalleeReturnGuard(
  stmt: ts.Statement,
  ctx: ExtractionContext,
): { cond: BoolExpr; early: Expr } | null {
  if (!ts.isIfStatement(stmt)) return null;
  if (stmt.elseStatement) return null;

  let inner: ts.Statement = stmt.thenStatement;
  if (ts.isBlock(inner)) {
    if (inner.statements.length !== 1) return null;
    inner = inner.statements[0];
  }

  if (!ts.isReturnStatement(inner) || !inner.expression) return null;

  const cond = extractBoolExpr(stmt.expression, ctx);
  const early = extractExpr(inner.expression, ctx);
  return { cond, early };
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
 * Try to extract `arr.every(item => ...)` as `BoolExpr.each`.
 * Returns null on any mismatch so the caller can fall back.
 * Gated on the receiver's apparent type being Array / ReadonlyArray
 * via the type checker, not on the identifier name "every".
 */
function tryExtractEvery(
  node: ts.CallExpression,
  ctx: ExtractionContext,
): BoolExpr | null {
  if (!ts.isPropertyAccessExpression(node.expression)) return null;
  const callee = node.expression;
  if (callee.name.text !== "every") return null;

  const receiverType = ctx.checker.getApparentType(
    ctx.checker.getTypeAtLocation(callee.expression),
  );
  const typeName =
    receiverType.getSymbol()?.getName() ?? receiverType.aliasSymbol?.getName();
  if (typeName !== "Array" && typeName !== "ReadonlyArray") return null;

  if (node.arguments.length !== 1) return null;
  const callback = node.arguments[0];
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) {
    return null;
  }

  if (callback.parameters.length !== 1) return null;
  const paramNode = callback.parameters[0];
  if (!ts.isIdentifier(paramNode.name)) return null;
  const itemName = paramNode.name.text;

  let collectionName: string | null = null;
  if (ts.isPropertyAccessExpression(callee.expression)) {
    collectionName = callee.expression.name.text;
  } else if (ts.isIdentifier(callee.expression)) {
    collectionName = callee.expression.text;
  }
  if (!collectionName) return null;

  let bodyNode: ts.Expression | undefined;
  if (ts.isBlock(callback.body)) {
    const stmts = callback.body.statements;
    if (
      stmts.length === 1 &&
      ts.isReturnStatement(stmts[0]) &&
      stmts[0].expression
    ) {
      bodyNode = stmts[0].expression;
    }
  } else {
    bodyNode = callback.body;
  }
  if (!bodyNode) return null;

  const body = extractItemBoolExpr(bodyNode, itemName, ctx);
  return { each: { collection: collectionName, body } };
}

/**
 * Extract a BoolExpr in item scope (inside an every/each body).
 * Item fields are accessed as item.field → { field: { name: "field" } };
 * comparison operands go through extractItemExpr.
 */
function extractItemBoolExpr(
  node: ts.Expression,
  itemParamName: string,
  ctx: ExtractionContext,
): BoolExpr {
  if (ts.isParenthesizedExpression(node)) {
    return extractItemBoolExpr(node.expression, itemParamName, ctx);
  }

  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.ExclamationToken
  ) {
    return {
      not: extractItemBoolExpr(node.operand, itemParamName, ctx),
    };
  }

  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;

    if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
      return {
        logic: {
          op: "and",
          left: extractItemBoolExpr(node.left, itemParamName, ctx),
          right: extractItemBoolExpr(node.right, itemParamName, ctx),
        },
      };
    }
    if (op === ts.SyntaxKind.BarBarToken) {
      return {
        logic: {
          op: "or",
          left: extractItemBoolExpr(node.left, itemParamName, ctx),
          right: extractItemBoolExpr(node.right, itemParamName, ctx),
        },
      };
    }

    const compOp = mapComparisonOp(op);
    if (compOp) {
      return {
        cmp: {
          op: compOp,
          left: extractItemExpr(node.left, itemParamName, ctx),
          right: extractItemExpr(node.right, itemParamName, ctx),
        },
      };
    }
  }

  const param = makeUnconstrained(node, ctx, "unsupported item boolean");
  return { cmp: { op: "gt", left: param, right: { lit: 0 } } };
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

/** Returns true when the TS type includes `undefined` or `null`. On such types,
 *  `x ?? default` (or `x || 0`) expresses real presence branching. On non-nullable
 *  types, the fallback is unreachable and we should emit the bare field ref —
 *  emitting `isPresent` on a non-optional field produces IR that fails the
 *  deserializer's consistency check. */
function typeIsNullable(type: ts.Type, checker: ts.TypeChecker): boolean {
  return type !== checker.getNonNullableType(type);
}

function extractNullCoalescing(
  node: ts.BinaryExpression,
  ctx: ExtractionContext,
): Expr {
  const leftExpr = extractExpr(node.left, ctx);
  const rightExpr = extractExpr(node.right, ctx);

  // x ?? default → ite(isPresent(x), x, default), but only if x's type is nullable.
  if ("field" in leftExpr) {
    const leftType = ctx.checker.getTypeAtLocation(node.left);
    if (!typeIsNullable(leftType, ctx.checker)) {
      // Non-nullable left side: the fallback is unreachable. Emit the bare field.
      return leftExpr;
    }
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
  const readable = deriveReadableName(node);
  const name = `__ext_${readable}_${ctx.unkCounter++}`;
  ctx.unconstrainedParams.set(name, { node, reason });
  return { field: { name } };
}

/**
 * Derive a readable name from an unresolved AST node.
 * Uses the outermost function/method name, sanitized for use as an identifier.
 */
function deriveReadableName(node: ts.Node): string {
  // Call expression: parseFloat(...) → "parseFloat", obj.method(...) → "method"
  if (ts.isCallExpression(node)) {
    const callee = node.expression;
    if (ts.isIdentifier(callee)) return sanitizeName(callee.text);
    if (ts.isPropertyAccessExpression(callee)) {
      const obj = callee.expression;
      const method = callee.name.text;
      if (ts.isIdentifier(obj)) return sanitizeName(`${obj.text}_${method}`);
      return sanitizeName(method);
    }
  }

  // Property access: obj.field → "obj_field"
  if (ts.isPropertyAccessExpression(node)) {
    const obj = node.expression;
    const field = node.name.text;
    if (ts.isIdentifier(obj)) return sanitizeName(`${obj.text}_${field}`);
    return sanitizeName(field);
  }

  // Identifier
  if (ts.isIdentifier(node)) return sanitizeName(node.text);

  // Fallback: use the first ~20 chars of the node text, sanitized
  const text = node.getText().substring(0, 20);
  const cleaned = sanitizeName(text);
  return cleaned || "expr";
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "expr";
}

// ─── Local variable tracing ─────────────────────────────────────

/**
 * Try to trace a symbol back to its initializer expression.
 * Returns the extracted Expr if the symbol is a local variable (const/let/var)
 * in the same function whose initializer we can recurse into.
 * Returns null if the symbol can't be traced (not a local, cycle detected, etc.)
 */
function tryTraceLocal(
  symbol: ts.Symbol,
  referenceNode: ts.Node,
  ctx: ExtractionContext,
): Expr | null {
  // Self-reference override: when tracing `result = result + amount`,
  // the inner `result` maps to the prior value (declaration initializer)
  if (ctx._selfRefOverride && ctx._selfRefOverride.symbol === symbol) {
    return ctx._selfRefOverride.expr;
  }

  // Cycle detection
  if (ctx._tracingSymbols.has(symbol)) return null;

  const decl = symbol.valueDeclaration;
  if (!decl) return null;

  // Only trace variable declarations (const/let/var)
  if (!ts.isVariableDeclaration(decl)) return null;

  // Must have an initializer
  if (!decl.initializer) return null;

  // For let/var, check if it's ever reassigned. If so, find the last assignment
  // before the reference point (or bail if reassignment is inside a branch).
  const declList = decl.parent;
  if (ts.isVariableDeclarationList(declList)) {
    const isConst = (declList.flags & ts.NodeFlags.Const) !== 0;
    if (!isConst) {
      // let/var — check for reassignments
      const lastAssign = findLastAssignment(symbol, referenceNode, ctx);
      if (lastAssign === "branched") return null; // reassignment in a branch
      if (lastAssign) {
        // Trace the last assignment's RHS. Self-references in the RHS
        // (e.g., `result = result + amount`) should trace to the PRIOR value.
        // We add a special handler: push a "prior value resolver" that maps
        // self-references to the declaration initializer.
        ctx._tracingSymbols.add(symbol);
        // Temporarily swap: self-references in this RHS trace to the initializer
        const priorExpr = traceInitializer(decl, symbol, ctx);
        ctx._selfRefOverride = { symbol, expr: priorExpr };
        const result = extractExpr(lastAssign as ts.Expression, ctx);
        ctx._selfRefOverride = null;
        ctx._tracingSymbols.delete(symbol);
        return result;
      }
      // No reassignments found — safe to trace the initializer (single-assignment let/var)
    }
  }

  // Check that the declaration is in the same function as the reference
  const declFunction = getEnclosingFunction(decl);
  const refFunction = getEnclosingFunction(referenceNode);
  if (declFunction !== refFunction) {
    // Module-level const — check if it's a simple literal or constant arithmetic
    if (!declFunction) {
      return tryEvalModuleConst(decl.initializer, ctx);
    }
    return null;
  }

  // Trace into the initializer
  ctx._tracingSymbols.add(symbol);
  const result = extractExpr(decl.initializer, ctx);
  ctx._tracingSymbols.delete(symbol);
  return result;
}

/**
 * Trace a variable declaration's initializer, handling the tracing context.
 */
function traceInitializer(
  decl: ts.VariableDeclaration,
  symbol: ts.Symbol,
  ctx: ExtractionContext,
): Expr {
  if (!decl.initializer) {
    return makeUnconstrained(decl, ctx, "variable without initializer");
  }
  // Don't add to _tracingSymbols here — the caller already did that.
  // But save/restore selfRefOverride to avoid interference.
  const savedOverride = ctx._selfRefOverride;
  ctx._selfRefOverride = null;
  const result = extractExpr(decl.initializer, ctx);
  ctx._selfRefOverride = savedOverride;
  return result;
}

/**
 * For a let/var symbol, find the last assignment before the reference point.
 * Returns:
 *   - The RHS expression of the last assignment (if straightforward sequential code)
 *   - "branched" if a reassignment exists inside an if/else/switch
 *   - null if no reassignments exist (single-assignment)
 */
function findLastAssignment(
  symbol: ts.Symbol,
  referenceNode: ts.Node,
  ctx: ExtractionContext,
): ts.Expression | "branched" | null {
  const decl = symbol.valueDeclaration;
  if (!decl) return null;

  const enclosingFn = getEnclosingFunction(decl);
  if (!enclosingFn) return null;

  // Get the function body
  const body = "body" in enclosingFn ? (enclosingFn as any).body : null;
  if (!body || !ts.isBlock(body)) return null;

  const refPos = referenceNode.getStart();
  let lastRhs: ts.Expression | null = null;
  let hasBranchedAssign = false;

  function visit(node: ts.Node, inBranch: boolean) {
    // Don't look past the reference point
    if (node.getStart() >= refPos) return;

    // Assignment: name = expr
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      const assignSym = ctx.checker.getSymbolAtLocation(node.left);
      if (assignSym === symbol) {
        if (inBranch) {
          hasBranchedAssign = true;
        } else {
          lastRhs = node.right;
        }
      }
    }

    // Compound assignment: name += expr, name -= expr, etc.
    if (
      ts.isBinaryExpression(node) &&
      isCompoundAssignment(node.operatorToken.kind) &&
      ts.isIdentifier(node.left)
    ) {
      const assignSym = ctx.checker.getSymbolAtLocation(node.left);
      if (assignSym === symbol) {
        if (inBranch) {
          hasBranchedAssign = true;
        } else {
          // Convert compound assignment to full expression
          // e.g., total += tax → total + tax (where inner total traces to prior value)
          lastRhs = node.right; // simplified — compound assigns become unconstrained for now
          hasBranchedAssign = true; // treat as branched to be safe
        }
      }
    }

    // Track branching
    const entersBranch = ts.isIfStatement(node) || ts.isSwitchStatement(node)
      || ts.isConditionalExpression(node) || ts.isForStatement(node)
      || ts.isWhileStatement(node) || ts.isForOfStatement(node)
      || ts.isForInStatement(node);

    ts.forEachChild(node, (child) => visit(child, inBranch || entersBranch));
  }

  ts.forEachChild(body, (child) => visit(child, false));

  if (hasBranchedAssign) return "branched";
  return lastRhs;
}

function isCompoundAssignment(kind: ts.SyntaxKind): boolean {
  return kind === ts.SyntaxKind.PlusEqualsToken
    || kind === ts.SyntaxKind.MinusEqualsToken
    || kind === ts.SyntaxKind.AsteriskEqualsToken
    || kind === ts.SyntaxKind.SlashEqualsToken;
}

/**
 * Try to evaluate a module-level const initializer to a literal.
 * Handles: numeric literals, simple arithmetic on literals.
 */
function tryEvalModuleConst(node: ts.Expression, ctx: ExtractionContext): Expr | null {
  if (ts.isNumericLiteral(node)) {
    return { lit: Number(node.text) };
  }

  // -N
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return { lit: -Number(node.operand.text) };
  }

  // Parenthesized
  if (ts.isParenthesizedExpression(node)) {
    return tryEvalModuleConst(node.expression, ctx);
  }

  // Binary arithmetic on constants: 24 * 60, 24 * 60 / 15, etc.
  if (ts.isBinaryExpression(node)) {
    const left = tryEvalModuleConst(node.left, ctx);
    const right = tryEvalModuleConst(node.right, ctx);
    if (left && "lit" in left && right && "lit" in right) {
      const l = left.lit;
      const r = right.lit;
      switch (node.operatorToken.kind) {
        case ts.SyntaxKind.PlusToken: return { lit: l + r };
        case ts.SyntaxKind.MinusToken: return { lit: l - r };
        case ts.SyntaxKind.AsteriskToken: return { lit: l * r };
        case ts.SyntaxKind.SlashToken: return r !== 0 ? { lit: l / r } : null;
        default: return null;
      }
    }

    // One side might be a module-const reference too
    if (!left || !right) {
      const leftExpr = tryResolveModuleRef(node.left, ctx);
      const rightExpr = tryResolveModuleRef(node.right, ctx);
      if (leftExpr && "lit" in leftExpr && rightExpr && "lit" in rightExpr) {
        const l = leftExpr.lit;
        const r = rightExpr.lit;
        switch (node.operatorToken.kind) {
          case ts.SyntaxKind.PlusToken: return { lit: l + r };
          case ts.SyntaxKind.MinusToken: return { lit: l - r };
          case ts.SyntaxKind.AsteriskToken: return { lit: l * r };
          case ts.SyntaxKind.SlashToken: return r !== 0 ? { lit: l / r } : null;
          default: return null;
        }
      }
    }
  }

  return null;
}

/**
 * Try to resolve an expression that might be a reference to another module-level const.
 */
function tryResolveModuleRef(node: ts.Expression, ctx: ExtractionContext): Expr | null {
  if (ts.isNumericLiteral(node)) return { lit: Number(node.text) };
  if (ts.isParenthesizedExpression(node)) return tryResolveModuleRef(node.expression, ctx);

  if (ts.isIdentifier(node)) {
    const symbol = ctx.checker.getSymbolAtLocation(node);
    if (!symbol?.valueDeclaration) return null;
    if (!ts.isVariableDeclaration(symbol.valueDeclaration)) return null;
    const init = symbol.valueDeclaration.initializer;
    if (!init) return null;
    // Only recurse for module-level (no enclosing function)
    if (!getEnclosingFunction(symbol.valueDeclaration)) {
      return tryEvalModuleConst(init, ctx);
    }
  }

  return null;
}

/** Get the nearest enclosing function/method/arrow, or null for module scope. */
function getEnclosingFunction(node: ts.Node): ts.Node | null {
  let current = node.parent;
  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isArrowFunction(current) ||
      ts.isFunctionExpression(current) ||
      ts.isMethodDeclaration(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return null;
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

// ─── Return-guard pre-pass ──────────────────────────────────────

/**
 * Walk up from an assignment-site expression to the enclosing function body,
 * iterate the top-level statements before the dominating statement, and
 * collect each qualifying return-guard as (cond, early) pairs.
 *
 * Returns "bail" when any guard has a shape we don't handle cleanly in v0.2.2
 * (block with multiple statements, if/else where both branches return, early
 * values we can't extract) — the caller then falls the whole assignment to
 * `__ext_` rather than partial-extracting.
 */
function collectReturnGuards(
  node: ts.Node,
  fieldName: string,
  ctx: ExtractionContext,
): Array<{ cond: BoolExpr; early: Expr }> | "bail" {
  const fn = getEnclosingFunction(node);
  if (!fn) return [];

  const body = (fn as { body?: ts.Node }).body;
  if (!body || !ts.isBlock(body)) return [];

  // Find the top-level statement of the function body that contains `node`.
  let dominatingStmt: ts.Statement | null = null;
  for (const stmt of body.statements) {
    if (node.getStart() >= stmt.getStart() && node.getEnd() <= stmt.getEnd()) {
      dominatingStmt = stmt;
      break;
    }
  }
  if (!dominatingStmt) return [];

  const guards: Array<{ cond: BoolExpr; early: Expr }> = [];
  for (const stmt of body.statements) {
    if (stmt === dominatingStmt) break;
    const matched = matchReturnGuard(stmt, fieldName, ctx);
    if (matched === "bail") return "bail";
    if (matched === "skip") continue;
    guards.push(matched);
  }
  return guards;
}

function matchReturnGuard(
  stmt: ts.Statement,
  fieldName: string,
  ctx: ExtractionContext,
): { cond: BoolExpr; early: Expr } | "bail" | "skip" {
  // Non-if statements (const decls, other returns before the dominating one,
  // etc.) neither bail nor contribute a guard. Returns before the dominating
  // statement shouldn't happen at the top level of a block, but be permissive.
  if (!ts.isIfStatement(stmt)) return "skip";

  // if/else where both branches return different values is out of scope for v0.2.2.
  if (stmt.elseStatement) return "bail";

  let inner: ts.Statement = stmt.thenStatement;
  if (ts.isBlock(inner)) {
    if (inner.statements.length !== 1) return "bail";
    inner = inner.statements[0];
  }

  // Throw-guards: silently ignore. Correct handling needs a preconditions
  // field in Aral-fn, deferred to v0.2.3.
  if (ts.isThrowStatement(inner)) return "skip";

  if (ts.isReturnStatement(inner)) {
    if (!inner.expression) return "skip"; // void return — nothing to express
    const early = extractEarlyValue(inner.expression, fieldName, ctx);
    if (early === "bail") return "bail";
    const cond = extractBoolExpr(stmt.expression, ctx);
    return { cond, early };
  }

  // Any other statement kind in the then-branch → bail.
  return "bail";
}

/**
 * Resolve the value an early-return represents for a specific field.
 * Handles pass-through identities (return <inputParam>) and object literals
 * with matching field properties or a spread. Anything else bails.
 */
function extractEarlyValue(
  inner: ts.Expression,
  fieldName: string,
  ctx: ExtractionContext,
): Expr | "bail" {
  // Pass-through: `return <inputParam>` → this field is unchanged.
  if (
    ts.isIdentifier(inner) &&
    ctx.inputParamName !== null &&
    inner.text === ctx.inputParamName
  ) {
    return { field: { name: fieldName } };
  }

  // Object literal: look for the assigned field explicitly; if a spread is
  // present and the field isn't listed, treat it as pass-through for that field.
  if (ts.isObjectLiteralExpression(inner)) {
    let hasSpread = false;
    for (const prop of inner.properties) {
      if (ts.isSpreadAssignment(prop)) {
        hasSpread = true;
        continue;
      }
      if (
        ts.isPropertyAssignment(prop) &&
        ts.isIdentifier(prop.name) &&
        prop.name.text === fieldName
      ) {
        return extractExpr(prop.initializer, ctx);
      }
    }
    if (hasSpread) return { field: { name: fieldName } };
    return "bail";
  }

  // Literal, field ref, arithmetic, etc. — extract through the normal path.
  return extractExpr(inner, ctx);
}

function applyGuardsToExpr(
  body: Expr,
  guards: Array<{ cond: BoolExpr; early: Expr }>,
): Expr {
  // Fold innermost-first so the outermost `ite` corresponds to the first
  // guard in source order.
  let result = body;
  for (let i = guards.length - 1; i >= 0; i--) {
    const { cond, early } = guards[i];
    result = { ite: { cond, then: early, else: result } };
  }
  return result;
}
