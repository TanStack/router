# Compiler test infrastructure

Replacing or rewriting a compiler? Start with [oracle/README.md](oracle/README.md): its status (measured after the repair), how tests reach the compilers, the lanes, the pending user rulings, then the spec the tests cite, the rulings and the known bugs.

Shared by the compiler test suites (router-plugin, start-plugin-core, router-generator, react-start-rsc and this package). Each has a fast tier (`test:unit`) and a slow tier (`test:integration`, `tests/integration/`); implementation tests outside the corpus run with `test:implementation` (see below).

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
  - Configure an app as its config file does: Start's plugin is `tanstackStart()` of the built framework package (start-plugin-core `tests/start-plugins.ts`; the core factories `tanStackStartVite`/`tanStackStartRsbuild` only in `tests/outside-compiler-corpus/core-start-plugin.ts`, for the implementation tests of `compilerTransforms`), next to the framework's own plugin (`@vitejs/plugin-react`, `@rsbuild/plugin-react`, `vite-plugin-solid`, `@vitejs/plugin-vue-jsx`), never a hand SWC or JSX configuration; entries through Start's `client.entry`/`server.entry`.
  - The packages' own hosts build on these and are shared within a test process: router-plugin `tests/route-app.ts` (`loadRoute`: hosts leased to one test at a time, one per configuration, free hosts beyond `freeHostLimit` closed) and start-plugin-core `tests/start-host.ts` (`useStartHost`/`useStartHosts`: one host per file and options, taken before the file's tests and given back after them).
