# The compiler test oracle

This directory explains the test suite that defines a good TanStack Router/Start compiler. Read it before you
replace or rewrite a compiler (for example to move off Babel).

- [SPEC.md](./SPEC.md): what a good compiler must do. Every clause id a test cites (`J4.12`, `G3`, `§5.7`) is
  defined there.
- [RULINGS.md](./RULINGS.md): the maintainers' decisions behind the spec, and the authorized test workarounds.
- [KNOWN-BUGS.md](./KNOWN-BUGS.md): the bugs of today's compilers, pinned as `.fails` tests, and the upstream
  issues.
- [../AGENTS.md](../AGENTS.md): how to run a slice, the helpers, the lanes and the budgets.

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
tools, and judges client code in a real browser. Then it was simplified: the import gate was deleted; diagnostics are
checked by file and position only; import protection is read through `onViolation`; free names come from Yuku; and
the test apps live in temporary directories. What was measured on the integrated branch (FINAL-2, at f16aae85ac, on
beetle with 3 trees × 4 workers, and locally for the budgets), and re-measured after the fixes F-L and F-M (at
57addcc41e, on beetle the same way: 3 unpatched runs, R1–R11, the 34 valid greens, and 18 reds whose catching rows those
fixes touched; every lane locally):

- **Today's compilers pass every acceptance test.** The unpatched suite ran 9 times (3 rounds of 3 trees in
  parallel, 1-minute load up to about 60 on 32 cores).
  - Every tier and lane gave the counts below in every run, except start-plugin-core `test:integration`. That tier
    had one or two #34 rows in 6 of the 9 runs (9 rows), each of which passed alone.
  - No #42 failure, and no other failure.
  - At 57addcc41e: the 3 unpatched runs gave the counts below; one #34 row in one run, which passed alone.
  - FINAL-2 saw one more failure, only locally: router-plugin `integration/generator-watch-mode.test.ts` "webpack: a
    created route file is scaffolded …" failed now and then (3 of 6 full runs, 4 of 15 alone, with `/tmp` on tmpfs).
    F-M found the cause in today's route generator, not in a tool or the file system: an event that reaches
    `Generator.run()` while a run checks events that changed nothing is dropped. Webpack rebuilt right after the
    session's first build (for the route tree that build wrote), and a route file created at that moment was lost.
    That bug is now pinned deterministically (router-generator `generator-dev.test.ts` "events that arrive
    together"), and the watch session starts on an app with its route tree and no recent change, so nothing is
    pending when the test creates the file: 20 of 20 alone runs passed on tmpfs.
- **Restructured compilers pass.** Eleven behaviour-preserving restructures of today's compilers
  (R1–R11) were run against the whole acceptance suite. They cover: moved modules, renamed ids and generated names,
  another printer, reworded diagnostics, another AST seam, other report channels, another server-function provider
  architecture, other chunk layouts, other trace order, and other loader paths. Every failing file was re-run alone
  with and without the restructure.
  - R1, R3–R6 and R8–R11: no acceptance test fails.
  - R2 (moved internal modules) fails only the Q5 row (`handle-route-update.test.ts`, held by its pending ruling).
  - R7 (every compiler diagnostic on the console, a short error to the bundler) failed one row at FINAL-2:
    start-plugin-core `integration/importProtection/reported-location.test.ts` "rsbuild dev: a re-export". Its
    helper `expectNoOtherErrors` took everything before the first colon of the importer as its file, so Rsbuild's
    `webpack:/src/a.tsx:2:1` (the F2 pin) gave `webpack`, and the row passed only because the full report contained
    that word. F-M fixed it: a location is split at a trailing `:line(:column)` only (`locationParts`), and an error
    counts as "about the violation" when it names the importer's file (`mentionsFile`). The row passes under R7 and
    still fails on an unrelated error.
  - At 57addcc41e: R1, R3–R11 no acceptance row; R2 only the Q5 row (and one #34 row, which passed 4 of 4 alone
    with R2).
  - Expected pin flips, where the restructure fixes the pinned bug: R3 ×6 (user names that collide with today's
    generated names), R8 ×10 (SSR runs server functions in place, #7213), R9 ×3 (entry re-export of shared bindings).
  - 4 rows failed once and passed alone, plus 1 that the clean tree also failed alone: all #34.
  - The noncompiler lane (never counted) fails 43 rows under R1: main's own manifest and Rsbuild client-build tests
    build module ids with the `tsr-split` query.
- **Wrong compilers are caught, correct ones pass.** The adversarial variants of rounds 1 and 2 (product patches
  written by reviewers) were run against `test:unit` + `test:integration`; the noncompiler lane was recorded, never
  counted.
  - **All 90 red (wrong) variants are caught**, each by acceptance tests that fail again when their file runs alone
    and pass alone without the variant. None is caught only by a non-acceptance lane.
  - **All 34 valid green (correct but different) variants pass.**
    - green-sol/20 flips its two expected pins (it fixes that bug).
    - green-sol/01 is ruled not a valid green.
    - green-sol-r2/10 failed only a #34 row; it passed 3 of 3 alone runs with the patch.
  - Every red caught in the previous measurement (633a4c0917) is still caught.
    - 68 reds are caught by the same rows, 5 by more rows, and 17 by fewer or other rows. Most of the rows they lost
      were #34 failures (not catches) or were renamed.
    - **red-fable-r2/18** (violation columns reported zero-based) is caught by 100 rows instead of 171. The 53 rows
      that now pass read the importer's file only, through `onViolation`; before, they parsed the printed report.
    - **red-fable/20** (a mixed type/value import treated as type-only) is caught by one row instead of two
      (`v2-type-only.test.ts` "rsbuild dev").
    - red-astra-r2/15 is still caught by its own row only.
  - After S-A and S-B, REVIEW-S (at f16aae85ac) found wrong compilers no row caught: a Start that prints no
    import-protection warning in Vite dev, a wrong-environment `createServerOnlyFn`/`createClientOnlyFn` replaced by
    no function, an unguarded `Buffer` read in a client chunk that also probes `typeof Buffer`, an Rsbuild RSC setup
    that `structuredClone`s rule functions, a compile error located in another module. F-L fixed the tests: each of
    these patches is now caught, and a Start that only calls `onViolation` more often (same printed output) passes
    the `log` rows. The 90 reds and 34 greens above were measured at f16aae85ac, before F-L.
  - Re-run at 57addcc41e (after F-L, which tightened checks, and F-M):
    - the 34 valid greens pass, apart from #34 rows that passed alone and green-sol/20's two expected pin flips;
      **one exception**: in green-sol/17's run the pin `known-bugs-start-compiler-dev.test.ts` "transforms a client
      module with a server fn and a top-level call of a pre-bundled dependency" (a dev-server deadlock) passed once,
      at a load of about 22, and failed again alone (first flip in about 210 suite runs). F-N: the order of the
      test's requests decided it, not the compiler. Vite's dependency optimizer ends its first crawl of static
      imports when no request is in flight 50 ms after it starts; the test's first request came after
      `createServer()` had started the optimizer, and a loaded machine can delay it past those 50 ms, so the
      transform was not in the crawl and did not deadlock. The test now requests the module before the server
      listens (Vite starts the optimizer in `listen()`), so the transform is always in the crawl;
    - 18 reds: the 14 whose catching rows are in files F-L or F-M changed, red-astra/12 and red-fable-r2/13 (caught
      by the dangling-name check, which F-L changed), red-fable/20 and red-astra-r2/15 (each caught by one row). All
      18 are caught, by the same rows as before, except red-fable-r2/18 (99 rows instead of 100: "'always' logs a
      violation again when the dev server reloads every module" now counts printed warnings and passes) and
      red-fable/25, whose second row had failed only on #34.
- **No internal imports.** The only internal import left in acceptance tests is the Q5 row, held by its pending
  ruling.
- **Tests write nothing into the repository.** After a full unpatched run of a tree, `git status --porcelain
--ignored` and the packages' `node_modules` dot entries are the same as before.
  - The only file a run writes is the Q2 route tree of router-generator's `nested` fixture.
  - Outside the repository, a run can leave Chromium's `.org.chromium.Chromium.*` directories in the system
    temporary directory. At FINAL-2 it could also leave its run directory `tanstack-compiler-tests-*` with an empty
    `generator/` (13 of 20 runs on beetle). The cause: each test process removed its apps when it exited, while
    Vitest's global teardown removed the whole run directory, and Node's `fs.rmSync` (Node 24 and 26, not 22)
    returns without an error and leaves the rest behind when another process removes part of the tree meanwhile
    (an upstream Node bug). Since F-M the run's teardown alone removes the run directory: no run directory was
    left in 66 beetle jobs and 5 local router-plugin runs.
- **Fast, with little margin.** On a quiet machine (load below 4 at the start, no other test run) at 4 workers,
  every tier passed its hard budget in strict mode in its valid runs. No slow-tier file took over 15 s:

  | Package                         | `test:unit` (target / hard) | `test:integration` (target / hard) | slowest slow-tier file |
  | ------------------------------- | --------------------------- | ---------------------------------- | ---------------------- |
  | `@tanstack/compiler-test-utils` | 2.7 s (2.5 / 4)             | 7.7 s (9 / 15)                     | 6.7 s                  |
  | `@tanstack/router-generator`    | 3.7 s (3 / 5)               | 6.6 s (8 / 12)                     | 6.5 s                  |
  | `@tanstack/router-plugin`       | 8.3 s (7.5 / 10)            | 70.3–70.9 s (60 / 80)              | 12.0 s                 |
  | `@tanstack/start-plugin-core`   | 5.8–5.9 s (5.5 / 8)         | 84.8–85.0 s (65 / 90)              | 14.6 s                 |
  | `@tanstack/react-start-rsc`     | no test files               | 12.9 s (13 / 20)                   | 6.1 s                  |

  start-plugin-core `test:integration` is about 5 s under its hard limit. Another agent's test runs on the same
  machine pushed it over twice (91.0 s, 93.3 s). Runs with a #34 failure, and the router-plugin runs that hit the
  watch row above, are not measurements. Several tiers are over their target and under their hard limit.

- **Memory.** start-plugin-core `test:integration` uses about 4.4 GB per worker (#57). Three such runs at once took a
  60 GB machine to 0 GB available, so the measurement runner lets at most two run at a time.

Counts on the integrated branch, measured at 57addcc41e (the S-A and S-B simplifications, the Q6/Q7 rulings,
NOL-delete, the main-tests clean-up, F-J, the clean-up after them, F-L and F-M; see below), the same in the 3
unpatched beetle runs and the local run of every lane apart from #34 rows. Passed / expected-fail pins:

| Package                         | `test:unit` | `test:integration` | `test:noncompiler` |
| ------------------------------- | ----------- | ------------------ | ------------------ |
| `@tanstack/compiler-test-utils` | 77 / 0      | 131 / 0            | –                  |
| `@tanstack/router-generator`    | 240 / 31    | 67 / 3             | –                  |
| `@tanstack/router-plugin`       | 107 / 20    | 674 / 349          | –                  |
| `@tanstack/start-plugin-core`   | 270 / 132   | 1202 / 293         | 148 / 0            |
| `@tanstack/react-start-rsc`     | no files    | 108 / 13           | 57 / 0             |

How the counts moved from d07614d3b3 (ctu 330 / 0 and 171 / 0; router-plugin `test:integration` 674 / 355;
start-plugin-core 389 / 143 and 1204 / 292; noncompiler 121 / 0 and 49 / 0):

- **S-A** (import gate, violation-report reader and diagnostic word-list controls deleted, pins that only asked for
  message content deleted; RULINGS "diagnostics: file and position only"): ctu `test:unit` −147 (import gate 9,
  diagnostics controls 138); router-plugin `test:integration` −6 pins; start-plugin-core `test:unit` −118 passed,
  −6 pins (124 reader controls; 6 F1 column pins now check the line and pass), `test:integration` −2 passed, −2 pins.
- **Q6/Q7** (RULINGS "Q6", "Q7"): start-plugin-core `test:unit` −1 passed (3 Q6 rows on a hand-built Start package
  deleted, 2 real-app rows added: Start's own `createCsrfMiddleware`, a `createMiddleware` read through a namespace of
  a re-exporting module) and −3 pins (the in-process CommonJS pin), `test:integration` +3 pins (the CommonJS pin
  through real apps: Vite and Rsbuild builds, Rsbuild dev).
- **main-tests**: main's tests of features that are not compilers back at main's paths with main's content
  (noncompiler: start-plugin-core 121 → 147, react-start-rsc 49 → 57); main's tests of compiler internals deleted.
- **F-L** (the REVIEW-S findings): start-plugin-core `test:noncompiler` +1 (main's `rsbuild/plugin.test.ts`, #7482,
  restored); no other count changed.
- **F-M** (the FINAL-2 findings): router-generator `test:unit` +1 passed, +1 pin (the dropped generator event, and
  its control).
- **NOL-delete** and the clean-up after the merge: the implementation lane is gone (below); no acceptance row
  changed, apart from start-plugin-core `test:unit` −2 pins (the F1 caret pin, which read the code frame: RULINGS
  "code-frame column (F1)") and ctu `test:unit` −34 (the controls of the deleted Node stand-ins `module-linker`,
  `lazy-probe` and `importBindings`, and of a determinism projection that ran through `module-linker`).
- **S-B** (free names from Yuku's semantic model in `free-names.ts`, replacing the hand scope analysers
  `validate-module.ts`/`source-attribution.ts`; router-plugin's production bundle compared with its `addHmr: false`
  control build, replacing `added-code.ts`): ctu `test:unit` −72 (validate-module 68, added-code 4), ctu
  `test:integration` −40 (the build harness's 32 dangling-name rows, validate-module-build 2, added-code 6). No
  acceptance row of the compiler packages changed.

The measurement F-E-b ran at 45f58967ea. The passes below came after it and are covered by F-H (633a4c0917; the F-I
pass by F-H's start-plugin-core part) and by the measurement above (FINAL-2, f16aae85ac). The final pass F-F (October 2026) re-audited "no re-implementation; client semantics in a browser" file by file and changed tests and
helpers (below); its changes were validated locally (every tier and lane above, the strict import gate, since deleted). Count changes against
45f58967ea: ctu `test:unit` −3 (the controls of the deleted
Node stand-in `evaluateServed`), ctu `test:integration` +1 (a control of the build-decided dangling-name check),
router-plugin `test:implementation` −1 (the control of a deleted path filter), start-plugin-core `test:unit` +4
(controls of the content-based suggestion reader). The final pass F-G2 (after F-F, validated the same way) changed:
router-plugin `test:integration` +1 (the webpack `addHmr: false` build cell replaced by a webpack dev server row and
its control), start-plugin-core `test:integration` +1 (a control of the unused-chunk pins of
`known-bugs-hydrate.test.ts`), start-plugin-core `test:implementation` +1 (a control of the safe-mock probe), ctu
`test:integration` +3 (controls of `hmr-sync.ts`, one of them for an update the page invalidates), start-plugin-core `test:unit` −1 expected-fail row (the fast-tier
copy of the computed-member request middleware pin; its build twin in `integration/start-build-call-shapes.test.ts`
pins the same input and outcomes through a real request). No pin site was added or removed. The pass F-G1 (after F-F) builds the apps of the start-plugin-core,
router-plugin and react-start-rsc harnesses with the plugins a real app configures ("How tests reach the
compilers"); no count or pin changed. NOL-delete (2026-10-22, after F-H) deleted the branch's own implementation-lane
files: tests of test helpers, of today's compiler internals and of non-compiler behaviour, and router-plugin's
legacy harness (53 files); with main-tests and the Q6/Q7 legacy clean-up, nothing was left in the implementation
lane, so its targets went too. Every acceptance tier and noncompiler lane kept its count.
The pass F-I (after V-G1) made the #7213 rows of start-plugin-core `integration/known-bugs-start-compiler.test.ts`
deterministic (caveats below): start-plugin-core `test:integration` +3 passed and +4 expected-fail rows (the Vite
cells of the middleware caller where SSR code imports the server fn removed; a pin site added: the caller only client
code imports, on both callers and bundlers, pinned on Vite; the D6 control split in two, its SSR-code half not run on
Vite). A traced run of every start-plugin-core and react-start-rsc acceptance tier found no other row whose outcome
depends on that race. The validation V-I (after F-I) added start-plugin-core `test:integration` +2 passed rows: a
control, on both bundlers, of a server fn the app's server entry defines, called from SSR code (caveats below).
Without it, a Vite compiler whose resolver drops every server fn the client build did not find passed every
acceptance tier.
The pass F-J (after V-I) made the tests hermetic: no test writes into the repository. The harnesses create their apps
in the system's temporary directory, standing in for the package directory they were created in before (same
dependencies through linked `node_modules`, same `tsconfig.json`; `src/app-directory.ts`), and router-generator runs
its fixtures on copies (only the route tree of the `nested` fixture is still written in place, for the `types` project
Q2 holds). No count, pin or outcome changed: on the baseline of that pass every tier and lane gave the same counts
with and without it, test by test, apart from #34 rows that passed alone.

The `test:unit` counts include the pending-rulings lane: 1 row in router-plugin (Q5).

Caveats:

- **Pending user rulings hold some rows** (table below). They count toward acceptance as they are until ruled, and a
  correct compiler may fail some of them: the Q5 row imports compiler internals (R2 fails it), and the others
  (Q1, Q2, Q8–Q10, NEW-1, NEW-2) keep an assertion or input whose fate the ruling decides.
- **Two upstream flakes are closed** (rulings of 2026-10-23).
  - #34 (Vite's optimizer writes into the app after `close()`): it failed one or two start-plugin-core integration
    rows in about half of the runs, with an `ENOTEMPTY` on `node_modules/.vite/deps_temp_*` (or on the app directory)
    when the app was removed, or with an unhandled "Error during dependency optimization" (rolldown "Failed to write
    file") from a write into the removed app. The Vite dev harnesses now wait for the optimizer before `close()`
    (RULINGS "Vite's dependency optimizer: close wait"); 5 local start-plugin-core integration runs had no #34
    failure. If that `ENOTEMPTY` or rejection is seen again, it is this race, not a compiler failure: report it.
  - #42 (Vite's stale pre-bundled dependency): not reproduced since 2026-10-22, closed with no workaround (RULINGS
    "Vite's stale pre-bundled dependency: closed"). Its signature is in KNOWN-BUGS; reopen it if seen.
  - Not a flake of the tests, and no longer a row: at an extreme load (80 to 110 on beetle) V-G1 saw the Vite row
    `known-bugs-start-compiler` "SSR: a server fn that only a middleware .server() of another module calls > is
    callable, the app files written reversed" fail once in 15 runs with "Server function info not found". That was
    today's compiler losing the #7213 race: when SSR code imports the middleware's module, the Vite SSR build
    reaches it and the server fn resolver in parallel, and the resolver lists only the server fns found before it
    loads (won by 1 to 9 ms in traced idle runs). No app input orders the two in that layout, so the pass F-I removed that Vite
    cell (Rsbuild keeps it: it rebuilds the resolver after the compilation) and pins the caller deterministically:
    rows where only client code imports the server fn, whose middleware the SSR build then reaches only through
    the resolver. The same race decides any Vite build in which SSR code imports a server fn the client build did
    not find. F-I traced the start-plugin-core and react-start-rsc acceptance tiers (`test:unit`,
    `test:integration`) and found one more: the D6 control "SSR: a server fn the client references is callable over
    HTTP, and a server-only one from SSR code" (won by 12 to 14 ms). Its SSR-code half is no longer run on Vite
    (the D6 pin, red either way, still asserts it); react-start-rsc's builds find their server fns in an earlier
    build step (the RSC plugin's scan builds), and dev servers resolve server fns by id, without a generated
    resolver. An app does fix the order when its server entry defines the server fn: the SSR build compiles the
    entry before any module it imports, the resolver included (V-I traced it with the entry's compile delayed by
    1.5 s). The control "SSR: a server fn the server entry defines and only server code references is callable
    from SSR code" asserts that call on both bundlers.
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
  Rspack and webpack (`build-harness.ts`), and router-plugin's webpack entry also runs on `webpack-dev-server`
  with a browser page (`tests/webpack-hmr-page.ts`).
- **Apps are configured as an app's config file configures them.** Start apps get `tanstackStart()` of the built
  framework package (`@tanstack/<framework>-start/plugin/vite` or `/plugin/rsbuild`; start-plugin-core
  `tests/start-plugins.ts`), so the framework package's own options and configuration apply, and the framework's
  own plugin (`@vitejs/plugin-react` or `@rsbuild/plugin-react` unless the test gives it, `vite-plugin-solid`,
  `@vitejs/plugin-vue` with `@vitejs/plugin-vue-jsx`). A harness gives an app entries only through Start's
  documented `client.entry`/`server.entry`, and only where the app has none of its own. router-plugin's Vite
  builds add the framework's Vite plugin, its Rsbuild builds `@rsbuild/plugin-react`; plain webpack and Rspack
  builds, which have no framework plugins, use the loaders an app configures (the bundler's TypeScript/JSX
  transform for React, `babel-loader` with `babel-preset-solid` or Vue's `@vue/babel-plugin-jsx`). The packages' own hosts build on these: router-plugin's `route-app.ts`
  (a route file loaded as an app loads it, registered by the plugin's own generator) and start-plugin-core's
  `start-host.ts` (a Start app with a real router and a probe route). Hosts are shared within a test process and
  leased to one test at a time.
- **Server code** runs inside real requests through Start's server entry, with a real router. Nothing builds
  Start's request context by hand. Middleware runs for a server function called over HTTP or from server code inside
  a real request, or as the app's request middleware, route handlers for a request of their path. Only the client
  middleware rows of ruling Q3 call a middleware's client options with a stand-in `next`, to read what the client kept. A server function is identified by its public `url` (the
  server function base, then its id), never by Start's own metadata fields.
- **What a dev server serves** to a client is read through Vite's own module graph of the environment (static and
  lazy imports), never by parsing served code for imports.
- **Client code runs in Chromium.** `browser.ts` runs scripts in bounded run pages (a fresh document per run) and
  opens pages of the app for the page tests, with the real Vite client, the framework's refresh runtime, real ES
  module linking and the real framework renderer. Nothing judges client semantics in Node (no jsdom, no fake
  `window` or `import.meta.hot`).
- **Edits** are written to disk like a user's, reported by the real watcher, and settle on their outcome within one
  bound (`outcome.ts` `waitForOutcome`), never on counts of compiles or updates or on a quiet period. Whether a
  page reloaded, or got an update in place, is told by the page once it handled everything the server sent, and
  what that made it ask of the server (an accept callback's `invalidate()`) (`hmr-sync.ts` `settlePage`), not by a
  time bound or by counting HMR messages.
- **Laziness and provenance.** Which modules a compiler emitted is told by provenance (the plugin's own `load` and
  `transform` hooks observed in that build), never by id, path or the helper that builds a lazy value.
- **Dead code (G8)** is decided on a real production build: a dev module that reads a name it never declares fails
  if the production build of the same app still reads it, or if that build fails the build harness's own
  dangling-name check (it may spell the name otherwise). A module's free names come from Yuku's semantic model
  (`free-names.ts`), minus the environment's globals and names the module checks with `typeof`. In a production
  build the chunk's free reads are attributed to the modules that read them (`build-harness.ts` `nameCounts`):
  each module decides for itself whether its read is guarded, so another module's `typeof` does not excuse an
  unguarded read, and a module whose rendered code in a Vite build lost the name is no reader. A chunk Yuku cannot
  parse fails the check. Routes compiled
  with route HMR, and modules checked without their app (router-plugin `router-plugin-context.test.ts`), have no
  production build to decide: their free names count as they are, which is stricter than G8.
- **Nothing dev-only in production (G7)**: router-plugin builds each production app twice, with the defaults and
  with `addHmr: false` (`NODE_ENV=production`), and the chunks must be equal; the production page must render.
  Start has no HMR-off build (J3.7): its dev-support check is a browser trap (`global-trap.ts`).

## Diagnostics

Every channel is read together (`diagnostic-channel.ts`): console, process streams, Vite's logger, Rsbuild's
logger, and bundler compilations (warnings and errors), in dev and in builds. A diagnostic is checked only for the
file it names (absolute or project-relative, §5.7) and the position (`line:column`, or the line) where required
(`diagnostics.ts`; RULINGS "diagnostics: file and position only"): never its wording, the API or option it names,
the cause it gives or its code frame. Severity is checked: where SPEC says "warn", a diagnostic must be at least a
warning (an info or log line does not count), and where it says the build fails, it must fail (RULINGS "diagnostic
severity"). With a file, a `line:column` or `:line` counts only after the text names the file (a code frame's
highlighted line counts anywhere); a Start compile error must name the module (`expectCompileError`). "Nothing
reported" (`expectNoProblems`) reads every channel. Import-protection violations are read from Start's public
`onViolation` callback, never parsed from the printed report (RULINGS "import-protection reports through
`onViolation`"); that each one is printed, as a warning or an error naming its importer's file and position, is
checked by `expectViolationsAt` (dev servers and builds) and `expectPrinted`, and the `log` rows count the printed
warnings that name the importer, not `onViolation` calls.

## Lanes

| Lane            | Where                                                                                                           | Targets                                                          | Decides acceptance |
| --------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------ |
| Corpus          | `tests/**`, except the noncompiler list                                                                         | `test:unit`, `test:integration`                                  | yes                |
| Pending rulings | the Q5 control in router-plugin                                                                                 | `test:unit`, `test:integration` (held in the corpus as they are) | yes, until ruled   |
| Noncompiler     | main's own tests at main's paths, listed in `tests/noncompiler-tests.json` (start-plugin-core, react-start-rsc) | `test:noncompiler`                                               | no                 |

The corpus (acceptance) is the compilers' test suite. Main's own tests split in two:

- **Tests of features that are not compilers** (start-plugin-core: Start manifest, sitemap, prerender, CSRF config,
  schema, entry planning, post-build, output directory, watch-ignored, `createVirtualModule`, dev styles, utils, the
  Rsbuild RSC rule cloning of #7482;
  react-start-rsc: the RSC runtime components, streams, `createRscProxy` and the type tests) are untouched: main's
  paths, main's content. The noncompiler lane runs them; the corpus projects leave them out.
- **Tests of today's compiler internals** (internal functions called directly, exact output text or snapshots,
  internal classes) are deleted: the corpus covers their behaviour through public entry points.

There is no implementation lane (RULINGS "oracle tests only"): tests of test helpers, of today's compiler internals
and the branch's own tests of non-compiler behaviour were deleted (NOL-delete, main-tests, 2026-10-22); the bugs
only they pinned are recorded outside the repository, not in KNOWN-BUGS. CI runs both lanes. This package's own
tests are controls of the shared harness.

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

| Ruling | What it holds                                                                                                                                                                    |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1     | router-generator `concurrent-write` and fault tests that inject an `fs` into the generator                                                                                       |
| Q2     | the `FileRouteTypes` check in `router-generator/tests/generator/nested/tests.test-d.ts`                                                                                          |
| Q3     | ruled 2026-10-23 (RULINGS "Q3"): no stub ships; the client middleware `.options.server` absence checks stay as they are                                                          |
| Q4     | ruled 2026-10-23 (RULINGS "Q4"): a star re-export of a denied module is a safe mock, or the build fails (dev: warns); never a secret or crash                                    |
| Q5     | router-plugin `tests/handle-route-update.test.ts`: the absent-live-route updater control, which calls the emitted update function directly                                       |
| Q6     | ruled 2026-10-22 (RULINGS "Q6"): the rows driving the internal compiler with a hand-built package graph are deleted; real-app tests cover what they meant                        |
| Q7     | ruled 2026-10-22 (RULINGS "Q7"): reachable; the CommonJS pin is now a real-app pin in `start-plugin-core/tests/integration/known-bugs-start-compiler.test.ts`                    |
| Q8     | the RouterPluginContext / multi-plugin question (`router-plugin/tests/integration/pages/router-plugin-context.test.ts`)                                                          |
| Q9     | the immediate `tsr.config.json` reload pin                                                                                                                                       |
| Q10    | the owned-import numeric cap in `router-generator/tests/owned-edits.ts`                                                                                                          |
| NEW-1  | the decorator-after-`export` pin (`router-plugin/tests/integration/pages/known-bugs-code-splitter-bindings.test.ts`)                                                             |
| NEW-2  | whether redundant parentheses around component-defining expressions are free; they break React Fast Refresh registration under SWC/Rsbuild (SPEC §5.5 records the open question) |
| #34    | ruled 2026-10-23 (RULINGS "Vite's dependency optimizer: close wait"): the Vite dev harnesses wait for the optimizer before `close()`                                             |

Accepted for now, to revisit at the end (2026-10-23): start-plugin-core integration memory (#57). Its workers keep
modules across files (about 4.4 GB each) to stay within the tier's time budget (RULINGS "test budgets").

The legacy helpers (start-plugin-core `tests/outside-compiler-corpus/legacy/` with `tests/start-runtime.ts`,
router-plugin's `tests/outside-compiler-corpus/legacy/`) and the Node stand-ins of this package (`module-linker`,
`render`, `lazy-probe`) are deleted: nothing used them once Q6 and Q7 were ruled.

## Re-running the measurements

- **Restructure variants.** Each variant is a patch of the product source that keeps its behaviour (R1–R11). The
  runner applies one, builds through Nx, runs every acceptance tier, re-runs each failing file alone with and
  without the patch, and reports per test: `fail`, `fail-load`, `pin-flip`, with an attribution to the helper that
  threw. Expected pin flips (a variant that fixes a pinned bug) are listed separately. The runner and the patches
  are in the repair's working notes, not in the repository (`validation/REPAIR/variant-runner/`: its README, and the
  patch set of the last measurement in `patches/`; notes on each restructure in `validation/COUPLING/variants/`):
  `VRUN_VARIANTS=$PWD/patches bash local.sh <commit> <outdir> [R1 R2 ...]` runs them on one local tree
  (`VRUN_EXTRA_LANES=1` also records the noncompiler lane, never counted; the implementation lane it used to
  record is gone). Patches are diffs of
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
