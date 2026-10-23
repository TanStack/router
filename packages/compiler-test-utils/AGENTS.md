# Compiler test infrastructure

Replacing or rewriting a compiler? Start with [oracle/README.md](oracle/README.md): its status (measured after the repair), how tests reach the compilers, the lanes, the pending user rulings, then the spec the tests cite, the rulings and the known bugs.

Shared by the compiler test suites (router-plugin, start-plugin-core, router-generator, react-start-rsc and this package). Each has a fast tier (`test:unit`) and a slow tier (`test:integration`, `tests/integration/`); start-plugin-core and react-start-rsc also run main's noncompiler tests with `test:noncompiler` (see below).

## Running a slice

- One file or one test name, through Nx (dependencies come from Nx's cache; the target reruns when a file changed). Paths are relative to the package:

  ```sh
  CI=1 NX_DAEMON=false pnpm nx run @tanstack/router-plugin:test:unit --outputStyle=stream --skipRemoteCache -- --maxWorkers=4 tests/code-splitter-scope.test.ts -t "unlike computed keys"
  ```

  Edit to result for one fast-tier file is about 5 s in router-plugin and start-plugin-core (about 8 s for the first one in a session). A file path is a substring filter: `tests/compiler.test.ts` also runs `tests/known-bugs-start-compiler.test.ts`.

- Never put `|` inside a `-t` filter: Nx passes the arguments through a shell, so it becomes a pipe and orphans Vitest workers. Run one command per filter.
- Leave out `--skip-nx-cache` while iterating: it rebuilds every dependency. Use it for final validation, on whole tiers.
- Do not run Vitest directly: it can test a stale `dist` of a dependency.
- Slow tier: at most two runs on the machine at once. Gate on the Vitest processes (the `[v]` keeps the loop from matching itself):

  ```sh
  until [ "$(pgrep -fc '[v]itest --project integration')" -lt 2 ]; do sleep 30; done; <nx command>
  ```

## Which helper for a new or rerouted test

- Drive a compiler only through the public plugins a user configures: `./plugin-host` (`createPluginHost`, Vite: server code through the environment's module runner, client code in a run page, `vite build`) and `./rsbuild-plugin-host` (`createRsbuildPluginHost`, Rsbuild's JavaScript API). No hook recorders, module ids, queries or hand-registered routes.
  - A Vite host with `client: true` listens (on `127.0.0.1`, as every harness server: FINAL-PASS #56), serves a page the plugins transform (`transformIndexHtml`), pre-bundles dependencies, and keeps an idle HMR client connected for its lifetime, so a full reload sent between runs reaches no later run's page.
  - Configure an app as its config file does: Start's plugin is `tanstackStart()` of the built framework package (start-plugin-core `tests/start-plugins.ts`), next to the framework's own plugin (`@vitejs/plugin-react`, `@rsbuild/plugin-react`, `vite-plugin-solid`, `@vitejs/plugin-vue-jsx`), never a hand SWC or JSX configuration; entries through Start's `client.entry`/`server.entry`.
  - The packages' own hosts build on these and are shared within a test process: router-plugin `tests/route-app.ts` (`loadRoute`: hosts leased to one test at a time, one per configuration, free hosts beyond `freeHostLimit` closed) and start-plugin-core `tests/start-host.ts` (`useStartHost`/`useStartHosts`: one host per file and options, taken before the file's tests and given back after them).
- Client semantics run in a real browser: `runClient` of a host, or `runInPage` of `./browser` (a page of the test process's run pages, held by the run alone, a fresh document per run). Nothing evaluates client code in Node (no module linker or renderer stand-ins). A built server bundle is run as a host runs it: imported by Node and served over HTTP (start-plugin-core `tests/integration/start-compose-app.ts`). A dev server's `load()` follows Vite's own module graph (static and lazy imports), not a parse of the served code.
- What a test process opens in its one browser is bounded (FINAL-PASS #40): `runInPage` runs on at most `runPageLimit` pages (runs of concurrent tests beyond that wait), `openPage` keeps at most `openPageLimit` pages open (a test asking for more waits until one closes). `runInPage` returns only once the run's page left the run's document: what the dev server sends after the run (a full reload after the test's edit) reaches no page a later run gets.
- Tests never write into the repository. An app is a temporary directory that stands in for the directory the harness names (`dir`, a package's `tests/`): `./app-directory` mirrors the path of `dir` below the repository's root in a temporary directory, with the `node_modules` directories above `dir` linked at their mirrored places (imports resolve to the same real paths, one copy of each package), `dir`'s `tsconfig.json` and its package.json's `type` and `sideEffects`. The harnesses create their apps there (`createApp`); a test that writes an app of its own takes its directory from `createAppDirectory(dir, prefix)`, and runs a Vite server of it with `cacheDir` in the app and `server.fs.allow: await servedDirectories(root)`. A test of checked-in files (router-generator's fixtures) runs on a copy (`copyFixture`); the one file a run writes into a package is the route tree of router-generator's `nested` fixture, which its `types` project checks in place (held by Q2). A project with such apps lists `@tanstack/compiler-test-utils/run-directory` in `globalSetup`: the run's directory (the apps, the route generator's temporary files through `TSR_TMP_DIR`), removed when the run ends.
- Per-test resources in a helper (a leased host, a page, an app) belong to the test of `./test-scope` (`currentTest()`, `onTestFinished`), not Vitest's global `onTestFinished`: in a concurrent file the global one names the test that started last. A project that uses them lists `@tanstack/compiler-test-utils/test-scope-setup` in `setupFiles` (it also gives each test file the process environment and working directory it started with).
- Diagnostics: read every channel at once (`./diagnostic-channel`: console, process streams, Vite's logger, Rsbuild's logger, bundler compilations; the dev harnesses' `diagnostics`). "Nothing reported" is `expectNoProblems`. A diagnostic is checked by its severity, the file it names and the position it reports, never by its wording (`./diagnostics` `expectDiagnostic`; ruling 2026-10-22).
  - Each channel gets its own work's output, also what a bundler's native callbacks print (Rolldown hooks, Rspack hooks): by the app root it names, or as the only work open; otherwise every open channel gets it, marked `shared`. A compilation's report is recorded once, from the compilation, not again from Rsbuild's logger. The Rsbuild hosts stay quiet in the terminal and the page (`logLevel` and `dev.client.logLevel` `silent`); never raise them to see Rsbuild's output.
- Edits settle on their outcome within one bound (`./outcome` `waitForOutcome`, the dev harnesses' `edit`/`settle`), never on counts of events, compiles or updates. Whether a Vite dev page reloaded or applied an update in place is judged once the page handled everything the server sent, including what its own `invalidate()` calls made the server send (`./hmr-sync` `settlePage`), never by a time bound. A wait that starts once the hosts handled the edit may also end, as a failure, once every host stayed quiet without the outcome for a while (`failWhenQuietFor`): the edit reached its final state.

## Corpus and noncompiler tests

The compiler test corpus is an oracle: a compiler that passes every corpus test should be a good compiler, and a correct compiler built differently should pass it (oracle/README.md, "Status"). Do not change a test's assertions, inputs or expected outcomes to fit a compiler; report a test that a correct compiler cannot pass instead.

- The corpus runs real tools and asserts observable outcomes only, entering the compilers through public entry points. There is no lane for tests of today's implementation (internal functions, printed bytes, log policy, perf counters) and no tests of a compiler package's own test helpers: such tests are deleted, not moved (rulings 2026-10-22). This package's own tests are controls of the shared harness.
- **Selection** (router-plugin, start-plugin-core, router-generator: Vitest projects in `vite.config.ts`):
  - `test:unit` (project `unit`, plus `types` in router-generator) and `test:integration` (project `integration`, plus `integration-pages` in router-plugin and start-plugin-core) select the corpus: every test file except main's noncompiler tests (below).
  - `integration-pages` (files under `tests/integration/pages/`) is slow-tier acceptance like `integration`: page tests of the fast tier's kind (router-plugin route apps, start-plugin-core `<Hydrate>` and import forms) whose cost does not fit the fast tier's budget. Its tests run concurrently within a file (`sequence.concurrent`): each holds its own leased host (router-plugin `route-app.ts`) or its own pages of the file's host (start-plugin-core `start-host.ts`). router-plugin's `unit` runs the same way.
  - The projects with browser pages and the `integration` projects of router-plugin and start-plugin-core keep modules across the test files of a worker (`isolate: false`): the browser, and hosts a file gives back, serve later files. A file must leave nothing behind but what the harness owns (it gets its environment back from the setup file).
- **Main's own tests.** The corpus is the compilers' test suite. Main's tests of features that are not compilers (start-plugin-core: Start manifest, sitemap, prerender, CSRF config, schema, entry planning, post-build, output directory, watch-ignored, `createVirtualModule`, dev styles, utils; react-start-rsc: the RSC runtime components, streams, `createRscProxy` and the type tests) stay at main's paths with main's content, untouched: each package lists them in `tests/noncompiler-tests.json`, which its `noncompiler` Vitest project selects (`test:noncompiler`) and the corpus projects and (start-plugin-core) ESLint leave out. Root `test:pr`/`test:ci`, root `pnpm test` and compiler-platform CI run the lane. Do not edit these files for the oracle; a new noncompiler test of main's kind goes next to them and into the list. Main's tests of today's compiler internals (internal functions called directly, exact output text and snapshots, internal classes) are deleted: the corpus covers their behaviour through public entry points. RSC compiler acceptance currently lives entirely in integration.
- Budgets (`test-budgets.json`) cover the corpus tiers; the noncompiler projects have none.
- A test that decides a user-visible outcome through an internal entry point (e.g. the emitted `handleRouteUpdate` driven by a live router, held by ruling Q5) stays in the corpus, labelled in its header, until it is rerouted through a public entry point.

## Budgets

`test-budgets.json`: per package, a target and a hard limit for each tier at `--maxWorkers=4`; 15 s for any slow-tier file (`integration` and `integration-*` projects); 10 s from edit to result for one fast-tier file, Nx included. `src/budget-reporter.ts` prints the comparison after every run and never fails it (times move with the machine's load). Other worker counts (CI, one worker) are reported only.

To enforce the budgets, run a whole tier in strict mode on a quiet machine (1-minute load below 4, no other test runs). It fails over a hard limit or the per-file limit:

```sh
until awk '{exit !($1<4)}' /proc/loadavg && [ "$(pgrep -fc '[v]itest --project integration')" -eq 0 ]; do sleep 20; done
COMPILER_TEST_BUDGETS=strict CI=1 NX_DAEMON=false pnpm nx run <project>:test:integration --outputStyle=stream --skipRemoteCache --skip-nx-cache -- --maxWorkers=4
```

Keep `--skip-nx-cache` there: a replay from Nx's cache is not a measurement.

A run in which a test file failed (a failed test, or a file that did not load) is not a measurement either: strict mode fails it as invalid, and report-only mode says its times are not a measurement.
