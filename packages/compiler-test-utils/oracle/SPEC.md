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
- Runtime bugs. A pin's cause is in a compiler: the J1–J7 sources or their bundler integrations. Babel,
  babel-dead-code-elimination and unplugin are today's implementation choices, so their bugs count as compiler
  bugs. A bug caused by a runtime package (for example a hydration boundary in `react-start-client`) is out of scope.
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
  transformed by the JS compilers, even when their text contains an API name such as `createServerFn(` (G1).
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
splitBehavior, defaultBehavior, deleteNodes, addHmr }`, `plugin.hmr.style`, `plugin.vite.environmentName`), all of
  `router-generator/src/config.ts`, and `tanstackStart({ router, serverFns.generateFunctionId, importProtection, rsc,
srcDirectory, … })`. Which clauses a switch turns on or off: J2.21, J3.7, J6.3, J7.1.

### 2.2 Unsupported or undefined inputs

| Input                                                                                                                                                    | Status                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| A second route object in a file route module (`export const extra = createRoute(...)`)                                                                   | unsupported; no HMR or split requirement                                                                                                |
| Two `createFileRoute` calls in one module                                                                                                                | unsupported; must never fail silently (J2.11)                                                                                           |
| A route created inside a function of the same file (`function make() { return createFileRoute(...) }`)                                                   | unsupported but user-fixable: correct split, or unsplit plus a warning naming the file (J2.10)                                          |
| Compiling Start output a second time (plugin registered twice, a dependency shipping Start-compiled output)                                              | unsupported; even an internal error is fine; no test                                                                                    |
| The router plugin registered more than once in one app                                                                                                   | unsupported; no test                                                                                                                    |
| Import protection in environments the user adds outside Start                                                                                            | undefined; no test; "left alone" if a choice is ever forced                                                                             |
| `renderToReadableStream(x, options)` and plain-data models `{ card: <Card /> }` (type errors under the default types)                                    | must not break: the call works and its arguments reach the runtime unchanged; CSS injection and warnings neither required nor forbidden |
| `createFileRoute('/')(makeOptions(...))` (factory-built options)                                                                                         | supported for build; in dev a full reload on every edit is acceptable, the edit must take effect                                        |
| Dynamic `import()` of a server-function module                                                                                                           | discouraged by the docs; the compiled module must still be correct (J4.7)                                                               |
| `const Deferred = Hydrate` then `<Deferred>`; `<Hydrate>` behind a plain wrapper component                                                               | not analysed for splitting; still defers hydration at runtime                                                                           |
| Dynamic `split={shouldSplit}` on `<Hydrate>`                                                                                                             | treated as split                                                                                                                        |
| Function-as-children, hook calls directly in extracted JSX, `this`/`super` captures inside `<Hydrate>` **without** `split={false}`                       | rejected with a clear error naming the fix (J5.5)                                                                                       |
| The same patterns **with** literal `split={false}`                                                                                                       | not extracted, not rejected; runtime behaviour as the framework defines it (C8)                                                         |
| esbuild with `autoCodeSplitting`                                                                                                                         | works or refuses clearly (J2.18)                                                                                                        |
| A standalone route-group-named file (`routes/(group).tsx`; route groups are documented as directories)                                                   | never fail silently: correct routing, a safe non-transform with an actionable diagnostic, or an error                                   |
| Unknown `%%tag%%` in a custom scaffolding template                                                                                                       | becomes an empty string; no test                                                                                                        |
| Big-endian or `--jitless` hosts for a native parser                                                                                                      | not a compiler requirement                                                                                                              |
| `.inputValidator()` on server functions and middleware (release-candidate name, removed in 1.169)                                                        | type-invalid input (§8); no requirement, no test (OQ15)                                                                                 |
| A dependency that contains Start API calls but is not discoverable (no peer dependency on `@tanstack/<fw>-start` / `start-client-core`) and not included | no automatic compilation requirement (J4.16)                                                                                            |
| A Start factory imported from an implementation module of a Start package (a deep path its `exports` do not expose)                                      | not reachable; no requirement                                                                                                           |
| A CommonJS dependency using sloppy-mode forms that break the app without Start too (a legacy octal escape, a `with` statement)                           | no requirement                                                                                                                          |

---

## 3. Cross-cutting rules (G)

- **G1 Semantics are preserved.** In every env the compiled program behaves as the source program would in that env
  under the documented runtime contract: same rendered output, loader and handler results, thrown errors, `Route`
  object, and exports an importer sees. Every emitted module parses and evaluates (no new free names outside dead
  code, G8). (R1)
- **G2 Only what is needed ships to each environment and chunk.** Code an env or chunk cannot execute is absent:
  server-only code in the client (hard, J4.12), split options in the route module (J2.5), code a chunk does not need
  (J2.5), modules imported only for types (J2.5). Compiler-level tests assert what the compiler alone decides
  (including what the split modules it emits contain, J2.5); final chunk and bundle contents are asserted on builds,
  per bundler, with `sideEffects` and `@__PURE__` hints varied. (R2)
- **G3 Surviving effects run once per environment, in a valid order, never duplicated or lost.** Preserve the
  observable effects and ordering dependencies of executable code that survives for an environment, after the
  documented removals: server-only code on the client (J4); client-only code on the server (J4.11: preferred for
  neutral names, required for `*.client.*` and marker files); type-only imports (J2.5); split options moved to
  chunks (J2.5); `deleteNodes` (J2.14); ordinary dead-code elimination (G8). Splitting must not duplicate an effect
  across derived modules or lose an effect that executed surviving code needs. Shared module state initialises once
  when evaluated, and every consumer sees the same value and instance (J2.4). Eager versus lazy initialisation of a
  shared binding is free: tests must not pin it through an otherwise unpinned position in an effect trace, and must
  not force an unrequested lazy module to load. This does not permit reversing surviving order-dependent effects,
  changing results, or duplicating initialisation. Printed statement and import order is free. How to check: a
  registration or configuration outcome detects illegal reordering; an initializer counter plus real consumers
  detects duplication and inconsistent values; a single total source-order trace is not a valid check. (R3)
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
  is checked at that severity. "The build fails" means it fails. (R5)
- **G6 Source maps.** Every emitted module derived from user source (route modules, split chunks, Start client, ssr
  and provider output, Hydrate chunks, rewritten import-protection modules) carries a map, so stack traces and
  import-protection reports resolve to the user's original line and column, through composed maps when other plugins
  transformed the file first. Purely generated support code (registries, mock helpers) needs no mapping. Map layout
  is free. This holds in dev as in build: the dev server serves maps for the route module and every derived module
  (split chunk, shared module, Start client and provider module). (R6)
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
  Import-protection mock/error policy (J6.3), diagnostics, HMR and dev id representation (J4.4) may differ as
  configured or documented. For the same configuration, which options are split, how they are grouped and which
  options `deleteNodes` removes are the same in dev and build.
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
  property or `export { a as b }`), and never code that was already dead before the transform. It is per module: a
  neutral module whose export only removed code uses is the user's (J4.12). A leftover import of a server-only or
  unresolvable module on the client, or of a client-only module on the server, is not dead code that may dangle
  (G8): it never reaches the bundler, so no browser stub, externalization warning or polyfill stands in for it. On
  the server, J4.11 keeps its allowance for neutral file names.

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
  as needed. A clear error naming the file is acceptable only for a name the conventions do not support.
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
  (modules the virtual config imports: OQ17c). A `tsr.config.json` edit may take effect only at the next route file
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
  `component` lazily from the SFC default export; it is not a lazy route module, and an empty `.lazy.vue` is not
  scaffolded with TypeScript route code. J1.8 and G5 hold throughout.

### J2 Route code splitting (router-plugin)

- **J2.1 Which modules.** Only file route modules, and in them only the `createFileRoute` / `createRootRoute` /
  `createRootRouteWithContext` call bound to `Route`. `createLazyFileRoute` modules are not split further (they are
  already lazy); non-route modules and code-based routes are returned unchanged. Vite, Rsbuild/Rspack, webpack;
  React, Solid, Vue.
- **J2.2 Which options and groupings.** Only `component`, `errorComponent`, `pendingComponent`, `notFoundComponent`
  and `loader` are split. Precedence: `codeSplitGroupings` in the file > `splitBehavior({ routeId })` >
  `defaultBehavior` > the default `[['component'],['errorComponent'],['notFoundComponent']]`; a property appears in at
  most one group. Options in one group load as one unit; different groups stay independently lazy (§5.3). Two options
  load as one unit when, once one loaded, loading the other fetches no new module holding user code (no file of the
  app, no compiled module other than one that only imports and re-exports). A small forwarding module per option
  over the group's module is acceptable (not ideal: bytes).
- **J2.3 Behaviour identical.** A split route renders, errors, pends, not-founds and loads exactly as the unsplit
  route; everything not configured for splitting (path parsing, search validation, `beforeLoad`, context, `head`,
  `scripts`, `staticData`, `ssr`, `server`, `headers`, …) stays eager in the route module.
- **J2.4 One instance.** Shared identity, state and once-only effects hold across the route, its importers and its
  chunks: `Route`, module state, and every exported function, class or constant (importers of a route-module export
  and the route itself get the same object; a copy of an exported declaration in a chunk is a bug, even a
  "stateless" one such as an exported function that reads `Route`). Pure helpers with unobservable identity may be
  copied or rewritten (§5.3). Prove identity through real consumers and effects, not declaration counts.
- **J2.5 Each chunk holds only what it needs.** The split option's code (and bindings only it uses) is absent from
  the route module. An import used only for types is dropped, so its module never loads in the client for that
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
- **J2.7 Root route.** The root `component` always renders and need not be split. Root `errorComponent` and
  `notFoundComponent` should be split (a goal pin); keeping the root unsplit is acceptable, not preferred (C1).
- **J2.8 Not split → user informed, never broken.** Every option configured for splitting ends up split. If a
  user-fixable pattern prevents it (e.g. the option's declaration is exported _and_ eagerly imported elsewhere, or a
  side-effectful initialiser with no purity hint), the option keeps working in the route module with one instance,
  and the run warns once naming the file, in every mode. If our analysis is the obstacle, that is a bug (a goal pin).
  Options the compiler cannot read statically (an options object imported from another module, factory-built
  options, a cast it does not unwrap) fall under this clause: split correctly or report once naming the file (the dev
  full-reload allowance for factory-built options stands). Under Start the client build never ships their
  `ssr`/`server`/`headers` silently: they are removed, or the build reports or fails clearly (J2.14, J4.12).
- **J2.9 Best-effort shapes.** Method-shorthand options split (and refresh) like any other. Spread or computed
  option keys: best effort, safe fallback (J1.9), never a silent wrong split. Initialiser timing of shared bindings
  is free: run once, same value everywhere.
- **J2.10 Same-file route factory** (§2.2). A correct split (renders, hot-updates), or unsplit plus a warning naming
  the file, in every mode; crashes or rendering the wrong component are bugs.
- **J2.11 Two `createFileRoute` calls in one module.** Never silently swap components: each renders its own, or the
  compiler warns or errors naming the file.
- **J2.12 Bindings the route module still reads stay declared.** Moving an option's declaration never removes an
  import or declaration another surviving statement (an exported wrapper, `head()`, an unsplit option, a top-level
  call) reads; the route module stays valid (G1, G8).
- **J2.13 Dev mode.** Splitting also happens in dev; virtual chunk modules resolve in every bundler's dev server;
  removing a split option the page had loaded does not break the page.
- **J2.14 `deleteNodes`.** Options named in `codeSplittingOptions.deleteNodes` are removed from that env's route
  module with the code only they use; Start sets `['ssr','server','headers']` on the client, so the `ssr` function,
  server handlers and `headers` never reach the client.
- **J2.15 Client route tree pruning (Start).** Routes whose only `createFileRoute` prop is `server`, with only such
  descendants, are removed from the client route tree, on Vite and Rsbuild alike. Every route with a client-visible
  prop survives, and so does every ancestor a surviving route needs (including a server-only ancestor of a
  surviving child). Server and provider trees keep all routes and handlers. Unknown or spread-derived props never
  cause pruning (J1.9).
- **J2.16 JSX runtime.** A chunk compiles its JSX under the same runtime and pragma semantics as its source module:
  the project's real JSX transform selects the same runtime for the chunk as for the untouched file. For a
  non-leading pragma comment (`/** @jsxImportSource … */` after the imports), the compiler keeps the original file's
  effective decision: a pragma the transform ignores in the untouched file (Oxc and esbuild honour leading comments
  only; Babel any) must not become effective in a chunk. Warning and leaving the file unsplit is also acceptable
  (J2.8). Tests assert the rendered outcome only, compiling the untouched and the compiled module with the project's
  real JSX transform and defaults, never comment placement or the runtime import's spelling.
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
  Vite and Rsbuild/Rspack (webpack lower priority); React, Solid, Vue.
- **J3.2 Component identity is kept for compatible edits.** For compatible hot updates, the router keeps its
  component and lazy-wrapper identity (React, and Solid and Vue split components too) and shows the new code. Where
  the framework's refresh can keep the mounted component and its state, the compiler and router must not cause a
  remount or state reset. Compatibility is the real framework's refresh contract, not an unchanged name (React
  Refresh remounts class components, changed hook signatures and forced resets). Framework-required replacement is
  allowed. Adding sibling route options next to an inline component (e.g. a `pendingComponent` and an
  `errorComponent` before an inline `component`) may remount it: the edit must show in place, its state need not
  survive. Renames must display the new component (J3.3). A subtree replacement is not a full reload (G10). Test
  split and unsplit routes with real framework tooling (§8). So: a compatible body-only edit that loses state because
  the router recreated its wrapper fails; an edit the framework must remount does not fail for that remount. Keeping
  Solid and Vue split-component identity is a requirement, not best effort.
- **J3.3 Every edit takes effect.** After an edit the page shows the new code: a new component body, a renamed
  component (a new Refresh family), a new split loader (even when only the chunk changed), an added or removed option
  (including a removed split option the page had loaded), with or without the framework's refresh plugin. A full
  reload is acceptable only for factory-built options (§2.2).
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
- **J3.9 Both styles.** `plugin.hmr.style: 'vite'` (accept callbacks) and `'webpack'` (re-execution, used by the
  rspack/webpack entries) satisfy J3.1–J3.4.
- **J3.10 Route tree edits in dev** (a new route file, a route kind change) reach the client tree and the page (reload
  allowed, J1.10).
- **J3.11 An update the router on the page does not have.** With a second router created after the app's (the route
  HMR code finds that one), an edit of a route file leaves the app working: the edit's component shows, the app's
  router still navigates, no error. Whether the edit also reaches the app's router is not required.

### J4 Start environment separation (start-compiler)

- **J4.1 `createServerFn` on the client.** The handler, the validation step and everything only they reference are
  absent; the exported value is still a callable server function with the same `method`, options and middleware
  list, calling the server by id over HTTP; `.url` works for forms. A schema or helper that surviving client code
  also uses stays.
- **J4.2 `createServerFn` on the provider.** The handler runs with its original semantics and closure; the function
  is registered under its id, so an HTTP call by id (with validation and middleware) runs it; the defining module's
  top-level code runs once in that env, even when the handler is extracted into a provider module. Only server
  functions the client references are HTTP-callable: a function no client code references must not answer a direct
  HTTP call by id. Calling a server function from server code is documented: a server function only server code
  calls (another handler, a middleware `.server()`, an SSR-only module) works for those callers in every production
  build, whether or not the client build found it, in any module processing order (G4).
- **J4.3 `createServerFn` during SSR.** Calling a server function while rendering runs the handler directly (no HTTP
  fetch), with the same result as an HTTP call. When SSR and the provider share an environment, the handler may stay
  in the SSR module or be looked up by id (§5.4). When the provider is a separate environment (RSC), the handler runs
  in the provider environment with its resolution conditions; how SSR forwards to it is free.
- **J4.4 Ids.** _Build_: ids are deterministic for unchanged input, identical in client, ssr and provider output of
  one build, de-duplicated with `_1`, `_2`… on collision, hashed by default (no path leak), and overridable through
  `serverFns.generateFunctionId({ filename, functionName })` (experimental). The form of `filename` (relative or
  absolute) and what `functionName` holds (today: the generated handler name, C5) are not specified: tests derive the
  expected id from the arguments received. Edits change the input, so ids need not survive edits. _Dev_: an
  implementation-specific lookup id is allowed; within one dev session every caller and the provider agree on it;
  ids need not match between dev and build (G13); `generateFunctionId` may or may not apply. A by-id request for a
  module the running dev server has not compiled yet (a page left open across a restart) compiles that module and is
  served. A server function is identified by its public `url`; generated names and Start's internal metadata fields
  (`serverFnMeta`) are not contracts.
- **J4.5 Recognition.** All Start builders are recognised through renamed imports, namespace members, re-exports
  (also of a namespace, and through diamonds and cycles of `export *`, in any compile order), aliases (`export const
