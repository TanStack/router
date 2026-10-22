# The compiler test oracle

This directory explains the test suite that defines a good TanStack Router/Start compiler. Read it before you
replace or rewrite a compiler (for example to move off Babel).

- [SPEC.md](./SPEC.md): what a good compiler must do. Every clause id a test cites (`J4.12`, `G3`, `§5.7`) is
  defined there.
- [RULINGS.md](./RULINGS.md): the maintainers' decisions behind the spec, and the authorized test workarounds.
- [KNOWN-BUGS.md](./KNOWN-BUGS.md): the bugs of today's compilers, pinned as `.fails` tests, and the upstream
  issues.
- [../AGENTS.md](../AGENTS.md): how to run a slice, the helpers, the lanes, the import gate and the budgets.

## The goal

A compiler that passes `test:unit` and `test:integration` in these five packages should be a good compiler, and a
correct compiler built differently from today's should pass them too:

- `@tanstack/compiler-test-utils` (the shared harness and its controls)
- `@tanstack/router-generator`
- `@tanstack/router-plugin`
- `@tanstack/start-plugin-core`
- `@tanstack/react-start-rsc`

Nothing else decides acceptance. The tests assert outcomes that users and the docs see, not today's printed code,
generated names or module layout. SPEC §5 lists what a correct compiler may do differently.

## Status

The suite was repaired (October 2026) so that it reaches the compilers only through public entry points, runs real
tools, and judges client code in a real browser. What was measured at the end of the repair:

- **Restructured compilers pass.** Eleven behaviour-preserving restructures of today's compilers (R1–R11: moved
  modules, renamed ids and generated names, another printer, reworded diagnostics, another AST seam, other report
  channels, another server-function provider architecture, other chunk layouts, other trace order, other loader
  paths) were each run against the whole acceptance suite, with every failing file re-run alone with and without the
  restructure. At 45f58967ea:
  - R1 and R3–R11: no acceptance test fails.
  - R2 (moved internal modules) fails the 7 rows that pending rulings hold on internal imports (Q5:
    `handle-route-update.test.ts` ×1; Q6: `pending-rulings/createMiddleware.test.ts` ×2, `createServerFn.test.ts`
    ×1; Q7: `pending-rulings/known-bugs-start-compiler.test.ts` ×3). Nothing else fails under R2.
  - Expected pin flips, where the restructure fixes the pinned bug: R3 ×6 (user names that collide with today's
    generated names), R8 ×6 (SSR runs server functions in place), R9 ×3 (entry re-export of shared bindings).
  - One #42 failure under R3 passed alone (a flake, below).
- **Wrong compilers are caught, correct ones pass.** The adversarial variants of rounds 1 and 2 (written by
  reviewers as product patches) were re-run at 45f58967ea against `test:unit` + `test:integration` (the
  pending-rulings, implementation and noncompiler lanes recorded, never counted):
  - all 90 red (wrong) variants are caught, each by acceptance tests that fail again when their file runs alone;
    none is caught only by a non-acceptance lane;
  - all 34 valid green (correct but different) variants pass; green-sol/20 flips its two expected pins (it fixes
    that bug), and green-sol/01 is ruled not a valid green.
  - Every red caught before the repair's last waves is still caught; two now only through rerouted public-entry
    tests, because the internal-entry tests that caught them moved to the implementation lane.
- **No internal imports.** The strict import gate passes in CI. The only internal imports left are held by pending
  user rulings, through the gate's allowlist (below).
- **Stable.** The unpatched suite ran 9 times (3 rounds of 3 trees in parallel, 4 workers each, 1-minute load up to
  55): all 15 tiers and lanes gave identical counts, except one #42 failure in one start-plugin-core integration run.
