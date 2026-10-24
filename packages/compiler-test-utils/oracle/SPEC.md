# SPEC: what a good TanStack Router/Start compiler must do

This is the yardstick of the compiler test oracle. It was written from the goal (what users and the docs need), not
from today's tests or implementation. The tests cite its clause ids (`J4.12`, `G3`, `§5.7`, …); every clause id a
test cites is defined here. How to use the suite: [README.md](./README.md). Rulings behind the clauses:
[RULINGS.md](./RULINGS.md). Known bugs of today's compiler: [KNOWN-BUGS.md](./KNOWN-BUGS.md).

Sources, applied in this order, later ones winning: the maintainers' rulings ([RULINGS.md](./RULINGS.md)), then the
product docs in `docs/router` and `docs/start`, then the public types and options of the packages. Implementation
code establishes reachability and architecture, never desired behaviour. "Common sense" clauses carry a one-line
justification.

Source tags: `[ruling: …]` an entry of [RULINGS.md](./RULINGS.md); `[doc: file:line]` the product docs (paths under
`docs/router` or `docs/start`); `[type: file]` a public type or option; `[wiring: file]` the plugin wiring;
`[cs: …]` common sense; `R1`–`R7` the seven cross-cutting rules below. Source line numbers are those of the branch
the spec was written against; they may drift.

The seven cross-cutting rules (`R1`–`R7`); the G rules of §3 refine them:

- **R1** Same runtime semantics, just placed in different modules.
- **R2** Each environment and chunk contains only what it needs (dead-code elimination is a means, not an end).
- **R3** No code runs twice, none is lost (module state is initialised once).
- **R4** Deterministic ids and output, consistent across server and client.
- **R5** Unsupported input gives a clear error, a warning or a safe non-transform; never silently wrong output.
- **R6** Source maps point to the user's code.
- **R7** Development-only additions never reach production.

Vocabulary. _Mode_: `dev` (dev server, watch) or `build` (production bundle). _Environment_ (env): `client` (browser
bundle), `ssr` (server env that renders pages and calls server functions directly), `provider` (server env/module that
Start loads to run a server-function handler by id; may be the same env as `ssr`), `rsc` (react-server env when RSC is
enabled; it is the provider env on Vite). "Server envs" = ssr, provider, rsc. _Bundler_: Vite (incl. Rolldown-Vite),
Rspack/Rsbuild, webpack (lower priority). _Framework_: React, Solid, Vue. _Split option_: one of `component`,
`errorComponent`, `pendingComponent`, `notFoundComponent`, `loader`. _File route module_: a module the generator
registered from the routes directory (or a virtual-route config) that exports `Route` from `createFileRoute`,
`createLazyFileRoute`, `createRootRoute` or `createRootRouteWithContext`.

---

## 1. Scope

### 1.1 In scope

The seven code-manipulation jobs below, in every supported mode/env/bundler/framework (§1.3), plus the
plugin wiring that decides which modules each job sees and how its output reaches each bundler:

| Job                               | Owner package                                  | One-line goal                                                                                                                                                          |
| --------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J1 Route file upkeep              | router-generator                               | keep `createFileRoute('/path')` / `createLazyFileRoute` and the import in sync with the file's location; generate the route tree (runtime + types); touch nothing else |
| J2 Route code splitting           | router-plugin (+ router-utils)                 | split options load lazily from separate chunks with identical behaviour; each chunk holds only what it needs                                                           |
| J3 Route HMR (dev only)           | router-plugin                                  | an edited route updates in place, keeps component identity; nothing of it in production                                                                                |
| J4 Start environment separation   | start-plugin-core (start-compiler)             | server code never reaches the client; every env sees the behaviour the runtime contract promises                                                                       |
| J5 Deferred hydration `<Hydrate>` | start-plugin-core (+ react/solid-start-client) | children move to a lazy chunk on the client; `fallback` leaves the server; hydration identities agree                                                                  |
| J6 Import protection              | start-plugin-core                              | cross-environment imports are reported where they survive compilation; mock in dev, error in build                                                                     |
| J7 RSC CSS injection              | react-start-rsc                                | CSS of server-rendered components reaches the client with the RSC payload                                                                                              |

Wiring in scope: which modules the router-plugin compilers process (file routes only), Start's per-environment
settings for the router plugin (`deleteNodes: ['ssr','server','headers']` and `addHmr: true` on the client,
`addHmr: false` on the server; Start enables the splitter in its normal supported wiring and does not expose
`autoCodeSplitting`, `start-plugin-core/src/schema.ts:6-8`, J2.21), client route-tree pruning of server-only subtrees, how virtual modules
(split chunks, Hydrate chunks, mock modules, server-fn provider modules) are resolved by each bundler, and the
ordering of the compilers on one module (they must compose, G11).

### 1.2 Out of scope (with reasons)

- **Prerender discovery and SPA-mode prerendering** (`TSS_PRERENDABLE_PATHS`, `pages`, `prerender.*`,
  `spa.*`): ruled out `[ruling: prerender discovery]`. Only the safety rule J1.9 survives (never skip a route
  because a route-option key was missed).
- **Dev-server middleware, request handling, SSR runtime, serialization, manifest serving**: runtime, not code
  manipulation.
- **Debug/perf plumbing** (`TSR_VITE_DEBUG`, timing logs, compile-speed benchmarks): `[ruling: D4]`.
- **Code-based routing for the router-plugin compilers**: `createRoute`/`createLazyRoute` modules are split by hand
  with `.lazy()`; the splitter and route HMR never see them `[ruling: one route per file; doc: guide/code-splitting.md:74,320-343]`. The Start compiler (J4) still processes every module.
- **Published client source maps containing stripped server source** (`sourcesContent`): known limitation, no test
  `[ruling: D1]`.
- **Static server functions**, **ISR**, **sitemap**, **inlineCss**, **cdn asset URLs**: runtime/middleware features
  with no compiler step of their own.
- **Router runtime semantics** (matching, loaders, `ssr` inheritance): router-core's contract; the compilers only
  have to preserve it (G1).
- **esbuild**: no work `[ruling: D3]`; the only requirement is J2.18 (works or clear refusal).
- **Unused exported router-generator helpers**: product change, not test work.
- **`server.build.staticNodeEnv` on Rsbuild** (C10): build configuration; not pinned in the corpus.
- **Runtime bugs.** A pin of the oracle has its cause in a compiler: the J1–J7 sources or their bundler
  integrations. Babel, babel-dead-code-elimination and unplugin count as the current compilers' implementation
  choices, so their bugs are compiler bugs. A bug caused by a runtime package (for example a hydration boundary in
  `react-start-client`) is out of scope, even when a compiler test finds it `[ruling: runtime bugs]`.
- **Exported compiler internals and raw factory exports** (router-utils/Start-compiler helpers, the root
  `unpluginRouterGeneratorFactory`-style unplugin factories, compiler extension callbacks and directive options):
  not user contracts. Tests of them are internal controls (§8), not acceptance.
- **Filesystem metadata policy of the generator** (file mode/owner retention, `chown` failure handling): not part of
  J1.2; existing tests are implementation/filesystem regressions outside acceptance.

### 1.3 Acceptance matrix (what "every supported combination" means)

Router J1–J3 cover React, Solid and Vue on the supported Vite, Rspack/Rsbuild and webpack entries, in the modes
that apply (generation, dev, build); webpack is low priority `[ruling: D3]`. Start J4 and J6 cover Start's Vite and
Rsbuild integrations `[doc: start guide/hosting.md:7]` and every Start-created participating environment,
including a separate provider environment where one is configured (RSC): Vite's `rsc` environment, and on
Rsbuild the `rsc` layer in which the split server-function provider modules compile with `react-server`
conditions (`start-plugin-core/src/rsbuild/plugin.ts:467-495`); both are participating environments of J4, J6
and J7 `[doc: guide/server-components.md:89 "Vite 8+ or Rsbuild 2+"]`. J5 covers React and Solid on those Start
integrations (`Hydrate.tsx` exists in `react-start-client` and `solid-start-client` only). J7 covers React with
RSC enabled under its documented prerequisites (React 19+, Vite 8+ or Rsbuild 2+ `[doc: guide/server-components.md:89]`). Tests cover compiler-disabled settings (`autoCodeSplitting: false`,
`addHmr: false`, `importProtection.enabled: false`, `rsc` off) as well as defaults and enabled settings; disabled-
feature rows are scoped to options the integration actually exposes, and the matrix inherits every §2.2 exception.
Bundler-decided dead-code elimination is asserted on production output; HMR is asserted with the real dev tools
(§8). No obligations are invented for Start on webpack, `<Hydrate>` on Vue, or environments Start did not create
(2.2).

---

## 2. Supported inputs

### 2.1 What a user can write

- **Language**: any valid TypeScript/TSX (and JS/JSX) module the project's bundler accepts: type-only imports and
  exports, `satisfies`, non-null assertions, `as` casts, decorators, class fields, `import … with { type: 'json' }`
  and the deprecated `assert` form `[ruling: D9]`, JSX pragmas (`@jsx`, `@jsxFrag`, `@jsxRuntime`, `@jsxImportSource`)
  `[cs: compilers must accept whatever the framework's JSX transform accepts]`, CRLF line endings, BOM-free UTF-8,
  file names with any character the OS allows (e.g. `what's-new.tsx`) `[cs: the generator writes string literals from file names]`. Non-JS modules that compile to JS before our transforms (`.vue`, `.mdx`) are
  inputs of J6. Other non-JS modules (CSS, JSON, Markdown, `?raw` text) are never transformed by the JS compilers,
  even when their text contains an API name such as `createServerFn(` (G1) `[fix #5526 (commit 2824bf7c01) for #5525]`. `.js`/`.jsx` modules are compiled like `.ts`/`.tsx`.
- **Routing setups** `[doc: routing/route-trees.md:57-65]`: flat, directory, mixed file-based routing; virtual file
  routes (`virtualRouteConfig` as path or object, `physical()`, `__virtual.ts` subtrees); code-based routing (J4
  only). One route per file route module, exported as `Route` `[ruling: one route per file; doc: api/router/createFileRouteFunction.md:22; createLazyFileRouteFunction.md:33]`. File naming conventions of
  `routing/file-naming-conventions.md` with the configurable `indexToken`/`routeToken` (string or regex),
  `routeFilePrefix`, `routeFileIgnorePrefix`, `routeFileIgnorePattern` `[type: router-generator/src/config.ts]`.
  `.lazy.tsx` files with `createLazyFileRoute` holding only the four component options
  `[doc: guide/code-splitting.md:107-115]`. Vue component pieces (`x.component.vue`, `route.component.vue`) are
  intentional generator inputs (the "Vue-native way", `getRouteNodes.ts:220-235`; loaded as the SFC default export,
  `generator.ts:739-765`) though undocumented; `x.lazy.vue` is a lazily loaded `component` piece (J1.17) `[ruling: .lazy.vue]`.
- **Route options** `[doc: api/router/RouteOptionsType.md]`: the five split options as identifiers, inline
  function/arrow expressions, method shorthand (`component() {…}`) `[ruling: first review rulings]`, string-literal keys,
  wrapped identifiers (`X as any`, `memo(X)`, `withAuth(X)`), imported bindings; `codeSplitGroupings` per route
  `[doc: guide/automatic-code-splitting.md:166-185]`; `ssr`, `server`, `headers`, `head`, `scripts`, `beforeLoad`,
  `loader`, `validateSearch`, `staticData`, etc. Spread and computed keys are _best effort_ (J2.9, J1.9).
  `shellComponent` exists only on the root route `[ruling: shellComponent]`.