createFooServerFn = createServerFn`), builders stored in variables and continued later (`const base =
createServerFn().validator(s); export const f = base.handler(h)`), user factories and wrappers in other modules,
  `createStart(...).createMiddleware`, `.middleware([...])` chains that return callable builders, and re-exports under
  string export names (`export { createServerFn as 'create server fn' }`). A configured builder passed in another
  builder's `.middleware([...])` contributes its middleware list. Option objects given by identifier or spread are
  ordinary input. Unrecognised shapes must not leak silently (J4.12): for a builder method called through a computed
  member (`createServerFn()['handler'](…)`, `createMiddleware()['server'](…)`) or a server-only fn whose result is
  member-called (`createServerOnlyFn(…).bind(null)`), the client holds no server code, or the build fails with an
  error at the call. Look-alikes are left alone (G15).
- **J4.6 Declaration sites.** Server functions declared at module top level work everywhere. A `createServerFn`
  nested in a function works when its handler captures no local binding (a goal pin). When it captures locals or is
  otherwise not extractable, the compiler either keeps the full semantics safely (client calls by id reach a server
  handler with the same result; nothing leaks) or reports a clear error naming the capture; a broken or leaking
  function is a bug. Other positions (default export, assignment, object property, class field, block) work or fail
  with a clear error naming the file.
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
- **J4.11 `<ClientOnly>`.** Server envs render only the `fallback` (children removed). On the server, declarations,
  imports and initialiser effects only client-only code reads (`<ClientOnly>` children, `createClientOnlyFn`) are
  dropped: required for files import protection denies on the server (`*.client.*`, the client-only marker), and a
  default server build reports no violation for such code; preferred, not required, for neutral file names (§5.12).
  The client keeps the children. Only the TanStack `ClientOnly` import is transformed.
- **J4.12 Hard rule: no server code in the client.** Handler bodies, `.server()` bodies, validators (J4.1),
  server-only helpers and imports, `createServerOnlyFn` bodies, and `ssr`/`server`/`headers` route options are absent
  from the production client bundle on every supported bundler, with side-effect hints varied; a declaration kept
  alive only by a type position (`typeof schema`) is dead and must go. Modules import protection denies for the
  client are absent too, subject to the configured policy: an edge import protection permits (`enabled: false`,
  `onViolation` returning `false`, an exempt importer or `excludeFiles` target, J6.6, J6.7) gets the real module. This
  also covers imports the client cannot resolve: a platform module only removed code uses (`cloudflare:workers` read
  in a handler or `.server()`, `node:*`, `bun:*`) does not fail the client build and is absent from client output,
  while the server build keeps it; how the compiler avoids resolving it is free (G16). "Only removed code uses" is
  judged per module: a neutral module imported for an export only removed code uses is the user's, and server-only
  helpers belong in `*.server.*` files. A dynamic `import()` inside a handler is an import only removed code uses: no
  client chunk is emitted for its target.
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
- **J4.16 Libraries.** A dependency written with Start APIs (uncompiled source) that Start's discovery selects (a
  package with `@tanstack/<fw>-start` or `@tanstack/start-client-core` in `peerDependencies`), or that the user
  includes for bundling, is compiled like app code in every env it takes part in. Discovery uses the app's configured
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
- **J5.5 Loud rejections when extraction is attempted.** For a boundary being extracted, function-as-children, hook
  calls directly inside the extracted JSX and `this`/`super` captures give a compile error naming the fix
  (`split={false}` or a child component); dynamic `split` counts as split. A boundary with literal `split={false}` is
  neither extracted nor rejected, and its runtime behaviour is the framework's (C8). These rejections are the
  specified outcome, not a limitation to remove (G5's "our limitation is a bug" does not apply). Each compilation
  that attempts the extraction rejects (the client compilation included).
- **J5.6 Only what is needed, when it is needed.** Child chunks are not modulepreloaded with the route; without
  `prefetch` (and apart from React's documented early hydration), a child chunk loads when the boundary is about to
  render or hydrate; `prefetch` may load it earlier. The documented initial-hydration versus later-mount behaviour,
  including `never()`, is preserved. A boundary inside code the production bundler removes leaves no chunk and no
  child code (per bundler, G2). A module only the children import is not downloaded before the boundary needs it;
  when its top-level code runs is free (G3).
- **J5.7 CSS stays route-linked.** CSS imported by split children stays discoverable for the route's SSR HTML (not
  deferred with the chunk).
- **J5.8 Semantics otherwise untouched.** `when`, `prefetch`, `onHydrated`, keys and context flow through as
  written; the function form of `when` runs on the client only. Extraction keeps context flowing into the children,
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
  error). `excludeFiles` (default `**/node_modules/**`) skips resolved-target checks. Option semantics follow the docs
  table (`client.specifiers` adds; `files`, `excludeFiles`, `server.specifiers` replace). Importers checked: those
  under `srcDirectory` (or `include`) minus `exclude`/`ignoreImporters`. Vite and Rsbuild; every Start env
  (client-type and server-type). A specifier rule matches the specifier **the user wrote**: a bundler rewrite of the
  import (e.g. Rsbuild `source.transformImport` turning `ui-lib` into `ui-lib/button`) does not bypass a denial of the
  original; file and marker checks apply to the rewritten edge's resolved target.
- **J6.2 Type-only edges are ignored**; mixed imports count.
- **J6.3 Behaviour.** Default dev `mock` (warn once, replace with a recursive-Proxy mock), default build `error`
  (fail the build); overridable globally or per mode, including `mock` in production builds; `enabled: false`
  disables everything. In mock mode (dev or build, client or server env) every violation is reported (the build or
  dev-time warning), and calling a mock gives a runtime diagnostic at the severity `mockAccess` sets (default
  `error`; `warn`; `off` silences), wherever a mock is served: dev and production, client and server. `mockAccess`
  changes nothing else. Which uses of a mock beyond a call it reports is free (§5.18). A test that expects silence
  sets `mockAccess: 'off'`.
- **J6.4 Only surviving edges are reported.** Build: violations are decided after compilation and tree-shaking.
  Dev: an edge the Start compiler itself removed from the importer's output (handler-only, `.server()`-only,
  server-only-fn-only imports) is not a violation and is neither reported nor mocked, whatever the request order,
  warm-up, pre-transform, lookup requests or full-bundle mode; edges that only bundler tree-shaking would remove may
  still be reported in dev.
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
- **J6.6 `onViolation`.** Called for every violation with the documented info; returning `false` allows the import:
  real module, no mock, no report (dev and build).
- **J6.7 Exemptions give the real module.** An importer exempted by `ignoreImporters`, `exclude` or outside
  `include` gets the real module, and nothing is reported for it; a denied target matched by `excludeFiles` is not
  checked at all; non-exempt importers of the same file are still mocked and reported.
- **J6.8 Mocking is complete.** In mock mode every reported edge is mocked for the non-exempt importer (including a
  denied file outside `include` imported from an included file); the mock exposes the bindings the importer names;
  no real value of the denied module (including inlined enum members) reaches the bundle. A mock is judged by safe
  behaviour through real consumers (named, default and namespace imports, also `ns[key]`; deep member reads, calls and
  construction do not throw; no denied initializer runs; no secret appears), never by a label or a primitive
  conversion (§5.18). A name re-exported with `export *` from a denied module (a denied file or specifier) is a
  complete safe mock; otherwise the build fails, and in dev the server warns at the `export *` (its file and
  position). Either way the denied module's value never reaches the client, and the importer of the name never fails
  to load in dev.
- **J6.9 Every entry counts.** Edges reachable from any entry of the env (router entry, start entry, client entry, a
  custom `src/server.ts`) are reported.
- **J6.10 Dependencies.** Files under `node_modules` skip file-pattern and marker checks by default, including a
  dependency marking itself server-only; `excludeFiles: []` turns them on again.
- **J6.11 Determinism.** The set of reported violations for a source tree and config does not depend on request
  order, caching, or which env transformed a module first (G4).
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
- **§5.2 Server-function ids** other than the default hashing, as long as deterministic, de-duplicated, equal across
  the envs of one build, and overridable in build (J4.4, G4); dev may use another id. Equal opaque ids between builds
  of one project at different roots are not required.
- **§5.3 Module layout**: virtual-module ids and query strings (`?tsr-split=`, `?tss-hydrate=`,
  `?server-fn-module-lookup`), chunk count and shape, shared-dependency chunks, where shared bindings live (shared
  module, chunk re-import, entry re-export), copying _pure, unexported, identity-unobservable_ helpers into a chunk or
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
- **§5.10 Root `component` split or not**; root `errorComponent`/`notFoundComponent` split preferred (J2.7).
- **§5.11 Dev-only extras**: HMR accept code shape, hot-data layout, Refresh registration mechanics, dev diagnostics.
- **§5.12 Dropping client-only-guarded declarations on the server for neutral file names** (preferred, J4.11).
- **§5.13 How a nested `createServerFn` is supported** (hoisting or any technique giving J4.6), and whether a
  capturing one is supported safely or rejected clearly.
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
- **OQ13: already-lazy option values.** For `component: lazyRouteComponent(() => import('../features/ReportsPage'))`
  (the docs recommend `createLazyFileRoute` instead): once the router preloaded the route, rendering it requests no
  new module and shows no pending fallback. Leaving already-lazy values in the route module and chaining the inner
  `preload()` both pass.
- **OQ14: a chunk for `component: Outlet`.** No requirement (emit a chunk, skip it or drop the property). No test.
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

| #   | Conflict                                                                                                                                        | Resolution                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `guide/code-splitting.md`: `__root.tsx` "does not support code splitting"                                                                       | J2.7: splitting root `errorComponent`/`notFoundComponent` is a goal; an unsplit root is the minimum                                                                     |
| C2  | `router-plugin/src/core/config.ts` JSDoc default grouping includes `pendingComponent`; `guide/automatic-code-splitting.md` does not             | J2.2 follows the docs                                                                                                                                                   |
| C3  | `guide/automatic-code-splitting.md`: exporting a route property bundles it into the main bundle                                                 | that is today's behaviour, not intent: J2.4, J2.8 (an unused export must not prevent the split; real eager consumers or impure initialisers keep one instance and warn) |
| C4  | `guide/import-protection.md`: dev may report imports that "would later be compiled away"                                                        | not a conflict: J6.4 separates edges the Start compiler removed (never reported) from edges awaiting bundler tree-shaking (may be reported in dev)                      |
| C5  | `guide/server-functions.md`: hash `filename + functionName`; `generateFunctionId` receives the generated handler name                           | J4.4 requires determinism and overridability only; what `functionName` holds is not specified                                                                           |
| C6  | `routing/virtual-file-routes.md` prose says `virtualRoutesConfig`                                                                               | the option is `virtualRouteConfig` (docs typo)                                                                                                                          |
| C7  | `guide/automatic-code-splitting.md` shows `createRoute('/posts')({...})` in a file-route example                                                | J2.1: file routes use `createFileRoute`/`createRootRoute*` only (docs typo)                                                                                             |
| C8  | React `HydrateProps` rejects function children even with `split={false}`; `deferred-hydration.md` recommends `split={false}` for them           | a types/docs mismatch, no compiler rule: with `split={false}` the compiler neither extracts nor errors (J5.5)                                                           |
| C9  | `renderToReadableStream` is typed one-argument under the default condition, `(data, options?)` under `react-server`; the docs show one argument | §2.2: two-argument and plain-data inputs must not break; no CSS or warning requirement                                                                                  |
| C10 | `guide/environment-variables.md` presents `server.build.staticNodeEnv` for Vite and Rsbuild; the Rsbuild plugin ignores it                      | out of scope (§1.2)                                                                                                                                                     |
| C11 | router-plugin `deleteNodes`/`addHmr` are public; Start overrides them                                                                           | §1.1 wiring; tests assert the per-env outcome; whether users may override them is a product decision                                                                    |
| C12 | `installation/with-esbuild.md` shows `autoCodeSplitting: true` on esbuild                                                                       | J2.18: works or refuses                                                                                                                                                 |
| C13 | `docs/router/quick-start.md`: Router "only compatible with React and Solid"                                                                     | Vue is in scope (the types and packages exist); feature exceptions in §1.3                                                                                              |
| C14 | "SSR RPC" (handler replaced by an id lookup) as job 4 was first stated                                                                          | J4.3: in place or extracted when SSR and the provider share an environment; with a separate provider the handler runs there                                             |
| C15 | `guide/middleware.md`: "on the server, nothing is tree-shaken"                                                                                  | true for middleware (a `.client()` callback is not a client-only boundary); J4.11 concerns `<ClientOnly>` and client-only fns                                           |
| C16 | `guide/import-protection.md` table omits `mockAccess`; `schema.ts` exposes it                                                                   | J6.3 includes it (runtime diagnostics only)                                                                                                                             |
| C17 | `api/router/createLazyFileRouteFunction.md`: lazy files hold only four component options                                                        | not a conflict: J2.1 leaves lazy modules unsplit because they are already lazy; splitting them further would violate nothing                                            |

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
  correct module a binding lands in (§5).
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
- J6.11 in full generality (pins cover warm-up, pre-transform and entry order).
- J3.4 webpack stale hot-data id: no reachable scenario shown yet.
- J1.10 equal-mtime double save: plausible with format-on-save, not reproduced with a real editor.
- J1.6/J1.10 within one run: a save that lands between the generator's read of a route file and its rename over it
  is kept, and a reader sees only complete contents, also when a write or rename fails. No deterministic reproduction
  through real files and a public API. J1.16's rename beside the destination is pinned with a real second filesystem.