- **Fast.** On a quiet machine (load below 4 at the start) at 4 workers every tier passes its hard budget in strict
  mode, and no slow-tier file takes over 15 s:

  | Package                         | `test:unit` (target / hard) | `test:integration` (target / hard) | slowest slow-tier file |
  | ------------------------------- | --------------------------- | ---------------------------------- | ---------------------- |
  | `@tanstack/compiler-test-utils` | 3.0 s (2.5 / 4)             | 8.0 s (9 / 15)                     | 8.0 s                  |
  | `@tanstack/router-generator`    | 3.8 s (3 / 5)               | 6.6 s (8 / 12)                     | 6.5 s                  |
  | `@tanstack/router-plugin`       | 8.0 s (7.5 / 10)            | 73.7 s (60 / 80)                   | 11.6 s                 |
  | `@tanstack/start-plugin-core`   | 6.4 s (5.5 / 8)             | 83.3 s (65 / 90)                   | 12.8 s                 |
  | `@tanstack/react-start-rsc`     | no test files               | 13.0 s (13 / 20)                   | 6.3 s                  |

  Edit to result for one fast-tier file is about 5 s. Several tiers are over their target and under their hard limit.

Counts at hand-over (passed / expected-fail pins; the final pass F-F changed four cells, see below):

| Package                         | `test:unit` | `test:integration` | `test:implementation` | `test:noncompiler` |
| ------------------------------- | ----------- | ------------------ | --------------------- | ------------------ |
| `@tanstack/compiler-test-utils` | 330 / 0     | 168 / 0            | –                     | –                  |
| `@tanstack/router-generator`    | 239 / 30    | 67 / 3             | 114 / 2               | –                  |
| `@tanstack/router-plugin`       | 107 / 20    | 673 / 355          | 104 / 1               | –                  |
| `@tanstack/start-plugin-core`   | 389 / 144   | 1198 / 288         | 608 / 9               | 121 / 0            |
| `@tanstack/react-start-rsc`     | no files    | 108 / 13           | –                     | 49 / 0             |

The measurements above (restructures, V4, stability, budgets) ran at 45f58967ea. The final pass F-F (October 2026,
after them) re-audited "no re-implementation; client semantics in a browser" file by file and changed tests and
helpers (below); its changes were validated locally (every tier and lane above, the strict import gate), not
re-measured against R1–R11 and V4. Count changes against 45f58967ea: ctu `test:unit` −3 (the controls of the deleted
Node stand-in `evaluateServed`), ctu `test:integration` +1 (a control of the build-decided dangling-name check),
router-plugin `test:implementation` −1 (the control of a deleted path filter), start-plugin-core `test:unit` +4
(controls of the content-based suggestion reader).

The `test:unit` counts include the pending-rulings lane: 4 passing rows and 3 pins in start-plugin-core, 1 row in
router-plugin.

Caveats:

- **Pending user rulings hold some rows** (table below). They count toward acceptance as they are until ruled, and a
  correct compiler may fail some of them: the Q5, Q6 and Q7 rows import compiler internals (R2 fails all 7), and the
  others (Q1–Q4, Q8–Q10, NEW-1, NEW-2) keep an assertion or input whose fate the ruling decides.
- **Two upstream flakes can fail rows no compiler change explains.**
  - #42 (Vite's stale pre-bundled dependency): it fails up to three start-plugin-core integration rows,
    `known-bugs-start-compiler-dev` "top-level call of a project function" and "top-level member call of a
    pre-bundled dependency", and `start-compiler-dev-server` "a module importing a factory that stops being one keeps
    its handler". It currently fails these three rows in most start-plugin-core integration runs on a developer
    machine. In the 145 runs of this measurement on beetle it failed one or two of them in 13 runs.
  - #34 (Vite's optimizer writes its cache after `close()`): an `ENOTEMPTY` on cleanup fails all 33 rows of
    `integration/importProtection/mock-shapes.test.ts` in a run. It hit 3 of 145 runs.
  - Re-run a file that failed only on these alone before reading it as a compiler failure.
