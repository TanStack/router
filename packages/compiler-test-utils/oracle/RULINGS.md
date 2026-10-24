# Rulings behind the oracle

The maintainers' decisions that shaped [SPEC.md](./SPEC.md). Each entry says what was decided, why, and which
clauses it affects. The spec cites them as `[ruling: <name>]`; tests cite the short ids (D5, P1, L3, …). Where
a ruling and an older test comment disagree, the ruling wins.

## Scope and method

### first review rulings

- A test that asserts a current limitation as if it were the goal is split in two: a loosened regression test
  (correct output, user informed when not split) and a `.fails` goal pin (see "limitation tests").
- Goal tests sit where the outcome is decided. The compiler decides semantics, identity, validity, absent server
  code and warnings; the bundler decides final chunk placement and dead-code elimination, which therefore are
  build-level assertions per bundler, with `sideEffects` and `@__PURE__` hints varied.
- Some exports genuinely prevent splitting (eagerly imported elsewhere, or a side-effectful initialiser without a
  purity hint). Expected outcome: correct, one instance, user informed.
- Method shorthand (`component() {…}`) is splittable and refreshable like any option.
- Spread and computed option keys are best effort; the fallback must be safe (never prune a route or skip it for
  prerendering because a key was missed).
- Initialiser timing is not pinned: tests check run-once and the same value everywhere.

Why: the suite must accept every correct implementation. Clauses: G2, G3, J1.9, J2.4, J2.8, J2.9, §8.

### limitation tests

When the user can fix a pattern, the tool warns. When the obstacle is our own analysis, that is a bug: a `.fails`
goal pin, plus a passing loosened test for the safe fallback. Best-effort cases get only the loosened test. Clauses:
G5, §8.

### generated names

Generated identifiers (`TSRComponent`, `fn_createServerFn_handler`, `__tss_deny_0`, …), virtual-module ids and
query strings are a black box. No test may depend on them. Clauses: G9, §5.1, §5.3.

### P1: route module exports

Neither "exports unchanged" nor "extra exports allowed" is the spec. A compiler may add exports, and may remove
exports nothing imports. Every export that something actually imports (another module, a test file, another route)
keeps working, with the same value and instance the route itself uses. Tests assert through a real importer, never
on the export list. Clauses: G9, J2.4, J4.13.

### P2: SSR handler placement

Only the client must be free of server-function handler code. When SSR runs in the same environment as the
server-function provider, keeping the handler in place or extracting it are both allowed. SSR tests assert
behaviour only (calls run the handler, top-level code runs once, HTTP calls by id work). Clauses: J4.3, §5.4.

### real tools only

Test infrastructure never re-implements another tool. Tests of what a bundler, framework or HMR runtime decides
drive the real tools (real dev servers with the real framework plugins, the real HMR client, real `react-dom`,
Solid and Vue runtimes, real production builds) and observe outcomes. Thin glue only at unavoidable boundaries,
each with its own contract test. Why: a copy of Vite or React Refresh logic tests the copy, not the compiler.
Clause: §8.

### runtime bugs

A corpus pin must have its cause in a compiler: the J1–J7 sources or their bundler integrations. A pin whose cause
is a runtime package (for example a hydration boundary in `react-start-client`) is deleted from the corpus. Babel
(`@babel/generator`), babel-dead-code-elimination and unplugin count as the current compilers' implementation
choices: a rewrite that drops them passes those pins, so they stay. Clauses: §1.2, §8.

### valid alternative compilers

Adversarial "correct but different" compilers showed tests that were too strict. Each of these is valid and must
pass:

- a diagnostic naming the file for a template-literal route id, instead of a rewrite (J1.1);
- keeping a factory import the edit made unused (J1.2);
- no warning about unusual but valid param names (J1.12);
- minimal code-frame context: tests prove the original source with a token on the reported line itself (§5.7, §8).

### dangling names

A compiled module may reference an undefined name inside code that never runs, if every supported bundler deletes
that code in the production build. A dangling name that survives into a production client bundle is a bug. The
check runs on the real production output per bundler. It covers exactly the modules the compilers under test
produced or changed (user and route modules after our transforms, split chunks, virtual and support modules,
dependency modules our plugins transformed). Inside that scope every free name counts, unless the module's original
source already reads it free. Modules no compiler touched are out of scope: Rspack and webpack drop some bindings
in unminified dead code of untouched dependencies (see KNOWN-BUGS.md, upstream issues), and that is not a compiler
defect. Clause: G8.

### diagnostic severity

§5.7 frees the channel and the wording of a diagnostic, not its severity. Where the spec says "warn", the
diagnostic must be at least a warning: a warning, or an error where the clause allows refusal. An info or log line
does not satisfy it. Where the spec says the build fails, it must fail. The shared matchers
(`compiler-test-utils/src/diagnostics.ts`, `DiagnosticExpectation.severity`) accept a warning or an error unless a
test asks for less, and read the severity of every channel, in dev and in builds. A clause that says "warn" and
allows no refusal asks for `'warning'`; an option that asks for a warning explicitly (`mockAccess: 'warn'`) is
checked at that severity. Clauses: G5, §5.7.

