# ts-to-ephemaral

TypeScript parser for [ephemaral](https://github.com/andremiguelc/ephemaral) verification.

## Status — under refactor

The parser is being rebuilt as a six-stage pipeline. The legacy v0.3.x extractor is archived in [legacy/](legacy/) as static reference; the new pipeline is being assembled stage-by-stage. **The CLI currently throws "not implemented" for every input** — that is intentional.

For the current state of the refactor and the staged plan, see the parser refactor roadmap at [`../roadmap/parser-refactor/INDEX.md`](../roadmap/parser-refactor/INDEX.md).

## Eventual usage

Once the refactor lands the CLI will read an `.aral` invariant file, scan a TypeScript codebase for assignments to the declared fields, and emit one [Aral-fn JSON](https://github.com/andremiguelc/ephemaral/blob/main/ir/README.md) per site:

```bash
npx tsx src/extract.ts <file.aral> --tsconfig <path/to/tsconfig.json> [--out <dir>]
```

## Install

```bash
git clone https://github.com/andremiguelc/ts-to-ephemaral.git
cd ts-to-ephemaral
npm install
```

## Running tests

```bash
npm test               # all tests (unit + scaffolding)
npm run test:unit      # surviving unit tests
npm run test:scaffolding   # invariants for the in-progress refactor
npm run typecheck      # tsc --noEmit
```

## License

Apache-2.0 — see [LICENSE](LICENSE).
