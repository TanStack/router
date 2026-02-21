# Bundle Size Benchmarks

This workspace contains deterministic bundle-size fixtures for:

- `@tanstack/react-router`
- `@tanstack/solid-router`
- `@tanstack/vue-router`
- `@tanstack/react-start`
- `@tanstack/solid-start`

Each package has two scenarios:

- `minimal`: Small route app with `__root` + index route that renders `hello world`
- `full`: Same route shape plus a broad root-level harness that imports/uses the full hooks/components surface
- Start `full` scenarios also exercise `createServerFn`, `createMiddleware`, and `useServerFn`

## Design Notes

- Scenarios use file-based routing as the default app style.
- Router scenarios use `@tanstack/router-plugin/vite` with `autoCodeSplitting: true`.
- Start scenarios use `@tanstack/<framework>-start/plugin/vite` with router code-splitting enabled.
- Full-surface coverage is manually maintained (no strict export-coverage gate).
- Metrics are measured from initial-load JS graph only and reported as raw/gzip/brotli bytes.
- Gzip is the primary tracking signal for PR deltas and historical charting.

## Local Run

```bash
pnpm nx run tanstack-router-e2e-bundle-size:build
```

This writes:

- `e2e/bundle-size/results/current.json`
- `e2e/bundle-size/results/benchmark-action.json`

## CI Reporting

- PR workflow generates a sticky comment with:
  - current gzip values
  - baseline delta
  - inline sparkline trend
- Pushes to `main` publish historical chart data to GitHub Pages via `benchmark-action/github-action-benchmark`.

## Manual Update Policy

When router/start public hooks/components evolve, update the corresponding `*-full/main.tsx` harness to keep full scenarios representative.

## Backfill Readiness

The measurement script supports optional interfaces for historical backfilling:

- `--sha`
- `--measured-at`
- `--append-history`

These are intended for one-off scripts that replay historical commits and append results to the same history dataset shape used for chart generation.
If `--append-history` points at a `data.js` file, output is written as `window.BENCHMARK_DATA = ...` for direct GitHub Pages compatibility.
