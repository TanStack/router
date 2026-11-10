# Compiler test suite

The acceptance suite for the TanStack Router/Start compilers. A compiler that passes it should be a good compiler,
however it is built. [SPEC.md](./SPEC.md) is the contract the tests cite; [KNOWN-BUGS.md](./KNOWN-BUGS.md) lists
today's bugs.

## The seven jobs

- **J1** Route file upkeep (router-generator): keep `createFileRoute('/path')` in sync with the file; generate the
  route tree.
- **J2** Route code splitting (router-plugin): split options load lazily from their own chunks, with identical
  behaviour.
- **J3** Route HMR (router-plugin): an edited route updates in place in dev; nothing of it in production.
- **J4** Start environment separation (start-plugin-core): server code never reaches the client.
- **J5** Deferred hydration `<Hydrate>` (start-plugin-core): children move to a lazy client chunk; hydration ids agree.
- **J6** Import protection (start-plugin-core): cross-environment imports are reported, mocked in dev, an error in
  build.
- **J7** RSC CSS injection (react-start-rsc): CSS of server components reaches the client.

Clause ids: `G1`–`G16` are cross-cutting rules, `J<job>.<n>` job clauses, `§5.N` freedoms, `§8` how tests check,
`§9` what is not tested.

## What is the oracle

`test:unit` and `test:integration` of `@tanstack/router-generator`, `@tanstack/router-plugin` and
`@tanstack/start-plugin-core`, and `test:integration` of `@tanstack/react-start-rsc`.

Not the oracle: the tests of `@tanstack/compiler-test-utils` (the shared harness). They are controls of the harness.

Not the oracle: `test:noncompiler` (start-plugin-core, react-start-rsc). It runs main's own tests of features that are
not compilers (manifest, sitemap, prerender, RSC runtime, …), listed in each package's `tests/noncompiler-tests.json`.

## Running

The whole oracle, its targets at once (about 3.5 minutes on 32 threads, 8 minutes one after another): one build, then
two phases of test commands that build nothing (`--excludeTaskDependencies`), so no `dist` changes while tests read it:

```sh
export CI=1 NX_DAEMON=false; logs=$(mktemp -d); echo "logs: $logs"
pnpm nx run-many -t build --skipRemoteCache -p @tanstack/router-generator @tanstack/router-plugin @tanstack/start-plugin-core @tanstack/react-start-rsc @tanstack/react-start @tanstack/solid-start @tanstack/vue-start
run() { pnpm nx run "$1" --excludeTaskDependencies --skipRemoteCache --skip-nx-cache --outputStyle=stream -- --maxWorkers="$2" > "$logs/${1//[\/:]/_}.log" 2>&1; echo "$1 exit $?"; }
run @tanstack/router-generator:test:unit 2 & run @tanstack/router-generator:test:integration 2 & run @tanstack/start-plugin-core:test:unit 4 & wait
run @tanstack/start-plugin-core:test:integration:whole 9 & run @tanstack/router-plugin:test:integration:whole 4 & run @tanstack/react-start-rsc:test:integration 4 & run @tanstack/router-plugin:test:unit 4 & wait
```

- The first phase holds the tests with Vitest's 5 s default timeout (start-plugin-core's fast tier): under the slow
  tiers' load they take most of it and time out.
- The slow tiers run whole (`test:integration:whole`), each in one Vitest run with more workers: about 0.4 × the
  logical CPUs in all, at most one per 2.4 GB of free memory, split 9 : 4 between start-plugin-core and router-plugin.
  The run is CPU-bound: more workers add load and memory, not speed. Vitest's `--shard` slices finish unevenly.
- The run takes the machine: start it with no other slow-tier run, and start none during it.
- On a small machine, one target at a time:
  `pnpm nx run-many -t test:unit test:integration -p @tanstack/router-generator @tanstack/router-plugin @tanstack/start-plugin-core @tanstack/react-start-rsc --parallel=1 --outputStyle=stream --skipRemoteCache`.

One tier, one file, one test:

```sh
CI=1 NX_DAEMON=false pnpm nx run @tanstack/router-plugin:test:unit --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @tanstack/router-plugin:test:unit --outputStyle=stream --skipRemoteCache -- tests/code-splitter-scope.test.ts -t "unlike computed keys"
```

- Always go through Nx: it builds the dependencies first; Vitest alone can test a stale `dist`.
- One Nx command at a time, but for the whole oracle's test commands above. Each run uses 4 workers
  (`--maxWorkers=<n>` after `--` overrides).
- Never put `|` in a `-t` filter (Nx passes it through a shell).
- Use `--skip-nx-cache` only when you measure time or set a switch below (Nx's cache does not know them).
- The time budgets (`../test-budgets.json`) are reported after each run, and fail nothing unless
  `COMPILER_TEST_BUDGETS=strict` (see [../AGENTS.md](../AGENTS.md)). They hold only on a quiet machine.

## Reading results

- A failing test names a SPEC clause in its comment or title. That clause says what is required.
- `Source:` in a test comment names where the case comes from: an issue, or a test or file of main's compilers (the
  Babel-based ones), which may no longer exist.
- A `.fails` test is a pin: it asserts the correct outcome for a bug today's compiler has. KNOWN-BUGS lists them by
  root cause. When your compiler fixes the bug, the pin fails with "Expect test to fail": remove the `.fails` and keep
  the test. A new compiler flips many pins at once.
- Pins whose input uses a name today's compiler generates flip when your compiler generates other names. That is
  fine; the adaptive pins next to them are the real check.
- `COMPILER_TESTS_PINS=run` runs every pin as an ordinary test (add `--skip-nx-cache`). The pins your compiler
  fails are failures; the report after the run lists the pins it passes.

## Free, and only a goal

What a correct compiler may do differently is in SPEC §5: generated names, module and chunk layout, ids, printing,
diagnostic wording and channel, where helpers live, which dead code is left before the bundler.

Optimisations are goals, not gates: the bytes left after the bundler, options importing shared pieces directly
(instead of through forwarding modules), splitting route options in the SSR build too.

## Rules

- Do not weaken a test to make it pass.
- A test that pins an incidental detail (message wording, an internal name such as `FileRouteTypes`, an exact
  column) may be adjusted. Add a one-line note saying why.
- If a test contradicts SPEC, fix the test or report it.

## Known environment issues

- Chromium keeps shared memory in files in `TMPDIR`. On a small `/tmp` tmpfs, page tests fail with
  `net::ERR_INSUFFICIENT_RESOURCES` or "Failed to fetch dynamically imported module". Not a compiler failure: give
  `TMPDIR` more room, or re-run the file alone.
- Budgets are tight on 16 cores, and any other load pushes slow tiers over them.
- Other upstream issues and the harness changes they need: KNOWN-BUGS, "Upstream issues that affect the suite".
