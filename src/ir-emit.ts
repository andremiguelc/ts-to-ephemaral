import type { CAE } from "./canonical-ast.js";
import type { AralFn, Expr } from "./types.js";
import type { SiteGateResult, TargetResult } from "./subset-gate.js";

export function emitAralFn(result: SiteGateResult): AralFn | null {
  const accepted = result.targets.filter(
    (t): t is Extract<TargetResult, { kind: "accepted" }> => t.kind === "accepted",
  );
  if (accepted.length === 0) return null;

  const site = result.site;
  const fields = accepted.map((a) => a.fieldName);
  return {
    name: synthesizeName(site.signature.name, site.line, fields),
    inputType: site.targetType.name,
    inputFields: fields,
    params: [],
    assigns: accepted.map((a) => ({
      fieldName: a.fieldName,
      value: caeToExpr(a.cae),
    })),
  };
}

export function caeToExpr(cae: CAE): Expr {
  switch (cae.kind) {
    case "Lit":
      return { lit: cae.value };
  }
}

function synthesizeName(
  funcName: string | null,
  line: number,
  fields: string[],
): string {
  const fieldTag = fields.length === 1 ? fields[0] : `${fields.length}fields`;
  if (funcName) return `${funcName}-${fieldTag}`;
  return `anon-l${line}-${fieldTag}`;
}
