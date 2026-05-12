export type DiagnosticLabel =
  | "unsupported-expression"
  | "unsupported-literal"
  | "chained-field-access"
  | "unknown-field"
  | "target-type-not-readable"
  | "target-type-not-declared"
  | "any-typed-parameter"
  | "nullable-parameter"
  | "param-not-primitive"
  | "reassignable-binding"
  | "arith-on-string"
  | "unsupported-operator";
