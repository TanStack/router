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
- Diagnostics are checked by severity, file and position only, never by wording.
- Edits settle on their outcome within one bound, never on counts of events, compiles or updates.

## Helpers

- `./plugin-host` (`createPluginHost`): the public Vite plugins on a real Vite dev server (server code through the
  environment's module runner, client code in the browser) and `vite build`.
- `./rsbuild-plugin-host` (`createRsbuildPluginHost`): the same through Rsbuild's JavaScript API.
- `./build-harness`: real builds (Vite, Rsbuild, Rspack, webpack), with provenance of emitted modules and the
  dangling-name check (SPEC G8).
- `./dev-server`, `./rsbuild-dev-server`: dev servers on a temp app with `edit`/`settle`; `closeViteServer`.
- `./browser`: Chromium pages; `runInPage` (bounded run pages, a fresh document per run), `openPage`.
- `./hmr-sync` (`settlePage`): whether a page reloaded or updated in place, told by the page.
- `./outcome` (`waitForOutcome`): wait for an edit's outcome within one bound.
- `./diagnostic-channel`, `./diagnostics` (`expectDiagnostic`, `expectNoProblems`): every reporting channel merged;
  checks by severity, file and position.
- `./importers` (`importerSource`, `loadMarker`, `expectNotLoaded`): real importers and load markers.
- `./free-names`, `./known-globals`: a module's free names (Yuku), minus the environment's globals.
- `./global-trap`: trap a page's dev-only globals (SPEC G7).
- `./source-maps`: map assertions through `@jridgewell/trace-mapping`.
- `./determinism`: compare builds across roots and orders (SPEC G4).
- `./app-directory` (`createAppDirectory`, `servedDirectories`): temp app directories that resolve like the package.
- `./run-directory` (Vitest `globalSetup`): the run's temp dir, removed when the run ends.
- `./test-scope` (`currentTest`, `onTestFinished`) with `./test-scope-setup` (`setupFiles`): per-test resources in
  concurrent files.
- `./pins` (`runPins`) with `./pins-setup` (`setupFiles`): `COMPILER_TESTS_PINS=run` runs every known-bug pin as an
  ordinary test; the shared reporter lists the pins that passed.
- `./workspace-packages`: link built `@tanstack/*` packages into test apps (not declared, to avoid Nx cycles).
- `./run-node`: run built output in a child Node.

Package hosts build on these: router-plugin `tests/route-app.ts` (`loadRoute`), start-plugin-core
`tests/start-host.ts` (`useStartHost`). Start apps use `tanstackStart()` of the built framework package
(`tests/start-plugins.ts`), entries only through `client.entry`/`server.entry`.

## Running

```sh
CI=1 NX_DAEMON=false pnpm nx run @tanstack/router-plugin:test:unit --outputStyle=stream --skipRemoteCache -- tests/code-splitter-scope.test.ts -t "unlike computed keys"
```

- The whole oracle (this package's tests, the harness controls, are not part of it): the `nx run-many --parallel=1`
  command of [oracle/README.md](oracle/README.md).
- Always through Nx, one command at a time. A file path is a substring filter.
- 4 workers by default (`maxWorkers` in each `vite.config.ts`).
- No `|` inside `-t`; run one command per filter.
- `--skip-nx-cache` only for measurements.
- Slow tier: at most two `test:integration` runs on the machine at once:
  `until [ "$(pgrep -fc '[v]itest --project integration')" -lt 2 ]; do sleep 30; done`.
- Tiers: `test:unit` (in process, the inner loop); `test:integration` (`tests/integration/`: real builds, dev servers,
  browser pages; `tests/integration/pages/` is the `integration-pages` project). `integration` projects keep modules
  across files (`isolate: false`): a file leaves nothing behind but what the harness owns.

## Budgets

`test-budgets.json`: per package and tier, a target and a hard limit at 4 workers; 15 s per slow-tier file; 10 s from
edit to result for one fast-tier file. `src/budget-reporter.ts` reports after every run. To enforce, run a whole tier
on a quiet machine (1-minute load below 4, no other test run):

```sh
COMPILER_TEST_BUDGETS=strict CI=1 NX_DAEMON=false pnpm nx run <project>:test:integration --outputStyle=stream --skipRemoteCache --skip-nx-cache
```

A run with a failed test or file is not a measurement. A tier over budget is fixed (shared hosts, bounded pages,
moving page tests to `integration-pages`), not re-budgeted or sharded.

## Setup facts

- Framework packages and tools are test-only devDependencies (`solid-js`, `vite-plugin-solid`, `@rsbuild/plugin-react`,
  `@rsbuild/plugin-solid` ≥ 1.2.2, `@vitejs/plugin-react`, `@vitejs/plugin-vue`, `miniflare`, …).
- The integration targets build `@tanstack/react-start` first (linked at test time).
- Harness servers listen on `127.0.0.1` and never pass port 0 to Vite or Rsbuild (Rsbuild runs in middleware mode on
  the harness's own server).
- The Rsbuild hosts stay silent (`logLevel` and `dev.client.logLevel` `silent`); read output through the diagnostic
  channel.
