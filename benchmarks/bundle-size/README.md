# Bundle Size Benchmarks

This workspace contains deterministic bundle-size fixtures for:

- `@tanstack/react-router`
- `@tanstack/solid-router`
- `@tanstack/vue-router`
- `@tanstack/react-start`
- `@tanstack/solid-start`

Each package has `minimal` and `full` scenarios:

- `minimal`: Small route app with `__root` + index route that renders `hello world`
- `full`: Same route shape plus a broad root-level harness that imports/uses the full hooks/components surface
- Start `full` scenarios also exercise `createServerFn`, `createMiddleware`, and `useServerFn`
- Start `deferred-hydration` scenarios match the minimal route shape and wrap the index route content in `Hydrate`

## Design Notes

- Scenarios use file-based routing as the default app style.
- Router scenarios use `@tanstack/router-plugin/vite` with `autoCodeSplitting: true`.
- Start Vite scenarios use `@tanstack/<framework>-start/plugin/vite` with router code-splitting enabled.
- React Start also includes Rsbuild scenarios using `@tanstack/react-start/plugin/rsbuild`.
- Full-surface coverage is manually maintained (no strict export-coverage gate).
- Primary metrics measure all emitted client JS chunks and are reported as raw/gzip/brotli bytes.
- Initial-load JS graph metrics are also recorded as `initialRawBytes`, `initialGzipBytes`, and `initialBrotliBytes` for context.
- Gzip for all emitted client JS is the primary tracking signal for PR deltas and historical charting.

## Local Run

```bash
pnpm benchmark:bundle-size:run
```

Run one or more scenarios during local optimization:

```bash
pnpm benchmark:bundle-size:run --scenario react-router.minimal
pnpm benchmark:bundle-size:run --scenario react-router.minimal,react-router.full
```

The runner calls `measure.mjs`, which builds the selected package projects through Nx. Full runs build the package projects for all scenarios.
The existing `pnpm benchmark:bundle-size` command keeps its CI build graph unchanged.

If the required packages are already built and unchanged, skip that step:

```bash
pnpm benchmark:bundle-size:run --scenario react-router.minimal --skip-package-builds
```

This writes:

- `benchmarks/bundle-size/results/current.json`
- `benchmarks/bundle-size/results/benchmark-action.json`
- `benchmarks/bundle-size/results/measure.log`

`current.json` includes run status, selected package build projects, per-scenario totals, per-file sizes, and the emitted JS files used for measurement. Dist paths use `scenarioDir`/`outDir`, e.g. `react-router.minimal` maps to `benchmarks/bundle-size/dist/react-router-minimal/`.

The runner sets `CI=1` and `NX_DAEMON=false`. Successful runs print log locations and the existing `query` or `diff` summary.
If a step fails, the runner stops with a nonzero exit code. It prints the last 40 log lines, limited to 8,000 characters.
Full stdout and stderr stay in the log files. A positive bundle-size delta does not cause failure.

For agent runs, use `pnpm --silent benchmark:bundle-size:run ...` to omit the package-manager command echo.

## Compare Optimization Candidates

Before you change the implementation, save a named baseline:

```bash
pnpm benchmark:bundle-size:run --name baseline --scenario react-router.minimal,react-router.full
```

After you change the implementation, compare a candidate against that baseline:

```bash
pnpm benchmark:bundle-size:run --name candidate --baseline baseline \
  --scenario react-router.minimal,react-router.full \
  --test-projects @tanstack/router-core,@tanstack/react-router \
  -- tests/path.test.ts tests/link.test.tsx
```

`--test-projects` runs the selected Nx unit-test targets before measurement. Arguments after `--` go only to those tests.
Tests and measurement run sequentially. Failed tests stop the runner before measurement, so old results cannot produce a misleading diff.
Without `--test-projects`, the runner only measures bundles. Type tests, performance benchmarks, and e2e tests remain separate commands.

Named runs store their metrics and logs in `benchmarks/bundle-size/results/runs/<name>/`. Existing named results cannot be overwritten.
Without `--name`, runs replace `current.json` and the logs for the steps they run.
Emitted bundles still use the shared `dist/` directory. To retain emitted bundles for a candidate, pass a separate `--dist-dir`.

`--baseline` accepts a run name or a JSON file path, such as `--baseline ./baseline.json`.
`--results-dir <dir>` changes the results root, including the location of named runs.
Use the same scenario selection and measurement flags for the baseline and candidate.

For command reference, run:

```bash
pnpm benchmark:bundle-size:run --help
```

## Local Query Tools

```bash
pnpm benchmark:bundle-size:query --id react-router.minimal
pnpm benchmark:bundle-size:diff --baseline /tmp/base-current.json --id react-router.minimal
pnpm benchmark:bundle-size:history --id react-router.minimal --top-deltas 20
```

For source attribution, run an analysis build. This uses hidden source maps and writes source estimates into `current.json`; those estimates are for investigation only, not tracking.

```bash
pnpm benchmark:bundle-size:run --scenario react-router.minimal --analysis
pnpm benchmark:bundle-size:analyze --id react-router.minimal --top-sources 30
```

For a named run, pass `--current benchmarks/bundle-size/results/runs/<name>/current.json` to `query`, `diff`, or `analyze`.

## CI Reporting

- PR workflow generates a sticky comment with:
  - current gzip, initial gzip, raw, and Brotli values
  - per-metric deltas from the `main` baseline
  - inline sparkline trend
- Pushes to `main` publish historical chart data to GitHub Pages via `benchmark-action/github-action-benchmark`.

## Manual Update Policy

When router/start public hooks/components evolve, update the corresponding `*-full/src/routes/__root.tsx` harness to keep full scenarios representative.

## Backfill Readiness

The measurement script supports optional interfaces for historical backfilling:

- `--sha`
- `--measured-at`
- `--append-history`
- `--scenario`
- `--analysis`
- `--sourcemap`
- `--skip-package-builds`

These are intended for one-off scripts that replay historical commits and append results to the same history dataset shape used for chart generation.
If `--append-history` points at a `data.js` file, output is written as `window.BENCHMARK_DATA = ...` for direct GitHub Pages compatibility.
