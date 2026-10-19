# Compiler test infrastructure

Shared by the compiler test suites (router-plugin, start-plugin-core, router-generator, react-start-rsc and this package). Each has a fast tier (`test:unit`) and a slow tier (`test:integration`, `tests/integration/`).

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

## Budgets

`test-budgets.json`: per package, a target and a hard limit for each tier at `--maxWorkers=4`; 15 s for any slow-tier file; 10 s from edit to result for one fast-tier file, Nx included. `src/budget-reporter.ts` prints the comparison after every run and never fails it (times move with the machine's load). Other worker counts (CI, one worker) are reported only.

To enforce the budgets, run a whole tier in strict mode on a quiet machine (1-minute load below 4, no other test runs). It fails over a hard limit or the per-file limit:

```sh
until awk '{exit !($1<4)}' /proc/loadavg && [ "$(pgrep -fc '[v]itest --project integration')" -eq 0 ]; do sleep 20; done
COMPILER_TEST_BUDGETS=strict CI=1 NX_DAEMON=false pnpm nx run <project>:test:integration --outputStyle=stream --skipRemoteCache --skip-nx-cache -- --maxWorkers=4
```

Keep `--skip-nx-cache` there: a replay from Nx's cache is not a measurement.
