# The compiler test oracle

This directory explains the test suite that defines a good TanStack Router/Start compiler. Read it before you
replace or rewrite a compiler (for example to move off Babel).

- [SPEC.md](./SPEC.md): what a good compiler must do. Every clause id a test cites (`J4.12`, `G3`, `§5.7`) is
  defined there.
- [RULINGS.md](./RULINGS.md): the maintainers' decisions behind the spec, and the authorized test workarounds.
- [KNOWN-BUGS.md](./KNOWN-BUGS.md): the bugs of today's compilers, pinned as `.fails` tests, and the upstream
  issues.

## The goal

A compiler that passes `test:unit` and `test:integration` in these five packages is a good compiler:

- `@tanstack/compiler-test-utils` (the shared harness and its controls)
- `@tanstack/router-generator`
- `@tanstack/router-plugin`
- `@tanstack/start-plugin-core`
- `@tanstack/react-start-rsc`

Nothing else decides acceptance. The suite asserts outcomes (what users and the docs see), not today's printed
code, generated names or module layout. SPEC §5 lists what a correct compiler may do differently.

## The seven jobs

| Job                               | What it does                                                                                       | Where its tests live                                                                                                                                                                                                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J1 Route file upkeep              | keeps `createFileRoute('/path')` and its import in sync with the file; generates the route tree    | `router-generator/tests/`; generator watching in `router-plugin/tests/integration/*generator*.test.ts`                                                                                                                                                                                      |
| J2 Route code splitting           | split options load lazily from their own chunks, with identical behaviour                          | `router-plugin/tests/code-splitter-*.test.ts`, `known-bugs-code-splitter*.test.ts`, `integration/build-*.test.ts`; Start's router wiring in `start-plugin-core/tests/integration/start-compose-*.test.ts` and `known-bugs-route-options.test.ts`                                            |
| J3 Route HMR                      | an edited route updates in place in dev; nothing of it in production                               | `router-plugin/tests/integration/route-hmr*.test.ts`, `known-bugs-route-hmr*.test.ts`, `handle-route-update.test.ts`                                                                                                                                                                        |
| J4 Start environment separation   | server code never reaches the client; each environment gets its runtime contract                   | `start-plugin-core/tests/createServerFn/`, `createMiddleware/`, `createIsomorphicFn/`, `clientOnlyJSX/`, `start-compiler-*.test.ts`, `known-bugs-start-compiler*.test.ts`, `integration/start-build-*.test.ts`; the RSC provider in `react-start-rsc/tests/integration/rsc-start-*.test.ts` |
| J5 Deferred hydration `<Hydrate>` | children move to a lazy chunk on the client; hydration identities agree                            | `start-plugin-core/tests/hydrate-*.test.ts`, `known-bugs-hydrate.test.ts`, `integration/hydrate-*`                                                                                                                                                                                          |
| J6 Import protection              | cross-environment imports are reported where they survive compilation; mock in dev, error in build | `start-plugin-core/tests/importProtection/`, `integration/importProtection/`, `integration/rsbuild/import-protection.test.ts`                                                                                                                                                               |
| J7 RSC CSS injection              | CSS of server components reaches the client with the RSC payload                                   | `react-start-rsc/tests/rsc-css-diagnostics.test.ts`, `integration/rsc-css*.test.ts`                                                                                                                                                                                                         |

Each package has a fast tier (`test:unit`: in process, the inner loop) and a slow tier (`test:integration`, under
`tests/integration/`: real builds, dev servers and browser pages).

## Acceptance corpus and implementation tests

