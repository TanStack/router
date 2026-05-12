# SSR Benchmarks

Cross-framework SSR request-loop benchmarks for:

- `@tanstack/react-start`
- `@tanstack/solid-start`
- `@tanstack/vue-start`

Each benchmark builds a Start app with file-based routes and runs Vitest benches against the built server handler.

## Layout

- `react/` - React Start benchmark + Vitest config
- `solid/` - Solid Start benchmark + Vitest config
- `vue/` - Vue Start benchmark + Vitest config

## Run

Run all benchmarks through Nx so dependency builds are part of the graph:

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/ssr:test:perf --outputStyle=stream --skipRemoteCache
```

Run framework-specific benchmarks:

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/ssr:test:perf:react --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/ssr:test:perf:solid --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/ssr:test:perf:vue --outputStyle=stream --skipRemoteCache
```

Typecheck benchmark sources:

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/ssr:test:types --outputStyle=stream --skipRemoteCache
```
