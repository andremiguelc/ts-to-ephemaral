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
  "arith-on-string": null,
  "unsupported-operator": null,
  "cmp-mixed-types": () =>
    `Both sides of a comparison must be the same primitive type. ` +
    `Convert one side first (e.g. parse a string with \`Number(...)\`) ` +
    `before comparing.`,
  "cmp-non-numeric": () =>
    `Ordering comparisons (\`<\`, \`<=\`, \`>\`, \`>=\`) require numeric ` +
    `operands. For booleans use \`===\` to test equality, or branch on the ` +
    `value directly with \`if\`.`,
  "instanceof-operator": () =>
    `Runtime \`instanceof\` checks aren't in the admitted subset. ` +
    `Add a literal \`kind\` field to the type and compare ` +
    `\`x.kind === "..."\` instead.`,
  "in-operator": () =>
    `The \`in\` operator (property presence check) isn't in the admitted ` +
    `subset. Make the field optional in the type and use ` +
    `\`x.field !== undefined\`, or coalesce with \`x.field ?? default\`.`,
  "missing-assert": (declaredName) =>
    `This parameter has no rule limiting its values, so verification ` +
    `can pick any number — including ones that break the field's ` +
    `invariants. Add a one-line guard whose name ends in \`Assert\` ` +
    `and call it just before the assignment. The call throws at runtime ` +
    `on bad input and the parser extracts the predicate so verification ` +
    `knows the value is constrained. The guard only protects callers of ` +
    `this function — bad input from a caller becomes a runtime throw, ` +
    `not a silent invalid output.\n` +
    `Supported shape:\n` +
    `  function fieldAssert(value: number): void {\n` +
    `    if (value < 0) throw new Error("field must be >= 0");\n` +
    `  }\n` +
    `  function setField(input: ${declaredName}, x: number): ${declaredName} {\n` +
    `    fieldAssert(x);\n` +
    `    return { ...input, field: x };\n` +
    `  }`,
  "malformed-assert": () =>
    `A function ending in \`Assert\` was found near this assignment, but ` +
    `its body doesn't match the recognized shape. The body must be a ` +
    `single \`if (predicate) ...\` whose body either throws an Error or ` +
    `calls a helper TypeScript types as \`never\`. A plain \`return\` ` +
    `doesn't qualify — control unwinds to the caller and the assignment ` +
    `still runs with bad data. The predicate must be a single comparison ` +
    `for now (boolean composition like \`||\`/\`&&\` ships next).\n` +
    `Supported shape:\n` +
    `  function fieldAssert(value: number): void {\n` +
    `    if (value < 0) throw new Error("…");\n` +
    `  }`,
  "misplaced-assert": () =>
    `An Assert call exists for this parameter in this function, but the ` +
    `parameter is read or reassigned again between the Assert and this ` +
    `assignment. The post-Assert state has been changed, so the predicate ` +
    `may no longer hold. Either re-assert after the latest use, or bind ` +
    `the new value to a fresh \`const\` and assert that one.\n` +
    `Supported shape:\n` +
    `  const adjusted = x - 100;\n` +
    `  adjustedAssert(adjusted);\n` +
    `  return { ...input, field: adjusted };`,
};

export function suggestionFor(
  label: DiagnosticLabel,
  declaredName: string,
): string | null {
  const build = SUGGESTIONS[label];
  return build ? build(declaredName) : null;
}
