# Known bugs

Four parts, one entry per root cause: the bug, the SPEC clause, its tests (`file` and test names; paths under
`packages/`; `$name`, `%s` and `${…}` are table-row placeholders), and what a fix must achieve. The test comment
(`Bug:`, `Impact:`) has the details.

- **Remaining pins**: bugs today's compiler still has. Each is pinned by `.fails` tests that assert the correct
  outcome and accept any correct fix. When a compiler fixes one, its pins fail with "Expect test to fail": remove the
  `.fails`, keep the test, and move the entry to "Fixed, kept as regression tests".
- **Known incorrect rejections (accepted, R89)**: wrong outcomes kept on purpose, all in the safe direction (the client
  gets a mock, never server code). Pinned like the remaining pins; a fix that serves the real module may unpin them.
- **Accepted limits**: outcomes ruled as they are (unsupported inputs, documented limits). Not pins: an ordinary test
  holds the outcome, or the entry says why none does.
- **Fixed, kept as regression tests**: bugs main's compilers (the Babel-based ones) had, which the compilers on the
  shared core fix. Their tests run as ordinary tests, mostly in the `known-bugs-*` files. "Cause" files name main's
  implementation.

## Remaining pins

- **A route module's CSS import loads on every page**: the code splitter keeps the bare import in the route module,
  which the route tree imports eagerly (in dev the CSS is injected once the client runs; a build merges it into the
  entry's CSS). SPEC J2.22. `start-plugin-core/tests/integration/route-css.test.ts` (Vite) and
  `route-css-rsbuild.test.ts` (Rsbuild), rows of `route-css-cases.ts`: "the CSS of the /${name} route
  does not apply at /" (the five `shows-*` rows; dev and build). Fix: the CSS loads when its route
  matches.
- **Vite dev: a request whose server modules are still being evaluated when an edit reloads the SSR environment can
  render a broken route tree**: 404 for an existing route, or `Duplicate routes found with id: undefined/<path>`.
  Upstream, Vite's module runner (vitejs/vite#24046; see "Upstream issues"): its `full-reload` clears the evaluated
  modules under the import in flight, which takes its later modules from the new generation; a request after the reload
  evaluates the route tree on the same route modules, and each tree's `update()` re-parents them. Main runs the same
  request path. Seen in bursts (an IDE rename and undo, `git stash`) with a page open, whose server fn calls overlap the
  reloads. SPEC J3.3. `start-plugin-core/tests/integration/start-dev-ssr-reload-in-flight.test.ts`: "the request in
  flight and a request after the reload both render the page". Fix: both requests render the page.
- **Rsbuild and webpack: an edit of a binding the route file exports does not reach another module importing it** from
  the route file: the route module self-accepts and the importer's text is unchanged, so the importer keeps reading the
  exports of the route module's first evaluation, with no error, until a reload (the route file's own chunks are
  invalidated by the route module, J3 below). SPEC J3.3.
  `router-plugin/tests/integration/known-bugs-route-hmr-kept-binding.test.ts`: "rsbuild %s: shows", "webpack with
  source maps %s: shows". Fix: the edit shows, by a hot update or a reload.
- **Split: after a rename or a removed component in a Solid route file, later edits do not show** until a reload.
  Upstream, solid-refresh (see "Upstream issues"): it keeps the removed name and stops patching the module. Rsbuild:
  no later hot update reaches the page (a plain Solid app with a `lazy()` import fails the same way). Vite: the lazy
  wrapper keeps the proxy of the same name and file it holds (one mount per save), which solid-refresh no longer
  patches: a rename shows, later edits do not; a removed component solid-refresh reaches before the route component
  stops even the removal from showing (main on Vite shows neither, R175). SPEC J3.3.
  `router-plugin/tests/integration/route-hmr-browser-solid-identity.test.ts` and `-rsbuild.test.ts`: "a rename, then
  two body edits: every edit", "a helper component after the route component removed, then two body edits: every
  edit"; Rsbuild also "a helper component removed, then two body edits: every edit" (autoCodeSplitting: true; the
  rows' edits before the pin run as ordinary tests). Fix: upstream; every edit shows.
- **Vite full-bundle dev: an edit that turns what another module imports into a server fn builder does not recompile
  the importer**, whose client output keeps the handler. SPEC J4.5, G10.
  `start-plugin-core/tests/integration/start-compiler-dev-server.test.ts`: "a module whose factory becomes a server fn
  builder: the client bundle drops the handler".
- **Vite RSC build: a server fn only client-only code imports is not registered** (as `main`; ruled a known limit for
  #8817, 11-19): a server fn whose module only a `<ClientOnly>` child, a `createClientOnlyFn` body or a `<Hydrate>`
  `fallback` imports, in a route file or a component file. The SSR scan erases client-only code and the imports only it
  reads, so no server environment meets the module before the provider's manifest is written: the early compile of the
  provider's reach starts only from server fn modules, which none of these files is. The client build emits the call,
  which would answer `Server function info not found`: the build fails, naming each such function and its file
  (RSC phase 2, decision 5; it built and the click answered 500), with the way out for a file of the app (import it
  in a server fn's module as well and use it in that function's handler). Without RSC all these positions answer; the
  dev server answers them; Rsbuild answers them since RSC phase 1 (see "Fixed"). SPEC J4.2.
  `react-start-rsc/tests/integration/rsc-start-build-not-provided.test.ts`, rows of `client-only-reach-app.ts`: "a
  server fn only $position of a $where imports fails the build, naming it" (`<ClientOnly>` child, `createClientOnlyFn`
  body, `<Hydrate>` fallback; route file and component file), and "the build error names only those server fns, with
  the way out for a file of the app and one of an installed package"; the way out applied:
  `rsc-start-build-client-reach.test.ts`, "the build error's way out for $kind makes its server fn answer" (a file of
  the app). Fix: every server fn the client references is callable by id, with no production dependency on modules
  only development code reaches.