- Client semantics run in a real browser: `runClient` of a host, or `runInPage` of `./browser` (a page of the test process's run pages, held by the run alone, a fresh document per run). `./module-linker`, `./render` and `./lazy-probe` are deprecated (Node stand-ins, reached only by implementation-lane and pending-rulings helpers); do not add callers. A dev server's `load()` follows Vite's own module graph (static and lazy imports), not a parse of the served code.
- What a test process opens in its one browser is bounded (FINAL-PASS #40): `runInPage` runs on at most `runPageLimit` pages (runs of concurrent tests beyond that wait), `openPage` keeps at most `openPageLimit` pages open (a test asking for more waits until one closes). `runInPage` returns only once the run's page left the run's document: what the dev server sends after the run (a full reload after the test's edit) reaches no page a later run gets.
- Tests never write into the repository. An app is a temporary directory that stands in for the directory the harness names (`dir`, a package's `tests/`): `./app-directory` mirrors the path of `dir` below the repository's root in a temporary directory, with the `node_modules` directories above `dir` linked at their mirrored places (imports resolve to the same real paths, one copy of each package), `dir`'s `tsconfig.json` and its package.json's `type` and `sideEffects`. The harnesses create their apps there (`createApp`); a test that writes an app of its own takes its directory from `createAppDirectory(dir, prefix)`, and runs a Vite server of it with `cacheDir` in the app and `server.fs.allow: await servedDirectories(root)`. A test of checked-in files (router-generator's fixtures) runs on a copy (`copyFixture`); the one file a run writes into a package is the route tree of router-generator's `nested` fixture, which its `types` project checks in place (held by Q2). A project with such apps lists `@tanstack/compiler-test-utils/run-directory` in `globalSetup`: the run's directory (the apps, the route generator's temporary files through `TSR_TMP_DIR`), removed when the run ends.
- Per-test resources in a helper (a leased host, a page, an app) belong to the test of `./test-scope` (`currentTest()`, `onTestFinished`), not Vitest's global `onTestFinished`: in a concurrent file the global one names the test that started last. A project that uses them lists `@tanstack/compiler-test-utils/test-scope-setup` in `setupFiles` (it also gives each test file the process environment and working directory it started with).
- Diagnostics: read every channel at once (`./diagnostic-channel`: console, process streams, Vite's logger, Rsbuild's logger, bundler compilations; the dev harnesses' `diagnostics`). "Nothing reported" is `expectNoProblems`. Judge causes with `explains` (content), not `causes` (a deprecated word list).
  - Each channel gets its own work's output, also what a bundler's native callbacks print (Rolldown hooks, Rspack hooks): by the app root it names, or as the only work open; otherwise every open channel gets it, marked `shared`. A compilation's report is recorded once, from the compilation, not again from Rsbuild's logger. The Rsbuild hosts stay quiet in the terminal and the page (`logLevel` and `dev.client.logLevel` `silent`); never raise them to see Rsbuild's output.
- Edits settle on their outcome within one bound (`./outcome` `waitForOutcome`, the dev harnesses' `edit`/`settle`), never on counts of events, compiles or updates. Whether a Vite dev page reloaded or applied an update in place is judged once the page handled everything the server sent, including what its own `invalidate()` calls made the server send (`./hmr-sync` `settlePage`), never by a time bound. A wait that starts once the hosts handled the edit may also end, as a failure, once every host stayed quiet without the outcome for a while (`failWhenQuietFor`): the edit reached its final state.

## Corpus and implementation tests

The compiler test corpus is an oracle: a compiler that passes every corpus test should be a good compiler, and a correct compiler built differently should pass it (oracle/README.md, "Status"). Do not change a test's assertions, inputs or expected outcomes to fit a compiler; report a test that a correct compiler cannot pass instead. Some useful tests check choices of today's implementation that a correct rewrite may make differently (printed bytes, log policy, internal generators called with forced options such as the server fn resolver generator, perf counters). Those are **implementation tests**, kept and run, but not part of the corpus.

- **Label:** an implementation test is a file under a directory named `outside-compiler-corpus/` in a package's `tests/` (fast tier) or `tests/integration/` (slow tier). One label, by location; no tags or name prefixes. A corpus file that contains an implementation block moves that block to such a file. Its header says why it is outside the corpus and which corpus test decides the outcome instead, if any.
- **Selection** (router-plugin, start-plugin-core, router-generator: Vitest projects in `vite.config.ts`):
  - `test:unit` (project `unit`, plus `types` in router-generator) and `test:integration` (project `integration`, plus `integration-pages` in router-plugin and start-plugin-core) select the corpus only: they exclude `**/outside-compiler-corpus/**`.
  - `integration-pages` (files under `tests/integration/pages/`) is slow-tier acceptance like `integration`: page tests of the fast tier's kind (router-plugin route apps, start-plugin-core `<Hydrate>` and import forms) whose cost does not fit the fast tier's budget. Its tests run concurrently within a file (`sequence.concurrent`): each holds its own leased host (router-plugin `route-app.ts`) or its own pages of the file's host (start-plugin-core `start-host.ts`). router-plugin's `unit` runs the same way.
  - The projects with browser pages and the `integration` projects of router-plugin and start-plugin-core keep modules across the test files of a worker (`isolate: false`): the browser, and hosts a file gives back, serve later files. A file must leave nothing behind but what the harness owns (it gets its environment back from the setup file).
  - `test:implementation` (projects `implementation` and `implementation-integration`) selects the implementation tests of both tiers; `test:implementation:unit` the fast ones only.
  - The root `test:pr`/`test:ci` scripts run the implementation targets too (the compiler platform workflow runs only `test:implementation:unit`), so no implementation test is lost locally or in PR CI; acceptance of a rewrite reads only `test:unit` and `test:integration`.
- **Harness controls** of a compiler package (tests of its own test helpers that drive the real compiler, e.g. router-plugin's `regression-helpers.test.ts` in both tiers) are outside the corpus too: they check the oracle, not the compiler, and a correct rewrite may differ in the incidental details they lean on. Controls on fixed inputs may stay where they are.
- A package that gets its first implementation test adds the two projects and the two scripts the same way. react-start-rsc selects its runtime tests in `test:noncompiler`. This package's own tests are harness controls, not compiler tests; none of them is an implementation test of a compiler.
- **Noncompiler coverage:** start-plugin-core build plumbing and react-start-rsc runtime tests live under `tests/outside-compiler-corpus/noncompiler/` and run in `test:noncompiler`, excluded from the implementation projects too. Root `test:pr`/`test:ci` and compiler-platform CI run the lane. RSC compiler acceptance currently lives entirely in integration.
- Budgets (`test-budgets.json`) cover the corpus tiers; the implementation and noncompiler projects have none.
- What does not belong outside the corpus: a goal pin (`.fails`) of a real bug, a test of supported behaviour that is merely slow, or a test that decides a user-visible outcome through an internal entry point (e.g. the emitted `handleRouteUpdate` driven by a live router: label it in its header, keep it in the corpus, and reroute it through a public entry point: the import gate below flags it until then). Before moving a test out, make sure no wrong compiler is caught only by it (e.g. a known mutant of the compiler).

## Import gate

Acceptance tests reach the compilers only through public entry points. `src/import-gate.ts` checks the imports mechanically: it lists every import of a compiler-package internal (router-generator, router-plugin, start-plugin-core, react-start-rsc, router-utils) in the corpus test files of the five packages above and in every helper they reach (relative imports into a package's `tests/`, and this package's `src/`).

- **Internal** means not reachable through the package's `package.json` `exports`. Allowed: the package specifier with an exported subpath (`@tanstack/router-plugin/vite`), and a relative path to the source file an export is built from (`../src/vite` in router-plugin) or to an exported file. A type-only import of a public type (one a public entry exports) through an internal path is allowed and listed separately; prefer the public specifier.
- Everything else counts, including a value import of a public symbol through an internal module (`getConfig` from `src/core/config`), internal types, `vi.mock`/`vi.importActual`, dynamic `import()`, `require` and `typeof import()` of internal paths, and subpaths missing from `exports`.
- It is static: paths computed at run time (`import(path.join(...))`) and ids or queries in strings are out of its reach.

```sh
CI=1 NX_DAEMON=false pnpm nx run @tanstack/compiler-test-utils:test:import-gate --outputStyle=stream --skipRemoteCache
```

- `test:import-gate` (report mode) prints the violations grouped by file (for a helper, how many corpus files reach it) and exits 0. `--json` (run `node ./src/import-gate.ts --json` in this package) prints the same data as JSON.
- `test:import-gate:strict` (or `COMPILER_IMPORT_GATE=strict`) exits 1 on any violation, on a stale allowlist entry, or on a file it could not parse. It is a required check: root `test:pr`/`test:ci` run it (every compiler package and this one has the target, so `nx affected` runs it for a change in any of them; Nx target default in `nx.json`), and so does the compiler platform workflow.
- **Allowlist** (`pendingRulingAllowlist` in `src/import-gate.ts`): the only internal imports strict mode accepts, held by pending user rulings: the Q5 control (router-plugin `tests/handle-route-update.test.ts`), the `tests/pending-rulings/` files of start-plugin-core (Q6, Q7), and the legacy helpers only they reach (`tests/outside-compiler-corpus/legacy/`, allowed only while no other acceptance test reaches them). Each entry names its ruling and the requests it holds; remove it when the ruling lands. Never add an entry for anything else.
- `tests/import-gate.test.ts` is its control, on a fixture workspace of its own (packages with their own `exports` maps and sources, in a temporary directory): files planted in memory next to the fixture's tests must be flagged exactly where they import internals, and strict mode must fail on an internal import its allowlist does not hold, on an allowlisted helper another test reaches, and on a stale entry. It does not depend on where the real packages keep their sources (FINAL-PASS #51).

## Budgets

`test-budgets.json`: per package, a target and a hard limit for each tier at `--maxWorkers=4`; 15 s for any slow-tier file (`integration` and `integration-*` projects); 10 s from edit to result for one fast-tier file, Nx included. `src/budget-reporter.ts` prints the comparison after every run and never fails it (times move with the machine's load). Other worker counts (CI, one worker) are reported only.

To enforce the budgets, run a whole tier in strict mode on a quiet machine (1-minute load below 4, no other test runs). It fails over a hard limit or the per-file limit:

```sh
until awk '{exit !($1<4)}' /proc/loadavg && [ "$(pgrep -fc '[v]itest --project integration')" -eq 0 ]; do sleep 20; done
COMPILER_TEST_BUDGETS=strict CI=1 NX_DAEMON=false pnpm nx run <project>:test:integration --outputStyle=stream --skipRemoteCache --skip-nx-cache -- --maxWorkers=4
```

Keep `--skip-nx-cache` there: a replay from Nx's cache is not a measurement.

A run in which a test file failed (a failed test, or a file that did not load) is not a measurement either: strict mode fails it as invalid, and report-only mode says its times are not a measurement.
