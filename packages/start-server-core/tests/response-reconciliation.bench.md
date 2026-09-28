# Response reconciliation benchmarks

Run this local Vitest suite separately from the historical built-app SSR
benchmarks. It does not enable CodSpeed instrumentation:

```sh
CI=1 NX_DAEMON=false pnpm nx run @tanstack/start-server-core:test:perf --outputStyle=stream --skipRemoteCache -- --run
```

These cases call the public Start handler, middleware, and response helpers. Only
the compiler's virtual entry modules and server-function resolver are supplied by
the fixture. Request dispatch, CSRF, serialization, and reconciliation use their
real implementations. Workspace dependencies are built by Nx; this package's
source is loaded through its existing Vitest aliases.

Each case runs assertions before measurement, then dispatches 160 deterministic
GET requests per batch with eight workers and drains every response body. The
cases cover unchanged protocol headers, repairs in two middleware layers, helper
set/append/cookie writes before and after `next()`, and raw responses with three
separate cookies and 0, 4, or 20 extra headers. Each raw size runs with both
unchanged and repaired protocol headers, so an optimization that scans all
headers cannot hide its cost behind the repair cases' early exit.

Copy the same benchmark and config to both revisions for a comparison. Keep the
Node version, V8 flags, batch size, and case names unchanged; compare against the
unoptimized response-reconciliation branch to measure these newly introduced
mechanisms. These focused source benchmarks supplement the production SSR app
suite; they do not replace its cross-framework or CodSpeed results.

Use `--outputJson /tmp/response-baseline.json` and a separate candidate output
file to preserve both runs' timing statistics. Vitest's `--compare` option can
display the saved baseline alongside a candidate run.
