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
npx tsx src/extract.ts <file.aral> --tsconfig <path/to/tsconfig.json>
```

This scans the project for every assignment to the type and fields declared in the `.aral` file, extracts each expression, and writes `.aral-fn.json` files to `.ephemaral/parsed/<aral-name>/`.

Then verify each with ephemaral:

```bash
.ephemaral/bin/ephemaral .ephemaral/parsed/payment/site-abc123-amount.aral-fn.json .ephemaral/rules/payment.aral
```

### Output

The CLI prints a coverage report grouped by field:

```
ephemaral extract · payment.aral → Payment

  amount
    ✓ stripe-PaymentService.ts :: createPayment
    ⚠ hitpay-PaymentService.ts :: createPayment (1 unconstrained: __unk_0)

  fee
    ✓ stripe-PaymentService.ts :: createPayment

Results:  3 extracted  ·  2 full  ·  1 with gaps  ·  3 total
Output:   .ephemaral/parsed/payment/
```

- **✓** — fully extracted, all sub-expressions resolved
- **⚠** — extracted with unconstrained gaps (names the params)

## Running tests

```bash
pip install pytest
pytest tests/ -v
```

## Branches

- `expression-level` — current development (expression-level extraction)
- `main` — previous function-level parser (preserved, no longer active)

## License

Apache-2.0 — see [LICENSE](LICENSE).
