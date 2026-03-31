/**
 * TypeScript → Aral-fn parser
 * Parses pure TypeScript functions into the Aral-fn JSON IR.
 *
 * Supported shapes:
 *   [export] function NAME(PARAM: TYPE, ...params): TYPE {
 *     const intermediate = expr;          // optional, auto-inlined
 *     if (guard) return PARAM;            // optional guard clauses
 *     return { ...PARAM, FIELD: EXPR, ... };
 *   }
 *
 * Expressions:
 *   - Numeric literals: 42, -5
 *   - Field references: input.field or paramName
 *   - Arithmetic with precedence: a * b + c, (a - b) * c
 *   - Division (total semantics): a / b
 *   - Rounding: Math.floor(x), Math.ceil(x), Math.round(x)
 *   - Ternary: cond ? thenExpr : elseExpr
 *   - Comparisons: a > b, a === b, a !== b, a >= b, a <= b
 *   - Boolean logic: a && b, a || b, !a
 *   - Collection sum: items.reduce((acc, item) => acc + item.field, 0)
 *
 * Errors use two categories:
 *   REWRITE:        — restructure your code to fit the supported shape
 *   NOT VERIFIABLE: — this pattern can't be formally verified (IR limitation)
 */

// ============================================================
// Types (mirrors Aral-fn JSON schema)
// ============================================================

export type ArithOp = "add" | "sub" | "mul" | "div";
export type CompOp = "eq" | "neq" | "gt" | "lt" | "gte" | "lte";
export type LogicOp = "and" | "or";

export type RoundingMode = "floor" | "ceil" | "half_up";

export type FieldRef =
  | { name: string }
  | { qualifier: string; name: string };

export type Expr =
  | { lit: number }
  | { field: FieldRef }
  | { arith: { op: ArithOp; left: Expr; right: Expr } }
  | { ite: { cond: BoolExpr; then: Expr; else: Expr } }
  | { round: { expr: Expr; mode: RoundingMode } }
  | { sum: { collection: string; body: Expr } };

export type BoolExpr =
  | { cmp: { op: CompOp; left: Expr; right: Expr } }
  | { logic: { op: LogicOp; left: BoolExpr; right: BoolExpr } }
  | { not: BoolExpr }
  | { isPresent: FieldRef };

export interface FieldAssign {
  fieldName: string;
  value: Expr;
}

export interface AralFn {
  name: string;
  inputType: string;
  inputFields: string[];
  params: string[];
  assigns: FieldAssign[];
  typedParams?: Array<{ name: string; type: string }>;
  optionalFields?: string[];
}

const PRIMITIVE_TYPES = new Set(["number", "string", "boolean"]);

// ============================================================
// Tokenizer
// ============================================================

const SINGLE_CHAR_TOKENS = new Set([
  "(", ")", "{", "}", "[", "]", ":", ",", ";", "+", "*", "/",
]);

// Multi-char operators we need to recognize
const MULTI_CHAR_OPS = ["===", "!==", ">=", "<=", "&&", "||", "...", "=>", "??"];

function isIdentChar(c: string): boolean {
  return /[a-zA-Z0-9_]/.test(c);
}

