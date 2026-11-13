# Compiler test harness

Shared by the compiler test suites of router-generator, router-plugin, start-plugin-core, react-start-rsc and this
package. What the suite is and how to read it: [oracle/README.md](oracle/README.md). The contract the tests cite:
[oracle/SPEC.md](oracle/SPEC.md).

## Hard rules

- Real tools only: real Vite, Rsbuild, Rspack and webpack builds and dev servers, the framework's own plugin, the
  real HMR client and renderer. Never copy a tool's logic into a test.
- Reach a compiler only through public entry points: the plugins and options a user configures. No compiler
  internals, module ids, queries, generated names, printed code or chunk layout.
- Client code runs in a real browser (`runClient`, `runInPage`, `openPage`); server code in Node, inside real requests
  through Start's server entry. No jsdom, no fake `window` or `import.meta.hot`.
- No tests of the helpers' internals; this package's own tests are controls of the harness.
- Tests never write into the repository. Apps live in the run's temp dir (`./app-directory`); checked-in fixtures run
  on a copy (router-generator `copyFixture`).
- Diagnostics are checked by severity, file and position only, never by wording, except a test whose subject is text the
  docs quote verbatim.
- Edits settle on their outcome within one bound, never on counts of events, compiles or updates.
- No generated or seeded tests in the repository, not even behind a local target: every input is written out in the
  test. A generator (random modules, seeded schedules, fuzzing) is a development tool kept outside the repository;
  each case it finds becomes a static test that names its source.

## Helpers

- `./plugin-host` (`createPluginHost`): the public Vite plugins on a real Vite dev server (server code through the
  environment's module runner, client code in the browser) and `vite build`.
- `./rsbuild-plugin-host` (`createRsbuildPluginHost`): the same through Rsbuild's JavaScript API.
- `./build-harness`: real builds (Vite, Rsbuild, Rspack, webpack), with provenance of emitted modules and the
  dangling-name check (SPEC G8).
- `./dev-server`, `./rsbuild-dev-server`: dev servers on a temp app with `edit`/`settle`; `closeViteServer`.
- `./browser`: Chromium pages; `runInPage` (bounded run pages, a fresh document per run), `openPage`.
- `./hmr-sync` (`settlePage`): whether a page reloaded or updated in place, told by the page;
  `errorsOutsideReloads`: a page's errors but for a document's after Vite announced its reload.
- `./outcome` (`waitForOutcome`): wait for an edit's outcome within one bound.
- `./diagnostic-channel`, `./diagnostics` (`expectDiagnostic`, `expectNoProblems`): every reporting channel merged;
  checks by severity, file and position.
- `./importers` (`loadMarker`, `loadedModulesExpression`, `expectNotLoaded`): load markers.
- `./free-names`, `./known-globals`: a module's free names (Yuku), minus the environment's globals.
- `./global-trap`: trap a page's dev-only globals (SPEC G7).
- `./source-maps`: map assertions through `@jridgewell/trace-mapping`.
- `./determinism`: compare builds across roots and orders (SPEC G4).
- `./dead-code-shapes`: the dependency shapes every removal runs through (SPEC G16); inputs, no judging logic.
- `./app-directory` (`createAppDirectory`, `servedDirectories`): temp app directories that resolve like the package.
- `./run-directory` (Vitest `globalSetup`): the run's temp dir (apps, generator temp files, Node's compile cache), removed
  when the run ends.
- `./test-scope` (`currentTest`, `onTestFinished`) with `./test-scope-setup` (`setupFiles`): per-test resources in
  concurrent files.
- `./pins` (`runPins`) with `./pins-setup` (`setupFiles`): `COMPILER_TESTS_PINS=run` runs every known-bug pin as an
  ordinary test; the shared reporter lists the pins that passed.
- `./workspace-packages`: link built `@tanstack/*` packages into test apps (not declared, to avoid Nx cycles).
- `./run-node`: run built output in a child Node.
- `./time-sequencer` (`timeSequencer`, `test.sequence.sequencer`): split `--shard` runs by stored file times.

Package hosts build on these: router-plugin `tests/route-app.ts` (`loadRoute`), start-plugin-core
`tests/start-host.ts` (`useStartHost`). Start apps use `tanstackStart()` of the built framework package
(`tests/start-plugins.ts`), entries only through `client.entry`/`server.entry`.

## Running

