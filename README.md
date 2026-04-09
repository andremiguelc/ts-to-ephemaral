# ts-to-ephemaral

Expression-level extractor for [ephemaral](https://github.com/andremiguelc/ephemaral) verification. Reads `.aral` invariant files, searches a TypeScript codebase for assignments to the declared fields, and produces [Aral-fn JSON](https://github.com/andremiguelc/ephemaral/blob/main/ir/README.md) for each site.

## Prerequisites

- The target TypeScript project must have **`node_modules` installed** — the TS compiler API needs it for type resolution across files and packages.
- The project must have a **`tsconfig.json`** — tells the compiler which files to include and how to resolve imports.

## Install

```bash
git clone https://github.com/andremiguelc/ts-to-ephemaral.git
cd ts-to-ephemaral
pnpm install
```

## Usage

```bash
npx tsx src/extract.ts <file.aral> --tsconfig <path/to/tsconfig.json> [--out <dir>]
```

- `<file.aral>` — path to the `.aral` invariant file
- `--tsconfig` — path to the target project's `tsconfig.json`
- `--out` — output directory for `.aral-fn.json` files (default: `.ephemaral/parsed/<aral-name>/`)

This scans the project for every assignment to the type and fields declared in the `.aral` file, extracts each expression, and writes one `.aral-fn.json` per assignment site.

Then verify with ephemaral:

```bash
ephemaral .ephemaral/parsed/<name>/<site>.aral-fn.json <name>.aral
```

### Output

The CLI prints a coverage report grouped by field:

```
ephemaral extract · <name>.aral → <Type>

  fieldA
    ✓ module-ServiceA.ts :: computeResult
    ⚠ module-ServiceB.ts :: computeResult (1 unconstrained: __unk_0)

  fieldB
    ✓ module-ServiceA.ts :: computeResult

Results:  3 extracted  ·  2 full  ·  1 with gaps  ·  3 total
Output:   .ephemaral/parsed/<name>/
```

- **✓** — fully extracted, all sub-expressions resolved
- **⚠** — extracted with unconstrained gaps (names the params)

## Running tests

```bash
npm test
```

## License

Apache-2.0 — see [LICENSE](LICENSE).