- **Known gaps of the final audit (F-F), not fixed:**
  - start-plugin-core's build and dev harnesses (`tests/build-harness.ts`, `tests/dev-server.ts`,
    `tests/rsbuild-dev-server.ts`) call Start's public plugin factory (`tanStackStartVite`/`tanStackStartRsbuild` of
    `@tanstack/start-plugin-core`) with the core options `@tanstack/react-start` passes, not `tanstackStart()` of the
    built framework package, so react-start's config plugin (dedupe, externals, dependency optimisation) is absent;
    the Rsbuild builds of router-plugin and react-start-rsc configure SWC by hand instead of `@rsbuild/plugin-react`.
    `start-host.ts` (the fast tier and the page tests) already uses `tanstackStart()`. RULES-AUDIT §3 item 6.
  - router-plugin `integration/plugin-options.test.ts`: the webpack entry's `addHmr: false` cell reads the
    development build for `hot.accept(` (today's local name); the suite has no webpack dev server. The Rspack cell is
    decided by behaviour on an Rsbuild dev page.
  - A few server-side rows call middleware and route handlers through their option objects with a hand-written
    `next` instead of a request (start-plugin-core `start-build-env-separation`, `start-compiler-dev-server`,
    `start-build-call-shapes`, `known-bugs-start-compiler`), and `start-router-dev-server` settles some edits on 300 ms
    without HMR messages.
- **The adversarial evidence is not independent of the tests.** Round 2's escapes are caught by rows written for
  them, and the attackers of rounds 1 and 2 wrote against earlier versions of the suite. After a major change of the
  compilers or of these tests, run a new round with test-aware attackers and re-check correct-but-different
  compilers (see "Re-running the measurements").

If a test cannot pass with your compiler although the compiler is correct, report it (with the SPEC clause it
contradicts) instead of changing the test. Do not change assertions, inputs or expected outcomes to fit a compiler.

## The seven jobs

| Job                               | What it does                                                                                       | Where its tests live                                                                                                                                                                                                                                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J1 Route file upkeep              | keeps `createFileRoute('/path')` and its import in sync with the file; generates the route tree    | `router-generator/tests/`; generator watching in `router-plugin/tests/integration/*generator*.test.ts`                                                                                                                                                                                                                              |
| J2 Route code splitting           | split options load lazily from their own chunks, with identical behaviour                          | `router-plugin/tests/code-splitter-*.test.ts`, `integration/pages/*code-splitter*.test.ts`, `integration/build-*.test.ts`, `integration/known-bugs-code-splitter-*.test.ts`; Start's router wiring in `start-plugin-core/tests/integration/start-compose-*.test.ts`, `known-bugs-route-options.test.ts`                             |
| J3 Route HMR                      | an edited route updates in place in dev; nothing of it in production                               | `router-plugin/tests/known-bugs-route-hmr*.test.ts`, `integration/pages/route-hmr.test.ts`, `integration/route-hmr*.test.ts`, `integration/known-bugs-route-hmr*.test.ts`, `integration/build-production*.test.ts`                                                                                                                  |
| J4 Start environment separation   | server code never reaches the client; each environment gets its runtime contract                   | `start-plugin-core/tests/createServerFn/`, `createMiddleware/`, `createIsomorphicFn/`, `clientOnlyJSX/`, `start-compiler-*.test.ts`, `known-bugs-start-compiler*.test.ts`, `integration/start-build-*.test.ts`, `integration/start-compiler-*.test.ts`; the RSC provider in `react-start-rsc/tests/integration/rsc-start-*.test.ts` |
| J5 Deferred hydration `<Hydrate>` | children move to a lazy chunk on the client; hydration identities agree                            | `start-plugin-core/tests/integration/pages/*hydrate*.test.ts`, `integration/hydrate-*`                                                                                                                                                                                                                                              |
| J6 Import protection              | cross-environment imports are reported where they survive compilation; mock in dev, error in build | `start-plugin-core/tests/importProtection/`, `integration/importProtection/`, `integration/rsbuild/import-protection.test.ts`                                                                                                                                                                                                       |
| J7 RSC CSS injection              | CSS of server components reaches the client with the RSC payload                                   | `react-start-rsc/tests/integration/rsc-css*.test.ts`                                                                                                                                                                                                                                                                                |

Each package has a fast tier (`test:unit`: in process, the inner loop) and a slow tier (`test:integration`, under
`tests/integration/`: real builds, dev servers and browser pages; `integration-pages` holds page tests of the fast
tier's kind that do not fit its budget).

## How tests reach the compilers

Only through public entry points: the plugins and options a user configures, run by the real tools. No test or
helper imports a compiler internal, calls an internal class, or depends on module ids, queries, generated names,
chunk layout, printed code or AST shapes.

- **Hosts.** `compiler-test-utils/src/plugin-host.ts` hosts the public Vite plugins in a real Vite dev server
  (server code through the environment's module runner, client code in the browser) and runs `vite build` with the
  same plugins. `rsbuild-plugin-host.ts` does the same with Rsbuild's JavaScript API. Builds also run through
  Rspack and webpack (`build-harness.ts`). The packages' own hosts build on these: router-plugin's `route-app.ts`
  (a route file loaded as an app loads it, registered by the plugin's own generator) and start-plugin-core's
  `start-host.ts` (a Start app with a real router and a probe route). Hosts are shared within a test process and
  leased to one test at a time.
- **Server code** runs inside real requests through Start's server entry, with a real router. Nothing builds
  Start's request context by hand. A server function is identified by its public `url` (the server function base,
  then its id), never by Start's own metadata fields.
- **What a dev server serves** to a client is read through Vite's own module graph of the environment (static and
  lazy imports), never by parsing served code for imports.
- **Client code runs in Chromium.** `browser.ts` runs scripts in bounded run pages (a fresh document per run) and
  opens pages of the app for the page tests, with the real Vite client, the framework's refresh runtime, real ES
  module linking and the real framework renderer. Nothing judges client semantics in Node (no jsdom, no fake
  `window` or `import.meta.hot`).
- **Edits** are written to disk like a user's, reported by the real watcher, and settle on their outcome within one
  bound (`outcome.ts` `waitForOutcome`), never on counts of compiles or updates.
- **Laziness and provenance.** Which modules a compiler emitted is told by provenance (the plugin's own `load` and
  `transform` hooks observed in that build), never by id, path or the helper that builds a lazy value.
- **Dead code (G8)** is decided on a real production build: a dev module that reads a name it never declares fails
  only if the production build of the same app still reads it.

## Diagnostics

Every channel is read together (`diagnostic-channel.ts`): console, process streams, Vite's logger, Rsbuild's
logger, and bundler compilations (warnings and errors), in dev and in builds. Diagnostics are judged by content
(`diagnostics.ts`): the file named (absolute or project-relative, §5.7), the original position where required, the
API or option, and an actionable cause (`explains`: no wording lists; a generic internal error does not explain).
Wording and channel are free. Severity is not: where SPEC says "warn", a diagnostic must be at least a warning (an
info or log line does not count), and where it says the build fails, it must fail (RULINGS "diagnostic severity").
"Nothing reported" (`expectNoProblems`) reads every channel.

## Lanes

| Lane            | Where                                                                           | Targets                                                                    | Decides acceptance |
| --------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------ |
| Corpus          | `tests/**`, outside `outside-compiler-corpus/`                                  | `test:unit`, `test:integration`                                            | yes                |
| Pending rulings | `start-plugin-core/tests/pending-rulings/`, and the Q5 control in router-plugin | `test:unit`, `test:integration` (held in the corpus as they are)           | yes, until ruled   |
| Implementation  | `tests/**/outside-compiler-corpus/`                                             | `test:implementation` (router-generator, router-plugin, start-plugin-core) | no                 |
| Noncompiler     | `tests/outside-compiler-corpus/noncompiler/`                                    | `test:noncompiler` (start-plugin-core, react-start-rsc)                    | no                 |

Implementation tests check choices of today's implementation (printed bytes, log policy, internal entry points,
performance counters); a correct new compiler may fail them: delete or rewrite them with the implementation they
describe. Noncompiler tests cover runtime and build plumbing. CI runs every lane. Harness controls (this package's
tests, and the packages' tests of their own helpers) check the oracle itself.

## The import gate

`test:import-gate:strict` (`compiler-test-utils/src/import-gate.ts`) fails if an acceptance test or a helper it
reaches imports a compiler internal: anything not reachable through the package's `exports` (also `vi.mock`,
dynamic `import()`, `require` and `typeof import()`). It runs in root `test:pr`/`test:ci` and in the compiler
platform workflow. Its only exceptions are the imports of the tests held by pending rulings, listed one by one in
`pendingRulingAllowlist` with their ruling; a stale entry fails too. Paths computed at run time are out of a static
gate's reach. Details in [../AGENTS.md](../AGENTS.md#import-gate).

## Pins (`.fails`)

A test marked `.fails` (`test.fails`, `it.fails.each`, `bundler === 'vite' ? test : test.fails`, or the `{ fails: true }` option) is a pin: it
asserts the correct outcome for a bug that today's compiler has, so it fails today. Its comment says `Bug:`,
`Impact:` and `Source:`. Pins are fix-agnostic: any correct fix passes them, and where the spec allows a clear
error instead of support, the pin accepts that error too. A pin's cause is in a compiler or its bundler integration
(runtime bugs are not pinned).

When a pin starts passing, Vitest reports "Expect test to fail". That means the bug is fixed: remove the `.fails`
and keep the test as a regression test. A new compiler will flip many pins at once; that is expected and good.
[KNOWN-BUGS.md](./KNOWN-BUGS.md) indexes them by job.

A few pins use names a user chose that collide with today's generated names; a compiler that generates other names
flips them (RULINGS "restructured compilers"). The adaptive pins next to them read the names a compiler actually
generates and are the structure-free checks.

## Pending user rulings

These tests are kept exactly as they are until the user rules; do not reroute or delete them before that.

| Ruling | What it holds                                                                                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1     | router-generator `concurrent-write` and fault tests that inject an `fs` into the generator                                                                                                  |
| Q2     | the `FileRouteTypes` check in `router-generator/tests/generator/nested/tests.test-d.ts`                                                                                                     |
| Q3     | the client middleware `.options.server` property-shape assertions (start-plugin-core)                                                                                                       |
| Q4     | the success criterion of the star re-export mocking rows (import protection)                                                                                                                |
| Q5     | router-plugin `tests/handle-route-update.test.ts`: the absent-live-route updater control, which calls the emitted update function directly (import-gate allowlist)                          |
| Q6     | `start-plugin-core/tests/pending-rulings/createServerFn.test.ts`, `createMiddleware.test.ts`: rows that drive the internal compiler with a hand-built package graph (import-gate allowlist) |
| Q7     | `start-plugin-core/tests/pending-rulings/known-bugs-start-compiler.test.ts`: the CommonJS pin (import-gate allowlist)                                                                       |
| Q8     | the RouterPluginContext / multi-plugin question (`router-plugin/tests/integration/pages/router-plugin-context.test.ts`)                                                                     |
| Q9     | the immediate `tsr.config.json` reload pin                                                                                                                                                  |
| Q10    | the owned-import numeric cap in `router-generator/tests/owned-edits.ts`                                                                                                                     |
| NEW-1  | the decorator-after-`export` pin (`router-plugin/tests/integration/pages/known-bugs-code-splitter-bindings.test.ts`)                                                                        |
| NEW-2  | whether redundant parentheses around component-defining expressions are free; they break React Fast Refresh registration under SWC/Rsbuild (SPEC §5.5 records the open question)            |
| #42    | the stale pre-bundled dependency flake of Vite (KNOWN-BUGS, upstream): pre-bundle with discovery off in the affected apps, or wait for Vite                                                 |
| #34    | Vite's optimizer writing its cache after `close()` (KNOWN-BUGS, upstream): no workaround until ruled                                                                                        |
| #57    | start-plugin-core integration memory: workers keep modules across files (about 4.4 GB each) to stay within the tier's time budget                                                           |

The legacy helpers that only Q6 and Q7 reach (`start-plugin-core/tests/outside-compiler-corpus/legacy/`, and
`tests/start-runtime.ts`) go away with those tests.

## Re-running the measurements

- **Restructure variants.** Each variant is a patch of the product source that keeps its behaviour (R1–R11). The
  runner applies one, builds through Nx, runs every acceptance tier, re-runs each failing file alone with and
  without the patch, and reports per test: `fail`, `fail-load`, `pin-flip`, with an attribution to the helper that
  threw. Expected pin flips (a variant that fixes a pinned bug) are listed separately. The runner and the patches
  are in the repair's working notes, not in the repository (`validation/REPAIR/variant-runner/`: its README, and the
  patch set of the last measurement in `patches/`; notes on each restructure in `validation/COUPLING/variants/`):
  `VRUN_VARIANTS=$PWD/patches bash local.sh <commit> <outdir> [R1 R2 ...]` runs them on one local tree
  (`VRUN_EXTRA_LANES=1` also records the implementation and noncompiler lanes, never counted). Patches are diffs of
  `packages/*/src`; a new compiler needs new restructures of its own.
