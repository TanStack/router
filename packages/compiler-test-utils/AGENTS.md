# Compiler test infrastructure

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

The compiler test corpus is an oracle: a compiler that passes every corpus test is a good compiler. Some useful tests check choices of today's implementation that a correct rewrite may make differently (printed bytes, log policy, internal functions such as the stringified `handleRouteUpdate` or the server fn resolver generator, perf counters). Those are **implementation tests**, kept and run, but not part of the corpus.

- **Label:** an implementation test is a file under a directory named `outside-compiler-corpus/` in a package's `tests/` (fast tier) or `tests/integration/` (slow tier). One label, by location; no tags or name prefixes. A corpus file that contains an implementation block moves that block to such a file. Its header says why it is outside the corpus and which corpus test decides the outcome instead, if any.
- **Selection** (router-plugin, start-plugin-core, router-generator: Vitest projects in `vite.config.ts`):
  - `test:unit` (project `unit`, plus `types` in router-generator) and `test:integration` (project `integration`) select the corpus only: they exclude `**/outside-compiler-corpus/**`.
  - `test:implementation` (projects `implementation` and `implementation-integration`) selects the implementation tests of both tiers; `test:implementation:unit` the fast ones only.
  - The root `test:pr`/`test:ci` scripts and the compiler platform workflow run the implementation targets too, so no implementation test is lost; acceptance of a rewrite reads only `test:unit` and `test:integration`.
- A package that gets its first implementation test adds the two projects and the two scripts the same way. react-start-rsc has none yet. This package's own tests are harness controls, not compiler tests; none of them is an implementation test of a compiler.
- Budgets (`test-budgets.json`) cover the corpus tiers; the implementation projects have none.
- What does not belong outside the corpus: a goal pin (`.fails`) of a real bug, a test of supported behaviour that is merely slow, and a control of this package's helpers.

## Budgets

`test-budgets.json`: per package, a target and a hard limit for each tier at `--maxWorkers=4`; 15 s for any slow-tier file; 10 s from edit to result for one fast-tier file, Nx included. `src/budget-reporter.ts` prints the comparison after every run and never fails it (times move with the machine's load). Other worker counts (CI, one worker) are reported only.

To enforce the budgets, run a whole tier in strict mode on a quiet machine (1-minute load below 4, no other test runs). It fails over a hard limit or the per-file limit:

```sh
until awk '{exit !($1<4)}' /proc/loadavg && [ "$(pgrep -fc '[v]itest --project integration')" -eq 0 ]; do sleep 20; done
COMPILER_TEST_BUDGETS=strict CI=1 NX_DAEMON=false pnpm nx run <project>:test:integration --outputStyle=stream --skipRemoteCache --skip-nx-cache -- --maxWorkers=4
```

Keep `--skip-nx-cache` there: a replay from Nx's cache is not a measurement.
