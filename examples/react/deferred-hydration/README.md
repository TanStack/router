# Deferred Hydration Chart Benchmark

This example is a reproducible lab for the TanStack Start deferred hydration
guide. It compares a fully hydrated below-the-fold Recharts widget against
several `<Hydrate>` strategies while sweeping chart data size and Chrome CPU
slowdown.

```sh
pnpm --dir examples/react/deferred-hydration build
pnpm --dir examples/react/deferred-hydration bench -- --runs 3 --points 200 --cpu-slowdown 1,4
```

The default benchmark uses the primary matrix: four routes, three point counts
(`200`, `1000`, `3000`), three CPU slowdown rates (`1`, `4`, `6`), and cold
cache. Use `--runs 1000` when collecting final numbers for publication.

The app is served with `srvx` in production mode for tests and benchmark runs.
The report keeps gzip and brotli separate:

- gzip is an estimate from the built assets and is useful for conventional
  bundle-size comparisons.
- brotli is an estimate from the same assets and better matches what many modern
  static servers, including `srvx`, can serve.
- encoded body and transfer bytes come from Chrome Resource Timing, so they
  reflect the server, cache mode, and browser behavior for that run.

Useful presets:

```sh
pnpm bench -- --suite primary --runs 100
pnpm bench -- --suite validation --runs 100
pnpm bench -- --points 200 --cpu-slowdown 1,4 --routes full,defer-visible --runs 3
```

Outputs are written to `bench-results/`:

- `samples.json` has every raw run.
- `samples.csv` is spreadsheet-friendly.
- `samples.partial.ndjson` and `samples.partial.csv` are appended after every
  completed run so long benchmark passes still leave useful data if interrupted.
- `summary.md` is ready to paste into a draft.
- `traces/` contains sample Chrome trace JSON files when tracing is enabled.

`shellInpMs` is the scripted INP-style latency for the hydrated button above the
fold. `chartInpMs` is the scripted latency for a chart-local button after the
chart has hydrated. `triggerLatencyMs` is separate: it measures scroll-to-chart
ready time for deferred routes.