- **Adversarial compilers.** Reviewers wrote wrong compilers ("red", each with the clause it breaks) and correct
  but different ones ("green") as product patches, and ran the corpus against each: every red must fail some
  acceptance test for its stated reason, every green must pass. The same runner runs them (`V4-<set>-<NN>` rows of
  its `variants.tsv`, `v4-table.mjs` for the verdict table). After a major compiler change, run another round:
  an attacker who may read the tests writes wrong compilers that pass the corpus, and each escape gets a row.
  Re-check correct-but-different variants too, so the new rows do not pin one implementation.

## Reading a clause id in a test

Test comments cite the spec like `SPEC J4.5`, `(G3, J2.4)` or `§5.7`:

- `G1`–`G15`: cross-cutting rules (SPEC §3).
- `J<job>.<n>`: a clause of one job (SPEC §4), for example `J6.5` is import-protection report content.
- `§5.N` (or "§5 item N"): a freedom a correct compiler may use (SPEC §5).
- `§1.x`, `§2.x`, `§8`, `§9`: scope, supported inputs, checking rules and evidence still pending.
- `OQ12`–`OQ17`: ruled product questions (SPEC §6).
- `R1`–`R7` next to a SPEC clause: the cross-cutting rules the G rules refine (SPEC preamble). `R1`–`R11` next to
  "variant" or "restructure": the restructure variants above.
- `D1`–`D14`, `P1`, `P2`, `L3`, `R-09`, `R-14`, `K-19`, `PIN-A`, `D-04`: rulings ([RULINGS.md](./RULINGS.md)).

Some test comments also cite `DECISIONS`, `FOLLOWUPS`, `FINAL-PASS #n` or review codes (`N4`, `S16`). These were
the working notes of the review and the repair. Their binding content is in RULINGS.md and KNOWN-BUGS.md; the test
itself states the outcome it asserts.

## Running tests

Read [../AGENTS.md](../AGENTS.md) first: one file or one test name through Nx in about 5 seconds, the load gate for
the slow tier, the strict budget mode (`COMPILER_TEST_BUDGETS=strict` on a quiet machine). Always go through Nx:
running Vitest directly can test a stale `dist` of a dependency.