- **Vite RSC build: a server fn a `'use client'` component imports lazily is not registered** (as `main`, #7943): the
  early compile of the provider's reach follows no `import()` at or below a `'use client'` module, so that a
  development-only one (`if (process.env.NODE_ENV === 'development') import('./debug')`) adds no production
  dependency, and nothing else compiles the lazily imported module before the manifest is written. The build fails,
  naming the function and its file, as for the entry above (it built and the click answered `Server function info not
found`). SPEC J4.2. `react-start-rsc/tests/integration/rsc-start-build-not-provided.test.ts`: "a server fn a 'use
  client' component imports lazily fails the build, naming it". Fix: every server fn the client references is
  callable by id, with no production dependency on modules only development code reaches.
- **Vite RSC build: a server fn a `'use client'` component imports from an installed package that does not declare
  Start, or through an import the provider resolves to another file, is not registered** (as `main`, #7943): the early
  compile of the provider's reach walks project modules and the modules of packages that declare Start (node_modules
  policy, decision 2: `rsc-start-build-client-reach.test.ts`, "… a file of an installed package that declares Start,
  with no loader calling it") and resolves in the provider environment, so it skips a module of another package
  and, where a `react-server` condition of the app's `imports`
  points the specifier at another file, visits that file instead of the client's. A server fn's handler that uses an
  installed package's function does not register it either (the walk skips it there too), and the SSR scan has deleted
  that handler's imports: so a server fn of an installed package that only server fn handlers call answers `Server
function info not found` when one of them calls it, and the build says nothing, as on `main` (run on ed5577593a:
  the page answers 500). For a function the client calls, the build fails, naming it and its file (decision 5; it built
  and the click answered 500), with the way out: the package declares Start (Vite then also bundles it for the
  server; a route loader's call does not help an undeclared package, which Vite keeps external there). SPEC J4.2.
  `react-start-rsc/tests/integration/rsc-start-build-not-provided.test.ts`: "an installed package's server fn a 'use
  client' component and a server fn's handler import fails the build, naming it"; the way out applied:
  `rsc-start-build-client-reach.test.ts`, "the build error's way out for $kind makes its server fn answer" (an
  installed package that declares Start, with and without a loader calling it). The `react-server` case and the
  server-only call have no test.
  Fix: every server fn the client references is callable by id, with no production dependency on modules only
  development code reaches; a server fn of an installed package that server code imports is registered.
- **Rsbuild checks importers by file extension** (JS/TS only): a custom module type's denied specifier is never
  checked (a denied file it imports is: it is its own violation in the client). SPEC J6.1, §2.1.
  `start-plugin-core/tests/integration/importProtection/dev-outcomes.test.ts`: "a module of a custom type importing
  a denied specifier is reported, and its real code does not run".

- **A Vue `<script setup>` block that hands a Start builder or factory to its template is a compile error on the dev
  servers and in builds with Vue's devtools**: Vite and Rsbuild dev; Vite builds with `features.prodDevtools`, a true
  `__VUE_PROD_DEVTOOLS__` define or `NODE_ENV=development` (`--mode development` alone inlines); Rsbuild builds with
  `NODE_ENV=development` (vue-loader reads no devtools flag). There the template is not inlined: compiler-sfc's
  generated `__returned__` object hands it every binding of the block, in JavaScript every import too (in TypeScript only
  the imports the template uses), and the template can attach server code to it (`{{ base.handler(…) }}`), so the
  refusal is right and no server code ships. Hit by a JavaScript block importing a builder or factory, and by any block
  whose local holds an open builder. The refusal names the binding at its declaration in the SFC when the input map
  maps it (dev; a build with `build.sourcemap`), with the recipe: `lang="ts"`, builders, middleware and server
  functions in a `.ts` module (a module-scope `<script lang="ts">` fails the same way in dev for a builder; a server
  function there written as one chain builds). A server function in a `<script setup>` block is a compile error in any
  case (it is created in the setup function, R162, SPEC J4.6). Accepted, R92 amendment 3: a fix must not need a
  special case for the plugin's output (skipping `__returned__` ships a template-attached handler). Upstream option:
  compiler-sfc exposing only the template's imports for JavaScript as for TypeScript. SPEC J4.5.
  `start-plugin-core/tests/integration/start-vue-script-setup.test.ts`: "$name compiles"; must stay
  refused (dev, and a `prodDevtools` build): "a template attaching a handler to a builder a $name block hands it is
  refused", "… fails the build"; the recipe: "$name compiles", "$name builds, and no server code reaches the client".
- **Forms that reach a denied file's text past import protection, on a Vite client build, unreported, as on main**
  (asset queries themselves are covered: `importProtection/asset-query.test.ts`). A worker's imports, `?worker` or
  `new Worker(new URL('./w.ts', import.meta.url))` (Vite's worker build has no Start plugin: a denied or marked file
  ships as it is; Rsbuild reports all four shapes); `new URL('./x.server.ts', import.meta.url)`; a marked `.mdx`/`.vue` with an asset
  query (no language, no marker read); a marked file that does not parse with an asset query. Rsbuild, the same: a plain
  `import.meta.webpackContext` of a non-code file (`*.server.json`). SPEC J6.1.
  `start-plugin-core/tests/integration/importProtection/known-bugs-asset-forms.test.ts`.
- **A top-level `using` that a split chunk or a `<Hydrate>` chunk reads is acquired twice** (`using v = acquire()`):
  the declaration table calls it a statement (it disposes what it declares), but its unit is a declaration, so the
  chunk copies it and acquires again (and disposes again); the env module keeps it too, and Hydrate children render
  the second resource's value. Main's splitter moves it into the chunk (once). Importing the binding from the env
  module instead (an effect unit) loses its disposal under V8 14.6 (Node 26, Chromium): a module's `using` binding that
  it exports is never disposed, an upstream V8 bug, not reported (an alias `const a = v; export { a }` disposes). SPEC
  J2.0, J5.2. No pin (a fix depends on the V8 bug or on an alias export; whole-PR review C2-03; repro:
  `using v = { [Symbol.dispose]() { … } }; export { v }` in a module Node 26 imports never disposes). Fix: one acquisition and one disposal in every output.
- **An isomorphic fn whose chain passes through a helper throws when its module loads**
  (`withBuilder(createIsomorphicFn().server(f)).client(g)`): the inner `.server(f)` compiles on its own into a plain
  function, so `.client` isn't there to call, on the client and on the server. No server code ships: `.server()` finished
  the value, and a wrapper is not followed (R92). SPEC J4.5. `start-plugin-core/tests/start-compiler-cases.test.ts`:
  "each output keeps its implementation of an isomorphic fn whose chain passes through a helper function". Fix: each
  output keeps its implementation, or the build fails at the helper.
- **Vite: a Vue SFC's `<script lang="ts">` block in an installed package is compiled by neither pass** (settlement
  step 3 review, Gemini; base too). Its id (`Comp.vue?vue&type=script&lang.ts`) has a language, so the late pass
  leaves it to the main transform, and the main transform's dependency filters take only script paths
  (`DEPENDENCY_SCRIPT_RE`: `node_modules/….ts`, not `….vue?…lang.ts`): a server fn's handler there ships to the client,
  declared package or not. The app's own SFCs are compiled (their ids pass the main filter). SPEC J4.16. No row.
  Fix: the dependency filter takes a `.vue` id whose `lang` query names a script.
- **An overtaken importer's allowed import loads the file's mock unless the file is allowed as its own importer**
  (settlement step 2 review, Astra 2; base too). Vite dev: `allowImport` allows `form.ts`'s import of a client-only
  file on the server and answers while `form.ts` is saved without the import. The older request loads the edge
  `allowImport` allowed, which re-exports the file; the file's own compile finds an allowed importer only in the
  committed records (none: that answer was overtaken) and serves its mock, as the file's own violation. SPEC J6.6.
  `start-plugin-core/tests/integration/start-dev-settlement.test.ts`: "an overtaken importer whose import allowImport
  allowed loads the real export, without the file allowed as its own importer". Fix: the file's verdict for a request
  through an allowed edge follows that edge's decision, not the records of current importers (a target's verdict per
  edge, not per module).
- **Vite dev, SSR: a compile error of an importer whose import made a denied file real sends the file to its mock, reported**
  (settlement step 2 review, Fable 1; base too). The server environment reports no parse error (`report`: a parse
  failure is an error in the client only), so the failed compile is a served answer with no import, and its commit
  takes the allowed import away; `form.ts`'s next good save brings it back. SPEC J6.6. No row (the client row,
  `start-dev-settlement-failed.test.ts`, covers the commit; the SSR outcome follows from what the server reports).
  Fix: a module the compiler cannot parse keeps its record in every environment.
- **A file saved in place more than about 100 ms after its truncation, with no second event, reads empty until its
  next event** (settlement step 6b re-checks, Fable and Astra; Gemini). An editor that truncates a file and writes it
  later than the in-place-save wait (`SAVE_RETRIES` × `SAVE_RETRY_MS`, 100 ms, once per event: the event's wait or a
  reader's, never both) leaves the importers compiled against the empty module, as is, until another event of the
  file. Both real watchers measured (chokidar, Rspack's native watcher) send a second event for a write that late, so in practice it is one
  build against the empty file, then the right one. No row (the outcome is the limit).
- **A restore checked while a request of its key runs and ends installs its plan afterwards** (settlement step 6a
  review, Astra; on `a37f4609fd` too). `restorePlans` checks a persisted plan, and installs it when its check accepts,
  unless the key then has a plan or a request. A request that settled and ended during the check (an untouched
  compile of the module, or its file's removal) leaves no record, so the restore installs the dependencies that
  request retired: a later change of one of them stales the untouched or removed module. Core API only: the hosts
  restore in a compiler's first `finishMake`, before its modules are requested. No row.
- **Two persisted snapshots of one key: the last restored wins** (settlement step 6a review, Astra and Fable; on
  `a37f4609fd` too). `PlanCache.restore` replaces a restored plan with the next one of its key, so the first
  snapshot's dependencies leave the index: a change of one of them stales nothing. router-plugin's webpack host groups
  the plans it restores by serialized snapshot, so two module instances of one key with different reads reach the
  core together (Start's Rsbuild host picks one per key). No row.
- **A text requested again while its first compile still runs (A, B, A) is compiled twice at one generation**
  (settlement step 6a re-check, Gemini; on `a37f4609fd` too). The first compile of A is overtaken by B's request and
  attempts again; A's second request finds no compile of A in flight (B's replaced it) and starts its own. Both
  publish at the generation of A's second request, the later over the earlier: when a file created meanwhile moves a
  resolution no event re-checks (an alias target elsewhere), both answers are current with different facts and the
  file is not stale. Core API only; a host requests one text twice in a row only on a quick save and revert. No row.
- **`TSR_COMPILER_NO_CACHE=plans`: a second compile of the same text replaces the plan without evicting it**
  (settlement step 6a review, Gemini; checked after the re-check fixes). With plan reuse off a request compiles
  instead of checking a hit, and its publication replaces the published plan of its own text with the generation
  unmoved: an open answer of the first plan stays current and the file is not stale, where with the cache on the
  hit's refusal evicts it (a resolution moved by a tsconfig edit between the two requests). A measurement knob: the
  cache-equivalence runs compare outputs, not `current()` of overlapping requests. No row.
- **Vite watch build: a custom server fn id whose definition moves to another module is not found** (whole-PR review
  S1-22, decision D-22 pending): the id allocator never releases an id in a watch build, so the moved definition gets
  another id (`greet_fixed_1`) and a call of the custom id answers "Server function info not found" until a restart.
  `start-plugin-core/tests/integration/start-build-settlement-ids.test.ts`: "the call of the id answers the function
  at its new place". Fix: the allocator releases the ids of definitions the rebuild no longer has.

## Known incorrect rejections (accepted, R89)

- **An importer outside the scope (`srcDirectory`/`include`) gets the mock of an in-scope denied file it imports.**
  SPEC J6.7, J6.1. File-name denials only (`*.server.*`, `files`): a marked file is a violation for such an importer,
  reported at its import (node_modules policy, decision 7). A denied file is judged from the plain imports of it the compiler indexed (at its own compile, and
  again when they change: design 4), and an importer outside the scope is never compiled by import protection. A dev
  server serves the mock and reports the denied file; a build serves the mock and prints one warning per denied file
  whose every importer is exempt or outside the scope, naming the file, its importers and the fix (not a violation: no
  `onViolation` call, no failure with the `error` behaviour).
  `start-plugin-core/tests/integration/importProtection/unchecked-importers.test.ts` (Vite build, Vite dev, Vite
  bundled dev, Rsbuild build, Rsbuild dev): "an importer outside srcDirectory gets the real module of an in-scope
  denied file it imports, and is not reported"; its controls show exempt importers' plain imports get the real module.
  Workaround: import the file from a module inside the scope.

## Accepted limits

- **A serial test that timed out may still open what its body opens afterwards** (TEST-TOOLS-DESIGN.md, Decision B):
  a serial file's openers register their close with Vitest's global `onTestFinished` when called, so a start already
  called is closed when its test ends (the close waits for it), but the body of a test that timed out goes on, and what
  it opens next registers on whichever test is current: it is closed when the next test ends, and at the end of the
  file the registration throws. A timed-out `restart()` of an Rsbuild dev server resumes the body too (its server is
  closed with the first). Source: the chunk 4 reviews of react-start-rsc (Astra, Gemini, 11-28). No test.
  Workaround: none needed; a concurrent file's fixtures check the test's signal and open nothing after a timeout.
- **A timed-out test's body runs on, and what it opens after the timeout is cleaned at the end of the next test**
  (router-plugin's serial files, whose openers register their close with Vitest's global `onTestFinished` when they
  are called): Vitest 5.1.2 does not stop the body of a test that ran out of time, so an opener it calls afterwards
  registers on the test running then, or throws when none is (at the file's end). What it began to open before the
  timeout closes with it. Decision B (TEST-TOOLS-DESIGN.md, 2026-11-28); source: Astra's and
  Gemini's probes (`check-option-b-astra.md`). No test. The concurrent files open through the fixtures of
  `tests/test.ts` instead (ESLint `no-restricted-imports`).
- **An export that starts as a builder and is later replaced by an ordinary object is still read as a builder**
  (`export let base = make(); base = { inputValidator(fn) { return fn } }`, also an assignment through Solid's
  `ref={base}`): a summary describes an export's initial value, so another module's `base.inputValidator(…)` fails
  the build with the rename message, and a `.handler()` on it is compiled as a server function. Seen in a package
  that does not declare Start, which before the dependency summaries was not read. A rule making every reassigned
  export unknown shipped the handler of a builder reassigned to a builder of the same kind (`base =
base.middleware([])`, accepted in its module, R92) to the client without a message, so it was dropped (user
  decision, 2026-11-27, "2a fix 2"). Source: the dependency summaries' reviews (Astra's `mutable` fixture; Fable's
  confirmation). No test. Workaround: do not reuse the binding (a second name), or a `const`.
- **A `let` or `var` of a Vue component passed as server code is refused in development even when nothing assigns
  it** (`let impl = () => …; createServerOnlyFn(impl)` in `<script setup>`, or a `let`/`var` of a normal `<script>`
  paired with `<script setup>`): Vue's development output, and a build with Vue's devtools, hands every such binding to
  the template through `__returned__`'s getter and setter, and the setter is a write outside server code, so the
  reassigned-name rule refuses it (user decision, 2026-11-26: no read analysis); the error names that write, in Vue's
  output. A production build, whose template is inlined, accepts it. Source: the reassigned-names change and its
  reviews (Astra, Gemini). No test. Workaround: a `const` (`const impl = () => …`).
- **Already compiled TypeScript passed as server code is refused** (a `namespace` or `enum` compiled earlier, in
  `node_modules` or by the late pass over a `.vue` file: `var h; (function (h) { … })(h || (h = {}))`, then
  `createServerOnlyFn(h)` or `.handler(h)`): the compiled form writes the name (`h = {}`) outside server code, so it is
  refused, also where it is exported or the client reads it (user decision, 2026-11-26). Source: Gemini's review of the
  reassigned-names change. No test. Workaround: pass a `const` (`const impl = h.run`, or the function itself).
- **A second, initialised `var` declaration of a function-local name is not a write** (`function make() { var h = a;
const read = createServerOnlyFn(h); var h = b }`): the rule sees a redeclared `var` with a value as a write only at
  the module's top level, so the function-local rebinding is not refused, and the client keeps it with what it reads.
  As on bded194ac9. Source: Astra's review of the reassigned-names change. No test. Workaround: one declaration, or a
  `const`.
- **Vite: the client-build record follows the client output on disk, with these limits** (settlement design rev 4
  §2, step 7; the server embeds the record: its document's client files and the functions it answers). Each keeps SSR
  from naming a file the build removed:
  1. A build that reports an error can advance the record and the server: another plugin's `writeBundle` or
     `closeBundle` failing after Start's `writeBundle` (the output is the one on disk).
  2. After a failure in the output phase before the write (`renderChunk`, `generateBundle`) there is no client build
     until the next one succeeds: the document names no client file (Vite emptied the directory). Keeping the
     previous files would make Start the owner of output cleanup (`emptyOutDir` off, its own pruning): not taken.
  3. Several client outputs: the record is the last one written; a later output's failure leaves none although an
     earlier one is on disk.
  4. `build.emptyOutDir: false`: the previous files survive a failed build, and the record is withdrawn all the same.
  5. A build that leaves the output directory unchanged (`build.write: false`, without watch or with
     `watch.skipWrite`; Vite empties the directory only with `build.write` on): the record is the generated output,
     for a consumer of the build in memory (its files are not on disk), set at the last `generateBundle` handler: a
     later `enforce: 'post'`, `order: 'post'` handler that throws or renames a file still advances it.
     (`watch.skipWrite` with `build.write` on empties the directory and writes nothing: no client build, the document
     names no client file.)
  6. Files removed by anything but the build.

  Rows: `start-build-settlement*.test.ts`, `tests/vite-client-build-record.test.ts`. Two costs, measured: a client-only
  save whose output does not change builds the server once (the record is withdrawn and committed again; before step 7,
  none), and a program that drives the watchers itself (not Start's `buildApp`) builds the server twice per save,
  ending on the right document. A server-fn file deleted together with a client failure in the build phase fails the
  server's rebuild (`Could not load …?tss-serverfn-handler`, the resolver still lists the deleted function the
  record holds) while the previous pair stays served and its call answered (before step 7, a second error at the
  call). No row for the costs and the deleted file (the outcome is the limit).

- **A module with decorators, or with a `React` of its own, keeps what types name, as `main` does** (the type rule's
  user decision, 2026-11-26: "we will never cover the entire syntax"): decorator metadata and a classic JSX runtime the
  bundler is set to read names at run time that only types mention, and no rule here models their emitters, so the
  rule's pass does not run there (`Tier1.typesNameValues` is false). A value only types name stays in those modules,
  with its initialiser; what only server code reads still leaves. Rows: `start-build-decorator-metadata.test.ts`,
  `start-compiler-removal-types.test.ts` "a function-local React only a type names stays". Workaround: none needed
  (as `main`); move such a value to a module without decorators to have it removed.
- **A local alias of an imported `React` only types name leaves under a classic JSX runtime set by config** (no pragma;
  `import React from 'react'; const r = React; export const C = (x?: typeof r) => <div />`): an imported `React`
  does not close the type rule's gate (that would turn it off in nearly every React module), so `r` leaves, and the
  import with it; the classic runtime's `React.createElement` then reads an undeclared `React`. Worse than the branch
  before the type rule (it kept both), rare. Source: Gemini's re-check of the narrowed rule. No test. Workaround:
  name `React` directly in the type (`typeof React`), or name the factory with a pragma (`/** @jsx React.createElement */`).
- **A classic JSX factory other than `React` set by config, with no pragma, leaves when only types name it** (Rsbuild
  `tools.swc.jsc.transform.react: { runtime: 'classic', pragma: 'h' }`, a tsconfig `jsxFactory`; `const h = …` with
  `typeof h` in code that stays): only a pragma's factory and a `React` of the module's own are known; the client
  then reads an undeclared `h`. Worse than the branch before the type rule (it kept `h`). Source: Gemini's review of
  the narrowed rule. No test. Workaround: name it with a pragma (`/** @jsx h */`).

- **Code nested past the parser's depth limit is refused** (Yuku 0.29.0; user, 2026-11-25: no action, no normal code
  reaches it). About 250 levels of most shapes (parentheses, `?:` and else-if chains, nested JSX, assignment and
  curried-arrow chains), 127 nested callbacks or `jsx("div", {children:` calls, 84 levels of nested data
  (`{children: [{`). Past it the file does not parse: a Start module fails the client build with a positioned error,
  a route file fails route generation (a warm dev edit leaves it unsplit with a warning), and a module another plugin
  hands to the late pass under a non-script name (`.mdx`) fails the client build, as a script does (settlement steps
  3 and 4). 0.28.1 and `main` (Babel) parsed deeper. No file of the corpus (216,934) or of the workspace's installed
  packages (64,642) reaches it. Rows: `start-build-unparsed-module.test.ts`, "code nested more than 256 levels deep";
  `start-build-late-pass.test.ts`, "%s build, an MDX module the compiler cannot parse".
- **Rsbuild: the late pass reads a fixed list of file types; a module of another type that uses Start fails the
  build** (audit 2b; the user chose fail-closed over reading Rspack's module type, which cost +4 % on an asset-heavy
  build and doubled a dev CSS edit). The late pass compiles the JavaScript other loaders make of `.vue`, `.svelte`,
  `.md`, `.mdx`, `.astro` and `.marko` files (`rsbuild/late-pass.ts`). A module of any other file type that Rspack
  parses as JavaScript (an app rule typing `.foo` as `javascript/auto`) is not compiled; if it imports a Start package
  (an import Rspack parsed, not text that quotes one), the compilation fails naming the file (each compilation checks
  the modules it built, the first one all of them, by module: each loader request of a file on its own). One that
  uses Start without importing a Start package (it finishes a builder another module exports) is not caught and ships
  its handler to the client. Vite reads the module type and compiles both. Rows: `start-build-late-pass.test.ts`,
  "rsbuild build, a module of a file type the late pass does not read"; `rsbuild/dev-late-file-type.test.ts`.
- **Ambient text nothing names keeps what only it names** (`declare function g(x: typeof sv): void`,
  `declare namespace N { const a: typeof sv }`, a class of `declare global`, an unexported namespace's type export,
  `declare module 'x' { … }`, and nothing names or exports them): a type never keeps a value, but a named erased
  declaration (an alias, an interface, a `declare`) is read when it is named or exported (D1, the decided T5–T8 rows:
  a `declare const` nobody names keeps what it names); `sv` and its import stay, as on `main`. SPEC G16. No test (the
  outcome is the limit). Workaround: export the type, or name it from code that runs.
- **A value position TypeScript erases keeps what it reads** (a computed key of an abstract or `declare` member):
  the parser reports these references as value reads, and a value read keeps its value; as on `main`. (The heritage of
  a `declare class` is ambient text: read when the class is named or exported.) SPEC G16. No test (the outcome is the limit; a Yuku request:
  `inTypePosition` for value syntax in ambient and erased members).
- **A compile whose every attempt was overtaken can commit after the rebuild of its text** (settlement design, step
  1, decided by a run: the same-text rule is not built). A dependency saved during each of three attempts leaves the
  compile's answer unpublished (the file is left for its bundler to build again); if its host still acts on it while
  that rebuild of the same text publishes, both answers read current and the older, judged against the dependency as
  it was, may write last until the file's next build (its next save, or a save of a dependency that changes what it
  read). A rule moving the generation at publication would end it,
  and would also end an unpublished env-module answer whenever a split sibling of the text publishes first, which
  writes no server functions (worse). Needs three overtaken attempts and a host act that outlasts a rebuild: no dev
  server reproduced it (settlement step 0). Pinned at the core: `router-utils/tests/settlement.test.ts`, "an answer
  every attempt of which was overtaken is not current once the rebuild of its text publishes".
- **A dependency module whose edited text stops naming a Start API keeps what its last compile registered until a
  restart** (settlement design §8, decision 1, settled 2026-11-25: no machinery). Vite hands a `node_modules` module
  to the compiler only when its text names what the compiler recognises (the dependency text filter): an edit that
  removes the last such name never reaches the session, so the module's server functions, import-protection records
  and warnings stay as its last compiled text left them. App files are always compiled and are not affected; a
  restart (or the module naming a Start API again) settles it. Vite dev only: Rsbuild hands every module to its
  loader. No test (an edit under `node_modules` is not seen by the harness's watcher).
- **A JSX pragma comment in the middle of a route file reaches a derived module only with the statement it precedes**
  (emit review re-check, Fable P1). Derived modules copy the comments holding a JSX pragma of the file's header, as
  written and in source order with its directives, and the host decides as in the source. A pragma comment after
  the imports is not header: SWC (Rsbuild) reads one above any top-level statement and esbuild one anywhere, so
  the file compiles with the pragma's runtime and a split component, an error component or a server-fn handler
  module without that comment above it compiles with the default one. Oxc (Vite) and TypeScript read leading
  comments only and agree (the C5-03 rows run there). Write the pragma at the file's top. SPEC J2.16. No test (the
  outcome is the limit).
- **A route file read as text by a loader rule (`raw-loader`) still gets the router's output** (settlement step 5
  review, Fable). webpack and Rspack: a rule that makes the module JS (`use: 'raw-loader'` on `?raw`, no `type`) runs
  after the router plugin's `enforce: 'pre'` loader, so the text it exports is the compiled route module. The host
  tells the compiler the module's type only, and an `asset/*` type is not compiled (R1-20,
  `build-asset-source-route.test.ts`); a JS-typed module looks like any other import of the route. Use `asset/source`
  (webpack 5's replacement for `raw-loader`). No test (the outcome is the limit).
- **A script that becomes an asset with no query is compiled when its text names a Start API** (settlement step 4
  re-checks, Astra and Fable; the same as before step 4). Rsbuild: `new URL('./x.js', import.meta.url)` through
  Rspack's default `dependency: 'url'` rule, or an app rule that types a script `asset/source` by its path: the emitted
  asset is Start's output, not the file's text. Start's loader reads Rspack's module type only for a late-pass module
  or a request with the app's own query (each read crosses into Rspack). Import protection still judges such a
  script (`importProtection/asset-query-scope.test.ts` "a denied script, new URL"). Add a query (`?url`, `?raw`), which
  keeps the text. No test (the outcome is the limit).
- **A JSX pragma comment on a directive's own line is read by SWC in a derived module, not in the route file**
  (emit review re-check, Fable S1). `'use client'; /** @jsxImportSource x */` (or the comment inside the directive's
  statement): SWC (Rsbuild) ignores a pragma that does not start its line, so the route file compiles with the default
  runtime; a derived module gets the comment on a line of its own after the directive (twice when it was inside the
  statement), where SWC reads it. Oxc, esbuild and TypeScript agree in both. As before the emit redesign
  (`1d6300f099`: the same in a Rspack build). Write the pragma on a line of its own. SPEC J2.16. No test (the outcome
  is the limit).
- **The RSC provider module of a `'use client'` file leads with a pragma the file has after the directive**
  (emit review re-check, Fable S2). The provider module (the server-side module of the file's server fns under RSC)
  drops `'use client'` by design: it is server code, and the file's own module keeps the directive and stays the
  client reference (SPEC J4.2, #7943). A JSX pragma comment after the directive then leads the provider module:
  TypeScript, which reads a pragma before the first statement only, reads it there and not in the file. Oxc and
  esbuild read it in both, SWC differs only where S1 does. As before the emit redesign (`1d6300f099`: the same header
  in a real Start RSC build, client reference and server fn call unchanged). SPEC J2.16. No test (the outcome is the
  limit).
- **TypeScript reads a JSX pragma's name in any letter case; the compiler copies a comment holding the name as
  written only** (emit review re-check, Fable P3). `/** @jsximportsource @emotion/react */` is a pragma to
  TypeScript, not to Oxc, SWC or esbuild; a derived module gets no copy of it, so with TypeScript as the JSX transform
  the file and its split modules disagree. Write the name as documented (`@jsxImportSource`). SPEC J2.16. No test
  (the outcome is the limit).
- **`export { X }` of a name that is a type and a value keeps what only the type names on the client**
  (`const sv = getServerVal(); type X = typeof sv; const X = 1; export { X }`): the specifier exports the value, so it
  is no type export, and the alias it also names is not read as erased text; `sv` and its import stay, as on `main`
  and before the declaration table. The statement forms (`export type X = …` beside `export const X`, an exported
  interface beside an exported class) are clean. SPEC G16. No test (the outcome is the limit; whole-PR review of the
  declarations lane, F3). Workaround: `export type { X }` and the value's export apart, or a type of another name.
- **A hydrated Solid or Vue Start app with only the global error boundary: one save that changes a loader's data
  shape and the component reading it can leave the page blank or on the error** (route HMR decision 2, 11-23). In a
  hydrated Solid or Vue Start app with only the global error boundary, an edit that changes a loader's data shape and
  the component reading it can leave the page blank (Solid on both hosts, Vue on Rsbuild) or showing the error (Vue on
  Vite). The next route save reloads and recovers. Configure a route `errorComponent` or router
  `defaultErrorComponent` for in-place recovery. Why: the old component renders the new data once and throws, and the
  global boundary replaces the document the root route renders, which Solid and Vue cannot render again in place;
  they patch components as the update applies, with no pass after which a reload is known to load a page of one
  version, and a reload in the same save landed on a document whose hydration failed, after which the fixing edit
  never recovered (three Solid Start rows). React reloads in the same save (decision 1). `main` does not recover in
  four saves. SPEC J3.3. `start-plugin-core/tests/integration/start-dev-route-shape-change.test.ts`: "%s: four saves
  that change the loader data shape and the component reading it" (Solid and Vue, route error component: false)
  holds the recovery at the next save.
- **React Start: a save that lands while route HMR's reload of the page is still hydrating can end on the error
  screen** (route HMR decision 1, 11-23). In a hydrated React root with only the global boundary, a save whose old
  component threw rendering the new data reloads the page once, in that save. A second save written before the
  reloaded document hydrated can reach it half way: the page shows both versions' text or the error, with a
  hydration mismatch. The next save recovers. Needs two saves within the reload (test fixtures do; a person does not).
  No test (the outcome is the limit; `start-plugin-core/tests/integration/start-dev-route-error-recovery.test.ts`
  waits for the reload before the fixing edit).
- **Vite, Solid and Vue: a route module evaluated outside a hot update applies at the next update** (route HMR
  decision 6, 11-23). The route takes an evaluation of its module once Vite reports the update applied
  (`vite:afterUpdate`), after the accept callbacks where Solid's and Vue's refresh patch the components: before that,
  the route could load its new data into the old component. A route module that evaluates without an update of its
  own (imported again by another module's update) waits for the next update. No test (the outcome is the limit).
- **A dynamic marker import is an ordinary import** (when-does-this-run rule 1, user 11-26). A marker is a static
  import (`import '@tanstack/react-start/server-only'`); a dynamic `import()` or `require()` of a marker is an
  ordinary import and is not checked: it does not mark its module, wherever it is written. Main reported it at the
  module. A client entry's own marker import is judged at its import whatever its form, as before. No test (the
  outcome is the limit).
- **React route HMR: a hoisted component factory call runs before the rest of its route statement** (when-does-this-run
  rule 2, 11-26). In a development client, `component: memo(Page)` becomes `const TsrComponent = memo(Page)` before the
  statement, past the earlier options, in both directions: a factory that reads a value an earlier option writes reads
  it unwritten, and one that writes a value an earlier option reads writes it first. A call after an earlier
  declarator of the same declaration (`const Helper = Page, Route = …`) stays inline. No test (the outcome is the limit).
- **Route HMR: what a record of a route file costs** (route HMR design, 11-23). A second router of the same route tree
  that is never mounted (created and dropped) loads the edited route on every edit until the garbage collector frees
  it (the routers of the page are held weakly). A route module and its lazy route file saved together load the route
  twice (one record per file). The record of a removed route file stays while another router holds a route of the
  same id; the owner check keeps it from being applied. Where the route tree module evaluates again in place (Start on
  Rsbuild, until its route-set reload; with `dev.liveReload: false`, until a reload), three edits can miss (review of
  the implementation, router-core probes, 11-23): a second router of the same tree is not loaded again; a React
  route whose commit waited for React Refresh's pass while the tree took the new evaluation is not loaded again; and a
  route file deleted and created again, whose new module evaluates before the tree, is forgotten, so its later edits
  do not show. No test (the outcome is the limit).
- **Solid: the return of a deleted file a split component reads reloads the page, also with Rsbuild's
  `dev.liveReload: false`** (route HMR decision 3, 11-23). When the import of a split chunk failed (a stash or a
  branch switch removed a file it reads) and later succeeds, the runtime reloads the page once on every host
  (`reloadOnRecover`; solid-refresh 0.6.3 patches a module on Vite only in its own accept callback, see "Upstream
  issues"). On Rsbuild the dev server's client reloads at that moment anyway with live reload on; with
  `dev.liveReload: false` the page reloads where it used to stay on the old code. SPEC J3.3.
  `start-plugin-core/tests/integration/start-dev-removed-import.test.ts`.
- **`@refresh` comments in split route files: four contrived placements differ from the unsplit file** (route HMR
  decision 5, 11-23). A chunk holding components holds a copy of each `@refresh` comment alone (a statement TypeScript
  erases is copied whole), where the refresh plugin reads it as in the file, without a statement running twice
  (`code-splitter-refresh-placements.test.ts`, `route-hmr-browser-refresh-comments.test.ts`). Where it differs:
  - a comment inside syntax TypeScript erases within a value statement (`const sample = null as⏎/* @refresh reset
*/⏎unknown`, or `satisfies`): SWC (Rsbuild) drops it with the erased type in the file; the copy stands alone and
    is read, so the split route resets the state the unsplit one keeps. Matching it means replaying the statement,
    which runs its initializer twice;
  - a comment trailing an expression statement (`console.log('init') /* @refresh reset */`) is read by SWC in the
    file and not in the chunk, and one inside an expression statement is not copied (both as `main`);
  - two `@refresh` comments in one file, one of them on a type-only statement: the chunk can hold them in the other
    order (solid-refresh takes the first it finds: `granular` on a type, then `skip` on an export, skips the split
    component), and a copy directly above a type statement that follows the imports is erased with it by SWC;
  - a comment that also holds a JSX pragma is not copied alone;
  - a comment on type-only export syntax (`export type { X }`, `export type * from`) is in neither output. That is
    what the unsplit file gives where TypeScript erases the statement before the refresh plugin reads it (SWC on
    Rsbuild, solid-refresh on Vite); a refresh plugin that reads comments before erasure (Babel's) reads it in the
    unsplit file only (Gemini F4, review of the implementation).
    SPEC J2.16. No test (the outcome is the limit).
- **Solid on Rsbuild: with the component and the loader in one split chunk, the first loader edit after an edit of
  the route module alone is missed** (review of the implementation, 11-23: Astra, Fable, Gemini; the same on the base,
  and `main` misses both). The route module's evaluation forgets which chunks evaluated, so the chunk's next
  evaluation, solid-refresh accepting its own update, reads as the chunk's first since the route module ran: the
  route does not load again, and the page keeps the old loader's data until the next edit of the chunk, which shows.
  Telling the two apart needs a signal the host does not give. Seen on Rsbuild (`codeSplitGroupings:
[['component', 'loader']]`, then a `beforeLoad` or `staleTime` edit, then a loader edit); standalone webpack showed
  both edits. No test (the outcome is the limit).
- **React Start on Rsbuild: a root route that renders the document keeps its error component after the edit that
  fixes the route it caught** (review of the implementation, Astra; the same on the base and on `main`). With a root
  route whose component renders `<html>` and an error component of its own catching a child's hydration throw, the
  fixing save leaves the root's error component in the original document on Rsbuild; on Vite the fix shows
  (`start-plugin-core/tests/integration/start-dev-route-error-recovery.test.ts`, "%s: a root route rendering the
  document with its own error component: …", Vite only). No test (the outcome is the limit).
- **A lazy route component of the app inside a split chunk is not imported again after its import failed**
  (review of the implementation, Astra P2; production too). With `autoCodeSplitting`, the route's component option
  (the app's `lazyRouteComponent(…)`) lives in the chunk the compiler's own lazy wrapper loads; the router's load
  preloads only that outer wrapper, so once the app's wrapper failed (its importer fetches a service that is down) a
  navigation back or `router.invalidate()` renders its failure again, with or without an edit. A save while the
  service is down renders the new code at once (a component's arrival resets the boundary), which spends the new
  wrapper's first attempt too; the base happened to show the view at the next navigation, as its save left the new
  wrapper untried. React and Solid; a Vue page shows nothing for that failure, before any edit too. Unsplit, the
  router imports the app's wrapper again: `integration/route-hmr-browser-lazy-retry-cases.ts`. No test for the
  split case (the outcome is the limit).
- **React on Vite: a split chunk that is no React Refresh boundary shows its new component after a 200 ms bound**
  (unchanged by the route HMR design, 11-23): the route waits for React Refresh's pass before it takes a component the
  pass may patch, and a chunk Refresh does not instrument never reports one. No test (the outcome is the limit).

- **The server namespace of a module with a lazy handler module has extra keys** (R164, coverage-review-B F2;
  accepted: "people shouldn't be inspecting the modules of something we compile"). The handler module imports what
  the file keeps, so the file exports it under generated names (an exported server fn's RPC wrapper, a kept local a
  handler reads, the loader): `Object.keys(ns)` of an `import * as ns` of such a module lists them on the server and
  not on the client, and rendering it fails hydration (React #418). `Object.values(ns)` gets each server fn twice.
  Member reads (`ns.alpha()`) are unaffected. Workaround: enumerate an explicit list.

- **A class, enum or namespace only a server fn handler reads runs at the first call on the server** (R163 round-2
  rulings (c), review-a1-classes-stay-round2 3, `s13`; accepted: R157/R158 cover classes like any declaration): the
  lazy handler module holds what only the handler reads, so `class Repo { static made = registry.add('repo') }`
  read by a handler alone registers when the server fn is first called, where `main` runs it at route load; a
  loader reading `registry` before the first call sees it empty. The same as a `const` on `main`. R157 rule 4 keeps
  it at load when its body reads a declaration the file keeps. Workaround: read it from code that runs at load.

- **A handler-only snapshot of an imported object the module writes around it reads the object at the first call**
  (Astra R3 core B2; user, 11-18: known limit): R157 rule 4 keeps a handler-only declaration at load when its
  initializer reads the file's own state, and an import is not file state, so in
  `import { cfg } from './state'; cfg.value = 'opening'; const onOpen = cfg.value; cfg.value = 'ready'` a handler
  returning `onOpen` gets `'ready'` (the lazy handler module evaluates `onOpen` at the first call, after both writes),
  where `main`, whose provider copy runs the whole file again at the first call, gets `'opening'`. Counting imports as
  file state would keep every handler-only declaration naming `z`, `db` or `env` at load. A local alias
  (`const cfg = external`) or one write gives the same value on both. No test (the outcome is the limit). Workaround:
  read the snapshot from code that runs at load, or write through a local alias.

- **A class, enum or namespace that erased text and staying text both name only in types leaves with the erased text**
  (R163 round-3 rulings, review-a1-classes-stay-round3 3, `v1`, `v2`, `v7`, `v12`; accepted: leaks first, as `d8`
  and `u9`): with `deleteNodes: ['server']`, a deleted handler holding `const d: M | null = null` takes `class M {
static made = … }` off the client also when the kept loader, the split component or a `type` alias names `M` in a
  type, so its body does not run there, where `main` keeps it (and ships what it imports). A by-value read from
  staying code keeps it. Workaround: read it by value from code that stays, or drop the type mention from the erased
  code.

- **A declaration the source reads only in types is removed when split code reaches it** (R163 round-2 rulings (d),
  review-a1-classes-stay-round2 5, `q4`; accepted): `const defaults = (routes.push('home'), { a: 1 })` named only by
  `loader: (): keyof typeof defaults => 'a'`, with a split component reading `Route`, leaves the route module and its
  initialiser never runs. The same when the split component's own annotation names it, when a `const` the chunk
  takes names it in a type, and when erased text names it, directly or through a `type` alias. `main` never removes a
  declaration the source reads only in types (its "read in the original" counts values), but removes one a split
  option read by value even when a kept annotation still names it;
  ours counts type uses in "the source used it" (R153 amendment) so that a value import a split component names only
  in a type leaves with it. Counting every type reference in text that stays as a use was tried: it changed 1,345
  corpus compiles in 303 files, putting value imports used only as types (`hono`, `elysia`, `zod`, generated API
  types) back into client route modules. Workaround: read it by value from code that stays.

- **With RSC, a `<ClientOnly>` in a server component outside a server fn's handler shows its fallback, then
  nothing** (as `main`; review-coverage-fix-batch 1): the environment that renders server components keeps
  `<ClientOnly>` children only in handler text, since it also evaluates modules whose components only SSR and the
  browser render, and their children may read browser-only code (a `.client` file, `window`). A `Panel` component
  holding `<ClientOnly fallback={…}><Widget /></ClientOnly>`, rendered by a handler, has no children in the Flight
  payload: the server HTML and the first paint show the fallback, and once the page hydrates the fallback goes and
  nothing replaces it (measured on Vite and Rsbuild builds, audit-diagnostics 2026-11-17: gone within 250 ms, still
  empty at 6 s; the same `<ClientOnly>` in the handler's JSX shows its children). Workaround: write the
  `<ClientOnly>` in the handler's JSX or in a client component.
  `start-plugin-core/tests/planners/start-env.test.ts` ("keeps <ClientOnly> children in a handler…").

- **A hoisted server fn whose chain runs a callback or a getter at load that reads its own statement's declaration is
  not refused** (R162; review-phase3-fixes; accepted: niche, no corpus file): the order refusal counts what the chain
  reads at load outside its functions and in a function called or constructed in place (hotspot 5, S8), so a
  synchronous callback another call runs, a getter or a constructor inside the chain that reads a `let`/`const`/`class`
  of the same statement throws at load (a `var` reads `undefined`). `main` fails the build on every such shape.

- **A hoisted chain holding a class it never constructs while defined is refused when the class's instance field reads
  a binding declared later** (hotspot 5, §4; a known incorrect rejection, contrived):
  `.validator((class V { field = later; static validate = (d) => new V().field(d) }).validate)` with `later` below
  reads `later` only when called, yet an instance field's initialiser may run while its class is defined
  (`static validate = new V().field`), and telling the two apart needs a proof the shared walk does not give. `main`
  refuses the position. Workaround: declare what the field reads above the statement. Control:
  `start-plugin-core/tests/createServerFn/load-positions.test.ts`: "is a compile error when it reads a declaration of
  its own statement, in an instance field of a class constructed while it is defined".

- **Code the client erases inside `<Hydrate>` children is still validated** (hotspot 5, §4; a known incorrect
  rejection): `createIsomorphicFn().server(() => this.x).client(…)` or `createServerOnlyFn(() => this.x)` in the
  children is refused in both environments, because the server validates the same children (J5.5) and there the
  server half is live; `main` accepts the client and refuses the server, so its build fails too. Workaround: read
  `this.x` into a local before the boundary. No test (the outcome is the refusal).

- **A function loader the router splits and calls through its chunk sees the chunk's module namespace as `this`**
  (hotspot 5 decision 4; as `main`): a named, conditional or imported `function` loader (`loader: myLoader`) is split,
  and `lazyFn` calls `imported[key](...args)`, so `this` is the chunk's namespace where the router's own call gives
  `undefined`. A function written in place that reads `this` stays unsplit with `split-this` (#8688). People should
  not use `this` here; a receiver-forwarding `lazyFn` is a follow-up. No test (the outcome is the limit).

- **A `function` server fn handler sees the lazy handler module's namespace as `this`** (hotspot 5 decision 4): on
  the lazy path the handler module calls it as a member; on the eager path (a top-level `await` in the file) and on
  `main` it gets the server fn's options object. Undocumented in both forms; the handler's parameter carries what it
  needs (`method`). No test (the outcome is the limit).

- **A render-time read after the children call a captured function that assigns the variable reads the value from
  before the call** (hotspot 5, §4; as `main`): `{(bump(), x)}` with `const bump = () => ++x` renders the value the
  placeholder passed, not the one `bump()` gave; refusing it needs to know what a captured function writes when
  called. The variable read in a function (`{(bump(), (() => x)())}`) keeps the children in place (decision 12). Rare:
  the variable must be read directly as well as through the function. No test (the outcome is the limit).

- **A Solid directive reassigned after the chunk read it keeps the first function** (hotspot 5, §4, Gemini P29; as
  `main`): a directive local reaches the chunk by value (`const tip = props.tip`), so a call telling the two functions
  apart after a reassignment sees the old one. Contrived; renaming directive locals would be new machinery. No test.

- **`import.meta.url` in moved code names the derived module** (hotspot 5, §4; as `main` for what it splits): a split
  option, Hydrate children or a lazy handler evaluate it in a module whose id is the file's path with a query, and
  what the bundler emits for it is the bundler's. Resolving a relative asset is unaffected; comparing the full URL is
  not. No test (the outcome is the limit).

- **Hydrate's hook rule is by name and by place** (hotspot 5, §4): a hook under another name (`import { useId as mk }`,
  `const read = useContext`) is not seen, nor is a hook in a callback another call runs during render (`.map()`):
  each moves into the chunk's component. `main` checks no hook at all. Workaround: name hooks `use…` and call them in a
  child component. No test (the outcome is the limit).

- **React children `main` splits stay in place** (decision 12, 11-25: "not a real case"): children writing a
  captured local (a render counter in a `.map()` callback, `pageNumber++`, read only there), a function of the
  children reading a local the component reassigns (wherever the writes are, a write before the boundary included),
  and a read of a local whose declaration does not end before the boundary (declared after it, or the boundary in
  its own initialiser) are not split, with one warning naming why (`split={false}` silences it). `main` splits them:
  its chunk counts on its own copy, its function reads the value of the render, and its placeholder may read the
  local before it is initialised (a render helper written above the local reads it in time: the cost here). No
  proof of when writes run.
  `start-plugin-core/tests/integration/pages/hydrate-moved-code.test.ts`: "$name: in place, warned at $at".

- **A hoisted server fn reads a module binding before an earlier operand of its statement writes it** (R181 (3),
  Astra start review 4; accepted: `main` refuses the position, "createServerFn must be assigned to a variable!"):
  R162 hoists a server fn not written as a top-level declaration above the statement holding it, so in
  `export const api = { first: update(), run: createServerFn({ method }).handler(…) }`, where `update()` sets
  `method = 'POST'`, the chain reads `method` before `update()` runs and the server fn's method is `GET`. No refusal
  (R181). Workaround: set what the chain reads before the statement, or declare the server fn at the top level. No
  test (the outcome is the limit).

- **In a route file with a value `export *`, a star target's export named `tsr$<name>` is shadowed by the split's
  glue** (R181 (2), Astra core review 3; accepted): the route module exports what a split chunk imports from it (a
  binding a statement declares, `if (…) { var value }`) under a glue name, which in a module with `export * from …`
  is `tsr$<name>`, since the star targets' names are not read; ECMAScript gives the module's own export priority over
  a star, so an importer of `tsr$value` reads the route's binding instead of the target's export. `main` has no glue
  exports. No corpus route file exports a `tsr$`-prefixed name. Workaround: give no `tsr$`-prefixed export to a
  module a route file star-re-exports. No test (the outcome is the limit).

- **A hook call only removed code reads goes, so a hook that takes an id shifts the ids after it** (R166; SPEC G16;
  as `main` for `<ClientOnly>` children and for a `<Hydrate>` `fallback` in a split route chunk; `main` keeps the
  call for a `fallback` in any other file, where a hook taking an id works and a browser-only hook crashes the
  server render: review-r166-drop-hooks 2). `<ClientOnly>` children and a `<Hydrate>` `fallback` on the server, the other environment's half of an
  env-only function: a declaration only that code read goes with its initialiser, a hook call included, and so does
  the import only it used. A hook that needs the browser then renders on the server (`integration/clientOnlyJSX.test.ts`:
  "browserHook…"; `integration/hydrate-build-cases.ts`: "a browser-only hook only the fallback reads lets the server
  render the children, …"). A dropped hook that takes an id (`useId`, a custom hook that calls it, Solid's
  `createUniqueId`) changes the ids the server gives the component's later `useId` calls and the components below it:
  React reports a hydration mismatch (#418) and renders the tree again on the client; Solid does not hydrate the page.
  `const label = useLabel()` (calling `useId`) with `<ClientOnly>{label}</ClientOnly>` and a later `useId()`.
  Workaround: call the hook in a component inside the boundary and render that component (the docs' fix for a hook
  call in `<Hydrate>` children, deferred-hydration.md). No test (the outcome is the limit).

The removal rule's limits (SPEC G16; the merged DCE design, user decisions D1 to D8 of 2026-11-22 and the v4
declaration table of 11-23). Rows: `start-plugin-core/tests/start-compiler-removal-definitions.test.ts`,
`start-compiler-removal-types.test.ts`, `start-compiler-removal-routes.test.ts`.

- **A name only a direct `eval` reads can leave** (D6 B; as `main`): references are static. `const s = secret()` with
  erased code reading `s` and kept code running `eval('s')` loses `s` on the client (`ReferenceError` there).
  Workaround: name the binding in kept code (`eval` aside, pass it: `run(s)`). No test (the outcome is the limit).

- **A removed definition takes its own evaluation with it** (D7 A): its initialiser's call, a removed name's property or
  getter read (`const { unused, secret } = getters()` no longer reads `unused`), a computed key, a removed default's
  effect or error, a removed class's decorators and static blocks. A dead parameter default takes its call too,
  `super()` included: a derived constructor whose only `super()` call is such a default throws on the client.
  Workaround: put the effect in a statement of its own (`register(); const x = …`). Rows: "a never-read sibling leaves
  with its declarator", "a local function and a class with a static initialiser".

- **A pattern that stays loses its dead positions, and a `null` below one no longer throws on the client** (D8 B, D8d
  A): `const { session: { user }, theme } = props` with `user` only in a handler is `const { theme } = props` there, so
  `session: null` throws on the server only. Beside a rest element that stays the position is emptied (`n: {}`), and a
  default of an emptied pattern becomes `{}` or `[]`: a default the source could not destructure threw there and not
  here. Workaround: validate the value in code that stays. Rows: "a server default beside a rest element: missing,
  present and null values", "an emptied position beside a rest element keeps the rest's keys".

- **A plain parameter whose every read is removed gets `void 0` for its default** (D4): `make(db = getServerDb())`
  becomes `make(db = void 0)`; a literal default stays, `length` does not change. A parameter the body declares again
  (`var db`, `function db() {}`) and a TypeScript parameter property keep their default. A parameter emptied in place
  keeps its type annotation, which may name an import that left (`g(db: ReturnType<typeof getServerDb> = void 0)`):
  TypeScript text only, which every bundler strips. Rows: "a plain parameter".

- **A statement that only assigns stays, with what it reads** (D3 A, R154): `let db; db = connect()` read only by a
  handler keeps the assignment and its import on the client, silently unless the imported file is protected (a
  `.server` file or a `server-only` marker: import protection reports that one), and in the production bundle too
  when the statement or the import has an effect at load. Server code passed by name whose binding the module
  assigns (`.handler(h)`, `createServerOnlyFn(h)`, `.server(h)`, `.validator(h)`, a route's `server.handlers.GET: h`,
  `createHandlers({ GET: h })`, `...h`, `middleware: [h]`, `headers: h`, `ssr: h`, with `h = …` outside server code)
  is refused (`start-server-code-reassigned`, `route-server-code-reassigned`), whatever else reads it (user decision,
  2026-11-26: no exception for an exported or client-read binding, no guard analysis; the fix is a `const`). Still
  built, with the assignments kept: a binding only a handler reads that a top-level statement initialises
  conditionally (`let conn; if (url) { conn = connect() }`); server code reached through another name
  (`.handler(withLogging(h))`, `.handler(() => h())`, `.handler(impls.h)`, a `handlers` function of more than one
  statement: a follow-up, its own rule and decision; `main` leaks these too); route server options the router cannot
  read (a spread at the top level, a computed key: `options-unread`), and a `handlers`
  function whose result is not one `createHandlers(…)` call. `main` keeps the same statements. Known limit (user,
  2026-11-24): too narrow a case for machinery; a warning would flag correct `if (import.meta.env.SSR)` setup.
  Workaround (documented in the execution-model guide): the setup in its own module only server code imports, or
  `const db = connect()`. Row: `start-compiler-erasure.test.ts` "a `let` a top-level statement assigns stays with the
  statement, which runs at load".

- **Only a direct self-read is seen** (accepted limit, user direction 2026-11-26, pile-of-cases item 3: stop proving
  timing): a declaration reads itself only where the read stands outside any function, class field value or static
  block of it (`const x = x`, `const { a = a } = o`, `function f(a = a)`, `class X extends X {}`). A declaration whose
  evaluation throws only through a call, a getter, a tag or a class's static initialiser that reads it (`const v =
(() => v)()`, `const x = ({ get d() { return x } }).d`, `const v = class { static s = v }`) is not seen: such a
  declarator leaves where the source throws at once. Low user risk: the source fails wherever it runs; the difference
  is observable only where the code catches the `ReferenceError` itself. A self-read in a branch that cannot run still
  keeps its declarator, and a declarator that reads itself stays whole, with what its other names hold. Rows:
  "self-reads".

- **A binding nothing reads is not ours, also beside a type of its name that removed code used** (D1 A): with `const
db = connect(); type Foo = typeof db; const Foo = register()` and erased code naming `Foo` as a type, `db` leaves
  and the unused `const Foo` stays (as on `main`), so `register()` still runs. Workaround: remove the unused
  declaration. Row: "a binding nothing reads stays beside a type of its name erased code names".

- **The annotation of a `declare` pattern is read whole.** With `declare const { server, client }: { server: typeof
db; client: typeof registered }` and erased code reading `server` only, `registered` (which only `client`'s part
  names) leaves too: the client registers 0 times where the source registers once. The same with a tuple pattern and
  with an annotation behind a type alias. Workaround: one declarator per name (`declare const server: typeof db,
client: typeof registered`), which is exact. No test (the outcome is the limit).

- **A namespace with runtime content is read whole, an ambient one that exports an alias included.** With `declare
namespace API { export import Settings = Kit.Options; export type Tracking = typeof reg }`, erased code naming only
  `API.Settings` also takes what `Tracking` names (TypeScript counts the `export import` as runtime content). The same
  for any namespace holding a value: a registration only another of its type members names leaves with it. Through a
  qualified path that does not resolve, a namespace of types is followed whole the same way. Workaround: `export type
Settings = Kit.Options`. The same rule also leaks, as on base and `main`: with `namespace NS { const db =
getServerDb(); export type T = typeof db; export const live = 1 }`, erased code naming `NS.T` and live code reading
  `NS.live`, `db` and its import stay on the client, since the namespace is kept and read as one value. Workaround:
  declare `db` outside the namespace. No test (the outcome is the limit).

- **A `declare` of a value beside a definition of the same name is read at the top level only**: inside a namespace
  body (`namespace Outer { declare var x: typeof db; var x = … }`) the server value its type names stays in the
  client, as on `main`. Workaround: declare the type with the definition (`var x: … = …`). No test (the outcome is
  the limit).

- **What a `<Hydrate>` boundary inside a removed definition names in a type is not followed**: `function Dead() { return
<Hydrate><span>{String(null as unknown as T)}</span></Hydrate> }` with `type T = typeof db`, `Dead` read only by
  erased code: `Dead` leaves, `db` and its import stay (as on `main`). Text the boundary's chunk claims names its types
  for itself. A value read (`{String(db)}`) is followed. Workaround: write the type directly in the boundary
  (`null as unknown as typeof db`); then `db` leaves. Dropping the type mention alone does not help: `db = getServerDb()`
  is then code nothing used, and stays (D1). No test.

- **Vite 8's Oxc rejects some TypeScript spellings, so they never reach the compiler there**: `declare var App` before
  `function App`, `declare namespace App` before `const App` or a hoisted `var App` ("Identifier `App` has already been
  declared"), and a parameter the body declares again as a function. Oxc accepts `declare namespace App` before
  `function App`. Rsbuild (SWC) and Vite 7 (esbuild) accept all of them; `integration/start-build-removal-declare-first
.test.ts` holds two of them on Rsbuild. In the Vite test host, `import A = N` of a namespace that holds only types is
  emitted as `var A = N`, which throws in the source already. No test on Vite (its own toolchain).

- **Root routes are not split** (R60, SPEC J2.7): their components render on every page, or on error and not-found
  responses, where a lazy chunk only adds a round trip. `router-plugin/tests/integration/known-bugs-code-splitter-page-
code.test.ts`: "a root route's components load with the route module" (Vite and Rspack).
- **A value both staying code and a split option read can throw before `Route` exists, through an import cycle** (as
  on `main`; R183, astra-factcheck-router-hosts.md R1). Such a value is declared in the route file's shared module,
  which loads before the route module. `const config = readConfig()` read by an eager option and by the loader, with
  `read.ts` importing `Route` from the route file: `readConfig()` runs while the route module hasn't evaluated, and
  the page fails to load (webpack: `Cannot access 'Route' before initialization`; Vite:
  `Cannot read properties of undefined (reading 'options')`). Every split option behaves alike: an arrow, a method or
  an object-form `handler`. Workaround: compute the value inside the functions that use it, or don't read `Route` from
  a module the route file imports. No test (the outcome is the limit).
- **A split option reads its own copy of a module `let` or `var` that code staying in the route module assigns** (as
  on `main`; R183, astra-factcheck-router-hosts.md R2). The option's chunk copies the declaration.
  `let mode = 'initial'` with `beforeLoad: configure` (assigning `mode = 'configured'`) and a loader returning `mode`:
  the loader returns `'initial'`. Every split option behaves alike: an arrow, a method or an object-form `handler`.
  Workaround: declare the binding in a module of its own and import it (a chunk imports what the route file imports),
  or keep the option in the route module (`codeSplitGroupings`). No test (the outcome is the limit).
- **Pattern imports are not covered by import protection** (R142, SPEC J6.7): `import.meta.glob`, a template-literal
  `import()`, Rsbuild's `import.meta.webpackContext` / `require.context`. A pattern importer, exempt or outside the
  scope, gets the denied file as its plain importers make it served; with none, the mock, and a build warns once about
  the file, naming it, its importers and the fix (import the file statically from a module that `exclude` or
  `ignoreImporters` exempts inside the scope). `unchecked-importers.test.ts`: "a build warns once about each denied
  file whose every importer is exempt or outside srcDirectory, …", "a build with the error behaviour does not fail on
  them, and warns the same", "a dev server reports each denied file only an unchecked importer reaches".
- **A Vite build serves a denied file reached by an exempt plain importer and an exempt pattern importer as it
  compiled it first** (a build compiles a module once; Rsbuild and the dev servers compile the file again): both get
  the mock when the pattern import came first, the real module otherwise. The build reports the shape under
  `behavior` either way (R142 (2), design 4 closing follow-up): it fails with `error`, warns with `mock`, naming the
  file, the importer that needs it, the pattern import and the fixes; only when what it served is in the output: the
  mock wherever an import of it runs, the file as it is wherever code of it is kept. So the outcome follows the order
  when nothing uses the file's code: an unused import of it in the plain importer keeps the mock (an import of a file
  under its own id runs it), not the file's code, so the build fails when the pattern import came first and builds in
  the other order (a rule for both orders would predict what the file's own code does, which import protection does
  not). No test (the outcome is the limit).
  `start-plugin-core/tests/integration/importProtection/served-verdict.test.ts`: "two exempt importers, the plain one
  compiled after the denied file: the %s build …" and "… the plain one compiled first: the error build fails …" (a
  user plugin holds one importer's `load`). With a checked pattern importer (or a checked module another plugin adds an
  import of the file to), the importers disagree and every build fails on both hosts, whatever the order (R147;
  "… R147 > …" in the same file).
- **Vite dev: a denied file stays the real module after an edit removes the last import of the exempt importer that
  needed it, or removes an import `allowImport` allowed**, until a restart: a pattern importer gets the real module.
  Unlike the rejections above, this is the unsafe direction, in dev only. The dev server keeps every module it served,
  records a dropped import only after the importer's whole transform, and a module requested by URL has no importer,
  so no signal tells that the importer is gone (design 4 final review, architect ruling: a documented limit, dev only
  as R142 (3); the guide's Limitations). Builds, `build --watch` and the Rsbuild dev server forget an importer their
  compilation no longer holds (`served-demand.test.ts`). No test of the Vite dev outcome: it is the limit itself, and
  a test would pin it.

- **A split chunk's caller copy of a server fn differs from the source as `main`'s chunk does** (R159; SSR as the
  provider). A server fn only a split component names lives in the module's lazy server module (its one executing
  instance); the chunk holds a caller copy (the chain with its middleware, without its validator, `createSsrRpc(id)`
  as its handler). Three differences from the source, each `main`'s: (1) the copy evaluates the chain's root and its
  `.middleware(…)` argument again when the chunk loads (a factory call `makeFn()` or an effect there runs once in the
  chunk and once in the lazy module); (2) a middleware's `.client()` half runs in the copy, so state it shares with
  its own `.server()` half is that of the copy's evaluation when the middleware module is not one both import; (3) a
  top-level statement naming a server fn the module keeps (`register(save)`) runs again in a chunk that copies it.
  Values of the server fn itself are the source's (one executing instance): `start-plugin-core/tests/integration/
start-build-lazy-handlers.test.ts`, "SSR (R159) %s: …" and "SSR: a server fn a top-level statement names and the
  split component calls has one instance: 1 2 3 4". No test holds the three differences: they are the limit itself.

- **A `<Hydrate>` chunk copies the module-level declarations its children reach, as `main`'s chunk does** (R155, R161
  D1; spec-phase2-hydrate H1). The copy is a second instance, and no top-level statement is copied. Bugs of `main` the
  PR no longer fixes, each with its input (the children inside `<Hydrate when={…}>`):
  1. a context created in the module: `const Theme = createContext('light')`, children `<Label />` reading
     `useContext(Theme)`, under `<Theme.Provider value="dark">`: the client renders `light` (hydration mismatch);
  2. the same in Solid (`createContext('no-provider')` in the page module): the children read `no-provider`;
  3. a `let` the module reassigns: `let clicks = 0; export function bump() { clicks++ }`, children `{clicks}`, after
     `bump()`: the chunk shows 0;
  4. an exported declaration: `export const store = makeStore()`, children `{store.id}`: two stores, `makeStore`
     runs twice;
  5. an export initialised by a call: `export const Widget = initialize('w', function Widget() {…})`, children
     `<Widget />`: `initialize` runs twice;
  6. a compound component: `function Card() {…}; Card.Title = function Title() {…}`, children `<Card.Title />`:
     undefined in the copy ("Element type is invalid");
  7. `Object.assign(Tabs, { Tab })`, children `<Tabs.Tab />`: the same;
  8. a registry filled by a top-level call: `const registry = new Map(); registry.set('a', 'A')`, children
     `{registry.get('a')}`: empty in the copy;
  9. a helper both the module and the children call, writing a module `let` (review-phase2-fixes 1.2): an id counter
     (`let next = 0; const uid = () => 'id' + next++`) gives duplicate ids on both sides; a run-once flag (`let done;
function init() { if (!done) { done = true; register() } }`) registers twice; a setter pair (`export function
setTheme(t) { theme = t }`, `export function getTheme()`), children calling the setter, kept code the getter:
     the getter stays at the old value. (A lazily built cache or a scratch variable of that form is correct on both
     sides: each reads the copy it wrote.)
  10. a `let` the route's component reads (in its split chunk), assigned by its boundary's children, nothing in the
      route module reading it: two copies, the component shows the old value. The refusal below tests the route module
      only as the keeper.

  `split={false}` keeps one instance (`hydrate-build-cases.ts`: "an exported let the children of a split={false}
  boundary assign stays live"). A binding leading back to the boundary (a recursive component), the route binding and
  a name a top-level statement declares are imported, not copied (H2). Code that left the module (the children, a
  component only they render) and would assign the chunk's copy of a binding the module also keeps (an exported `let`
  a component outside the boundary assigns, a `let` the loader reads) keeps the children in place, with one warning
  (decision 12), instead of being copied; code the module holds too (item 9) is copied. No test holds the ten: they are the limit
  itself.

- **A `<Hydrate>` chunk copies a destructuring declarator whole** (`const { a, b } = make()` with children reading
  `a`): `main`'s copy keeps `{ a }` only. When a sibling the children don't read has a default with an effect
  (`const { a = record('a'), b = record('b') } = cfg`, children reading `b`), the module keeps the declarator for that
  effect and the chunk copies it: both defaults run twice, as items 4 and 5 of the entry above. Lazy bytes only (+4 B on the probe); the chunk evaluates `make()` once on
  both; pruning a pattern changes which getters run. No test (the outcome is the limit).
- **React on Vite: an edit that only changes `codeSplitGroupings` resets the component's state** (coverage review A,
  finding 2; recorded, not ruled). The edit moves the component into another chunk (or back into the route module),
  and React Refresh mounts it anew there: a counter shows 0 after the default groupings become
  `[['loader', 'component']]`, `[['loader'], ['component']]` or `[]`. No reload, and every edit shows. `main` keeps
  the state through the move (on Rsbuild `main` does not show these edits at all). Edits that add or remove an option
  lose state on both. No test.
- **Vite: a server fn of a `node_modules` library the app does not list in its `package.json`, called during SSR,
  throws** (coverage review B, F3; `main` is broken there too). Start's library discovery does not bundle such a
  library (a transitive or hoisted dependency behind an installed package that does not declare Start) for SSR, so
  its `.handler(fn)` is not compiled, and the SSR call reads the missing `serverFnMeta`: `TypeError: Cannot read
properties of undefined (reading 'id')`, page 500 (build and dev). `main` resolves `undefined` and renders the page
  without the value. The browser's HTTP call works on both, and so does everything once the library is declared.
  Rsbuild bundles and compiles it. Discovery goes through workspace packages and packages that declare Start (node_modules
  policy, decision 5), not through an ordinary installed package: Vite keeps that package external on the server,
  and listing the library would not change how it loads it. The client build warns at the library's module, with
  both ways out (decision 6, case ii; it does not name the parent: a build does not know a module's importers when
  it compiles it). `start-plugin-core/tests/integration/start-build-vite-crawl.test.ts`: "a Start package behind an
  ordinary installed parent: the client build warns at its module".
- **A package that does not declare Start and forwards a builder under a new name with no builder call ships the
  app's handler built on it** (node_modules policy, decision 11, A; D-21 B; `main` strips it). A module that names
  no Start API and forwards with `export const chain = base` or `export default base`: Start follows only an
  undeclared package's re-exports (`export … from`, `export *`) and export lists naming a value import
  (`import { base } from …; export { base }`), so `chain` is not followed. When that package also makes the
  builder, that module's compile warns once that the package must declare Start (decision 6, case i); when the
  builder comes from a package that declares Start, nothing warns and the handler ships.
  `start-plugin-core/tests/integration/start-build-package-policy.test.ts`: "a package that does not declare Start:
  one warning, naming one of its modules". Fix: the forwarding package declares Start as a peer.
- **Vite RSC: a server function defined in a different file per export condition fails the production build, and
  development answers each caller with its own file** (node_modules policy, decision 13, A). The RSC environment
  builds before the client and lists the functions of the files it resolves; the browser's call names the browser's
  file. Contract: conditional entries re-export one defining module.
  `react-start-rsc/tests/integration/rsc-start-build-conditional-package.test.ts`. Making development fail the same
  way needs the provider to resolve every client-registered definer with its own conditions (option B's walk); not
  done.
- **`@tanstack/<fw>-start-server` and `@tanstack/start-server-core` imported directly are not server-only-marked**
  (node_modules policy, decision 12, B, narrow shape). Only the public `@tanstack/<fw>-start/server` entry carries the
  marker. A module that keeps a client use of the internal packages ships Start's server runtime on Vite (Rsbuild
  fails on `node:async_hooks`). Both are implementation packages, not documented entry points; no test.
- **A `<Hydrate>` chunk imports a declaration that a `var`-declaring top-level statement reads** (the rule split
  chunks follow, `main`'s router splitter deletes such a declarator; `main`'s Hydrate transform copies it;
  review-phase2-final 3.2, 4.2). `const cfg = { n: detect() }; if (typeof window !== 'undefined') { var extra = cfg.n }`
  with children reading `cfg`: the module exports `cfg` and the chunk imports it (+21 B eager on the probe;
  `detect()` runs once, `main` runs it again in its copy). With `let cfg` assigned in the children, the children stay
  in place with a warning (decision 12), where `main`'s chunk assigns its copy. Rare (a
  top-level statement declaring a `var` and reading module state the children use). No test.
- **Vite: a second `buildApp()` in one process prerenders with the first build's server** (re-check 6 finding 2, the
  Vite half; seen on 0a261a0259 with `/var/tmp/rsc-p1-r10/vite-prerender/app/run.mjs`, `main` not run). A program that
  calls `createBuilder()` and `buildApp()` again after an edit writes the first build's page to
  `dist/client/index.html`; a new process writes the edited one. Start's preview plugin imports `dist/server/server.js`
  by its file URL (`vite/preview-server-plugin/plugin.ts`), which Node keeps for the process's life. The prerender
  goes through `vite.preview()` (the platform plugins answer there), and a query on the entry would leave the RSC
  build's unhashed imports (`__vite_rsc_assets_manifest.js`, `rsc/index.js`) of the first build. No test.
- **Rsbuild: a second `build()` in one process prerenders with the first build's server** (re-check 6 finding 2, the
  Rsbuild half; same cause as the Vite entry above; `main` and the PR's base do it too: re-check 8, `owner.py`). A
  program that calls `build()` again on its Rsbuild instance after an edit writes the first build's page (and its
  removed file names) to `dist/client/index.html`; a new process writes the edited one. Start's prerender imports
  `dist/server/index.js` by its file URL (`rsbuild/post-build.ts`), which Node keeps for the process's life, and the
  server's files keep their names from one build to the next. Running each build's server in a worker thread of its
  own was tried and reverted (re-check 8: a worker answers a request only once it has read the whole body, so a
  redirect whose body errors or stays open lost the page it leads to; `Response.error()` failed the build under
  `failOnError: false`; environment writes, `process.chdir()` and preloads behave otherwise in a worker). No test.
- **Rsbuild with a persistent cache: a child compiler's own modules restored from the cache are not checked**
  (Astra round 4, Rsbuild host; known limit). A worker or service-worker plugin's child compiler of the client
  (`createChildCompiler`) that imported `fns.ts` in the build the cache came from keeps its cached module of it after
  an offline change of a file the module's plan read (`base` became a server fn builder, `fns.ts` unchanged):
  `worker.js` ships the previous build's output, the handler's body included. The client's own modules are checked
  (its page calls the server fn); the client compiler's `finishMake` checks the modules of its own compilation and
  cannot rebuild a child compilation's. `main` builds that worker right but serves the client's stale module (the
  page gets `undefined` from the server fn). No test (the outcome is the limit). Workaround: a build without the
  cache (`performance.buildCache`) after such a change. A module the worker newly imports is compiled: the client's
  restored module of the same file is still checked
  (`start-plugin-core/tests/integration/rsbuild/child-compiler-build-cache.test.ts`).
- **Rsbuild with a persistent cache: a build on a cache that a `build --watch` session wrote after an edit dropped
  modules can fail to link** (upstream, web-infra-dev/rspack#16839; hotspot 3 design study §10; as `main`).
  `rsbuild build --watch` with `performance.buildCache`, an edit removes an import, the session ends; a later
  `rsbuild build` on that cache restores the dropped modules with the modules that imported them, and Rspack's
  `rebuildModule` of such a module fails with `ESModulesLinkingError` (Rspack 2.3.3 and canary). A build on a fresh
  cache directory succeeds. Workaround: clear the build cache after such a watch session. No test (the reproduction
  aborts its Vitest worker in some runs; upstream has a plain-Rspack one).
- **Rsbuild: a module Start generates whose bytes an app's `pre` loader rewrites before Start's loader reads them is
  built again in every compilation** (hotspot 3, rule 3 of the Rsbuild host; stated limit, no such setup known). Start
  records on the client route tree, the server-function resolver and the Start manifest the digest of the bytes its
  loader reads, and builds the module again at `finishMake` when that differs from the content Start published: a
  foreign loader that changes the bytes first leaves a digest that never matches, so each compilation builds the
  module once more (the resolver once per content and compilation). The output is right; a warm build and a dev edit
  cost one module build more. No test.
- **Rsbuild with RSC: a second dev server of one Rsbuild instance is not tested** (hotspot 3; Gemini's design, read,
  not run). Without RSC, `createDevServer()` again on one instance serves what its own compilers built (each new
  compiler's virtual file system starts from its initial content: `virtual-modules.ts`, H5-dev). With RSC the RSC
  plugin pair is created once per plugin setup, so the second server's compilers may share the first one's
  client-reference state. No test.
- **Rsbuild: the warnings of a child compilation that runs after its owner sealed are not on the owner at its
  seal** (hotspot 3, rule 4 of the Rsbuild host; stated limit). A worker plugin that runs its child compiler in the
  compiler's `done` (after the owner's `afterSeal`) gets the child's warnings added to the owner's compilation as the
  child seals: Rsbuild prints them once, but an app plugin that reads the owner's warnings at `afterSeal` (a "no warnings"
  policy) does not see them. No earlier moment exists: the child's modules do not exist before it runs. A child run in
  `make`, or awaited in the owner's `processAssets`, is on the owner at its `afterSeal` (`start-plugin-core/tests/integration/rsbuild/worker-warnings.test.ts`, "the
  worker is built once the client compiler is done" for the late child's print). No test of the limit itself.
- **Rsbuild: the warnings of a child compilation that runs after Rsbuild printed its owner** (an `afterDone` tap;
  hotspot 3, stated limit, no known plugin). They are added to the owner's compilation after its report: a one-shot
  build never prints them; a `build --watch` session and a dev server print them with the next report that still has
  that compilation (Rsbuild prints an unchanged compiler's last compilation again). No test.
- **Rsbuild: a program that runs the compiler of `createCompiler()` itself in development mode prints a warning in
  every compilation** (hotspot 3; stated limit). Rsbuild calls no `onDevCompileDone` for such a program, so nothing
  counts as printed: each new compilation of a compiler carries the warnings it holds again. Within one compilation
  each warning is still added once. `rsbuild dev` and `createDevServer()` are once per dev session (but for Rsbuild's
  reprint of an unchanged compilation, the entry below). No test.
- **Rsbuild dev: a warning of a compilation that did not compile again is printed again with every report** (Rsbuild's
  report convention; hotspot 3, Astra's re-check 2). Without RSC, a save that only the server compiles prints a report
  of the client's unchanged last compilation and the server's new one, and Rsbuild formats every warning of both: a
  warning only client code has is printed after every server-only save. Rspack's own warnings do the same (an
  `ESModulesLinkingWarning` of a client-only module, printed with each of three reports). Start adds each warning
  once per dev session; it does not edit a compilation Rsbuild prints again. With RSC both compilers compile again
  and the later reports have none. No test.
- **Rsbuild `build --watch`: the deprecation warning of a custom server function id can be in no report** (hotspot 3;
  stated limit, Astra and Fable re-check 2). The id allocator warns about a deprecated id (`generateFunctionId`
  returning a character outside `A-Z a-z 0-9 - . _ ~ $`) only when it allocates the id, once per session. When the
  compilation that carried it is replaced before a report (a client save while the server finishes the first build),
  no later compilation offers it again, so no report has it; a build without that overlap prints it once. The error
  of an invalid id is returned on every allocation and is in every report. Vite prints what the allocator returns on
  each call, so returning the deprecation every time needs a deduplication there first. No test.
- **Rsbuild `build --watch`: a dependency whose `package.json` is edited to declare Start is still reported as not
  declaring it** (hotspot 3; stated limit, Astra re-check 2 finding 4). The package classification and the manifest
  Start read are fixed for the session: an edit of an installed package's manifest while the watch runs (its directory
  watched) keeps the "does not declare Start" warning in every report. A new build prints none. Restart the watch (or
  the dev server) after editing a dependency's manifest. No test.
- **Vite production build: a server fn only a worker calls is not HTTP-callable** (RSC phase 2, design-rsc-phase2.md
  G10; known limit, Astra review of 36bfa61d07; as c9701e2fc1). With Start in `worker.plugins`, Vite builds the worker
  apart and the client bundle gets it as an asset: its stub (the id and, with a generator, the gate token) is in the
  emitted worker file, but the client publication reads the bundle's `chunk` outputs only
  (`vite/start-manifest-plugin/plugin.ts`), so the server's gate does not list the function and refuses its calls.
  Without Start in `worker.plugins` the worker's code has no stub. Rsbuild reads a child compiler's assets: a worker
  child's call is in the gate. No test (the outcome is the limit). A fix adds the code of Vite's worker bundles to the
  publication.
- **Without RSC, a server fn nothing calls is still built: a handler import that resolves only under development
  conditions fails the production build** (as `main`; RSC phase 2 decision B, 11-20). A route renders a label of a
  module that also exports a server fn no code calls, whose handler imports a package with a `development` export
  only. The SSR provider lists the functions a client compile stubbed (`clientReferencedOnly`), before the bundler
  drops the stub, so it builds the handler: `Package subpath '.' is not defined by "exports"` on Rsbuild (main,
  db260cf3a3 and the PR alike; Vite without RSC not run). With RSC the build lists only what a server compile declares
  or the client's emitted code calls, and succeeds (`react-start-rsc/tests/integration/rsc-start-build-unused-fn.test.ts`).
  Narrowing the SSR provider needs "a server module declares it", which Vite's resolver cannot know when it loads. No
  test (the outcome is the limit; design-rsc-phase2.md §7 B, `/var/tmp/rsc-p2-design/logs/min-*-rsc0.build`).
- **Rsbuild: a module under a Module Federation container, a shared provide or a DLL counts as outside the app**
  (RSC phase 1, design-rsc-phase1-settlement.md amendment 3; stated limit, no fixture). The compilation holds such a
  module through a module with no file (container entry, provide-shared module, `DllModule`), not by itself, so
  import protection's settlement does not count its imports: an exempt import of a denied file made only from it is
  served the mock, cold, from the persistent cache, in watch rebuilds and in dev (a provide-shared module is added
  after the settlement's first run, which its last run judges), and `allowImport` on the file itself is not asked for
  it. Nothing denied ships. No report names the mock (build or dev; as `main`): it shows at run time through the mock.
  A fix would admit the file-less holder by the dependency type of its connection with no origin (`container entry`,
  `provide shared module`), never by its shape (a client reference's SSR module has the same one).
  `start-plugin-core/tests/integration/importProtection/settlement-each-compilation-rsbuild.test.ts`: "a module a
  file-less holder adds after the settlement first ran" (the outcome of the limit, as `main`).
- **Rsbuild with RSC: what the settlement's last run builds after the client handoff has no client references in the
  build** (RSC phase 1, design-rsc-phase1-settlement.md amendment 4; the nested-reach limit). The server compiler's
  closure runs again at the last `finishMake` stage, after the RSC plugin's client handoff at stage 0: a module a plugin
  adds late, built there as its real module, or the resolver built again there, can bring client references the finished
  client build does not have: a nested chain, a server fn whose handler renders a client component nothing else renders,
  which calls another server fn. In a production build the module is settled and the build exits 0, but the component
  is missing from the client manifest: at runtime the outer server fn's result fails with React's `Could not find the
module "…" in the React Client Manifest`. Dev is not affected (the next compilation has the reference). Workaround:
  render the component from server code the app reaches before the client is built (a server component of a route, a
  server fn a route's loader calls). Upstream: https://github.com/web-infra-dev/rspack/issues/16786.
  `react-start-rsc/tests/integration/rsc-start-rsbuild-nested-chain.test.ts`: "a component a server fn the build
  reaches first renders: both clicks answer" (the workaround; the outcome of the limit has no test).
- **Rsbuild: import protection's settlement does not judge what another plugin's `finishMake` tap at the last stage
  adds or builds** (RSC phase 1, design-rsc-phase1-settlement.md amendment 4; stated limit, no plugin known to tap
  there). Every compilation settles its modules at stage −10 and again at the last stage (`0x7fffffff`); a tap
  registered there after Start's runs after the settlement. No test.
- **Rsbuild: two child compilations holding one denied file with different verdicts** (sibling children, or a child
  a loader starts while its parent builds modules again; RSC phase 1, design-rsc-phase1-settlement.md amendment 4;
  stated limit, no fixture). Each compilation settles its own module of the file, but they write one prediction in
  the environment's ledger: one can be served the other's and asked for as its real module a second time, which ends
  that compilation's settlement with its "could not settle" error, not with a guess. No test.
- **Rsbuild dev: an edit of a file only a failed child compilation read starts no compilation** (seen on
  0a261a0259 and db260cf3a3 while writing the amendment 4 rows; cause not isolated: Start or Rspack). A worker
  plugin's child whose build failed (a denied import) is built again by the next edit of a file of the parent. No test.
- **Rsbuild: a retry on the same compiler after another plugin's `make` tap rejected while a child compilation's
  reports were pending fails with the first run's child errors** (RSC phase 1, Astra re-check 10; known limit, user
  11-20). One plugin's `make` tap awaits a child with two denied imports, another's rejects while the first
  `onViolation` call is pending; the caller handles the error and runs the compiler again, no child or rejection in
  that run: its stats hold the two errors of the first run. Same on db260cf3a3; `main`'s retry passes (`main` reports
  no violation of a child compilation at all). The child's closure takes its requests off the queue
  (`reportChildRequests`) before awaiting their reports, so the `failed` tap finds none and `failedReports`, which the
  next `run` waits for, is settled while they are still made; they go into the failed compilation's `errors`, which
  Rspack shows in the next build's stats (bare Rspack does that with a retained compilation). A fix tracks the reports
  already started, by owner, in what `failed`, `run` and `shutdown` wait for; upstream, Rspack would keep a
  compilation's diagnostics with its own build. Drivers: `/var/tmp/rsc-p1-recheck10/race10.py` (deterministic),
  `natural10.py` (independent timers, 1,000-module app), `native10.py` (bare Rspack). No test (the outcome is the
  limit).
- **Rsbuild: an `onViolation` that rejects in a child compilation whose failure the parent recovers skips the child's
  other violations, and the build passes** (RSC phase 1, Astra re-check 10; known limit, user 11-20). An optional
  child (a sidecar the plugin lets fail) imports two denied files and the first `onViolation` call throws or rejects:
  the second call is never made, the parent ends with no error and the CLI exits 0. db260cf3a3 makes both calls and
  exits 1; `main` (no check of child compilations) exits 0. The child's closure (`close`) reports its requests without
  `failing`, so the first rejection ends the reports and becomes an error of the child's own compilation (its
  `finishMake` tap's `reporting`), which the plugin drops with the child. A fix makes every report whatever an earlier
  one did, and puts a failed report into the owner's errors, not the child's. Driver:
  `/var/tmp/rsc-p1-recheck10/extra10.py` (cases `sink-*`). No test (the outcome is the limit).
- **Rsbuild: a child compilation run after the parent compilation's end can trace its violation through an import
  Rspack dropped** (RSC phase 1, Astra re-check 10; known limit, user 11-20; diagnostic only, the denial and the exit
  are right). A child started from a `done` tap after Start's, whose entry `r.ts` (exempt by `exclude`) imports a
  reader of `import.meta.webpackContext` reaching a denied `w.client.ts` and has `if (false) import('./w.client')`:
  the trace is `r.ts` (line 2, the dead import) → `w.client.ts`, without the reader, and the suggestions name `r.ts`.
  The same child run from `make` traces `r.ts → pattern.ts → w.client.ts`. Once Start's `done` tap has reported the
  owner's children (`reportEndedChildren`), the owner has no queue, and the child's `beforeResolve` reports at once
  with the records' trace (Rspack's graph cannot be read while modules build), which holds the dead import. A fix
  keeps such a child's requests until its own closure and reports them there, with its graph, into the owner.
  Drivers: `/var/tmp/rsc-p1-recheck10/extra10.py`, `over10.py` (cases `trace-*`, `context-*`). No test (the outcome is
  the limit).
- **Rsbuild: closing a watch compiler during a compilation can drop a child compilation's queued violations** (RSC
  phase 1, Astra re-check 10; known limit, user 11-20). A child started in the parent's `processAssets` requests two
  denied files and fails before its closure (a `finishMake` tap before Start's), and the plugin recovers it: its
  requests wait for the parent's end. Closing the watcher (`Watching.close`, of the SSR compiler or of Rsbuild's
  MultiCompiler) while the parent still processes assets runs the close callback with no `onViolation` call
  (db260cf3a3 makes both; `main` none); the canceled compilation publishes no stats, so only the calls are lost. A
  custom host's `compile(callback)` then `close` on the SSR compiler, with the same child, ends with a successful
  compilation, no error and no call (`build`, `run`, and a watch compilation that finishes, report it). Rspack ends
  both without `done` or `failed`, the hooks that report what the owner still holds (`reportEndedChildren`), and
  `shutdown` waits only for `failedReports`. A fix reports the open compilation's remaining requests at `shutdown` and
  at an end `compile()` reaches (`afterCompile`). Drivers: `/var/tmp/rsc-p1-recheck10/watch10.py`, `over10.py`
  (`compile()`). No test (the outcome is the limit).
- **webpack watch: a module whose loader declares the route tree as an input fails one compilation after a route
  file is deleted** (astra-r4-factcheck-router.md B4). The route-delete fix builds again the modules whose resource is
  a file the generator wrote (`needBuild`); a loader of another resource (`catalog.txt`) that calls
  `this.addDependency(routeTree)` and emits the tree's imports keeps its result, whose snapshot webpack took before
  the generator wrote: the next compilation reports `Can't resolve './routes/about'` from that module, then builds
  cleanly. `main` reports the error from that module and from the route tree. Rspack is clean (the written files
  reach it as changes, so every dependent rebuilds; `main` errors twice). Rare (a third-party loader reading the
  generated tree as a declared dependency). A fix reads each cached module's snapshot file list in `needBuild`
  (webpack clears `buildInfo.fileDependencies` after a build; the snapshot is private shape). No test (the outcome is
  the limit).
- **A save the generator reads between the editor's truncate and its write can be replaced by the scaffold**
  (review-routeset-astra.md §1; user, 11-22: known bug). An editor that saves in place truncates the file, then
  writes it. A generator run that reads the file in between sees an empty route file and scaffolds it: the scaffold
  is written to a new file renamed over the path, so the editor's write lands in the unlinked file and the path keeps
  `Hello "/about"!`. The window is the editor's own (usually microseconds; the generator reads milliseconds after the
  watcher event). Seen once in the route-set gate's seeded run under heavy load, not in 20 repeats on either side;
  holding a save open 350 ms between truncate and write loses it 20 of 20 times here and 3 of 20 on `main`. Editors
  that save through a temporary file and a rename are not affected. Not fixable by a delay or another read: nothing
  tells an open writer from a closed one. A fix scaffolds only files the generator has never read with content.
  No test (the outcome is the limit).
- **A route file's upkeep is stamped after its rename** (review-generator-generation-gemini.md item 3). The
  generator records the modification time and size of a route file it kept up by a `stat` after the rename. Two
  windows of that `stat`, each microseconds wide:
  - A `stat` that fails with anything but `ENOENT` (the path replaced in between, a directory's permission removed)
    fails the run with the write done but neither recorded nor told to `onWrite`. The next batch rescans (it follows
    a failure), reads the file again (its stamp changed) and finds nothing to keep up. The bundler's own watcher
    reports the rename.
  - A save that lands between the rename and the `stat` pairs the generator's text with the save's stamp. The save's
    own event forces a read, so this shows only when that event is lost (Vite dev's 50 ms rule below): the next
    rescan skips the file as unchanged and keeps the generator's text until the next save.

  A fix stamps the temporary file before the rename (a rename keeps the modification time and size), which moves the
  `stat` into the publisher. The route tree's `stat` after an unchanged comparison has the same window. No test
  (timing only).

- **`vite build --watch` on Vite 8.3: the build after a failed build can emit no app** (hotspot 2 N1; user, 11-22:
  known bug until Vite 8.4). With an HTML entry and `"sideEffects": false` in the app's `package.json` (as in
  `quickstart-file-based`), the first successful watch build after a failed one reports success and emits only
  the module-preload helper; the app is back at the next change. Reproduces with no plugin on Vite 8.3.4 and 8.3.8
  (Rolldown 1.2.x); fixed by Rolldown 1.3.0 and later, which Vite 8.4.0-beta.1 depends on. A route deleted during a
  watch build is one way to fail a build: `main` then happens to run a second build that repairs the output, this
  PR does not. Remove this entry when the repo moves to Vite 8.4. No test (upstream).
- **Start + Rsbuild dev: what the route-set reload guarantees** (hotspot 2 L1; user, 11-22: decision A). After the
  client's route tree changed (a route added, deleted or renamed, a page turned into a server handler or back, a
  lazy file added), the open tab is reloaded once, when: the last finished compilations of Start's client and server
  have no errors; the client has emitted the generator's current client tree; the server has emitted a tree module
  built from the current tree file (or built through a loader that reads it before Start's); and every route file
  for which two readings exist was built by the server from the bytes the generator has. Two readings exist for a
  file when the published tree imports it and Start's loader was the first to read it for the server in this
  process. Nothing else about the first document is guaranteed. In dev the client's tree module accepts its own hot
  update, so this is the only reload. How `main` (and this PR before the reload) compares depends on where the app
  has Start. In an app that installed it, nothing accepted the tree's hot update and Rsbuild's client reloaded the tab
  at the client's compile, whatever the server served then, with an `HMR update failed` line in the console; in a
  monorepo that links Start, React Refresh instruments Start's client, which accepted the update, and the tab stayed
  on the old route set. `main` does not prune the client's tree; this PR does. Four situations
  (`start-plugin-core/tests/integration/rsbuild/route-set-reload*.test.ts` hold the first and the options):
  1. The reload comes with the evidence above: the tab follows the route set, once, without the console line, in
     both layouts.
  2. No reload from Start: the app's `dev.liveReload: false` (nobody reloads, on any side); RSC with `dev.hmr: false`
     (no socket client, as `main`); a server emit another plugin vetoes (until a compilation emits); a fatal failure
     (the bundler stops watching; a restart may be needed); a third environment still compiling (until it ends); a
     server compilation with errors. In the last three, an installed `main` would reload at once into what the
     server has (read, not run). With the client's `dev.hmr: false` and live reload on (no RSC), Rsbuild's client
     reloads the tab at every client compile, as on `main`, and Start sends nothing: that reload does not wait for the
     server. With RSC and live reload on, `main` reloads nothing (Start turns Rsbuild's live reload off). One
     transition is behind `main` where Start does not reload: a route that was server-only when the tab loaded and
     then became a page; `main`'s tab reaches it by its own navigation (its client tree lists every route), this PR's
     shows the not-found page until reloaded.
  3. A reload without a second reading of a file: a route file another loader reads first, a Vue route piece (Start's
     raw loader never sees it), a module restored from the persistent cache, at its first edit in the process. The
     reload does not wait for the server's build of that file, so the document can be the old one for that route while
     the client already has the new tree; an installed `main` never waits for any file.
  4. A module that is neither the tree nor a route file, saved in the same moment: the reloaded document can carry
     its older value, and the tab is not reloaded again for a server-only module.
- **Router plugin on Vite dev: an open tab can miss a route tree change** (hotspot 2 T; user, 11-22: decision A).
  An open tab can stay on the previous route set when two changes of the route tree are written less than 50 ms
  apart and the tab, reloading for the first, has already fetched the tree when the second is written: Vite's watcher
  reports no second event inside its 50 ms window. With a route file deleted and created again, that is a
  re-creation close to 150 ms after the delete (Vite's watcher holds a delete 100 ms; measured: behind at 140 and
  150 ms, right at 120 and 170): earlier, the tab's own reload picks up the second tree; later, Vite reports both. A
  fresh load is always right: the dev server's tree modules are invalidated when the generator publishes
  (`vite-dev-publication.test.ts`). Start is not affected (it reloads on a client route set change). A fix announces
  every tree write itself, which doubles the client's `full-reload` payloads on every route change. No test (the
  outcome is the limit).
- **Start on Vite dev: a route file renamed twice within tens of milliseconds can leave the open tab blank**
  (hotspot 2, design-routeset-v5.2.md §7; follow-up D4). When a route file is renamed (or deleted) and renamed back
  (or re-created) about 30 ms later, the tab's reload for the first change can be rendering on the server at the
  moment the second lands: the route tree being evaluated imports a file that no longer exists, the document is a
  500, and a 500 page has no dev client to receive the next reload. The tab stays blank until it is reloaded by
  hand; the dev server is right, and a fresh load shows the app. Seen in apps that install Start (5 of 6 runs at a
  30 ms gap; none at 15, 45 or 60 ms) and not in the monorepo's linked layout at that gap. `main` has the same
  window at another gap (45 ms: 4 of 4 runs), where it leaves the server on the old route set. Needs two changes of
  one route file inside one page reload: a tool that renames in two steps, not a person. No test (the outcome is the
  limit).
- **Start dev: a save right after a route-set reload can log one hydration mismatch** (hotspot 2; seen on CI in
  `react-start-rsc/tests/integration/rsc-start-hmr-rsbuild.test.ts`, 570daaa791). When another file is saved within
  about a tenth of a second of the reload Start sends for a route-set change, the reloading document can be rendered
  on the server before it rebuilt the saved file while the client it loads has the edit already: React logs one
  hydration mismatch (the server rendered the previous version), rebuilds the page on the client and recovers. Rare
  when a person saves. No test (the outcome is the limit).
- **Vite dev: a load of a file that began before the generator replaced it keeps the old text** (hotspot 2 L2; user,
  11-22: decision A). Vite registers a module after its `load` returns: a request that read the route tree (or a
  route file the generator rewrote) before the generator wrote it creates the module afterwards from the old text,
  which the invalidation at publication cannot see. Vite's own event for the file repairs it, unless its watcher
  drops the event (a second change within 50 ms). Also a second spelling of a replaced file's path (a second alias
  under `resolve.preserveSymlinks`), whether or not its module was loaded (F13). As `main`, which also keeps the old
  text for modules already loaded. No test (the outcome is the limit).
- **`vite build --watch`: a new route file edited during the build that first imports it waits for the next save**
  (hotspot 2 N2; user, 11-22: decision A). A file first imported by a build and saved while that build runs is not
  rebuilt until the next save; the mechanism reproduces on plain Vite with no router plugin (Rolldown's watcher,
  related to rolldown#10935). `main` passes the gate's row; why was not traced. No test (upstream).
- **A compilation that took a route tree importing a route file deleted during an event storm can fail once**
  (hotspot 2 D2; user, 11-22: decision A). A git checkout, a rename chain or a delete right after a create: a
  compilation (or a watch build) that read the tree before the delete's generation reports the deleted file as not
  found; the delete's own generation writes the tree without it and a clean compilation follows, and an open tab
  recovers by reload, as on Vite. No error is filtered. No test (the outcome is the limit).
- **Vite dev: two saves of one route file within 50 ms reach the generator as one** (hotspot 2 D5; user, 11-22:
  decision A). On Vite dev the generator reads route files on Vite's watcher's events, and Vite's bundled chokidar
  (3.x) drops a second `change` of a file within 50 ms (chokidar 6, the generator's own watcher on the other hosts,
  replays it). A page turned into a server handler and back within that window (`page-server-page-fast`) keeps the
  route set of the first save until the next event. No Vite issue (known upstream). No test (the outcome is the
  limit).
- **Start + Vite `build --watch`: a client watcher closed before the builder delegate hands it to Start leaves
  `buildApp` pending** (hotspot 2 F12, review A of design-routeset-v5). A program whose own delegate of
  `builder.build` closes the client's watcher before returning it: Start waits for the end of a first build that
  never comes. Rolldown's watcher keeps no state Start could ask (a `close` listener attached after the close hears
  nothing) and calls no `closeWatcher` plugin hook for a watcher closed before its first build started (Rolldown
  1.2.19, checked). A watcher closed after Start has it ends `buildApp` (`start-build-watch-close.test.ts`). `main`
  settles. Rollup behaves the same (no closed state, no `closeWatcher` before the first build), so no upstream fix
  is expected. No test (the outcome is the limit).
- **A split id of a former route file outside the routes directory is served as the file itself** (two-instance
  review, 11-23). An app may run one router plugin instance per route tree (TanStack/router#7174), so an instance
  compiles a `?tsr-split=` id only for a file it owns: a route of its registry, or a file under its
  `routesDirectory`, whose former routes get an empty module (SPEC J2.13). A file that was a route through
  `virtualRouteConfig` or a `physical()` mount outside `routesDirectory`, and is no route any more, is no
  instance's: a request of its old split id (a stale lazy import of a page that kept the old tree) gets the file's
  own source instead of the empty module. Both lack the split export, so the component is `undefined` either way;
  the file's top level runs once more. The same rule, read, not run: two instances whose routes directories nest
  (one tree's directory inside the other's, ignored there by `routeFileIgnorePattern`) both claim the inner tree's
  split ids, and the outer one's empty module replaces the inner one's chunk. No test (the outcome is the limit;
  `vite-two-router-plugins.test.ts`: "one instance: a split id of a file of its routes directory that is no route
  serves an empty module" covers the owned case).

- **Dev: a warning is printed once per run, so one that returns after its fix is undone stays hidden** (diagnostics
  spike, 11-24). A compile warning is printed the first time it is reported in a dev session (Vite) or a build run
  (Rsbuild replays a warm build's warnings); `start-package` once per package. Fixing the code and then undoing the
  fix in the same session prints nothing until a restart or a build. Why: printing on every compile still needs most
  of that state (once per package, Rsbuild's cross-compilation check and warm replay, one owner per split output) and
  reprints deliberate warnings (`exported-not-split`) on every save; forgetting a file's entry when its compile no
  longer reports it needs state per environment and output. No test (the outcome is the limit).
- **Vite dev: a warning in a pre-bundled workspace package names the optimizer's file** (diagnostics spike, 11-24).
  Author advice kept for a linked workspace package listed in `optimizeDeps.include` prints
  `node_modules/.vite/deps/<dep>.js` with the original source's line and column; the code frame shows the token.
  Pre-bundles another plugin edited before Start's transform, or rewritten on disk after the optimizer wrote its
  map, are not attributed to a package (no package is told to change its manifest), or attributed by a stale map.
- **Mock mode: `require()` of a denied CommonJS file gives the mock module's namespace, not a callable mock** (user
  decision, 2026-11-27, option A: a stated limit; SPEC J6.8). The mock is an ESM module, and the bundler's interop
  turns `require()` of it into its namespace, `{ default: <mock> }`: the names the importer reads
  (`const { a } = require(…)`, `require(…).a`, a member of the binding) are safe mocks, but the result used as the
  module's whole value (`const f = require('./x.server.cjs'); f()`, `require(…)()`, a `module.exports = () => …`
  target) is that namespace (Vite build `[object Object]`, Rsbuild build and dev `[object Module]`), and calling it
  throws a `TypeError` in the client. The secret never reaches the client. `main`: its Vite build fails
  (`[PARSE_ERROR] Cannot use export statement outside a module` at the `.cjs` file, the entry below "Denied non-JS/TS
  files … keep their content or fail the build"); Rsbuild build and dev give the same namespace and the same
  `TypeError`. Vite dev cannot reach it on either side (`require` is undefined in the browser). Source: research
  `/home/flo/compiler-rewrite-notes/cjs-mock-callable-main-vs-pr.md` (repro app and per-host results). No pin (the
  outcome is the limit); `ip/dev-outcomes.test.ts` "denied CommonJS files read through require()" covers the names
  read. Workaround: `require(…).default`, or an `import`.

## Fixed, kept as regression tests

### Shared causes (several jobs)

**S1. JSX pragmas are not kept effective.** Code the compilers insert lands above a file's leading pragma (Oxc reads
leading pragmas only); a non-leading pragma becomes leading in a chunk. SPEC J2.16, G12. Fix: every emitted module
compiles its JSX under the runtime the untouched file has. (Dead-code elimination does not count JSX as a use of a
classic factory, on `main` and here: the classic runtime is not supported with splitting.):

- `router-plugin/tests/code-splitter-pragmas.test.ts`: "keeps a @jsxImportSource written after the imports as
  ineffective as in the untouched file (leading-pragma project)"; "keeps the pragma in effect in every module that
  contains JSX".
- `router-plugin/tests/integration/code-splitter-pragmas.test.ts`: "means in the split route what it means in the
  untouched route (Vite: Oxc ignores it)".
- `start-plugin-core/tests/start-compiler-jsx-pragma.test.ts`: "inserted server function imports stay below the
  @jsxImportSource pragma: %s"; "client: the parent keeps selecting the pragma JSX runtime when the import it sits on
  $name".
- `start-plugin-core/tests/integration/pages/hydrate-module-level.test.ts`: "server: a module with a
  classic JSX pragma renders through its factory".

- `router-plugin/tests/code-splitter-pragmas.test.ts`: "keeps a @jsxImportSource written after the imports as
  ineffective as in the untouched file (leading-pragma project)"; "keeps the pragma in effect in every module that
  contains JSX"; "in the route module, when the code calling the factory is split".
- `router-plugin/tests/integration/code-splitter-pragmas.test.ts`: "means in the split route what it means in the
  untouched route (Vite: Oxc ignores it)".
- `router-plugin/tests/integration/pages/known-bugs-code-splitter-bindings.test.ts`: "a split component renders
  through the factory of a classic JSX pragma"; "a split component renders through $name"; "a factory the route
  module creates and the loader reads is created once for the split component ($name)".
- `router-plugin/tests/integration/pages/known-bugs-code-splitter-shapes.test.ts`: "a module without JSX does not
  import the classic factory ($name)".
- `start-plugin-core/tests/start-compiler-jsx-pragma.test.ts`: "inserted server function imports stay below the
  @jsxImportSource pragma: %s"; "client: the parent keeps selecting the pragma JSX runtime when the import it sits on
  $name".
- `start-plugin-core/tests/start-compiler-cases.test.ts`: "client: the factory of a classic JSX pragma stays
  imported"; "ssr: a module with a classic JSX runtime pragma keeps its React import".
- `start-plugin-core/tests/integration/pages/hydrate-module-level.test.ts`: "client: a module with a
  classic JSX pragma renders through its factory".

**S2. Dead-code elimination keeps what only types or non-reads mention, and never removes some declaration kinds.** The
Babel-based compilers' babel-dead-code-elimination counted `typeof x` type queries, TypeScript-only positions (enum
members, overload and constructor parameters) and a local of a function's own name as reads, and never removed classes,
enums, namespaces, overloaded functions or redeclared `var`s. Server-only imports then stay on the client (and
client-only imports on the server). SPEC J4.12, J4.11, J2.5, G16. Fix: code only server code (or only types) reads is
gone from the client, with its imports, and code only client-only code reads is gone from the server.:

- `start-plugin-core/tests/start-compiler-cases.test.ts`: "client: $name does not load its server-only import";
  "client: a server-only import last mentioned by a type alias is not loaded with verbatimModuleSyntax"; "client: a
  validator schema that a type alias reads with typeof is not loaded"; "ssr: a declaration a client-only fn reads and
  a type alias reads with typeof is not loaded"; "ssr: a class only a client-only fn uses does not load its
  client-only import".
- `start-plugin-core/tests/integration/start-build-server-fn-cases.test.ts`: "client: the server-only module of a class
  only server code uses is not bundled"; "client: a server-only module a type mentions is not bundled with
  verbatimModuleSyntax".
- `start-plugin-core/tests/integration/start-build-user-code.test.ts`: "the decorated class only a server fn handler
  uses is not in the client bundle".
- `start-plugin-core/tests/createServerFn/caller-dead-code.test.ts`: "when client code uses its name in $name";
  "callers drop a handler-only function that declares a local of its own name".

**S3. The printer drops required parentheses** (`@babel/generator` in the Babel-based compilers): `count as number++`,
`a as any ? -x : y`, `<Tag />.props` do not parse. SPEC G12. Fix: printed code parses and means the same.:

- `router-plugin/tests/integration/pages/known-bugs-code-splitter-bindings.test.ts`: "an asserted update operand keeps
  its parentheses in a split component"; "an asserted conditional test keeps its parentheses in a split component";
  "a JSX element read as an object keeps its parentheses in the route module".
- `start-plugin-core/tests/start-compiler-preserves-user-code.test.ts`: "keeps the parentheses of asserted update
  operands"; "keeps the parentheses of an asserted conditional test".

**S4. Source maps are lost on webpack and Rspack.** unplugin's webpack and Rspack transform loaders (the former
integration layer) drop the map a plugin returns when no earlier loader passed one in. SPEC G6. Fix: a throw in a
split chunk maps to the route file's line (and column).:

- `router-plugin/tests/integration/build-source-maps.test.ts`: "a throw in a split component maps to its line in the
  route file ($name)"; "a throw in $name maps to its line and column in the route file".
- `router-plugin/tests/integration/dev-source-maps.test.ts`: "the route module and every module derived from it map a
  throw to its line in the route file".
- `start-plugin-core/tests/integration/start-build-source-maps.test.ts`: "rsbuild build: client: a throw in a split
  route component maps to its line in the route file ($name)".

**S5. A type-only import re-exported as `export { Settings }` loses its import** (valid TypeScript without
`verbatimModuleSyntax`), so the TypeScript transform can no longer erase the export. SPEC G1, §2.1. Fix: the module
still compiles and the type export is erased.:

- `router-plugin/tests/integration/pages/known-bugs-code-splitter-bindings.test.ts`: "a type-only import re-exported
  as `export { Settings }` is erased (%s)".
- `start-plugin-core/tests/start-compiler-cases.test.ts`: "client and SSR: a type-only import re-exported as
  `export { Settings }` is erased (%s)".

**S6. Generated names collide with user bindings.** SPEC G15, §5.1. Fix: no generated name shadows or redeclares a
user binding.:

- `router-plugin/tests/integration/pages/known-bugs-code-splitter-shapes.test.ts`: "a route file binding named $name
  keeps its value"; "route file bindings named like what the compiled modules introduce keep their values"
  (adaptive).
- `router-plugin/tests/known-bugs-route-hmr.test.ts`: "a user binding named hot ($name) does not collide with the
  injected HMR code".
- `router-plugin/tests/known-bugs-route-hmr-bindings.test.ts`: "a route file importing a binding named Map renders
  with route HMR".
- `start-plugin-core/tests/start-compiler-cases.test.ts`: "a user binding named %s does not collide with
  generated code"; "a server fn named opts runs on the server"; "no name the compiler introduces collides with a user
  binding or a server fn of that name" (adaptive).
- `start-plugin-core/tests/integration/pages/hydrate-module-level.test.ts`: "client: module-level $name,
  named like the generated bindings, do not collide".

**S7. Dead-code elimination removes the const half of a class and const cycle.** When only removed code used a class
whose static field reads a const that points back to the class (`const registry = { make: () => new Repo() }; class
Repo { static registry = registry }`), babel-dead-code-elimination (Babel-based compilers) takes the pair for one
removable cycle and deletes the const, but it never removes a class (S2), so the class stays and its static field
reads a deleted name. SPEC G16, G1. Fix: both halves go together, or both stay; the module loads. 2 pins, one cell per
removal:

- `start-plugin-core/tests/start-compiler-dead-code-shapes.test.ts`: "takes with it what only it uses through a class
  and a const that read each other" (server fn handler, `createServerOnlyFn`, isomorphic `.server()` on the client;
  `createClientOnlyFn`, isomorphic `.client()` on the server: `ReferenceError` when the module loads there).
- `router-plugin/tests/integration/pages/code-splitter-dead-code-shapes.test.ts`: the same name (a split component and
  a `deleteNodes` server handler: the route module throws when it loads).

### J1 Route file upkeep

- **Vite dev serves an older route tree when Vite's watcher drops or holds the tree's own event** (a second change
  within 50 ms, another plugin's `hotUpdate`, a tree behind a linked directory). SPEC J1.10.
  `router-plugin/tests/vite-dev-publication.test.ts`. Fix: invalidate the modules of the files a generator run
  replaced when it is published.
- **A `(group).tsx` route file is reported relative to the routes directory** (neither absolute nor project-relative).
  SPEC §2.2, §5.7. `router-generator/tests/deny-route-group-config.test.ts`: "a (group).tsx route file is reported by
  name or routes correctly: $name". Fix: name the file unambiguously, or route it.
- **A running generator loses child routes when their layout file is deleted.** SPEC J1.10, J1.4.
  `router-generator/tests/generator-dev.test.ts`: "deleting a layout route keeps its child routes in the route tree".
  Fix: a watch run gives the tree a fresh run gives.
- **A deleted route tree is never written again** (the next run fails with ENOENT). SPEC J1.10.
  `router-generator/tests/generator-dev.test.ts`: "a deleted route tree is written again on its delete event"; "after
  the route tree is deleted, adding a route writes the route tree". Fix: regenerate the tree.
- **Edits of the `virtualRouteConfig` file and of `__virtual.ts` files are ignored** (the event's absolute path is
  compared with the configured relative path; the config comes from jiti's cache; Rsbuild never sees the file).
  SPEC J1.10. `router-generator/tests/generator-dev.test.ts`: "editing the virtualRouteConfig file updates the route
  tree"; `router-plugin/tests/integration/dev-server-generator-watching.test.ts` and
  `router-plugin/tests/integration/rsbuild-dev-server-generator-watching.test.ts`: "an edit of the virtual route config
  file changes the live routes"; "an edit of a \_\_virtual.ts file changes the live routes". Fix: reload the config and
  regenerate on each such edit.
- **An event that arrives while a run checks no-op events is dropped.** SPEC J1.10.
  `router-generator/tests/generator-dev.test.ts`: "a route created while an update event that changed nothing is
  checked joins the route tree". Fix: no delivered event is lost.
- **An empty `.ts` route file is scaffolded with JSX, then parsed as TypeScript** and the run fails. SPEC J1.3.
  `router-generator/tests/generator-options.test.ts`: "an empty %s route file is scaffolded, and the other routes still generate". Fix: a valid scaffold, and the other routes generate.
- **`importRoutesUsingAbsolutePaths` is not applied to lazy route imports.** SPEC J1.4.
  `router-generator/tests/generator-options.test.ts`: "importRoutesUsingAbsolutePaths imports the lazy route files by
  absolute paths too".
- **`tmpDir` on another filesystem fails every write with EXDEV.** SPEC J1.16.
  `router-generator/tests/generator-options.test.ts`: "with tmpDir on another filesystem, the route file and the route
  tree are replaced atomically" (skipped without a writable `/dev/shm`). Fix: rename a temp file written beside the
  destination.
- **A layout in a route-group directory is typed `fullPath: ''`**, while the router gives it `/`. SPEC J1.13.
  `router-generator/tests/integration/fixture-types-physical.test.ts`: "the "%s" route tree types its routes like the
  router"; `router-generator/tests/integration/route-types.test.ts`: "the layout route of a route group directory has
  the full path of the router in the types".
- **The generator recognises `createFileRoute` by name, not by binding.** An aliased import is missed; an app's own
  `createFileRoute` is rebound to the router package. SPEC G15, J1.1. `router-generator/tests/known-bugs.test.ts`: "a
  moved route with an aliased import of the constructor gets the id of its new path"; "a moved route importing
  createFileRoute from a module of the app stays a valid module"; `router-generator/tests/route-file-upkeep.test.ts`:
  "a createFileRoute $name keeps its meaning: the file is left as it is, or reported". Fix: follow the import.
- **A pathless layout present only as a lazy file or a Vue piece loses its directory path.** SPEC J1.8.
  `router-generator/tests/real-router.test.ts`: "a pathless layout with only a lazy route file keeps its directory
  path"; `router-generator/tests/route-paths.test.ts`: "a pathless layout with only $name under a path keeps the path
  in the URLs of its children".
- **A childless pathless layout gives "Conflicting configuration paths".** SPEC J1.15.
  `router-generator/tests/route-paths.test.ts`: "a pathless layout without child routes yet ($name) next to the index
  route is added to the route tree".
- **A pathless layout under a lazy-only route attaches to the next real ancestor.** SPEC J1.14.
  `router-generator/tests/route-paths.test.ts`: "a pathless layout in a directory under a route with only a lazy
  route file nests under that route".
- **File paths and ids are written into quoted strings unescaped** (an apostrophe breaks the tree). SPEC J1.6.
  `router-generator/tests/route-paths.test.ts`: "a route file name with an apostrophe gets a route with it in its
  URL".
- **Routes whose paths differ only in non-identifier characters or case get the same variable.** SPEC J1.6.
  `router-generator/tests/route-paths.test.ts`: "routes $ids get their own routes".
- **A piece next to a directory route (`posts/route.component.vue`) makes its own route `/posts/route`.** SPEC J1.4.
  `router-generator/tests/route-pieces.test.ts`: "a component piece of a directory route (route.component.vue) is the
  component of the route".
- **`.lazy.vue` is wired as a lazy route, and an empty one is scaffolded with TypeScript.** SPEC J1.17, J1.3.
  `router-generator/tests/route-pieces.test.ts`: "a .lazy.vue route file is the lazily loaded component of the
  route"; "an empty .lazy.vue route file is not filled with TypeScript route code".
- **With pieces on the root route only, the tree calls `lazyRouteComponent` without importing it.** SPEC G1, J1.4.
  `router-generator/tests/route-pieces.test.ts`: "pieces of the root route only are lazy components of their default
  export".
- **Rsbuild: a route file created under a `physical()` mount outside the routes directory is never seen.** SPEC
  J1.10. `router-plugin/tests/integration/rsbuild-dev-server-generator.test.ts`: "a route file created, edited and
  deleted under a physical() mount outside the routes directory reaches the live routes".
- **Rsbuild: a route file the generator cannot parse is left out of the bundle, so its fix is never seen.** SPEC
  J1.10, G5. `router-plugin/tests/integration/rsbuild-dev-server-new-routes.test.ts`: "a created route file the
  generator $name is reported, and fixing it adds the route".

### J2 Route code splitting

Route splitting does what main does since R153 (SPEC J2.0): where a fix below was a rule main does not have (an export
extracted, a statement moved with its bindings, a value refused and warned at), the entry was removed with its tests;
those that remain are main's bugs our output does not have.

Router-plugin paths below are under `router-plugin/tests/`; `pages/` means `integration/pages/`.

- **Under `verbatimModuleSyntax`, a split chunk keeps an unused `import { Route }` of its route module** (coverage
  review E, finding 2; spec-coverage-fix-batch section 3): `main`'s splitter leaves the import for the TypeScript
  transform to drop, and `verbatimModuleSyntax: true` keeps it, so a chunk that never uses `Route` statically imports
  the route module (openstory: 30 chunks). Rolldown partitions that graph differently: openstory's PR build is
  +1,595 B eager / +4,206 B total against `main`, and 146 B smaller in total with `main`'s 30 chunk texts replayed.
  Without the setting both builds have the same edges and the PR is 138 B smaller. No test: the outcome is
  Rolldown's partition.
- **Imported route options are not read** (only an object literal of the route file is): nothing is split or
  deleted, silently. SPEC J2.8, J2.14. `code-splitter-imported-options.test.ts`: "are split, or reported once naming
  the route file"; "lose the options of deleteNodes and what only they import, or are reported once naming the route
  file". (Start's client build: J2.14 section.)
- **A JSX tag starting with `_`, `$` or a non-ASCII lowercase letter is taken for an intrinsic element.** SPEC J2.4.
  `code-splitter-jsx.test.ts`: "gives separate loader and component chunks the one JSX component %s".
- **The esbuild adapter never runs the generator in a build**, so nothing is split and nothing refuses. SPEC J2.18.
  `integration/build-harness.test.ts`: "router plugin with esbuild loads a split component lazily and renders it, or
  refuses the build (%s)".
- **Default-exported declarations shared by options are duplicated** ("Duplicate declaration"). SPEC J2.4.
  `integration/code-splitter-runtime.test.ts`: "preserves executable route contracts with shared named-default
  declarations"; `pages/known-bugs-code-splitter-bindings.test.ts`: "a split option renders the default-exported
  component other modules import"; "a default-exported function the loader and the split component call works on one
  state".
- **Split chunks keep exports of the route file their option does not use.** SPEC J2.5.
  `integration/known-bugs-code-splitter-page-code.test.ts`: "$name loads with its chunk"; "${unreadExport.name} is not in
  its chunk"; `pages/known-bugs-code-splitter-shapes.test.ts`: "a
  split chunk holds only what its option needs, not the other exports of the route file"; "split chunks do not
  re-export or declare the re-exports and default class of the route file". Fix: a chunk carries only what its group
  needs.
- **A split component reading `Route` declared with `const` and exported later (`export { Route }`) recreates the
  route.** SPEC J2.4. `pages/known-bugs-code-splitter-bindings.test.ts`: "a split component reads the route the route
  module exports through export { Route }".
- **A component declared by a destructuring is not split, or the build throws.** SPEC J2.8, J2.9. A name of an object
  pattern is split; a name of an array pattern stays in the route module, working (a value main cannot compile into a
  chunk, R153). `code-splitter-main-shapes.test.ts`: "splits a name of a destructuring and renders it"; "renders a name of
  an array pattern"; `pages/known-bugs-code-splitter-shapes.test.ts`: "a component declared by an array destructuring of
  a call shared with the errorComponent renders".
- **The split compiler accepts a fixed list of value shapes** ("Unexpected splitNode type": object-form loaders,
  classes, `satisfies`, member/logical/tagged-template/class expressions; a call is printed and re-parsed without JSX
  or TypeScript). SPEC J2.8, J2.9. The values main's chunk compile cannot take stay in the route module and work
  (R153, `unsplittableOnMain`). `code-splitter-main-shapes.test.ts`: "renders $name";
  `pages/known-bugs-code-splitter-shapes.test.ts`: "an option written as $name is split and works" (the shapes main
  splits). An object-form loader splits its `handler` and keeps the object (#8753, R171):
  `code-splitter-route-options.test.ts`: "a loader in object form";
  `integration/code-splitter-object-loader.test.ts`; `integration/route-hmr-browser-object-loader.test.ts`.
- **A split binding's declaration or import is deleted from the route module although other code still reads it.**
  SPEC J2.12. `pages/known-bugs-code-splitter-server.test.ts`: "a split component that $name reads renders from both";
  "a split component renders through a function $name"; "a component read by a split and an unsplit option renders
  from both"; "an unsplit option that reads the split component with typeof sees a function"; "a split component that
  a top-level call reads renders from both"; "an imported split component that head() reads renders, and head() reads
  it"; "an imported split errorComponent that an exported component renders works for an importer"; "an imported
  pendingComponent split by custom groupings renders, and an unsplit option renders it";
  `integration/known-bugs-code-splitter-ssr-builds.test.ts`: "an imported split component that head() reads renders,
  and head() reads it (%s build)"; `integration/known-bugs-code-splitter-client-builds.test.ts`: "a split component that
  an unused object names renders (%s)"; `pages/known-bugs-code-splitter-bindings.test.ts`: "a split component renders
  the exported component of another option that reads Route ($name)".
  #8914 (an imported component, named or default, read by a split and an unsplit option):
  `pages/known-bugs-code-splitter-server.test.ts`: "an imported component read by a split and an unsplit option
  renders from both ($form)"; `integration/known-bugs-code-splitter-ssr-builds.test.ts`: "an imported component read
  by a split and an unsplit option renders from both (%s build)".
- **Export lists and aliases of a moved declaration are left without it** ("Export 'load' is not defined"). SPEC
  J2.12, J3.3. `pages/known-bugs-code-splitter-bindings.test.ts`: "a split loader exported through an export list keeps
  working"; `known-bugs-dev-server.test.ts`: "keep a $name component exported as the route option value";
  `integration/route-hmr-browser-names.test.ts`: "declared lowercase as $name: an edit shows in place without mounting
  it again (autoCodeSplitting: $autoCodeSplitting)" (an arrow function exported by an export list);
  `known-bugs-route-hmr.test.ts`: "a component exported by an export list renders for a module importing it and as the
  route component" (the last two count under J3).
- **The user's own `import './Page'` is removed with the split component's import.** SPEC G3, J2.12.
  `pages/known-bugs-code-splitter-server.test.ts`: "a side-effect import of the split component's module runs when the
  route module loads".
- **`deleteNodes` removes only options written as `key: value`**: methods, literal computed keys and options in a cast
  or `satisfies` keep their server code on the client. SPEC J2.14, J4.12. (A spread and options from a call stay and
  warn, J2.8: "a server-only option given through $name stays, and the user is told so (J2.8)".)
  `pages/known-bugs-code-splitter-server.test.ts`: "a server-only option written as a method is removed with its
  imports (%s)"; "a server-only option given through $name is removed, or the route is refused"; "a server-only option
  of options wrapped in `%s` is removed with its imports"; `integration/known-bugs-code-splitter-client-output.test.ts`:
  "a client build has no server code of an `ssr()` method (vite)"; "a client build has no server code of options
  wrapped in `%s` (vite)". (Start: J2.14 section.)
- **A local function named `createFileRoute` is treated as the router's.** SPEC G15.
  `pages/known-bugs-code-splitter-server.test.ts`: "a local factory shadowing createFileRoute in a route file keeps
  its own semantics".
- **Only `createFileRoute(` by that name and without a type argument is recognised**; nothing is reported. SPEC J2.1,
  J2.8. `pages/known-bugs-code-splitter-shapes.test.ts`: "a component is split when createFileRoute is imported under
  an alias"; "a component is split when createFileRoute has a type argument".
- **Route options returned by a call are neither split nor reported.** SPEC J2.8.
  `pages/known-bugs-code-splitter-shapes.test.ts`: "route options returned by a call are split or reported".
- **Options inside a route factory are split as if module-level** (closures over parameters break). SPEC J2.10.
  `pages/code-splitter-plugin-pipeline-routes.test.ts`: "a route built from $name renders what the factory was given,
  split or reported".
- **Two file routes in one module share chunk names**, so one renders the other's component. SPEC J2.11.
  `pages/known-bugs-code-splitter-shapes.test.ts`: "each of two file routes of one module renders its own component,
  or the module is reported".
- **A symlinked route file is never compiled** (looked up by the scanned path, resolved by its real path). SPEC J2.1,
  J4.12, G11. `integration/known-bugs-code-splitter-client-output.test.ts`: "a client build of a symlinked route file
  has no server handler code (%s)".
- **Dev-only code follows the process `NODE_ENV`, not the bundler's mode.** SPEC G7, J3.7.
  `integration/known-bugs-code-splitter-client-output.test.ts`: "a production client bundle logs no development
  warning in the page when NODE_ENV is unset (%s)"; `integration/build-production.test.ts` and
  `integration/build-production-webpack-unsplit.test.ts`: "a production %s client bundle without code splitting has no
  dev-only code" (these two count under J3).
- **Chunk ids paste the absolute file path into a URL and a quoted string** (`#`, `'` and the split marker text in a
  directory name break builds). SPEC G1, G11. `integration/code-splitter-project-path.test.ts`: "an app under a
  directory with $name is code-split and renders ($bundler)" (`#`, `'`);
  `integration/known-bugs-code-splitter-ssr-builds.test.ts`: "an app in a directory whose name contains what split
  module ids contain builds and preloads a split component".
- **A `let` reassigned in another module becomes a read-only import.** SPEC J2.4, G1.
  `integration/known-bugs-code-splitter-ssr-builds.test.ts`: "a let $name stays writable and the split component reads
  its value".
- **Shared bindings are computed by the route-module transform and stored per file**; chunks served first read stale
  state. SPEC G4, J2.13. `integration/known-bugs-dev-server.test.ts`: "a page loading the modules of the route file
  before the route module renders the edited route after $name".
- **Ambient declarations (`declare const`, a var merged with an interface, a global) are treated as module bindings.**
  SPEC G1, J2.12. `pages/code-splitter-imports-exports.test.ts`: "reads an ambient var merged with an interface from
  the environment in a shared declaration, with verbatimModuleSyntax"; `pages/known-bugs-code-splitter.test.ts`: "an
  ambient declare const read by the loader and the split component stays a global";
  `pages/known-bugs-code-splitter-bindings.test.ts`: "a component read from $name renders".
- **The shared-binding analysis misses readers** (nested `var`s, enums, namespaces, another name of a destructuring,
  a JSX member tag), so state is created twice. SPEC J2.4, G3. `pages/known-bugs-code-splitter.test.ts`: "a binding
  declared by $name and read by the loader and the split component is initialized once"; "module state that the
  reference module keeps for $name is initialized once".
- **Chunks keep unreferenced top-level statements** (side effects run twice; `export *` repeated). SPEC G3, J2.5.
  `pages/known-bugs-code-splitter.test.ts`: "an unreferenced top-level side effect ($name) runs once, with the route
  module"; "split chunks do not re-export a module-level export \*, which importers of the route file still get".
- **A declaration only an exported type alias reads loses its initializer.** SPEC G3.
  `pages/known-bugs-code-splitter.test.ts`: "the initializer of a declaration only an exported type alias reads runs
  when a route module compiled for HMR loads".
- **Code only the split component needs stays when something looks like a read** (a type of the same name, an
  overload signature, a second `var`, an unused renderer). SPEC J2.5. `pages/known-bugs-code-splitter.test.ts`: "a split
  component and its imports leave the route module next to $name".
- **`codeSplitGroupings` in a module-level constant is refused.** SPEC J2.2.
  `pages/known-bugs-code-splitter-bindings.test.ts`: "groupings declared in a module-level constant are honoured".
- **The not-split warning is printed only when the splitter changed the module.** SPEC J2.8.
  `pages/known-bugs-code-splitter-bindings.test.ts`: "an exported component ($name) that is the only split candidate is
  split or reported as not code-split".
- **Parameter decorators do not parse.** SPEC §2.1, G1. `pages/known-bugs-code-splitter-bindings.test.ts`: "a class
  with a parameter decorator that the split component uses compiles into parseable modules". A decorator on a
  parameter, as on the class or a member, runs when the class is defined; the class stays in the route module (R163),
  so it runs at load, in source order: `router-plugin/tests/code-splitter-effect-timing.test.ts`: "runs its decorator
  when the route module loads, before the effects written after it".
- **A namespace is copied into a chunk without its body.** SPEC G1. `pages/known-bugs-code-splitter-bindings.test.ts`:
  "a namespace the split component reads keeps its body".
- **Vite dev: the maps of the split and shared modules name the route file with the splitter's query**
  (`index.tsx?tsr-split=component`), so a debugger sees another file than the route file. SPEC G6.
  `integration/dev-source-maps.test.ts`: "a throw in $name maps to its line in the route file, which its module names
  as its source". Fix: every module derived from the route file names the route file itself as its source.
- **Overload signatures of a shared function stay next to its import**, and the TypeScript transform drops the import.
  SPEC G1, J2.12. `pages/known-bugs-code-splitter-bindings.test.ts`: "an overloaded function the route module and a
  split loader share keeps working"; `known-bugs-dev-server.test.ts`: "keep exported overloads and their aliases that
  unsplit and split options call".

### J2.14/J2.15 Start's router wiring

Paths under `start-plugin-core/tests/integration/`.

- **Rsbuild does not prune server-only routes from the client route tree.** SPEC J2.15.
  `start-build-route-option-keys.test.ts`: "a route with only server handlers is not in the client route tree" (two
  tables); `start-build-manifest.test.ts`: "the client route tree is the SSR route tree without the server-only
  subtree"; `start-compose-server-only-routes.test.ts`: "the client route tree leaves out the server-only subtree";
  "client-side navigation to a server-only route finds nothing".
- **The generator records only plain option keys**, so a route with server handlers and computed, method or spread
  client options is pruned. SPEC J1.9, J2.15. `start-build-route-option-keys.test.ts`: "a route with server handlers and these
  options is in the client route tree"; `start-compose-server-only-routes.test.ts`: "the client route tree keeps the
  page whose component is spread in"; "client-side navigation reaches the page whose component is spread in". Fix:
  never prune because a key was missed.
- **Options in a cast skip `deleteNodes`** (see J2). `start-build-route-option-keys.test.ts`: "the server handler code of
  the route is not in the client bundle".
- **Imported route options keep `server.handlers` on the client** (see J2). `start-compose-imported-options.test.ts`:
  "the client build never ships the server handlers of imported route options silently".
- **The client route tree module is matched by `new RegExp(<path>)`, unescaped.** SPEC J2.15, G11.
  `start-compose-project-path.test.ts`: "the client route tree leaves out the server-only route"; "the client gets the
  file, not the client route tree".
- **A pathless layout whose only route below it is server-only takes `/` from the index route in the client.** SPEC
  J1.15, J2.15. The client router matched the layout where the server rendered the index route (a hydration
  error). `rsbuild/client-route-tree-order.test.ts`: "a built app: `/` is the index route"; "dev: `/` is the index
  route, after the server-only route is deleted and after it is created again" (one level, nested);
  `router-generator/tests/source-digests.test.ts`: "a pathless layout whose children are childless pathless layouts
  does not take `/` from the index route". Fix: order each pruned sibling list as the generator does (`ownersLast`,
  recursive on pathless layouts).
- **Start + Rsbuild dev: the open tab keeps the route set it hydrated with** (a route added, a handler turned into a
  page) in a monorepo that links Start; in an app that installed it, Rsbuild's client reloads the tab at the client's
  compile, before the server is known to serve the change, with an `HMR update failed` line. SPEC J3.10.
  `rsbuild/route-set-reload.test.ts`, `rsbuild/route-set-reload-*.test.ts` (the options, the evidence, other plugins
  and environments, RSC). Fix: reload the tab once both compilers serve the new route set (the accepted limit "what
  the route-set reload guarantees").

### J3 Route HMR

Paths under `router-plugin/tests/` unless given.

- **Inline components that are not plain functions** (`memo`, `forwardRef`, method shorthand, `as`/`satisfies`), and
  components inside a route helper function, **are not registered for React Refresh**, so edits do not show. SPEC J3.2,
  J3.3. `integration/route-hmr-browser-options.test.ts`: "written inline as $name: an edit shows in place
  (autoCodeSplitting: $autoCodeSplitting)", "written as a method: an edit shows in place without mounting it again
  (autoCodeSplitting: %s)"; `integration/route-hmr-browser-plugin.test.ts`: "$shape shows (autoCodeSplitting:
  $autoCodeSplitting)" (helper).
- **Lowercase components break under React HMR** (renamed in a chunk, renamed in the route module after the code
  splitter chose the shared bindings, not registered, or hoisted out of order). SPEC J3.2, J2.4, G1.
  `integration/route-hmr-browser-names.test.ts`: "declared lowercase as $name: an edit shows in place without mounting
  it again (autoCodeSplitting: $autoCodeSplitting)"; `integration/route-hmr-browser-options.test.ts`: "a lowercase
  function component that is also the unsplit pendingComponent renders, and an edit shows in place";
  `integration/known-bugs-route-hmr-removals.test.ts`: "vite: an inline pending
  component hoisted before a renamed lowercase component renders it"; `known-bugs-route-hmr.test.ts`: "a lowercase
  function component split into two chunks renders with the module state they share"; "a lowercase function component
  shared with the loader renders with the module state it shares"; "a lowercase function component that is also the
  unsplit pendingComponent renders as both"; "a destructured binding that the loader, the split component and the
  unsplit pendingComponent share works and is created once"; "a lowercase component created by a call that the loader, the
  split component and the unsplit pendingComponent share is created once".
- **A removed split option's module stays in Vite's graph and is compiled as CommonJS.** SPEC J2.13, J3.3.
  `integration/known-bugs-route-hmr-removals.test.ts`: "vite: an edit that removes a split option the page loaded
  applies in place without errors".
- **Route HMR keeps the previous component for React Refresh to patch**, also without a Refresh runtime and after a
  rename. SPEC J3.3. `integration/known-bugs-route-hmr-removals.test.ts`: "rsbuild without React Refresh: an edit of the
  route component shows in place (autoCodeSplitting: %s)"; `integration/route-hmr-browser-identity-cases.ts`: "a
  rename" (Vite and Rsbuild).
- **Rsbuild: an edit that changes a route file's `Route` from the router's constructor to the app's own helper does
  not show**, as on main (0b6d4f3f6b: the same edit in `e2e/react-router/rspack-basic-file-based` shows only after a
  reload, on main and here): the update applies, the page keeps the previous route, silently, until a reload; the
  edit back to the constructor shows in place in the test's app (in that e2e app it doesn't either, on main and here).
  SPEC J3.3, G10. `integration/route-hmr-browser-plugin.test.ts`: "shows each version, reporting nothing" (Rsbuild,
  `fails`).
- **The HMR code reads the route through the identifier `Route`.** SPEC J3.1.
  `integration/known-bugs-route-hmr-removals.test.ts`: "a route exported under another local name is hot-updated in
  place".
- **Solid and Vue split components get a new lazy component on every update.** SPEC J3.2.
  `integration/route-hmr-browser-frameworks.test.ts`: "shows the new code of an edited route file in place
  (autoCodeSplitting: %s)".
- **Vite: the accept call is on an alias (`const hot = import.meta.hot`)**, so the module is no HMR boundary and the
  page reloads. SPEC J3.1, G10. `integration/route-hmr-browser-frameworks.test.ts`: "shows the new code of an edited
  route file in place (autoCodeSplitting: %s)" (Vue); `integration/route-hmr-browser-plugin.test.ts`: "a React .ts
  route module shows its new loader data in place (autoCodeSplitting: %s)"; "a route component in an app without
  @vitejs/plugin-react shows in place (autoCodeSplitting: %s)".
- **Rsbuild: an unsplit Solid route keeps rendering the old component**, the root route too (always unsplit). SPEC
  J3.3, J3.5. `integration/route-hmr-browser-frameworks.test.ts`: "shows the new code of an edited route file in place
  (autoCodeSplitting: %s)" (Rsbuild, Solid); "shows the new code of an edited root route in place (autoCodeSplitting:
  %s)" (Rsbuild).
- **Rsbuild: an edit of a split loader only never reaches the page** (the route module did not change). SPEC J3.3.
  `integration/route-hmr-browser.test.ts`: "runs the edited loader once (codeSplitGroupings: %s)" (Rsbuild).
- **Solid: the router kept the component it held when the compiler saw the same refresh identity** (a binding's name,
  `<specifier>#<export>` for an import) and solid-refresh's proxy had the same name, though the two proxies came from
  different modules (a layout through a barrel that switches module), which solid-refresh never patches into each
  other: the page showed the old module's component until a reload (this rewrite's own; main not measured). The
  runtime now reads both values: proxies of the same name and file (`location`) are kept, anything else is taken.
  SPEC J3.3. `integration/route-hmr-browser-solid-identity.test.ts` and `-rsbuild.test.ts`: "a layout through a
  barrel that switches module, then the new module edited" (autoCodeSplitting: false).
- **Rsbuild: a Solid split chunk that evaluated again on its own never reached the route's lazy wrapper** (solid-refresh
  makes it accept its own updates; nothing imports it again): a component option whose value changed to another
  component (`const Page = flag ? Wide : Narrow`) showed the old one (this rewrite's own; main not measured). Every
  Solid chunk now hands its exports to the route's lazy wrappers. SPEC J3.3.
  `integration/route-hmr-browser-solid-identity-rsbuild.test.ts`: "a conditional behind a const" (autoCodeSplitting:
  true).
- **Rsbuild: a Solid split chunk imported again answered its first evaluation**: solid-refresh makes the chunk accept
  its own updates, and Rspack's lazy-compilation proxy answers every later `import()` of such a module with its first
  namespace (upstream, see "Upstream issues"). An edit of a loader grouped with a component never showed (main showed
  an inline arrow loader only by accident: solid-refresh wrapped its capitalised `SplitLoader`; a loader function of
  the file or a loader object was stale on main too), and a route module edit after a conditional component switched
  (`const Page = flag ? Wide : Narrow`) brought the old component back (main: stale from the switch). A temporary
  workaround makes the importer of a Solid split chunk answer the chunk's newest evaluation. SPEC J3.3.
  `integration/route-hmr-browser-solid-identity-rsbuild.test.ts`: "a loader sharing the route component chunk", "a
  loader function of the file sharing the route component chunk", "a conditional, then an option the route module keeps", "a grouped loader edited, then an option the route
  module keeps" (autoCodeSplitting: true).
- **Vite, split: a Solid route component mounted twice per save**: once from solid-refresh's patch of the chunk, once
  from the lazy wrapper's swap to the re-imported chunk's new proxy; under `@refresh granular` the component lost the
  state solid-refresh kept (main mounts once). A re-imported chunk's solid-refresh proxy of the same name and file is
  now kept, as for a module solid-refresh patched (R175). SPEC J3.2.
  `integration/route-hmr-browser-solid-identity.test.ts`: "a function declaration", "an inline arrow", "@refresh
  granular, a body edit", "@refresh granular, an edit of the loader and of a component sharing the route component
  chunk" (autoCodeSplitting: true).
- **A split chunk lost the route file's `@refresh` pragma**: solid-refresh never kept a split component's state under
  `@refresh granular` (`@refresh skip` and `reload` were lost the same way). SPEC J2.16.
  `integration/route-hmr-browser-solid-identity-rsbuild.test.ts`: "@refresh granular, an edit of the loader and of a
  component sharing the route component chunk" (autoCodeSplitting: true).
- **With options in a variable, the HMR transform declares the component binding after the object that reads it.**
  SPEC G1. `known-bugs-route-hmr.test.ts`: "route options in a variable ($name) evaluate to a route with a component".
- **Rsbuild and webpack: an edit of a binding the route module keeps and a split chunk imports does not reach the
  chunk** (the shared core's own, not main's): the route module self-accepts and the chunk's text is unchanged, so the
  chunk kept reading the exports of the route module's first evaluation, with no error, until a reload. The route
  module's evaluation now invalidates the modules of its file that read what it keeps (`env-readers` units) and
  refreshes the route once the update is applied. SPEC J3.3.
  `integration/route-hmr-browser-kept-binding.test.ts`: "rsbuild $fw: $row.name";
  `integration/route-hmr-browser-kept-binding-webpack-maps.test.ts`: "webpack with source maps $fw: $row.name"; `start-plugin-core/tests/integration/rsbuild/route-hmr-kept-binding.test.ts`: "$fw:
  $row.name".
- **A route edit reloaded the page after a render error the page had recovered from** (React: the global boundary;
  Solid and Vue: any router boundary): the boundary's catch marked the router for a reload (R70) and nothing cleared
  the mark, so a recovery without a reload (a navigation, the edit that fixes the component) still cost the next
  route edit a full reload. The mark is now set only by the global boundary of a hydrated router, which loses the
  document it renders (route HMR decision 4); a client-only root and every route boundary recover in place when the
  route loads again, except a hydrated Solid root route without `shellComponent`, whose component renders the
  document and whose own boundary therefore replaced it (it marks, as the global boundary does; a Vue root renders
  `<Html>` into the app's container and recovers in place). SPEC J3.1, J3.3, G10. `integration/known-bugs-route-hmr-recovered-error.test.ts`: "react, vite: a
  route edit after a render error the page navigated away from updates in place";
  `integration/route-hmr-browser-throw-then-fix-cases.ts`: "the fix shows in place (autoCodeSplitting:
  $autoCodeSplitting, route error component: $errorComponent)" (Vite and Rsbuild);
  `start-plugin-core/tests/integration/start-dev-route-error-recovery.test.ts`: "%s: with a route error component, an
  edit that makes a component throw, then one that fixes it, shows the fix", "%s: a root route rendering the document
  with its own error component: an edit that fixes a component that threw during hydration shows" (Vite).
- **Two routers on a page: an edit reached the router created last, or the other router's route of the same id**
  (main: the router `window.__TSR_ROUTER__` names): an edit of an eager route file left the app stale when another
  router was created after the app's; two routers of one route tree (React StrictMode's state initializer) left one
  stale; with two route trees compiled by two plugin instances, the other tree's route took the edit. The runtime
  keeps one record per route file and updates every router holding a route that file evaluated to (or that loaded
  its lazy options). SPEC J3.11. `integration/route-hmr-browser-two-routers.test.ts`: "an eager route file's loader
  edits show in the app's route ($order, autoCodeSplitting: $autoCodeSplitting)";
  `integration/route-hmr-browser-two-routers-lazy.test.ts`: "a lazy route file's edits show in the app's route and
  leave the other router's alone (%s)"; `integration/route-hmr-browser-shared-tree.test.ts`: "a loader edit shows in
  every router of the tree (%s)", "an edit of the app tree's route `/` shows in the app's router; the other tree's
  `/` keeps its code", "an edit of the app tree's lazy route file shows in the app's router; the other tree's keeps
  its code".
- **One save that changes a loader's data shape and the component reading it failed** (main, React: the first such
  save): the route published the new data to the old component, which threw. The route's load now waits for its split
  component's new import where the framework has no refresh pass (Solid, Vue), on Vite after Vite applied the update
  (`vite:afterUpdate`), and a component's arrival publishes the matches again, which resets the boundaries. SPEC
  J3.3. `integration/route-hmr-browser-shape-change-cases.ts`: "shows each save in place ($loader loader,
  autoCodeSplitting: $autoCodeSplitting)", "shows each save in place (autoCodeSplitting: $autoCodeSplitting, route
  error component: $errorComponent)" (Vite and Rsbuild); `start-plugin-core/tests/integration/`
  `start-dev-route-shape-change.test.ts` and `rsbuild/start-dev-route-shape-change.test.ts`.

### J4 Start environment separation

Paths under `start-plugin-core/tests/` unless noted.

- **Rsbuild with RSC: a server fn only client code reaches is not registered** (as `main`, #7943; RSC phase 1,
  design-rsc-phase1-settlement.md amendment 4). A server fn whose only importer is a `'use client'` component of a
  server component, or whose module only client-only code imports (a `<ClientOnly>` child, a `createClientOnlyFn`
  body, a `<Hydrate>` fallback), answered `Server function info not found` in a cold build, from the persistent cache
  for the client-only positions, and in a dev server restarted on an up-to-date route tree. The server compilation's
  closure runs again at the last `finishMake` stage, after the RSC plugin's client handoff: the resolver is built again
  from what the finished client build calls. A nested chain stays a limit (Accepted limits: "what the settlement's last
  run builds after the client handoff"). SPEC J4.2. `react-start-rsc/tests/integration/`
  `rsc-start-rsbuild-build.test.ts`: "a server fn only a 'use client' component of a server component imports runs
  when clicked", "a server fn only $position of a $where imports runs when clicked"; `rsc-reach-warm-build-rsbuild.test.ts`,
  `rsc-reach-warm-edit-rsbuild.test.ts`: "a warm build: a server fn only $position of a $where imports answers", "…
  with the edited value"; `rsc-reach-dev-rsbuild.test.ts`, `rsc-reach-dev-rsbuild-no-cache.test.ts`: "…, after a
  restart > a server fn only $position of a $where imports answers", without the cache also the #7943 counter.
- **A `.validator()` link on a stored builder, or wrapped in `as`/`satisfies`, is not stripped from the client**
  (the chain walk stops at the identifier). SPEC J4.1, J4.8, J4.12. `createServerFn/caller-dead-code.test.ts`: "when
  the validator link is wrapped in a $name expression"; "when the validator link is on a builder stored in a variable
  ($name)"; `integration/start-build-env-separation.test.ts`: "$construct: its server code is not in the client bundle,
  and runs in the SSR build"; `start-compiler-factories.test.ts`: "the client strips a validator link$middleware wrapped
  in $name"; "the client strips a validator link of a builder stored in a variable".
- **An isomorphic fn whose link is stored, wrapped or passed through a helper loses that implementation.** SPEC J4.9.
  `integration/start-build-env-separation.test.ts`: "an isomorphic fn whose $name is stored in a variable runs its
  implementation in each build"; `start-compiler-factories.test.ts`: "each output keeps its implementation of an
  isomorphic fn whose $name is stored in a variable"; "each output keeps its implementation of an isomorphic fn with a
  wrapped chain link: %s"; `start-compiler-cases.test.ts`: "each output keeps its implementation of an isomorphic
  fn whose chain passes through a helper function".
- **A factory callee wrapped in `as any` is not resolved.** SPEC J4.5. `start-compiler-factories.test.ts`: "each output
  keeps its implementation of $shape with the callee in $name".
- **Builders are traced through identifiers and member expressions only**: namespace members, a re-exported Start
  namespace, a builder returned by a call or passed through a helper, `wrap(wrap(...))`, a library function creating
  server fns. SPEC J4.5, J4.12. `start-compiler-cases.test.ts`: "client builds compile a builder read from a
  namespace import"; "client builds compile factories of a re-exported Start namespace"; "client builds compile a
  builder returned by a function of $name"; "a server fn whose builder passes through a helper function fails the
  client"; `createServerFn/declaration-sites.test.ts`: "with %s imported, a server fn wrapped in two calls works like
  an unwrapped one"; `integration/start-build-server-fn-cases.test.ts`: "a server fn created by a library function: the
  handler is not in the client bundle, or the build fails clearly". Fix: the client has no server code, or the build
  fails at the call.
- **The bundler plugins choose modules by their text** (a factory name, `.handler(`, `<ClientOnly`): builders from
  other modules, comments inside a chain and namespace `ClientOnly` are missed, and a CommonJS dependency whose text
  matches is parsed as an ES module. SPEC J4.5, J4.11, J4.16, §5.15. `createServerFn/createServerFn.test.ts`: "a
  handler called with ${name} is extracted"; `start-compiler-cases.test.ts`: "client builds compile $name finished
  or called in another module"; `integration/pages/start-compiler-import-forms.test.ts`: "$name alone in its module: the
  other environment neither loads nor runs the implementation"; "through a namespace member";
  `integration/start-build-call-shapes.test.ts`: "$name are recognised: the client bundle holds no server code and the
  shape works"; `integration/start-build-server-fn-cases.test.ts`: "a CommonJS dependency with a top-level return builds
  and keeps its meaning"; "a CommonJS dependency with a top-level return compiles and keeps its meaning".
- **Nested env-only factories are found by the factory's exported name**, so a renamed import or local alias is
  missed. SPEC J4.5, J4.10. `start-compiler-cases.test.ts`: "client: a createServerOnlyFn called through $name is
  compiled"; "a createServerOnlyFn local alias called in a top-level block works in each environment, or is rejected at
  the call".
- **A chain method called through a computed member, or a call whose result is member-called, is never visited.**
  SPEC J4.5, J4.12. `start-compiler-cases.test.ts`: "$name: the client holds no server code, or the module is
  rejected at the call"; `integration/start-build-call-shapes.test.ts`: "$name: the client bundle holds no server code
  and the shape works, or the build fails at the call". The server runs an isomorphic fn's client implementation
  called through a member of its chain (`.client(fn)['call'](null)`; J4.9, J4.11):
  `createIsomorphicFn/createIsomorphicFn.test.ts`: "read through a computed member: the server neither holds nor loads
  the client implementation, the client rejects the read"; `integration/start-build-builder-escapes.test.ts`: "an
  isomorphic fn read through a computed member in a module only the server imports: the server neither holds nor runs
  the client implementation". (Same cause in J7: "renderServerComponent styles the server
  component when its result is chained".)
- **Server fns outside a top-level variable declaration are left untransformed, broken or rejected without a
  position.** SPEC J4.6. `createServerFn/declaration-sites.test.ts`: "a server fn created through an optional call
  chain compiles like a plain chain or is rejected";
  `start-compiler-cases.test.ts`: "a createServerFn in $name does not ship its handler to the client"; "with
  another Start factory imported, a server fn in $name works or is rejected at the call"; "with %s imported, a nested
  server fn whose handler reads a local of its function is supported or rejected at the capture".
- **A handler that is a `createIsomorphicFn()` or `createServerOnlyFn()` call is compiled first, and the caller never
  becomes an RPC.** SPEC J4.1, J4.2, G5. `createServerFn/handler-scope.test.ts`: "the handler can be a
  createIsomorphicFn call, or the module is reported"; `start-compiler-cases.test.ts`: "%s: a server fn whose
  handler is a createServerOnlyFn call returns the handler result, or is reported";
  `integration/start-build-call-shapes.test.ts`: "$name: the server fn works, or the build fails naming the file" (in a
  build, the server entry throws while it loads). Fix: the server fn works, or the build fails with an error naming the
  file (in dev, an error or a warning naming the file).
- **Dev edits of a factory module do not recompile its (transitive) importers.** SPEC J4.5, G10.
  `integration/start-dev-edits.test.ts`: "client: a module importing an edited factory module through a
  re-export ($name) loads no server code"; "SSR: a module importing an edited factory module through a re-export
  ($name) gets a server fn"; `start-compiler-cases.test.ts`: "a dev edit of a module a re-export chain ends in
  recompiles its importers"; `start-compiler-factories.test.ts`: "dev: editing a factory module recompiles its
  importers against the new code".
- **Dev lookups go through a derived id** (`?server-fn-module-lookup`) a virtual-module plugin or a fresh server does
  not know. SPEC J4.4, G11. `createServerFn/createServerFn.test.ts`: "a server fn whose factory a virtual module serves by
  its exact id compiles in dev"; `integration/start-dev-compile-cases.test.ts`: "calls a server fn id on a fresh
  dev server that has not compiled its module". A fresh server compiles the module of an id only for an app source
  (J4.4, R176); outside `srcDirectory` it answers only ids the session registered
  (`integration/start-dev-server-fn-scope.test.ts`).
- **The dev client compiler loads a top-level callee's module from inside the transform**, which deadlocks with
  Vite's dependency optimizer. SPEC G1. `integration/start-dev-compile-cases.test.ts`: "transforms a client module
  with a server fn and a top-level call of a pre-bundled dependency".
- **A Vue SFC `<script lang="ts">` block is parsed as TSX** (the parser is chosen from the id without its query).
  SPEC §2.1. `integration/start-vue-sfc-script-ts.test.ts`: "build: a server fn in a <script lang="ts"> block
  may use angle-bracket type assertions".
- **With SSR as the provider, a module is two instances in the SSR bundle**, so its top-level code runs twice. SPEC
  J4.14, G3. Fixed (R157; also #8656): the lazy handler module imports what the module keeps.
  `integration/start-build-server-fn-cases.test.ts`: "SSR: a server fn module is initialised once and shares its state
  with SSR code"; `integration/start-compose-server-fn-route.test.ts`: "the server runs the route module once".
- **Production builds: server fns no client code calls answer HTTP calls by id**: one only server modules define,
  one private to a module the client imports (a helper another server fn's handler calls), which the client's compile
  registered before tree-shaking, and one the module exports but the client never uses (its stub, the user's chain
  ending in `.handler(createClientRpc(id))`, was a call bundlers keep). SPEC J4.2 (R182): the client-origin gate is the set of ids whose client call
  survives in the emitted client code, on both hosts and under RSC.
  `integration/start-build-server-fn-cases.test.ts`: "SSR: a server fn only server code references is not callable over
  HTTP"; `integration/start-build-server-fn-callable.test.ts`: "SSR: a server fn private to a module the client imports
  is not callable over HTTP, and its own module calls it"; "client: an exported server fn the client never calls leaves
  the client bundle and is refused over HTTP, and the user code of its chain still runs"; "client: a server fn stub
  continued by a user call, or a statement after a line without a semicolon, keeps the effects and values of the
  module"; "SSR: a rebuild follows the importer edits that stop and resume using an exported server fn"; "SSR: a
  rebuild follows the edits that remove and restore the last client call of a server fn";
  `react-start-rsc/tests/integration/rsc-start-build.test.ts` and `rsc-start-rsbuild-build.test.ts`: "a server
  function only server code calls is not callable from the browser".
- **Vite: the production server-fn resolver is generated before the SSR build found every server fn** (#7213). SPEC
  J4.2, G4. `integration/start-build-server-fn-cases.test.ts`: "is callable, the app files written %s"; "its caller only
  client code imports: the caller is callable over HTTP, the app files written %s".
- **Library discovery reads the `package.json` of `process.cwd()`, not Vite's root.** SPEC J4.16.
  `integration/start-build-server-fn-cases.test.ts`: "a build run from another directory: a library's server fn runs in
  the SSR build".
- **Rsbuild SSR: an isomorphic fn makes the compiler resolve the module's `createMiddleware` import.** SPEC J4.8.
  `integration/start-build-server-fn-cases.test.ts`: "a module with a middleware and an isomorphic fn builds, and its
  middleware runs on the server".
- **Collision suffixes follow discovery order across fresh builds.** SPEC J4.4, G4.
  `integration/start-build-determinism.test.ts`: "fresh builds keep the function-to-id mapping when discovery order
  reverses".
- **`export *` diamonds and cycles poison the build-mode export cache.** SPEC J4.5.
  `integration/start-compiler-build-export-cache.test.ts`: "export \* $name do not poison the build-mode export cache".
- **Rsbuild: an `export *` of `@tanstack/react-start` that a factory import goes through fails the build**
  ("PackagePathNotExported"): the compiler resolves the star export's target with the loader's resolver, which does
  not resolve the package's `exports` (`import` and `react-server` conditions only); a named re-export is recognised by
  its name and never resolved. SPEC J4.5, G11. `integration/start-compiler-build-inputs.test.ts`: "$name" (its
  `rsbuild build` rows of the `export *` chains that re-export the package). Fix: the build resolves the package as the
  bundler does, and the rows work.
- **Re-exports are looked up by local name only**, so distinct aliases and shadowing locals resolve to the wrong
  factory. SPEC J4.5, G15. `start-compiler-cases.test.ts`: "distinct re-export aliases of two factories keep their
  own kind"; "%s: parameters and locals shadowing the factories are left alone next to a compiled factory call".
- **Env-specific functions inside a handler are not compiled on the server.** SPEC J4.10.
  `start-compiler-factories.test.ts`: "the server compiles env-specific functions inside a server fn handler".
- **A provider module keeps the source's `'use client'`**, so RSC makes its exports client references. SPEC J4.2,
  J4.17. `react-start-rsc/tests/integration/rsc-start-client-module.test.ts`: "a server function of a 'use client'
  module runs on the server".
- **Vite RSC build: a server fn whose only importer is a `'use client'` component is not registered** (the
  provider build never reaches a module only a client reference imports), so the call answers 500. SPEC J4.2.
  `react-start-rsc/tests/integration/rsc-start-build.test.ts`: "a server fn only a 'use client' component of a server
  component imports runs when clicked"; `rsc-start-build-client-reach.test.ts`: "a server fn written as the %s
  spelling runs when clicked" (an imported builder's typed, parenthesized and non-null `.handler` calls). A lazy
  import from a `'use client'` module is still not followed (see "Remaining pins"). Fix: every server fn the client
  references is callable by id.

### J5 Deferred hydration `<Hydrate>`

- **Solid's `ref={x}` was no assignment of `x`** (Astra hydrate B4, round 3 B2; the router's split too): a
  module-level `let` named by a ref in split children, or in a helper only they render, was copied into the chunk
  (code outside read `undefined`); a component `let` set by a ref outside the boundary reached the children as the
  value of then (a later-mounting element never seen); a split Solid route component whose ref named a module `let`
  that `beforeLoad` reads assigned its chunk's copy. The analysis now marks such a ref as possibly assigning, unless the
  binding holds a callback nothing assigns (Solid calls it); placement's write table and the mutation model count
  the mark where the output keeps the ref. SPEC J5.5, J5.8, J2.4.
  `start-plugin-core/tests/integration/pages/hydrate-boundary-forms.test.ts`: "client: a Solid ref in the children
  naming a module let binds the let the module reads", "client: children with a Solid ref naming a module let in a helper
  only the children render stay in place with one warning", "Solid: split children with $name build and bind it";
  `start-plugin-core/tests/integration/hydrate-pages-solid.ts`: "a split handler reads an element a later ref outside
  the boundary binds"; `router-plugin/tests/code-splitter-main-shapes-this.test.ts`: "keeps beforeLoad reading the element
  the component's ref binds".
  Paths under `start-plugin-core/tests/integration/`; `pages/` means `integration/pages/`.

- **A split component with a boundary that another option reads goes to the shared module without its lazy
  component.** SPEC J2.20. `hydrate-build-cases.ts`: "boundaries in split route options that another option reads
  hydrate in the boundaries the server renders".
- **The parent of a boundary keeps a declaration only the children use when another removed declaration reads it
  too.** The parent prunes with its own walk (`stripBindingsOnlyReferencedByNodes` in `hydrate-when-transform.ts`),
  which drops a binding only when every reference lies in the one node it is pruning: the shared end of a diamond and
  both halves of a cycle (mutual recursion, a class and a const) stay, with their imports. SPEC G16, J5.6. Fix: the
  parent drops everything only the children used, whatever the shape. `pages/hydrate-dead-code-shapes.test.ts`:
  "client: the parent drops what only the children use through a diamond" (and "… mutually recursive functions",
  "… a class and a const that read each other").
- **A namespace member `<Start.Hydrate>` is not a boundary.** SPEC J5.1. `hydrate-pages-react.ts` and
  `hydrate-pages-solid.ts`: "a namespace-imported Start.Hydrate loads its children when it hydrates".
- **Module-level declarations reach the chunk only for some forms** (nested `var`s, `import X = ns.X`,
  default-exported functions, enums, namespaces, assigned `let`s are dropped). SPEC G1.
  `pages/hydrate-module-level.test.ts`: "client: a var declared in a nested block that the children read
  reaches the chunk"; "client: a TypeScript import
  alias used by the split children is declared in the chunk"; "client: $name used by the children reaches the chunk".
- **The chunk removes any binding named `Route` without importing the route.** SPEC G1, J2.4.
  `pages/hydrate-module-level.test.ts`: "client: split children reading Route $name use the one route";
  "client: an unexported component named Route that the children render reaches the chunk".
- **A hook called through a namespace (`React.useId()`) is not rejected.** SPEC J5.5.
  `pages/hydrate-boundary-forms.test.ts`: "client: a hook called through a namespace is rejected at the boundary".
- **React's `use` (`use(Context)`, `use(promise)`) directly in the children is no hook** (Astra hydrate B3): the
  hook rule matches `use` followed by a capital or a digit, so the call moves into the chunk's component, below a
  Provider the same return renders around the boundary: the server renders the outer value, the client the
  Provider's (React #418). Rejected like a hook call (ruling 11-18), by binding. SPEC J5.5.
  `pages/hydrate-boundary-forms.test.ts`: "client: $name in the children is rejected at the call"; "use(Context) $name
  reads the same context on both sides"; "a local function named use in the children is no hook".
- **Children are read from JSX children only, never from a `children` prop or spread.** SPEC J5.2, J5.4.
  `pages/hydrate-split-modules.test.ts`: "client: the children prop ($name) of a self-closing boundary is deferred";
  `pages/hydrate-ids-and-captures.test.ts`: "client: children passed through $name render without unused chunks"; "client: a
  boundary nested in a children prop hydrates with the id the server renders".
- **`<Hydrate>` is matched by name, not binding.** SPEC G15. `pages/hydrate-ids-and-captures.test.ts`: "client: a local
  component named Hydrate is left alone".
- **Server and client number boundaries differently** (a boundary in a `fallback`, a copied component, code other
  transforms removed first). SPEC J5.4. `pages/hydrate-ids-and-captures.test.ts`: "a Hydrate inside a fallback does not shift
  the chunks of later boundaries"; "client: $name hydrates like the server renders it"; "a later boundary keeps its id
  and its children next to $name".
- **Text children move as raw strings** (no JSX line collapsing; edge spaces dropped). SPEC G1, J5.9.
  `pages/hydrate-ids-and-captures.test.ts`: "client: a text-only child renders like JSX text: $name"; "client: spaces around a
  single child on one line render like on the server".
- **Capture analysis is wrong**: locals named `key`/`ref` become React props; tags starting with `_`, `$` or non-ASCII
  letters, member-expression tags and enums are not passed; bindings declared inside the children and property names
  are taken for captures. SPEC J5.2. `pages/hydrate-ids-and-captures.test.ts`: "client: captured
  locals named key and ref reach the split children"; "client: the split children render a local component named %s";
  "client: the split children render member-expression tags of $name"; "client: the split children render a component
  bound inside them"; "client: property names, method keys and optional members are no reads of a local"; "client: the
  split children read a local enum". (`main` rewrote `arguments` to another function's; it is now refused, J5.5:
  `pages/hydrate-moved-code.test.ts`.)
- **A Solid directive (`use:tip`) is no use of `tip`**: the chunk neither declares a module-level `tip` nor receives
  a component's `tip`, and Solid's JSX transform calls it there ("tip is not defined"). SPEC G1, J5.2.
  `hydrate-pages-solid.ts`: "split children run a directive declared in the $where".
- **A Solid `ref={input}` to a `let` of the component assigns the chunk's own copy**: the `let` is passed to the
  chunk as a prop, so the component never sees the element. SPEC J5.8. `hydrate-pages-solid.ts`: "a ref in split
  children binds the let of their component".
- **A `this` owned by a function inside the children is rejected.** SPEC J5.5. `pages/hydrate-ids-and-captures.test.ts`:
  "client: split children may use the own `this` of $name".
- **`await` in children moves into a synchronous chunk component.** SPEC J5.5, G1. `pages/hydrate-ids-and-captures.test.ts`:
  "client: await in split children is rejected at the boundary or renders".
- **A text-only boundary's chunk has an empty source map.** SPEC G6. Text only is no longer split (decision 12); split
  text maps: `pages/hydrate-ids-and-captures.test.ts`: "client: the split text of a boundary maps to its line and
  column".

### J6 Import protection

Paths under `start-plugin-core/tests/integration/`; `ip/` means `integration/importProtection/`.

- **An overtaken compile still published** (settlement design, step 0; whole-PR review C6-02): a compile whose answer
  a newer request, an event or a removal overtook while it waited (a resolution a plugin holds, an async
  `allowImport`) wrote import protection's state and reported its violations when it answered last. Vite dev. SPEC
  J6.5. Fixed in step 2 (`session.transform`: a compile's shared writes and reports follow only a current answer).
  `start-dev-settlement.test.ts`: "C6-02b: an import the newer text removed is not reported", "the file saved with
  other text and back (A, B, A): the older A reports nothing", "the file removed and created again with the same
  bytes: the older compile reports nothing", "a dependency-only rebuild of the same text: the older compile reports
  nothing".
- **Allowing an import only silenced the report on `main`** (`onViolation` returning `false`, replaced by
  `allowImport`): the mock was already chosen. SPEC J6.6.
  `ip/allow-import-cases.ts` (Vite and Rsbuild builds): "true: the real module, from the only pass; no report";
  `ip/dev.test.ts`: "allowImport returning true: the client gets the real module"; "with behavior "error", an
  import of a denied file it allows gets the real module"; `ip/policy.test.ts`: "the client gets the real module".
- **Exempt importers get the mock** (the denied file is mocked in its own transform, for every importer). SPEC J6.7.
  `ip/exemptions.test.ts`: "the exempt importer gets the real module, and is not reported" (two tables);
  `ip/policy.test.ts`: "an importer $how gets the real module".
- **With `include`, a denied file outside the patterns is never mocked.** SPEC J6.8. `ip/exemptions.test.ts`: "an
  importer that is not exempt gets the mock and is reported" (two tables).
- **Marker violations ignore which importer is exempt** (Vite reports the marked module; Rsbuild mocks it for every
  importer and blames the nearest chain). SPEC J6.7, J6.5. `ip/build-markers.test.ts`: "imported only by an ignored
  importer does not fail the build"; "imported only by an ignored importer: the ignored importer gets the real module";
  "in mock mode, an ignored importer gets the real module, another importer a safe mock, and only the other importer is
  reported"; "imported by an ignored importer and, further from the entry, another importer: the violation blames the
  other importer".
- **A denied file only a module of a custom type imports is mocked but not reported** (Rsbuild: the importer is not
  compiled). SPEC J6.1. `ip/dev-outcomes.test.ts`: "a module of a custom type importing a denied file is reported,
  and its real code does not run".
- **`mockAccess` is ignored in production and server mocks** (always silent). SPEC J6.3. `ip/build-mock.test.ts`:
  "with mockAccess $mockAccess, using the mock of $denied is reported as an $severity naming the import";
  `ip/dev.test.ts`: "$mockAccess: the server gets a safe mock, and using it is reported as an $severity naming the
  import".
- **A build marker violation mocks only the marker import**; the marked module keeps its code. SPEC J6.3, J6.8.
  `ip/build-mock.test.ts`: "%s is mocked, with a warning".
- **`export *` from a denied module re-exports nothing** (`undefined` in an Rsbuild build; the importer fails to load
  in dev). SPEC J6.8. `ip/build-mock.test.ts`: "a name re-exported with `export \*` from a denied specifier is a safe
  mock, or the build fails"; `start-dev-edits.test.ts`: "client: a name re-exported with `export \*` from $name is
  a mock, or the server warns at the `export \*`".
- **`excludeFiles` and dependency markers are handled inconsistently** (Vite checks a dependency's marker whatever
  `excludeFiles` says; Rsbuild skips it even with `excludeFiles: []`; with `excludeFiles: []` dev rewrites to the real
  file or reports nothing). SPEC J6.10. `ip/build-options.test.ts`: "by default, the server-only marker of a dependency
  is not checked"; "[] checks the markers of dependencies: a server-only-marked dependency fails the build";
  `ip/dev.test.ts`: "by default, is not logged, and the client gets the real module"; "with excludeFiles: [], is logged,
  and the client gets a safe mock"; `ip/default-rules.test.ts`: "the client reports the dependency file it denies, and
  does not load it"; "the server reports the dependency file it denies".
- **Rsbuild builds count denied modules the client bundle dropped.** SPEC J6.4. `ip/build.test.ts`: "a
  server-only-marked module re-exported by a barrel the client uses other exports of builds without any report";
  `ip/build-outcomes.test.ts`: "a denied module the client bundle drops does not fail the build"; "in mock mode, an unused
  denied module leaves nothing in the client bundle and no warning".
- **Dev logs only violations reachable from Start's router and start entries.** SPEC J6.9. `ip/dev-page.test.ts`: "a
  denied import of a module the client entry imports is logged"; "a client-only import of a module the server entry
  imports is mocked on the server and logged".
- **An edit drops every import-graph edge pointing at the edited module**, so new violations are discarded. SPEC
  J6.13. `ip/dev.test.ts`: "added by an edit of the importer is logged at its original import or surviving use, with a
  trace from the entry"; "'always' logs a violation again after an edit"; `ip/edits-page.test.ts`: "the step reports
  its violations, and only those".
- **`log` counts are wrong in dev** (one import logged for the specifier and again for the mock's resolved path, and
  twice per load with `'always'`). SPEC J6.5. `ip/dev.test.ts`: "'once' logs one warning for one import"; "'always' logs
  one warning for one import each time its module is loaded".
- **An MDX importer's location ignores its source map.** SPEC J6.5. `ip/dev.test.ts`: "importing a denied file, the
  warning names the .mdx page, located in its original mapped source".
- **Dev reads `getModuleInfo(importer).code`, which Vite's dev server does not support.** SPEC J6.8.
  `ip/dev.test.ts`: "importing a denied specifier gets the mock, and the dev server logs a warning naming it";
  `start-dev-edits.test.ts`: "client: a server fn module calling a function of a denied specifier at the top
  level loads".
- **Marker state is known only after a transform**, and Vite keeps importers' transforms after an edit. SPEC J6.11,
  J6.13. `ip/dev.test.ts`: "is mocked when the client loads the importer first"; "after an edit adds the marker, the
  violation is logged"; "after an edit adds the marker, the importer gets the mock"; `start-dev-edits.test.ts`:
  "client: the importer of a module whose server-only marker was removed loads the module".
- **Server-fn lookups pre-transform modules and silence them** (recorded as lookup modules by path). SPEC J6.4.
  `ip/dev.test.ts`: "a helper a server fn factory module uses only inside .server() is not logged";
  `ip/dev-outcomes.test.ts`: "a server fn factory module calling a denied import at the top level fails to load"; "a
  module a server fn factory module imports, calling a denied import at the top level, fails to load".
- **A map's relative `sources` are taken as the importer's file.** SPEC J6.5, §5.7. `ip/dev.test.ts`: "a denied import
  of a module a server fn factory module re-exports is reported at its original import or use, with its path".
- **Warm-up and per-environment `buildStart` discard pending violations.** SPEC J6.11. `ip/dev.test.ts`: "a denied
  import of a module warmed up before its importers is logged once the client loads the app"; "with
  perEnvironmentStartEndDuringDev, a denied import of a module the client loads after the server rendered is logged".
- **Full-bundle dev takes route modules as entries**, so traces stop early. SPEC J6.5. `ip/dev.test.ts`: "the trace of a
  denied file imported from a module of src/routes leads from the router entry".
- **The silent mock loads only by its exact id**, not with the lookup query. SPEC J6.8, G11. `ip/dev.test.ts`: "with
  mockAccess off, a server fn built with a factory of a denied file gets the mock in the client bundle and is logged at
  its original import or use".
- **Source maps for diagnostics are captured only for some modules**, so locations are compiled coordinates. SPEC
  J6.5. `ip/dev.test.ts`: "in a JSX module, a use of a denied file imported through a subpath import alias is located on
  its source line"; `ip/reported-location-trace.test.ts`: "$build: after $name".
- **`maxTraceDepth` is applied from the entry side** and loses the importer. SPEC J6.5. `ip/dev.test.ts`: "with
  maxTraceDepth, a deeper trace is cut, keeping the importer".
- **A specifier mock exports only statically read names, and an Rsbuild mock build inlines enum values.** SPEC J6.8.
  `ip/dev-outcomes.test.ts`: "vite dev: ${name}."
- **Rsbuild: a dynamic `import()` of a denied specifier is neither reported nor mocked.** SPEC J6.1.
  `ip/build-outcomes.test.ts`: "a client dynamic import of a denied specifier fails the build, reporting one client
  violation".
- **Denied non-JS/TS files (`.server.json`, `.server.cjs`) keep their content or fail the build.** SPEC J6.8.
  `ip/build-outcomes.test.ts`: "in mock mode, a denied .server.json file is mocked, with a warning"; "in mock mode, a denied
  .server.cjs file is mocked, with a warning".
- **Traces skip modules outside the source directory (Vite) or collapse when a module imports the entry back
  (Rsbuild).** SPEC J6.5. `ip/reported-location-trace.test.ts`: "the trace goes through modules outside the source
  directory"; "the trace starts at the entry when a module imports the entry back".
- **The usage lookup misjudges uses** (a member property named like the import, any `<name>ServerFn.handler(...)`,
  type positions, JSX elements, a wrapped `createServerOnlyFn` argument). SPEC J6.5. `ip/reported-location.test.ts`:
  "$channel: $name." (four tables).
- **Rsbuild names the importer after the source map URL** (`webpack://…/./src/a.tsx`). SPEC J6.5, §5.7.
  `ip/reported-location.test.ts`: "$channel ($name): a JSX element."
- **A violation through a vite-tsconfig-paths alias reports the mapped specifier, without a location.** SPEC J6.5,
  G11. `ip/alias.test.ts`: "the build fails, reporting the aliased specifier at its original line".
- **Rsbuild `source.transformImport` bypasses specifier denials, and its locations do not map back.** SPEC J6.1,
  J6.5. `rsbuild/import-protection.test.ts`: "the file rule denies the module it resolves to: the importer is reported at
  the import or the use"; "denied as written, the build fails on it, reporting the importer at the import or the use".
- **Rsbuild dev with RSC: an exempt importer's denied import was denied after a rebuild** (RSC investigation L1;
  `main` serves the mock, which J6.7 also rules out): a `'use client'` component that a route and a server component
  both render (a module of the `ssr` and of the `rsc` compile environment), exempt from import protection, imports a
  denied file; import protection's edge index was keyed by importer id, so the RSC layer's compile of the component
  replaced the SSR layer's row and the SSR compile denied the file after a route added while the server was stopped
  or a removed or restored use. Each Rspack layer is its own compile environment now (RSC phase 1). SPEC J6.7.
  `react-start-rsc/tests/integration/rsc-dual-layer-dev-rsbuild.test.ts`: "a route added while the server was stopped
  shows both real labels once the generator rebuilt the tree", "then removing the server component's use keeps the
  route's real label", "then restoring the server component's use shows both real labels", "after the fresh start,
  removing …", "after the fresh start, restoring …".

### J7 RSC CSS injection

Paths under `react-start-rsc/tests/integration/`.

- **An identifier or spread `renderToReadableStream` argument is skipped silently** (no warning; Rsbuild's compiler
  host would drop it too). SPEC J7.3. `rsc-css-diagnostics.test.ts`: "%s dev warns about the CSS limitation once per
  source file, naming it"; `rsc-css.test.ts`: "dev: renderToReadableStream with $name warns, naming the file";
  `start-plugin-core/tests/integration/start-rsc-warnings.test.ts`: "renderToReadableStream with a variable or a spread
  warns once per file, naming the module" (counts under J4).
- **Rsbuild writes Start's virtual modules under `process.cwd()`.** SPEC G11, J4.16. `rsc-css-rsbuild-root.test.ts`:
  "Rsbuild: the app compiles when the process does not run in the app directory".
- **Rsbuild injects CSS in server-fn provider modules only**, so a render call in a helper module is unstyled. SPEC
  J7.1, J7.2. `rsc-css-rsbuild.test.ts` (Rsbuild dev) and `rsc-css-rsbuild-build.test.ts` (production build), rows
  of `rsc-css-rsbuild-app.ts`: "a render call in a helper module styles the server component".
- **A conditional whose branches are all JSX is not wrapped.** SPEC J7.3. `rsc-css.test.ts`:
  "renderToReadableStream($argument) styles the stream"; "a false ternary stream carries its selected badge CSS".
- **A comment before the JSX argument becomes JSX text.** SPEC J7.4, G12. `rsc-css.test.ts`: "renderToReadableStream
  does not render $name before the JSX argument".
- **A call whose result is member-called is never visited** (see J4). SPEC J7.2. `rsc-css.test.ts`:
  "renderServerComponent styles the server component when its result is chained".

## Upstream issues that affect the suite

"Remove when" says when a harness change can go.

| Tool                                                         | Symptom                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | What the suite does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@vitejs/plugin-rsc` 0.5.39 (Vite 8.3.4)                     | `vite build --watch` of an RSC app exits 1 before a runnable server exists: the plugin awaits the RSC build and renames `dist/server/rsc` into `node_modules/.vite-rsc-temp/rsc`, which in watch mode is not written yet (`ENOENT`); a config with only the RSC plugin and three trivial entries fails the same way (head and `main`; RSC investigation, Astra 11-19)                                                                                                                                                                                                                                                                                                                                                       | not pinned: Start's RSC apps have no Vite `build --watch` test (the Vite RSC harness builds with `buildApp()` only, `react-start-rsc/tests/integration/rsc-app.ts`). Upstream fix to propose: wait for each watch phase's first completed output before moving it, then keep the environments' rebuilds ordered (issue not filed yet). Remove when a plugin version serves the first watch output and an edit's rebuild.                                                                                                                                                                                                                                                                                            |
| Rspack 2.2 (vendored watchpack 2.5.2)                        | a file removal that lands while a compile runs is lost (fixed in watchpack 2.6.0, webpack/watchpack#345)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Rsbuild tests delete or recreate one file per edit and settle before the next write (`start-plugin-core/tests/integration/importProtection/edits*.test.ts`, `hosts.ts`, `integration/rsbuild/dev-server.test.ts`). Remove when Rspack bundles watchpack ≥ 2.6.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Vite 8.3.4–8.3.7 module runner                               | a `full-reload` clears `evaluatedModules` while an import is evaluating; the import goes on in the new generation, sharing route modules with the requests after the reload                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | pinned (J3.3): `start-plugin-core/tests/integration/start-dev-ssr-reload-in-flight.test.ts`; vitejs/vite#24046. Remove when the runner's reload waits for the evaluations in flight (or keeps them in their generation).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Rspack 2.2 (vendored watchpack 2.5.2)                        | a file deleted during the watcher's first scan is never reported                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | the Rsbuild dev harness resolves once every compiler's watcher has scanned the app, and writes the initial files with past modification times (`compiler-test-utils/src/rsbuild-dev-server.ts`). This is what "the server is up" means; it may stay.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Vite 8 `experimental.bundledDev`                             | closing the server during its initial build leaves a rejection unhandled ("Failed to get bundle state"); no public API to await it (vitejs/vite#22991)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | before `close()` the harness waits for the initial build, reading one Vite internal (`compiler-test-utils/src/dev-server.ts`). Remove when Vite handles the rejection.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Vite 8.3.4 dependency optimizer                              | keeps writing `node_modules/.vite/deps_temp_*` after `close()` resolved: removing the app fails with `ENOTEMPTY`, or a write into the removed app is an unhandled rejection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | before `close()` the Vite dev harnesses wait until each environment's optimizer has scanned and no `deps*_temp_*` directory is left (`closeViteServer` in `compiler-test-utils/src/dev-server.ts`). Remove when Vite awaits its optimizer on close.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Vite 8.3.4 dependency optimizer                              | a late-discovered dependency changes a pre-bundled chunk's exports without changing its hash; the page fails with "does not provide an export named '<letter>'"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | not seen since the harness apps use `tanstackStart()` (whose framework plugins pre-bundle React at start). No workaround. If seen, re-run the file alone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| solid-refresh 0.6.3                                          | a removed or renamed component's name stays in the `hot.data` registry: patches stop at it and every later evaluation calls `hot.invalidate()` (solidjs/solid-refresh#88); Rspack, outside an update (`import()`): status stays `ready` (same pinned outcomes on Rspack 2.3.1 and 2.3.3); Vite: a kept proxy is stale                                                                                                                                                                                                                                                                                                                                                                                                       | pinned (J3.3): `router-plugin/tests/integration/route-hmr-browser-solid-identity.test.ts` and `-rsbuild.test.ts`. Remove when solid-refresh forgets a removed name once it invalidated the module.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| solid-refresh 0.6.3 (Vite mode)                              | a module is patched only in its own accept callback (webpack mode: on evaluation): after a split chunk's import failed, a deleted file's return updates the route module alone, which imports the chunk again unpatched (issue to be filed)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | worked around, temporarily (J3.3): `solid-router/src/hmr.ts` (`reloadOnRecover`) reloads the page once, on every host, when the lazy wrapper's import succeeds again (`start-plugin-core/tests/integration/start-dev-removed-import.test.ts`). Remove when solid-refresh patches on evaluation in ESM mode.                                                                                                                                                                                                                                                                                                                                                                                                         |
| solid-refresh 0.6.3 (webpack mode)                           | a module whose first evaluation threw stores no registry once an update disposes it (its dispose handler keeps `hot.data`'s, which is empty), so no later evaluation patches its components. Solid on webpack-style hosts (Rsbuild, Rspack, webpack): a page loaded while a split route component's module throws when it evaluates shows the fix, then silently ignores every later edit of that route file until a manual reload (Fable, review of the route HMR implementation, 11-23). Also on solid-refresh 0.7.8. Upstream: solidjs/solid-refresh#88 ([comment](https://github.com/solidjs/solid-refresh/issues/88#issuecomment-7099110035), repro https://github.com/Sheraff/solid-refresh-webpack-first-eval-throw) | no workaround (user, 11-23: decision B): reload the page once after the fix. No test (upstream). Remove when solid-refresh keeps a registry after a failed first evaluation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Rolldown 1.2.13                                              | `var x = 1; for (var x of [2]) {}; export { x }` (also a for-in head or `var { x } = o`): an importer of `x` gets the constant `1`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | not pinned (the compiler's output is valid: the route module holds both declarations and exports the binding; webpack and Rspack read the last value). The suite no longer reaches it: the statement declaring `x` again follows `x` into the chunk when only the chunk reads it (`router-plugin/tests/integration/code-splitter-module-state.test.ts`, "… in a head or a pattern (Rolldown)")                                                                                                                                                                                                                                                                                                                      |
| Rspack before 2.3.3 lazy compilation (Rsbuild's dev default) | a module that accepts its own updates and is loaded with `import()` evaluates again on each edit, but every later `import()` of it answers its first namespace (web-infra-dev/rspack#16594, fixed in 2.3.3 by rspack#16595)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | worked around, temporarily (J3.3): `solid-router/src/hmr-chunk-importer.ts` and the router plugin's `chunkImporterCall` (`router-plugin/src/planners/split.ts`) make a Solid split chunk's importer answer its newest evaluation. With the wrapper off, the four rows the entry "Rsbuild: a Solid split chunk imported again answered its first evaluation" names fail on Rspack 2.3.1 and pass on 2.3.3 (2026-11-20). Remove when the supported range starts at 2.3.3 (the Start packages' peer is `@rsbuild/core ^2.2.13`): delete the module, the planner branch and their tests (`solid-router/tests/hmr-chunk-importer.test.ts`); the browser rows of `route-hmr-browser-solid-identity-rsbuild.test.ts` stay. |
| webpack 5.110                                                | `export { K as "" } from './x'` (an empty export name) is read as `export *`: importers get `K`, not `""`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | not pinned (the compiler's output is valid). Rows in `router-plugin/tests/integration/extracted-export-string-names.test.ts` skip webpack for that name.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Rollup 4.63.1 (Vite 7)                                       | a `for (var x of …)` or `for (var x in …)` whose `x` another chunk imports renders `for (var x; of …)`: the build fails                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | not pinned (the compiler's output is valid). Same for a `var` declared once.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `@vitejs/plugin-react` 6.0.1 (Rolldown's Refresh wrapper)    | the Refresh footer is appended without a line break: a module whose code ends in a line comment loses the footer's first line, and the next hot update throws `RefreshRuntime is not defined`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | not pinned (the compiler's output is valid). Avoid ending emitted modules with a line comment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Vite resolver                                                | `#` in a file path outside `node_modules` is read as a fragment; a query import of such a file does not resolve                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | not pinned (a plain Vite app fails the same way).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Vite `vite:oxc`                                              | `.cts` with TypeScript syntax is not transformed (also with a query)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | not pinned.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| es-module-lexer 2.3.2 (Vite 8)                               | fails on `import def, { "kebab-name" as kebab } from "x"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `importProtection/mock-shapes.test.ts` writes the two imports as separate declarations.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Node `autoSelectFamily`                                      | a worker blocked for over 500 ms abandons the `::1` attempt to a `localhost` server and is refused at `127.0.0.1`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | every harness server listens on `127.0.0.1` and its URL names that address.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Node 24/26 `fs.rmSync`                                       | returns without an error and leaves files behind when another process removes part of the tree meanwhile                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | only the run's teardown removes the run's temp directory (`compiler-test-utils/src/run-directory.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Rspack 2.2, webpack 5                                        | unminified production output keeps reads of dropped bindings in dead code of modules no compiler touched                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | the dangling-name check covers only modules the compilers produced or changed (SPEC G8; `checkDanglingNames` in `compiler-test-utils/src/build-harness.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Chromium (Playwright, `--disable-dev-shm-usage`)             | shared memory lives in files in `TMPDIR`; a full router-plugin `test:integration` holds up to about 2.2 GB; with little room, module requests fail (`net::ERR_INSUFFICIENT_RESOURCES`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | the browser helpers bound open pages (`runPageLimit`, `openPageLimit` in `compiler-test-utils/src/browser.ts`). Use a `TMPDIR` with room, or re-run the file alone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| unplugin 3.3                                                 | webpack and Rspack loaders drop the plugin's source map                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | fixed (S4): unplugin was the former integration layer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `@babel/generator` 7.29                                      | drops required parentheses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | fixed (S3): Babel was the former printer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| babel-dead-code-elimination 1.0.12                           | counts `typeof` type queries as references (pcattori/babel-dead-code-elimination#50)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | fixed (S2): the former dead-code elimination.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| babel-dead-code-elimination 1.0.12                           | removes the const of a class and const cycle and keeps the class, whose static field then reads a deleted name (no class visitor)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | fixed (S7): the former dead-code elimination.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
