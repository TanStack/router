# Memory Benchmarks

Memory benchmarks are organized as Nx leaf targets. Each leaf target runs one scenario, prints the result to stdout, and writes one isolated result artifact under `results/scenarios/`.

## Run

Run all memory benchmarks:

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/memory:test:memory --outputStyle=stream --skipRemoteCache --parallel=2
```

Run React scenarios:

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/memory:test:memory:react --outputStyle=stream --skipRemoteCache --parallel=2
```

Run one scenario:

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/memory:test:memory:react:client:repeated-navigation --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/memory:test:memory:react:ssr:repeated-requests --outputStyle=stream --skipRemoteCache
```

Tune local run sizes with environment variables:

```bash
MEMORY_BENCH_ITERATIONS=10000 MEMORY_BENCH_WARMUP_ITERATIONS=1000 pnpm nx run @benchmarks/memory:test:memory:react:ssr:repeated-requests
```

## Report

After leaf targets have run, merge isolated scenario artifacts into benchmark-action compatible outputs:

```bash
pnpm nx run @benchmarks/memory:report
```

This writes:

- `benchmarks/memory/results/current.json`
- `benchmarks/memory/results/benchmark-action.json`

## CI

`.github/workflows/memory-benchmarks.yml` runs the React memory benchmark group with Nx parallelism, builds the report, and publishes the main-branch history to GitHub Pages via `benchmark-action/github-action-benchmark`.

The workflow uses a larger run size than quick local smoke tests:

```bash
MEMORY_BENCH_ITERATIONS=2000 MEMORY_BENCH_WARMUP_ITERATIONS=200 MEMORY_BENCH_BATCH_SIZE=100
```

## Initial Scenarios

- `react.client.repeated-navigation`: React Router in Chromium via Playwright.
- `react.ssr.repeated-requests`: React Start SSR in Node.