```sh
CI=1 NX_DAEMON=false pnpm nx run @tanstack/router-plugin:test:unit --outputStyle=stream --skipRemoteCache -- tests/code-splitter-scope.test.ts -t "unlike computed keys"
```

- The whole oracle (this package's tests, the harness controls, are not part of it): the commands of
  [oracle/README.md](oracle/README.md): one build, then its targets at once in two phases.
- Always through Nx, one command at a time (the whole oracle's test commands excepted: they build nothing). A file path
  is a substring filter.
- 4 workers by default (`maxWorkers` in each `vite.config.ts`).
- No `|` inside `-t`; run one command per filter.
- `--skip-nx-cache` only for measurements.
- In router-plugin and start-plugin-core, Nx's `test:integration` runs the tier as shards
  (`test:integration--shard-<i>-of-<n>`, Vitest `--shard`), one after another on a machine and spread over CI's agents;
  each shard is cached on its own. `test:integration:whole` runs the tier in one Vitest run: use it for a file filter
  (`-- tests/integration/foo.test.ts`; `test:integration` ignores arguments) and for per-file time measurements.
  The shards split by each file's CI time (`./time-sequencer`, weights in `tests/integration/file-times.json`: the
  seconds of a green PR run's shard outputs, Vitest's line per file); a file without a time counts as the median.
  Refresh the weights when the longest CI shard drifts well above the others.
- Slow tier: at most two `test:integration` runs on the machine at once:
  `until [ "$(pgrep -fc '[v]itest --project integration')" -lt 2 ]; do sleep 30; done`. A whole-oracle run takes the
  machine: start it when none runs (`-lt 1`).
- Tiers: `test:unit` (in process, the inner loop); `test:integration` (`tests/integration/`: real builds, dev servers,
  browser pages; `tests/integration/pages/` is the `integration-pages` project). `integration` projects keep modules
  across files (`isolate: false`): a file leaves nothing behind but what the harness owns. A file that reads
  process-global state (`compilerStats()`) runs in a process of its own (start-plugin-core `integration-alone`):
  Vite 8 keeps the plugins of every finished build and closed server alive.
- Those files share one heap, and it only grows: everything a Vite plugin reaches stays for the rest of the process, and
  native bundler callbacks keep the async contexts they were created in. So what a harness scope or plugin holds is
  released when its work ends (a stopped sink, a closed channel, a finished test, a checked recording), however the
  plugin itself lives on. To measure the slow tier's heap, give the worker the limit through `test.execArgv` in the
  config (Vitest's `--execArgv` flag did not reach the workers) and read `v8.getHeapStatistics().heap_size_limit` in
  the worker.

## Budgets

`test-budgets.json`: 15 s per slow-tier file and 10 s from edit to result for one fast-tier file, at 4 workers. Whole
tiers have no budget: CI's shard times are the number that costs (a file over 15 s is what makes a shard uneven).
`src/budget-reporter.ts` reports after every run (each tier's time, the slowest slow-tier file). To enforce the limits,
run on a quiet machine (1-minute load below 4, no other test run):

```sh
COMPILER_TEST_BUDGETS=strict CI=1 NX_DAEMON=false pnpm nx run <project>:test:integration:whole --outputStyle=stream --skipRemoteCache --skip-nx-cache
```

(`test:integration:whole` where the package has CI shards, `test:integration` elsewhere.) A run with a failed test or
file is not a measurement. A file over the limit is fixed (shared hosts, bounded pages, moving page tests to
`integration-pages`, or split by test into files of its own), not exempted.

## Setup facts

- Framework packages and tools are test-only devDependencies (`solid-js`, `vite-plugin-solid`, `@rsbuild/plugin-react`,
  `@rsbuild/plugin-solid` ≥ 1.2.2, `@vitejs/plugin-react`, `@vitejs/plugin-vue`, …).
- The integration targets build `@tanstack/react-start` first (linked at test time).
- `@tanstack/compiler-vite-versions` (private, test-only) holds the other Vite majors the router plugin supports as
  aliased packages (`vite6`, `vite7`) for router-plugin's `integration/vite-versions.test.ts`. They live in their own
  package because each ships a `vite` binary that would shadow the workspace's in a package that builds with Vite.
- Harness servers listen on `127.0.0.1` and never pass port 0 to Vite or Rsbuild (Rsbuild runs in middleware mode on
  the harness's own server).
- The Rsbuild hosts stay silent (`logLevel` and `dev.client.logLevel` `silent`); read output through the diagnostic
  channel.
