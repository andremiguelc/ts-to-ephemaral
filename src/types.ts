/**
 * Aral-fn IR types — mirrors the JSON schema at ephemaral/ir/aral-fn.schema.json
 *
 * These types define the proof boundary: everything before this format is unproved
 * (parsers), everything after is proved correct in Lean 4.
 */

/** Compatible Aral-fn schema version */
export const ARAL_FN_VERSION = "0.1.2";

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
  | { isPresent: FieldRef }
  | { each: { collection: string; body: BoolExpr } };

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