export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < input.length) {
    const c = input[i];

    // Whitespace
    if (/\s/.test(c)) {
      i++;
      continue;
    }

    // Skip single-line comments
    if (input.slice(i, i + 2) === "//") {
      while (i < input.length && input[i] !== "\n") i++;
      continue;
    }

    // Skip multi-line comments
    if (input.slice(i, i + 2) === "/*") {
      i += 2;
      while (i + 1 < input.length && input.slice(i, i + 2) !== "*/") i++;
      i += 2;
      continue;
    }

    // Skip import lines
    if (input.slice(i, i + 6) === "import") {
      while (i < input.length && input[i] !== "\n") i++;
      continue;
    }

    // Skip 'export' keyword
    if (input.slice(i, i + 6) === "export" && !isIdentChar(input[i + 6] || "")) {
      i += 6;
      continue;
    }

    // Try multi-char operators (longest match first)
    let matched = false;
    for (const op of MULTI_CHAR_OPS) {
      if (input.slice(i, i + op.length) === op) {
        tokens.push(op);
        i += op.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Comparison operators (2-char: ==, !=, but we prefer === and !==)
    if (input.slice(i, i + 2) === "==" && input[i + 2] !== "=") {
      tokens.push("==");
      i += 2;
      continue;
    }
    if (input.slice(i, i + 2) === "!=" && input[i + 2] !== "=") {
      tokens.push("!=");
      i += 2;
      continue;
    }

    // Single > or <
    if (c === ">" || c === "<") {
      tokens.push(c);
      i++;
      continue;
    }

    // Ternary ? and negation !
    if (c === "?" || c === "!") {
      tokens.push(c);
      i++;
      continue;
    }

    // Dot (field access)
    if (c === ".") {
      tokens.push(".");
      i++;
      continue;
    }

    // Single-char tokens
    if (SINGLE_CHAR_TOKENS.has(c)) {
      tokens.push(c);
      i++;
      continue;
    }

    // Minus
    if (c === "-") {
      tokens.push("-");
      i++;
      continue;
    }

    // Assignment =
    if (c === "=") {
      tokens.push("=");
      i++;
      continue;
    }

    // Identifiers
    if (/[a-zA-Z_]/.test(c)) {
      let word = "";
      while (i < input.length && isIdentChar(input[i])) {
        word += input[i];
        i++;
      }
      tokens.push(word);
      continue;
    }

    // Numbers
    if (/[0-9]/.test(c)) {
      let num = "";
      while (i < input.length && /[0-9]/.test(input[i])) {
        num += input[i];
        i++;
      }
      tokens.push(num);
      continue;
    }

    // Unknown: skip
    i++;
  }

  return tokens;
}

/** Join dot-separated tokens: ["order", ".", "subtotal"] → ["order.subtotal"] */
export function joinDotAccess(tokens: string[]): string[] {
  const result: string[] = [];
  let i = 0;

  while (i < tokens.length) {
    if (tokens[i] === "...") {
      result.push("...");
      i++;
    } else if (
      i + 2 < tokens.length &&
      tokens[i + 1] === "." &&
      tokens[i] !== "..."
    ) {
      let joined = tokens[i];
      while (i + 2 < tokens.length && tokens[i + 1] === ".") {
        joined += "." + tokens[i + 2];
        i += 2;
      }
      result.push(joined);
      i++;
    } else {
      result.push(tokens[i]);
      i++;
    }
  }

  return result;
}

// ============================================================
// Diagnostic checks
// ============================================================

export function checkUnsupported(tokens: string[]): void {
  // Check for missing function declaration (arrow functions, etc.)
  if (!tokens.includes("function")) {
    throw new Error(
      `REWRITE: Arrow functions and other forms are not supported. Use a function declaration:\n` +
      `  function name(input: Type, ...params): Type {\n` +
      `    return { ...input, field: expr };\n` +
      `  }`
    );
  }
  if (tokens.includes("let") || tokens.includes("var")) {
    throw new Error(
      `REWRITE: 'let'/'var' detected. Use 'const' instead — const declarations are automatically inlined into the return expression.`
    );
  }
  if (tokens.includes("throw")) {
    throw new Error(
      `REWRITE: 'throw' detected. Replace with a guard clause that returns the input unchanged.\n` +
      `  Before: if (invalid) throw new Error(...);\n` +
      `  After:  if (invalid) return input;`
    );
  }
  const arrayMethods = ["map", "filter", "every", "some", "find", "forEach", "splice", "push"];
  for (const m of arrayMethods) {
    // Check both standalone tokens and dot-access tokens (e.g., "items.reduce")
    const found = tokens.some(t => t === m || t.endsWith(`.${m}`));
    if (found) {
      throw new Error(
        `NOT VERIFIABLE: Array method '.${m}()' cannot be formally verified yet. ` +
        `Compute the result externally and pass it as a parameter.\n` +
        `  Before: const result = items.${m}(...);\n` +
        `  After:  function f(input: Type, result: number): Type`
      );
    }
  }
  if (tokens.includes("[") || tokens.includes("]")) {
    throw new Error(
      `NOT VERIFIABLE: Array operations ([...]) cannot be formally verified yet. ` +
      `Array field modifications require collection support (planned).`
    );
  }
  const returnCount = tokens.filter((t) => t === "return").length;
  if (returnCount === 0) {
    throw new Error(
      `REWRITE: No return statement found. The function must return an object with spread:\n` +
      `  return { ...input, field: expr };`
    );
  }
}

// ============================================================
// Expression parser (now supports ternary + comparisons)
// ============================================================

const ARITH_OPS: Record<string, ArithOp> = { "+": "add", "-": "sub", "*": "mul", "/": "div" };
const CMP_OPS: Record<string, CompOp> = {
  ">": "gt", "<": "lt", ">=": "gte", "<=": "lte",
  "===": "eq", "!==": "neq", "==": "eq", "!=": "neq",
};

function parseSimpleExpr(token: string, root: string, paramNames: string[]): Expr {
  const n = parseInt(token, 10);
  if (!isNaN(n) && String(n) === token) {
    return { lit: n };
  }

  const parts = token.split(".");
  if (parts.length > 2) {
    throw new Error(
      `REWRITE: Nested field access '${token}' is not supported. ` +
      `Pass it as a separate parameter instead.\n` +
      `  Before: function f(${root}: Type, ...): Type { ... ${token} ... }\n` +
      `  After:  function f(${root}: Type, ${parts.slice(1).join("_")}: number, ...): Type`
    );
  }
  if (parts.length === 2) {
    if (parts[0] === root) {
      return { field: { name: parts[1] } };
    }
    if (paramNames.includes(parts[0])) {
      return { field: { qualifier: parts[0], name: parts[1] } };
    }
    throw new Error(
      `REWRITE: Cannot access fields on '${parts[0]}' — it's not the input (${root}) or a parameter. ` +
      `Known parameters: ${paramNames.length > 0 ? paramNames.join(", ") : "(none)"}. ` +
      `If '${parts[0]}' should be a parameter, add it to the function signature.`
    );
  }
  return { field: { name: token } };
}

/**
 * Find the matching `:` for a `?` in a ternary expression,
 * respecting nested ternaries and parentheses.
 */
function findTernaryColon(tokens: string[], questionIdx: number): number {
  let depth = 0;
  for (let i = questionIdx + 1; i < tokens.length; i++) {
    if (tokens[i] === "?" || tokens[i] === "(") depth++;
    else if (tokens[i] === ")") depth--;
    else if (tokens[i] === ":" && depth === 0) return i;
    else if (tokens[i] === ":") depth--;
  }
  return -1;
}

/**
 * Parse a BoolExpr from tokens.
 * Supports: a > b, a === b, expr && expr, expr || expr, !expr
 */
function parseBoolExpr(tokens: string[], root: string, paramNames: string[]): BoolExpr {
  // Check for && or || (lowest precedence)
  for (const [sym, op] of [["&&", "and"], ["||", "or"]] as const) {
    // Find rightmost occurrence (left-associative)
    let depth = 0;
    let idx = -1;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] === "(") depth++;
      else if (tokens[i] === ")") depth--;
      else if (tokens[i] === sym && depth === 0) idx = i;
    }
    if (idx !== -1) {
      const left = tokens.slice(0, idx);
      const right = tokens.slice(idx + 1);
      return {
        logic: {
          op: op as LogicOp,
          left: parseBoolExpr(left, root, paramNames),
          right: parseBoolExpr(right, root, paramNames),
        },
      };
    }
  }

  // Check for negation: !expr
  if (tokens[0] === "!") {
    return { not: parseBoolExpr(tokens.slice(1), root, paramNames) };
  }

  // Check for parenthesized expression: (expr)
  if (tokens[0] === "(" && tokens[tokens.length - 1] === ")") {
    return parseBoolExpr(tokens.slice(1, -1), root, paramNames);
  }

  // Must be a comparison: expr op expr (depth-aware scan)
  for (const [sym, op] of Object.entries(CMP_OPS)) {
    let d = 0;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] === "(") d++;
      else if (tokens[i] === ")") d--;
      else if (tokens[i] === sym && d === 0) {
        const left = tokens.slice(0, i);
        const right = tokens.slice(i + 1);
        return {
          cmp: {
            op: op as CompOp,
            left: parseFunExpr(left, root, paramNames),
            right: parseFunExpr(right, root, paramNames),
          },
        };
      }
    }
  }

  throw new Error(
    `REWRITE: Cannot parse condition '${tokens.join(" ")}'. ` +
    `Supported: comparisons (a > b, a === b) and logic (a && b, a || b, !a).`
  );
}

