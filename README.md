# ts-to-ephemaral

Parses TypeScript functions into [Aral-fn JSON](https://github.com/andremiguelc/ephemaral/blob/main/ir/README.md) for [ephemaral](https://github.com/andremiguelc/ephemaral) verification.

The parser reads a TypeScript function declaration and produces a structured JSON representation that ephemaral can formally verify against business rule invariants.

## Install

```bash
git clone https://github.com/andremiguelc/ts-to-ephemaral.git
cd ts-to-ephemaral
pnpm install
```

## Usage

```bash
npx tsx src/index.ts path/to/function.ts
```

Output goes to stdout as JSON. Pipe it to a file:

```bash
npx tsx src/index.ts myFunction.ts > .ephemaral/parsed/myFunction.aral-fn.json
```

Then verify with ephemaral:

```bash
.ephemaral/bin/ephemaral .ephemaral/parsed/myFunction.aral-fn.json .ephemaral/rules/myType.aral
```

## One function per file

The parser expects exactly one function declaration per source file. In real codebases, extract the target function into a temporary file before parsing.

## Supported patterns

Functions must take and return the same type, using spread-and-override to update fields:

```typescript
function updateRecord(input: MyType, value: number): MyType {
  if (value <= 0) return input;
  return { ...input, field: input.field - value };
}
```

### What works

- **Simple assignment** — spread input, override specific fields
- **Guard clauses** — early returns that preserve input unchanged
- **Chained guards** — multiple guard-return statements
- **Immutable bindings** — `const` intermediate values (auto-inlined)
- **Conditional expressions** — ternary operators
- **Arithmetic** — `+`, `-`, `*`, `/` with correct precedence
- **Rounding** — `Math.floor()`, `Math.ceil()`, `Math.round()`
- **Comparisons and boolean logic** — `>`, `>=`, `<`, `<=`, `==`, `!=`, `&&`, `||`, `!`
- **Null coalescing** — `field ?? default` (lowered to presence check)
- **Typed parameter access** — `param.field` with dot notation

### What doesn't work

**REWRITE errors** — restructure the function:
- Lambdas, closures, class methods (use standalone function declarations)
- Mutable variables (use `const`)
- Exception throwing (use guard-return pattern)
- Missing return type annotation
- Nested field access deeper than one level

**NOT VERIFIABLE errors** — fundamental limitations:
- Collection operations (reduce, map, filter)
- Index operations (bracket access)
- Boolean-returning functions (must return same type as input)

## Error messages

Errors have two prefixes:

- **`REWRITE:`** — the function's structure doesn't fit the supported pattern, but it can be restructured. The message shows what to change.
- **`NOT VERIFIABLE:`** — the function uses a pattern that can't be represented in the verification IR. The message suggests a workaround (usually: extract the unsupported part as a parameter).

## Running tests

```bash
pip install pytest
pytest tests/ -v
```

## License

Apache-2.0 — see [LICENSE](LICENSE).
