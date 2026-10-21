# Compiler test infrastructure

Replacing or rewriting a compiler? Start with [oracle/README.md](oracle/README.md): its status first (the suite is not yet an oracle: many tests still reach the compilers through internals and re-implemented tools, and a repair is in progress), then the spec the tests cite, the rulings, the known bugs, and how the suite was validated.

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

## Corpus and implementation tests

The compiler test corpus is meant to be an oracle: a compiler that passes every corpus test should be a good compiler. It is not one yet (oracle/README.md, "Status"): many corpus tests reach the compilers through internal modules, ids and re-implemented tools, and some judge client code in Node. Until the repair lands, do not change a test's assertions, inputs or expected outcomes to fit a compiler; adapt only the harness entry points, and report anything else. Some useful tests check choices of today's implementation that a correct rewrite may make differently (printed bytes, log policy, internal generators called with forced options such as the server fn resolver generator, perf counters). Those are **implementation tests**, kept and run, but not part of the corpus.

- **Label:** an implementation test is a file under a directory named `outside-compiler-corpus/` in a package's `tests/` (fast tier) or `tests/integration/` (slow tier). One label, by location; no tags or name prefixes. A corpus file that contains an implementation block moves that block to such a file. Its header says why it is outside the corpus and which corpus test decides the outcome instead, if any.
- **Selection** (router-plugin, start-plugin-core, router-generator: Vitest projects in `vite.config.ts`):
  - `test:unit` (project `unit`, plus `types` in router-generator) and `test:integration` (project `integration`) select the corpus only: they exclude `**/outside-compiler-corpus/**`.
  - `test:implementation` (projects `implementation` and `implementation-integration`) selects the implementation tests of both tiers; `test:implementation:unit` the fast ones only.
  - The root `test:pr`/`test:ci` scripts and the compiler platform workflow run the implementation targets too, so no implementation test is lost; acceptance of a rewrite reads only `test:unit` and `test:integration`.
- **Harness controls** of a compiler package (tests of its own test helpers that drive the real compiler, e.g. router-plugin's `regression-helpers.test.ts` in both tiers) are outside the corpus too: they check the oracle, not the compiler, and a correct rewrite may differ in the incidental details they lean on. Controls on fixed inputs may stay where they are.
- A package that gets its first implementation test adds the two projects and the two scripts the same way. react-start-rsc has none yet. This package's own tests are harness controls, not compiler tests; none of them is an implementation test of a compiler.
- Budgets (`test-budgets.json`) cover the corpus tiers; the implementation projects have none.
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
- `test:import-gate:strict` (or `COMPILER_IMPORT_GATE=strict`) exits 1 on any violation or on a file it could not parse. It fails today; it becomes a required check when the repair is done.
- `tests/import-gate.test.ts` is its control: files planted in memory next to router-plugin's real tests must be flagged exactly where they import internals.

## Budgets

`test-budgets.json`: per package, a target and a hard limit for each tier at `--maxWorkers=4`; 15 s for any slow-tier file; 10 s from edit to result for one fast-tier file, Nx included. `src/budget-reporter.ts` prints the comparison after every run and never fails it (times move with the machine's load). Other worker counts (CI, one worker) are reported only.

To enforce the budgets, run a whole tier in strict mode on a quiet machine (1-minute load below 4, no other test runs). It fails over a hard limit or the per-file limit:

```sh
until awk '{exit !($1<4)}' /proc/loadavg && [ "$(pgrep -fc '[v]itest --project integration')" -eq 0 ]; do sleep 20; done
COMPILER_TEST_BUDGETS=strict CI=1 NX_DAEMON=false pnpm nx run <project>:test:integration --outputStyle=stream --skipRemoteCache --skip-nx-cache -- --maxWorkers=4
```

Keep `--skip-nx-cache` there: a replay from Nx's cache is not a measurement.

A run in which a test file failed (a failed test, or a file that did not load) is not a measurement either: strict mode fails it as invalid, and report-only mode says its times are not a measurement.