/**
 * Parse an Expr from tokens. Handles:
 * - Ternary (cond ? then : else) — lowest precedence
 * - Arithmetic with proper precedence (+/- then *​/)
 * - Rounding: Math.floor/ceil/round(expr)
 * - Parenthesized expressions
 * - Literals and field references
 */
function parseFunExpr(tokens: string[], root: string, paramNames: string[] = []): Expr {
  if (tokens.length === 0) {
    throw new Error("REWRITE: Empty expression found. Check for missing values in field assignments or conditions.");
  }

  // Check for ternary: find top-level ?
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "(") depth++;
    else if (tokens[i] === ")") depth--;
    else if (tokens[i] === "?" && depth === 0) {
      const colonIdx = findTernaryColon(tokens, i);
      if (colonIdx === -1) {
        throw new Error("REWRITE: Ternary '?' without matching ':'. Check that every 'cond ? a : b' has both branches.");
      }
      const condTokens = tokens.slice(0, i);
      const thenTokens = tokens.slice(i + 1, colonIdx);
      const elseTokens = tokens.slice(colonIdx + 1);
      return {
        ite: {
          cond: parseBoolExpr(condTokens, root, paramNames),
          then: parseFunExpr(thenTokens, root, paramNames),
          else: parseFunExpr(elseTokens, root, paramNames),
        },
      };
    }
  }

  // Check for nullish coalescing: expr ?? default
  // Lower to ite(isPresent(field), field, default)
  depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "(") depth++;
    else if (tokens[i] === ")") depth--;
    else if (tokens[i] === "??" && depth === 0) {
      const leftTokens = tokens.slice(0, i);
      const rightTokens = tokens.slice(i + 1);
      // The left side must be a field reference (the thing being null-checked)
      const leftExpr = parseArithExpr(leftTokens, root, paramNames);
      const rightExpr = parseFunExpr(rightTokens, root, paramNames);
      // Extract the field ref from the left expression for isPresent
      if (!("field" in leftExpr)) {
        throw new Error(
          "REWRITE: Nullish coalescing (??) requires a simple field reference on the left side. " +
          `Found a complex expression instead. Extract the computation and use a ternary: ` +
          `\`field !== undefined ? field : default\``
        );
      }
      return {
        ite: {
          cond: { isPresent: leftExpr.field },
          then: leftExpr,
          else: rightExpr,
        },
      };
    }
  }

  // Delegate to arithmetic parser with proper precedence
  return parseArithExpr(tokens, root, paramNames);
}

const MATH_ROUND_OPS: Record<string, RoundingMode> = {
  "Math.floor": "floor",
  "Math.ceil": "ceil",
  "Math.round": "half_up",
};

/**
 * Parse arithmetic expressions with proper operator precedence.
 * Precedence (low→high): +/- then *​/
 * Left-associative: splits at the rightmost operator at each level,
 * so the left side accumulates (a + b + c → (a + b) + c).
 */
function parseArithExpr(tokens: string[], root: string, paramNames: string[]): Expr {
  // Level 1: + and - (lowest arithmetic precedence)
  // Find rightmost +/- at depth 0 (left-associative)
  let depth = 0;
  let lastIdx = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "(") depth++;
    else if (tokens[i] === ")") depth--;
    else if ((tokens[i] === "+" || tokens[i] === "-") && depth === 0 && i > 0) {
      lastIdx = i;
    }
  }
  if (lastIdx > 0) {
    return {
      arith: {
        op: ARITH_OPS[tokens[lastIdx]],
        left: parseArithExpr(tokens.slice(0, lastIdx), root, paramNames),
        right: parseArithExpr(tokens.slice(lastIdx + 1), root, paramNames),
      },
    };
  }

  // Level 2: * and / (higher arithmetic precedence)
  depth = 0;
  lastIdx = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "(") depth++;
    else if (tokens[i] === ")") depth--;
    else if ((tokens[i] === "*" || tokens[i] === "/") && depth === 0 && i > 0) {
      lastIdx = i;
    }
  }
  if (lastIdx > 0) {
    return {
      arith: {
        op: ARITH_OPS[tokens[lastIdx]],
        left: parseArithExpr(tokens.slice(0, lastIdx), root, paramNames),
        right: parseArithExpr(tokens.slice(lastIdx + 1), root, paramNames),
      },
    };
  }

  // No arithmetic operators at top level — parse as primary
  return parsePrimary(tokens, root, paramNames);
}

