export type ArithOp = "add" | "sub" | "mul" | "div";

export type CAE =
  | { kind: "Lit"; value: number }
  | { kind: "FieldRef"; param: string; field: string }
  | { kind: "ParamRef"; name: string }
  | { kind: "Arith"; op: ArithOp; left: CAE; right: CAE };
