export type ArithOp = "add" | "sub" | "mul" | "div";

export type CompOp = "eq" | "neq" | "gt" | "lt" | "gte" | "lte";

export type CAE =
  | { kind: "Lit"; value: number }
  | { kind: "FieldRef"; param: string; field: string }
  | { kind: "ParamRef"; name: string }
  | { kind: "Arith"; op: ArithOp; left: CAE; right: CAE };

export type Predicate =
  | { kind: "Cmp"; op: CompOp; left: CAE; right: CAE };