/**
 * Parse a primary (atomic) expression:
 * - Numeric literal: 42
 * - Field reference: input.field or paramName
 * - Parenthesized: (expr)
 * - Rounding: Math.floor(expr), Math.ceil(expr), Math.round(expr)
 * - Unary minus: -expr
 */
function parsePrimary(tokens: string[], root: string, paramNames: string[]): Expr {
  if (tokens.length === 0) {
    throw new Error("REWRITE: Empty expression after an operator. Check for trailing +, -, *, /.");
  }

  // Unary minus: -expr → arith(sub, lit(0), expr)
  if (tokens[0] === "-") {
    const inner = parsePrimary(tokens.slice(1), root, paramNames);
    return { arith: { op: "sub", left: { lit: 0 }, right: inner } };
  }

  // Rounding: Math.floor(expr), Math.ceil(expr), Math.round(expr)
  if (
    tokens.length >= 3 &&
    tokens[0] in MATH_ROUND_OPS &&
    tokens[1] === "("
  ) {
    // Find the matching close paren for the ( at position 1
    let d = 0;
    let matchIdx = -1;
    for (let i = 1; i < tokens.length; i++) {
      if (tokens[i] === "(") d++;
      else if (tokens[i] === ")") {
        d--;
        if (d === 0) { matchIdx = i; break; }
      }
    }
    if (matchIdx === tokens.length - 1) {
      const mode = MATH_ROUND_OPS[tokens[0]];
      const innerTokens = tokens.slice(2, matchIdx);
      return { round: { expr: parseFunExpr(innerTokens, root, paramNames), mode } };
    }
  }

  // Sum pattern: collection.reduce((acc, item) => acc + expr, 0)
  if (tokens.length >= 10 && tokens[0].endsWith(".reduce") && tokens[1] === "(") {
    // Extract collection name: "input.items.reduce" → "items"
    const parts = tokens[0].split(".");
    if (parts.length < 2 || parts[parts.length - 1] !== "reduce") {
      throw new Error(
        `NOT VERIFIABLE: Only sum-pattern .reduce() is supported:\n` +
        `  items.reduce((acc, item) => acc + item.field, 0)\n` +
        `Other reduce patterns cannot be formally verified.`
      );
    }
    // Collection is the field name (strip root prefix if present, take last segment before .reduce)
    const collSegments = parts.slice(0, -1); // everything before "reduce"
    const collName = collSegments[0] === root
      ? collSegments.slice(1).join(".")
      : collSegments.join(".");

    // Find matching close paren for the outer (
    let d = 0;
    let outerClose = -1;
    for (let i = 1; i < tokens.length; i++) {
      if (tokens[i] === "(") d++;
      else if (tokens[i] === ")") { d--; if (d === 0) { outerClose = i; break; } }
    }
    if (outerClose !== tokens.length - 1) {
      throw new Error(
        `NOT VERIFIABLE: Only sum-pattern .reduce() is supported:\n` +
        `  items.reduce((acc, item) => acc + item.field, 0)\n` +
        `Other reduce patterns cannot be formally verified.`
      );
    }

    // Inside: (acc, item) => acc + body, 0
    // tokens[2] should be "(" for inner params
    const inner = tokens.slice(2, outerClose);
    if (inner[0] !== "(") {
      throw new Error(
        `NOT VERIFIABLE: Only sum-pattern .reduce() is supported:\n` +
        `  items.reduce((acc, item) => acc + item.field, 0)\n` +
        `Expected arrow function parameters.`
      );
    }

    // Find inner param close paren
    let innerClose = -1;
    d = 0;
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === "(") d++;
      else if (inner[i] === ")") { d--; if (d === 0) { innerClose = i; break; } }
    }

    // Parse params: (acc, item) => ...
    const paramTokens = inner.slice(1, innerClose); // acc , item
    const arrowIdx = innerClose + 1;
    if (inner[arrowIdx] !== "=>") {
      throw new Error(
        `NOT VERIFIABLE: Only sum-pattern .reduce() is supported:\n` +
        `  items.reduce((acc, item) => acc + item.field, 0)\n` +
        `Expected '=>' after parameters.`
      );
    }

    const accName = paramTokens[0]; // accumulator variable name
    const itemName = paramTokens[2]; // item variable name

    // Body is everything after => until the last comma (initial value)
    const bodyAndInit = inner.slice(arrowIdx + 1);
    // Find the last comma at depth 0 — separates body from initial value
    let lastComma = -1;
    d = 0;
    for (let i = 0; i < bodyAndInit.length; i++) {
      if (bodyAndInit[i] === "(") d++;
      else if (bodyAndInit[i] === ")") d--;
      else if (bodyAndInit[i] === "," && d === 0) lastComma = i;
    }
    if (lastComma === -1) {
      throw new Error(
        `NOT VERIFIABLE: .reduce() requires an initial value:\n` +
        `  items.reduce((acc, item) => acc + item.field, 0)`
      );
    }

    const bodyTokens = bodyAndInit.slice(0, lastComma);
    const initTokens = bodyAndInit.slice(lastComma + 1);

    // Validate initial value is 0
    if (initTokens.length !== 1 || initTokens[0] !== "0") {
      throw new Error(
        `NOT VERIFIABLE: Only sum-pattern .reduce() with initial value 0 is supported:\n` +
        `  items.reduce((acc, item) => acc + item.field, 0)\n` +
        `Found initial value: '${initTokens.join(" ")}'. Other reduce patterns cannot be formally verified.`
      );
    }

    // Validate body starts with acc + ... (sum accumulator pattern)
    if (bodyTokens[0] !== accName || bodyTokens[1] !== "+") {
      throw new Error(
        `NOT VERIFIABLE: Only sum-pattern .reduce() is supported:\n` +
        `  items.reduce((${accName}, ${itemName}) => ${accName} + expr, 0)\n` +
        `Body must start with '${accName} + ...'. Found: '${bodyTokens.join(" ")}'.`
      );
    }

    // Parse the per-item expression (everything after "acc +")
    // Replace item.field references with bare field names (item-scoped)
    const itemBody = bodyTokens.slice(2).map(t => {
      if (t.startsWith(itemName + ".")) return t.slice(itemName.length + 1);
      return t;
    });
    const body = parseArithExpr(itemBody, root, paramNames);

    return { sum: { collection: collName, body } };
  }

  // .reduce() that didn't match the sum pattern
  if (tokens.some(t => t.endsWith(".reduce"))) {
    throw new Error(
      `NOT VERIFIABLE: Only sum-pattern .reduce() is supported:\n` +
      `  items.reduce((acc, item) => acc + item.field, 0)\n` +
      `Other reduce patterns cannot be formally verified.`
    );
  }

  // Single token: literal or field reference
  if (tokens.length === 1) {
    return parseSimpleExpr(tokens[0], root, paramNames);
  }

  // Parenthesized expression: (expr)
  if (tokens[0] === "(" && tokens[tokens.length - 1] === ")") {
    // Verify the close paren at the end matches the open paren at the start
    let d = 0;
    let closesAtEnd = false;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] === "(") d++;
      else if (tokens[i] === ")") {
        d--;
        if (d === 0) {
          closesAtEnd = (i === tokens.length - 1);
          break;
        }
      }
    }
    if (closesAtEnd) {
      return parseFunExpr(tokens.slice(1, -1), root, paramNames);
    }
  }

  throw new Error(
    `REWRITE: Cannot parse expression '${tokens.join(" ")}'. ` +
    `Supported: field references (${root}.field), numbers, ` +
    `arithmetic (a + b * c), ternary (cond ? a : b), ` +
    `rounding (Math.floor/ceil/round), sum (items.reduce((a, i) => a + i.f, 0)), ` +
    `and parenthesized expressions.`
  );
}