The corpus is `test:unit` plus `test:integration`. Tests under a `tests/**/outside-compiler-corpus/` directory are
implementation tests: they check choices of today's implementation (printed bytes, log policy, internal entry
points, performance counters). They run with `test:implementation` (router-generator, router-plugin,
start-plugin-core), and CI runs them too. A correct new compiler may legitimately fail them: delete or rewrite them
with the implementation they describe. The rules for the label are in
[../AGENTS.md](../AGENTS.md#corpus-and-implementation-tests).

## Pins (`.fails`)

A test marked `.fails` (`test.fails`, `it.fails.each`, or `bundler === 'vite' ? test : test.fails`) is a pin: it
asserts the correct outcome for a bug that today's compiler has, so it fails today. Its comment says `Bug:`,
`Impact:` and `Source:`. Pins are fix-agnostic: any correct fix passes them, and where the spec allows a clear
error instead of support, the pin accepts that error too.

When a pin starts passing, Vitest reports "Expect test to fail". That means the bug is fixed: remove the `.fails`
and keep the test as a regression test. A new compiler will flip many pins at once; that is expected and good.
[KNOWN-BUGS.md](./KNOWN-BUGS.md) indexes them by job.

## Real tools only

Tests drive the real tools: real Vite, Rsbuild, Rspack and webpack builds and dev servers, real framework plugins,
real Chromium pages, real React, Solid and Vue runtimes, real HMR clients. They never copy a bundler's, a
framework's or an HMR runtime's logic (RULINGS "real tools only"). A new compiler must therefore work through the
real plugin entry points, not only through an in-process API.

## Running tests

Read [../AGENTS.md](../AGENTS.md) first. It explains how to run one file or one test name through Nx in about 5
seconds, the load gate for the slow tier (at most two slow-tier runs on the machine), and the strict budget mode
(`COMPILER_TEST_BUDGETS=strict` on a quiet machine). Always go through Nx: running Vitest directly can test a stale
`dist` of a dependency. The repository-wide rules are in the root `AGENTS.md`.

## Reading a clause id in a test

Test comments cite the spec like `SPEC J4.5`, `(G3, J2.4)` or `§5.7`:

- `G1`–`G15`: cross-cutting rules (SPEC §3).
- `J<job>.<n>`: a clause of one job (SPEC §4), for example `J6.5` is import-protection report content.
- `§5.N` (or "§5 item N"): a freedom a correct compiler may use (SPEC §5).
- `§1.x`, `§2.x`, `§8`, `§9`: scope, supported inputs, checking rules and evidence still pending.
- `OQ12`–`OQ17`: ruled product questions (SPEC §6).
- `R1`–`R7`: the seven cross-cutting rules the G rules refine (SPEC preamble).
- `D1`–`D14`, `P1`, `P2`, `L3`, `R-09`, `R-14`, `K-19`, `PIN-A`, `D-04`: rulings ([RULINGS.md](./RULINGS.md)).

Some test comments also cite `DECISIONS`, `FOLLOWUPS` or review codes (`N4`, `S16`). These were
the working notes of the review that built the suite. Their binding content is in RULINGS.md and KNOWN-BUGS.md;
the test itself states the outcome it asserts.

## How the suite was validated

- **Adversarial compilers.** Reviewers wrote compiler variants as patches to the product source and ran the whole
  corpus against each. In the final round, all 90 wrong compilers (from four authors over two rounds) were caught,
  and all 34 correct-but-different compilers passed. When first run, the corpus caught 47 of the 50 first-round
  wrong compilers and 18 of the 40 second-round ones, and flagged 5 of 20 and then 4 of 15 valid ones. Every
  escape got a new test, and every false alarm was fixed in the tests or the spec.
- **Independent review.** Two reviewers, each a different AI model, checked every test against the spec, and an
  arbiter settled their disagreements. Every confirmed finding was fixed.
- **Stability.** Every flake seen under load was traced to its root cause and fixed (or pinned when the cause is a
  product bug). The final merges ran every tier twice with identical counts and no flakes.
- **Speed.** On a quiet machine at 4 workers every tier is under its hard budget, no slow-tier file takes over
  15 seconds, and edit to result for one fast-tier file is about 5 seconds.

Counts at hand-over (passed / expected-fail pins):

| Package             | `test:unit` | `test:integration` | `test:implementation` |
| ------------------- | ----------- | ------------------ | --------------------- |
| compiler-test-utils | 250         | 111                | –                     |
| router-generator    | 270 / 30    | 60 / 3             | 81 / 2                |
| router-plugin       | 445 / 179   | 355 / 193          | 53                    |
| start-plugin-core   | 938 / 202   | 853 / 214          | 272 / 7               |
| react-start-rsc     | 50 / 1      | 108 / 11           | –                     |

## Caveat: the oracle is only as good as its last attack

In the second adversarial round, an attacker who could read the tests found 19 input shapes that no test covered.
Each escape is now caught by a row written for it, but a fresh attacker would likely find more. After a major
compiler change, run another adversarial round: ask an independent reviewer, who may read the tests, to write wrong
compilers that pass the corpus, and add a row for each escape. Re-check correct-but-different variants too, so the
new rows do not pin one implementation.
