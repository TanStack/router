# SPEC: what a TanStack Router/Start compiler must do

The contract the compiler tests check. Tests cite its clause ids (`J4.12`, `G3`, `§5.7`). How to run and read the
suite: [README.md](./README.md). Bugs of today's compilers: [KNOWN-BUGS.md](./KNOWN-BUGS.md).

Where this spec is silent, the product docs (`docs/router`, `docs/start`) decide, then the public types and options.
Today's implementation shows what is reachable, never what is intended.

Cross-cutting rules (the G rules of §3 refine them):

- **R1** Same runtime semantics, just placed in different modules.
- **R2** Each environment and chunk contains only what it needs (dead-code elimination is a means, not an end).
- **R3** No code runs twice, none is lost (module state is initialised once).
- **R4** Deterministic ids and output, consistent across server and client.
- **R5** Unsupported input gives a clear error, a warning or a safe non-transform; never silently wrong output.
- **R6** Source maps point to the user's code.
- **R7** Development-only additions never reach production.

Vocabulary. _Mode_: `dev` (dev server, watch) or `build` (production bundle). _Environment_ (env): `client` (browser
bundle), `ssr` (server env that renders pages and calls server functions directly), `provider` (server env or module
that Start loads to run a server-function handler by id; may be the same env as `ssr`), `rsc` (react-server env when
RSC is enabled; the provider env on Vite). "Server envs" = ssr, provider, rsc. _Bundler_: Vite (incl. Rolldown-Vite),
Rspack/Rsbuild, webpack (lower priority). _Framework_: React, Solid, Vue. _Split option_: one of `component`,
`errorComponent`, `pendingComponent`, `notFoundComponent`, `loader`. _File route module_: a module the generator
registered from the routes directory (or a virtual-route config) that exports `Route` from `createFileRoute`,
`createLazyFileRoute`, `createRootRoute` or `createRootRouteWithContext`.

---

## 1. Scope

### 1.1 In scope

Seven code-manipulation jobs, in every supported mode, env, bundler and framework (§1.3), plus the plugin wiring that
decides which modules each job sees and how its output reaches each bundler:

| Job                               | Owner package                                  | Goal                                                                                                                                                                   |
| --------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J1 Route file upkeep              | router-generator                               | keep `createFileRoute('/path')` / `createLazyFileRoute` and the import in sync with the file's location; generate the route tree (runtime + types); touch nothing else |
| J2 Route code splitting           | router-plugin (+ router-utils)                 | split options load lazily from separate chunks with identical behaviour; each chunk holds only what it needs                                                           |
| J3 Route HMR (dev only)           | router-plugin                                  | an edited route updates in place, keeps component identity; nothing of it in production                                                                                |
| J4 Start environment separation   | start-plugin-core (start-compiler)             | server code never reaches the client; every env sees the behaviour the runtime contract promises                                                                       |
| J5 Deferred hydration `<Hydrate>` | start-plugin-core (+ react/solid-start-client) | children move to a lazy chunk on the client; `fallback` leaves the server; hydration identities agree                                                                  |
| J6 Import protection              | start-plugin-core                              | cross-environment imports are reported where they survive compilation; mock in dev, error in build                                                                     |
| J7 RSC CSS injection              | react-start-rsc                                | CSS of server-rendered components reaches the client with the RSC payload                                                                                              |

Wiring in scope: which modules the router-plugin compilers process (file routes only); Start's per-environment
settings for the router plugin (`deleteNodes: ['ssr','server','headers']` and `addHmr: true` on the client,
`addHmr: false` on the server; Start always enables the splitter and does not expose `autoCodeSplitting`, J2.21);
client route-tree pruning of server-only subtrees; how each bundler resolves virtual modules (split chunks, Hydrate
chunks, mock modules, server-fn provider modules); and the order of the compilers on one module (they compose, G11).

### 1.2 Out of scope

- Prerender discovery and SPA-mode prerendering (`TSS_PRERENDABLE_PATHS`, `pages`, `prerender.*`, `spa.*`). Only
  J1.9 survives: never skip a route because a route-option key was missed.
- Dev-server middleware, request handling, the SSR runtime, serialization, manifest serving, Start's preview
  server, routing of a custom server-function id that contains `/`: runtime, not code manipulation.
- Debug and perf plumbing (`TSR_VITE_DEBUG`, timing logs). No compile-speed benchmark is part of the suite.
- Code-based routing for the router-plugin compilers: `createRoute`/`createLazyRoute` modules are split by hand with
  `.lazy()`; the splitter and route HMR never see them. The Start compiler (J4) still processes every module.
- Client source maps whose `sourcesContent` holds stripped server source: a known limitation, no test.
- Static server functions, ISR, sitemap, `inlineCss`, CDN asset URLs: no compiler step of their own.
- Router runtime semantics (matching, loaders, `ssr` inheritance): the compilers only preserve them (G1).
- esbuild: no work; the only requirement is J2.18.
- Unused exported router-generator helpers; `server.build.staticNodeEnv` on Rsbuild (C10).
- Runtime bugs. A pin's cause is in a compiler: the J1–J7 sources or their bundler integrations. The libraries a
  compiler is built on (the parser, printer, dead-code elimination and bundler integration: Babel,
  babel-dead-code-elimination and unplugin before the Yuku rewrite) are its implementation choices, so their bugs
  count as compiler bugs. A bug caused by a runtime package (for example a hydration boundary in `react-start-client`)
  is out of scope.
- Exported compiler internals and raw factory exports (router-utils and Start-compiler helpers, unplugin factories,
  compiler extension callbacks, directive options): not user contracts, not tested.
- The generator's filesystem metadata policy (file mode/owner retention, `chown` failures).

### 1.3 Acceptance matrix

Router J1–J3: React, Solid and Vue on the Vite, Rspack/Rsbuild and webpack entries, in the modes that apply
(generation, dev, build); webpack is low priority. Start J4 and J6: Start's Vite and Rsbuild integrations and every
environment Start creates, including a separate provider environment where one is configured (RSC): Vite's `rsc`
environment, and on Rsbuild the `rsc` layer in which the split server-function provider modules compile with
`react-server` conditions; both take part in J4, J6 and J7. J5: React and Solid on those integrations (not Vue). J7:
React with RSC enabled under its documented prerequisites (React 19+, Vite 8+ or Rsbuild 2+). Disabled settings
(`autoCodeSplitting: false`, `addHmr: false`, `importProtection.enabled: false`, `rsc` off) are covered as well as
defaults, only for options the integration exposes, with every §2.2 exception. Bundler-decided dead-code elimination
is asserted on production output; HMR with the real dev tools (§8). No obligations for Start on webpack, `<Hydrate>`
on Vue, or environments Start did not create.

---

## 2. Supported inputs

### 2.1 What a user can write

- **Language**: any valid TypeScript/TSX (and JS/JSX) module the bundler accepts: type-only imports and exports,
  `satisfies`, non-null assertions, `as` casts, decorators (including `export @dec class`), class fields,
  `import … with { type: 'json' }` and the deprecated `assert` form, JSX pragmas (`@jsx`, `@jsxFrag`, `@jsxRuntime`,
  `@jsxImportSource`), CRLF line endings, BOM-free UTF-8, file names with any character the OS allows (e.g.
  `what's-new.tsx`). `.js`/`.jsx` modules compile like `.ts`/`.tsx`. Non-JS modules that compile to JS before our
  transforms (`.vue`, `.mdx`) are inputs of J6. Other non-JS modules (CSS, JSON, Markdown, `?raw` text) are never
  transformed by the JS compilers, even when their text contains an API name such as `createServerFn(` (G1). A
  webpack-family request that disables the configured loaders (`!!./fns.ts`, `-!./fns.ts`) is a deliberate bypass
  like `?raw`: its module is not compiled (ruling of review round 3, F1); import protection judges what it loads.
- **Routing setups**: flat, directory and mixed file-based routing; virtual file routes (`virtualRouteConfig` as path
  or object, `physical()`, `__virtual.ts` subtrees); code-based routing (J4 only). One route per file route module,
  exported as `Route`. The file naming conventions of `routing/file-naming-conventions.md` with configurable
  `indexToken`/`routeToken` (string or regex), `routeFilePrefix`, `routeFileIgnorePrefix`, `routeFileIgnorePattern`.
  `.lazy.tsx` files with `createLazyFileRoute` holding only the four component options. Vue component pieces
  (`x.component.vue`, `route.component.vue`, loaded as the SFC default export) are generator inputs; `x.lazy.vue` is a
  lazily loaded `component` piece (J1.17).
- **Route options**: the five split options as identifiers, inline functions or arrows, method shorthand
  (`component() {…}`), string-literal keys, wrapped identifiers (`X as any`, `memo(X)`, `withAuth(X)`), imported
  bindings; `codeSplitGroupings` per route; `ssr`, `server`, `headers`, `head`, `scripts`, `beforeLoad`, `loader`,
  `validateSearch`, `staticData`, etc. Spread and computed keys are best effort (J2.9, J1.9). `shellComponent` exists
  only on the root route.
- **Start APIs** (`@tanstack/<react|solid|vue>-start`): `createServerFn(opts?)` with `.middleware([...])`,
  `.validator(fn|schema)`, `.handler(fn)`; `createMiddleware({ type: 'request' | 'function' })` with `.middleware`,
  `.validator`, `.client`, `.server`; `createStart(...).createMiddleware`; `createIsomorphicFn().server(fn).client(fn)`
  in either order, partial or empty; `createServerOnlyFn(fn)`, `createClientOnlyFn(fn)`; `<ClientOnly fallback>` from
  the router package. These J4 builders may be reached through renamed imports, namespace imports, re-exports, user
  factories and wrappers in other modules, builders stored in variables, and functions that return builders (J4.5).
  `<Hydrate when prefetch split fallback onHydrated>` from `@tanstack/react-start` / `@tanstack/solid-start` has the
  narrower J5.1 contract. The RSC helpers `renderServerComponent`, `createCompositeComponent` and
  `renderToReadableStream` from `@tanstack/react-start/rsc` (React only) have the J7.2 contract.
- **Import-protection inputs**: `*.server.*` / `*.client.*` file names, the `/server-only` and `/client-only` marker
  imports, every option of `ImportProtectionOptions` (`start-plugin-core/src/schema.ts`), including `mockAccess`.
- **Bundlers and frameworks**: §1.3.
- **Modes**: dev (Vite dev server incl. full-bundle mode, Rsbuild dev, webpack dev) and build, for each env the
  bundler or Start creates.
- **Plugin options**: all of `router-plugin/src/core/config.ts` (`autoCodeSplitting`, `codeSplittingOptions.{
splitBehavior, defaultBehavior, deleteNodes, addHmr }`, `plugin.vite.environmentName`), all of
  `router-generator/src/config.ts`, and `tanstackStart({ router, serverFns.generateFunctionId, importProtection, rsc,
srcDirectory, … })`. Which clauses a switch turns on or off: J2.21, J3.7, J6.3, J7.1.

### 2.2 Unsupported or undefined inputs

| Input                                                                                                                                                                 | Status                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| A second route object in a file route module (`export const extra = createRoute(...)`)                                                                                | unsupported; no HMR or split requirement                                                                                                |
| Two `createFileRoute` calls in one module                                                                                                                             | unsupported; must never fail silently (J2.11)                                                                                           |
| A route created inside a function of the same file (`function make() { return createFileRoute(...) }`)                                                                | unsupported but user-fixable: correct split, or unsplit plus a warning naming the file (J2.10)                                          |
| Compiling Start output a second time (plugin registered twice, a dependency shipping Start-compiled output)                                                           | unsupported; even an internal error is fine; no test                                                                                    |
| The router plugin registered more than once in one app                                                                                                                | unsupported; no test                                                                                                                    |
| Import protection in environments the user adds outside Start                                                                                                         | undefined; no test; "left alone" if a choice is ever forced                                                                             |
| `renderToReadableStream(x, options)` and plain-data models `{ card: <Card /> }` (type errors under the default types)                                                 | must not break: the call works and its arguments reach the runtime unchanged; CSS injection and warnings neither required nor forbidden |
| `createFileRoute('/')(makeOptions(...))` (factory-built options)                                                                                                      | as J2.8 says (Start: builds and warns)                                                                                                  |
| Dynamic `import()` of a server-function module                                                                                                                        | discouraged by the docs; the compiled module must still be correct (J4.7)                                                               |
| `const Deferred = Hydrate` then `<Deferred>`; `<Hydrate>` behind a plain wrapper component                                                                            | not analysed for splitting; still defers hydration at runtime                                                                           |
| Dynamic `split={shouldSplit}` on `<Hydrate>`                                                                                                                          | treated as split                                                                                                                        |
| Function-as-children, hook calls directly in extracted JSX (React), `this`/`super` captures inside `<Hydrate>` **without** `split={false}`                            | rejected with a clear error naming the fix (J5.5)                                                                                       |
| The same patterns **with** literal `split={false}`                                                                                                                    | not extracted, not rejected; runtime behaviour as the framework defines it (C8)                                                         |
| esbuild with `autoCodeSplitting`                                                                                                                                      | works or refuses clearly (J2.18)                                                                                                        |
| A standalone route-group-named file (`routes/(group).tsx`; route groups are documented as directories)                                                                | never fail silently: correct routing, a safe non-transform with an actionable diagnostic, or an error                                   |
| Unknown `%%tag%%` in a custom scaffolding template                                                                                                                    | becomes an empty string; no test                                                                                                        |
| Big-endian or `--jitless` hosts for a native parser                                                                                                                   | not a compiler requirement                                                                                                              |
| `.inputValidator()` on server functions and middleware (release-candidate name, removed in 1.169)                                                                     | type-invalid input (§8); no requirement, no test (OQ15)                                                                                 |
| A dependency that contains Start API calls but does not declare Start (J4.16) and is not included                                                                     | compiled where its text names a Start API, its modules summarised on demand; warned once per package (J4.16)                            |
| A Start factory imported from an implementation module of a Start package (a deep path its `exports` do not expose)                                                   | not reachable; no requirement                                                                                                           |
| A CommonJS dependency using sloppy-mode forms that break the app without Start too (a legacy octal escape, a `with` statement)                                        | no requirement                                                                                                                          |
| A route made by an app's own helper (`createAppRoute = createFileRoute` in another module), a `Route` re-exported into a route file, `Route.update({ server })`       | out of scope (R130, R92): not split, `server` not removed, no diagnostic; no test                                                       |
| A file the generator does not list that exports a router-made `Route`                                                                                                 | served as written (R145): not split, `server` not removed, nothing reported                                                             |
| A pattern import of a denied file (`import.meta.glob`, a template-literal `import()`, `require.context` / `import.meta.webpackContext`)                               | not covered by import protection (R142, J6.7); importers that disagree fail the build (J6.11)                                           |
| `require()`, `import()` or `import.meta.glob` of a Start builder or factory; imports or code another plugin's transform adds                                          | neither followed nor refused (R92, R118, J4.5); no test                                                                                 |
| A second `.handler()` or `.validator()` on a finished server function, a second `.server()` on a finished middleware, a second argument to `.handler()` (type errors) | out of scope (R105, R131): no refusal, its code can ship to the client; no test                                                         |
| A Start API call or an import-protection marker in a virtual module                                                                                                   | unsupported (R36); self-marked or mutually importing virtual modules fail a Vite build naming them (R117)                               |
| A binary file with a JS extension inside the app                                                                                                                      | unsupported (R141): the parse error, no hint; our loaders never alter it                                                                |
| Route files under `node_modules`, standalone router plugin (no Start)                                                                                                 | unsupported (R141): not split; webpack-family builds warn once per file; under Start they are compiled (J4.16)                          |
| A dev server under a `NODE_ENV` other than `development`                                                                                                              | unsupported, not handled; no test                                                                                                       |
| The router plugin on Rsbuild 1.x                                                                                                                                      | no fallback for the dev freshness mechanisms that need Rspack 2 (idle wake, rebuild callbacks, `experiments.cache`); no test            |