// ============================================================
// Signature parser
// ============================================================

interface ParsedParam {
  name: string;
  type: string;
}

function splitOnComma(tokens: string[]): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  for (const t of tokens) {
    if (t === ",") {
      groups.push(current);
      current = [];
    } else {
      current.push(t);
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function parseParams(tokens: string[]): ParsedParam[] {
  const groups = splitOnComma(tokens);
  return groups.map((group) => {
    if (group.length === 3 && group[1] === ":") {
      return { name: group[0], type: group[2] };
    }
    throw new Error(
      `REWRITE: Cannot parse parameter '${group.join(" ")}'. Each parameter needs a type annotation: 'name: Type'.`
    );
  });
}

// ============================================================
// Body parser
// ============================================================

function findMatchingBrace(tokens: string[], startIdx: number): number {
  let depth = 0;
  for (let i = startIdx; i < tokens.length; i++) {
    if (tokens[i] === "{") depth++;
    else if (tokens[i] === "}") {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

/**
 * Split field assignments at top-level commas (respecting nested ternaries).
 */
function splitFieldAssigns(tokens: string[]): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  let depth = 0;

  for (const t of tokens) {
    if (t === "(" || t === "{") depth++;
    else if (t === ")" || t === "}") depth--;
    else if (t === "?" ) depth++;
    else if (t === ":" && depth > 0 && current.some(c => c === "?")) {
      // This colon belongs to a ternary, not a field separator
      current.push(t);
      depth--;
      continue;
    }

    if (t === "," && depth === 0) {
      groups.push(current);
      current = [];
    } else {
      current.push(t);
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function parseFieldAssigns(
  tokens: string[],
  root: string,
  constMap?: Map<string, string[]>,
  paramNames: string[] = [],
): FieldAssign[] {
  if (tokens.length === 0) return [];

  const groups = splitFieldAssigns(tokens);
  return groups.map((group) => {
    if (group.length < 3 || group[1] !== ":") {
      throw new Error(
        `REWRITE: Cannot parse field assignment '${group.join(" ")}'. Expected: 'fieldName: expression'.`
      );
    }
    const fieldName = group[0];
    let exprTokens = group.slice(2);
    // Apply const substitutions only to expression tokens, not the field name
    if (constMap && constMap.size > 0) {
      exprTokens = applyConstSubstitutions(exprTokens, constMap);
    }
    const expr = parseFunExpr(exprTokens, root, paramNames);
    return { fieldName, value: expr };
  });
}

// ============================================================
// Field collection
// ============================================================

function collectExprFields(expr: Expr): string[] {
  if ("lit" in expr) return [];
  if ("field" in expr) {
    const ref = expr.field;
    if ("qualifier" in ref) return [ref.qualifier + "-" + ref.name];
    return [ref.name];
  }
  if ("arith" in expr) {
    return [
      ...collectExprFields(expr.arith.left),
      ...collectExprFields(expr.arith.right),
    ];
  }
  if ("ite" in expr) {
    return [
      ...collectBoolExprFields(expr.ite.cond),
      ...collectExprFields(expr.ite.then),
      ...collectExprFields(expr.ite.else),
    ];
  }
  if ("round" in expr) {
    return collectExprFields(expr.round.expr);
  }
  if ("sum" in expr) {
    // Sum body fields are item-scoped — not input fields. Skip them.
    return [];
  }
  return [];
}

function collectBoolExprFields(expr: BoolExpr): string[] {
  if ("cmp" in expr) {
    return [
      ...collectExprFields(expr.cmp.left),
      ...collectExprFields(expr.cmp.right),
    ];
  }
  if ("logic" in expr) {
    return [
      ...collectBoolExprFields(expr.logic.left),
      ...collectBoolExprFields(expr.logic.right),
    ];
  }
  if ("not" in expr) {
    return collectBoolExprFields(expr.not);
  }
  if ("isPresent" in expr) {
    const ref = expr.isPresent;
    if ("qualifier" in ref) return [ref.qualifier + "-" + ref.name];
    return [ref.name];
  }
  return [];
}

/** Collect field names that appear in isPresent checks (optional fields). */
function collectOptionalFields(expr: Expr): string[] {
  if ("ite" in expr) {
    const fromCond = collectOptionalFieldsFromBool(expr.ite.cond);
    return [...fromCond, ...collectOptionalFields(expr.ite.then), ...collectOptionalFields(expr.ite.else)];
  }
  if ("arith" in expr) {
    return [...collectOptionalFields(expr.arith.left), ...collectOptionalFields(expr.arith.right)];
  }
  if ("round" in expr) return collectOptionalFields(expr.round.expr);
  if ("sum" in expr) return collectOptionalFields(expr.sum.body);
  return [];
}

function collectOptionalFieldsFromBool(expr: BoolExpr): string[] {
  if ("isPresent" in expr) {
    const ref = expr.isPresent;
    return ["qualifier" in ref ? ref.qualifier + "-" + ref.name : ref.name];
  }
  if ("logic" in expr) {
    return [...collectOptionalFieldsFromBool(expr.logic.left), ...collectOptionalFieldsFromBool(expr.logic.right)];
  }
  if ("not" in expr) return collectOptionalFieldsFromBool(expr.not);
  if ("cmp" in expr) return [...collectOptionalFields(expr.cmp.left), ...collectOptionalFields(expr.cmp.right)];
  return [];
}

// ============================================================
// Const inlining
// ============================================================

/**
 * Collect const declarations from tokens between startIdx and endIdx.
 * Returns a map of name → expression tokens.
 * Handles chained consts: const a = x + 1; const b = a * 2;
 * Each const's expression has earlier const references already substituted.
 */
function collectConsts(
  tokens: string[],
  startIdx: number,
  endIdx: number,
): Map<string, string[]> {
  const constMap = new Map<string, string[]>();
  let i = startIdx;

  while (i < endIdx) {
    if (tokens[i] === "const") {
      const name = tokens[i + 1];
      if (!name || tokens[i + 2] !== "=") {
        throw new Error(
          `REWRITE: Malformed const declaration. Expected: 'const name = expression;'.`
        );
      }
      // Find the semicolon (respecting nested parens/braces)
      let semiIdx = i + 3;
      let depth = 0;
      while (semiIdx < endIdx) {
        if (tokens[semiIdx] === "(" || tokens[semiIdx] === "{") depth++;
        else if (tokens[semiIdx] === ")" || tokens[semiIdx] === "}") depth--;
        else if (tokens[semiIdx] === ";" && depth === 0) break;
        semiIdx++;
      }
      if (semiIdx >= endIdx) {
        throw new Error(
          `REWRITE: const '${name}' is missing a semicolon. Add ';' after the expression.`
        );
      }
      const exprTokens = tokens.slice(i + 3, semiIdx);
      // Substitute earlier consts in this expression
      const substituted = applyConstSubstitutions(exprTokens, constMap);
      constMap.set(name, substituted);
      i = semiIdx + 1;
    } else {
      i++;
    }
  }

  return constMap;
}

/**
 * Replace identifier tokens that match const names with their expression tokens,
 * wrapped in parentheses for safe precedence.
 */
function applyConstSubstitutions(
  tokens: string[],
  constMap: Map<string, string[]>,
): string[] {
  const result: string[] = [];
  for (const t of tokens) {
    const expansion = constMap.get(t);
    if (expansion) {
      // Wrap in parens to preserve precedence after inlining
      result.push("(", ...expansion, ")");
    } else {
      result.push(t);
    }
  }
  return result;
}

// ============================================================
// Guard clause extraction (if/else → ite lowering)
// ============================================================

/**
 * Find the matching close paren for an open paren at `openIdx`.
 */
function findMatchingParen(tokens: string[], openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < tokens.length; i++) {
    if (tokens[i] === "(") depth++;
    else if (tokens[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

interface GuardClause {
  condTokens: string[];
  /** If non-empty, this guard returns with field modifications (Pattern B). */
  assigns: FieldAssign[];
}

interface BodyAnalysis {
  guards: GuardClause[];
  mainReturnIdx: number;
  /** True if the main (unconditional) return is just `return INPUT` with no modifications. */
  mainReturnsUnchanged: boolean;
}

/**
 * Analyze the function body for guard clauses.
 * Handles:
 *   Pattern A: if (cond) return input;  ... return { ...input, field: expr };
 *   Pattern B: if (cond) return { ...input, field: expr }; return input;
 *   Chained:   if (c1) return input; if (c2) return input; return { ...input, ... };
 */
function analyzeBody(
  tokens: string[],
  startIdx: number,
  endIdx: number,
  inputName: string,
  paramNames: string[] = [],
): BodyAnalysis {
  const guards: GuardClause[] = [];
  let i = startIdx;

  while (i < endIdx) {
    // Skip const declarations (already collected)
    if (tokens[i] === "const") {
      while (i < endIdx && tokens[i] !== ";") i++;
      i++; // skip ;
      continue;
    }

    // Skip 'else' keyword (treat as sequential)
    if (tokens[i] === "else") {
      i++;
      continue;
    }

    if (tokens[i] === "if") {
      // Extract condition: if ( COND )
      const parenOpen = i + 1;
      if (tokens[parenOpen] !== "(") {
        throw new Error(
          `REWRITE: Expected '(' after 'if'. ` +
          `Use: if (condition) return input; or if (condition) return { ...input, field: expr };`
        );
      }
      const parenClose = findMatchingParen(tokens, parenOpen);
      if (parenClose === -1) {
        throw new Error(`REWRITE: Unmatched '(' in if condition. Check that every '(' has a matching ')'.`);
      }
      const condTokens = tokens.slice(parenOpen + 1, parenClose);

      // Find the return after the condition (skip optional { )
      let retIdx = parenClose + 1;
      const hasBlock = tokens[retIdx] === "{";
      if (hasBlock) retIdx++;

      if (tokens[retIdx] !== "return") {
        throw new Error(
          `REWRITE: if-body must return a value — mutation is not supported. Rewrite as:\n` +
          `  if (cond) return ${inputName};  // guard: return unchanged\n` +
          `  — or —\n` +
          `  if (cond) return { ...${inputName}, field: expr };  // conditional modification`
        );
      }

      // What does this return?
      const afterReturn = retIdx + 1;
      if (tokens[afterReturn] === inputName && (tokens[afterReturn + 1] === ";" || tokens[afterReturn + 1] === "}")) {
        // Guard clause: return input unchanged
        guards.push({ condTokens, assigns: [] });
      } else if (tokens[afterReturn] === "{") {
        // Conditional return with modifications: return { ...input, field: expr }
        const objClose = findMatchingBrace(tokens, afterReturn + 1);
        const inner = tokens.slice(afterReturn + 1, objClose);
        // Validate spread
        if (inner[0] !== "..." || inner[1] !== inputName) {
          throw new Error(
            `REWRITE: Conditional return must spread the input parameter. Change to:\n` +
            `  return { ...${inputName}, field: expr };`
          );
        }
        let assignToks = inner.slice(2);
        if (assignToks[0] === ",") assignToks = assignToks.slice(1);
        const branchAssigns = parseFieldAssigns(assignToks, inputName, undefined, paramNames);
        guards.push({ condTokens, assigns: branchAssigns });
      } else {
        throw new Error(
          `REWRITE: if-body returns something unexpected. Must be one of:\n` +
          `  return ${inputName};                          // return unchanged\n` +
          `  return { ...${inputName}, field: expr };      // return with modifications`
        );
      }

      // Advance past the if-body
      // Find the ; that ends this return (at appropriate depth)
      let depth = 0;
      while (retIdx < endIdx) {
        if (tokens[retIdx] === "{") depth++;
        else if (tokens[retIdx] === "}") {
          depth--;
          if (hasBlock && depth < 0) { retIdx++; break; }
        }
        else if (tokens[retIdx] === ";" && depth === 0) { retIdx++; break; }
        retIdx++;
      }
      if (hasBlock && tokens[retIdx] === "}") retIdx++;
      i = retIdx;
      continue;
    }

    if (tokens[i] === "return") {
      // Unconditional return — this is the main return
      const afterReturn = i + 1;
      const mainReturnsUnchanged =
        tokens[afterReturn] === inputName &&
        (tokens[afterReturn + 1] === ";" || tokens[afterReturn + 1] === "}");

      return { guards, mainReturnIdx: i, mainReturnsUnchanged };
    }

    i++;
  }

  throw new Error(
    `REWRITE: No unconditional return found. Add a final return after all if-guards:\n` +
    `  if (cond) return ${inputName};\n` +
    `  return { ...${inputName}, field: expr };  // ← add this`
  );
}

/**
 * Wrap field assignments with guard conditions.
 * For guard clauses returning unchanged: ite(guard, field(name), expr)
 * For guard clauses returning modified: ite(guard, guardExpr, expr)
 */
function applyGuards(
  mainAssigns: FieldAssign[],
  guards: GuardClause[],
  root: string,
  mainReturnsUnchanged: boolean,
  paramNames: string[] = [],
): FieldAssign[] {
  // Collect all field names across all branches
  const allFieldNames = new Set<string>();
  for (const a of mainAssigns) allFieldNames.add(a.fieldName);
  for (const g of guards) {
    for (const a of g.assigns) allFieldNames.add(a.fieldName);
  }

  // For each field, build nested ite from guards (last guard innermost)
  const result: FieldAssign[] = [];
  for (const fieldName of allFieldNames) {
    const mainAssign = mainAssigns.find((a) => a.fieldName === fieldName);
    // The "else" (innermost) value: main return's expression, or identity if main returns unchanged
    let expr: Expr = mainAssign
      ? mainAssign.value
      : { field: { name: fieldName } };

    // Wrap with guards in reverse order (first guard = outermost ite)
    for (let gi = guards.length - 1; gi >= 0; gi--) {
      const guard = guards[gi];
      const condTokens = guard.condTokens;
      const cond = parseBoolExpr(condTokens, root, paramNames);

      // What does this guard return for this field?
      const guardAssign = guard.assigns.find((a) => a.fieldName === fieldName);
      const guardValue: Expr = guardAssign
        ? guardAssign.value
        : { field: { name: fieldName } }; // guard returns unchanged

      expr = { ite: { cond, then: guardValue, else: expr } };
    }

    result.push({ fieldName, value: expr });
  }

  return result;
}

// ============================================================
// Main parser
// ============================================================

export function parseTS(source: string): AralFn {
  const tokens = joinDotAccess(tokenize(source));

  checkUnsupported(tokens);

  // Find 'function' keyword
  const funIdx = tokens.indexOf("function");
  if (funIdx === -1) throw new Error(
    `REWRITE: Arrow functions and other forms are not supported. Use a function declaration:\n` +
    `  function name(input: Type, ...params): Type {\n` +
    `    return { ...input, field: expr };\n` +
    `  }`
  );

  const funName = tokens[funIdx + 1];
  if (!funName) throw new Error("REWRITE: No function name found. Add a name: 'function myFunction(...'");

  // Find params
  const openParen = tokens.indexOf("(");
  const closeParen = tokens.indexOf(")");
  if (openParen === -1 || closeParen === -1) {
    throw new Error("REWRITE: No parentheses found in function signature. Expected: function name(param: Type): Type");
  }

  const paramTokens = tokens.slice(openParen + 1, closeParen);
  const params = parseParams(paramTokens);

  // Find return type
  const afterParen = tokens.slice(closeParen + 1);
  if (afterParen[0] !== ":" || !afterParen[1]) {
    throw new Error(
      `REWRITE: Missing return type annotation. Add ': Type' after the parameters.\n` +
      `  Before: function f(input: Type, ...)\n` +
      `  After:  function f(input: Type, ...): Type`
    );
  }
  const returnType = afterParen[1];

  // Identify input parameter (matches return type)
  const inputParam = params.find((p) => p.type === returnType);
  if (!inputParam) {
    throw new Error(
      `NOT VERIFIABLE: Function returns '${returnType}' but no parameter has that type. ` +
      `The verifier checks functions that transform a type (e.g., Order → Order). ` +
      `Validation functions (→ boolean) are not yet supported.`
    );
  }
  const extraParams = params.filter((p) => p.name !== inputParam.name);
  const paramNames = extraParams.map((p) => p.name);

  // Find function body
  const bodyOpenIdx = tokens.indexOf("{", closeParen + 1);
  if (bodyOpenIdx === -1) {
    throw new Error("REWRITE: No function body found. Add { } around the function body.");
  }
  const bodyCloseIdx = findMatchingBrace(tokens, bodyOpenIdx + 1);
  if (bodyCloseIdx === -1) {
    throw new Error("REWRITE: Unmatched '{' in function body. Check that every '{' has a matching '}'.");
  }

  // Collect const declarations (scan up to the first return or if)
  const firstReturn = tokens.indexOf("return", bodyOpenIdx);
  const firstIf = tokens.indexOf("if", bodyOpenIdx + 1);
  const constEndIdx = (firstIf !== -1 && firstIf < firstReturn) ? firstIf : firstReturn;
  const constMap = collectConsts(tokens, bodyOpenIdx + 1, constEndIdx);

  // Analyze body for guard clauses
  const body = analyzeBody(tokens, bodyOpenIdx + 1, bodyCloseIdx, inputParam.name, paramNames);
  const { guards, mainReturnIdx, mainReturnsUnchanged } = body;

  // Parse the main (unconditional) return
  let assigns: FieldAssign[];

  if (mainReturnsUnchanged) {
    // Main return is just `return input;` — all modifications are in guards
    assigns = applyGuards([], guards, inputParam.name, true, paramNames);
  } else {
    // Main return has field assignments: return { ...input, field: expr }
    const braceAfterReturn = tokens.indexOf("{", mainReturnIdx + 1);
    if (braceAfterReturn === -1) {
      throw new Error(
        `REWRITE: Return statement must return an object literal. Change to:\n` +
        `  return { ...${inputParam.name}, field: expr };`
      );
    }
    const closeIdx = findMatchingBrace(tokens, braceAfterReturn + 1);
    if (closeIdx === -1) {
      throw new Error("REWRITE: Unmatched '{' in return object. Check that every '{' has a matching '}'.");
    }

    const inner = tokens.slice(braceAfterReturn + 1, closeIdx);

    // Parse spread + assignments
    if (inner[0] !== "..." || !inner[1]) {
      throw new Error(
      `REWRITE: Return must spread the input to preserve unchanged fields. Change to:\n` +
      `  return { ...${inputParam.name}, field: expr };`
    );
    }
    const spreadVar = inner[1];
    let assignTokens = inner.slice(2);
    if (assignTokens[0] === ",") assignTokens = assignTokens.slice(1);

    if (spreadVar !== inputParam.name) {
      throw new Error(
        `REWRITE: Spread must be on '${inputParam.name}', not '${spreadVar}'. Change to:\n` +
        `  return { ...${inputParam.name}, field: expr };`
      );
    }

    const mainAssigns = parseFieldAssigns(assignTokens, inputParam.name, constMap, paramNames);

    if (guards.length > 0) {
      assigns = applyGuards(mainAssigns, guards, inputParam.name, false, paramNames);
    } else {
      assigns = mainAssigns;
    }
  }

  // Derive inputFields and params
  const assignedFields = assigns.map((a) => a.fieldName);
  const referencedFields = assigns.flatMap((a) => collectExprFields(a.value));
  const extraParamNames = extraParams.map((p) => p.name);

  // Collect compound param field names (qualifier-name) from qualified field refs
  const compoundParamFields = referencedFields.filter((f) =>
    extraParams.some((p) => !PRIMITIVE_TYPES.has(p.type) && f.startsWith(p.name + "-"))
  );
  const allParamNames = [...new Set([...extraParamNames, ...compoundParamFields])];

  const inputFields = [...new Set([...assignedFields, ...referencedFields])].filter(
    (f) => !allParamNames.includes(f)
  );

  // Build typedParams for non-primitive typed parameters
  const typedParams = extraParams
    .filter((p) => !PRIMITIVE_TYPES.has(p.type))
    .map((p) => ({ name: p.name, type: p.type }));

  // Collect optional fields (fields appearing in isPresent checks)
  const optionalFields = [...new Set(
    assigns.flatMap((a) => collectOptionalFields(a.value))
  )].filter((f) => inputFields.includes(f));

  const result: AralFn = {
    name: funName,
    inputType: returnType,
    inputFields,
    params: allParamNames,
    assigns,
  };
  if (typedParams.length > 0) {
    result.typedParams = typedParams;
  }
  if (optionalFields.length > 0) {
    result.optionalFields = optionalFields;
  }
  return result;
}
