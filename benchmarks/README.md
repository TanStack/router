# CPU simulation benchmarks

`client-nav` measures navigation in Node/jsdom; `ssr` measures server requests.
Both suites run through the CodSpeed Vitest integration in CPU simulation mode.

## Worker runtime

Every CPU benchmark project includes `cpuSimulationExecArgv()` from
[`cpu-simulation.ts`](./cpu-simulation.ts). It augments CodSpeed's worker flags
only during CPU simulation, including the legacy `instrumentation` mode.

The pinned CodSpeed integration supplies `--no-opt`. In Node 24 this is an alias
for `--no-turbofan`, so Maglev can still optimize and inline hot functions. The
additional `--no-maglev` keeps the optimizing compiler out of the simulation.
The integration also omits the old `--no-scavenge-task` flag on Node 20 and
newer, where V8 renamed it to `--no-minor-gc-task`. Supplying the renamed flag
keeps minor GC tied to allocation pressure instead of scheduled foreground
tasks. Both flags follow the fixes in
[CodSpeed's Node 24 support](https://github.com/CodSpeedHQ/codspeed-node/commit/e3224e7872).

Incremental marking can also schedule tasks with wall-clock completion deadlines
in predictable mode. `--no-incremental-marking-task` keeps marking driven by
allocations while retaining garbage collection. See
[V8's task completion policy](https://github.com/nodejs/node/blob/v24.8.0/deps/v8/src/heap/incremental-marking.cc#L735).

`--initial-old-space-size=512` fixes the initial old-generation budget at 512 MiB.
This avoids growing from V8's small initial budget during warmup, which left
allocation-heavy SSR scenarios sensitive to GC state. It retains allocation-driven
collection and CodSpeed's existing 4096 MiB maximum; it does not preallocate 512
MiB or cap the benchmark's allocation work. In three identical-commit CI runs,
the 18 targeted SSR measurements stayed within 0.26%, compared with outliers over
4% without this flag. Disabling incremental marking entirely was also tested
and rejected because it introduced larger outliers.

The flags are intentionally absent from ordinary Vitest timing and walltime runs.
The regression test in `ssr/cpu-simulation.test.ts` merges the real CodSpeed
plugin configuration and checks the resulting Node worker's optimization trace.

Changing simulation compiler settings changes the measurement baseline. Compare
repeatability within each configuration before interpreting performance changes
between configurations as router improvements or regressions.

## Streaming workload

Deferred payloads in the SSR streaming scenario resolve after two task turns on
Node. A real 1 ms timer lets elapsed host time decide which concurrent requests
resolve together. Counted turns preserve the initial loading render and deferred
payloads; the existing HTML assertions check both. Browser execution keeps the
timer fallback.

## Repeatability checks

The existing `Benchmarks` workflow accepts a `cpu-only` input for manual runs:

```sh
gh workflow run client-nav-benchmarks.yml --ref <branch> -f cpu-only=true
```

Repeat this against the same commit. Manual workflow runs have separate
concurrency groups so one repetition does not replace another queued run.
Check that every repetition has all expected CPU results (currently 132), rather
than inherited results from an earlier run. Compare each benchmark's minimum and maximum across
repetitions; keep input data, navigation/request counts, builds, dependencies and
Node version fixed when testing runtime configuration changes.