---

## 3. Cross-cutting rules (G)

- **G1 Semantics are preserved.** In every env the compiled program behaves as the source program would in that env
  under the documented runtime contract: same rendered output, loader and handler results, thrown errors, `Route`
  object, and exports an importer sees. When top-level code runs follows G3. Every
  emitted module parses and evaluates (no new free names outside dead code, G8). (R1)
- **G2 Only what is needed ships to each environment and chunk.** Code an env or chunk cannot execute is absent:
  server-only code in the client (hard, J4.12), split options in the route module (J2.5), code a chunk does not need
  (J2.5), modules imported only for types (J2.5). Compiler-level tests assert what the compiler alone decides
  (including what the split modules it emits contain, J2.5); final chunk and bundle contents are asserted on builds,
  per bundler, with `sideEffects` and `@__PURE__` hints varied. (R2)
- **G3 Surviving code runs once per environment, never duplicated or lost; when it runs follows the code that needs
  it.** After the documented removals (server-only code on the client, J4; client-only code on the server, J4.11;
  type-only imports, J2.5; `deleteNodes`, J2.14), everything at the top level of a module exists once per environment.
  Where it goes is one placement: route files as J2.0 says, server-function handler modules as J4.2 (R157),
  `<Hydrate>` chunks as J5.2, erasure only as J4. Top-level statements stay in the module (R154): they run once, when
  it loads, in source order; a chunk copies what J2.0 and J5.2 say it copies, as `main` does. Shared module state
  initialises once when evaluated, and every consumer sees the same value and instance (J2.4). Printed
  statement and import order is free. How to check: an initializer counter plus real consumers detects duplication and
  inconsistent values; a load marker detects where a statement or a declaration landed; an order between effects of
  different outputs is not a valid check, nor is a single total source-order trace; tests must not force an
  unrequested lazy module to load. (R3)
- **G4 Determinism.** The same source, configuration, mode and environment give the same observable output (ids,
  module graph shape, warnings), whatever the scan, request or processing order. Within one build or dev session,
  callers and providers agree on protocol ids, and server and client hydration identities agree (J5.4). Production
  server-function ids follow J4.4; dev may use implementation-specific locators, and ids need not match between
  modes. Path-bearing configuration (`importRoutesUsingAbsolutePaths`, a cwd-relative `tmpDir`) and custom
  generators (`generateFunctionId`) may depend on their resolved inputs. A relocated project must still compile,
  behave and agree on ids within each build; equal opaque ids between the original and the relocated build are not
  required. Route ids and paths follow the routing conventions (J1.4, J1.5), which makes the route tree independent
  of cwd and OS path separators. (R4)