- **Start APIs** (React, Solid and Vue packages `@tanstack/<fw>-start`; `[type: start-plugin-core import-protection/defaults.ts]` lists all three): `createServerFn(opts?)` with `.middleware([...])`,
  `.validator(fn|schema)`, `.handler(fn)`; `createMiddleware({ type: 'request' | 'function' })` with
  `.middleware`, `.validator`, `.client`, `.server`; `createStart(...).createMiddleware` `[type: start-client-core/src/createStart.ts:74]`; `createIsomorphicFn().server(fn).client(fn)` in either order, partial or
  empty; `createServerOnlyFn(fn)`, `createClientOnlyFn(fn)`; `<ClientOnly fallback>` from the router package.
  **These J4 builders** may be reached through renamed imports, namespace imports, re-exports, user
  factories/wrappers in other modules, builders stored in variables, and factory functions that return builders
  `[doc: guide/middleware.md:817-896 (factories); server-functions.md:134-150 (static imports are safe)]`.
  `<Hydrate when prefetch split fallback onHydrated>` from `@tanstack/react-start` / `@tanstack/solid-start` has the
  narrower J5.1 contract (static import, rename allowed, direct static namespace member `<Start.Hydrate>`; no
  variable indirection or opaque wrappers) `[ruling: namespace imports; doc: guide/deferred-hydration.md:667-695; type: react-start-client/src/Hydrate.tsx]`. RSC helpers
  `renderServerComponent`, `createCompositeComponent`, `renderToReadableStream` from `@tanstack/react-start/rsc`
  (React only) are recognised through the two module names, import renames and direct static namespace members
  (`RSC.renderServerComponent(...)`), not through project re-exports or wrappers (J7.2) `[ruling: namespace imports; doc: guide/server-components.md]`.
- **Import-protection inputs** `[doc: guide/import-protection.md]`: `*.server.*` / `*.client.*` file names, the
  `/server-only` and `/client-only` marker imports, every option of `ImportProtectionOptions`
  `[type: start-plugin-core/src/schema.ts]` including `mockAccess` (undocumented but public).
- **Bundlers and frameworks**: see §1.3 `[ruling: D3; doc: routing/file-based-routing.md:116-129; start guide/hosting.md:7; type: router-generator config target enum; router-plugin framework-options.ts]`.
- **Modes**: dev (Vite dev server incl. full-bundle mode, Rsbuild dev, webpack dev) and build (production), for each
  env the bundler/Start creates.
- **Plugin options**: all of `router-plugin/src/core/config.ts` (`autoCodeSplitting`, `codeSplittingOptions.{
splitBehavior, defaultBehavior, deleteNodes, addHmr }`, `plugin.hmr.style`, `plugin.vite.environmentName`),
  all of `router-generator/src/config.ts`, and `tanstackStart({ router, serverFns.generateFunctionId, importProtection,
rsc, srcDirectory, … })` `[type: start-plugin-core/src/schema.ts]`. Which clauses a switch turns on or off: J2.21,
  J3.7, J6.3, J7.1.

### 2.2 Explicitly unsupported or undefined (cite)

