export type CAE =
  | { kind: "Lit"; value: number }
  | { kind: "FieldRef"; param: string; field: string }
  | { kind: "ParamRef"; name: string };