### diagnostics: file and position only

2026-10-22, user: "We should just test the minimum ('file + position' could be enough). Testing more than that,
once the error message is actually implemented, will be equivalent to testing '1 = 1'." An English word list to
judge a message "seems like an incredibly bad idea". A diagnostic is checked only for: being reported (as an error
or a warning, at the severity the spec gives where a test needs it), on a channel the user sees, naming the file
(absolute or project-relative) and the position (`line:column`, or the line). The build fails / does not fail and
a warning is / is not emitted stay outcomes. Nothing else of the message is checked: no API or option names, no
cause or guidance, no environment phrase, no code-frame layout. The environment-misuse runtime error (J4.10) is
checked by the call throwing. This replaces the former "explaining a diagnostic" ruling (`explains`) and the "API
or option named" half of D14. Clauses: G5, J2.8, J2.19, J4.10, J6.5, J6.12, §5.7.

### import-protection reports through `onViolation`

2026-10-22, user: "read the callback, delete the parser". Which violations import protection reports, where (the
importer's file and location) and with which chain are read from Start's public `onViolation` callback
(`tanstackStart({ importProtection: { onViolation } })`, guide/import-protection.md), never parsed from the
printed report. The printed report is checked only for the file and position it names (above): each violation
`onViolation` received is printed, as a warning or an error naming its importer, and `log` is judged on the printed
warnings. Clauses: J6.3, J6.5, J6.6, J6.12.

### no import gate

2026-10-22, user: "delete it". The static import gate (`test:import-gate:strict`) is deleted, with no
replacement; acceptance tests keep reaching the compilers through public entry points by review. Clause: §8.

### oracle tests only (2026-10-22)

The suite holds acceptance tests only: real tools, observable outcomes, public entry points. Tests of test helpers,
tests of today's compiler internals and the branch's own tests of non-compiler behaviour are deleted, not kept in a
separate lane; there is no `test:implementation` target. Main's tests of features that are not compilers stay at
main's paths with main's content (`test:noncompiler`, listed in each package's `tests/noncompiler-tests.json`);
main's tests of compiler internals are deleted. Bugs pinned only by deleted tests are recorded outside the
repository, not in KNOWN-BUGS. Clause: §8.

### restructured compilers

A correct compiler built differently from today's must pass every acceptance test. The repair measured this with
behaviour-preserving restructures of today's compilers (R1–R11: moved modules, renamed generated names, reworded
diagnostics, another printer, another provider architecture, other chunk layouts, extra exports, …). Rulings on
what those restructures may do:

- Extra exports of compiler packages (R7) and extra metadata on runtime objects (R8: `name`/`filename` on SSR
  client middleware, §5.19) are allowed.
- Import-protection traces may list the entry last (R10). J6.5 asks for a real bounded chain from an entry and J6.12
  leaves the display free: the entry must be identifiable (by position or marker) and the direction unambiguous.
  Tests must not require entry-first numbering or an `(entry)` marker.
- Pins whose inputs choose names that collide with today's generated names flip when a compiler generates other
  names (R3). That is expected (the inputs are valid); the adaptive pins next to them, which read the names a
  compiler actually generates, are the structure-free checks.

Clauses: §5.1, §5.19, J6.5, J6.12, §8.

### test budgets

Budgets serve local iteration, not CI: the hard limits are local runs at 4 workers (fast tier, slow tier per
package, 15 s per slow-tier file, edit to result for one fast-tier file); CI times are reported only. A tier over
budget is fixed, not re-budgeted: one shared host per worker, bounded browser pages, and browser-heavy files moved
to the slow tier's `integration-pages` project. No Nx target splits or sharding to meet a number. Clause: §8.

Memory against speed (#57, 2026-10-23): start-plugin-core's integration workers keep modules across test files
(`isolate: false`, about 4.4 GB per worker at peak), which keeps the tier within its 90 s limit (about 93 s without).
Accepted for now ("ok for now, though when we get to the end, we'll have to have a look at memory and speed."), to be
revisited at the end of the oracle work.

### D4: no compile-speed benchmark

No compiler benchmark or performance test is part of the oracle for now. Clause: §1.2.

### D14: warning wording

Warning and error wording is free. Since 2026-10-22 ("diagnostics: file and position only") a test checks only
the file and the position a diagnostic names. Clauses: G5, J2.19, §5.7.

### file names in diagnostics

File names may be absolute or project-relative, if unambiguous. A bare basename that is only a suffix of the
project-relative path (`other.ts` for `src/other.ts`) does not name the file. The shared diagnostics check
(`mentionsFile`) follows this rule: the absolute path, or the project-relative path as a whole path. Clause: §5.7.

### user-added environments

Import protection in environments the user adds outside Start is undefined behaviour: no test either way. If a
choice is ever forced, lean "left alone". Clauses: §2.2, §1.3.

### recompiling Start output

Compiling Start output a second time (the plugin registered twice, a dependency shipping Start-compiled output) is
not supported; even an internal error is fine. No test. Clauses: §2.2, G14, §5.16.

### prerender discovery

Prerender discovery and SPA-mode prerendering are out of scope. Only the safety rule stays: never skip a route
because a key was missed (J1.9). Clause: §1.2.

### unknown template tag

An unknown `%%tag%%` in a custom scaffolding template becomes an empty string. Fine, no test. Clause: §2.2.

### D1: published client source maps

A client source map's `sourcesContent` holds the whole original file, including server code the JavaScript dropped.
Out of scope: a known limitation, no test (the production checklist in the docs mentions it). Clauses: §1.2, G6.

### D3: bundler scope

webpack should work but is low priority; it is in the matrix. esbuild: no work; the only requirement is "works or
refuses clearly". Clauses: §1.3, J2.18, C12.

### sensible, not paranoid (2026-10-24)

The user, on the outcomes-only audit: tests must be sensible, not paranoid. The implementer is smart and may adjust
a test that pins an incidental detail, so a test does not over-specify. Left as they are: the diagnostic details the
audit listed (message wording, which channel an error is printed on, exact positions inside a construct; see
"diagnostics: file and position only") and the generated file's own type names such as `FileRoutesByTo`. What a
test must not do is constrain a correct compiler's design (output shape, module layout, order), depend on harness
details a correct compiler changes, contradict a ruling, or pass without checking anything (a check that filters
on something asserts that it found it). Clauses: §5, §8.

## Router (J1–J3)

### one route per file

File-based and virtual routing: one route per module, exported as `Route`. A file route module that also creates
another route object is not supported (no split or HMR requirement); two `createFileRoute` calls in one module
must never fail silently. Code-based routes are split by hand with `.lazy()`; the router-plugin compilers never
see them. Why: the docs show nothing else, and real projects do not do it. Clauses: §1.2, §2.1, §2.2, J2.1, J2.11.

### R-09: a route created inside a function of the same file

Unsupported but user-fixable. A correct split (renders, hot-updates) and "unsplit plus a warning naming the file"
both pass, in every mode. Crashes and rendering the wrong component are bugs. Clauses: §2.2, J2.10.

### route options from a function call

`createFileRoute('/')(makeOptions(…))` may reload the whole page on every dev edit; the edit must take effect.
Clauses: §2.2, J2.8, J3.3.

### D5: a split chunk holds only what it needs

A split chunk contains only what its option needs (unused exported functions and classes copied into every chunk
are a bug). The compiler decides this, so compiler-level checks are allowed, plus a build-level check. Clauses:
J2.5, §5.3.

### D9: deprecated `assert` import attributes

Keep supporting `import … assert { type: 'json' }`: the import keeps working wherever it lands. The printed keyword
(`assert` or `with`) is free, since no public host observes it (coordinator 2026-10-21). Support may be dropped once
nobody uses it. Clause: J2.17.

### D10: Solid and Vue split components across hot updates

Component identity is kept, as for React. Clause: J3.2.

### D11: not-split warnings

Warn for anything that should have been split but was not, when the user can fix the pattern. If our analysis is
the obstacle, it is a bug to fix (goal pin), not a warning. Clauses: G5, J2.8.

### D12: root routes

Root `errorComponent` and `notFoundComponent` should be split (goal pin); leaving the root unsplit is acceptable
but not preferred. The root `component` always renders and need not be split. Clauses: J2.7, §5.10, C1.

### exported Route readers

A function the route module exports that reads `Route` must be one instance for importers and the route. A copy
in a chunk is a bug, even for a stateless function. Clauses: G9, J2.4.

### L3: imports used only for types

A route module's import used only for types does not load its module in the client (its side effects do not
run). The splitter decides this regardless of `verbatimModuleSyntax`. Clauses: G2, G3, J2.5.

### PIN-A: pathless layout under a lazy-only route

`posts.lazy.tsx` (no `posts.tsx`) plus `posts/_layout.tsx` with children: the lazy-only route's virtual anchor is
the layout's parent. Attaching it to the next real ancestor is a bug. Clause: J1.14.

### childless pathless layout

`_auth.tsx` next to `index.tsx`, with no children yet, is a valid route: no error. Clause: J1.15.

### K-19: `tmpDir` on another device

When `tmpDir` is on another filesystem, the generator writes the temporary file beside the destination and renames
it there. Copy-then-unlink is not acceptable (a reader can see partial content). Clause: J1.16.

### .lazy.vue

`x.lazy.vue` is a lazily loaded `component` piece of route `x`, not a lazy route module. An empty `.lazy.vue` is not
scaffolded with TypeScript route code. Clauses: §2.1, J1.3, J1.17.

### D-04: a JSX pragma after the imports

Preserve the original file's effective JSX runtime decision: a pragma the transform ignores in the untouched file
must not become effective in a chunk. A warning plus leaving the file unsplit also passes. Tests assert the
rendered outcome only. Clause: J2.16.

### NEW-2: parentheses around components (2026-10-23)

Ruled by the user: redundant parentheses around a component-defining expression are not free if they break React
Fast Refresh; they are judged by the outcome. SWC's refresh transform (Rsbuild) does not register
`const Page = (() => …)`, so a compiler that prints such parentheses in a route chunk loses the component's state on
the next edit. No test reads the printed parentheses: the route-HMR rows of a real page on Rsbuild and Vite edit a
split route component and require its state kept (router-plugin `integration/route-hmr-browser.test.ts`, "%s: a
React app" > "with autoCodeSplitting: %s" > "shows an edited route component in place with its state, …", the
"an arrow function component" route). A printer that wraps function initialisers in parentheses fails the Rsbuild
rows (split and unsplit) and passes the Vite ones. Found by the repair's printing restructure (R4). Clauses: §5.5,
J3.2.

### R-14: license comments

License comments (`/*!`, `@license`, `@preserve`) stay in the source module when the splitter moves or removes the
code below them; other orphaned comments are free. Clauses: G12, §5.5.

### OQ12: license comments beyond the splitter

R-14 binds the splitter only. Placement is free for the Start compiler and the import-protection rewrite. Clauses:
G12, §6.

### OQ13, OQ14, OQ15, OQ16, OQ17

Ruled product questions; see SPEC §6. OQ13 (already-lazy option values: once preloaded, render requests no new
module), OQ14 (`component: Outlet`: no requirement), OQ15 (`.inputValidator()`: types are enough), OQ16
(third-party transforms on split chunks: out of scope for now), OQ17 (four minor items, recommendations applied).

### shellComponent

`shellComponent` exists only on the root route, and the root route is never split, so the HMR problem first
reported (on a file route) is unreachable. Root edits that add, change or remove `shellComponent` hot-update.
Clauses: §2.1, J3.5, §8 (reachability before pinning).

### dev edits and full reloads

Avoid full reloads wherever a hot update is feasible, on the client and the server. Tests may require "no full
reload" there and never require one. Which in-memory state survives is the bundler's business. Clauses: G10,
J3.6.

### HMR in Start production builds

Start forces `addHmr: true` for its client splitter, so there is no HMR-disabled Start build to compare with. The
router-level paired build (same splitter, same production gating) decides "no HMR support in production". No new
product option was added for this. Clause: J3.7.

### Rsbuild route-tree parity

Rsbuild must prune server-only routes from the client route tree like Vite does (a `.fails` parity pin on
Rsbuild). Clause: J2.15.

### Q1: no fake filesystem in the generator tests (2026-10-23)

The user agrees: the router-generator tests that inject an `fs` into the generator (`concurrent-write.test.ts`: an
editor save landing between the generator's read and its write, a reader during the publications, a disk-full write
and a failing rename) are deleted. Their save-safety behaviour has no replacement: real files cannot put a save or a
reader into that window deterministically through a public API (the generator's own steps between the read and the
rename are not observable from outside; a watcher of `tmpDir` or a timed save races them), so SPEC §9 lists it as not
checked. The K-19 pin keeps its real-file part: `tmpDir` on another filesystem (shared memory, `/dev/shm`) than the
app, and the route file and the route tree are replaced by a rename (a new inode); a host without such a second
filesystem skips it (`router-generator/tests/generator-options.test.ts`, "tmpDir"). Clauses: J1.6, J1.10, J1.16.

### Q2: file route types through router-core (2026-10-23)

The user notes that the generated `FileRouteTypes` type is used internally: router-core reads
`routeTree['types']['fileRouteTypes']` through its exported `InferFileRouteTypes` (with a fallback when it is
`never`). The contract is that the generated tree carries file route types router-core can infer, not the generated
file's local interface name (§5.1). The `nested` type tests check `InferFileRouteTypes<typeof routeTree>`: not
`never`, and its full paths, `to` and ids. They run on a copy of the fixture where the tree is generated
(`router-generator/tests/integration/fixture-types-nested.test.ts`), so no test writes into the package anymore.
Clauses: J1.13, §5.1.

### Q5: an update the router on the page does not have (2026-10-23)

The user: "you decide". Decided: a hot update reaches a route the router on the page does not have when the page
has a second router created after the app's (router-core assigns `window.__TSR_ROUTER__` to the last router created;
Vite's route HMR code updates that one). Deleting a route file does not reach it: the route tree changes, and the page
reloads with the new tree (tried: delete then re-create, visited or not). The private-updater test
(`router-plugin/tests/handle-route-update.test.ts`, jsdom) is deleted; a real page row replaces it: Vite and Rsbuild,
an app that creates a second, code-based router after its own, an edit of a route component shows in place, the app
still navigates, no error (`router-plugin/tests/integration/route-hmr-browser-updates.test.ts`, "an edit while the
page has a second router created after the app's keeps the app working"). Whether such an edit also reaches the
app's router is not required. Clauses: J3.11, §8.

### Q8: one router plugin per app (2026-10-23)

The user: "we do not support registering multiple times the plugin. Sharing context is an optimization the
implementer might or might not decide to do, so we should probably not assert it." Deleted: router-plugin
`integration/pages/router-plugin-context.test.ts` "keeps two router plugins of one dev server to their own route
files" and `plugin-options.test.ts` "two code splitters scoped to the client and SSR environments of one dev server
…" (a hand-built Start composition sharing `createRouterPluginContext()`). The rest of that file, one router plugin
per dev server, is `integration/pages/code-splitter-edits.test.ts`. Start's client and SSR splitting through the
public Start plugin stays covered by start-plugin-core (`integration/start-router-dev-server.test.ts`,
`integration/hydrate-dev.test.ts`, `integration/start-build-options.test.ts` "router.codeSplittingOptions: the
client build loads the route loader and component $name, and both builds run them"; SSR splitting itself is not
required: "SSR route splitting", 2026-10-24). Clauses: §2.2, §5.20.

### Q9: `tsr.config.json` edits (2026-10-23)

The user: "it's ok to not expect a change in config file to act immediately." The pin "a tsr.config.json edit
generates the route tree with the new configuration" is deleted; the row where the next route file edit generates
the route tree with the new configuration stays (router-plugin `known-bugs-dev-server.test.ts`). Clause: J1.10.

### NEW-1: a decorator after `export` (2026-10-23)

A real bug: `export @dec class` is valid TypeScript (5.0 and later). The pin stays as it is
(router-plugin `integration/pages/known-bugs-code-splitter-bindings.test.ts`, "a decorator after `export`
compiles"). Clauses: §2.1, G1.

### Q10: other import statements (2026-10-23)

Asked whether the generator, when it adds a missing route constructor import, may touch other import statements, the
user: "I don't think we should specify that. Let it." The oracle does not constrain the import statements: the
generator may write a new import or edit, merge, split, reorder or reprint any of them, router package or not, and
no cap limits how many change. What stays checked is the outcome: the route file still evaluates with the real
router, its `Route` has the right constructor and id, everything outside the import statements keeps its bytes, and
the imports still bind what the user's code uses (each binding with its imported and local name, source module,
type/value meaning and import attributes; side-effect imports stay). `router-generator/tests/owned-edits.ts`
(`expectOnlyOwnedEdits`). Clauses: J1.1, J1.2.

### loaders after a hot edit (2026-10-24)

The user: a hot edit must run each changed loader at least once and the page show the new data, not exactly once.
Tests check that the page shows the new loader's data and that the new loader ran (`>= 1`); an obsolete loader the
edit replaced or removed still must not run again (`router-plugin/tests/integration/route-hmr-browser-updates.test.ts`).
Clauses: J3.1, J3.3.

### sibling options next to an inline component (2026-10-24)

The user: adding sibling route options next to an inline component may remount it. The edit that adds a
`pendingComponent` and an `errorComponent` before an inline `component` must show in place (no full reload); keeping
the component's state is not required (`router-plugin/tests/integration/route-hmr-browser-options.test.ts`, "an edit
that adds component options before an inline component shows in place"). Clause: J3.2.

### split groups and forwarding modules (2026-10-24)

The user: small forwarding modules are acceptable (not ideal: bytes). Two options share a group when, once one of
them loaded, loading the other fetches no new module holding user code: no file of the app, and no compiled module
but one that only imports and re-exports (`router-plugin/tests/route-app.ts` `groups()`). A per-option module that
only forwards to the group's module does not split the group. Clauses: J2.2, §5.3.

### unused code is judged after the bundler (2026-10-24)

The user: what matters is the code after the bundler's production tree-shaking. A test checks that unused code is
gone from the production bundle (value reads, user markers), not the import specifiers of a module the compiler
emits: an unused specifier is dropped by the bundler (`router-plugin/tests/served-code.ts` `readsImport`, used by
`integration/pages/code-splitter-dead-code.test.ts`). Goals, not gates: a split chunk holds only what its option
uses, and options import shared pieces directly from a shared module. Clauses: J2.5, §5.9.

### route tree quoteStyle and semicolons (2026-10-24)

The docs promise that the generated route tree is "formatted with the quote style you specify"
(`docs/router/api/file-based-routing.md`), so `quoteStyle` and `semicolons` are among the options the route tree
honours (J1.4), next to `routeTreeFileHeader/Footer`; §5.5 frees printing everywhere else. Checked by
`router-generator/tests/generator-options.test.ts`. Clauses: J1.4, §5.5.

## Start (J4–J7)

### D2: `generateFunctionId` input

`generateFunctionId` receives the generated handler name, while the docs suggest hashing the function name. Left
as is until server-function naming is reworked; no test depends on it. Clauses: J4.4, C5.

### D6: only client-referenced server functions are HTTP-callable

A server function that no client code references must not answer a direct HTTP call by id. Main never rejects:
a fix-agnostic goal pin. Server-to-server calls must keep working. Clause: J4.2.

### D13: a server function nested in a function

Supported when its handler captures no local binding (goal pin, not urgent). One that captures locals is supported
safely or rejected with an error naming the capture. Clauses: J4.6, §5.13.

### restored corpus inputs

Two shapes stay in the corpus. A server function in a top-level `{ }` block must work, or fail with a clear error
naming the file. Unrecognised call shapes (`createServerFn()['handler'](…)`, `createServerOnlyFn(…).bind(null)`)
must not leak server code to the client: the client build holds no server-only code, or the build fails clearly.
Builders re-exported under string export names must work. Clauses: J4.5, J4.6, J4.12.

### client-only declarations on the server

On the server, dropping a declaration (and its import and initializer effects) that only client-only code reads
(`<ClientOnly>` children, `createClientOnlyFn`) is preferred, not required, for neutral file names. For files
import protection denies on the server (`*.client.*`, the client-only marker) it is required, and a default server
build reports no violation for such code. Clauses: G3, J4.11, §5.12, C15.

### namespace imports

`import * as Start from '@tanstack/react-start'; <Start.Hydrate …>` is a boundary like a named import, and
`import * as RSC from '@tanstack/react-start/rsc'; RSC.renderServerComponent(...)` (and the other RSC helpers)
gets CSS injection like a named import. Direct static namespace members count; variables and wrappers do not.
Clauses: §2.1, J5.1, J7.2.

### D8: RSC CSS transform and skipped calls

`renderToReadableStream(<JSX/>)` and all-JSX conditionals get CSS. An identifier or spread argument gets a dev-only
warning. Clause: J7.3.

### RSC undocumented inputs

A second `options` argument of `renderToReadableStream` and plain-data models (`{ card: <Card /> }`), both type
errors under the default types, must not break: the call works and its arguments reach the runtime unchanged. CSS
injection and a warning are neither required nor forbidden. Clauses: §2.2, J7.3, C9.

### import-protection exemptions

An importer exempted by `ignoreImporters`, `exclude` or outside `include` gets the real module of a denied file,
and nothing is reported for it. A denied target matched by `excludeFiles` is not checked, so its importers get the
real module. Non-exempt importers of the same file still get the mock and a report. Why: exempting must not merely
silence the report. Clauses: J4.12, J6.7.

### export-\* diamonds and cycles in builds

Diamonds and cycles of `export *` poison the build-mode export cache for some compile orders. The order is
deterministic for a given build, and real builds see such orders, so the bug is reachable: the rows are `.fails`
pins (`start-plugin-core/tests/integration/start-compiler-build-export-cache.test.ts`). This supersedes the earlier
"not reachable" call, which assumed the failure could not be reproduced. Clauses: J4.5, §8.

### real requests, not a hand-built request context

Server-side checks (server functions, middleware, SSR) run through Start's server entry with a real request and a
real router: each build and dev harness app has a probe route. A hand-built request context re-implements Start
and is not allowed; none remains (the last one, `start-plugin-core/tests/start-runtime.ts`, went with the legacy
helpers once Q6 and Q7 were ruled). Clause: §8.

### Q6: no hand-built Start package graphs (2026-10-22)

Tests that hand-write a fake `@tanstack/start-client-core` and drive the internal `StartCompiler` with it are
deleted ("this seems absurd. Yes we should absolutely delete them. We just need to make sure what they were trying
to cover is still covered by higher quality tests."). What they covered is decided through real apps: a factory
read through a project module that re-exports it, by name, under another name, through `export *` or as a member
of a namespace import (`start-compiler-factories.test.ts`, "factories resolved through project modules"; the
namespace row for `createMiddleware` was added), a library importing the factories from
`@tanstack/start-client-core` (`integration/start-build-v2-libraries.test.ts`), and Start's own built
`createCsrfMiddleware` (an isomorphic fn whose server implementation builds a middleware), a no-op in the client
and a request middleware on the server (`createMiddleware/createMiddleware.test.ts`, added). A factory imported
from an implementation module of Start's package (its deep path) is not reachable: the package's `exports` do not
expose it. Clauses: J4.5, J4.16, G15, §1.2.

### Q7: CommonJS dependencies (2026-10-22)

Reachable, so pinned through real apps. A CommonJS package installed in `node_modules` (no `"type"`, so its `.js`
files are scripts) whose code has the text `.handler(` reaches the Start compiler: Vite's client build, Vite's SSR
build with `noExternal`, both Rsbuild builds and Rsbuild's dev server hand it over (Vite's dev client gets the
pre-bundled module, and Vite's SSR externalizes it by default). The compiler parses it as an ES module, so a
top-level `return`, which the same package without that text builds and runs with on both bundlers, fails the
build: pinned in `start-plugin-core/tests/integration/known-bugs-start-compiler.test.ts` (both builds, Rsbuild
dev). The other sloppy-mode forms of the former in-process pin (a legacy octal escape, a `with` statement) break
these apps without Start too (Rolldown's parser in Vite's builds and dependency pre-bundling, Rspack's minifier in
Rsbuild's builds, the strict code Rsbuild's dev server runs them in), so they carry no compiler requirement and
have no pin. Clauses: J4.16, G1, §8.

### Q3: no stub of removed server parts (2026-10-23)

On the client, the parts of a middleware the compiler removes leave nothing behind: `.options.server` (and
`.options.validator`) is absent, not a safe empty or throwing stub. The user: "we want the client to ship as little
code as possible. While a stub would be harmless on correctness, it would not be harmless on bytes." So the property
checks of the client middleware rows stay as they are (`createMiddleware/createMiddleware.test.ts`,
`compiler.test.ts`, `start-compiler-v2-inputs.test.ts`, `start-compiler-factories.test.ts`,
`known-bugs-start-compiler.test.ts`, `integration/pages/start-compiler-import-forms.test.ts`). Q3 is about stubs
only: other fields of the client `.options` are free ("client middleware options", 2026-10-24). Clauses: J4.8,
§5.19.

### Q4: `export *` of a denied module (2026-10-23)

"Like all import protection: we either handle it properly, or we crash the build (and warn in dev)." A name a client
module re-exports with `export *` from a denied module (a denied file or a denied specifier) is, in mock mode:

- in a build: a complete safe mock (the importer gets usable safe bindings, and the denied module's value is not in
  the bundle), or the build fails;
- in dev: a complete safe mock, or a warning naming the `export *` (its file and position, "diagnostics: file and
  position only");
- never the denied module's value, and never an importer that fails to load.

Rows: `start-plugin-core/tests/integration/known-bugs-dev-server.test.ts` (dev, pinned on both forms: the importer
fails to load) and `integration/importProtection/build-mock.test.ts` (both builds; pinned on Rsbuild for a denied
specifier, whose build succeeds with the name `undefined`). Clauses: J6.8, G5.

### code-frame column (F1)

Start's code frame passes a 0-based column to Babel's 1-based frame, so the caret is one column left of the call.
That is a product bug in a compiler diagnostic, but a code frame is printed message text, which is not tested
("diagnostics: file and position only"): its caret pin is deleted, and the position is checked through the
structured location (file and line) only. Unpinned. Clauses: G5, §5.7.

### outside compiler scope (repair findings)

- Start's preview server and framework-package crawl resolve against `process.cwd()`, and a custom server-function
  id containing `/` is never routed back: Start server and runtime issues, not compiler bugs. No pins.
- `.cts` modules with TypeScript syntax and paths with `#` fail in a plain Vite app too (Vite's TS transform and
  resolver): upstream, no pins ([KNOWN-BUGS.md](./KNOWN-BUGS.md#upstream-issues)).
- `@vitejs/plugin-rsc`'s dev runtime imports a missing `default` (F3): upstream. The strict module runner checks
  named imports in the app's own modules only, which is scoping, not a workaround.

Clauses: §1.2, §8.

### mock mode always logs

With `behavior: 'mock'` (dev or build, client or server env), every violation is reported, and the runtime access
diagnostic follows `mockAccess` (default `error`; `warn`; `off` silences) wherever a mock is served. Main's
client-dev-only runtime diagnostic is a bug. Why: the docs say "A warning is logged but the build continues".
Clause: J6.3. Which uses of a mock count for that diagnostic beyond a call is free ("mock access diagnostics",
2026-10-24).

### rulings of 2026-10-24 (outcomes audit B)

The second outcomes audit (validation `AUDIT-OUTCOMES-B.md`) found tests that pin a correct compiler's free choices.
The user: tests must be sensible, not paranoid; the implementer may adjust a test that pins an incidental detail.
Message wording, exact positions and columns, which line of a construct an error points at, and generated or
internal type names are left as they are; so are the pins whose inputs reuse today's generated names
("restructured compilers", R3) and the choice between an error and a warning ("depends on each case").

#### client middleware options

User: extra fields (e.g. metadata) on a client middleware's `.options` are allowed; Q3 forbids shipping server
code or stubs, not other fields. The client rows check `type`, and that no server implementation or validator ships
(`server`, `validator` absent: `page-values.ts` `clientMiddlewareOf`), never the whole `.options` object.
Clauses: J4.8, §5.19.

#### mock access diagnostics

User (agreed to the recommendation): the required, documented behaviour is a warning in dev at import time naming
the file, a mock that never crashes and leaks nothing, and builds that fail by default. The runtime "a mock was
used" diagnostic (`mockAccess`, undocumented) is left to the implementer: one row checks that calling a mocked
import is reported with the severity `mockAccess` gives (and nothing with `off`); which other uses count (a
conversion to a string, `toString()`, `new`, a property write) is not checked
(`integration/importProtection/mock-access.test.ts`). Clauses: J6.3, §5.18.

#### Hydrate chunk directives

`'use client'` need not be copied into a client-only `<Hydrate>` split chunk: it has no effect in a chunk only the
client loads. The parent module keeps its directives (J4.17). Clauses: G12, J5.9.

#### child-only module evaluation

A module only `<Hydrate>` children import is not downloaded before its boundary needs it (the page's scripts hold
none of its code); when its top-level code runs is not checked (`integration/hydrate-dev-edits.ts`). Clauses: G3,
J5.6.

#### SSR route splitting

User: SSR splitting is "not required, but to be fully optimized even the server code should load as little code as
possible, so eventually an optimization will have to be made." The SSR build must render correctly; whether it splits
route options like the client is not checked (`integration/start-build-options.test.ts`). Clauses: R2, G2, §5.3.

#### reading the existing clauses

Applied without a new ruling: an `onViolation` trace may list the entry first or last ("restructured compilers",
R10; `importProtection/start-apps.ts` `traceFromEntry`); `resolved` is optional for a specifier violation and is
checked only when given (J6.5, §5.14); a module's directives are each kept, other directives are not forbidden
(G12); a client server fn is checked through its public `url`, not `serverFnMeta` or its dev id (J4.4, §5.19).

## Test workarounds for upstream bugs

These are the only workarounds the maintainers authorized in the tests. Each carries a comment that says when to
remove it. The upstream issues are listed in [KNOWN-BUGS.md](./KNOWN-BUGS.md#upstream-issues).

### Rspack: one removal per edit

Rspack 2.2 vendors watchpack 2.5.2, which loses a file removal that lands while a compile runs (fixed in watchpack
2.6.0). Rsbuild tests delete or recreate one file per `edit()` and settle before the next write. Remove the split
(merge the steps back) once Rspack bundles watchpack ≥ 2.6. Where:
`start-plugin-core/tests/integration/importProtection/v2-edits.test.ts`,
`importProtection/v2-edits-page-rsbuild.test.ts`, `rsbuild/dev-server.test.ts`.

### Rsbuild harness waits

The Rsbuild dev harness resolves only once every compiler's watcher is attached and has scanned the app's files
(`CompileTracker.watching` in `compiler-test-utils/src/rsbuild-dev-server.ts`). Watchpack 2.5.2 never reports a file
removed while its first scan runs. This wait is harness realism ("the server is up" means it watches), so it may
stay. The harness also writes the initial app files with past modification times, and counts a compile for an edit
only if it started after the edit's last write: real projects start dev on existing files. See "Rsbuild dev-server
edits".

### Vite full-bundle dev: close wait

Vite's `BundledDev.listen()` leaves the `waitForInitialBuildFinish()` rejection unhandled, so closing a
`bundledDev` server during its initial build can log "Failed to get bundle state". Before `close()`, the harness
waits for Vite's initial-build bookkeeping to finish; it reads one Vite internal because there is no public API
(vitejs/vite#22991). Remove the wait once Vite handles the rejection. Where: `compiler-test-utils/src/dev-server.ts`.

### Vite's dependency optimizer: close wait (2026-10-23)

Vite 8.3.4's optimizer keeps writing into an app after `close()` resolved (KNOWN-BUGS, upstream: final-pass #34):
removing the app then fails with `ENOTEMPTY` on `node_modules/.vite/deps_temp_*`, or the optimizer's write into the
removed app is an unhandled rejection. The user accepted the recommendation ("ok"): before `close()`, the Vite dev
harnesses wait until each environment's optimizer has initialized and scanned (`depsOptimizer.initState`,
`scanProcessing`) and no `deps*_temp_*` directory is left in the server's cache directory, which Vite creates before
a run writes and renames or removes once the run is committed or cancelled. A run Vite has not started by then never
starts. An upstream report is drafted, not filed. Remove the wait once Vite awaits its optimizer's work on close.
Where: `closeViteServer` in `compiler-test-utils/src/dev-server.ts`, used by its dev server harness and by the raw
Vite servers of start-plugin-core `integration/known-bugs-start-compiler-dev.test.ts` and
`integration/hydrate-build-dev.test.ts`.

### Vite's stale pre-bundled dependency: closed (2026-10-23)

#42 (KNOWN-BUGS, upstream) did not reproduce in about 350 runs since the harness apps moved to `tanstackStart()`
(2026-10-22). The user accepted closing it ("ok"): no workaround, no pending ruling; reopen it if its signature is
seen again.

### Rsbuild dev-server edits

A multi-file edit passes through in-between states that a dev server may compile and report. Tests assert the
state after the last write, not an exact report list that excludes the in-between states. Clause: §8.

## Test setup facts

- Tests use real framework packages and tools as test-only devDependencies (for example `solid-js`,
  `vite-plugin-solid`, `@rsbuild/plugin-react`, `@rsbuild/plugin-solid`, `@vitejs/plugin-react`, `miniflare`,
  `vite-tsconfig-paths`). Built workspace packages such as `@tanstack/react-start` are linked at test time
  (`@tanstack/compiler-test-utils/workspace-packages`, `startRuntimeLinks`) rather than declared, to avoid Nx
  cycles. That is why the integration targets build `@tanstack/react-start` first.
- `@rsbuild/plugin-solid` is at least 1.2.2 everywhere: 1.1.1 broke Solid hydration in Rsbuild dev.
- The harnesses never pass port 0 to Vite or Rsbuild, whose port 0 handling probes a free port and binds it
  later (a race under load). Vite listens on its default port and moves to the next free one; Rsbuild runs in
  middleware mode on the harness's own HTTP server, which binds port 0 itself.
- Every harness server listens on `127.0.0.1`, and its URL names that address. Vite's default `localhost` names
  `::1` and `127.0.0.1` while the server listens on one of them, and a Node client of the test process (the idle
  HMR client, `fetch`) could then be refused under load (KNOWN-BUGS.md, upstream issues: Node's address-family
  selection).
- `@vitejs/plugin-vue` is a start-plugin-core test-only devDependency, so the Vue SFC pin runs through the public
  host.