- **G5 Diagnostics: never fail silently.** Unsupported input yields an error, a warning or a safe non-transform,
  never silently wrong output. When a user-fixable pattern prevents the intended transform, the user is told once per
  file, naming the file, in every mode. When the obstacle is our own limitation, that is a bug to fix (a goal pin),
  not a warning to document. Errors about the user's source name the file and a position in it; configuration and
  resolution errors need no source position. A diagnostic is checked only for being reported on a channel the user
  sees, the file it names and, where required, its position (`line:column`, or the line), and its severity where the
  clause gives one; never its wording, the API or option it names, the cause it gives or its code frame (§5.7). "Warn"
  means at least a warning (an error where the clause allows refusal); an info or log line does not count. A clause
  that says "warn" and allows no refusal asks for a warning; an option that asks for a severity (`mockAccess: 'warn'`)
  is checked at that severity. "The build fails" means it fails. Route splitting (R153): a shape main cannot split
  stays unsplit without a warning (J2.8). An installed package's module (`node_modules`) is not the user's to edit: a
  warning whose only remedy is an edit of that module, with no server code reaching the client (a parameter read
  inside server code, an exported or `this`-using split option, a server compile's parse failure), is not reported for
  it, and its errors name the package. (R5)
- **G6 Source maps.** Every emitted module derived from user source (route modules, split chunks, Start client, ssr
  and provider output, Hydrate chunks, rewritten import-protection modules) carries a map, so stack traces and
  import-protection reports resolve to the user's original line and column, through composed maps when other plugins
  transformed the file first. Purely generated support code (registries, mock helpers) needs no mapping. The emitted
  map holds the user's file as written (`sourcesContent`), so a debugger shows it, unless the configuration leaves
  sources out (`nosources-*`). Every output of a file names it by its path, without the compiler's query (R135), so a
  debugger and an error tracker see one file; map layout is otherwise free. This holds in dev as in build: the dev
  server serves maps for the route module and every derived module (split chunk, shared module, Start client and
  provider module). (R6)
- **G7 Nothing dev-only in production.** Production artifacts contain no additions whose purpose is only
  development: HMR accept/dispose code, hot-data wrappers, dev-only warnings, development mock modules, `console`
  diagnostics gated for development. Configured production behaviour stays: a production `importProtection.behavior:
'mock'` and its `mockAccess` diagnostics. Build-time console output is allowed when required or configured:
  not-split warnings (J2.8), import-protection reports, generator logs unless `disableLogging` (J1.12). G7 is about
  purpose, not spelling: tests identify dev-only support by comparing with a real build where the feature is off,
  and do not ban every workspace path or success log (only J4.4 forbids path leaks, in default server-function
  ids). (R7)
- **G8 Dead code may dangle.** A compiled module may reference an undefined name inside code that never runs, if
  every supported bundler deletes that code in the production build. A dangling name that survives into a
  production client bundle is a bug. The check uses real bundler tree-shaking, on the artifact actually emitted under
  its effective settings (an unminified build is checked unminified). A real global of the target environment
  (`window`, `name`, `status`, …) is not dangling, nor is a name the module itself checks with `typeof` (another
  module's check does not excuse an unguarded read). The check covers exactly the modules the compilers under test
  produced or changed: user and route modules after our transforms, split chunks, virtual and support modules, and
  dependency modules our plugins transformed. Inside that scope every free name counts, unless the module's
  original source already reads it free. What a bundler does inside modules no compiler touched is out of scope.
  (A compiler that drops a local whose name is also a global is not caught by this check.) A leftover import of a
  module the environment cannot or must not load is not such dead code (G16).
- **G9 Exported bindings: one instance, free export lists, black-box names.** Every export something actually
  imports (another module, a test file, another route) keeps working with the same value and instance the owning
  module uses; the export list may otherwise grow or shrink. Generated identifier names, virtual-module ids and query
  strings are not contracts. Tests check exports through a real importer, never on the export list.
- **G10 Hot updates over reloads.** Where a hot update is feasible, dev edits must not full-reload (client or
  server); tests may require "no full reload" there and never require a full reload. Which in-memory state survives
  is the bundler's business.
- **G11 Compilers compose.** When several jobs touch one module (Start compiler, splitter, Hydrate, RSC CSS, route
  HMR, import-protection rewrite), every clause holds on the final output, in every order the wiring may apply them.
  For a user plugin order the docs do not support (e.g. a JSX plugin before the router plugin), a correct result or
  an actionable order diagnostic are both fine. Module identity follows the environment's resolver and loader:
  dependency discovery and generated virtual modules resolve through the host (aliases, conditional exports,
  symlinked packages); module identities that behave differently (meaningful queries or virtual ids, a package's
  `react-server` versus default export) are never conflated, identical ones may be shared. The documented alias
  setups (`resolve.tsconfigPaths` on Vite, tsconfig `paths` on Rsbuild) compose with every job; a third-party
  resolver plugin such as vite-tsconfig-paths is a user plugin, and a silent import-protection bypass through it is
  not a correct result.
- **G12 Printing fidelity.** Code the compiler does not own is reproduced with identical semantics: directives,
  pragmas (their effective JSX-runtime decision, J2.16), comments where feasible, parentheses required by
  precedence, string escapes. Each user directive is kept; an added directive without effect is not forbidden.
  License comments (`/*!`, `@license`, `@preserve`) stay in the source module when the splitter moves or removes the
  code below them; other orphaned comments are free. Where the Start compiler (handler extraction, environment
  functions, Hydrate extraction) and the import-protection rewrite put license comments is free (OQ12). Upstream
  printer bugs that change meaning are our bugs. (R1)
- **G13 Mode parity.** Each mode preserves the behaviour its effective configuration and the runtime contract
  require; equivalent settings give equivalent application semantics, apart from documented mode differences.
  Import-protection mock/error policy (J6.3), diagnostics, HMR, dev id representation (J4.4) and which server
  functions answer an HTTP call by id (J4.2) may differ as configured or documented. For the same configuration,
  which options are split, how they are grouped and which options `deleteNodes` removes are the same in dev and build.
- **G14 Idempotence is not required** (§2.2, recompiling output).
- **G15 Recognition is by binding identity, not spelling.** Every compiler recognises its APIs by the lexical binding
  and its module provenance (an import from the TanStack package, through the alias, re-export and factory forms
  each job supports). A locally declared or shadowed `createServerFn`/`Hydrate`/`createFileRoute`, the same name
  exported by an unrelated package, and unrelated `.handler()`/`.server()`/`.client()`/`.validator()` methods are
  left untouched; generated names never collide with user bindings. Exception for route-file upkeep: the generator
  may repair the designated `Route` declaration's missing factory import (J1.1) without existing import provenance;
  this does not allow rewriting unrelated or shadowed user bindings.
- **G16 Removed code takes what only it used.** Whatever a transform removes from a module (a handler, validator or
  `.server()` on the client; a client-only implementation or `<ClientOnly>` children on the server; a split option;
  a `deleteNodes` option; `<Hydrate>` children) takes with it, in that module, every declaration and import only the
  removed code used, before the bundler sees the module, in dev and build. This holds through any shape: chains,
  fan-in (diamonds), cycles (mutual recursion, a class and a const that read each other), destructuring,
  re-assignment, objects and arrays that hold a binding, closures and factory calls, default parameters, namespace
  members, top-level `await`. It never removes what kept code reads (also through `typeof`, JSX, a shorthand
  property or `export { a as b }`), never a top-level statement that is not a declaration (`x.p = v`, `x.push(v)`,
  `x = v`: what it names is used by kept code), and never code that was already dead before the transform (a use in
  a type is a use for this; route files: J2.0, where splitting removes no class, enum or namespace). It is per module: a
  neutral module whose export only removed code uses is the user's (J4.12). A leftover import of a server-only or
  unresolvable module on the client, or of a client-only module on the server, is not dead code that may dangle
  (G8): it never reaches the bundler, so no browser stub, externalization warning or polyfill stands in for it.
  The contract, at every level (a function's locals, a pattern's leaves, a namespace's members, the module's top
  level), for code the environment keeps:
  - a removed definition takes its own evaluation with it and nothing else: an initialiser's call, a removed name's
    property read, a removed default's effect, a removed class's decorators and static blocks;
  - a declaration that reads its own binding before the binding has its value (`const x = x`, a default of the
    pattern around the binding, a function written as the callee of a call or `new` there) throws in the source: it
    stays, with what it reads (implicit calls are not followed: KNOWN-BUGS, "Self-reads are followed through code
    that runs on the spot only");
  - a rest element is code of its own (it copies or drains): it keeps its declarator; a plain name nobody reads leaves
    with the declarator whose other names only removed code read;
  - a pattern that stays loses its dead positions; one that cannot leave (beside a rest element that stays, a
    parameter) is emptied to `{}` or holes, and a default it had becomes `{}` or `[]`; a parameter that is a name keeps
    its place, and a default of it that reads or calls anything becomes `void 0` (`length` is unchanged);
  - along text no output holds (erased text, a type export) a type declaration is a name: what an alias, an
    interface, a namespace of types or a `declare` of a value names was used. A reference names the declarations of
    its own space (TypeScript's value, type and namespace spaces), so a value and a type of one name are two uses.
    No output holds more declarators that bind nothing than the source (`var {} = f()`).

---

## 4. Per-job clauses

### J1 Route file upkeep (router-generator)

- **J1.1** When a route file's location (or the virtual config) implies a route path, the string literal in
  `createFileRoute('…')` / `createLazyFileRoute('…')` is inserted or rewritten to that path, and the factory import is
  added from the target framework's router package if missing. Root files use `createRootRoute*` without a path.
  Modes: dev (watch) and the `generate` command. When the argument is not a string literal (an identifier, a
  template literal), replacing it with the correct literal and an actionable diagnostic naming the file are both
  acceptable.
- **J1.2** Nothing else in the file changes: other statements, comments, formatting, line endings and encoding are
  byte-preserved outside the edited literal and the import statements. Newly scaffolded files follow `quoteStyle`
  and `semicolons`; within the edited argument the quote character is free. How the generator adds, moves or drops
  the factory's binding is free: it may write a new import or edit, merge, split, reorder or reprint any import
  statement, with no limit on how many change, as long as every other binding keeps its imported and local name,
  source module, type/value meaning and import attributes, and every side-effect import stays. Keeping or removing a
  factory import the edit made unused (e.g. `createFileRoute` after a switch to `createLazyFileRoute`) are both
  allowed. Filesystem metadata is out of scope (§1.2).
- **J1.3** An empty route file is scaffolded from the default template or `customScaffolding.{routeTemplate,
lazyRouteTemplate}`; `.lazy.tsx`/`.lazy.ts` files get the lazy template. A `.lazy.vue` piece is an SFC and gets no
  TypeScript route scaffold (J1.17).
- **J1.4** The generated route tree contains exactly the routes the conventions and options select (prefix and
  ignore options, tokens, `(group)` folders, `[x]` escaping, `-` prefix exclusion, `_` pathless, `_` suffix
  un-nesting, `$` params, `$` splat, `__virtual.ts`, `physical()`), plus the virtual anchor routes the docs promise
  for deleted or lazy-only route files (`guide/code-splitting.md`), with the paths of the docs' tables, the right
  parent links and lazy/piece attachments. It honours `disableTypes`, `addExtensions`,
  `importRoutesUsingAbsolutePaths`, `routeTreeFileHeader/Footer`, `enableRouteTreeFormatting`, `quoteStyle` and
  `semicolons` (the docs promise a tree "formatted with the quote style you specify"). Tests assert hierarchy, ids,
  paths, parent links and what an importing router sees, not the emitted text.
- **J1.5** The route tree is deterministic (G4): independent of directory scan order, cwd (except outputs that are
  cwd-relative by configuration), OS path separators and process.
- **J1.6** Writes are atomic (temp file in `tmpDir`, then rename; beside the destination when `tmpDir` is on another
  device, J1.16); the generator never leaves a route file or the tree half-written. Every supported file name
  (§2.1, including apostrophes and other quote characters) gives a valid tree: specifiers, ids and paths are escaped
  as needed. A clear error naming the file is acceptable only for a name the conventions do not support. A symlinked
  route file keeps its link and the file it names gets the upkeep, unless that file is another route file of the tree
  or another one links to it too: one file holds one route, so the link becomes a file of its own (as on `main`), and
  the router loads both routes. The route tree is a file of its own (as on `main`): its imports are relative to the
  configured path, so a link there is replaced. Start's server manifest gives a symlinked route the assets of its chunks, which
  bundlers name by the real path (the document links the route's stylesheet).
- **J1.7** Conflicting route paths give an error naming the conflicting files (absolute or project-relative,
  unambiguous, §5.7). Only genuinely conflicting routes: one route mounted through an empty-prefix `physical('',
dir)` is not a conflict by itself.
- **J1.8** A route's URL path depends on its placement (directory, dots, pathless `_` segments), never on which
  companion files exist: a pathless layout present only as `_auth.lazy.tsx` (or only as a Vue component piece) still
  prefixes its children with the enclosing directory path, as `_auth.tsx` would.
- **J1.9** The props the generator records from a `createFileRoute` call (to prune server-only routes and discover
  prerenderable paths) are best effort for spread and computed keys, with a safe fallback: a route is never pruned
  from the client tree, and never skipped for prerendering, because a key was missed.
- **J1.10** In dev, adding, removing or changing a route file regenerates the tree and the live app reflects it (a
  reload is fine here; G10 does not apply to tree changes); no delivered edit is missed. How changes are detected
  is free. Generation settles: one edit leads to a bounded number of regenerations, never a regeneration or reload
  loop, and closing the dev server or watch session stops its watching. Edits of the `virtualRouteConfig` file (path
  form), of `__virtual.ts` files and of route files under `physical()` mounts are delivered edits like route files
  (modules the virtual config imports: OQ17c; a native JavaScript config, `.js`/`.mjs`/`.cjs`, keeps its first
  evaluation for the process: Node's module cache, through jiti 2.7.0). A `tsr.config.json` edit may take effect only at the next route file
  event. How unchanged writes are suppressed is free.
- **J1.11** Withdrawn (the option was removed from the product, #8737). The id stays unused.
- **J1.12** Honour `disableLogging` for the route-generation logs it controls. This does not forbid warnings or
  errors G5 allows or requires (e.g. a non-route file under the routes directory that exports no `Route`: warn,
  explain the exclusion options, leave it out), and does not fix a console transcript: no success message and no
  warning about unusual but valid param names is required.
- **J1.13 Types describe the runtime tree.** With types on, the generated type linkages (route ids, full paths,
  parent/child relations, params) agree with the runtime tree of the same file, including virtual anchors and
  pathless layouts under directories; with `disableTypes` the documented JavaScript tree is emitted. The tree carries
  file route types router-core infers: `InferFileRouteTypes<typeof routeTree>` is not `never` and has the tree's
  full paths, `to` and ids. The names of the generated file's own types (`FileRouteTypes`, `FileRoutesByTo`, …) are
  free (§5.1).
- **J1.14 Pathless layout under a lazy-only route.** When a route exists only as a lazy file (`posts.lazy.tsx`, no
  `posts.tsx`) and a pathless layout with children sits in its directory (`posts/_layout.tsx`), the lazy-only
  route's virtual anchor is the layout's parent: `_layout` nests under `/posts` and its children's paths follow.
  Attaching the layout to the next real ancestor is a bug. (J1.8 is about the enclosing path regardless of companion
  files.)
- **J1.15 Childless pathless layout.** A pathless layout without children (`routes/_auth.tsx` next to
  `routes/index.tsx`) is a valid route: the tree contains `/` and the `_auth` layout, and no error is raised; the
  same for `_auth.lazy.tsx`. J1.7 still applies to real conflicts.
- **J1.16 `tmpDir` on another device.** When `tmpDir` is on another filesystem than the destination (rename fails
  with EXDEV), the generator still publishes atomically: it writes a temp file beside the destination and renames it
  there. Copy-then-unlink is not acceptable (a reader can see partial content); demanding the same device is not the
  chosen behaviour.
- **J1.17 `.lazy.vue` is a lazily loaded component piece.** `x.lazy.vue` next to `x.vue`/`x.tsx` supplies route `x`'s
  `component` lazily from the SFC default export; it is not a lazy route module, except next to an `x.component.vue`
  piece, which is then the component, the `.lazy.vue` file (`x.lazy.vue`, `x/lazy.vue`) being the route's lazy route
  (its default export). An empty `.lazy.vue` is not scaffolded with TypeScript route code. J1.8 and G5 hold throughout.

### J2 Route code splitting (router-plugin)

- **J2.0 What splitting does (R153).** Route splitting does what main's splitter does, by its outcome: wherever
  main's output builds and runs correctly, ours does too, with the same runtime behaviour (the same options split or
  more, one instance where main has one, top-level code run once where main runs it once); where main's output is
  broken (spec-main-splitting.md §1.8, §1.11, §1.12) any working behaviour is fine. Concretely: the route module
  loses only what the split made unused (the R153 amendment): a declaration or import specifier the source used, by
  value or in a type, from text the module no longer holds leaves it with its initialiser when nothing that stays
  reads it by value. Top-level statements, exports, enums and namespaces (R154), code already unused and what they
  reach stay, and so does every class, enum and namespace declaration, whatever names it (by value or in a type, in
  split or kept text), with what it reads (R163: main never removes one, so its body runs when the route module
  loads), unless it is a name main shares; only erasure removes one (`deleteNodes`, Start's environment erasure, a
  handler module's or `<Hydrate>` chunk's claim), when such text reads it by value, or erased text names it in a
  type, and no split chunk reads it by value. An import nothing in the source references (a bare or CSS one included) moves to the shared
  module when the route module imports it, in source order; chunks and Start's derived outputs load after the route
  module and repeat none (React's classic JSX runtime is not supported with splitting). A declaration already unused (`const unused = register('x')`) stays in the route module only
  and runs once, where main's chunks run it again (better than main, by decision). A split chunk takes what its
  option value reads: what the route module also keeps it imports from it where main imports it (`Route`, what
  `export const|let|var` declares) and copies otherwise, with the top-level code reaching what it copies through the
  names it references (every statement, class, enum, namespace and declaration no other declaration or statement of
  the source reads by value whose names reach it, transitively)
  (main's second instance, §1.8), also what another chunk copies. The names main shares (two option groups read
  them, a staying option counting as one; none reading `Route`) and nothing else are one shared module per file
  (`?tsr-split=shared---<keys>`), as main's `?tsr-shared=1`: the route module and the chunks import them, the route
  module re-exports the exported ones (one code outside the set assigns is placed like any declaration). Option values main cannot compile into a chunk stay in the route module, silently
  (`splitOnMain`, main's `compileCodeSplitVirtualRoute` cases); so does one whose chunk would assign a binding it
  imports (`assignsWhatItImports`: a shared `let`, an `export let`). Improvements over main wait until after #8817.
- **J2.1 Which modules.** Only file route modules, and in them only the `createFileRoute` / `createRootRoute` /
  `createRootRouteWithContext` call bound to `Route`. `createLazyFileRoute` modules are not split further (they are
  already lazy); non-route modules and code-based routes are returned unchanged. Vite, Rsbuild/Rspack, webpack;
  React, Solid, Vue.
- **J2.2 Which options and groupings.** Only `component`, `errorComponent`, `pendingComponent`, `notFoundComponent`
  and `loader` are split. Precedence: `codeSplitGroupings` in the file > `splitBehavior({ routeId })` >
  `defaultBehavior` > the default `[['component'],['errorComponent'],['notFoundComponent']]`; a property appears in at
  most one group. A `codeSplitGroupings` accessor isn't read (the next source applies, as on main), and nothing reads
  the file's groupings where nothing is split (`autoCodeSplitting: false`). Options in one group load as one unit; different groups stay independently lazy (§5.3). Two options
  load as one unit when, once one loaded, loading the other fetches no new module holding user code (no file of the
  app, no compiled module other than one that only imports and re-exports). A small forwarding module per option
  over the group's module is acceptable (not ideal: bytes).
- **J2.3 Behaviour identical.** A split route renders, errors, pends, not-founds and loads exactly as the unsplit
  route (when its file's top-level code runs: G3); everything not configured for splitting (path parsing, search validation, `beforeLoad`, context, `head`,
  `scripts`, `staticData`, `ssr`, `server`, `headers`, …) stays eager in the route module.
- **J2.4 One instance.** Shared identity, state and once-only effects hold across the route, its importers and its
  chunks wherever main keeps one instance (J2.0): `Route`, what `export const|let|var` declares (a chunk reading it
  imports it from the route module), and a value two options read (two split groups, or a staying option and a
  split one: one instance, in the shared module both import). Where main
  copies (another export form, a value only route-file code outside the options also reads, a class, an enum: §1.8),
  a chunk holds its own copy. A split option whose code would assign a binding another chunk copies too (`count++`
  in the loader, `count` read by the split component) stays in the route module: one instance, as unsplit. Prove
  identity through real consumers and effects, not declaration counts.
- **J2.5 Each chunk holds only what it needs.** The split option's code (and bindings only it uses) is absent from
  the route module; a declaration the source never read that runs nothing (`function Unused() { return <Page /> }`)
  is dropped and keeps nothing there. An import used only for types is dropped, so its module never loads in the client for that
  reason, with or without `verbatimModuleSyntax`. A compiler-emitted split module carries no unrelated source
  declarations or dependencies its group does not need ("needed" includes the group's transitive dependencies,
  required effects and compiler/runtime support). Compiler-level checks may prove a particular unrelated declaration
  or dependency absent (also as a count of zero, when the check finds the unwanted code independently of generated
  names and formatting); they may not fix the total number of declarations, a textual shape, or one valid placement
  of shared code. So: an unused, unrelated exported class copied into a component chunk fails even if never called;
  an extra helper the component needs does not fail; a dependency another legitimate consumer needs is not an
  unused copy. Final bundle contents are also checked per bundler, on production output with side-effect hints
  varied. Unused code is judged after the bundler's production tree-shaking: it must be gone from the production
  bundle (checked by value reads and user markers); an unused import specifier or unreferenced declaration in an
  emitted module is free (§5.9). Goals, not gates: a split chunk holds only what its option uses, and options read
  shared pieces directly from a shared module rather than through forwarding modules.
- **J2.6 Lazy loading contract.** Split options load on demand under the router's public lazy contract: split
  components are preloadable before render (the route's `component.preload()`, so intent preloading works) and render
  afterwards; split loaders run on demand with the same result. Emitting `lazyRouteComponent`/`lazyFn` or an
  equivalent is free; tests observe laziness through the real router (preload, render, loader call) and the modules
  actually requested, never by recognising a helper, and do not require one directly imported target per group
  (§5.3, §5.8).
- **J2.7 Root route.** Root routes are not split (R60): the root's `component`, `errorComponent` and
  `notFoundComponent` load with the root route module (C1). Splitting them cost server time on error and not-found
  renders, and their chunks were preloaded on every page anyway.
- **J2.8 Not split → never broken.** The options main splits are split (J2.0). An option whose value is a binding
  the route file exports by its declaration (`export function`, `export const|let|var`, `export default function`,
  `export default <name>`) stays in the route module, and the run warns once naming the file (main's warning). A value
  main cannot compile into a chunk (a member access, `satisfies`, `!`, a class, a namespace member, a global, an array
  pattern, a sequence, a call holding JSX or TypeScript syntax, an object) stays in the route module silently, working.
  Options the compiler cannot read statically (an options object imported from another module, factory-built options)
  are not split. Under Start, the client build never ships their `ssr`/`server`/`headers` silently: a spread,
  options from a call or an import, written to after their declaration or whose object (or a `const` naming it) other
  code also names, and a computed key build and warn once, saying what isn't split or removed, that server code in it
  ships, and what to write instead (J2.14, J4.12). The server code they hold is the user's responsibility. What
  provably holds none of them doesn't warn: a spread of a module object literal of static keys that only it reads, a
  computed key naming a module string const. Options that can't be read at all may be one object shared across
  evaluations, which the route adopts: an edit of the route file reloads the page.
- **J2.9 Other shapes.** A method-shorthand option (`loader() {…}`, `async`, generator) is split as the function
  expression with its body would be (#8623). A function expression or method whose own `this` or `super` its body uses
  (its arrow functions included; not a nested non-arrow function, method, class field initialiser or static block)
  stays in the route module as written, and the build warns once at the property, naming the fix (#8688). Accessors,
  spreads and computed option keys stay in the route module as written, as on main (J1.9). Initialiser timing of shared bindings is free: run once, same value
  everywhere.
- **J2.10 Same-file route factory** (§2.2). A correct split (renders, hot-updates), or unsplit plus a warning naming
  the file, in every mode; crashes or rendering the wrong component are bugs.
- **J2.11 Two `createFileRoute` calls in one module.** Never silently swap components: each renders its own, or the
  compiler warns or errors naming the file. A second call of the route's constructor (its binding, or the same member
  of the router's namespace, `Router.createFileRoute`, called directly) fails the build at that call, whatever its
  options hold (R172).
- **J2.12 Bindings the route module still reads stay declared.** Moving an option's declaration never removes an
  import or declaration another surviving statement (an exported wrapper, `head()`, an unsplit option, a top-level
  call) reads; the route module stays valid (G1, G8).
- **J2.13 Dev mode.** Splitting also happens in dev; virtual chunk modules resolve in every bundler's dev server;
  removing a split option the page had loaded does not break the page.
- **J2.14 `deleteNodes`.** Options named in `codeSplittingOptions.deleteNodes` and written as properties of the options
  are removed from that env's route module with the code only they use; Start sets `['ssr','server','headers']` on the
  client, so the `ssr` function, server handlers and `headers` never reach the client. One written after a spread or a
  computed key becomes `undefined` instead, keeping its place: it still wins over what they hold. What the compiler
  can't read isn't removed (J2.8).
- **J2.15 Client route tree pruning (Start).** Routes whose only `createFileRoute` prop is `server`, with only such
  descendants, are removed from the client route tree, on Vite and Rsbuild alike. Every route with a client-visible
  prop survives (an option of its `.lazy` file or piece included), and so does every ancestor a surviving route
  needs (including a server-only ancestor of a surviving child). Server and provider trees keep all routes and handlers. Unknown or spread-derived props never
  cause pruning (J1.9). An edit that gives a pruned route a client-visible prop reaches the client in development and
  watch builds, although no client module imports the route's file and the route tree file may not change (J1.10).
- **J2.16 JSX runtime.** A chunk compiles its JSX under the same runtime and pragma semantics as its source module:
  the project's real JSX transform selects the same runtime for the chunk as for the untouched file. For a
  non-leading pragma comment (`/** @jsxImportSource … */` after the imports), the compiler keeps the original file's
  effective decision: a pragma the transform ignores in the untouched file (Oxc and esbuild honour leading comments
  only; Babel any) must not become effective in a chunk. Warning and leaving the file unsplit is also acceptable
  (J2.8). Tests assert the rendered outcome only, compiling the untouched and the compiled module with the project's
  real JSX transform and defaults, never comment placement or the runtime import's spelling. In development, a chunk
  holding components carries the file's `@refresh` comments (solid-refresh's `granular`, `skip`, `reload`; React
  Refresh's `reset`), which the refresh plugins read per module, each by a rule of its own: its components refresh as
  the file asks. The comment does nothing else: its statement runs as often as without it, and a binding stays one
  (R153). A comment that also holds another pragma (a `@jsxImportSource` after the imports) means what it means in the
  file. Placements where the chunk differs are accepted limits (oracle KNOWN-BUGS.md).
- **J2.17 Deprecated `assert` attributes.** An import written with `assert` in a route module (`import data from
'./data.json' assert { type: 'json' }`) keeps working wherever it lands, and its attribute keeps its meaning where
  the bundler honours attributes. The printed keyword (`assert` or `with`) is free: no public host observes it.
- **J2.18 esbuild.** Either splitting works, or the plugin refuses clearly (an error). A warning on a successful
  unsplit build is not a refusal.
- **J2.19 Warning wording is free** (J2.8 fixes only the file); warnings print once per file per run.
- **J2.20 Hydrate inside a split component** keeps working: wherever the component's code lands (chunk or shared
  module), the boundary renders with every binding it needs and its child chunk loads (G11).
- **J2.21 When splitting applies.** J2.2–J2.20 apply to enabled, applicable transforms, with the §2.2 exceptions:
  standalone Router with `autoCodeSplitting: true` (default `false`; CLI-only generation never splits); Start always
  enables the splitter (§1.1). With splitting off, route modules reach the bundler unsplit, and J2.14 and J2.15 still
  apply where Start wires them.
- **J2.22 Route CSS loads with its route.** The CSS a route module imports (`import './users.css'`) loads only when
  that route matches, whether what is mounted is the component, the `errorComponent`, the `notFoundComponent`, the
  `pendingComponent`, or no component at all.

### J3 Route HMR (dev only)

- **J3.1 In-place update.** Editing a file route module in dev updates the live route on the running router without
  a full reload: non-component options (loader, beforeLoad, head, validateSearch, …) are replaced; matching and
  navigation use the new options (stale derived route state is invalidated); generated options (`id`, `path`,
  `getParentRoute`) stay on the live route; the active match re-renders. A hot edit runs each changed loader at
  least once and the page shows its new data; an obsolete loader the edit replaced or removed does not run again.
  Vite and Rsbuild/Rspack (webpack lower priority); React, Solid, Vue. A lazy route file (`createLazyFileRoute`,
  `.lazy.tsx`) is a file route module too: an edit of it reaches the live route's lazy options, also of a route that
  has not loaded them yet. An edit that removes a lazy option of a loaded route reloads the page, as `main` does on
  every lazy file edit. Which routers take an edit: J3.11.
- **J3.2 Component identity is kept for compatible edits.** For compatible hot updates, the router keeps its
  lazy-wrapper identity and lets the framework's refresh decide the component's (React; Solid and Vue keep a
  component their refresh patches in place), and shows the new code. Where
  the framework's refresh can keep the mounted component and its state, the compiler and router must not cause a
  remount or state reset. Compatibility is the real framework's refresh contract, not an unchanged name (React
  Refresh remounts class components, changed hook signatures and forced resets). Framework-required replacement is
  allowed. Adding sibling route options next to an inline component (e.g. a `pendingComponent` and an
  `errorComponent` before an inline `component`) may remount it: the edit must show in place, its state need not
  survive. Renames must display the new component (J3.3). A subtree replacement is not a full reload (G10). Test
  split and unsplit routes with real framework tooling (§8). So: a compatible body-only edit that loses state because
  the router recreated its wrapper fails; an edit the framework must remount does not fail for that remount. Keeping
  Solid and Vue split-component identity is a requirement, not best effort. Route HMR never changes when code runs
  (S2): React's registration of an unsplit higher-order component call (`component: withX(Page)`) runs it before the
  route statement only when everything that statement evaluates before the call is a literal (an object, array or
  template literal of such operands included), a function, an identifier or the router's own factory (`createFileRoute`
  with literal arguments, `createRootRoute`); otherwise the call stays in place and React Refresh gets no family for
  it (an edit may remount it, as on `main`).
- **J3.3 Every edit takes effect.** After an edit the page shows the new code: a new component body, a renamed
  component (a new Refresh family), a new split loader (even when only the chunk changed), an added or removed option
  (including a removed split option the page had loaded), with or without the framework's refresh plugin. A full
  reload is acceptable only for factory-built options (§2.2), and on Solid for a rename or a removed component in an
  unsplit route file (solid-refresh invalidates a module that lost a component), for a component that moves to
  another module (a `codeSplitGroupings` edit), and for one removed from a split chunk another component stays in
  (solid-refresh stops patching that chunk), and on Solid for the return of a deleted file a split component reads
  after its chunk failed to import (solid-refresh patches a module only in its own update on Vite): one reload, later
  edits in place. A component added or removed next to components that stay where they are shows in place. One save
  that changes a loader's data shape and the component reading it shows. After a render error, the edit that fixes it
  shows in place where a route boundary or a client-only root's boundary caught it; where the global boundary of a
  hydrated root replaced the document the framework cannot render again in place, the page reloads once (React: in
  the save; Solid and Vue: at the next route save, an accepted limit in oracle KNOWN-BUGS.md). So does a hydrated
  Solid root route without `shellComponent`, whose component renders the document: its own boundary (its
  `errorComponent`, or the router's `defaultErrorComponent`) replaced it.
- **J3.4 Correct target.** The update applies to the route whose id the current tree assigns, not to a stale id kept
  in hot data.
- **J3.5 Root route.** Root route edits, including adding, editing or removing `shellComponent`, hot-update.
- **J3.6 Start server side.** Editing a module only server-function handlers read does not full-reload the server;
  the next call runs the new handler. This also holds with RSC enabled (a separate provider): a route module that
  also defines a server function keeps receiving client route hot updates (J3.1–J3.3), and a handler edit takes
  effect on the next call, without a full reload where a hot update is feasible (G10).
- **J3.7 Nothing in production.** No `import.meta.hot`, `import.meta.webpackHot`, `module.hot` or hot-data wrappers
  in any production output; with `addHmr: false`, none in any output; Start's server env never carries route HMR
  code. Start forces `addHmr: true` for its client splitter, so there is no HMR-off Start build: the router-level
  paired build (the same splitter with `addHmr: false`) decides whether HMR support leaks into production.
- **J3.8 Without an HMR runtime** (no `import.meta.hot`, or `hot` without `data`), the module still evaluates and
  `Route` works (the same module serves SSR in dev).
- **J3.9 Both styles.** The Vite entry's (accept callbacks) and the rspack/webpack entries' (re-execution) satisfy
  J3.1–J3.4.
- **J3.10 Route tree edits in dev** (a new route file, a route kind change) reach the client tree and the page (reload
  allowed, J1.10).
- **J3.11 Several routers on a page.** An edit of a route file reaches every router of the page that holds that
  file's route (a route the file evaluated to, or one that loaded the lazy route file's options), whichever router
  was created last: two routers of one route tree (React StrictMode's state initializer creating it twice) both show
  it. A router whose route of the same id comes from another file (a code router of a widget, a second route tree
  compiled by a router plugin instance of its own) keeps its route as it is. The app keeps working: it still
  navigates, no error.

### J4 Start environment separation (start-compiler)

- **J4.1 `createServerFn` on the client.** The handler, the validation step and everything only they reference are
  absent; the exported value is still a callable server function with the same `method`, options and middleware
  list, calling the server by id over HTTP; `.url` works for forms. A schema or helper that surviving client code
  also uses stays.
- **J4.2 `createServerFn` on the provider.** The handler runs with its original semantics and closure; the function
  is registered under its id, so an HTTP call by id (with validation and middleware) runs it; the defining module's
  top-level code runs once in that env, and its handlers share every binding with the rest of the module (one
  instance, R157): a lazy handler module imports what the module keeps; a declaration only handlers reach moves to it
  and runs at the first call, unless evaluating it reads, by name and transitively, something the module keeps (then
  it stays and runs at load, as in the source; a declaration that is exactly a function always moves); a handler
  assigning a binding the module keeps stays in place. With SSR as the provider, the module (or a route's shared
  module) holds a server fn only when its own remaining code names it; otherwise the lazy handler module holds it,
  chain included, and the registry always names the lazy module (R158). A split route chunk imports a server fn where
  `main` imports it (an export) and otherwise holds a caller copy (R159): the chain as written, its `.middleware(…)`
  kept (a middleware's `.client()` half runs where the call is made), its `.validator(…)` links gone, and
  `createSsrRpc(id)` as its handler, so its calls reach the one executing instance through the registry, whatever
  builder, factory or options the chain starts from. In a production
  build, only server functions whose client call survives in the emitted client code are HTTP-callable (R182): a
  function no emitted client code calls must not answer a direct HTTP call by id, also when the client imports its
  module (a helper only another server function's handler calls); one that reaches the browser only by serialization
  (a loader returning it) is not callable either. A stub the client code keeps counts as a call: its id is in the
  bundle, and with `generateFunctionId` set its gate token (a spelling only a compile produces; a custom id is any
  text, and an unrelated string of the client equal to it admits nothing). The client's stub of a server function is a call the bundler may drop when nothing uses its value, with its id
  (Vite with `build.minify` at its default, `false` or `'terser'`, and Rsbuild with its minifier; not Vite with
  `build.minify: 'esbuild'` nor Rsbuild with `output.minify: false`, which keep an unused pure call whose arguments
  hold a call; not where a call of the user's continues the stub, `….handler(fn).bind(x)`); what the user's chain
  evaluates (its builder, options and links' arguments) still runs, so an exported server function the client never
  uses, in a module the client imports, is not callable where the bundler drops the stub, and stays callable where it
  keeps it (a stub the client code keeps counts as a call). What the compile adds to the defining module's exports is unique to that file, so
  server functions of several modules behind one `export *` barrel build and run without a conflicting name, also
  when the modules use the same names (`usersApi.get`, `postsApi.get`). In dev, an HTTP call by id may run any server function. Calling a server
  function from server code is documented: a server function only server code calls (another handler, a middleware
  `.server()`, an SSR-only module) works for those callers in every production build, whether or not the client
  build found it, in any module processing order (G4). A server function defined in code the provider erases but the
  client runs (`createClientOnlyFn`, an isomorphic fn's `.client()`, `<ClientOnly>` children) is registered all the same.
- **J4.3 `createServerFn` during SSR.** Calling a server function while rendering runs the handler directly (no HTTP
  fetch), with the same result as an HTTP call. When SSR and the provider share an environment, the handler may stay
  in the SSR module or be looked up by id (§5.4). When the provider is a separate environment (RSC), the handler runs
  in the provider environment with its resolution conditions; how SSR forwards to it is free.
- **J4.4 Ids.** _Build_: ids are deterministic for unchanged input, identical in client, ssr and provider output of
  one build, de-duplicated with `_1`, `_2`… on collision, hashed by default (no path leak), and overridable through
  `serverFns.generateFunctionId({ filename, functionName })` (experimental). The form of `filename` (relative or
  absolute) is not specified: tests derive the expected id from the arguments received. `functionName` is the
  generated handler name of earlier versions (`<name>_createServerFn_handler`, `_1`, `_2`… for a name the module
  repeats, in source order; C5), so custom ids survive an upgrade; it keeps an identifier's characters (non-ASCII
  ones too) except in a numbered name (only `[A-Za-z0-9_$]`, no leading or trailing `_`, as earlier versions), and a
  name that is no identifier (a string property key) holds only `[A-Za-z0-9_$]`. An id the
  generator returns is one URL path segment: one with a character that never reached the server whole (whitespace,
  control and non-ASCII characters, ``" # / < > ? \ ^ ` { }``), that is `.` or `..`, or whose percent-encoding the
  server reads as another id or rejects (`%41`, `%2E`, `%3c`, `%zz`) fails the build, naming the file; other characters outside RFC 3986's unreserved set and `$` build with a deprecation warning naming the file,
  and reach their handler. An empty id is the default id. Edits change the input, so ids need not survive edits.
  _Output formats_ (a compatibility requirement until the next major, owned by `server-fns/format.ts`: tooling reads
  them from the server bundle): the default id is the SHA256 hex of `<path>--<functionName>`, `<path>` the
  defining file relative to the project root with `/` separators; collisions are numbered by file, then source
  order within the file, in the order the environments allocate (the client's references first; under RSC the
  provider environment, which builds first); the resolver
  manifest's keys and `functionName`s are single-quoted, the `createServerRpc` metadata and the rpc ids
  double-quoted, escaped as Babel printed them (seen only where the bundler keeps module text: Rsbuild's server
  bundle); `serverFnMeta.name` is the variable's name, also when it is exported under another one. The golden test
  `start-build-server-fn-format.test.ts` reads them from real builds, the one test that reads printed code. A server
  function only server code references is not HTTP-callable (J4.2); whether the provider's manifest lists it is not
  a contract. With RSC, a production build provides only the server functions a server compile holds or the emitted
  client code calls: one only a dropped client stub names is not built, nor what its handler imports. _Dev_: an
  implementation-specific lookup id is allowed; within one dev session every caller and the provider agree on it;
  ids need not match between dev and build (G13); `generateFunctionId` may or may not apply. An id comes from the
  caller and may name any file, so a by-id request answers a function a compile of the running dev session
  registered, or one whose defining file, with symlinks resolved, is inside the app's `srcDirectory`, in no
  `node_modules` directory and servable by the dev server (Vite's `server.fs`): that file is compiled for the request
  (a page left open across a restart keeps working). Any other id is refused like an unknown id: a file outside
  `srcDirectory` or a package nothing compiled in the session never runs for a request. A server function is
  identified by its public `url`; beyond the output formats, generated names and Start's internal metadata fields
  (`serverFnMeta`) are not contracts.
- **J4.5 Recognition.** All Start builders are recognised through renamed imports, namespace members, re-exports
  (also of a namespace, and through diamonds and cycles of `export *`, in any compile order), aliases (`export const
createFooServerFn = createServerFn`), builders stored in variables and continued later (`const base =
createServerFn().validator(s); export const f = base.handler(h)`), user factories in other modules,
  `createStart(...).createMiddleware`, `.middleware([...])` chains that return callable builders, and re-exports under
  string export names (`export { createServerFn as 'create server fn' }`). A configured builder passed in another
  builder's `.middleware([...])` contributes its middleware list. Option objects given by identifier or spread are
  ordinary input. Also recognised: a Start namespace or start instance destructured (`const { createServerFn } =
  Start`), a sequence callee (`(0, createServerFn)()`), a builder chosen between two of the same kind (`c ?
  createServerFn({ method: 'POST' }) : createServerFn()`, `??`, `||`, `&&`), a factory whose single `return` follows
  statements that cannot return, `createServerFn.call(thisArg, options)`, a `let` builder reassigned with a builder of
  the same kind, a project namespace read by member, also after an export (`export * as`, `export { ns }`, `export
  default ns`) and through another namespace, a name's first declaration holding a value (a type, an overload or a `declare` before it is no value),
  and the JavaScript of a late-pass module (`.mdx`, `.vue`, …; TypeScript or TSX when the bundler parses it so, a
  plugin's `moduleType`), though no open builder may leave one: its importers read
  the file, so an export of one fails the client build.
  Static analyzability is expected (R92): `import()`, `require()` and `import.meta.glob` of Start values, and modules
  other plugins generate or rewrite, are neither followed nor refused. Any other use of a builder, a factory, a start
  instance, a Start namespace, a middleware or isomorphic fn without `.server()`, or a function returning one, fails
  the client build with an error at the use (the closed table: J4.5a; passed to a function, wrapped, stored in a container or a class field,
  assigned to a variable (a `const` initialised with it is followed), awaited, a detached or unknown member, returned from control flow, an async function or a method,
  a binding reassigned otherwise, destructured). A `const` list only read by a Start call is followed to it. So fails a
  project namespace object that goes anywhere but a member read or a plain read (`console.*`, `typeof`, `!ns`), when its module (through `export *` and nested
  namespaces, dependencies excepted) exports one of them, and an RSC primitive outside a server fn. A parameter passed
  directly as server code (`(fn) => createServerOnlyFn(fn)`, `.server(fn)`, `.validator(schema)`) fails the client
  build at that use, since every call keeps its argument, which is server code; one only read inside server code gets
  one warning at its definition (not in an installed package's module, G5). Neither looks across modules. Server code passed by name (a server fn's handler or
  validator, a middleware's `.server()` or validator, an isomorphic fn's `.server()`, a `createServerOnlyFn` argument,
  a name a route's `server` or `headers` option gives, also inside its object literals, spreads, arrays and a
  `handlers` function's `createHandlers(…)` object, and an `ssr` name) whose binding the module assigns outside
  server code (`let h = a; h = b; createServerFn().handler(h)`, `if (!h) h = …`) fails the build at that argument in
  every compile, since the client can keep the assignments with what they read (R154); a server fn's handler only
  where the compile keeps the site and accepts its creation. Server code is what any planner recognises as such (one
  view of the module). Not refused: a binding only server code assigns. No export, read or guard of the binding
  changes this (user decision, 2026-11-26): the fix is a `const`. A name reached through a wrapper or an alias
  (`.handler(() => h())`, `.handler(wrap(h))`) is no name at the position. Unrecognised shapes must not leak
  silently (J4.12): for a builder method called through a computed
  member (`createServerFn()['handler'](…)`, `createMiddleware()['server'](…)`) or a server-only fn whose result is
  member-called (`createServerOnlyFn(…).bind(null)`), the client holds no server code, or the build fails with an
  error at the call. Look-alikes are left alone (G15).
- **J4.5a Where an open builder may go (closed table, user decision 2026-11-27, pile-of-cases item 5).** An _open_
  value is one server code can still be attached to (`takesServerCode`, `start-plugin-core/src/compiler/prefetch.ts`):
  a builder of any kind but a middleware with its `.server()`, a factory of a builder, `createServerOnlyFn`,
  `createStart` or an RSC primitive, a start instance, a Start namespace (or a project namespace exporting one of
  these), an isomorphic fn without `.server()` (or whose implementation returns an open value), and a function
  returning an open value. The client compile follows an open value only through the positions below
  (`start-analysis.ts`: `climb`, `settle`, `isDataUse`, `isStartSink`, `reachesStartSink`, `landingOf`,
  `constListReachesSink`, `readsOptionsByName`; `isPlainRead` in `prefetch.ts`; `functionValue` and `HOLDS_NO_RETURN`
  in `router-utils/src/compiler/values.ts`). Groups and TypeScript wrappers (`(x)`, `as`, `satisfies`, `!`, `<T>`,
  instantiation) around the value are looked through everywhere.

  | Position                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Example                                                                                                                                                                                                                                                                                                                                              | What the compiler does                                                                                                                                                                                                                                          |
  | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Callee of a call                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `createServerFn(opts)`, `createServerFn.call(thisArg, opts)`, `fn()`                                                                                                                                                                                                                                                                                 | follows the call's value; calling a finished value is a use                                                                                                                                                                                                     |
  | A direct method call on a builder or an isomorphic fn                                                                                                                                                                                                                                                                                                                                                                                                            | `b.validator(s).handler(h)`, `.middleware([…])`                                                                                                                                                                                                                                                                                                      | follows the chain; an unrecognised method fails (`member`)                                                                                                                                                                                                      |
  | A member of a Start namespace or a start instance, read or called                                                                                                                                                                                                                                                                                                                                                                                                | `Start.createServerFn`, `start.createMiddleware()`, `<NS.ClientOnly>`                                                                                                                                                                                                                                                                                | follows the member's value                                                                                                                                                                                                                                      |
  | `.options.<name>` of a server fn or middleware builder, read by name                                                                                                                                                                                                                                                                                                                                                                                             | `b.options.method`, `const { method } = b.options`                                                                                                                                                                                                                                                                                                   | data; not `middleware`, not written, not the object handed on                                                                                                                                                                                                   |
  | Initialiser of a declarator with a name                                                                                                                                                                                                                                                                                                                                                                                                                          | `const base = createServerFn()` (`let`, `var` too)                                                                                                                                                                                                                                                                                                   | follows the binding, when this initialiser is the name's value; not a TS namespace's export                                                                                                                                                                     |
  | A destructuring declarator (`const`, `let`, `var`) of a Start namespace or start instance, name-only properties                                                                                                                                                                                                                                                                                                                                                  | `const { createServerFn } = Start`, `let { createServerFn: csf } = Start`                                                                                                                                                                                                                                                                            | follows each destructured name                                                                                                                                                                                                                                  |
  | Right-hand side of a statement `x = …` on a `let` holding the same kind of builder                                                                                                                                                                                                                                                                                                                                                                               | `let b = createServerFn(); b = createServerFn({ method: 'POST' })`                                                                                                                                                                                                                                                                                   | follows the binding                                                                                                                                                                                                                                             |
  | A join of open values                                                                                                                                                                                                                                                                                                                                                                                                                                            | `c ? a : b`, `a ?? b`, `a \|\| b`, `a && b`                                                                                                                                                                                                                                                                                                          | follows the joined value, each branch's chain kept                                                                                                                                                                                                              |
  | The single top-level `return` of a function, or an arrow's expression body                                                                                                                                                                                                                                                                                                                                                                                       | `const make = () => createServerFn()`, `function make() { const o = {}; return createServerFn(o) }`                                                                                                                                                                                                                                                  | follows the function: not async, a generator, a method, a getter or a TS namespace's export; its other top-level statements are expression statements, `var`/`let`/`const`, function and class declarations, empty statements, type aliases and interfaces only |
  | `.server(fn)` / `.client(fn)` of an isomorphic fn                                                                                                                                                                                                                                                                                                                                                                                                                | `createIsomorphicFn().server(() => b)`                                                                                                                                                                                                                                                                                                               | follows what `fn` returns as the isomorphic fn's call value                                                                                                                                                                                                     |
  | Argument of a Start call, directly or inside array and object literals, spreads, a property's value, an arrow's body or any `return` of a function expression or arrow (several returns too); `&&` `\|\|` `??` and a conditional's branches around such a literal are looked through (`...(c ? [a] : [b])`); an open value that is itself their operand is a join, which builds only between open values (the join row: `mw ?? mw2`; `flag && mw` fails, `flow`) | `.middleware([mw])`, `.middleware([mw ?? mw2])`, `createStart(() => ({ functionMiddleware: [mw] }))`, `createStart(() => { if (f) { return { functionMiddleware: [a] } } return { functionMiddleware: [b] } })`                                                                                                                                      | data (`isStartSink`: a builder's or start instance's method, a factory call that is not client-only, not an isomorphic fn's `.server()`/`.client()`)                                                                                                            |
  | An unexported `const` list every read of which reaches such an argument                                                                                                                                                                                                                                                                                                                                                                                          | `const common = [mw]; createServerFn().middleware(common)`                                                                                                                                                                                                                                                                                           | data, recursively (`constListReachesSink`); types do not count as reads                                                                                                                                                                                         |
  | An export                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `export default b`, `export { b }`                                                                                                                                                                                                                                                                                                                   | followed by the importers' summaries                                                                                                                                                                                                                            |
  | A plain read                                                                                                                                                                                                                                                                                                                                                                                                                                                     | an expression statement, an operand of any unary or binary operator (`typeof b`, `!b`, `void b`, `b === c`, `b instanceof X`, `'x' in b`, `b + ''`), a conditional's test (`b ? 1 : 2`), an `if`/`while`/`for`/`do` test, a `switch` discriminant or case, an untagged template, an argument of the global `console.*`, a discarded sequence operand | data                                                                                                                                                                                                                                                            |

  Anywhere else an open value fails the client build with an error at the use and a fix message
  (`ESCAPE_MESSAGES` and `escapeMessage` in `start-plugin-core/src/planners/start-env.ts`), by code:
  `start-escape:flow` (passed to another function, stored in an object, an array, a class field or another variable,
  awaited, rendered, assigned after its declaration), `start-escape:member` (a detached or unknown member, `.call` or
  `.bind` of a builder or of its method, `.options` handed on or written), `start-escape:computed` (`b['handler']`), `start-escape:return` (returned
  from an async function, a generator, a method, a getter, or a function with another statement that may return),
  `start-escape:reassigned` (a binding written otherwise), `start-escape:pattern` (another destructuring). An open
  middleware's message adds `.server(({ next }) => next())`, an isomorphic fn's adds a `.server()` implementation.
  The table is closed: a form main builds that is not in it (an exported, `Map`, frozen or `.push`/`.concat`/`.filter`
  list, `Boolean(b)`, `const o = b.options`, a factory with a statement that may return before its `return`) stays a
  build error; judging attach sites instead of flow is a follow-up (FOLLOW-UPS).

- **J4.6 Declaration sites.** Server functions declared at module top level work everywhere. A `createServerFn` that
  is not a top-level declarator's value works where its module creates it exactly once, unconditionally, when the
  module loads (R162): any expression position a top-level statement evaluates (an object or array entry, an
  argument, a callee or a member's object, an operand, any operand of a sequence, a template's or JSX's expression, a
  spread, `export default`, an assignment's right-hand side, a class's static fields and static blocks, a decorator, a
  top-level `await`), created in source order, after the statements before its own and before the rest of its own
  statement, with the values the source gives. Anywhere else the build fails with a clear error at the server fn
  naming the position: a ternary's branch, the right operand of `&&`, `||`, `??` or of a logical assignment, after
  `?.`, a destructuring default, a class instance field, a function (its body or a default parameter, a component, an
  immediately invoked function, a Vue `<script setup>` block), a loop, `if`, a block, `try`, `switch`, a namespace's
  body. Reported at the name instead: a read of a local of the function around it, of a class static block's local,
  of a class expression's own name, of `this`, `super` or a private name of its class, and a read, when the module
  loads (not in a function of the chain), of a binding not yet initialised before its statement: a `let`, `const` or
  class its own statement or a later one declares, a `var` its own statement declares before it (an import and a
  function declaration are initialised before any statement runs; a `var` declared later is `undefined` in both
  places). Nothing leaks either way.
- **J4.7 Import form independence.** A module's client output does not depend on how importers import it (static,
  dynamic, re-export, barrel); a dynamic import never leaks server code.
- **J4.8 `createMiddleware`.** Client: `.server()` implementations and `.validator()` code (and their imports) are
  removed for request and function middleware; `.client()` is kept and runs. Server: nothing is removed. The same
  holds for middleware built in factories or through `createStart`, and for global middleware listed in
  `createStart(() => ({ requestMiddleware, functionMiddleware }))` in `src/start.ts`: that module is in the client
  bundle, the listed middlewares' `.server()`/`.validator()` code is absent there, and a global function middleware's
  `.client()` runs on every client call. No stub of a removed part ships: on the client a middleware's
  `.options.server` (and `.options.validator`) is absent, not an empty or throwing stand-in. Other fields of a client
  middleware's `.options` are free (§5.19).
- **J4.9 `createIsomorphicFn`.** The client keeps only `.client()`, the server only `.server()`; a missing
  implementation is a no-op returning `undefined`; the other env's implementation and its imports are absent; links
  stored in variables or returned from factories keep their implementation.
- **J4.10 `createServerOnlyFn` / `createClientOnlyFn`.** In the owning env the function runs unchanged; in the other
  env calling it throws (checked by the throw; the message is free, §5.7), and the wrapped body and imports only it
  used are gone.
- **J4.11 `<ClientOnly>`.** Server environments render only the `fallback` (children removed), except that the
  environment that renders server components (RSC) keeps the children of a `<ClientOnly>` written in a server fn's
  handler, which travel in the Flight payload (as `main`). On the server, declarations,
  imports and initialiser effects only client-only code reads (`<ClientOnly>` children, `createClientOnlyFn` bodies,
  isomorphic `.client()` implementations) are dropped through every shape of G16, whatever the imported file is: a
  `*.client.*` file, a client-only-marked module, a neutral module or a package. A default server build reports no
  violation for such code. The client keeps the children. Only the TanStack `ClientOnly` import is transformed.
- **J4.12 Hard rule: no server code in the client.** Handler bodies, `.server()` bodies, validators (J4.1),
  server-only helpers and imports, `createServerOnlyFn` bodies, and `ssr`/`server`/`headers` route options are absent
  from the production client bundle on every supported bundler, with side-effect hints varied; a declaration kept
  alive only by a type position (`typeof schema`) is dead and must go. Modules import protection denies for the
  client are absent too, subject to the configured policy: an edge import protection permits (`enabled: false`,
  `allowImport` returning `true`, an exempt importer or `excludeFiles` target, J6.6, J6.7) gets the real module. This
  also covers imports the client cannot resolve: a platform module only removed code uses (`cloudflare:workers` read
  in a handler or `.server()`, `node:*`, `bun:*`) does not fail the client build and is absent from client output,
  while the server build keeps it; how the compiler avoids resolving it is free (G16). "Only removed code uses" is
  judged per module: a neutral module imported for an export only removed code uses is the user's, and server-only
  helpers belong in `*.server.*` files. A dynamic `import()` inside a handler is an import only removed code uses: no
  client chunk is emitted for its target. The compiler checks its own client outputs: one holding the text of a
  handler, a `.server()` argument, a validator, a `createServerOnlyFn` body or a deleted `ssr`/`server`/`headers`
  route option fails the compile in every mode, users' builds included ("R132 built").
- **J4.13 Client/SSR agreement.** The bindings each environment consumes satisfy their public contract in both: a
  server function imported in client and ssr is callable in both with the same id and `.url`; values the environment
  APIs make differ on purpose (`createIsomorphicFn`, `createServerOnlyFn`/`createClientOnlyFn`, `<ClientOnly>`) differ
  as documented. Identical export lists are not required (G9).
- **J4.14 Side effects once** per env, including modules with both server functions and top-level code (G3). "Once"
  is about the effects that survive for that env after the documented removals: a server env evaluates the surviving
  top-level code of a mixed module, so an unconditional browser-only top-level read outside any client-only boundary
  or split option need not be skipped on the server. Browser-dependent cases are tested through a real
  `<ClientOnly>`/`createClientOnlyFn` boundary, a split route with `ssr: false`, or a real separate RSC provider.
  Separate environments have separate module instances.
- **J4.15 Dev/build.** Provider modules may carry an HMR accept in dev, none in build (G7). The dev server serves the
  handler by id after edits (J3.6).
- **J4.16 Libraries.** A dependency written with Start APIs (uncompiled source) that declares Start (one of
  `@tanstack/<fw>-start`, `start-client-core`, `start-server-core`, `start-fn-stubs`, `@tanstack/<fw>-start-rsc` in
  `peerDependencies`, or in `dependencies` / `optionalDependencies` unless it is one of Start's own packages;
  `peerDependenciesMeta` alone declares nothing), or that the user includes for bundling, is compiled like app code in
  every env it takes part in, and its modules are read on demand like the app's (a builder one module hands to another
  under a new name is followed). Vite discovery reaches such a package from the app's manifest through workspace
  packages, packages that declare Start and installed optional dependencies, by the dependency name the importer wrote
  (npm aliases kept); one behind an ordinary installed parent stays behind it, and its compile warns. A dependency that
  uses Start without declaring it is compiled where its text names a Start API, and its compile warns once per
  package instance. Every dependency module an import resolution reaches has a summary, whatever its package or text
  (main's on-demand reading): a Start value is followed through any module of such a package too (`export … from`,
  `export *`, `import { t as base } from './chunk.js'; export { base }`, `export const authed = base`, a builder
  made in another module and called there, `base?.handler(fn)`), except through a module the host pre-bundles (Vite's
  dev optimizer).
  A route file the generator registered from a package is compiled like the app's.
  Discovery uses the app's configured
  root, never an unrelated process cwd (`vite build <app>` from a monorepo root works). A CommonJS dependency the
  bundler hands to the Start compiler (for example because its text matches a detection pattern such as `.handler(`)
  keeps its meaning and builds, as it would without Start (a top-level `return` in a script). Other dependencies
  carry no automatic requirement; dependencies shipping Start-compiled output are unsupported (§2.2).
- **J4.17 User code preserved** (G12): directives (`'use strict'`, `'use client'`, `'use no memo'`), decorators, class
  semantics, imports written with `assert` (they keep working; the keyword is free, J2.17), parentheses.

### J5 Deferred hydration `<Hydrate>`

- **J5.1 Recognition.** A `<Hydrate>` whose tag resolves to a static import from `@tanstack/react-start` or
  `@tanstack/solid-start` is a split boundary unless it has the literal `split={false}`. The tag may be the named
  import, a renamed import, or a direct static member of a namespace import (`import * as Start from
'@tanstack/react-start'; <Start.Hydrate …>`), extracted like a named import. React and Solid; Vite and Rsbuild; not
  Vue. Variable indirection (`const Deferred = Hydrate`, `const { Hydrate } = Start`) and wrapper components are not
  analysed (§2.2). A shadowed namespace binding or a namespace of another package is a look-alike (G15).
- **J5.2 Client output.** The boundary's children move into a separately loaded chunk rendered through a lazy
  component; values the children capture from the enclosing scope are passed in and reflect the latest render;
  identifiers declared inside the children (e.g. a `const Icon` in a map callback) are not captures; nested boundaries
  each get their own chunk; `prefetch`'s `preload()` loads that chunk (and resolves at once with `split={false}`).
  The chunk holds its own copy of the module-level declarations the children reach, as `main`'s does (R155, R161:
  a second instance, no top-level statement), and imports only what a copy cannot be: a binding leading back to the
  boundary (the route, a component rendering itself), a name a top-level statement declares (and a declaration such a
  statement reads, as split chunks do), the route binding, what another module of the file holds. Code that left the
  module (the children, what only they use) assigning such an import, or its copy of a binding the module or another
  chunk of the file also holds, stays in place (J5.5); the copy's limits are KNOWN-BUGS'.
- **J5.3 Server output.** Children still render to HTML (G1); the server renders a boundary marker; `fallback` is
  removed when statically visible (a direct prop, an inline object spread, a single-use `const` spread) and may stay
  otherwise.
- **J5.4 Hydration identities agree.** Server and client identify the same rendered boundaries (every boundary,
  extracted or not, including one in a `children` prop), so each hydrates with the identity the server rendered: no
  mismatch, collision or wrong child chunk. A compiler-assigned part of that identity is identical in every env of one
  build and deterministic for unchanged input (equality between builds at different roots is not required). The
  runtime combines an optional compiler prefix with the framework's own id: a compiler id on every non-extracted
  boundary is not required when the framework identity already agrees. Boundaries rendered at the same time never
  share an identity; boundaries in mutually exclusive branches at the same position may.
- **J5.5 Loud rejections when extraction is attempted; children kept in place.** For a boundary being extracted,
  function-as-children, hook calls that may run while the extracted JSX renders (React, its `use` included; Solid
  children may call them, R101) and what the children would take from the enclosing code without a name (`this`,
  `super`, `new.target`, `arguments`, `await`, `yield`, a private name of a class around them, as the language scopes
  them) give a compile error naming the fix (`split={false}`, a local before the boundary, or a child component), in
  every compilation that attempts the extraction (client and server alike). Children the split would hand a copy of
  a binding instead of the binding are not extracted (decision 12): children assigning a captured local; on React, a
  function of the children reading a local the component reassigns, directly or through a nested boundary (R123,
  R161 D2); a capture whose declaration does not end before the boundary starts (a hoisted function excepted); on Solid, a `ref` in a nested
  boundary naming a local declared outside both; children, or code only they use, assigning a module binding the
  chunk imports, or its copy of one the module also keeps (J5.2). Such a boundary renders in place as with
  `split={false}` and keeps its compiler id in every environment (J5.4); the client compilation reports one warning
  naming why (`split={false}` silences it). Text-only children (text, a string or a template without expressions, as
  children or as a `children` prop) are never extracted. Dynamic `split` counts as split. A boundary with literal
  `split={false}` is neither extracted nor rejected, and its runtime behaviour is the framework's (C8). These
  rejections are the specified outcome, not a limitation to remove (G5's "our limitation is a bug" does not apply).
- **J5.6 Only what is needed, when it is needed.** Child chunks are not modulepreloaded with the route; without
  `prefetch` (and apart from React's documented early hydration), a child chunk loads when the boundary is about to
  render or hydrate; `prefetch` may load it earlier. The documented initial-hydration versus later-mount behaviour,
  including `never()`, is preserved. A boundary inside code the production bundler removes leaves no chunk and no
  child code (per bundler, G2). A module only the children import is not downloaded before the boundary needs it;
  when its top-level code runs is free (G3).
- **J5.7 CSS stays route-linked.** CSS imported by split children stays discoverable for the route's SSR HTML (not
  deferred with the chunk).
- **J5.8 Semantics otherwise untouched.** `when`, `prefetch`, `onHydrated`, keys and context flow through as
  written; the function form of `when` runs on the client only. Extraction keeps context flowing into the children
  (a context object the module itself creates is copied with the chunk, J5.2),
  keeps legal `key`/`ref` behaviour, and passes the latest captured values and callbacks after parent re-renders and
  keyed reorders: it never freezes the first render's data or a Solid read. A changed inline `when`/`prefetch`
  identity does not restart an established gate; a new `key` creates a new boundary. React's early hydration stays
  allowed (J5.6).
- **J5.9 Printing.** Children and fallback JSX re-printed in the chunk or stripped from the server keep their meaning
  (G12). The parent keeps its directives (J4.17); a client-only split chunk need not repeat `'use client'`.

### J6 Import protection

- **J6.1 Rules.** Deny by resolved-file pattern (client default `**/*.server.*`, server default `**/*.client.*`), by
  raw specifier (client default `@tanstack/{react,solid,vue}-start/server`; server default none), and by marker
  (`@tanstack/<fw>-start/server-only` / `client-only` side-effect import in the target file; both in one file is an
  error). A marker is a static import (`import '@tanstack/react-start/server-only'`); a dynamic `import()` or
  `require()` of a marker is an ordinary import and is not checked (a client entry's own marker import is judged at
  its import whatever its form). `@tanstack/{react,solid,vue}-start/server` is itself a server-only-marked module. `excludeFiles` (default
  `**/node_modules/**`) skips the file rule of a resolved target, never its marker. Option semantics follow the docs
  table (`client.specifiers` adds; `files`, `excludeFiles`, `server.specifiers` replace). Importers checked: those
  under `srcDirectory` (or `include`) minus `exclude`/`ignoreImporters`. A marker denies its file to every importer
  that is not exempt or allowed, wherever the importer is (outside the scope, a package's module the compiler does
  not compile: reported at its import of the file; `allowImport` is asked about the file itself for an importer the
  compiler does not compile), and a bare import of a marked file is a violation where it survives whatever
  `sideEffects` declares. Vite and Rsbuild; every Start env
  (client-type and server-type). A specifier rule matches the specifier **the user wrote**: a bundler rewrite of the
  import (e.g. Rsbuild `source.transformImport` turning `ui-lib` into `ui-lib/button`) does not bypass a denial of the
  original; file and marker checks apply to the rewritten edge's resolved target. A resolved id whose path holds a `#` is
  judged as itself and as the path cut at its last `#` (a Vite id keeps a `#fragment`, which no id tells from a `#` of a
  path): either denies. An import the env's resolver
  cannot resolve (it fails, e.g. a package with only a `node` export on the client) has no resolved target: file and
  marker checks skip it, specifier rules apply, and the bundler decides on it (it fails the build if it keeps the
  import; nothing of it ships if it drops it). A denied file the bundler still loads through it is denied itself.
  With RSC, a `'use client'` module a server component imports is a client reference where server components render
  (Vite `rsc`, the Rsbuild RSC layer): there its file pattern and marker do not deny the import and its own imports are
  not judged (a specifier rule still matches); SSR and the client judge it, as the import-protection guide says.
- **J6.2 Type-only edges are ignored**; mixed imports count.
- **J6.3 Behaviour.** Default dev `mock` (warn once, replace with a recursive-Proxy mock), default build `error`
  (fail the build); overridable globally or per mode, including `mock` in production builds; `enabled: false`
  disables everything. In mock mode (dev or build, client or server env) every violation is reported (the build or
  dev-time warning), and calling a mock gives a runtime diagnostic at the severity `mockAccess` sets (default
  `error`; `warn`; `off` silences), wherever a mock is served: dev and production, client and server. `mockAccess`
  changes nothing else. Which uses of a mock beyond a call it reports is free (§5.18). A test that expects silence
  sets `mockAccess: 'off'`. Rsbuild: a module a child compiler builds (a worker or service-worker plugin's) gets
  no mock: its violation fails the build at the import, whatever the behaviour, and `allowImport` is not asked
  (ruling of review round 3, F1).
- **J6.4 Only what the client bundle holds is reported.** Build: a violation is a mock in the final bundle (in a
  chunk of the bundler's own lists: Rolldown's `chunk.modules` with rendered code, Rspack's chunk graph with the
  inner modules of a concatenated module); a mock in no chunk reports nothing (no warning). The lists come before
  the last passes over the code (Rolldown's chunk-level dead-code removal, Rspack's minifier): a mock only those
  passes remove (read in a branch a constant from another module rules out) is reported, though the emitted code
  lacks it, as on main for Vite; the limit only over-reports. Nothing predicts the
  real module's effects: the mock decides. A named, default or namespace import's mock is pure (kept where a binding
  of it survives). One that runs, kept wherever the import runs, whatever the tree-shaking options: a bare import
  (`import './x.server'`, `import {} from`, `export {} from`; not of an asset query), an `import()` or `require()`
  (one tree-shaking drops loads nothing), an import or re-export of type names only (kept as an import by a host's
  `verbatimModuleSyntax`), a marker; each declaration decides for its edge (one that runs next to one whose binding
  the build drops still runs): an import of type names next to an import of the same file's values runs whatever
  the host's `verbatimModuleSyntax` (its mock cannot know the setting), so a dead value import beside
  `import { type T }` is a violation; `import type` is never an edge. A client entry's own marker is one whatever its form or what the host's
  TypeScript makes of it. A denied file mocked under its own id (its importers are code the compiler does not read:
  a package module, an import another plugin added, a pattern import) runs under its package's own `sideEffects`:
  an unused import of it in a module the build keeps is a violation, as on main; one the bundler drops (a bare
  import of a file a `sideEffects: false` package declares, which Rspack does not even build) is not. Dev: an edge
  the Start compiler itself removed from the importer's output (handler-only, `.server()`-only,
  server-only-fn-only imports) is not a violation and is neither reported nor mocked, whatever the request order,
  warm-up, pre-transform, lookup requests or full-bundle mode; edges that only bundler tree-shaking would remove
  may still be reported in dev: dev reports each mock it serves as a violation, once.
- **J6.5 Report content.** Environment type, the matching rule, the importer's `file:line:col` in the _original_
  source (through source maps, also for non-JS sources and other plugins' rewrites) where the location is
  source-derived, the raw specifier, the resolved path and the import chain from an entry (cut at `maxTraceDepth`)
  when available (`resolved`, `importerLoc` and `snippet` are optional in `ViolationInfo`; an optional field is
  checked only when given), a code frame, direction-specific suggestions. `log: 'once'` de-duplicates per edge;
  `'always'` logs each occurrence once per load. The importer location is a relevant original import span or a real
  surviving use of the binding, never an erased type position, a use inside a removed boundary body, or compiled
  coordinates. The chain is any real import chain from an entry to the importer (not necessarily the shortest),
  bounded by `maxTraceDepth`, listed entry first or entry last, as long as the entry is identifiable and the direction
  unambiguous.
- **J6.6 `onViolation` and `allowImport`.** `onViolation` is called for every violation with the documented info,
  and only reports. `allowImport` is asked before the import is mocked, once per import (dev and build), tree-shaken
  imports included; returning `true` allows the import: real module, no mock, no report, no `onViolation` call. An
  import is a file's request of a specifier in an environment, resolved to one file (environment, importer, raw
  specifier, target): two declarations of one specifier in a file, or a static and a dynamic import of it, are one
  import, asked at the first (`importerLoc`).
- **J6.7 Exemptions give the real module.** An importer exempted by `ignoreImporters`, `exclude` or outside
  `include` gets the real module through a plain import, and nothing is reported for it, when the importer itself is
  in the app without the help of a denied module that is not real (a denied module served as its mock brings none of
  its imports: dev and watch rebuilds serve what a fresh build of the same source serves). "In the app" is reached
  from what the compilation holds by itself (its entries and includes, however a plugin adds them). Pattern imports
  (`import.meta.glob`, a template-literal `import()`, `require.context` / `import.meta.webpackContext`) are not
  covered (R142): a pattern importer, exempt or checked, gets the file as its plain importers make it served (the real
  module when an exempt importer imports it plainly or `allowImport` allows it, the mock otherwise), with no report of
  its own; importers that disagree: J6.11. Further, a denied target matched by `excludeFiles` is not
  checked at all; non-exempt importers of the same file are still mocked and reported.
- **J6.8 Mocking is complete.** In mock mode every reported edge is mocked for the non-exempt importer (including a
  denied file outside `include` imported from an included file; pattern imports: J6.7); the mock exposes the bindings the importer names;
  no real value of the denied module (including inlined enum members) reaches the bundle. A mock is judged by safe
  behaviour through real consumers (named, default and namespace imports, also `ns[key]`; deep member reads, calls and
  construction do not throw; no denied initializer runs; no secret appears), never by a label or a primitive
  conversion (§5.18). A name re-exported with `export *` from a denied module (a denied file or specifier) is a
  complete safe mock; otherwise the build fails, and in dev the server warns at the `export *` (its file and
  position). Either way the denied module's value never reaches the client, and the importer of the name never fails
  to load in dev.
  A `require()` of a mocked module evaluates to the mock module's namespace (`{ default: <mock> }`, the bundler's
  interop of the ESM mock), not to the mock itself: the names the importer reads of it (destructured, as members of the
  binding or of the call, and `.default`) are safe mocks, the namespace itself is not callable (KNOWN-BUGS, accepted
  limits).
- **J6.9 Every entry counts.** Edges reachable from any entry of the env (router entry, start entry, client entry, a
  custom `src/server.ts`) are reported.
- **J6.10 Dependencies.** Files under `node_modules` skip file-pattern checks by default (`excludeFiles: []` turns
  them on again); a dependency's marker is honoured like the app's, in every package, whether or not it declares
  Start. A file name is a convention of the app's scope: an unmarked `.server` file imported inside a package or a
  workspace package is no violation.
- **J6.11 Determinism.** The set of reported violations for a source tree and config does not depend on request
  order, caching, or which env transformed a module first (G4). A denied file whose importers disagree (one needs it
  as it is: an exempt plain importer or an import `allowImport` allows; a checked one reaches the file itself: a
  pattern import or an import another plugin added) fails every build, under both behaviours, whatever the order the
  bundler compiled them in (R147). With an exempt pattern importer instead, a Vite build reports the shape under
  `behavior` whatever it served; Rsbuild serves it as it is to both and reports nothing.
- **J6.12 Wording is free.** The docs' report displays are examples: sections, header text, numbering, quotes,
  spacing, code frames and suggestions are free. What a violation is (environment, importer and location, specifier,
  resolved file, chain) is read from `onViolation` (J6.6); the printed report is checked only for naming the
  importer's file and position, as a warning or an error, and `log` is judged on the printed warnings.
- **J6.13 Edits reclassify in dev.** In a running dev server, adding or removing a marker, changing an unsafe edge or
  boundary, and deleting or recreating a target update reporting and mock/real resolution in every affected Start
  env: no stale cache keeps a removed denial or hides a new one.

### J7 RSC CSS injection (react-start-rsc)

- **J7.1 Scope.** Only with `rsc.enabled: true`, React, under the documented prerequisites (§1.3), in the environment
  that runs the RSC render: on Vite the `rsc` env (the provider); on Rsbuild the server-function provider modules.
  SSR forwarding and the client/SSR facades are preserved; no other server env has to evaluate an RSC-only CSS
  loader. The requirement is delivery wherever the render runs (J7.2), not today's option set.
- **J7.2 CSS reaches the client.** For `renderServerComponent(<JSX/>)` and `createCompositeComponent(fn)` run in that
  environment (a server function returning server-rendered UI), the CSS (global and modules) the server-component
  module imports is delivered with the RSC payload so the client styles it. Injecting the bundler's `loadCss` is
  today's mechanism; an equivalent delivery is fine. Recognised through both module names
  (`@tanstack/react-start/rsc`, `@tanstack/react-start-rsc`), import renames and direct static namespace members
  (`RSC.renderServerComponent(<Card />)`, likewise `createCompositeComponent` and, under J7.3,
  `renderToReadableStream`). Variables, wrappers and project re-exports of the helpers need not be recognised;
  shadowed or foreign look-alikes stay untouched (G15).
- **J7.3 `renderToReadableStream`.** With a JSX first argument (or a conditional whose branches are all JSX, `as` or
  parenthesised) the CSS is injected; with an identifier or spread argument a dev-only warning is emitted; with a
  second `options` argument or a plain-data model the call must not break (§2.2), CSS and warnings not required.
- **J7.4 No duplication, no behaviour change.** Injection adds styles only; rendered markup and the stream's data are
  otherwise unchanged (G1); a module not calling these helpers is untouched.
- **J7.5 Dev.** Editing a server component's CSS (global or module) updates the open page with the new styles;
  removing a rule or the CSS import removes its effect; successive edits leave no stale stylesheets; no full reload
  where a hot update is feasible (G10). Stylesheet count, loader and envelope are free. Vite and Rsbuild dev servers.

---

## 5. Allowed freedom (correct-but-different compilers)

A compiler may do any of these and still be correct; tests must not fail on them. Cited as `§5.N` (or "§5 item N").

- **§5.1 Generated names**: identifiers for hoisted components, shared bindings, handler functions, RPC variables,
  Hydrate lazy components, mock bindings, hot-data keys, and the names of the route tree's own types.
- **§5.2 Server-function ids**: dev may use another id. Build ids follow J4.4's output formats until the next major
  (the default hashing, collision numbering, quoting); they are deterministic, de-duplicated, equal across the envs
  of one build and overridable (J4.4, G4). Equal opaque ids between builds of one project at different roots are not
  required.
- **§5.3 Module layout**: virtual-module ids and query strings (`?tsr-split=`, `?tss-hydrate=`,
  `?server-fn-module-lookup`; except that split groups keep main's ids and absolute `import()` specifiers,
  `<file>?tsr-split=<a>---<b>`, which apps' chunk naming reads: router-plugin `split-module-ids.test.ts`), chunk
  count and shape, shared-dependency chunks, where shared bindings live (shared module, chunk re-import, entry
  re-export), copying _pure, unexported, identity-unobservable_ helpers into a chunk or
  importing them (J2.4), as long as group semantics hold: a group is available together (J2.2; forwarding modules
  allowed), separately configured groups are neither made eager nor loaded together when one is needed, and no chunk
  carries unrelated code (J2.5). Whether the SSR build splits route options like the client: not required (it should
  render correctly; splitting there is an optimisation goal).
- **§5.4 SSR handler placement**, in place or extracted, when SSR and the provider share an environment (J4.3); the
  forwarding mechanism for a separate provider.
- **§5.5 Order and printing**: statement and import order (within G3), quotes, semicolons, whitespace, comment
  placement (except license comments the splitter moves code away from, G12), the order of directives in one
  prologue (each still before executable code), and dropping or keeping runtime-neutral type-only exports and
  imports. Extra parentheses are free only where they change no outcome: parentheses around a component-defining
  expression that stop React Fast Refresh from registering it (SWC under Rsbuild does not register `const Page =
(() => …)`) fail by the outcome, the edited component losing its state (J3.2). Pragma semantics: J2.16.
- **§5.6 Export lists** of compiled modules: adding exports, removing never-imported ones (G9). Compiler packages may
  also export more than today.
- **§5.7 Diagnostic wording and channel** (console or bundler diagnostics), not severity (G5), including the prose of
  the environment-misuse runtime errors (J4.10). A diagnostic is checked only for its file and position. File names
  may be absolute or project-relative if unambiguous; a bare basename that is only a suffix of the project-relative
  path (`other.ts` for `src/other.ts`) does not name the file. Code frames, their layout and context length are free
  and not checked (a location is checked by its file, line and column).
- **§5.8 Where helpers live**: runtime helpers inlined, imported from the framework package or in a virtual module;
  which lazy helper builds a lazy boundary (`lazyRouteComponent`, `lazyFn`, a wrapper or an intermediate module).
- **§5.9 Which dead code is left** (G8): unreferenced functions, unused imports in never-executed code, unused import
  specifiers, as long as unused code does not reach the production bundle (J2.5). What only removed code used is not
  free (G16).
- **§5.10** (removed: root routes are not split, J2.7).
- **§5.11 Dev-only extras**: HMR accept code shape, hot-data layout, Refresh registration mechanics, dev diagnostics.
- **§5.12** (removed: now required, J4.11).
- **§5.13 How a `createServerFn` created once at load is supported** (hoisting or any technique giving J4.6).
- **§5.14 Source-map granularity and layout** beyond "positions resolve to the user's line and column"; no mappings
  for generated support code; absent optional report fields (J6.5).
- **§5.15 Parser and printer** (Babel, Oxc/Yuku, SWC), and whether a module without the detection pattern is parsed
  at all, as long as every recognition form of J4.5, J5.1 and J7.2 works.
- **§5.16 Idempotence** (recompiling output is unsupported).
- **§5.17 Change detection** of the generator in dev (J1.10) and the hydration-identity scheme (J5.4).
- **§5.18 Mock representation** (J6.8): the mock's label, its primitive conversion, Proxy shape and where the mock
  runtime lives, as long as it is safe and leaks nothing; which uses of a mock beyond a call the `mockAccess`
  diagnostic reports (a string conversion, `toString()`, `new`, a property write).
- **§5.19 Extra fields on runtime objects** the compiler emits or decorates (e.g. server-function metadata next to
  the id, `name`/`filename` on a client middleware), as long as the public contract holds. A stub where the compiler
  removed a part (a client middleware's `.options.server`) is not such a field (J4.8).
- **§5.20 Shared plugin state**: whether the router plugin instances one integration composes (Start's client and SSR
  splitters) share a context.

---

## 6. Product questions (ruled; the ids stay because tests cite them)

- **OQ12: license comments beyond the splitter.** Free for the Start compiler and the import-protection rewrite; no
  test (G12, §5.5).
- **OQ13: already-lazy option values.** Superseded (R153): `component: lazyRouteComponent(() => import(…))` is a
  call, split like any other, as on main (the docs recommend `createLazyFileRoute` instead).
- **OQ14: a chunk for `component: Outlet`.** Resolved: a chunk is emitted that forwards the imported binding (J2.8), as on main. `integration/vite-versions.test.ts` ("outlet" route) pins it. Dropping the property is not equivalent (the router falls back to `defaultComponent`).
- **OQ15: the release-candidate `.inputValidator()`.** Type-invalid input (§8, §2.2). No requirement, no test.
- **OQ16: third-party transforms on split chunks.** An app's own `enforce: 'pre'` plugin filtering `/\.tsx$/` does not
  see split-chunk ids. Out of scope, no test. The documented integrations (framework plugins, the React Compiler
  through the framework plugin) keep working.
- **OQ17: four minor items.**
  - a. `<ClientOnly>` in Vue SFC templates: no requirement until Vue Start is documented.
  - b. A module-level `'use server'` with RSC enabled: undefined, no test; J4.12 still holds.
  - c. Edits of modules the `virtualRouteConfig` file imports: live regeneration is not required (restart); J1.10
    covers the config file itself, `__virtual.ts` files and route files under `physical()` mounts.
  - d. `.vue` route files: never split, no warning, no test.

---

## 7. Conflicts between docs and types, and how this spec resolves them

| #   | Conflict                                                                                                                                        | Resolution                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `guide/code-splitting.md`: `__root.tsx` "does not support code splitting"                                                                       | not a conflict: J2.7, root routes are not split (R60)                                                                                                                                                       |
| C2  | `router-plugin/src/core/config.ts` JSDoc default grouping includes `pendingComponent`; `guide/automatic-code-splitting.md` does not             | J2.2 follows the docs                                                                                                                                                                                       |
| C3  | `guide/automatic-code-splitting.md`: exporting a route property bundles it into the main bundle                                                 | the guide is right (R153): an option whose value the route file exports stays in the route module, warned at (J2.8); an exported binding a split option reads stays there too, imported by the chunk (J2.4) |
| C4  | `guide/import-protection.md`: dev may report imports that "would later be compiled away"                                                        | not a conflict: J6.4 separates edges the Start compiler removed (never reported) from edges awaiting bundler tree-shaking (may be reported in dev)                                                          |
| C5  | `guide/server-functions.md`: hash `filename + functionName`; `generateFunctionId` receives the generated handler name                           | J4.4 keeps the generated handler name as `functionName` (custom ids survive an upgrade), and the default id hashes `<filename>--<functionName>` (SHA256 hex)                                                |
| C6  | `routing/virtual-file-routes.md` prose says `virtualRoutesConfig`                                                                               | the option is `virtualRouteConfig` (docs typo)                                                                                                                                                              |
| C7  | `guide/automatic-code-splitting.md` shows `createRoute('/posts')({...})` in a file-route example                                                | J2.1: file routes use `createFileRoute`/`createRootRoute*` only (docs typo)                                                                                                                                 |
| C8  | React `HydrateProps` rejects function children even with `split={false}`; `deferred-hydration.md` recommends `split={false}` for them           | a types/docs mismatch, no compiler rule: with `split={false}` the compiler neither extracts nor errors (J5.5)                                                                                               |
| C9  | `renderToReadableStream` is typed one-argument under the default condition, `(data, options?)` under `react-server`; the docs show one argument | §2.2: two-argument and plain-data inputs must not break; no CSS or warning requirement                                                                                                                      |
| C10 | `guide/environment-variables.md` presents `server.build.staticNodeEnv` for Vite and Rsbuild; the Rsbuild plugin ignores it                      | out of scope (§1.2)                                                                                                                                                                                         |
| C11 | router-plugin `deleteNodes`/`addHmr` are public; Start overrides them                                                                           | §1.1 wiring; tests assert the per-env outcome; whether users may override them is a product decision                                                                                                        |
| C12 | `installation/with-esbuild.md` shows `autoCodeSplitting: true` on esbuild                                                                       | J2.18: works or refuses                                                                                                                                                                                     |
| C13 | `docs/router/quick-start.md`: Router "only compatible with React and Solid"                                                                     | Vue is in scope (the types and packages exist); feature exceptions in §1.3                                                                                                                                  |
| C14 | "SSR RPC" (handler replaced by an id lookup) as job 4 was first stated                                                                          | J4.3: in place or extracted when SSR and the provider share an environment; with a separate provider the handler runs there                                                                                 |
| C15 | `guide/middleware.md`: "on the server, nothing is tree-shaken"                                                                                  | true for middleware (a `.client()` callback is not a client-only boundary); J4.11 concerns `<ClientOnly>`, client-only fns and isomorphic `.client()`                                                       |
| C16 | `guide/import-protection.md` table omits `mockAccess`; `schema.ts` exposes it                                                                   | J6.3 includes it (runtime diagnostics only)                                                                                                                                                                 |
| C17 | `api/router/createLazyFileRouteFunction.md`: lazy files hold only four component options                                                        | not a conflict: J2.1 leaves lazy modules unsplit because they are already lazy; splitting them further would violate nothing                                                                                |

---

## 8. How the spec is checked

- **Real tools only.** Behaviour a bundler, framework or HMR runtime decides is tested with the real tools: real dev
  servers with the real framework plugins, the real HMR client, real `react-dom`/Solid/Vue runtimes, real production
  builds. No copy of Vite, webpack, Rspack or React update propagation, Refresh families, tree-shaking or runtime
  logic in the tests. Server code runs inside real requests through Start's server entry and a real router; no
  hand-built request context. Thin glue only at unavoidable external boundaries, each with its own control test.
- **Public entry points only.** Tests reach the compilers through the plugins and options a user configures (Vite,
  Rsbuild, Rspack and webpack builds and dev servers, or the public Vite plugin in-process), never through internal
  modules, classes, ids or queries.
- **Assert where the outcome is decided.** Compiler-level tests assert what the compiler alone decides (semantics,
  identity, validity, absent server code, what its split modules contain within J2.5, warnings); placement,
  dead-code elimination and dangling names are asserted on production output per bundler with side-effect hints
  varied (G2, G8); HMR with the real dev tools.
- **Assert behaviour, not mechanism**: through real importers, rendered output, calls, ids compared across envs and
  source-map-resolved positions; never generated names, export lists, printed text, statement order or which equally
  correct module a binding lands in (§5). Lazy loading is behaviour: a test whose subject is a split also asserts,
  with load markers, that the option's chunk is not loaded before the route needs it.
- **Limitations get two tests**: a loosened test of the safe fallback (correct output; the user informed when not
  split) and a `.fails` goal pin for the ideal outcome. Best-effort cases get only the loosened test.
- **Unsupported inputs** (§2.2) get at most a "never fail silently" test; no test for behaviour that is undefined.
- **Reachability before pinning**: a pin needs a real-usage path to the failing state. Equal-mtime double saves and
  the webpack stale-id preference stay untested until shown reachable with real tools (§9).
- **Pins have a compiler cause.** A `.fails` pin asserts the correct outcome, accepts any correct fix (and the clear
  error a clause allows instead of support), and has its cause in a compiler or its bundler integration (§1.2).
- **Type-invalid inputs are not supported inputs.** Source the public types reject (a `tsc` error under the
  project's real declarations, e.g. `split="false"`, a string-returning `when`, a childless `<Hydrate>`, missing
  builder arguments) may appear only as never-fail-silently controls (G5), never as evidence that a form works.
- **Client code runs in a real browser; server code in Node.** A DOM implementation's globals copied onto Node are not
  a browser.
- **No internal tests.** Tests of test helpers, exported internals (§1.2), plugin lifecycle, debug output or
  filesystem policy are not part of the suite.
- **Dev-server edits are realistic.** The app's files exist before the dev server starts, and a compile counts for an
  edit only if it started after the edit's last write. A multi-file edit (moving `src/lib.ts` to `src/lib/index.ts`)
  passes through in-between states a dev server may compile and report: tests assert the state after the last write
  (a report since the edit that gives a resolved path names the new target), not an exact report list.

---

## 9. Clauses a test cannot (easily) check

- J1.5 across operating systems (needs a second platform). Project relocation is testable: at each root, assert
  compilation, runtime behaviour and within-build id agreement (G4, J4.4, J5.4); equal opaque ids between roots may be
  recorded, never used to reject a compiler.
- J4.16 for arbitrary discovered-library layouts (one pin covers the cwd case).
- J4.16 with symlinked packages failing at startup (#8139): the root cause (compiler, bundler or Nitro) is not known;
  a passing integration test covers the setup.
- G3/G4 under a persistent bundler cache (Rspack/webpack filesystem cache, Rsbuild `performance.buildCache`): the
  splitter's chunk and shared compiles read state the route-module compile fills; a divergence on a cached rebuild is
  plausible but not shown. A regression test covers it, not a pin.
- G12 for printer edge cases not yet listed.
- J6.11 in full generality (pins cover warm-up, pre-transform and entry order). A Vite build whose importers of a
  denied file are an exempt plain one and an exempt pattern one serves the file as it compiled it first, and reports
  the shape under `behavior` whichever it served, so the reports do not depend on the order (R142 (2), design 4
  closing follow-up); what a pattern importer reads does. A `vite build --watch` rebuild reports a file it compiled
  real before the edited importer, and the next rebuild mocks it.
- J3.4 webpack stale hot-data id: no reachable scenario shown yet.
- J1.10 equal-mtime double save: plausible with format-on-save, not reproduced with a real editor.
- J1.6/J1.10 within one run: a save that lands between the generator's read of a route file and its rename over it
  is kept, and a reader sees only complete contents, also when a write or rename fails. No deterministic reproduction
  through real files and a public API. J1.16's rename beside the destination is pinned with a real second filesystem.