| Input                                                                                                                                                                      | Status                                                                                                                                                                                              | Source                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| A second route object in a file route module (`export const extra = createRoute(...)`)                                                                                     | unsupported; no HMR/split requirement; tests built on it are unrealistic                                                                                                                            | `[ruling: one route per file]`                                              |
| Two `createFileRoute` calls in one module                                                                                                                                  | unsupported; must never fail silently (J2.11)                                                                                                                                                       | `[ruling: one route per file]`                                              |
| A route created inside a function in the same file (`function make() { return createFileRoute(...) }`, R-09)                                                               | unsupported but user-fixable: correct split OR unsplit + warning naming the file; silent wrong output always fails                                                                                  | `[ruling: R-09]`                                                            |
| Compiling Start output a second time (plugin registered twice, dependency shipping Start-compiled output)                                                                  | unsupported; even an internal error is fine                                                                                                                                                         | `[ruling: recompiling Start output]`                                        |
| The router plugin registered more than once in one app (two `tanstackRouter()`, each with its own routes)                                                                  | unsupported; no test                                                                                                                                                                                | `[ruling: Q8]`                                                              |
| Import protection in environments the user adds outside Start                                                                                                              | undefined behaviour; no test either way; lean "left alone" if ever forced                                                                                                                           | `[ruling: user-added environments]`                                         |
| `renderToReadableStream(x, options)` and plain-data models `{ card: <Card /> }` (TS errors under default types)                                                            | must not break: call works, options/model reach the runtime unchanged; CSS injection and warnings neither required nor forbidden (a later ruling may add CSS support)                               | `[ruling: RSC undocumented inputs]`                                         |
| `createFileRoute('/')(makeOptions(...))` (factory-built options)                                                                                                           | supported for build; in dev a full reload on every edit is acceptable, the edit must take effect                                                                                                    | `[ruling: route options from a function call]`                              |
| Dynamic `import()` of a server-function module                                                                                                                             | discouraged by docs; the compiled module must still be correct (J4.7)                                                                                                                               | `[doc: guide/server-functions.md:152-158]`                                  |
| `const Deferred = Hydrate` then `<Deferred>`; `<Hydrate>` behind a plain wrapper component                                                                                 | not analysed for splitting; still defers hydration at runtime; no extraction requirement                                                                                                            | `[doc: guide/deferred-hydration.md:682-695,741-745]`                        |
| Dynamic `split={shouldSplit}` on `<Hydrate>`                                                                                                                               | cannot opt out at compile time; treated as split                                                                                                                                                    | `[doc: deferred-hydration.md:697-698]`                                      |
| Function-as-children, hook calls directly in extracted JSX, `this`/`super` captures inside `<Hydrate>` **without** `split={false}`                                         | rejected with a clear error naming the fix (J5.5)                                                                                                                                                   | `[doc: deferred-hydration.md:700-707]`                                      |
| The same patterns **with** literal `split={false}`                                                                                                                         | not extracted, not rejected by the compiler; runtime behaviour as the framework defines it (React's `HydrateProps` type rejects function children — a types/docs mismatch, C8, not a compiler rule) | `[doc: deferred-hydration.md:704-707]`                                      |
| esbuild with `autoCodeSplitting`                                                                                                                                           | works OR clear refusal; no work                                                                                                                                                                     | `[ruling: D3]`                                                              |
| A standalone route-group-named file (`routes/(group).tsx`); route groups are documented as directories only                                                                | undocumented: never fail silently (correct routing, a safe non-transform with an actionable diagnostic, or an error); no specific channel required                                                  | `[doc: routing/routing-concepts.md:627-643; file-naming-conventions.md:15]` |
| Unknown `%%tag%%` in a custom scaffolding template                                                                                                                         | becomes an empty string; fine                                                                                                                                                                       |                                                                             |
| Big-endian / `--jitless` hosts for a native parser                                                                                                                         | not a compiler requirement                                                                                                                                                                          | `[cs: platform support is the implementation's packaging concern]`          |
| `.inputValidator()` on server functions and middleware (release-candidate name, removed in 1.169)                                                                          | type-invalid input (§8). Today the client/SSR output keeps the call, strips the handler and throws `TypeError` at load; no handler code leaks. No compiler requirement, no test (OQ15)              | `[doc: migrate-from-release-candidate.md:19]`                               |
| A dependency that merely contains Start API calls but is not discoverable (no peer dependency on `@tanstack/<fw>-start` / `start-client-core`) and not explicitly included | no automatic compilation requirement (J4.16)                                                                                                                                                        | `[wiring: vite/plugin.ts:133-158]`                                          |

---

## 3. Cross-cutting rules (G)

- **G1 Semantics are preserved.** For every env, the compiled program behaves as the source program would in that
  env under the documented runtime contract: same rendered output, same loader/handler results, same thrown errors,
  same `Route` object, same exports an importer sees. Every emitted module parses and evaluates (no new free names
  outside dead code, G8). `[R1]`
- **G2 Only what is needed ships to each environment and chunk.** Code an env or chunk cannot execute is absent:
  server-only code in the client (hard, J4.12), split options in the route module (J2.5), code a chunk does not
  need (D5), modules imported only for types (L3). Compiler-level tests assert what the compiler alone decides
  (including the contents of the split modules it emits, within J2.5's D5 boundary); final chunk/bundle contents
  are build-level assertions per bundler, varying `sideEffects`/`@__PURE__` hints.
  `[ruling: first review rulings, L3, D5; R2]`
- **G3 Surviving effects: once per environment, ordering dependencies kept, never duplicated or lost.** Preserve
  the observable effects and ordering dependencies of executable code that survives for an environment, subject to
  the explicit environment-removal, type-only-import, dead-code-elimination and initializer-timing rulings (server-
  only code on the client, J4; client-only code on the server, J4.11 — preferred for neutral names, required for
  `*.client.*`/marker files; type-only imports, L3/J2.5; split options moved to chunks, J2.5; `deleteNodes`, J2.14;
  ordinary dead-code elimination under R2/G8). Splitting must not duplicate an effect across derived modules or lose
  an effect required by executed surviving code. Shared module state initializes once when evaluated, and every
  consumer observes the same value and instance (J2.4). Eager versus lazy initialization of a shared binding is not
  pinned; tests must not indirectly pin it by requiring an otherwise unpinned position in an effect trace, and must
  not force an unrequested lazy module to load. This freedom does not permit reversing ordinary surviving
  order-dependent effects, changing required results, or duplicating initialization. Printed statement/import order
  is free. Oracle boundary: a registration/configuration outcome detects illegal reordering; an initializer counter
  plus real consumers detects duplication and inconsistent values; a single total source-order trace covering eager
  and movable initializers is not a valid universal oracle. `[ruling: first review rulings, L3, client-only declarations on the server; R3]`
- **G4 Determinism.** Identical effective source identities, configuration, compilation mode and environment
  produce deterministic observable output (ids, module graph shape, warnings), independent of incidental scan,
  request or processing order. Within each build or dev session, callers and providers agree on protocol ids, and
  server/client hydration identities agree for corresponding boundaries. Production server-function ids satisfy the
  documented default hashing, collision handling and customization contract (J4.4); development may use
  implementation-specific module locators, and ids need not match between modes. Path-bearing configuration
  (`importRoutesUsingAbsolutePaths`, cwd-relative `tmpDir`) and custom generators (`generateFunctionId`) may depend
  on their resolved inputs. Relocating a project must preserve correct compilation, runtime behaviour and
  within-build identity agreement, but equality of opaque ids between the original and relocated builds is not
  required absent an explicit relocation-stability contract — the docs promise stable, path-concealing hashes and
  recommend deterministic inputs, not root independence `[doc: guide/server-functions.md:417-430]`. Route ids and
  paths must still follow their documented routing conventions (J1.4, J1.5), which is what makes the generated route
  tree independent of cwd and OS path separators. `[R4]`
- **G5 Diagnostics: never fail silently.** Unsupported input yields an error, a warning, or a safe
  non-transform; never silently wrong output. When a user-fixable pattern prevents the intended transform, the user
  is told once per file (naming the file), in every mode. When the obstacle is our own limitation, that is a bug to
  fix (goal pin), not a warning to document. Errors about the user's source name the file and carry a position in
  it; configuration or resolution errors need no fabricated source position. Tests check a diagnostic only for its
  file and position (and its severity where the clause gives one): the wording, the API or option it names and the
  cause it gives are not checked. "Warn" means at least a warning (an error where refusal is allowed); an info or log
  line does not count.
  `[ruling: D11, D14, diagnostic severity, diagnostics: file and position only; R5]`
- **G6 Source maps.** Every emitted module derived from user source (route modules, split chunks, Start
  client/ssr/provider output, Hydrate chunks, rewritten import-protection modules) carries a map so stack traces
  and import-protection reports resolve to the user's original line and column, through composed maps when other
  plugins transformed the file first. Purely generated support code (registries, mock helpers) needs no fictitious
  user mapping. Exact map layout is free. Publishing stripped server text through `sourcesContent` is a known
  limitation, not a requirement (D1). This holds in dev as in build: the dev server serves maps for the route
  module and every derived module (split chunk, shared module, Start client/provider module), so a thrown error
  or a breakpoint resolves to the user's file and line. `[ruling: D1; R6]`
- **G7 Nothing dev-only in production.** Production artifacts contain no additions whose purpose is exclusively
  development: HMR accept/dispose code, hot-data wrappers, dev-only warnings/diagnostics, development mock
  modules, `console` diagnostics gated for development. Explicitly configured production behaviour stays: a
  production `importProtection.behavior: 'mock'` and its `mockAccess` diagnostics `[doc: import-protection.md: 85-145; type: schema.ts:34-42]`. Build-time console output is allowed on a successful build when it is required
  or configured: not-split warnings (J2.8), import-protection reports, generator logs unless `disableLogging`
  (J1.12). G7 targets additions by purpose, not spellings: tests identify dev-only support (including renamed or
  imported support) by comparing with a real build where the feature is off, and do not ban every occurrence of
  a workspace path or every success log (only J4.4 forbids path leaks, in default server-function ids). `[ruling: D11; R7]`
- **G8 Dead code may dangle.** A compiled module may reference an undefined name inside code that never runs, if every
  supported bundler deletes that code in the production build. A dangling name that survives into a production client
  bundle is a bug. Validators approximate "deleted by the bundler" with real bundler tree-shaking, never a narrower
  hand-rolled rule. The check runs on the artifact actually emitted under its effective settings (an unminified
  build is checked unminified, not through a separately minified copy), and a name that is a real global of the
  target environment (`window`, `name`, `status`, …) is not dangling, nor is a name the module checks with `typeof`
  (in that module: another module's check does not excuse an unguarded read).
  (A compiler that drops a local whose name is also such a global is not detected by this check.) The check covers exactly the modules the compilers under test produced
  or changed: user and route modules after our transforms, split chunks, virtual and support modules, and any
  dependency module one of our plugins transformed. Inside that scope every free name counts, unless the module's
  original source already reads it free (valid third-party code such as a function only ever `.toString()`-ed).
  Modules no compiler under test touched are out of scope: what a bundler does inside them (Rspack and webpack drop
  some bindings in unminified dead code) is not the compiler's defect. `[ruling: dangling names]`
- **G9 Exported bindings: one instance, free export lists, black-box names.** Every export something actually imports
  (another module, test file, other route) keeps working with the same value and the same instance the owning module
  uses; the module's export list may otherwise grow or shrink. Generated identifier names, virtual-module ids and
  query strings are not observable contracts. `[ruling: P1, generated names, exported Route readers]`
- **G10 Hot updates over reloads.** Where a hot update is feasible, dev edits must not full-reload (client or server);
  tests may require "no full reload" there and never require a full reload. Which in-memory state survives is the
  bundler's business: no server-state preservation requirement. `[ruling: dev edits and full reloads]`
- **G11 Compilers compose.** When several jobs touch one module (Start compiler + splitter + Hydrate + RSC CSS + route
  HMR + import-protection rewrite), every clause holds on the final output, in every order the wiring may apply them.
  For a user plugin order the docs do not support (e.g. a JSX plugin registered before the router plugin), a
  correct result or an actionable order diagnostic are both acceptable; neither a refusal of a working order nor
  a specific message is required. Module identity follows the participating environment's resolver and loader:
  compiler dependency discovery and generated virtual modules resolve through the host (aliases, conditional
  exports, symlinked packages); module identities whose behaviour differs (meaningful queries or virtual ids, a
  package's `react-server` versus default export) are never conflated, while identical ones may be shared. The
  documented alias setups (`resolve.tsconfigPaths` on Vite, tsconfig `paths` on Rsbuild) compose with every job; a
  third-party resolver plugin such as vite-tsconfig-paths is a user plugin under the previous sentence, and a
  silent import-protection bypass through it is not a "correct result". `[cs: each feature is documented independently of the others; doc: start guide/path-aliases.md; start-plugin-core/AGENTS.md:3]`
- **G12 Printing fidelity.** Code the compiler does not own is reproduced with identical semantics: directives,
  pragmas (their effective JSX-runtime decision, J2.16), comments where feasible, parentheses required by
  precedence, string escapes. License comments (`/*!`, `@license`, `@preserve`) stay in the source module when the
  splitter moves or removes the code below them; other orphaned comments are free (R-14). R-14 binds the splitter
  only: where the Start compiler (server-function handler extraction, environment functions, Hydrate extraction)
  and the import-protection rewrite put license comments is free, with no test either way. Upstream printer bugs
  that change meaning are our bugs from the user's point of view. `[ruling: R-14, OQ12; R1]`
- **G13 Mode parity.** In each mode, compilation preserves the behaviour required by that mode's effective
  configuration and public runtime contract. Equivalent settings preserve equivalent application semantics, subject
  to documented mode-specific behaviour. Import-protection mock/error policy (J6.3), diagnostics, HMR and
  implementation-id representation (J4.4) may differ as configured or documented; these differences are not parity
  failures. For the same effective configuration, which options are split, how they are grouped and which options
  `deleteNodes` removes are the same in dev and build. ` [doc: guide/automatic-code-splitting.md:27 (transform in development and at build); doc: guide/import-protection.md:85-145; type: schema.ts:24-32]`
- **G14 Idempotence is not required.** See 2.2 (recompiling output).
- **G15 Recognition is by binding identity, not spelling.** Every compiler recognises its APIs through the lexical
  binding and its module provenance (import from the TanStack package, through the supported alias/re-export/factory
  forms of each job). A locally declared or shadowed `createServerFn`/`Hydrate`/`createFileRoute`, the same name
  exported by an unrelated package, and unrelated `.handler()`/`.server()`/`.client()`/`.validator()` methods are
  left untouched with their own semantics; generated names never collide with user bindings. For route-file
  upkeep, the generator may recognise and repair the designated `Route` declaration's missing factory import under
  J1.1; pre-existing import provenance is not required for that repair. This exception does not authorise rewriting
  unrelated or shadowed user bindings. Semantic transforms must distinguish genuine APIs from look-alikes. `[doc: deferred-hydration.md:667-695]`

---

## 4. Per-job clauses

### J1 Route file upkeep (router-generator)

- **J1.1** When a route file's location (or the virtual config) implies a route path, the string literal in
  `createFileRoute('…')` / `createLazyFileRoute('…')` is inserted or rewritten to that path, and the factory import
  is added from the target framework's router package if missing. Root files use `createRootRoute*` without a path.
  Modes: dev (watch) and the `generate` command. When the existing argument is not a string literal (an identifier,
  a template literal), replacing it with the correct literal (J1.2 still holds elsewhere) and an actionable
  diagnostic naming the file are both acceptable; tests accept either outcome `[ruling: valid alternative compilers]`. `[doc: api/router/createFileRouteFunction.md:15-22; createLazyFileRouteFunction.md:15]`
- **J1.2** Nothing else in the file changes: other statements, comments, formatting, line endings and the file's
  encoding are byte-preserved outside the edited literal and the import statements. Newly scaffolded files follow
  `quoteStyle` and `semicolons`. Within the edited argument the quote character is free. How the generator adds,
  moves or drops the factory's binding is free: it may write a new import or edit, merge, split, reorder or reprint
  any import statement `[ruling: Q10]`, as long as every other binding keeps its imported and local name, source
  module, type/value meaning and import attributes, and every side-effect import stays; keeping or removing a
  factory import the edit made unused (e.g. `createFileRoute` after a switch to `createLazyFileRoute`) are both
  allowed. Filesystem metadata (mode, owner)
  is outside this clause (§1.2). `[doc: api/file-based-routing.md:171-187]`
- **J1.3** An empty route file is scaffolded from the default template or `customScaffolding.{routeTemplate,
lazyRouteTemplate}`; `.lazy.tsx`/`.lazy.ts` files get the lazy template (a `.lazy.vue` piece is an SFC, not a
  route module, and gets no TypeScript route scaffold, J1.17). `[ruling: unknown template tag, .lazy.vue; type: router-generator config customScaffolding]`
- **J1.4** The generated route tree (`generatedRouteTree`) contains exactly the routes the conventions and options
  select from the route files (prefix/ignore options, tokens, `(group)` folders, `[x]` escaping, `-` prefix
  exclusion, `_` pathless, `_` suffix un-nesting, `$` params, `$` splat, `__virtual.ts`, `physical()`) plus the
  virtual anchor routes the docs promise for deleted/lazy-only route files `[doc: guide/code-splitting.md:222-224]`,
  with the paths of the docs' tables, the right parent links and lazy/piece attachments, and with `disableTypes`,
  `addExtensions`, `importRoutesUsingAbsolutePaths`, `routeTreeFileHeader/Footer`, `enableRouteTreeFormatting`,
  `quoteStyle` and `semicolons` honoured (the docs promise a route tree "formatted with the quote style you
  specify"; §5.5 frees printing elsewhere) `[ruling: route tree quoteStyle and semicolons]`. Tests assert hierarchy,
  ids, paths, parent links and what an importing router sees — not an exact emitted tree text. `[doc: routing/file-based-routing.md tables; file-naming-conventions.md; virtual-file-routes.md; api/file-based-routing.md]`
- **J1.5** The route tree is deterministic (G4): independent of directory scan order, cwd (except for outputs that
  are cwd-relative by configuration), OS path separators, and process. `[R4]`
- **J1.6** Writes are atomic (temp file in `tmpDir` + rename; beside the destination when `tmpDir` is on another
  device, J1.16) and the generator never leaves a route file or the tree half-written. Every supported file name (2.1, including apostrophes and other quote characters) produces a valid
  tree: import specifiers, ids and paths are escaped as needed; a tree that would not parse is a generator bug. A
  clear error naming the file is acceptable only for a file name the conventions genuinely do not support. `[doc: api/file-based-routing.md:264-271; cs: generated code is code]`
- **J1.7** Conflicting route paths produce an error naming the conflicting files (absolute or project-relative
  names, unambiguous, §5.7). Only genuinely conflicting routes require it: a single route mounted through an
  empty-prefix `physical('', dir)` is not a conflict by itself. `[doc: virtual-file-routes.md:294-329]`
- **J1.8** A route's URL path is decided by its placement (directory, dots, pathless `_` segments) and never by
  which companion files exist: a pathless layout present only as `_auth.lazy.tsx` (or only as a Vue component piece)
  still prefixes its children with the enclosing directory path, exactly as a non-lazy `_auth.tsx` would. `[doc: routing/file-based-routing.md:44-47 (pathless layout under directory)]`
- **J1.9** The props the generator records from a `createFileRoute` call (used to prune server-only routes and to
  discover prerenderable paths) are best effort for spread/computed keys, and the fallback is safe: a route is never
  pruned from the client tree, and never skipped for prerendering, because a key was missed. `[ruling: first review rulings]`
- **J1.10** In dev, adding, removing or changing a route file regenerates the tree and the live app reflects it (a
  reload is acceptable here); the generator must not miss a delivered edit (G10 does not apply to tree changes). How
  changes are detected (mtime, content hash, watcher events) is free. Generation settles: one delivered edit
  leads to a bounded number of regenerations and never to a regeneration or reload loop, and closing the dev
  server or watch session that owns the generator stops its watching. Edits of the file named by
  `virtualRouteConfig` (path form), of `__virtual.ts` files and of route files under `physical()` mounts are
  delivered edits like route-directory files (modules the virtual config itself imports: OQ17c). An edit of
  `tsr.config.json` may take effect only at the next route file event `[ruling: Q9]`. How unchanged
  writes are suppressed is mechanism. `[doc: installation/with-router-cli.md "whenever a file is added, removed, or changed"; doc: routing/virtual-file-routes.md; router-generator/AGENTS.md:3 "avoid watcher loops"]`
- **J1.11** Withdrawn: the option it described was removed from the product (#8737). The id stays unused.
- **J1.12** Honour `disableLogging` for the route-generation logging it controls; otherwise those logs may appear in
  dev or build. This clause does not prohibit actionable warnings or errors permitted or required by G5 (e.g. a
  non-route source file under the routes directory that exports no `Route`: warn, explain the exclusion options,
  omit it), and does not mandate an exact console transcript: neither a success message nor warnings about unusual
  but valid param names are required. `[doc: api/file-based-routing.md:228-232; R5]`
- **J1.13 Types describe the runtime tree.** With types enabled, the generated type linkages (route ids, full paths,
  parent/child relations, params) agree with the runtime tree the same file emits, including virtual anchors and
  pathless layouts under directories; with `disableTypes` the documented JavaScript tree is emitted. The tree
  carries file route types router-core infers (`InferFileRouteTypes<typeof routeTree>` is not `never`, with the
  tree's full paths, `to` and ids); the names of the generated file's own types are free (§5.1) `[ruling: Q2]`. `[doc: routing/file-based-routing.md:15 (type-safety promise)]`
- **J1.14 Pathless layout under a lazy-only route (PIN-A).** When a route exists only as a lazy file
  (`posts.lazy.tsx`, no `posts.tsx`) and a pathless layout with children sits under its directory
  (`posts/_layout.tsx`), the lazy-only route's virtual anchor is the layout's parent: `_layout` nests under `/posts`
  and its children's paths are prefixed accordingly (the anchor the docs promise for lazy-only route files, J1.4).
  Attaching the layout to the next real ancestor is a bug (pin against current main). Distinct from J1.8, which
  fixes the enclosing path regardless of companion files. `[ruling: PIN-A; doc: guide/code-splitting.md: 222-224; generator.ts:1414-1424 (related shape)]`
- **J1.15 Childless pathless layout.** A pathless layout file without children (`routes/_auth.tsx` next to
  `routes/index.tsx`, no `_auth.*` pages yet) is a valid, if useless, route: the tree contains `/` and the `_auth`
  layout, and no error is raised; the same holds for `_auth.lazy.tsx`. The current "Conflicting configuration
  paths" error is a bug (pin). J1.7 still applies to genuinely conflicting paths. `[ruling: childless pathless layout; doc: routing/file-naming-conventions.md:35]`
- **J1.16 `tmpDir` on another device (K-19).** When `tmpDir` resolves to a different filesystem than the
  destination (rename fails with EXDEV), the generator still publishes atomically: it writes a temp file beside the
  destination and renames it there. Copy+unlink is not acceptable (a reader can observe partial content); a hard
  error demanding the same device is not the chosen behaviour. J1.6's atomicity promise holds on every device
  layout. `[ruling: K-19; doc: api/file-based-routing.md:264-271]`
- **J1.17 `.lazy.vue` is a lazily loaded component piece.** `x.lazy.vue` next to `x.vue`/`x.tsx` supplies route
  `x`'s `component` lazily from the SFC default export; it is not a lazy _route_ module (an SFC cannot export a
  `createLazyFileRoute` route) and an empty `.lazy.vue` must not be scaffolded with TypeScript route code. The
  current wiring (`generator.ts:770-796` loads `d.default` through `.lazy()`; TS scaffold) is a bug (pin). J1.8
  (path never depends on pieces) and G5 (no silent broken import) hold throughout. `[ruling: .lazy.vue; doc: guide/code-splitting.md:107-114]`

### J2 Route code splitting (router-plugin)

- **J2.1 Which modules.** Only file route modules are processed, and inside them only the `createFileRoute` /
  `createRootRoute` / `createRootRouteWithContext` call bound to `Route`. `createLazyFileRoute` modules are not split
  further; non-route modules and code-based routes are returned unchanged. Vite, Rsbuild/Rspack, webpack; React,
  Solid, Vue. `[ruling: one route per file; doc: guide/code-splitting.md:74]`
- **J2.2 Which options and groupings.** Only `component`, `errorComponent`, `pendingComponent`,
  `notFoundComponent`, `loader` are split. Grouping precedence: `codeSplitGroupings` in the file > `splitBehavior({
routeId })` > `defaultBehavior` > the default `[['component'],['errorComponent'],['notFoundComponent']]`; a property
  may appear in at most one group; options in one group load as one unit and different groups stay independently
  lazy (§5.3). Two options load as one unit when, once one loaded, loading the other fetches no new module holding
  user code; a small forwarding module per option over the group's module is acceptable, though not ideal (bytes).
  `[ruling: split groups and forwarding modules; doc: guide/automatic-code-splitting.md:53-75,187-195; type: router-plugin config splitGroupingsSchema]`
- **J2.3 Behaviour identical.** A split route renders, errors, pends, not-founds and loads exactly as the unsplit
  route; everything not configured for splitting (path parsing, search validation, `beforeLoad`, context, `head`,
  `scripts`, `staticData`, `ssr`, `server`, `headers`, …) stays eager in the route module. `[doc: guide/code-splitting.md:13-31; R1]`
- **J2.4 One instance.** Preserve observable shared identity, state and once-only effects across the route, its
  actual importers and its chunks: `Route`, module state, and every exported function/class/constant (importers of
  a route-module export and the route itself get the same object; a copy of an exported declaration in a chunk is a
  bug even when it is "stateless", because its identity is observable through the import). Required pure helpers
  with unobservable identity may be copied or rewritten (§5.3). Prove identity through real consumers and effects,
  not declaration counts. `[ruling: P1, exported Route readers, D5]`
- **J2.5 Each chunk holds only what it needs.** The split option's code (and bindings only it uses) is absent from the
  route module; an import used only for types is dropped, so the imported module never loads in the client for that
  reason. Separately, a compiler-emitted split module must not carry unrelated source declarations or dependencies
  that its configured split group does not need; "needed" includes the group's transitive dependencies, required
  effects and compiler/runtime support. D5 permits compiler-level inspection proving that a particular unrelated
  declaration or dependency is absent, including a count of zero when that check identifies the unwanted code
  independently of generated names and formatting `[ruling: D5]`. It does not permit fixing the total number of declarations, a required textual shape, or a particular
  valid placement of shared code. Oracle boundary: an unused unrelated exported class copied into a component chunk
  fails even if never called; an extra helper actually needed to implement that component does not fail merely
  because it increases the declaration count; a shared dependency needed by another legitimate consumer must not be
  misclassified as an unused copy in this chunk. Also check final bundle contents per supported bundler, on
  production output with side-effect hints varied; that does not replace the compiler-level D5 obligation. What
  counts as unused code left behind is judged after the bundler's production tree-shaking: unused code must be gone
  from the production bundle (checked by value reads and user markers); an unused import specifier or an
  unreferenced declaration an emitted module keeps is free (§5.9). Ideal goals, not gates: a split chunk holds only
  what its option uses, and options read shared pieces directly from a shared module rather than through forwarding
  modules. `[ruling: D5, L3, unused code is judged after the bundler; R2]`
- **J2.6 Lazy loading contract.** Split options are loaded on demand and behave under the framework/router's public
  lazy contract: split components are preloadable before render (the route's `component.preload()`, so intent
  preloading keeps working) and render correctly afterwards; split loaders run on demand with the same result.
  Whether the compiler emits `lazyRouteComponent`/`lazyFn` calls or an equivalent is mechanism; tests observe
  laziness through the real router (preload, render, loader call) and the modules actually requested, never by
  recognising a helper constructor, and may not require exactly one directly imported target per group (§5.3,
  §5.8). `[doc: api/router/lazyRouteComponentFunction.md:9,27-29; type: framework-options.ts]`
- **J2.7 Root route.** The root `component` is always rendered and need not be split; root `errorComponent` /
  `notFoundComponent` should be split (goal pin; keeping root unsplit is acceptable but not preferred). `[ruling: D12; doc: routing/routing-concepts.md:49-51]` (conflicts with `guide/code-splitting.md:105`, see §7.)
- **J2.8 Not split → user informed, never broken.** Every option configured for splitting ends up split. If a
  user-fixable pattern prevents it (e.g. the option's declaration is exported _and_ eagerly imported elsewhere, or a
  side-effectful initialiser with no purity hint), the option keeps working in the route module with one instance,
  and the build/dev run warns once naming the file, in every mode. If our analysis is the obstacle,
  that is a bug. Options the compiler cannot read statically — an options object imported from another module
  (`createFileRoute('/x')(options)` with `import { options } from './x.options'`), factory-built options, a cast
  it does not unwrap — fall under this clause: split correctly or report once naming the file (the dev
  full-reload allowance for factory-built options stands). Under Start the client build never ships their
  `ssr`/`server`/`headers` silently: they are removed, or the build reports/fails clearly (J2.14, J4.12).
  `[ruling: D11, D14, first review rulings, route options from a function call]`
- **J2.9 Best-effort shapes.** Method shorthand options must be splittable (or refreshable) like any other. Spread
  or computed option keys: best effort, safe fallback (J1.9), never a silent wrong split. Initialiser timing of
  shared bindings is not pinned: run once, same value everywhere. `[ruling: first review rulings]`
- **J2.10 Same-file route factory (R-09).** Either a correct split (renders, hot-updates) or unsplit plus a warning
  naming the file, in every mode; crashes or rendering the wrong component are bugs. `[ruling: R-09]`
- **J2.11 Two `createFileRoute` calls in one module.** Never silently swap components: each renders its own, or the
  compiler warns/errors naming the file. `[ruling: one route per file]`
- **J2.12 Bindings the route module still reads stay declared.** Moving an option's declaration never removes an
  import or declaration another surviving statement (an exported wrapper, `head()`, an unsplit option, a top-level
  call) reads; the route module stays a valid module (G1, G8). `[cs: a module with a dangling live reference throws at load]`
- **J2.13 Dev mode.** Splitting also happens in dev; virtual chunk modules resolve in every bundler's dev server;
  removing a split option the page had loaded must not break the page. `[doc: guide/automatic-code-splitting.md:27; G10]`
- **J2.14 `deleteNodes`.** Options named in `codeSplittingOptions.deleteNodes` are removed from the route module of
  that env together with code only they used; Start sets `['ssr','server','headers']` on the client so the `ssr`
  function, server handlers and `headers` never reach the client. `[type: router-plugin config deleteNodes; doc: guide/selective-ssr.md:133; wiring: start-plugin-core vite/start-router-plugin/plugin.ts:166; rsbuild/start-router-plugin.ts:76]`
- **J2.15 Client route tree pruning (Start).** Routes whose only `createFileRoute` prop is `server`, with only such
  descendants, are removed from the client route tree, on Vite and Rsbuild alike. Everything else survives: every
  route with a client-visible prop, and every ancestor a surviving route needs — including a server-only-configured
  ancestor of a surviving child (`pruneServerOnlySubtrees.ts:29-50`). Server and provider trees keep all routes and
  handlers. Unknown or spread-derived props never cause pruning (J1.9). `[ruling: Rsbuild route-tree parity; wiring: pruneServerOnlySubtrees.ts]`
- **J2.16 JSX runtime.** A chunk compiles its JSX under the same runtime/pragma semantics as its source module: the
  project's real JSX transform must select the same runtime for the chunk as it would for the untouched file. For a
  non-leading pragma comment (`/** @jsxImportSource … */` after the imports) the compiler preserves the original
  file's effective decision — a pragma the transform ignores in the untouched file (Oxc/esbuild honour leading
  comments only; Babel any) must not become effective in a chunk: keep it non-leading or omit it (D-04). Warning plus
  leaving the file unsplit is also acceptable (J2.8). Tests assert the rendered outcome only, never comment
  placement or the emitted runtime-import spelling; the oracle compiles the untouched and the compiled module with
  the project's real JSX transform and its real configured defaults (automatic or classic), and lets that transform
  interpret the pragmas — no universal "a pragma means classic" rule. `[ruling: D-04; R1]`
- **J2.17 Deprecated `assert` attributes.** An import written with `assert` in a route module (e.g.
  `import data from './data.json' assert { type: 'json' }`) keeps working, wherever the import lands (route module or
  chunk), and its attribute keeps its meaning where the bundler honours attributes. How the compiler prints the
  keyword (`assert` or `with`) is free: no public host observes it (Vite strips import attributes, webpack accepts both
  keywords, Rspack ignores them), so tests assert the behaviour only, never the printed keyword.
  `[ruling: D9; coordinator 2026-10-21]`
- **J2.18 esbuild.** Either splitting works or the plugin refuses clearly (error naming esbuild and
  `autoCodeSplitting`). A warning on a successful unsplit build is not a refusal. `[ruling: D3]`
- **J2.19 Warning wording is free** (J2.8 only fixes the file); warnings are printed once per file per run. `[ruling: D14; diagnostics: file and position only]`
- **J2.20 Hydrate inside a split component** keeps working: wherever the component's code lands (chunk or shared
  module), the boundary renders with every binding it needs and its child chunk loads (G11); a dangling generated
  name is a bug. `[cs: both features are documented]`
- **J2.21 When splitting applies.** J2.2–J2.20 apply to enabled, applicable transforms, subject to the explicit
  exceptions in §2.2: standalone Router with `autoCodeSplitting: true` (default `false`; CLI-only generation never
  splits `[doc: api/file-based-routing.md:189-198; guide/code-splitting.md:74-75]`); Start enables the splitter in
  its normal supported wiring and does not expose `autoCodeSplitting` (§1.1). With splitting off, route modules
  reach the bundler unsplit and J2.14/J2.15 still apply where Start wires them.

### J3 Route HMR (dev only)

- **J3.1 In-place update.** Editing a file route module in dev updates the live route on the running router without
  a full reload: non-component options (loader, beforeLoad, head, validateSearch, …) are replaced; matching and
  navigation use the new options (stale derived route state is invalidated; how is mechanism); generated options
  (`id`, `path`, `getParentRoute`) stay on the live route; the active match re-renders with the new options. A hot
  edit runs each changed loader at least once and the page shows its new data; how many times it runs is not
  pinned, while an obsolete loader the edit replaced or removed does not run again. Vite and Rsbuild/Rspack (webpack
  lower priority); React, Solid, Vue. `[ruling: dev edits and full reloads, loaders after a hot edit; type: HmrOptions]`
- **J3.2 Component identity is kept for compatible edits.** For compatible hot updates, preserve the router-owned
  component/lazy-wrapper identity required by D10, including Solid and Vue split components, and show the new
  component code. Where the framework's supported refresh behaviour can retain the mounted component and its state
  for that edit, the compiler/router must not cause a remount or state reset; such a remount fails the test.
  Compatibility is determined by the real framework's refresh contract, not merely an unchanged component name or
  family (React Refresh, for instance, remounts class components, changed hook signatures and forced resets even
  within one family). Framework-required replacement, including incompatible hook signatures or component kinds, is
  allowed without an unconditional descendant-state guarantee. Adding sibling route options next to an inline
  component (e.g. a `pendingComponent` and an `errorComponent` before an inline `component`) may remount it: the
  edit must show in place, its state need not survive `[ruling: sibling options next to an inline component]`.
  Renames and other family replacements must display the new component (J3.3). A framework subtree replacement is distinct from a full reload; full reloads remain
  governed by G10 and the explicit factory-options exception (2.2, J3.3). Test both split and unsplit cases with
  real framework tooling (§8). Oracle boundary: a compatible body-only edit that loses state because the router
  recreates its wrapper must fail; an edit the real framework must remount must not fail solely for that remount;
  "where possible" does not excuse a missing compiler capability that D10 makes a goal. `[ruling: D10, dev edits and full reloads]`
- **J3.3 Every edit takes effect.** After an edit, the page shows the new code: new component body, renamed component
  (a new Refresh family), new split loader (even when only the chunk changed and the route module did not), an added
  or removed option (including a removed split option the page had loaded), with or without the framework's refresh
  plugin. A full reload is acceptable only for factory-built options (2.2). `[ruling: route options from a function call; cs: the purpose of HMR is to see the edit]`
- **J3.4 Correct target.** The update applies to the route whose id the current tree assigns, not to a stale id kept
  in hot data from a previous version. `[R4]`
- **J3.5 Root route.** Root route edits, including adding/editing/removing `shellComponent`, hot-update. `[ruling: shellComponent]`
- **J3.6 Start server side.** Editing a module only server-function handlers read does not full-reload the server;
  the next call runs the new handler code. This also holds with RSC enabled (separate provider): a route module
  that also defines a server function keeps receiving client route hot updates (J3.1–J3.3), and a handler edit
  takes effect on the next call, without a full reload where a hot update is feasible (G10). `[ruling: dev edits and full reloads]`
- **J3.7 Nothing in production.** No `import.meta.hot`, `import.meta.webpackHot`, `module.hot` or hot-data wrappers
  in any production output; with `addHmr: false` none in any output; Start's server env never carries route HMR code.
  Start forces `addHmr: true` for its client splitter, so no HMR-disabled Start build exists: the router-level
  paired build (the same splitter with `addHmr: false`) decides whether HMR support leaks into production, and
  Start's own dev tests cover the graph it serves. `[ruling: HMR in Start production builds; R7; type: addHmr;
wiring plugin.ts:180]`
- **J3.8 Without an HMR runtime** (no `import.meta.hot`, or `hot` without `data`), the module still evaluates and
  `Route` works (the same module serves SSR in dev). `[cs: dev SSR evaluates route modules without a hot API]`
- **J3.9 Both styles.** `plugin.hmr.style: 'vite'` (accept-callback semantics) and `'webpack'` (re-execution
  semantics, used by the rspack/webpack entries) satisfy J3.1–J3.4. `[type: HmrOptions]`
- **J3.10 Route tree edits in dev** (new route file, route kind change) reach the client tree and the page (reload
  allowed, J1.10).
- **J3.11 An update the router on the page does not have.** With a second router created after the app's (the
  route HMR code finds that one), an edit of a route file leaves the app working: the edit's component shows, the
  app's router still navigates, no error. Whether the edit also reaches the app's router is not required.
  `[ruling: Q5]`

### J4 Start environment separation (start-compiler)

- **J4.1 `createServerFn` on the client.** The handler, the server function's validation step, and everything only
  they reference are absent; the exported value is still a callable server function with the same `method`/options
  and middleware list, calling the server by id over HTTP; `.url` works for forms. A schema or helper that surviving
  client code also uses independently stays (its absence is not required merely because it is also a validator).
  `[doc: guide/server-functions.md:134-150,395-397,484; guide/import-protection.md:329-362; runtime: start-client-core createServerFn.ts:305-308 validates on the server only]`
- **J4.2 `createServerFn` on the provider.** The handler runs with its original semantics and closure; the function
  is registered under its id so an HTTP call by id (with validation and middleware) executes it; module top-level
  code of the defining module runs once in that env even when the handler is extracted into a provider module.
  Only server functions the client references are HTTP-callable (bug pin). Calling a server function from server
  code is documented ("Other server functions - Compose server logic"): a server function that only server code
  calls (another server function's handler, a middleware `.server()`, an SSR-only module) works for those callers in
  every production build, whether or not the client build discovered it and in any module processing order (G4).
  D6 restricts only direct HTTP calls by id of a function no client code references. `[ruling: D6, P2; doc: guide/server-functions.md:8,72-76]`
- **J4.3 `createServerFn` during SSR.** Calling a server function while rendering runs the handler directly (no
  browser HTTP fetch) with the same result as an HTTP call `[doc: guide/middleware.md:805-806]`. When SSR and the
  provider share one environment, the handler may stay in the SSR module or be looked up by id — tests assert
  behaviour only `[ruling: P2]`. When the provider is a
  separate environment (RSC: `react-start-rsc/src/plugin/vite.ts:50-59` forwards SSR lookups into the `rsc` env,
  whose runtime exports exist only there, `:160-166`), the handler executes in the provider environment with its
  module-resolution conditions; forwarding/lookup is allowed, its mechanism is free.
- **J4.4 Ids.** _Build_: function ids are deterministic for unchanged input, identical in client, ssr and provider
  output of one build, de-duplicated with `_1`, `_2`… on collision, hashed by default (no path leak), and overridable
  through `serverFns.generateFunctionId({ filename, functionName })` (experimental) `[doc: guide/server-functions.md:417-430 "for production build"; compiler.ts:637-669]`. _Dev_: an implementation-specific
  lookup id is allowed (`compiler.ts:614-634` encodes the module for direct lookup); within one dev session every
  caller and the provider agree on it; ids need not match between dev and build (G13). A by-id request for a
  module the running dev server has not compiled yet (a page left open across a dev-server restart) compiles that
  module on demand and is served. Generated handler/variable
  names are a black box. The form of the `filename` passed to `generateFunctionId` (relative or absolute) is not
  specified: tests derive the expected id from the arguments actually received. Adding or editing declarations
  changes the effective input, so ids need not survive edits; repeatability is required for unchanged input only.
  `generateFunctionId` is a build contract; dev ids may or may not use it. `[ruling: generated names, D2]`
- **J4.5 Recognition.** All Start builders are recognised through renamed imports, namespace members, re-exports,
  aliases (`export const createFooServerFn = createServerFn`), builders stored in variables and continued later
  (`const base = createServerFn().validator(s); export const f = base.handler(h)`), user factories/wrappers in other
  modules, `createStart(...).createMiddleware`, `.middleware([...])` chains that return callable builders, and
  re-exports under string export names (`export { createServerFn as 'create server fn' }`), which must work.
  A configured builder passed in another builder's `.middleware([...])` (`const authed =
createServerFn().middleware([auth])`, then `createServerFn().middleware([authed]).handler(…)`) contributes its
  middleware list. Option objects given by identifier or spread (`createServerFn({ ...opts })`) are ordinary
  input. Unrecognised shapes must not silently leak (J4.12): for a builder method called through a computed member
  (`createServerFn()['handler'](…)`, `createMiddleware()['server'](…)`) or a server-only fn whose result is
  member-called (`createServerOnlyFn(…).bind(null)`), the client holds no server code, or the build fails with an
  error at the call `[ruling: restored corpus inputs]`. Look-alikes are left alone (G15). `[doc: middleware.md:817-896; server-functions.md:134-150; type: createStart.ts:74; type: start-client-core createServerFn.ts:91-110,581]`
- **J4.6 Declaration sites.** Server functions declared at module top level work everywhere. A `createServerFn`
  nested inside a function works when the handler captures no local binding (goal pin). When it captures locals or
  is otherwise not extractable, the compiler either preserves the complete environment/RPC semantics safely (client
  calls by id reach a server handler with the same observable result; nothing leaks) or reports a clear error naming
  the unsupported capture; a broken or leaking function is a bug. Other positions (default export, assignment,
  object property, class field, block) likewise work or error clearly; a server fn declared in a top-level `{ }`
  block works, or fails with a clear error naming the file. `[ruling: D13, restored corpus inputs; R5]`
- **J4.7 Import form independence.** A module's compiled client output does not depend on how importers import it
  (static, dynamic, re-export, barrel); dynamic import is discouraged but never leaks server code. `[doc: server-functions.md:152-158; G2]`
- **J4.8 `createMiddleware`.** Client: `.server()` implementations and `.validator()` code (and their imports) are
  removed for both request and function middleware; `.client()` is kept and runs. Server: nothing is removed.
  Middleware built in factories/functions or via `createStart` follows the same rule, and so does global middleware
  listed in `createStart(() => ({ requestMiddleware, functionMiddleware }))` in `src/start.ts`: that module is part
  of the client bundle, the listed middlewares' `.server()`/`.validator()` code is absent there, and a global
  function middleware's `.client()` runs on every client call. No stub of a removed part ships: on the client a
  middleware's `.options.server` (and `.options.validator`) is absent, not an empty or throwing stand-in.
  `[doc: guide/middleware.md:415-503,808-815; ruling: Q3]`
- **J4.9 `createIsomorphicFn`.** Client keeps only `.client()`, server keeps only `.server()`; a missing
  implementation is a no-op returning `undefined`; the other env's implementation and its imports are absent; links
  stored in variables or returned from factories keep their implementation. `[doc: guide/environment-functions.md:17-85,117-121]`
- **J4.10 `createServerOnlyFn` / `createClientOnlyFn`.** In the owning env the function runs unchanged; in the other
  env calling it throws (the docs' messages illustrate the error; its prose is not checked, §5.7
  `[ruling: diagnostics: file and position only]`), and the wrapped body plus imports only it used are gone. `[doc: environment-functions.md:88-123; import-protection.md:406-429]`
- **J4.11 `<ClientOnly>`.** Server envs render only the `fallback` (children removed); modules that only the children
  use are not loaded on the server when import protection denies them (`*.client.*`, markers), and preferably for
  neutral names too (not required). Client keeps the children. Only the TanStack `ClientOnly` import is transformed.
  `[ruling: client-only declarations on the server; doc: api/router/clientOnlyComponent.md]`
- **J4.12 Hard rule: no server code in the client.** Handler bodies, `.server()` bodies, validators (J4.1), server-only
  helpers and imports, `createServerOnlyFn` bodies, and `ssr`/`server`/`headers` route options are absent from the
  production client bundle on every supported bundler, with side-effect hints varied; a declaration kept alive only
  by a type position (`typeof schema`) is dead and must go. Modules that import protection _denies_ for the client
  are absent too — subject to the configured policy: an edge import protection permits (`enabled: false`,
  `onViolation` returning `false`, an exempt importer or `excludeFiles` target, J6.6/J6.7) receives the real module
  and is not erased by this rule. Removal also covers imports the client cannot resolve: a platform module that only
  removed code uses (`import { env } from 'cloudflare:workers'` read in a handler or `.server()`, `node:*`, `bun:*`)
  does not make the client build fail and is absent from client output, while the server build keeps it; how the
  compiler avoids resolving it (e.g. removal before the bundler resolves, tolerant provenance lookups) is
  mechanism. Imports only removed code uses include a dynamic `import()` inside a handler: no client chunk is
  emitted for its target. `[ruling: import-protection exemptions; doc: server-functions.md:150; execution-model.md:326-342; G2; doc: guide/environment-variables.md:8 (`cloudflare:workers` binding "from anywhere"); guide/hosting.md:13-19]`
- **J4.13 Client/SSR agreement.** The bindings each environment actually consumes satisfy their public contract in
  both: a server function imported in client and ssr is callable in both with the same id and `.url`; values that
  the environment APIs intentionally make differ (`createIsomorphicFn`, `createServerOnlyFn`/`createClientOnlyFn`,
  `<ClientOnly>`) differ as documented. Identical export inventories are not required (G9). `[ruling: P1; cs: hydration compares server and client renders]`
- **J4.14 Side effects once** per env, including modules containing both server functions and top-level code (G3).
  "Once" concerns the effects that survive for that env after the documented removals (J4.1, J4.8–J4.11, J2.5,
  L3): a server env evaluates the surviving top-level code of a mixed module, so an unconditional browser-only
  top-level read outside any client-only boundary or split option is not required to be skipped on the server;
  the browser-dependency cases are tested through a real `<ClientOnly>`/`createClientOnlyFn` boundary, a split
  route with `ssr: false`, or a real separate RSC provider. Separate environments have separate module instances.
  `[ruling: P2]`
- **J4.15 Dev/build.** Provider modules may carry an HMR accept in dev; none in build (G7). The dev server serves the
  handler by id after edits (J3.6). `[R7]`
- **J4.16 Libraries.** A dependency written with Start APIs (uncompiled source) that Start's discovery selects (a
  package with `@tanstack/<fw>-start` or `@tanstack/start-client-core` in `peerDependencies`, `vite/plugin.ts:
133-158`) or that the user explicitly includes for bundling is compiled like app code in every env it participates
  in; discovery uses the application's configured root, never an unrelated process cwd (`vite build <app>` from a
  monorepo root must work). Other external dependencies carry no automatic requirement; dependencies shipping
  Start-_compiled_ output are unsupported (2.2).
- **J4.17 User code preserved** (G12): directives (`'use strict'`, `'use client'`, `'use no memo'`), decorators,
  class semantics, imports written with `assert` (they keep working; the printed keyword is free, J2.17),
  parentheses.

### J5 Deferred hydration `<Hydrate>`

- **J5.1 Recognition.** A `<Hydrate>` whose tag resolves to a static import from `@tanstack/react-start` or
  `@tanstack/solid-start` is a split boundary unless it has the literal `split={false}`. The tag may be the named
  import, a renamed import, or a direct static member of a namespace import (`import * as Start from
'@tanstack/react-start'; <Start.Hydrate …>`), extracted exactly like a named import. React and Solid; Vite and
  Rsbuild; not Vue. Variable indirection (`const Deferred = Hydrate`, `const { Hydrate } = Start`) and wrapper
  components are not analysed (2.2). A shadowed namespace binding or a namespace of another package is a look-alike
  (G15). `[ruling: namespace imports; doc: guide/deferred-hydration.md:181-207,667-698]`
- **J5.2 Client output.** The boundary's children move into a separately loaded chunk rendered through a lazy
  component; values the children capture from the enclosing scope are passed in and reflect the latest render;
  identifiers declared inside the children (e.g. a `const Icon` in a map callback) are not captures; nested boundaries
  each get their own chunk; `prefetch`'s `preload()` loads that chunk (and resolves immediately with `split={false}`).
  `[doc: deferred-hydration.md:181-191,209-243,483-490,734-736]`
- **J5.3 Server output.** Children still render to HTML (G1); the server renders a boundary marker; `fallback` is
  removed when statically visible (direct prop, inline object spread, single-use `const` spread) and may stay
  otherwise. `[doc: deferred-hydration.md:49-57,559-561,738-741]`
- **J5.4 Hydration identities agree.** Server and client identify the same rendered boundaries — every boundary,
  extracted or not, including one hidden in a `children` prop — so each hydrates with the identity the server
  rendered, with no mismatch, collision or wrong child-chunk selection. Any compiler-assigned part of that identity
  is identical in every env of one build and deterministic for unchanged effective inputs, with server/client
  agreement in each build (G4; equality between builds at different project roots is not required). The runtime
  combines an optional compiler prefix with the framework's own id (`react-start-client/src/Hydrate.tsx:75-76`): a
  compiler id on every non-extracted boundary is not required when the framework identity already agrees.
  Identities must not collide among boundaries rendered at the same time; boundaries in mutually exclusive branches
  at the same render position need not differ. `[R4]`
- **J5.5 Rejections are loud when extraction is attempted.** For a boundary being extracted, function-as-children,
  hook calls directly inside the extracted JSX and `this`/`super` captures produce a compile error naming the fix
  (`split={false}` or a child component); dynamic `split` is treated as split. A boundary with literal
  `split={false}` is neither extracted nor rejected (the transform skips it, `hydrate-when-transform.ts:579-580`),
  and runtime behaviour is whatever the framework defines for the input (C8). These rejections are the specified
  outcome, not a compiler limitation: G5's "our limitation is a bug" rule does not turn them into support goals. A
  rejection is required in each compilation that attempts the extraction (the client compilation included).
  `[doc: deferred-hydration.md:697-732; R5]`
- **J5.6 Only what is needed, when it is needed.** Child chunks are not modulepreloaded with the route; without
  `prefetch` (and absent React's documented correctness-driven early hydration), a child chunk loads when the
  boundary is about to render/hydrate; a configured `prefetch` may load it earlier (that is its purpose). The
  documented initial-hydration vs later client-mount behaviour, including `never()`, is preserved. A boundary inside
  code the production bundler removes leaves no chunk and no child code behind (per bundler, G2). `[doc: deferred-hydration.md:209-243,565-574,643-646]`
- **J5.7 CSS stays route-linked.** CSS imported by split children remains discoverable for the route's SSR HTML (not
  deferred with the chunk). `[doc: deferred-hydration.md:648-654]`
- **J5.8 Semantics otherwise untouched.** `when`, `prefetch`, `onHydrated`, keys and context flow through as written;
  the function form of `when` is evaluated on the client only. Extraction keeps context flowing into the children,
  keeps legal `key`/`ref` behaviour, and passes the latest captured values and callbacks after parent re-renders
  and keyed reorders: it never freezes the first render's data or a Solid read. A changed inline `when`/`prefetch`
  identity does not restart an established gate; a new `key` creates a new boundary. React's documented early
  hydration stays allowed (J5.6). `[doc: deferred-hydration.md:98-101,146-179,403-407]`
- **J5.9 Printing.** Children/fallback JSX re-printed in the chunk or stripped from the server must keep their meaning
  (G12).

### J6 Import protection

- **J6.1 Rules.** Deny by resolved-file pattern (client default `**/*.server.*`, server default `**/*.client.*`),
  by raw specifier (client default `@tanstack/{react,solid,vue}-start/server`; server default none), and by marker
  (`@tanstack/<fw>-start/server-only` / `client-only` side-effect import in the target file; both in one file is an
  error). `excludeFiles` (default `**/node_modules/**`) skips resolved-target checks. Option semantics follow the docs
  table (`client.specifiers` additive; `files`, `excludeFiles`, `server.specifiers` replace). Importers checked:
  those under `srcDirectory` (or `include`) minus `exclude`/`ignoreImporters`. Vite and Rsbuild; every Start env
  (client-type envs vs server-type envs). A specifier rule matches the specifier **the user wrote**: a bundler
  rewrite of the import (e.g. Rsbuild `source.transformImport` turning `ui-lib` into `ui-lib/button`) must not bypass
  a denial of the original specifier; resolved-file and marker checks continue on the rewritten edge's resolved
  target. `[doc: guide/import-protection.md:10-41,147-243,552-569; type: defaults.ts, schema.ts]`
- **J6.2 Type-only edges are ignored**; mixed imports count. `[doc: import-protection.md:43-59]`
- **J6.3 Behaviour.** Default dev `mock` (warn once, replace with a recursive-Proxy mock; `mockAccess` controls the
  runtime console diagnostic — error/warn/off — and nothing else), default build `error` (fail the build);
  overridable globally or per mode, including `mock` in production builds; `enabled: false` disables everything.
  `mockAccess` (default `error`) applies wherever a mock is served — dev and production, client and server envs;
  there is no production or server exemption, so a test that expects silence sets `mockAccess: 'off'`. In mock
  mode (dev or build, client or server env) both channels hold: every violation is reported (the build or dev-time
  warning), and the runtime access diagnostic follows `mockAccess` wherever a mock is served
  `[ruling: mock mode always logs]`.
  `[doc: import-protection.md:17-25,85-145,512-520; type: mockAccess, schema.ts:34-42]`
- **J6.4 Only surviving edges are reported.** Build: violations are decided after compilation and tree-shaking,
  definitive. Dev: an edge the Start compiler itself removed from the importer's output (handler-only, `.server()`-
  only, server-only-fn-only imports) is not a violation and must not be reported or mocked, regardless of request
  order, warm-up, pre-transform, lookup requests (`?server-fn-module-lookup`) or full-bundle mode; edges that only
  bundler tree-shaking would remove may still be reported in dev. `[doc: import-protection.md:329-441]`
- **J6.5 Report content.** Environment type, the rule that matched, importer `file:line:col` in the _original_
  source (through source maps, also for non-JS sources and other plugins' rewrites) where the location is
  source-derived, raw specifier, resolved path and the import chain from an entry (cut at `maxTraceDepth`) when
  available (the public `ViolationInfo` marks `resolved`, `importerLoc`, `snippet` optional, `trace.ts:163-174`), a
  code frame, direction-specific suggestions; `log: 'once'` de-duplicates per edge, `'always'` logs each occurrence
  once per load. The importer location is a relevant original import span or a genuine surviving use of the
  binding; it is never an erased type position, a use inside a removed boundary body, or compiled coordinates. The
  chain is any real import chain from an entry to the importer (not necessarily the shortest), bounded by
  `maxTraceDepth`; it may be listed entry first or entry last, as long as the entry is identifiable (by position or
  a marker) and the direction is unambiguous.
  `[doc: import-protection.md:245-327,500-502,556-560; ruling: restructured compilers]`
- **J6.6 `onViolation`.** Called for every violation with the documented info; returning `false` allows the import:
  real module, no mock, no report (dev and build). `[doc: import-protection.md:488-510]`
- **J6.7 Exemptions give the real module.** An importer exempted by `ignoreImporters`, `exclude` or outside `include`
  receives the real module and nothing is reported for it; a denied target matched by `excludeFiles` is not checked at
  all; non-exempt importers of the same file are still mocked and reported. `[ruling: import-protection exemptions]`
- **J6.8 Mocking is complete.** In mock mode every reported edge is mocked for the non-exempt importer (including a
  denied file outside `include` imported from an included file); the mock exposes the bindings the importer names;
  no real value of the denied module (including inlined enum members) reaches the bundle. A mock is identified by
  safe behaviour through real consumers — named, default and namespace imports (also `ns[key]`), deep member reads,
  calls and construction do not throw, no denied initializer effect runs, no secret value appears — never by a
  label string or a fixed primitive-conversion result (§5 item 18). A name re-exported with `export *` from a
  denied module (a denied file or a denied specifier) is a complete safe mock; otherwise the build fails, and in
  dev the server warns at the `export *` (its file and position). Either way the denied module's value never
  reaches the client, and the importer of the name never fails to load in dev.
  `[doc: import-protection.md:90-92; cs: a mock that leaks is not a mock; ruling: Q4]`
- **J6.9 Every entry counts.** Edges reachable from any entry of the env (router entry, start entry, client entry,
  custom `src/server.ts`) are reported. `[doc: import-protection.md:10 "checks every import"]`
- **J6.10 Dependencies.** Files under `node_modules` skip file-pattern and marker checks by default, including a
  dependency marking itself server-only; `excludeFiles: []` re-enables. `[doc: import-protection.md:32-39,207-228]`
- **J6.11 Determinism.** The set of reported violations for a given source tree and config does not depend on
  request order, caching, or which env transformed a module first (G4). `[R4]`
- **J6.12 Suggestions and prose are free** (wording not a contract). The docs' displays are examples: sections,
  header text, numbering, quotes, spacing, code frames and suggestions are free. What a violation is (environment,
  importer and its location, specifier, resolved file, chain) is read from `onViolation` (J6.6); the printed report
  is checked only for naming the importer's file and position `[ruling: import-protection reports through
onViolation; diagnostics: file and position only]`. `[doc: import-protection.md:245-325]`
- **J6.13 Edits reclassify in dev.** In a running dev server, adding or removing a marker, changing an unsafe edge or
  boundary, and deleting/recreating a target updates reporting and mock/real resolution in every affected Start env:
  stale lookup, transformed-output and marker caches neither keep a removed denial nor hide a new one (the plugin
  invalidates marker and per-env state on `hotUpdate`, `vite/import-protection-plugin/plugin.ts:1526-1543`).

### J7 RSC CSS injection (react-start-rsc)

- **J7.1 Scope.** Active only with `rsc.enabled: true`, React, under the documented prerequisites (§1.3), in the
  environment that executes the RSC render: on Vite the `rsc` env (provider; its `loadCss` is
  `import.meta.viteRsc.loadCss()`, `react-start-rsc/src/plugin/vite.ts:61-63`, and the ordinary SSR runtime
  rejects direct `renderToReadableStream`, `:160-166`); on Rsbuild the server-function provider modules
  (`react-start/src/plugin/rsbuild.ts:73-75`, `rscCssTransform.ts:75-79`). SSR forwarding and the client/SSR
  facades are preserved; no other server env is required to evaluate an RSC-only CSS loader. The env list
  describes today's wiring (e.g. Rsbuild's `serverFnProviderOnly`), not a frozen option set: the requirement is
  delivery wherever the render executes (J7.2). `[doc: guide/server-components.md:11-92]`
- **J7.2 CSS reaches the client.** For `renderServerComponent(<JSX/>)` and `createCompositeComponent(fn)` executed in
  that environment (the documented usage: a server function returning server-rendered UI), the CSS (global and
  modules) imported by the server-component module is delivered with the RSC payload so the client styles it.
  Injecting the bundler's `loadCss` into those calls is the current mechanism; an equivalent delivery is acceptable.
  Recognised through both module names (`@tanstack/react-start/rsc`, `@tanstack/react-start-rsc`), import renames
  and direct static namespace members (`import * as RSC from '@tanstack/react-start/rsc';
RSC.renderServerComponent(<Card />)`, likewise `RSC.createCompositeComponent` and `RSC.renderToReadableStream`
  under J7.3), which get CSS injection like a named import. Variables, wrappers and project re-exports of the
  helpers are not recognised requirements (unlike J4.5 builders); shadowed or foreign look-alikes stay untouched
  (G15). `[ruling: namespace imports; doc: server-components.md:1031-1044]`
- **J7.3 `renderToReadableStream`.** With a JSX (or all-JSX conditional, `as`/parenthesised) first argument the CSS is
  injected; with an identifier or spread argument a dev-only warning is emitted; with a second `options` argument or a
  plain-data model the call must not break (options/model pass through), CSS and warnings not required. `[ruling: D8, RSC undocumented inputs]`
- **J7.4 No duplication, no behaviour change.** Injection adds styles only; rendered markup and the stream's data are
  otherwise unchanged (G1); a module not calling these helpers is untouched.
- **J7.5 Dev.** Editing a server component's CSS (global or module) updates the open page with the new effective
  styles; removing a rule or the CSS import removes its effect; successive edits do not leave stale effective
  stylesheets behind; no full reload where a hot update is feasible (G10). Stylesheet count, loader and envelope are
  free. Tested on Vite and Rsbuild dev servers (react-start-rsc integration tier). `[G10]`

---

## 5. Allowed freedom (correct-but-different compilers)

A compiler may do any of the following and still be correct; tests must not fail on them. Tests cite these items
as `§5.N` (or "§5 item N").

- **§5.1 Generated names**: identifiers for hoisted components, shared bindings, handler functions, RPC variables,
  Hydrate lazy components, mock bindings (`__tss_deny_0`), hot-data keys. `[ruling: generated names, P1]`
- **§5.2 Server-function ids** other than the documented default hashing, as long as deterministic, de-duplicated, equal
  across envs of one build, and overridable in build (J4.4, G4); dev may use a different, implementation-specific
  id. Equality of opaque ids between builds of the same project at different absolute roots is not required (G4).

- **§5.3 Virtual-module ids and query strings** (`?tsr-split=`, `?tss-hydrate=`, `?server-fn-module-lookup`), physical
  chunk count and shape, shared-dependency chunks, where shared bindings live (shared module, chunk re-import, entry
  re-export), copying _pure, unexported, identity-unobservable_ helpers into a chunk vs importing them (J2.4) —
  provided the configured group semantics hold: a group is available together (no new module holding user code
  once one of its options loaded; forwarding modules allowed, J2.2), independently configured groups are
  neither made eager nor loaded together when only one is needed, and no chunk carries unrelated code (J2.5).
- **§5.4 SSR handler placement** in place or extracted, when SSR and the provider share an environment (P2, J4.3); the
  forwarding mechanism for a separate provider.
- **§5.5 Statement/import order, printing** (quotes, semicolons, parentheses beyond necessity — free only where they
  change no outcome: parentheses around a component-defining expression that stop React Fast Refresh from
  registering the component (SWC under Rsbuild does not register `const Page = (() => …)`) fail by the outcome, the
  edited component losing its state (J3.2) `[ruling: NEW-2]` — whitespace, comment placement except license comments the splitter
  moves code away from, which stay in the source module, G12 — license-comment placement is free for the Start compiler and the import-protection rewrite — and pragma
  semantics, J2.16; the
  order among directives of one prologue, as long as each still precedes executable code), dropping
  or keeping type-only exports/imports that are runtime-neutral — within G3 (ordering dependencies of surviving
  effects preserved; initialiser timing and printed order free).
- **§5.6 Export lists** of compiled modules: adding exports, removing never-imported exports (G9).
- **§5.7 Warning/error wording and channel** (console vs bundler diagnostics), not their severity (G5), including
  the prose of the environment-misuse runtime errors (J4.10). A diagnostic is checked only for naming the file and
  the position `[ruling: diagnostics: file and position only]`. File names in diagnostics may be absolute or
  project-relative if unambiguous; a bare basename that is only a suffix of the project-relative path (`other.ts`
  for `src/other.ts`) does not name the file `[ruling: file names in diagnostics]`. Code-frame layout and context
  length are free `[ruling: valid alternative compilers]`.
- **§5.8 Where helpers live**: runtime helpers inlined, imported from the framework package, or placed in a virtual
  module; which lazy helper builds a lazy boundary (`lazyRouteComponent`, `lazyFn`, an equivalent wrapper or an
  intermediate module).
- **§5.9 Which dead code is left** (G8): unreferenced functions, unused imports in never-executed code, unused
  import specifiers. Unused code is judged after the bundler's production tree-shaking (J2.5): it must not reach the
  production bundle. `[ruling: unused code is judged after the bundler]`
- **§5.10 Root `component` split or not**; root `errorComponent`/`notFoundComponent` split preferred (J2.7).
- **§5.11 Dev-only extras**: HMR accept code shape, hot-data layout, Refresh registration mechanics, dev diagnostics.
- **§5.12 Dropping client-only-guarded declarations on the server for neutral file names** (preferred, not required).
- **§5.13 How a nested `createServerFn` is supported** (hoisting or any technique giving J4.6), and whether a locally
  capturing one is supported safely or rejected clearly.
- **§5.14 Source-map granularity and layout** beyond "stack traces/report positions resolve to the user's line and
  column"; no mappings for purely generated support code; absent optional report fields (J6.5).
- **§5.15 Parser/printer** (Babel, Oxc/Yuku, SWC) and whether a module without the detection pattern is parsed at all,
  as long as every recognition form of J4.5, J5.1 and J7.2 still works.
- **§5.16 Idempotence** (recompiling output is unsupported).
- **§5.17 Change-detection strategy** of the generator in dev (J1.10) and the hydration-identity scheme (J5.4).
- **§5.18 Mock representation** (J6.8): the mock's label, its primitive-conversion result, Proxy shape and where the
  mock runtime lives, as long as it is safe and leaks nothing.
- **§5.19 Extra fields on runtime objects** the compiler emits or decorates (e.g. additional server-function metadata
  next to the id), as long as the public contract holds. A stub where the compiler removed a part (a client
  middleware's `.options.server`) is not such a field (J4.8, ruling Q3).
- **§5.20 Shared plugin state**: whether the router plugin instances one integration composes (Start's client and SSR
  code splitters) share a context or state is free `[ruling: Q8]`.

---

## 6. Product questions ruled after the first drafts

These were open questions; each is now ruled and binding. The ids stay because tests cite them.

- **OQ12: license comments beyond the splitter.** R-14 binds the splitter only. Where the Start compiler
  (server-function handler extraction, environment functions, Hydrate extraction) and the import-protection rewrite
  put license comments is free, with no test either way (G12, §5.5). `[ruling: OQ12]`
- **OQ13: already-lazy option values.** A file route may write `component: lazyRouteComponent(() =>
import('../features/ReportsPage'))` (typed `RouteComponent | LazyRouteComponent`, `[doc:
api/router/RouteOptionsType.md:32]`; the docs recommend `createLazyFileRoute` instead). Required outcome: once the
  router has preloaded the route, rendering it requests no new module and shows no pending fallback. Leaving
  already-lazy values in the route module and chaining the inner `preload()` both pass. One build test checks it.
  `[ruling: OQ13]`
- **OQ14: a chunk for `component: Outlet`.** `Outlet` is already the default component. No requirement: the compiler
  may emit a chunk, skip it, or drop the `component` property. No test. `[ruling: OQ14]`
- **OQ15: the release-candidate `.inputValidator()`.** It was removed in 1.169 and `tsc` rejects it: a type-invalid
  input (§8, §2.2). No compiler requirement, no test. `[ruling: OQ15]`
- **OQ16: third-party transforms on split chunks.** An app's own `enforce: 'pre'` plugin whose filter only matches
  `/\.tsx$/` does not see split-chunk ids (`posts.tsx?tsr-split=component`). Out of scope for now: no test. The
  documented integrations (framework plugins, the React Compiler through the framework plugin) must keep working.
  `[ruling: OQ16]`
- **OQ17: four low-frequency items.** `[ruling: OQ17]`
  - a. `<ClientOnly>` in Vue SFC templates: no requirement until Vue Start is documented.
  - b. A module-level `'use server'` with RSC enabled: undefined, no test; J4.12 still holds.
  - c. Edits of modules that the `virtualRouteConfig` file imports: live regeneration is unsupported (restart);
    J1.10 covers the config file itself, `__virtual.ts` files and route files under `physical()` mounts.
  - d. `.vue` route files: never split, no warning, no test.

---

## 7. Conflicts between rulings, docs and types

| #   | Side A                                                                                                                                                                                | Side B                                                                                                                                                               | Resolution used in this spec                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `guide/code-splitting.md:104-105`: `__root.tsx` "does not support code splitting"                                                                                                     | `[ruling: D12]` goal pin: root `errorComponent`/`notFoundComponent` split (root exception acceptable)                                                                | J2.7 follows D12 (later ruling): support goal, with the root exception as the minimum acceptance; docs line should be softened                                                                                                                             |
| C2  | `router-plugin/src/core/config.ts:60` JSDoc default `[['component'],['pendingComponent'],['errorComponent'],['notFoundComponent']]`                                                   | `guide/automatic-code-splitting.md:61-69` default has no `pendingComponent`                                                                                          | J2.2 follows the docs (the JSDoc is wrong)                                                                                                                                                                                                                 |
| C3  | `guide/automatic-code-splitting.md:81-103`: exporting a route property "results in [it] being bundled into the main bundle" (rule)                                                    | maintainer ruling: that is current behaviour, not intent; goal is correct split + DCE; exported-and-imported ⇒ one instance + warning                                | J2.4/J2.8 follow the ruling: an unused export must not prevent the split/DCE goal; real eager consumers or impure initialisers keep correctness + identity and trigger the warning                                                                         |
| C4  | `guide/import-protection.md:439`: dev may report imports that "would later be compiled away"                                                                                          | job 6 "only flag what survives compilation"; a pin treats a compiler-removed edge reported in dev as a bug                                                           | Not a real conflict: the docs' own context (`:433`, `:437-441`) attributes dev false positives to incomplete tree-shaking; J6.4 distinguishes Start-removed edges (never reported) from edges awaiting bundler tree-shaking (may be reported)              |
| C5  | `guide/server-functions.md:426-428`: hash `filename + functionName` for stable ids                                                                                                    | `[ruling: D2]`: `generateFunctionId` currently receives the generated handler name; left as is                                                                       | Not a contradiction (the docs do not say `functionName` is the user's variable name): recorded as an experimental naming limitation D2 leaves unchanged; J4.4 requires determinism and overridability only                                                 |
| C6  | `routing/virtual-file-routes.md:50` prose `virtualRoutesConfig`                                                                                                                       | option is `virtualRouteConfig` (type + code samples)                                                                                                                 | type wins; docs typo                                                                                                                                                                                                                                       |
| C7  | `guide/automatic-code-splitting.md:86` `createRoute('/posts')({...})` in a file-route example                                                                                         | file routes use `createFileRoute` (one-route-per-file ruling); the splitter also matches `createRoute` in `detectCodeSplitGroupingsFromRoute`                        | J2.1 processes `createFileRoute`/`createRootRoute*` only; docs typo; the recognition code is not a public contract                                                                                                                                         |
| C8  | React `HydrateProps` type rejects function children even with `split={false}`                                                                                                         | `deferred-hydration.md:704` recommends `split={false}` for function-as-children                                                                                      | Types/docs mismatch to report; **no compiler rule**: with `split={false}` the compiler neither extracts nor errors (J5.5)                                                                                                                                  |
| C9  | `@tanstack/react-start/rsc` `renderToReadableStream` typed one-arg under the default condition (`flight.stub.ts:8-10`), `(data, options?)` under `react-server` (`global.d.ts:37-40`) | docs show one arg only                                                                                                                                               | 2.2: two-arg/plain-data inputs "must not break", no CSS/warning requirement                                                                                                                                                                                |
| C10 | `guide/environment-variables.md` presents `server.build.staticNodeEnv` for Vite and Rsbuild                                                                                           | Rsbuild plugin ignores it (not pinned in the corpus)                                                                                                                 | out of compiler scope (§1.2); listed for completeness                                                                                                                                                                                                      |
| C11 | router-plugin options `deleteNodes`/`addHmr` are public                                                                                                                               | Start silently overrides them (`vite/start-router-plugin/plugin.ts:164-169`, `rsbuild/start-router-plugin.ts:74-77`)                                                 | wiring documented in §1.1; tests assert the resulting per-env behaviour; whether users may override is a product decision, no clause                                                                                                                       |
| C12 | `installation/with-esbuild.md` shows `autoCodeSplitting: true` on esbuild                                                                                                             | `[ruling: D3]` esbuild: no work, works-or-refusal                                                                                                                    | J2.18                                                                                                                                                                                                                                                      |
| C13 | `docs/router/quick-start.md:96`: Router "only compatible with React and Solid"                                                                                                        | generator `target: 'vue'`, `@tanstack/vue-router`, `vue-start` packages, Vue in import-protection defaults                                                           | Vue is in scope (types + packages win); docs stale; feature-specific exceptions in §1.3                                                                                                                                                                    |
| C14 | job 4 as first stated: "SSR: SSR RPC" (handler replaced by id lookup)                                                                                                                 | `[ruling: P2]`: in place or extracted both allowed **when SSR and provider share an environment**                                                                    | J4.3 follows P2 in its stated scope; with a separate provider the handler still executes in the provider env (mechanism free)                                                                                                                              |
| C15 | `guide/middleware.md:814`: "on the server, nothing is tree-shaken"                                                                                                                    | `[ruling: client-only declarations on the server]`: client-only (`*.client.*`) imports must be eliminated from the server build when only client-only code uses them | Reconciled by scope: J4.11 concerns `<ClientOnly>`/client-only fns; the middleware sentence stays true (a middleware `.client()` callback is not a client-only boundary: the client chain also starts on a server invocation, `createServerFn.ts:150-159`) |
| C16 | `guide/import-protection.md` table omits `mockAccess`                                                                                                                                 | `schema.ts:34-42` exposes `mockAccess`                                                                                                                               | Documentation omission: J6.3 includes it (console diagnostics only, no change to mock resolution)                                                                                                                                                          |
| C17 | `api/router/createLazyFileRouteFunction.md:22-29`: lazy files hold only four component options                                                                                        | nothing in the docs says `.lazy.tsx` files are exempt from the splitter                                                                                              | Withdrawn as a conflict (absence of a sentence is not an opposing contract): J2.1 leaves lazy modules unsplit because they already sit behind a lazy boundary; an equivalent further optimisation would not violate anything                               |

---

## 8. How the spec is checked (test methodology)

- **Test infrastructure must not re-implement other tools** `[ruling: real tools only]`. Tests of
  behaviour that a bundler, a framework or an HMR runtime decides drive the real supported tools — real dev servers
  with the real framework plugins, the real HMR client, real `react-dom`/Solid/Vue runtimes, real production builds —
  and observe page/build/runtime outcomes. No copies of Vite/webpack/Rspack/React update-propagation, Refresh-family,
  tree-shaking or runtime logic in the oracle. Server code runs inside real requests through Start's server entry
  (no hand-built request context). Thin glue only at unavoidable external boundaries (the network); each stand-in
  has a documented contract and its own contract test, and is replaced by the real package when feasible.
- **Public entry points only.** Acceptance tests reach the compilers through the plugins and options a user
  configures (Vite, Rsbuild, Rspack and webpack builds and dev servers, or the public Vite plugin driven in-process),
  never through internal modules, classes, ids or queries. No exception remains (the last one, an updater test
  driving the emitted route HMR function, was deleted `[ruling: Q5]`).
- **Assert at the level where the outcome is decided** `[ruling: first review rulings]`: compiler-level tests assert what the compiler
  alone decides (semantics, identity, validity, server code absent, chunk contents it emits within J2.5's D5
  boundary, warnings); bundle-level placement, DCE and dangling names are asserted on production output per bundler
  with side-effect hints varied (G2, G8); HMR with the real dev tools (above).
- **Assert behaviour, not mechanism**: through real importers (P1), rendered output, calls,
  ids compared across envs, source-map-resolved positions; never generated names, export lists, printed text,
  statement order or which equally correct module a binding lands in (§5).
- **Limitations get two tests** `[ruling: limitation tests]`: a loosened regression test (correct output; user informed when
  not split) and a `.fails` goal test for the ideal outcome; best-effort cases get only the loosened test.
- **Unsupported inputs** (2.2) get at most a "never fail silently" test; no test for behaviour ruled undefined.
- **Reachability before pinning** (repository `AGENTS.md`; `[ruling: shellComponent, R-09]`): a pin needs a
  real-usage path to the failing state; equal-mtime double saves and the webpack stale-id preference stay
  report-only until shown reachable with real tools.
- **Pins have a compiler cause.** A `.fails` pin asserts the correct outcome, fix-agnostically, and is verified red
  for the right reason. Its cause is in a compiler or its bundler integration (§1.2 "Runtime bugs").
  `[ruling: runtime bugs]`
- **Type-invalid inputs are not supported inputs.** Source the package's public types reject (a `tsc` error under
  the project's real declarations, e.g. `split="false"`, a string-returning `when`, a childless `<Hydrate>`,
  missing builder arguments, an unannotated `string[][]` grouping) may appear only as labelled
  never-fail-silently diagnostic controls (G5), never as evidence that a supported form works or is rejected.

- **Client artifacts run in a real browser; server artifacts in Node.** Copying a DOM implementation's globals onto
  Node is not a browser and can hide or fake environment-dependent behaviour (G13).
- **No internal controls.** Tests of harness helpers, exported internals (§1.2), plugin lifecycle, debug output or
  filesystem policy are not part of the suite: they give no clause coverage and would block a correct rewrite
  `[ruling: oracle tests only]`.
- **Dev-server edits are realistic.** The app's files exist before the dev server starts (as in a real project), and
  a compile counts for an edit only if it started after the edit's last write. A multi-file edit (moving
  `src/lib.ts` to `src/lib/index.ts`) passes through in-between states that a dev server may compile and report:
  tests assert the state after the last write (the last report since the edit names the new target), not an exact
  report list that excludes the in-between states. `[ruling: Rsbuild dev-server edits]`
- **Original source in code frames.** Code frames are not checked (§5.7): a location is checked by its file, line
  and column. `[ruling: valid alternative compilers; diagnostics: file and position only]`

---

## 9. Clauses a test cannot (easily) check, and evidence still pending

- J1.5's cross-OS route tree (needs a second platform). Project relocation is testable and should be: at each root
  assert successful compilation, runtime behaviour and within-build id agreement (G4, J4.4, J5.4); equal opaque ids
  between the roots may be recorded as a characterisation, never used to reject an otherwise conforming compiler.
- J4.16 for arbitrary discovered-library layouts (one pin exists for the cwd case).
- J4.16 symlinked-package startup failure (#8139): the root cause (compiler, bundler or Nitro) is unverified; a
  passing integration test covers the setup, and a pin needs a shown compiler cause first.
- G3/G4 under a persistent bundler cache (Rspack/webpack filesystem cache, Rsbuild `performance.buildCache`): the
  splitter's chunk and shared compiles read in-memory state the route-module compile fills
  (`router-code-splitter-plugin.ts`); a divergence on a cached rebuild is plausible but not shown. A regression test
  covers it, not a pin.
- G12 for printer edge cases not yet enumerated (fuzzers approximate).
- J6.11 in full generality (pins cover warm-up, pre-transform, entry order).
- J3.4 webpack stale hot-data id: intent stated, reachable scenario (virtual-route config edit) not yet shown.
- J1.10 equal-mtime double save: plausible with format-on-save, not reproduced with a real editor; a `utimes`-forced
  generator test would be deterministic but pins an unproven path.
- J1.6/J1.10 within one run: a save that lands between the generator's read of a route file and its rename over it
  is kept, and a reader sees only complete contents, also when a write or rename fails. No deterministic reproduction
  through real files and a public API; the tests that injected an `fs` into the generator were deleted `[ruling: Q1]`.
  J1.16's rename beside the destination is pinned with a real second filesystem.
