import type { DiagnosticLabel } from "./labels.js";

export type SuggestionBuilder = (declaredName: string) => string;

export const SUGGESTIONS: Record<DiagnosticLabel, SuggestionBuilder | null> = {
  "unsupported-expression": null,
  "unsupported-literal": null,
  "chained-field-access": () =>
    `Bind the intermediate hop to a single-hop \`const\` first ` +
    `(e.g. \`const customer = order.customer; ... customer.id\`).`,
  "unknown-field": null,
  "target-type-not-readable": (name) =>
    `Replace with \`interface ${name} { ... }\` or \`type ${name} = { ... }\` ` +
    `whose members the checker can read.`,
  "target-type-not-declared": (name) =>
    `Add \`interface ${name} { ... }\` or \`type ${name} = ...\` somewhere ` +
    `the parser can read, matching the .aral root prefix.`,
  "any-typed-parameter": () =>
    `Declare the parameter's type. If the value is a number, annotate it as ` +
    `\`number\`; otherwise pick a concrete type so invariants can apply.`,
  "nullable-parameter": () =>
    `Either narrow the value with an \`if\` guard before the assignment, ` +
    `or declare the parameter as strictly \`number\` (drop the \`| null\`, ` +
    `\`| undefined\`, or \`?\`).`,
  "param-not-primitive": () =>
    `Reduce or project the parameter into a single \`number\` first, then ` +
    `assign that scalar.`,
  "reassignable-binding": () =>
    `Change \`let\` or \`var\` to \`const\` so the binding is single-assignment.`,
};

export function suggestionFor(
  label: DiagnosticLabel,
  declaredName: string,
): string | null {
  const build = SUGGESTIONS[label];
  return build ? build(declaredName) : null;
}
