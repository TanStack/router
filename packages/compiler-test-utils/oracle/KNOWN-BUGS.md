# Known bugs of today's compilers

The oracle pins every known bug of the current compilers as a `.fails` test: the test asserts the correct
outcome, fix-agnostically, and fails on today's code. This index is generated from the pins themselves (each
`.fails` test and its `Bug:` / `Source:` comment). The test file is the source of truth; search it for the
scenario name. `$name`, `%s` and `${…}` in a scenario are row placeholders of a table test, which often covers
several bundlers, frameworks or shapes.

When a pin starts passing, the bug is fixed: remove its `.fails` (Vitest reports it as "Expect test to fail"). A
correct new compiler may pass many pins at once; that is expected.

Each entry's "Cause" names the product source its comment blames, when it does. It points to today's
implementation, so a rewrite may have no such file. Most root causes are shared by several pins; the bug text then
says "same root cause as above".

Counts: 365 pin sites in 101 test files (a table test counts once here; Vitest counts each row).

## Pins by compiler job

### J1 Route file upkeep and route generation (router-generator, generator wiring in router-plugin)

31 pins.

#### `router-generator/tests/concurrent-write.test.ts`

- **with tmpDir on another filesystem, the route file and the route tree are replaced atomically.** With `tmpDir` on another filesystem than the app (e.g. the app on a disk and TSR_TMP_DIR on a tmpfs), every publication fails: renaming the temporary file onto the route file or the route tree fails with EXDEV, and the run fails. Cause: `router-generator/src/generator.ts`.

#### `router-generator/tests/deny-route-group-config.test.ts`

- **a (group).tsx route file is reported by name or routes correctly: $name.** The generator rejects a `(group).tsx` route file with an error that names the file relative to the routes directory (`(group).tsx`, `nested/(group).tsx` for `src/routes/nested/(group).tsx`), neither absolute nor project-relative (SPEC §5.7; ruling "file names in diagnostics"); it neither warns with the file's name nor routes the app. Cause: `router-generator/src/filesystem/physical/getRouteNodes.ts`.

#### `router-generator/tests/generator-dev.test.ts`

- **deleting a layout route keeps its child routes in the route tree.** After a layout route file is deleted, its child routes disappear from the route tree of a running generator, while a fresh run keeps them (under the root route). Cause: `router-generator/src/generator.ts`.
- **a deleted route tree is written again on its delete event.** A deleted route tree file is not written again: neither on its delete event, nor on the next route change, whose run fails with ENOENT. Cause: `router-generator/src/generator.ts`.
- **after the route tree is deleted, adding a route writes the route tree.** Same as the row above: a deleted route tree file is not written again, and the next route change fails with ENOENT. Cause: `router-generator/src/generator.ts`.
- **editing the virtualRouteConfig file updates the route tree.** Edits to the file `virtualRouteConfig` points to are ignored by a running generator: its update event is dropped (the absolute event path is compared with the configured relative path), and the config module is loaded from jiti's cache anyway. Cause: `router-generator/src/generator.ts`, `router-generator/src/filesystem/virtual/loadConfigFile.ts`.
- **a route created while an update event that changed nothing is checked joins the route tree.** An event that arrives while a run checks events that changed nothing is dropped: that run ends without looking at the events queued meanwhile, so the created route is not added. In webpack's watch mode, a route file created just after the first build (when webpack rebuilds for the route tree the generator wrote) is neither scaffolded nor routed until another route file changes. Cause: `router-generator/src/generator.ts`.

#### `router-generator/tests/generator-options.test.ts`

- **an empty .ts route file is scaffolded, and the other routes still generate.** An empty .ts route file is scaffolded with the route template, which renders JSX; the generator then parses the scaffolded file as plain TypeScript (no JSX) and the run fails with "Error transforming route file". Cause: `router-generator/src/generator.ts`.
- **importRoutesUsingAbsolutePaths imports the lazy route files by absolute paths too.** With importRoutesUsingAbsolutePaths, the route tree still imports lazy route files (and lazy components) by paths relative to itself; only the eager route file imports are absolute. Cause: `router-generator/src/generator.ts`, `router-generator/src/utils.ts`.

#### `router-generator/tests/integration/fixture-types-physical.test.ts`

- **the "%s" route tree types its routes like the router.** A pathless layout in a route group directory (`(group-a)/_layout-a.tsx`, `(bar)/_bar.tsx`) is typed with `fullPath: ''` while the router gives it `/` (the same bug as the group layout pin of route-types.test.ts, `(marketing)/route.tsx`). Cause: `router-generator/src/utils.ts`.

#### `router-generator/tests/integration/route-types.test.ts`

- **the layout route of a route group directory has the full path of the router in the types.** The route tree types the layout route of a route group directory (`(marketing)/route.tsx`) with `fullPath: ''` in `FileRoutesByPath`, while the router gives it the full path `/` (real-router.test.ts, "the layout route of a route group directory adds no path segment"; a pathless layout, `_auth.tsx`, is typed `/`, and agrees). Cause: `router-generator/src/utils.ts`.

#### `router-generator/tests/known-bugs.test.ts`

- **a moved route with an aliased import of the constructor gets the id of its new path.** The route constructor call is recognized by its callee name, apart from its import: an aliased import (`createFileRoute as route`) is not recognized.
- **a moved route importing createFileRoute from a module of the app stays a valid module.** Same root cause as above, for `createFileRoute` imported from a module of the app (a wrapper re-exporting it): no import from the router package names it, so the generator prepends one, next to the user's import of the same name. Cause: `router-generator/src/transform/transform.ts`.

#### `router-generator/tests/real-router.test.ts`

- **a pathless layout with only a lazy route file keeps its directory path.** A pathless layout with only a lazy route file (`settings/_layout.lazy.tsx`, no `settings/_layout.tsx`) gets no `path` in the route tree, so the router drops the `/settings` prefix its directory gives it: the child matches `/profile`, not `/settings/profile`. Cause: `router-generator/src/generator.ts`.

#### `router-generator/tests/route-file-upkeep.test.ts`

- **a createFileRoute $name keeps its meaning: the file is left as it is, or reported.** The generator recognises route constructors by name: a route file whose `createFileRoute` is the app's own (declared in the file or imported from another module of the app) gets the router package's instead (an import from './-factory' is rebound to the router package; a declared one gets a router import next to it), and the id argument of the app's call is rewritten. Cause: `router-generator/src/transform/transform.ts`.

#### `router-generator/tests/route-paths.test.ts`

- **a pathless layout without child routes yet ($name) next to the index route is added to the route tree.** A pathless layout file without children yet (`_auth.tsx` or `_auth.lazy.tsx`) next to the index route fails the generator with "Conflicting configuration paths were found" for `/` (the layout's full path is `/`, like the index route's), although the layout matches no URL of its own. Cause: `router-generator/src/utils.ts`.
- **a pathless layout in a directory under a route with only a lazy route file nests under that route.** A pathless layout one directory below a lazy-only route (`app/posts.lazy.tsx`, no `app/posts.tsx`, and `app/posts/drafts/_layout.tsx` with children) is attached to the next real ancestor (`/app`) instead of to the lazy-only route's virtual anchor `/app/posts`, so `/app/posts/drafts/child` renders without the `/app/posts` page around it (same rule as the control above: guide/code-splitting.md:222-224; ruling PIN-A; SPEC J1.14). Cause: `router-generator/src/generator.ts`.
- **a pathless layout with only $name under a path keeps the path in the URLs of its children.** A pathless layout with a lazy route file only (`foo/_auth.lazy.tsx`, no `foo/_auth.tsx`) or a Vue piece only (`foo/_layout.component.vue`) becomes a route without a file whose node is typed `static`, and the route tree prints a `path` only for non-pathless nodes and for nodes typed `pathless_layout` (src/generator.ts, the `path:` option of `createUpdateRoutes`), so the layout loses the `/foo` prefix it carries when nothing above it is a route. Cause: `router-generator/src/generator.ts`.
- **a route file name with an apostrophe gets a route with it in its URL.** The route tree writes route file paths and route ids into single-quoted strings unescaped, so a route file whose name contains an apostrophe ends the string: the route tree does not parse and the run fails ("';' expected"). Cause: `router-generator/src/utils.ts`, `router-generator/src/generator.ts`.
- **routes $ids get their own routes.** Routes whose paths differ only in characters that are not valid in an identifier (`-`, `_`, `$`, a space) or in letter case get the same variable in the route tree, which then declares it twice and fails to parse ("Identifier has already been declared"). Cause: `router-generator/src/utils.ts`.

#### `router-generator/tests/route-pieces.test.ts`

- **a component piece of a directory route (route.component.vue) is the component of the route.** The route file of a directory route is `route.ts` (the default `routeToken`), but a piece file next to it (`posts/route.component.vue`) keeps the `route` segment: route nodes strip only one suffix per file (src/filesystem/physical/getRouteNodes.ts, `suffixToStrip ?? lastRouteSegment`), the piece suffix here, so the piece belongs to a route `/posts/route` of its own. Cause: `router-generator/src/filesystem/physical/getRouteNodes.ts`.
- **a .lazy.vue route file is the lazily loaded component of the route.** A `.lazy.vue` route file is wired as the route's lazy route (`.lazy(() => import('./routes/about.lazy.vue').then((d) => d.default))`, src/generator.ts, the `lazyComponentNode` branch), but a single-file component's default export is a component, not a lazy route: the router reads the lazy route's `options` (router-core load-client.ts), which the component does not have, so loading the route fails. Cause: `router-generator/src/generator.ts`, `router-core/src/load-client.ts`.
- **pieces of the root route only are lazy components of their default export.** When only the root route has piece files, the route tree calls `lazyRouteComponent` without importing it, and fails to load with "ReferenceError: lazyRouteComponent is not defined". Cause: `router-generator/src/generator.ts`.
- **an empty .lazy.vue route file is not filled with TypeScript route code.** An empty `.lazy.vue` file is scaffolded like a `.lazy.tsx` file: the generator writes TypeScript route code (`import { h } from 'vue'`, `createLazyFileRoute(...)`) into the single-file component, which no Vue compiler accepts (src/generator.ts, scaffolding of empty route files; the other Vue pieces are left empty, the rows above). Cause: `router-generator/src/generator.ts`.

#### `router-plugin/tests/integration/dev-server-generator-watching.test.ts`

- **an edit of the virtual route config file changes the live routes.** An edit of the file `virtualRouteConfig` names (path form, as the docs configure it: './routes.ts') never reaches the live routes: the generator drops the dev server's update event (it compares the absolute event path with the configured relative path) and would load the config module from jiti's cache anyway. Cause: `router-generator/src/filesystem/virtual/loadConfigFile.ts`.
- **an edit of a \_\_virtual.ts file changes the live routes.** An edit of a `__virtual.ts` subtree config never reaches the live routes: the route tree keeps the subtree the dev server started with. Cause: `router-generator/src/filesystem/virtual/loadConfigFile.ts`, `router-generator/src/filesystem/physical/getRouteNodes.ts`.

#### `router-plugin/tests/integration/known-bugs-rsbuild-generator-physical.test.ts`

- **a route file created under a physical() mount outside the routes directory reaches the live routes.** A route file created under a `physical()` mount outside the routes directory never runs the generator: the generator's own watcher watches the routes directory only, and the new file is in no bundle yet. Cause: `router-plugin/src/core/router-generator-plugin.ts`.

#### `router-plugin/tests/integration/known-bugs-rsbuild-generator.test.ts`

- **a created route file the generator cannot parse is reported, and fixing it adds the route.** A created route file the generator leaves out of the route tree (it cannot parse it) is not in the bundle, so the edit that fixes it never runs the generator. Cause: `router-plugin/src/core/router-generator-plugin.ts`.

#### `router-plugin/tests/integration/rsbuild-dev-server-generator-watching.test.ts`

- **an edit of the virtual route config file changes the live routes.** An edit of the file `virtualRouteConfig` names never reaches the live routes. Cause: `router-generator/src/filesystem/virtual/loadConfigFile.ts`.
- **an edit of a \_\_virtual.ts file changes the live routes.** An edit of a `__virtual.ts` subtree config never reaches the live routes: the file is in no bundle and the generator's own watcher reports only created files; the config would also come from jiti's cache (see the Vite pin). Cause: `router-generator/src/filesystem/virtual/loadConfigFile.ts`.

#### `router-plugin/tests/known-bugs-dev-server.test.ts`

- **a tsr.config.json edit generates the route tree with the new configuration.** On a `tsr.config.json` edit, the generator plugin re-creates the generator with the new configuration and returns without running it (router-generator-plugin.ts `generate`). Cause: `router-plugin/src/core/router-generator-plugin.ts`.

### J2 Route code splitting (router-plugin, router-utils)

103 pins.

#### `router-plugin/tests/code-splitter-imported-options.test.ts`

- **are split, or reported once naming the route file.** The code splitter resolves the route options only from an object literal of the route file (`resolveIdentifier`, compilers.ts): for an imported binding it finds nothing, leaves the route untouched and says nothing. Cause: `router-plugin/src/core/code-splitter/compilers.ts`.
- **lose the options of deleteNodes and what only they import, or are reported once naming the route file.** Same cause; with Start's client `deleteNodes` the `server` option (and `ssr`, `headers`) stays in the route module with the helper it imports, silently.

#### `router-plugin/tests/code-splitter-jsx.test.ts`

- **gives separate loader and component chunks the one JSX component %s.** The identifier collection that decides what split options share takes a JSX tag whose first character equals its lowercase form for an intrinsic element (router-utils compiler-helpers.ts, `first === first.toLowerCase()`), which holds for `_`, `$` and non-ASCII lowercase letters, whereas JSX only treats tags starting with an ASCII lowercase letter as intrinsic. Cause: `router-utils/src/compiler-helpers.ts`.

#### `router-plugin/tests/code-splitter-pragmas.test.ts`

- **keeps a @jsxImportSource written after the imports as ineffective as in the untouched file (leading-pragma project).** The chunk of the split component starts with the pragma comment (the imports above it in the route file are gone from the chunk), so Oxc reads it there: the split component renders with Emotion's runtime where the untouched file renders with React's.
- **keeps the pragma in effect in every module that contains JSX.** A split chunk that imports a binding it shares with the route module gets that import inserted above the file's leading pragma comment, and Oxc (Vite 8's JSX transform) only reads pragmas that lead the file.
- **in the route module, when the code calling the factory is split.** The route module the code splitter emits starts with the code it adds (the split component's importer and the import of the router's lazy helper), above the file's leading pragma comments, and drops the factory import once the route module's only use of it is its JSX (dead-code elimination does not count a classic JSX pragma as a use of its factory: same root cause as the "classic JSX pragmas" pins of known-bugs-code-splitter.test.ts).

#### `router-plugin/tests/integration/build-harness.test.ts`

- **router plugin with esbuild loads a split component lazily and renders it, or refuses the build (%s).** The esbuild adapter never runs the route generator in a build (its generator only initialises in `esbuild.config`; generation happens in `watchChange`), so the code splitter knows no route files and splits nothing.

#### `router-plugin/tests/integration/build-source-maps.test.ts`

- **a throw in a split component maps to its line in the route file ($name).** Unplugin's webpack and Rspack transform loaders drop the source map the router plugin returns when no earlier loader passed one in, so the chunk maps to the code splitter's output (upstream). Cause: unplugin `dist/{webpack,rspack}/loaders/transform.mjs` (upstream).
- **a throw in $name maps to its line and column in the route file.** Same upstream unplugin cause as the row above. Cause: unplugin `dist/{webpack,rspack}/loaders/transform.mjs` (upstream).

#### `router-plugin/tests/integration/code-splitter-pragmas.test.ts`

- **means in the split route what it means in the untouched route (Vite: Oxc ignores it).** The chunk of the split component starts with the pragma comment (the imports above it in the route file are gone from the chunk), so Oxc reads it there: the split component is styled by Emotion where the untouched route left the `css` prop as an attribute.

#### `router-plugin/tests/integration/code-splitter-router.test.ts`

- **renders without a new request or a pending fallback once the router preloaded it.** The code splitter moves the already lazy value into a chunk of its own, so the route's component is a lazy component whose module exports another lazy component: the router's preload loads the outer chunk only, and the first render suspends (pending fallback) and requests the page module.

#### `router-plugin/tests/integration/code-splitter-runtime.test.ts`

- **preserves executable route contracts with shared named-default declarations.** Shared extraction duplicates a named default function declaration.

#### `router-plugin/tests/integration/dev-source-maps.test.ts`

- **the route module and every module derived from it map a throw to its line in the route file.** Unplugin's Rspack transform loader drops the source map the router plugin's `transform` returns when no earlier loader passed one in, and the router plugin's loader is the first of a route file (same upstream cause as the Rspack and webpack pins of build-source-maps.test.ts). Cause: unplugin `dist/rspack/loaders/transform.mjs` (upstream).

#### `router-plugin/tests/integration/known-bugs-code-splitter-client-builds.test.ts`

- **a component declared by an array destructuring of a call shared with the errorComponent is split or reported.** Once the pin above is fixed, the split option must also end up split, or the build must say why (decision D11).
- **an exported errorComponent written as `PostErrorComponent as any` is one instance in the client (vite build).** Same as above, in a real client build whose entry imports the exported component (`export * from './routes/index'`): the component is in both the entry chunk and the split chunk, and the route renders the copy.
- **a split component that an unused object names renders (vite).** Same root cause as above, for an unused module-level object that names the split component: the route module keeps the object but loses `Page`.

#### `router-plugin/tests/integration/known-bugs-code-splitter-client-output.test.ts`

- **a client build has no server code of an `ssr()` method (vite).** Build-level canary of the method pin in pages/known-bugs-code-splitter.test.ts (same root cause).
- **a client build has no server code of options wrapped in `%s` (vite).** Build-level canary of the typed-wrapper pin in pages/known-bugs-code-splitter.test.ts (same root cause: options wrapped in a cast or `satisfies` are not read; one bundler, as above).
- **a client build of a symlinked route file has no server handler code (%s).** The code splitter looks route files up by the path the generator scanned (the symlink), but bundlers resolve modules to their real path, so a symlinked route file is never compiled: nothing is split or removed, silently.
- **a production client bundle logs no development warning in the page when NODE_ENV is unset (%s).** The code splitter's `console.warn` (today: "will not be code-split") is injected into the route module unless the build process's `NODE_ENV` is `production`, instead of following the bundler's mode as the rest of the code splitter does.

#### `router-plugin/tests/integration/known-bugs-code-splitter-page-code.test.ts`

- **$name loads with its chunk.** A split chunk keeps the route file's exported declarations that its option does not read (D5), and bundlers keep them. Cause: `router-plugin/src/core/code-splitter/compilers.ts`.
- **${exportedSharedByOptions.name} loads with its chunk.** Same as the row above (D5). Cause: `router-plugin/src/core/code-splitter/compilers.ts`.
- **a root route's %s loads lazily.** Root routes are never split (D12: root errorComponent/notFoundComponent should load lazily). Cause: `router-plugin/src/core/code-splitter/compilers.ts`.
- **${destructured.name} load with their chunk or are reported.** A component declared by a destructuring is not split, and nothing is reported (D11). Cause: `router-plugin/src/core/code-splitter/compilers.ts`.
- **${unreadExport.name} is not in its chunk.** A split chunk keeps an exported declaration nothing reads (D5). Cause: `router-plugin/src/core/code-splitter/compilers.ts`.

#### `router-plugin/tests/integration/known-bugs-code-splitter-property-write.test.ts`

- **a component the route file writes a property of loads with its chunk and renders the property ($hint).** The code splitter moves a component into its chunk but leaves a top-level write to it (`Page.displayName = ...`) in the route module, where `Page` is no longer declared: the entry throws "Page is not defined".

#### `router-plugin/tests/integration/known-bugs-code-splitter-ssr-builds.test.ts`

- **a let $name stays writable and the split component reads its value.** A `let` that code in another module than its declaration reassigns is imported there, read-only: a `let` the loader reassigns is shared, so the route module assigns to an import of the shared module; an exported `let` the split component reassigns stays in the route module, which the chunk imports it from ("Cannot assign to import").
- **a split loader in object form with $name loads route data.** The object form `loader: { handler }` cannot be split: the virtual compiler throws "Unexpected splitNode type ☝️: ObjectExpression".
- **a split loader in object form passed by reference loads route data.** An object-form loader passed by reference (`loader` holding `{ handler }`) is split as if it were the loader function, so the route calls the object ("...
- **the split component and other modules share an exported $name.** A split chunk declares its own copy of the exported functions and classes of the route file it reads (and of the private state they read), so another module of the app that imports them gets other instances than the split component.
- **an app in a directory with # in its name builds and preloads a split component.** The route module imports its chunks by absolute file path with the split query (`<root>/routes/index.tsx?tsr-split=component`), and a `#` in the path is read as the start of a URL fragment.
- **an app in a directory whose name contains what split module ids contain builds and preloads a split component.** The code splitter compiles every module whose id contains the marker of its split ids (today `tsr-split`: path text, not its query) as a split chunk, and throws "The split value for the virtual route ...
- **an app in a directory with ' in its name builds and preloads a split component.** The route module's chunk importers are built by pasting the absolute file path into a single-quoted string (`import('${splitUrl}')`), so a `'` in the path ends the string early.
- **an imported split component that head() reads renders, and head() reads it (%s build).** Same root cause as above, in a real build.

#### `router-plugin/tests/integration/known-bugs-dev-server.test.ts`

- **a page loading the modules of the route file before the route module renders the edited route after $name.** The route module's transform computes the bindings that go to the shared module (`?tsr-shared=1`) and stores them by file; the shared and split transforms read that stored set instead of deriving it from the code they compile (router-code-splitter-plugin.ts `sharedBindingsMap`). Cause: `router-plugin/src/core/router-code-splitter-plugin.ts`.

#### `router-plugin/tests/integration/pages/code-splitter-imports-exports.test.ts`

- **reads an ambient var merged with an interface from the environment in a shared declaration, with verbatimModuleSyntax.** The route module and the split chunk import the ambient var from the shared module (the interface of the same name stays in them and counts as a read of the shared binding), and the shared module has no runtime binding to export. Cause: `router-plugin/src/core/code-splitter/compilers.ts`.

#### `router-plugin/tests/integration/pages/code-splitter-module-state-bindings.test.ts`

- **$name.** A class whose static initializer calls a function, read by the options of one split chunk only, is declared in that chunk and also kept in the route module, so the class is created twice.

#### `router-plugin/tests/integration/pages/code-splitter-plugin-pipeline-routes.test.ts`

- **a route built from $name renders what the factory was given, split or reported.** Route options that only exist inside the factory (its parameters, its locals) are split out of it as if they were module-level code: a split option that closes over a parameter throws a ReferenceError, a component declared in the factory leaves a chunk that exports an undeclared binding, and a parameter that shadows a module-level component makes the chunk render the module-level one.

#### `router-plugin/tests/integration/pages/known-bugs-code-splitter-bindings.test.ts`

- **groupings declared in a module-level constant are honoured.** `codeSplitGroupings` must be written inline; a module-level constant holding the groupings is refused ("You must provide an array of arrays for the codeSplitGroupings").
- **module state a method option shares with a split option is created once.** Shared bindings are computed from route options written as `key: value` only, so a binding that an option written as a method (kept in the route module) and a split option both read is not shared: the split chunk declares its own copy.
- **a destructuring whose sibling reads Route keeps one cache for the loader and the component.** Bindings that depend on `Route` are never shared (`removeBindingsDependingOnRoute`), and a destructuring is never split across modules, so a `Map` declared next to a binding that reads `Route` is created by the route module and again by the chunk that reads it.
- **a component read from $name renders.** A split option that is a global (no declaration in the module) or an ambient `declare const` is exported from the chunk under a name the chunk never declares ("Export '...' is not defined"), or the export is erased with the `declare`.
- **a split component renders through the factory of a classic JSX pragma.** Dead-code elimination does not count a classic JSX pragma (`/** @jsx jsx */`) as a use of the factory it names, so a chunk whose only use of the factory is its JSX drops the factory import.
- **a split component renders through $name.** Same root cause as above, for a chunk with only fragments (the @jsxFrag factory too) and a pragma written with two spaces.
- **a factory the route module creates and the loader reads is created once for the split component ($name).** The shared-binding analysis does not count the JSX of a split option as a read of the classic JSX factory it compiles to, so a factory that the route module creates and the loader reads is not shared with the split component: the chunk drops it (same root cause as the pin above), and keeping it in the chunk without sharing it creates it again there.
- **an exported component ($name) that is the only split candidate is split or reported as not code-split.** The "will not be code-split" warning is only reported when the code splitter changes the route module.
- **an exported function that reads Route is the one the split component calls.** The entry's `useTitle` and the one the split component calls are two functions: a binding that reads `Route` is never shared (`removeBindingsDependingOnRoute`), so the chunk declares a copy of the exported function.
- **a split component reads the route the route module exports through export { Route }.** A split component that reads a `Route` declared with `const` and exported later (`export { Route }`) gets a chunk that creates the route again instead of importing it from the route module.
- **a split option renders the default-exported component other modules import.** A route whose component is a default-exported function (which stays in the route module) that another split option renders cannot be compiled: the code splitter throws "Duplicate declaration \"Bar\"".
- **a split component renders the exported component of another option that reads Route ($name).** The code splitter deletes the exported declaration of an option's component from every chunk, so a split component that renders the exported component of another option, which reads `Route`, renders an undeclared binding ("NotFound is not defined").
- **a default-exported function the loader and the split component call works on one state.** A default-exported function declaration that the loader and a split component both call cannot be compiled: Babel throws "Duplicate declaration" for it.
- **a split loader exported through an export list keeps working.** A split loader that the route file also exports through an export list (`export { load }`) loses its declaration in the route module: "Export 'load' is not defined".
- **an exported errorComponent written as `%s` is the instance its importers get.** An exported component named by a split option is only recognised as an export when the option is a bare identifier. Cause: `router-plugin/src/core/code-splitter/compilers.ts`.
- **a decorator after `export` compiles.** The code splitter rejects an ES decorator after `export` (`export @dec class`, valid since TypeScript 5.0): "Decorators must be placed before the export keyword".
- **a class with a parameter decorator that the split component uses compiles into parseable modules.** The code splitter cannot parse a constructor parameter decorator (TypeScript `experimentalDecorators`, as dependency injection libraries use them) and fails the build.
- **a type-only import re-exported as `export { Settings }` is erased (%s).** A type-only import re-exported without `type` (`export { Settings }`, which TypeScript accepts unless verbatimModuleSyntax is on) loses its import in the route module and the split chunks, which keep the export that the TypeScript transform can then no longer erase.
- **split chunks do not import what only $name reads.** A value import that only types read (TypeScript erases it) is copied into every split chunk when the types that read it stay in the route module.
- **a namespace the split component reads keeps its body.** The split chunk declares a namespace the split component reads without its body.
- **an asserted update operand keeps its parentheses in a split component.** The split chunk prints a type assertion used as an update target without its parentheses (`count as number++`), which does not parse.
- **an asserted conditional test keeps its parentheses in a split component.** The split chunk prints a type assertion that is the test of a conditional whose branch starts with a unary minus without its parentheses (`a as any ? -x : y`), which does not parse (`any ? -x` reads as the start of a conditional type). Cause: `router-utils/src/ast.ts`.
- **an overloaded function the route module and a split loader share keeps working.** The overload signatures of a function that the route module and a split chunk share stay in both modules, next to the import of the shared function, and the TypeScript transform then takes them for the binding's declaration and drops the import (dead-code elimination never removes overload signatures).

#### `router-plugin/tests/integration/pages/known-bugs-code-splitter-server.test.ts`

- **a split component that $name reads renders from both.** When a route option names a binding that the code splitter moves into a chunk, the splitter deletes the binding's declaration from the route module (`removeIdentifierLiteral`), even when other code there still reads it.
- **a split component renders through a function $name.** Same root cause as above, for a function that module-level code keeps reachable: it renders the split component, whose declaration the route module lost.
- **a component read by a split and an unsplit option renders from both.** Same root cause as above, for an unsplit option that names the split component.
- **an unsplit option that reads the split component with typeof sees a function.** Same root cause as above, for an unsplit option that reads the split component (which reads `Route`, so it moves to its chunk) with `typeof`.
- **a split component that a top-level call reads renders from both.** Same root cause as above, for a top-level call that reads the split component.
- **an imported split component that head() reads renders, and head() reads it.** When a split option names an imported binding, the code splitter deletes its import specifier from the route module (`removeIdentifierLiteral` removes the binding without checking for other reads), then the emptied import, even when other code there still reads it: an unsplit option, an exported function or anything else. Cause: `router-plugin/src/core/code-splitter/compilers.ts`.
- **an imported split errorComponent that an exported component renders works for an importer.** Same root cause as above, for an exported component that renders the imported split one, used by another module of the app (ruling P1: through a real importer, not the export list).
- **an imported pendingComponent split by custom groupings renders, and an unsplit option renders it.** Same root cause as above, for a pendingComponent that custom groupings split and an unsplit errorComponent renders.
- **a class component declared in the route file renders (exported: $exported).** A route option that names a class cannot be split: the virtual compiler throws "Unexpected splitNode type ☝️: ClassDeclaration".
- **a class component and the imports of its static fields leave the route module.** Same root cause as above.
- **a side-effect import of the split component's module runs when the route module loads.** When the split component is imported (`import { Page } from './Page'`), the code splitter also removes every bare import of that path from the route module (`removableImportPaths`), including the user's own `import './Page'`.
- **a server-only option written as a method is removed with its imports (%s).** `deleteNodes` only removes route options written as `key: value` (`ObjectProperty`); a method (`ssr() {}`, `async ssr() {}`, `headers() {}`) is kept, with the imports it uses.
- **a server-only option given through $name is removed, or the route is refused.** Server-only options whose key is not written literally in the route options (a spread, a computed key, options built by a call) are kept, with their imports, and nothing reports it.
- **a server-only option of options wrapped in `%s` is removed with its imports.** A route whose options object is wrapped in a TypeScript cast or a `satisfies` (statically visible options, valid TypeScript) keeps its server-only options and their imports on the client.
- **a local factory shadowing createFileRoute in a route file keeps its own semantics.** In a registered route file, the code splitter treats every call of a function named `createFileRoute` as the route's factory, including a local function shadowing the router's: it splits the options of that call too, so the local factory gets a lazy route component instead of the function it was given (and in a dev server, where route HMR is on, the route module loses that function's declaration and throws "LocalWidget is not defined" when it loads).

#### `router-plugin/tests/integration/pages/known-bugs-code-splitter-shapes.test.ts`

- **a component is split with $name.** A route whose options object or factory call is wrapped in a TypeScript cast is not split at all, and a component wrapped in `satisfies` cannot be split: the virtual compiler throws "Unexpected splitNode type ☝️: TSSatisfiesExpression".
- **an option written as $name is split and works.** The virtual compiler accepts only a fixed list of expression types for the value of a split option; any other expression the route module splits makes the build throw "Unexpected splitNode type ☝️: MemberExpression" (LogicalExpression, TaggedTemplateExpression, ClassExpression).
- **a component written as $name is split and renders.** A component option written as a call cannot be split when its printed code does not parse on its own with Babel's default options: the virtual compiler prints the call and parses it again as a script statement, without JSX ("Support for the experimental syntax 'jsx' isn't currently enabled") and without TypeScript ("Unexpected token"). Cause: `router-plugin/src/core/code-splitter/compilers.ts`.
- **a component is split when createFileRoute is imported under an alias.** The code splitter only recognises `createFileRoute` under its own name, so a route whose factory is imported under an alias is not split, and nothing says so.
- **a component is split when createFileRoute has a type argument.** The code splitter only compiles files whose code matches `createFileRoute(`, so a route whose factory call has a type argument (`createFileRoute<'/'>('/')`) is left as is, and nothing says so.
- **route options returned by a call are split or reported.** Route options returned by a call (`createFileRoute('/')( makeOptions())`) are neither split nor reported.
- **each of two file routes of one module renders its own component, or the module is reported.** A route file that creates two file routes compiles both routes' split options into the same chunk names, so one route renders the other's component, silently.
- **a split chunk holds only what its option needs, not the other exports of the route file.** A split chunk keeps every exported `function`, `class` and `export default function` declaration of the route file, with the imports they use, whether its option reads them or not (`compilers.ts`, the virtual compiler keeps exported declarations). Cause: `router-plugin/src/core/code-splitter/compilers.ts`.
- **split chunks do not re-export or declare the re-exports and default class of the route file.** Same root cause as above, for re-exports and a default-exported class: every split chunk re-exports them or declares the class again.
- **a module without JSX does not import the classic factory ($name).** The route module keeps importing the classic JSX factory its pragma names after the JSX that compiles to it moved to a split chunk (D5 family).
- **a component declared by an array destructuring of a call shared with the errorComponent renders.** A split option that names a binding declared by an array destructuring cannot be split: the virtual compiler throws "Unexpected splitNode type ☝️: VariableDeclarator".
- **a route file binding named $name keeps its value.** The code splitter declares fixed names in the modules it emits (`SplitComponent`, `SplitLoader`) without checking that the route file does not use them.
- **route file bindings named like what the compiled modules introduce keep their values.** As above, found adaptively, whatever names a compiler chooses: the top-level names the modules emitted for a route file declare that the same file, served untouched (an app module the router plugin does not compile, through the same framework transform), does not declare, given to bindings of the route file, keep their values in every split option.

#### `router-plugin/tests/integration/pages/known-bugs-code-splitter.test.ts`

- **a binding read by a computed-key option and a split option is created once.** A binding that an option with a computed key and a split option both read is created twice: the computed-key option is not seen as a reader of the route module.
- **a binding declared by $name and read by the loader and the split component is initialized once.** A `var` nested in a statement, an enum or a namespace is not shared.
- **top-level writes to $name stay with the binding they write.** A top-level statement that writes a binding stays in the reference module when the binding moves to the shared module or a split chunk.
- **module state that the reference module keeps for $name is initialized once.** Shared bindings are computed from the statically named route options only (`computeSharedBindings` skips computed keys), so a declaration that one split chunk reads and that the reference module keeps as well (for an export, a top-level call, another binding of the declaration, or a route option under a computed key, pinned above) is not shared: the chunk declares its own copy.
- **an unreferenced top-level side effect ($name) runs once, with the route module.** Split chunks keep the top-level statements that nothing references, except expression statements that read only imports: dead-code elimination only removes what the split made unreferenced, and `stripUnreferencedTopLevelExpressionStatements` only strips expression statements that name no module-level binding. Cause: `router-utils/src/compiler-helpers.ts`, `router-plugin/src/core/code-splitter/compilers.ts`.
- **split chunks do not re-export a module-level export \*, which importers of the route file still get.** Same root cause as above: every split chunk keeps the route file's `export * from './lib'`.
- **an ambient declare const read by the loader and the split component stays a global.** An ambient `declare const` is handled as a module binding.
- **the initializers of $name run when the route module loads.** The route module drops a declaration that only an exported type alias reads: it loses that reader when the code splitter removes the alias with the other exports, and the initializer then never runs.
- **the initializer of a declaration only an exported type alias reads runs when a route module compiled for HMR loads.** Same as the type alias row above, in a route module compiled by the route HMR plugin (automatic code splitting off), which runs the same reference compiler.
- **a split component and its imports leave the route module next to $name.** Page code that only the split component needs stays in the route module, with what it imports, when something there looks like a read of it: a type of the same name (TypeScript keeps types and values in separate namespaces), an overload signature or a second `var` declaration (dead-code elimination keeps them), or an unused function that renders it (one that renders the split component itself works: control in code-splitter-dead-code.test.ts).
- **the handler of a split loader in object form with $name loads lazily.** Once the object form compiles (pins above), its handler must also end up split: a loader configured to be split that stays in the route module is our limitation, not a pattern the user can change (decision D11).
- **a split loader in object form keeps $name working, created once.** Same root cause as the object-form pins above.

#### `router-plugin/tests/known-bugs-dev-server.test.ts`

- **keep a $name component exported as the route option value.** The code splitter moves a component the route module exports into its chunk and drops its export: a class cannot be split ("Unexpected splitNode type: ClassDeclaration") and loses its `export class`, and an aliased export list (`export { component as View }`) is left without its declaration (known-bugs-code-splitter.test.ts "class components" and "a split component that an export alias reads renders from both").
- **keep exported overloads and their aliases that unsplit and split options call.** The overload signatures of a function that the route module and a split loader share stay next to its import, and the alias loses the binding (known-bugs-code-splitter.test.ts "an overloaded function the route module and a split loader share keeps working").

### J2.14/J2.15 Start's router wiring (deleteNodes, client route tree pruning; start-plugin-core)

12 pins.

#### `start-plugin-core/tests/integration/known-bugs-route-options.test.ts`

- **a route with only server handlers is not in the client route tree.** Rsbuild: only Start's Vite plugin prunes server-only routes from the client route tree; Rsbuild keeps them (parity is intended). Cause: `start-plugin-core/src/vite/start-router-plugin/plugin.ts`.
- **a route with only server handlers is not in the client route tree.** Same Rsbuild parity bug, for option keys written as strings and a `Route` exported under an alias. Cause: `start-plugin-core/src/vite/start-router-plugin/plugin.ts`.
- **a route with server handlers and these options is in the client route tree.** The route generator records only plain, non-computed, non-method option keys (`createFileRouteProps`), so a route with server handlers and only such client options is taken for server-only and pruned from the client route tree. Cause: `router-generator/src/transform/transform.ts`.
- **the server handler code of the route is not in the client bundle.** Route options wrapped in a cast (`as never`, `as any`, `satisfies`) are not recognised: `deleteNodes` skips them and the generator records no keys, so the server handlers ship to the client. Cause: `router-plugin/src/core/code-splitter/compilers.ts`.

#### `start-plugin-core/tests/integration/start-build-manifest.test.ts`

- **the client route tree is the SSR route tree without the server-only subtree.** Rsbuild: the client route tree is not pruned (same parity bug as known-bugs-route-options.test.ts). Cause: `start-plugin-core/src/vite/start-router-plugin/plugin.ts`.

#### `start-plugin-core/tests/integration/start-compose-imported-options.test.ts`

- **the client build never ships the server handlers of imported route options silently.** The code splitter resolves route options only from an object literal in the route file (`resolveIdentifier`, compilers.ts), so for an imported options object it neither splits nor deletes anything, and says nothing: Start's client build keeps `server.handlers` and ships the helper they read. Cause: `router-plugin/src/core/code-splitter/compilers.ts`.

#### `start-plugin-core/tests/integration/start-compose-project-path.test.ts`

- **the client route tree leaves out the server-only route.** Start's Vite plugin matches the module to serve the client route tree for with `new RegExp(<path of the generated route tree>)` (vite/start-router-plugin/plugin.ts, `clientTreePlugin.load.filter`), the path unescaped, so under a path with `(`, `)` or `+` the expression never matches the file and the client gets the full tree. Cause: `start-plugin-core/src/vite/start-router-plugin/plugin.ts`.
- **the client gets the file, not the client route tree.** The same unescaped `new RegExp(<path>)` (above): its `.` before `gen` matches any character, so `src/routeTree-gen.ts` is served the client route tree instead of its own code.

#### `start-plugin-core/tests/integration/start-compose-server-only-routes.test.ts`

- **the client route tree leaves out the server-only subtree.** Rsbuild: the server-only subtree stays in the client route tree (parity bug). Cause: `start-plugin-core/src/vite/start-router-plugin/plugin.ts`.
- **the client route tree keeps the page whose component is spread in.** Vite: the generator misses a spread component, so Start takes the route for server-only and prunes it. Cause: `router-generator/src/transform/transform.ts`.
- **client-side navigation to a server-only route finds nothing.** Rsbuild: the server-only route is in the client route tree, so navigation finds a route without a page.
- **client-side navigation reaches the page whose component is spread in.** Vite: the spread route is pruned (row above).

### J3 Route HMR (router-plugin)

25 pins.

#### `router-plugin/tests/integration/build-production-webpack-unsplit.test.ts`

- **a production %s client bundle without code splitting has no dev-only code.** With automatic code splitting off, the composed router plugin adds the route HMR plugin unless `NODE_ENV` is `production` when the plugin is created (`router-composed-plugin.ts`), instead of following the bundler's mode; webpack and Rspack set `NODE_ENV` only inside the bundle. Cause: `router-plugin/src/core/router-composed-plugin.ts`.

#### `router-plugin/tests/integration/build-production.test.ts`

- **a production react client bundle without code splitting has no dev-only code (vite).** Same root cause as the pins below, on Vite: the route HMR plugin has no `apply: 'serve'` and follows `NODE_ENV` at plugin creation. Cause: `router-plugin/src/core/router-composed-plugin.ts`, `router-plugin/src/core/router-hmr-plugin.ts`.
- **a production %s client bundle without code splitting has no dev-only code.** With automatic code splitting off, the composed router plugin adds the route HMR plugin unless `NODE_ENV` is `production` when the plugin is created, instead of following the bundler's mode. Cause: `router-plugin/src/core/router-composed-plugin.ts`.

#### `router-plugin/tests/integration/known-bugs-route-hmr-components.test.ts`

- **satisfies.** Inline component options that are not plain functions (`memo(...)`, `forwardRef(...)`, method shorthand, a function wrapped in a TypeScript `as` / `satisfies`) are neither hoisted nor registered for React Refresh, nor is the function they wrap; route HMR keeps the previous component for React Refresh to patch, which it cannot.
- **vite: an edit of a split component declared lowercase as $name shows in place.** A lowercase split component declared as a variable keeps its name in its split chunk, and React Refresh registers PascalCase names only (a lowercase `function` declaration is renamed, a variable is not); route HMR keeps the lazy component for React Refresh to patch, which it cannot.
- **vite: a lowercase function component that is also the unsplit pendingComponent renders, and an edit shows in place.** React HMR renames a lowercase `function` component in its split chunk, also when the component is the unsplit `pendingComponent` too, so the chunk exports a binding nothing declares (the in-process pin "a lowercase function component that is also the unsplit pendingComponent renders as both", known-bugs-route-hmr.test.ts).
- **vite: a split component exported by an export list renders, and an edit shows in place.** With React HMR, the code splitter moves a component exported by an export list (`export { page }`) into its chunk and leaves the export list in the route module (the in-process pin "a component exported by an export list renders for a module importing it and as the route component", known-bugs-route-hmr.test.ts).

#### `router-plugin/tests/integration/known-bugs-route-hmr-removals.test.ts`

- **vite: an edit that removes a split option the page loaded applies in place without errors.** An edit that removes a split component option (here `errorComponent`, which the page had loaded) leaves its split module in Vite's module graph; Vite updates it with the rest of the route file, the code splitter serves it without any export or import, and `@vitejs/plugin-react` compiles that module's JSX as CommonJS (`require("react/jsx-dev-runtime")`).
- **rsbuild without React Refresh: an edit of the route component shows in place (autoCodeSplitting: %s).** `handleRouteUpdate` keeps the previous component options for React Refresh to patch in place, also when no React Refresh runtime is installed (an Rsbuild React app with `pluginReact({ fastRefresh: false })`, or webpack / Rspack without a refresh plugin, like the webpack quickstart example with the default `addHmr`), so the new component never renders.
- **a route exported under another local name is hot-updated in place.** The injected HMR code reads the route through the identifier `Route`, but a route may be declared under another name and exported as `Route` (`export { MyRoute as Route }`).
- **vite: an inline pending component hoisted before a renamed lowercase component renders it.** React HMR hoists inline component options into declarations it inserts after visiting every option, and renames a lowercase component passed to a later option.

#### `router-plugin/tests/integration/known-bugs-route-hmr.test.ts`

- **$bundler: an edit of a split $target route shows in place, keeping the split component.** Route HMR keeps the previous split components only for React: for Solid and Vue, the route module creates a new lazy component on every update and `handleRouteUpdate` keeps no component option (`getFrameworkHmrCompilerPlugins` returns no plugin and the kept component keys are empty for other targets); in Vite, the route module is not an HMR boundary either (its accept call is on an alias), so the page reloads.
- **vite: an edit of an unsplit Vue route shows in place.** The Vite route HMR code calls `accept` on a local alias (`const hot = import.meta.hot`), and Vite only marks a module self-accepting when its code contains a literal `import.meta.hot.accept(`.
- **rsbuild: an edit of an unsplit Solid route shows its new component in place.** On Rsbuild, an edit of an unsplit Solid route file (the route HMR plugin alone) shows its new loader data but keeps rendering the old component. Cause: `router-plugin/src/core/hmr/webpack-adapter.ts`.
- **%s: an edit of a route a helper function creates shows its new component, reloading only when the file is reported (autoCodeSplitting: false).** A route a helper function of the route file creates (`export const Route = makeRoute()`) edited without automatic code splitting (the route HMR plugin alone) shows its new loader data but keeps rendering the old inline component, and nothing warns: the route HMR code keeps the previous component for React Refresh to patch, but the component inside the helper is neither hoisted nor registered.
- **vite: an edit of a React .ts route module shows its new loader data in place (autoCodeSplitting: %s).** Same root cause as the pin above, for a React route file without JSX (`.ts`): React Refresh registers no component in it, so it is not a boundary either.
- **vite: an edit of a route component in an app without @vitejs/plugin-react shows in place (autoCodeSplitting: %s).** Same root cause, for a React app without `@vitejs/plugin-react` (Vite compiles the JSX itself; nothing registers React Refresh boundaries): the route module's own accept call is on an alias, so the page reloads on every edit.
- **renaming the route component shows the renamed component in place (autoCodeSplitting: %s).** `handleRouteUpdate` keeps the previous component options for React Refresh to patch, also when the edit renamed the component (a new Refresh family that is never patched): the page keeps the old component until a reload. Cause: `router-plugin/src/core/hmr/handle-route-update.ts`.
- **rsbuild: an edit of a split loader (codeSplitGroupings: %s) shows its data in place.** On Rsbuild (Rspack), an edit that only changes a loader split from the route module (`codeSplitGroupings` with `loader` in a chunk) never reaches the page: the route module's code is unchanged, so Rspack does not run it again and the route HMR code (`webpack-adapter.ts`, in the route module only) never refreshes the route; the split loader module accepts no update of its own. Cause: `router-plugin/src/core/hmr/webpack-adapter.ts`.

#### `router-plugin/tests/known-bugs-route-hmr-bindings.test.ts`

- **a route file importing a binding named Map renders with route HMR.** The React Refresh bookkeeping the router plugin injects for route HMR constructs a `Map`; a route file that imports a class of its own named `Map` (a map widget's) hands the injected code the user's class, and the route module throws when it loads (SPEC G15, J3.8).

#### `router-plugin/tests/known-bugs-route-hmr.test.ts`

- **route options in a variable ($name) evaluate to a route with a component.** When the route options are passed through a variable, the HMR transforms replace `component` in the options object with a generated binding declared after the object that reads it.
- **a user binding named hot ($name) does not collide with the injected HMR code.** Our `react-refresh-ignored-route-exports` compiler plugin injects a top-level `const hot = import.meta.hot` that collides with a user's top-level `hot` binding (compile error `Duplicate declaration "hot"`).
- **a lowercase function component split into two chunks renders with the module state they share.** React HMR renames a lowercase `function` component in its split chunk even when the code splitter moved the component to the shared module, so the chunk exports `SplitComponent`, which nothing declares.
- **a lowercase function component that is also the unsplit pendingComponent renders as both.** Same root cause as the pin above, for a lowercase component that the split `component` and the unsplit `pendingComponent` share.
- **a component exported by an export list renders for a module importing it and as the route component.** With React HMR, the code splitter moves a component exported by an export list (`export { page }`) into its chunk and leaves the export list in the route module (same root cause as known-bugs-code-splitter.test.ts "a split component that an export list reads renders from both").

### J4 Start environment separation (start-plugin-core start-compiler; RSC provider in react-start-rsc)

81 pins.

#### `start-plugin-core/tests/createServerFn/caller-dead-code.test.ts`

- **when client code uses its name in $name.** These TypeScript positions named like the import (an enum member, an overload signature parameter, a constructor parameter property) count as references to it, so the callers keep the server-only import after the handler that read it is gone.
- **when the validator link is wrapped in a $name expression.** A `.validator()` link wrapped in `satisfies` / `as` is not stripped from the callers.
- **when the validator link is on a builder stored in a variable ($name).** A `.validator()` link on a builder stored in a variable is not stripped from the callers: the client follows the handler's chain only up to the identifier (`withPost.handler(...)`), so the variable's declaration keeps its validator. Cause: `start-plugin-core/src/start-compiler/compiler.ts`, `start-plugin-core/src/start-compiler/handleCreateServerFn.ts`.
- **callers drop a handler-only function that declares a local of its own name.** A function whose body declares a local of the function's own name (`function session() { const session = ... }`) counts as used by that local, so the callers keep it, and the server-only import it reads, after the handler that called it is gone.

#### `start-plugin-core/tests/createServerFn/createServerFn.test.ts`

- **a server fn whose factory a virtual module serves by its exact id compiles in dev.** In dev, the compiler looks up a module a server fn's factory comes from under a derived id (the module's id with a query flag of its own added), which the environment then loads: a user plugin serving a virtual module by its exact id, as Vite documents it, does not know that id, so the module that defines the server fn fails to compile ("Failed to load url virtual:...?server-fn-module-lookup").
- **a handler called with ${name} is extracted.** A module is only compiled when its text matches `createServerFn` or `.handler(`, so with the builder imported from another module, a comment between the dot and `handler` hides the server fn. Cause: `start-plugin-core/src/start-compiler/compiler.ts`.

#### `start-plugin-core/tests/createServerFn/declaration-sites.test.ts`

- **a server fn declared in $name never ships its nested handler to the client.** Dependency-free nested handlers remain in successful client output.
- **with %s imported, a server fn wrapped in two calls works like an unwrapped one.** A server fn passed through calls of a user helper (`wrap(wrap(...))`, e.g. helpers registering or typing it) is not extracted: the compiler rejects it ("must be assigned to a variable"), although the server fn itself initializes a top-level variable.
- **supports a server fn in $name.** A server fn nested in a function whose handler reads no local of it is left untransformed, rejected or extracted into an invalid provider (D13: support it like a top-level one).
- **with %s imported, supports a server fn in the handler of another server fn.** A server fn created in the handler of another one is supported.
- **with %s imported, supports server fns of the same name in two functions.** Two functions of a module each declare a server fn under the same local name; each runs its own handler.
- **a server fn created through an optional call chain compiles like a plain chain or is rejected.** `.handler()` called through an optional chain (`createServerFn()?.handler(...)`) is not recognised: the module is left untransformed.

#### `start-plugin-core/tests/createServerFn/handler-scope.test.ts`

- **the handler can be a createIsomorphicFn call.** When the handler passed to `.handler()` is a `createIsomorphicFn()` chain, the chain is compiled first and the caller is never rewritten into an RPC (same cause as the createServerOnlyFn handler pin in known-bugs-start-compiler.test.ts).

#### `start-plugin-core/tests/integration/known-bugs-dev-server.test.ts`

- **client: a module importing an edited factory module through a re-export ($name) loads no server code.** On a factory module edit, the client environment of the Start compiler's Vite plugin invalidates only the direct importers of the module; the walk through transitive importers runs for server environments only (vite/start-compiler-plugin/plugin.ts `invalidateCompilerState`). Cause: `start-plugin-core/src/vite/start-compiler-plugin/plugin.ts`.
- **SSR: a module importing an edited factory module through a re-export ($name) gets a server fn.** Same as the client pin above, in the SSR environment: on a factory module edit, the server environments do walk the transitive importers (`getTransitiveImporters`), but only invalidate the compiler's state and the server-fn lookup modules of the importers it finds; Vite's module nodes of the importers two or more imports away are only soft-invalidated, and their previous transform is served.

#### `start-plugin-core/tests/integration/known-bugs-start-compiler-dev.test.ts`

- **transforms a client module with a server fn and a top-level call of a pre-bundled dependency.** Next to a server fn, a top-level `const x = f()` may be a renamed or re-exported Start factory, so in dev the client compiler loads the module of `f` through the client environment, from inside the transform.
- **calls a server fn id on a fresh dev server that has not compiled its module.** When a server fn id is not registered yet, the dev validator (`validate-server-fn-id`) transforms the source file under `?server-fn-module-lookup`, the one id the compiling transform excludes, so the id is never registered and the validator rejects it.

#### `start-plugin-core/tests/integration/known-bugs-start-compiler-vue-sfc.test.ts`

- **build: a server fn in a <script lang="ts"> block may use angle-bracket type assertions.** The parser is chosen from the module id without its query, so the `<script lang="ts">` block of a Vue SFC, which @vitejs/plugin-vue 6 serves in builds as `Page.vue?vue&type=script&lang.ts` (genScriptCode, attrsToQuery), is parsed as TSX.

#### `start-plugin-core/tests/integration/known-bugs-start-compiler.test.ts`

- **client: the server-only module of a class only server code uses is not bundled.** The client output keeps a class only server code uses, with its server-only import: the server-only module's top-level code is bundled and runs in the browser.
- **client: a server-only module a type mentions is not bundled with verbatimModuleSyntax.** The client output keeps the server-only import that a `typeof` type query still mentions (compiler pin "client: a server-only import last mentioned by a type alias ..." above); with `verbatimModuleSyntax`, Vite's TypeScript transform keeps it.
- **SSR: a server fn module is initialised once and shares its state with SSR code.** With SSR as the server fn provider, the SSR caller module and the provider module (`?tss-serverfn-split`) are two module instances of the same file in the SSR bundle, and the provider repeats the file's top-level code (exports-and-directives.test.ts "side-effect imports and top-level statements stay in every output" asserts this).
- **SSR: a server fn only server code references is not callable over HTTP.** With SSR as the provider, the production resolver lists every server fn the builds found and never checks the caller's origin (`includeClientReferencedCheck` is off, and the flag it would check is true for every SSR-caller compile, handleCreateServerFn.ts `isClientReferenced`). On Vite, a lost #7213 race (below) also fails it, through the call from SSR code. Cause: `start-plugin-core/src/start-compiler/handleCreateServerFn.ts`.
- **is callable, the app files written %s.** Vite: the production server fn resolver is generated before the SSR build has found a server fn that only another server fn's handler calls, so calling it throws "Server function info not found" (#7213).
- **its caller only client code imports: the caller is callable over HTTP, the app files written %s.** Same root cause as above: Vite's SSR build reaches a server fn only client code imports, and everything it uses (its middleware's module included), only through the resolver, so a server fn that only its handler or a middleware `.server()` calls is missing from the resolver (#7213).
- **a server fn created by a library function: the handler is not in the client bundle, or the build fails clearly.** A library function that creates server fns for its users (`createLoggedServerFn(handler)`) is never seen as a server fn in the user's module, so the handler ships to the client, silently.
- **a build run from another directory: a library's server fn runs in the SSR build.** Start's Vite plugin looks for the Start libraries it bundles in SSR (`crawlFrameworkPkgs`: dependencies with a peer dependency on Start) in the package.json of the working directory (`root: process.cwd()`), not of Vite's root, which the plugin uses for its own root a few lines above. Cause: `start-plugin-core/src/vite/plugin.ts`.
- **a module with a middleware and an isomorphic fn builds, and its middleware runs on the server.** In the SSR build, compiling a module with an isomorphic fn makes the Start compiler resolve the module's `createMiddleware` import (the server lookup does not know that factory). Cause: `start-plugin-core/src/rsbuild/start-compiler-host.ts`.
- **a CommonJS dependency with a top-level return builds and keeps its meaning.** The bundler plugins hand every module whose text matches a detection pattern (here `.handler(`) to the Start compiler, which parses it as an ES module and fails on a CommonJS script's top-level `return` (an installed package without `"type"`); the same package without that text builds and runs on both bundlers.
- **a CommonJS dependency with a top-level return compiles and keeps its meaning.** Same as above, in Rsbuild's dev server.

#### `start-plugin-core/tests/integration/pages/start-compiler-import-forms.test.ts`

- **$name alone in its module: the other environment neither loads nor runs the implementation.** The bundler plugins choose the modules the Start compiler transforms by their text (a factory name such as `createServerOnlyFn`, or `.handler(`). Cause: `start-plugin-core/src/start-compiler/compiler.ts`, `start-plugin-core/src/vite/start-compiler-plugin/plugin.ts`, `start-plugin-core/src/rsbuild/start-compiler-host.ts`.
- **through a namespace member.** `<ClientOnly>` is detected by the `<ClientOnly` / imported `ClientOnly` text, so a boundary written as a member of a namespace import (`<Router.ClientOnly>`) is never compiled.

#### `start-plugin-core/tests/integration/start-build-call-shapes.test.ts`

- **$name: the client bundle holds no server code and the shape works, or the build fails at the call.** Chain methods called through a computed member (`builder['handler'](...)`, `['server'](...)`), a server-only fn whose result is member-called (`.bind(null)`), and a server fn in a top-level block (with createServerFn the only factory imported) are left untransformed by the client compiler (in-process pins in ../known-bugs-start-compiler.test.ts), and the build succeeds.
- **$name are recognised: the client bundle holds no server code and the shape works.** The bundler plugins choose the modules the Start compiler transforms by their text (a factory name, or `.handler(`). Cause: `start-plugin-core/src/start-compiler/compiler.ts`, `start-plugin-core/src/vite/start-compiler-plugin/plugin.ts`, `start-plugin-core/src/rsbuild/start-compiler-host.ts`.

#### `start-plugin-core/tests/integration/start-build-determinism.test.ts`

- **fresh builds keep the function-to-id mapping when discovery order reverses.** Collision suffixes follow discovery order across fresh builds: at the same root, with the server function modules unchanged, the function-to-id mapping changes.

#### `start-plugin-core/tests/integration/start-build-env-separation.test.ts`

- **$construct: its server code is not in the client bundle, and runs in the SSR build.** A `.validator()` link on a builder stored in a variable is not stripped from the client (server fn and middleware): the chain walk stops at the identifier. Cause: `start-plugin-core/src/start-compiler/compiler.ts`, `router-utils/src/ast.ts`.
- **an isomorphic fn whose $name is stored in a variable runs its implementation in each build.** An isomorphic fn whose first link is stored in a variable loses that link's implementation in its environment's build (no-op, returns undefined). Cause: `start-plugin-core/src/start-compiler/handleCreateIsomorphicFn.ts`, `start-plugin-core/src/start-compiler/compiler.ts`.

#### `start-plugin-core/tests/integration/start-build-source-maps.test.ts`

- **rsbuild build: client: a throw in a split route component maps to its line in the route file ($name).** The router plugin's code splitter returns a source map of each route file it compiles, but unplugin's Rspack transform loader drops it when no earlier loader passed one in (`map == null ? map : res.map || map` in unplugin/dist/rspack/loaders/transform.mjs), so Rsbuild maps the chunk to the code splitter's output. Cause: unplugin `dist/{webpack,rspack}/loaders/transform.mjs` (upstream).

#### `start-plugin-core/tests/integration/start-build-user-code.test.ts`

- **the decorated class only a server fn handler uses is not in the client bundle.** A class only a server fn handler uses stays in the client output (dead-code elimination never removes class declarations; same root cause as the pins "client: a class used by a server fn handler does not load its server-only import" and "client: the server-only module of a class only server code uses is not bundled").

#### `start-plugin-core/tests/integration/start-compiler-build-export-cache.test.ts`

- **export \* $name do not poison the build-mode export cache.** Build-mode export lookups are cached per module, but the parallel `export *` branches of one lookup share one visited set: in a diamond (a -> b -> d, a -> c -> d) the branch that reaches `d` second finds it visited and caches its own module (`b` or `c`) as not exporting `base`; in a cycle (a -> b -> a, a -> d) the lookup through `a` caches `b` the same way.

#### `start-plugin-core/tests/integration/start-compiler-dev-server.test.ts`

- **a module whose factory becomes a server fn builder: the client bundle drops the handler.** In full-bundle dev, an edit of a module that turns what another module imports into a server fn builder does not recompile the importer: the dev engine re-bundles the edited module only, and the Start compiler's bundledDev `watchChange` forgets the edited module alone, so the importer keeps the output compiled against the old `base`, handler and server-only imports included.

#### `start-plugin-core/tests/integration/start-compose-server-fn-route.test.ts`

- **the server runs the route module once.** With SSR as the provider, the SSR bundle holds the route module twice (SSR module and server fn provider module of the same file), so its top-level code runs twice.

#### `start-plugin-core/tests/integration/start-rsc-warnings.test.ts`

- **renderToReadableStream with a variable or a spread warns once per file, naming the module.** The transform (react-start-rsc src/plugin/rscCssTransform.ts, `renderToReadableStream` branch) skips an argument that is not top-level JSX (`isTopLevelJsx`) with `continue`, and reports nothing; on Rsbuild, Start's compiler host would drop a warning of a transform too (rsbuild/start-compiler-host.ts `warnTransformContext` calls the transform context's `emitWarning`, which Rsbuild's `api.transform` context does not have). Cause: `react-start-rsc/src/plugin/rscCssTransform.ts`, `start-plugin-core/src/rsbuild/start-compiler-host.ts`.

#### `start-plugin-core/tests/known-bugs-start-compiler.test.ts`

- **client builds compile $name finished or called in another module.** Middleware, isomorphic and env-only fns are detected by the `createMiddleware` / `createIsomorphicFn` / `createServerOnlyFn` text, so a module that only finishes a builder imported from another module, or calls a factory re-exported or aliased under another name, is never compiled.
- **client builds compile a builder read from a namespace import.** A server fn builder read as a member of a namespace import (`F.authed.handler`) is not resolved, unlike the same builder imported by name.
- **client builds compile factories of a re-exported Start namespace.** A namespace of the Start package re-exported by a project module (`export * as Start from '@tanstack/react-start'`) is not resolved.
- **client builds compile a builder returned by a function of $name.** The builder of a `.handler()` chain is resolved through identifiers and member expressions only, so a builder returned by a function call (`authed().handler(...)`) is not traced.
- **client builds compile a server fn whose builder passes through a helper function.** Same family as above, for a builder the user passes through a helper function (`applyStep(createServerFn().validator(schema))`): the `.handler()` chain is not traced through the call, so the module is left untransformed.
- **each output keeps its implementation of an isomorphic fn whose chain passes through a helper function.** Same family, for an isomorphic fn whose chain passes through a helper function (`withBuilder(createIsomorphicFn().server(f)).client(g)`): the inner `createIsomorphicFn().server(f)` is compiled on its own into a plain function, so `.client(g)` is then called on that function.
- **client: a createServerOnlyFn called through $name is compiled.** Env-only factories nested in other code are found by the factory's exported name (`isNestedDirectCallCandidate`), so a renamed import or a local alias is only compiled as a top-level variable initializer.
- **$name: the client holds no server code, or the module is rejected at the call.** Chain methods are only recognised when called through a static member (`.handler(...)`, `.server(...)`), and a call whose result is member-called (`createServerOnlyFn(...).bind(null)`) is taken for the inner call of a method chain and never visited as a candidate itself: each module below is left untransformed in every environment.
- **a createServerOnlyFn local alias called in a top-level block works in each environment, or is rejected at the call.** Env-only factories nested in other code are found by the factory's exported name (`isNestedDirectCallCandidate`), so a local alias of createServerOnlyFn called in a top-level block is neither compiled nor rejected.
- **a createServerFn in $name does not ship its handler to the client.** With createServerFn the only factory imported, only top-level variable declarations are visited, so a server fn elsewhere is neither extracted nor rejected; with another factory imported, a nested declarator is extracted but its provider exports an undeclared handler.
- **with another Start factory imported, a server fn in $name works or is rejected at the call.** Next to another Start factory, a server fn that is not assigned to a variable (an object property, a class field, a default export, an assignment, a call argument, a JSX attribute, a conditional, a destructuring) is rejected with a plain `Error` ("createServerFn must be assigned to a variable!") that carries no position: the user is told the file (by the bundler) but not where in it. Cause: `start-plugin-core/src/start-compiler/handleCreateServerFn.ts`.
- **with %s imported, a nested server fn whose handler reads a local of its function is supported or rejected at the capture.** Same cause as above; a server fn nested in a function whose handler reads a local of that function (here `id`) cannot run on its own on the server, and is neither supported nor rejected.
- **distinct re-export aliases of two factories keep their own kind.** The export a re-export forwards is looked up by its local name (`wrap`) only, so two re-exports of different modules' `wrap` under distinct names resolve to the same factory.
- **%s: parameters and locals shadowing the factories are left alone next to a compiled factory call.** Same lookup-by-local-name bug as the row above, for parameters and locals shadowing the factories next to a compiled factory call.
- **a user binding named %s does not collide with generated code.** Generated imports and handler names are not made unique against user bindings, so a user binding named like one of them collides with it.
- **a server fn named opts runs on the server.** The server calls each server fn from a generated wrapper, `opts => fn.__executeServer(opts)`, whose `opts` parameter shadows a server fn named `opts`.
- **no name the compiler introduces collides with a user binding or a server fn of that name.** The same as the two pins above, for whatever names the compiler introduces (adaptive: they are read from the served code, so a compiler that only renames its generated bindings still collides here, while one that keeps them apart from user bindings passes).
- **%s: a server fn whose handler is a createServerOnlyFn call returns the handler result.** When the handler passed to `.handler()` is a `createServerOnlyFn()` call, the inner call is compiled first and the caller is never rewritten into an RPC.
- **a dev edit of a module a re-export chain ends in recompiles its importers.** After a dev edit of the module a re-export chain of an env-only factory ends in (here it now re-exports createClientOnlyFn under the createServerOnlyFn name), the module importing the factory, unchanged, keeps the code compiled for the old factory: its compiled output imports nothing of the chain, so no module graph links it to the edited module, and the compiler's own invalidation does not reach it.
- **$output: hook calls read only by the removed implementation still run.** Removing the other environment's implementation of an env function declared in a hook leaves the locals only that implementation read unreferenced, and dead-code elimination (babel-dead-code-elimination, which removes newly unreferenced bindings) deletes their declarators, hook calls included.
- **client: the factory of a classic JSX pragma stays imported.** Dead-code elimination does not count a classic JSX pragma (`/** @jsx h */`) as a use of the factory it names, so the factory import is removed when no other code reads it (the generated imports also land above the pragma comment, where Oxc no longer reads it).
- **ssr: a module with a classic JSX runtime pragma keeps its React import.** Same family as the pin above: under a classic JSX runtime pragma (`/** @jsxRuntime classic */`, whose JSX reads `React`), the SSR output removes the `<ClientOnly>` children, then dead-code elimination drops `import * as React`, which only the JSX still reads. Cause: `start-plugin-core/src/start-compiler/handleClientOnlyJSX.ts`, `start-plugin-core/src/start-compiler/compiler.ts`.
- **client and SSR: a type-only import re-exported as `export { Settings }` is erased (%s).** A type-only import re-exported without `type` (`export { Settings }`, which TypeScript accepts unless verbatimModuleSyntax is on) loses its import in the client and SSR outputs, which keep the export that the TypeScript transform can then no longer erase.
- **client: $name does not load its server-only import.** Dead-code elimination (babel-dead-code-elimination) removes unreferenced functions and variables but never class declarations, TS enums, namespaces, overloaded functions or redeclared `var`s, so such a declaration that only server code used keeps its server-only import.
- **client: a server-only import last mentioned by a type alias is not loaded with verbatimModuleSyntax.** Dead-code elimination counts a `typeof auth` type query in a top-level type alias as a use of the `auth` import, so a server-only import that the handler read and that such a type still mentions stays a value import in the client output.
- **client: a validator schema that a type alias reads with typeof is not loaded.** Same family as above, for a module-level declaration: a validator schema that a type alias also reads (`z.infer<typeof themeValidator>`) stays in the client output, with what its initializer imports, although types read no value at runtime. Cause: `router-utils/src/ast.ts`.
- **ssr: a declaration a client-only fn reads and a type alias reads with typeof is not loaded.** Same root cause as the pin above, mirrored on the server: a module-level declaration that only a client-only implementation and a `typeof` type query read stays in the SSR output, with its initializer and imports.

#### `start-plugin-core/tests/start-compiler-factories.test.ts`

- **the client strips a validator link$middleware wrapped in $name.** A `.validator()` link wrapped in `satisfies` / `as` is not recognised as a link of the middleware chain on the client, so it is not stripped.
- **the client strips a validator link of a builder stored in a variable.** A `.validator()` link of a middleware builder stored in a variable is not stripped on the client: the chain walk from `base.server(...)` stops at the identifier, so the variable's declaration keeps its validator (its `.server()` link is stripped, the control above). Cause: `start-plugin-core/src/start-compiler/compiler.ts`, `start-plugin-core/src/start-compiler/handleCreateMiddleware.ts`.
- **each output keeps its implementation of an isomorphic fn whose $name is stored in a variable.** An isomorphic fn whose first link is stored in a variable (`const base = createIsomorphicFn().server(...)`, then `export const getEnv = base.client(...)`) loses that link's implementation: each call is compiled on its own, the chain walk from `base.client(...)` stops at the identifier, so the output of the stored link's environment gets a no-op. Cause: `start-plugin-core/src/start-compiler/handleCreateIsomorphicFn.ts`, `start-plugin-core/src/start-compiler/compiler.ts`.
- **each output keeps its implementation of an isomorphic fn with a wrapped chain link: %s.** An isomorphic chain link wrapped in `satisfies` / `as` is not followed: the implementation of the wrapped link is lost.
- **each output keeps its implementation of $shape with the callee in $name.** A factory callee wrapped in `as any` is not resolved, so the call is left untransformed.
- **the server compiles env-specific functions inside a server fn handler.** The server leaves env-specific functions declared inside a server fn handler uncompiled, with the client-only module they read still imported.
- **dev: editing a factory module recompiles its importers against the new code.** After a dev edit of a module a server fn builder comes from, the client keeps serving its importers compiled against the old builder: the importer is not compiled again (the dev server only refreshes its import timestamps), so its handler stays an RPC to a server fn the edited code no longer creates.

#### `start-plugin-core/tests/start-compiler-jsx-pragma.test.ts`

- **inserted server function imports stay below the @jsxImportSource pragma: %s.** The server fn runtime import (RPC or `createServerRpc`) is inserted above the pragma comment that leads the file, so Vite 8 (Oxc) compiles the module's JSX with the default runtime (same root cause as the code splitter's pragma pin).

#### `start-plugin-core/tests/start-compiler-preserves-user-code.test.ts`

- **keeps the parentheses of asserted update operands.** The client output prints an asserted update operand without its parentheses (`count as number++`).
- **keeps the parentheses of an asserted conditional test.** The client output prints a type assertion that is the test of a conditional whose branch starts with a unary minus without its parentheses (`a as any ? -x : y`), which does not parse (`any ? -x` reads as the start of a conditional type). Cause: `router-utils/src/ast.ts`.

#### `react-start-rsc/tests/integration/rsc-start-client-module.test.ts`

- **a server function of a 'use client' module runs on the server.** The provider module (`?tss-serverfn-split`) keeps the `'use client'` directive of its source module, so the RSC bundler turns the provider's exports into client references and the handler is not there to run.

#### `react-start-rsc/tests/integration/rsc-start-private.test.ts`

- **a server function only server code calls is not callable from the browser.** A server-environment caller reports every server fn it compiles as client-referenced (handleCreateServerFn.ts `isClientReferenced`), so the resolver's client-origin check never refuses anything with a separate provider. Cause: `start-plugin-core/src/start-compiler/handleCreateServerFn.ts`.

### J5 Deferred hydration `<Hydrate>` (start-plugin-core)

37 pins.

#### `start-plugin-core/tests/integration/hydrate-build-cases.ts`

- **boundaries in split route options that another option reads hydrate in the boundaries the server renders.** A split component with a boundary that another route option reads (`head` reads `Page.name`) goes to a module the route module and the chunk share, without the lazy component of its boundary, which stays in the chunk: the shared module reads an undeclared name (the build harness rejects the client output). Cause: `router-utils/src/compiler-helpers.ts`.
- **an unused exported component with a boundary is not in the client.** The client parent declares the lazy component of each boundary with a module-level call (`lazyRouteComponent(() => import(...))`) that bundlers must keep (it is not marked pure), so the children of an unused exported component still ship: the call stays in the eager code, and its chunk is emitted. Cause: `start-plugin-core/src/hydrate-when-transform.ts`.
- **an export only the children use, initialized by a call, is initialized once and hydrates.** An initializer with side effects may keep the export in the eager code (no warning is required), but it must run once, and the children must render the one `Widget` it made, while the boundary's own children still load lazily. Cause: `start-plugin-core/src/hydrate-when-transform.ts`.

#### `start-plugin-core/tests/integration/hydrate-pages-react.ts`

- **a namespace-imported Start.Hydrate loads its children when it hydrates.** A namespace member `<Start.Hydrate>` is a boundary like a named import, so its children's code loads when it hydrates, not with the page.

#### `start-plugin-core/tests/integration/hydrate-pages-solid.ts`

- **a namespace-imported Start.Hydrate loads its children when it hydrates.** A namespace member `<Start.Hydrate>` of `@tanstack/solid-start` is a boundary like a named import.
- **split children read a context declared in the page module.** The chunk re-declares the module-level bindings its children use instead of using the parent module's (`createContext` runs again there), the Solid twin of known-bugs-hydrate.test.ts "client: the children use the module-level context of the parent module".

#### `start-plugin-core/tests/integration/pages/hydrate-boundary-forms.test.ts`

- **client: a hook called through a namespace is rejected at the boundary.** Hook calls are only detected when the callee is a bare identifier, so `React.useId()` in the children moves into the split code instead of being rejected (SPEC J5.5).

#### `start-plugin-core/tests/integration/pages/hydrate-split-modules.test.ts`

- **client: the children prop ($name) of a self-closing boundary is deferred.** `<Hydrate children={…} />` defers its children like JSX children: the parent does not need their modules before the split code loads.

#### `start-plugin-core/tests/integration/pages/known-bugs-hydrate-module-level.test.ts`

- **client: module-level $name, named like the generated bindings, do not collide.** The chunk keeps the module-level bindings the children name (by name, even when a local shadows them) under their own names, so a binding named like one the compiler generates in the chunk (its export) collides with it.
- **client: the children use the module-level $name of the parent module.** The chunk re-declares the module-level bindings the children use instead of using the parent module's instance.
- **client: an exported declaration the children use has one instance, initialized once.** An exported declaration the children use is copied into the chunk, so its initializer runs again there.
- **client: split children reading Route $name use the one route.** The client chunk removes the module's `Route` (`removeModuleLevelBindings(ast, new Set(['Route']))`) without importing it from the parent module, so split children reading it reference an undeclared binding.
- **client: an unexported component named Route that the children render reaches the chunk.** The client chunk takes any module-level binding named `Route` for the route and removes it (the removal of the pins above), even when the module does not export it and it is a plain component.
- **client: $name that the children rely on reaches the chunk.** Only declarations move into the chunk; the top-level statements that complete them (member assignments, registrations) are dropped.
- **client: a var declared in a nested block that the children read reaches the chunk.** Module bindings are collected from top-level declarations only (`collectLocalBindingsFromStatement`), so a module-level `var` declared in a nested block is dropped from the chunk.
- **client: a TypeScript import alias used by the split children is declared in the chunk.** A TypeScript import alias (`import Card = ui.Card`) used only by the split children is not declared in the client chunk.
- **client: $name used by the children reaches the chunk.** Module-level declarations the children use are only moved into the chunk for some declaration forms and uses: a default-exported function, TypeScript enums and namespaces, and a `let` the children only assign are neither declared in the chunk nor imported from the parent.
- **client: a module with a classic JSX pragma renders through its factory.** Dead-code elimination does not count a classic JSX pragma (`/** @jsx jsx */`) as a use of the factory it names, so the client parent drops the factory import once the children that call it are split (the generated code also lands above the pragma comment, where Oxc no longer reads it).

#### `start-plugin-core/tests/integration/pages/known-bugs-hydrate.test.ts`

- **a Hydrate inside a fallback does not shift the chunks of later boundaries.** The server and the client number boundaries without the Hydrate inside a `fallback`, but the chunk loader counts it.
- **client: $name hydrates like the server renders it.** A component that declares a boundary and is rendered inside a boundary (its own, or another one) is copied into the chunk, and compiling the chunk numbers the copy's boundary after the chunk's own index.
- **client: a local component named Hydrate is left alone.** Hydrate elements are matched by name instead of by binding.
- **client: children passed through $name render without unused chunks.** The boundary's children are only read from JSX children, never from a `children` prop or spread.
- **client: a boundary nested in a children prop hydrates with the id the server renders.** Same root cause as above, for a `children` prop that holds another boundary: the client does not compile the JSX of the prop, so the nested boundary hydrates without the id the server renders it with.
- **client: a text-only child renders like JSX text: $name.** A multi-line text-only child moves into the chunk as a string literal of the raw text, without the line collapsing of JSX text.
- **client: spaces around a single child on one line render like on the server.** Whitespace-only text around a single child is dropped when the children move into the chunk, although JSX keeps whitespace on the line of the child as text (the server renders it). Cause: `start-plugin-core/src/hydrate-when-transform.ts`.
- **a later boundary keeps its id and its children next to $name.** The Hydrate plugin numbers boundaries after the other Start transforms removed environment-specific code (`<ClientOnly>` children on the server; server fn handlers, `createServerOnlyFn` bodies and isomorphic `.server()` implementations on the client), while the client chunk loader counts the boundaries of the original module. Cause: `start-plugin-core/src/start-compiler/compiler.ts`, `start-plugin-core/src/hydrate-when-transform.ts`.
- **client: captured locals named key and ref reach the split children.** Captured locals are passed to the lazy chunk component as props of the same name, so locals named `key` or `ref` become React's `key`/`ref`.
- **client: the split children render a local component named %s.** A JSX tag is only taken for a read of a local when its name starts with an ASCII capital letter, so a local component named `_Local`, `$Local` or with a non-ASCII first letter is not passed to the chunk.
- **client: the split children render member-expression tags of $name.** The object of a member-expression tag (`<ui.Home />`, `<Model.Item />`) is not taken for a read of a local. Cause: `start-plugin-core/src/hydrate-when-transform.ts`.
- **client: the split children render a component bound inside them.** A JSX tag naming a binding declared inside the children (`const Icon = icons[id]` in a `.map()` callback) is taken for a capture of the component: the client parent passes `Icon={Icon}` to the chunk, where no `Icon` exists. Cause: `start-plugin-core/src/hydrate-when-transform.ts`.
- **client: property names, method keys and optional members are no reads of a local.** Property names, method keys and optional member names in the children are taken for reads of the local of the same name, which the parent then reads where the boundary renders.
- **client: the split children read a local enum.** A TypeScript enum declared in the component is not passed to the chunk.
- **client: split children reading the component's arguments render its props.** Split children reading the component's `arguments` are moved into the chunk component unchanged, where `arguments` are the chunk's own props (`this` and `super` are rejected instead).
- **client: split children may use the own `this` of $name.** A `this` owned by a function, class or method in the children is rejected, on the client and the server.
- **client: await in split children is rejected at the boundary or renders.** Split children containing `await` (async server components) are moved as is into the synchronous chunk component the client compile emits, while the server renders them inline.
- **client: the split text of a text-only boundary maps to its line and column.** A boundary whose only child is text is split into code whose text is a new string the compiler creates without the text's position, and nothing else in that code comes from the user's file: the dev server serves it with an empty source map (no mappings, no sources).

#### `start-plugin-core/tests/start-compiler-jsx-pragma.test.ts`

- **client: the parent keeps selecting the pragma JSX runtime when the import it sits on $name.** The parent's Hydrate chunk loaders are inserted above the pragma comment that leads the file.

### J6 Import protection (start-plugin-core)

67 pins.

#### `start-plugin-core/tests/integration/importProtection/build-markers.test.ts`

- **allows the import of %s: the build succeeds and the client gets the real module.** `onViolation` runs after the build replaced the denied module with a mock, so returning `false` only silences the report. Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`, `start-plugin-core/src/rsbuild/import-protection.ts`.
- **imported by an ignored importer and, further from the entry, another importer: the violation blames the other importer.** The Rsbuild adapter reports a marker violation at the marked module with the shortest import chain from the entry to the marked module (`buildTrace`, import-protection/trace.ts, a BFS to the nearest entry), whichever importer it runs through: here the exempt `src/ignored.ts`, two steps from the entry, while the importer the violation is for, `src/other.ts`, is three steps away. Cause: `start-plugin-core/src/import-protection/trace.ts`.
- **imported only by an ignored importer does not fail the build.** The Vite adapter reports a marker violation for the marked module itself (`importer` is the module importing the marker) and does not look at which modules import it, so `ignoreImporters` cannot exempt them (vite/import-protection-plugin/plugin.ts, marker handling in `resolveId`). Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.
- **imported only by an ignored importer: the ignored importer gets the real module.** An importer `ignoreImporters` exempts still gets the mock of a server-only-marked module in a mock-mode build: Rsbuild replaces the marked module itself with a mock in its loader, for every importer (the exemption pins of exemptions.test.ts, user ruling 2026-10-17); on Vite the marker violation is not exempt at all (the pin above), and in error mode the build fails.
- **in mock mode, an ignored importer gets the real module, another importer a safe mock, and only the other importer is reported.** In a mock-mode build, a server-only-marked module imported by an exempt importer and another importer is a mock for both (Rsbuild), or the real module for the other importer (Vite). Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.

#### `start-plugin-core/tests/integration/importProtection/build-mock.test.ts`

- **with mockAccess $mockAccess, using the mock of $denied is reported as an $severity naming the import.** A mock-mode production build serves self-contained mocks that never report their use, whatever `mockAccess` says ("mock mode always logs"). Cause: `start-plugin-core/src/import-protection/virtualModules.ts`.
- **%s is mocked, with a warning.** In a build, a violation of a marker (server-only in the client, client-only in the server) only replaces the marker import itself with a mock (`handleViolation` in vite/import-protection-plugin/plugin.ts returns a mock edge for the marker specifier); the marked module keeps its code, and its importers import it. Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.
- **a name re-exported with `export \*` from a denied specifier is a safe mock, or the build fails** (Rsbuild). The import-protection loader removes an `export * from` a denied specifier from the importer, and the build of the module importing one of its names succeeds without it: the name is `undefined` (ruling Q4: a safe mock, or the build fails). Vite's build fails on the missing export. Cause: `start-plugin-core/src/import-protection/rewrite.ts` (`rewriteDeniedImports`).

#### `start-plugin-core/tests/integration/importProtection/build-options.test.ts`

- **by default, the server-only marker of a dependency is not checked.** The Vite adapter checks a server-only marker when it resolves the marker import, for any importer, and never applies `excludeFiles` to the marked module (vite/import-protection-plugin/ plugin.ts, marker handling in `resolveId`), so the build fails with a marker violation of `node_modules/db-lib/index.js`.
- **[] checks the markers of dependencies: a server-only-marked dependency fails the build.** With `excludeFiles: []`, the Rsbuild adapter still skips the marker check of files under `node_modules` (the build succeeds without any report); `excludeFiles` is documented as the files the file-pattern and marker checks skip (guide/import-protection.md), and Vite checks them.

#### `start-plugin-core/tests/integration/importProtection/build.test.ts`

- **a server-only-marked module re-exported by a barrel the client uses other exports of builds without any report.** Same as the pins "a denied module the client bundle drops does not fail the build" (known-bugs.test.ts): the Rsbuild report step walks every module of the module graph, used or not, so the marked module the client bundle drops still fails the build.

#### `start-plugin-core/tests/integration/importProtection/default-rules.test.ts`

- **the client reports the dependency file it denies, and does not load it.** On the client in dev mock mode (the default), with `excludeFiles: []`, the denied import of a dependency's server file is rewritten to import the real file (`/node_modules/dep-pkg/db.server.js`, read as a `default` export it does not have) instead of a mock, and that rewritten import is reported a second time, at no position.
- **the server reports the dependency file it denies.** On the server in dev, with `excludeFiles: []`, a dependency's file the server denies (here `dep-pkg/widget`, which resolves to `widget.client.js`) is never reported: in mock mode (the dev default) the import is rewritten to read a `default` export of the real file (`/node_modules/dep-pkg/widget.client.js`, which has none), so loading the module fails ("does not provide an export named 'default'") without a report; in error mode nothing is reported and the real module loads.

#### `start-plugin-core/tests/integration/importProtection/dev-page.test.ts`

- **a denied import of a module the client entry imports is logged.** Dev import protection only logs violations it can reach from the entries it registers, Start's router entry and start entry (vite/import-protection-plugin/plugin.ts `registerEntries`). Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`, `react-start/src/client.tsx`.
- **a client-only import of a module the server entry imports is mocked on the server and logged.** Dev import protection only logs violations it can reach from the entries it registers, Start's router entry and start entry (vite/import-protection-plugin/plugin.ts `registerEntries`). Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.

#### `start-plugin-core/tests/integration/importProtection/dev.test.ts`

- **added by an edit of the importer is logged at its original import or surviving use, with a trace from the entry.** When a module changes, dev import protection drops every import graph edge that points to it (`hotUpdate` → `ImportGraph.invalidate`, import-protection/trace.ts, removes the edges where the file is the target, not only those where it is the importer). Cause: `start-plugin-core/src/import-protection/trace.ts`, `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.
- **'always' logs a violation again after an edit.** Same as "added by an edit of the importer is logged at the use" above: the edit drops the import graph edges to `src/a.ts`, and the violation found when it is transformed again is discarded as unreachable from Start's router entry.
- **'once' logs one warning for one import.** In dev, one client import of a denied file is logged twice: once for the import as written (`./secret.server`) and once for the resolved path the dev mock rewrite puts in its place, which Vite resolves again; the dedupe key of `log: 'once'` includes the specifier (`dedupeViolationKey`, import-protection/utils.ts), so the two do not dedupe (vite/import-protection-plugin/plugin.ts, transform-cache import loop and `resolveId`). Cause: `start-plugin-core/src/import-protection/utils.ts`, `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.
- **'always' logs one warning for one import each time its module is loaded.** With `log: 'always'`, one client import of a denied file is logged three times when the client loads its module once: twice for the import as written, because import protection finds the same violation both when the import resolves (`resolveId`) and when it checks the module's compiled imports (transform-cache import loop), and 'always' does not dedupe them (vite/import-protection-plugin/plugin.ts `hasSeen`), plus once for the resolved path (the 'once' pin above). Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.
- **importing a denied file, the warning names the .mdx page, located in its original mapped source.** The warning drops original coordinates for an MDX file even though @mdx-js/rollup supplies a source map for its import and use. Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`, `start-plugin-core/src/import-protection/sourceLocation.ts`, `start-plugin-core/src/import-protection/utils.ts`.
- **importing a denied specifier gets the mock, and the dev server logs a warning naming it.** To give the mock of a denied specifier the named exports its importer imports, import protection reads the importer's code from its own cache of compiled modules, which only has JavaScript and TypeScript files, and otherwise from Vite's `getModuleInfo(importer).code`, which Vite's dev server does not support: it throws "[vite] The "code" property of ModuleInfo is not supported." (vite/import-protection-plugin/plugin.ts `resolveExportsForDeniedSpecifier`). Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.
- **returning false allows the import: the client gets the real module.** Dev import protection replaces a denied file with its mock when it resolves (and transforms) the import, before it calls `onViolation`; returning `false` only silences the warning (the dev twin of the build pin "onViolation returning false allows the import of a denied file", build.test.ts).
- **with behavior "error", an import of a denied file it allows gets the real module.** Same as the pin "returning false allows the import" above, with behavior "error": the denied file is still replaced with its mock.
- **is mocked when the client loads the importer first.** Import protection decides to mock an import of a server-only-marked module when it resolves the import, and only knows a module is marked once it has transformed it. Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.
- **after an edit adds the marker, the violation is logged.** When an edit adds a server-only marker to a module the client already loaded, nothing happens to its importers: import protection only clears its own caches on the edit (`hotUpdate`), and Vite keeps the importers' transforms (a soft invalidation), so their import of the module is never resolved again, where the marker violation would be found (the retroactive marker check of `resolveId`, vite/import-protection-plugin/plugin.ts). Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.
- **after an edit adds the marker, the importer gets the mock.** After an edit adds a server-only marker to a module the client already loaded, the importers keep their transform, so the import is never resolved again and gets no mock. Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.
- **by default, is not logged, and the client gets the real module.** In dev, the Vite adapter checks the server-only marker a dependency imports when it resolves the marker import, whatever `excludeFiles` says (vite/import-protection-plugin/plugin.ts, marker handling in `resolveId`; the build twin is pinned in build-options.test.ts), and then reads the importer's code from Vite's `getModuleInfo(importer).code`, which the dev server does not support: loading the dependency throws "[vite] The "code" property of ModuleInfo is not supported." Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.
- **with excludeFiles: [], is logged, and the client gets a safe mock.** In Vite dev, a client import of a dependency that marks itself server-only (not pre-bundled) fails with "The \"code\" property of ModuleInfo is not supported" instead of being logged and mocked. Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.
- **$mockAccess: the server gets a safe mock, and using it is reported as an $severity naming the import.** The mock runtime of a violation in a server environment is always the silent one, whatever `mockAccess` says ("mock mode always logs"). Cause: `start-plugin-core/src/import-protection/virtualModules.ts`.
- **a helper a server fn factory module uses only inside .server() is not logged.** With Vite's default pre-transform requests, the Start compiler's lookup of the server fn factory module (`?server-fn-module-lookup`, in the client environment) goes through Vite's import analysis, which pre-transforms `src/helper.ts` for the client. Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.
- **a denied import of a module a server fn factory module re-exports is reported at its original import or use, with its path.** The location of the use is read from a source map of the module whose `sources` are relative to it (`other.ts`), and import protection takes the source as it is (import-protection/sourceLocation.ts `mapGeneratedToOriginal`, `orig.source`), so `Importer:` names the file without its directory. Cause: `start-plugin-core/src/import-protection/sourceLocation.ts`.
- **a denied import of a module warmed up before its importers is logged once the client loads the app.** A module the dev server transforms before any importer of it is known (Vite's `server.warmup`, which transforms the listed files as the server starts, or any request that comes first) has its violations discarded as unreachable from Start's entries (vite/import-protection-plugin/plugin.ts `processPendingViolations`, `'unreachable'`; only bundled dev keeps them pending), and Vite caches its transform, so they are never checked again, even once the app loads the module from its entry. Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.
- **with perEnvironmentStartEndDuringDev, a denied import of a module the client loads after the server rendered is logged.** With Vite's `server.perEnvironmentStartEndDuringDev`, each environment runs `buildStart` when it first handles a module, and import protection's `buildStart` clears the state of every environment (vite/import-protection-plugin/plugin.ts `clearEnvState` for each), so the server's first request drops the client's import graph: a module the client loads afterwards is unreachable from Start's entries and its violations are discarded. Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.
- **the trace of a denied file imported from a module of src/routes leads from the router entry.** In full-bundle dev, import protection takes each client module of `src/routes` as an entry, so that a violation under a route the bundle reaches before the router entry's imports are known is not discarded (vite/import-protection-plugin/plugin.ts `resolveId`, bundled dev `env.graph.addEntry(normalizedImporter)`); the trace then stops at the first entry it meets. Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.
- **with mockAccess off, a server fn built with a factory of a denied file gets the mock in the client bundle and is logged at its original import or use.** The Start compiler looks up the factory in the denied file's mock (`import mock from 'tanstack-start-import-protection:mock'`) with its lookup query, and the Vite adapter loads the silent mock only by its exact id (vite/import-protection-plugin/virtualModules.ts `loadResolvedVirtualModule`): Rolldown cannot load `\0tanstack-start-import-protection:mock?server-fn-module-lookup`. Cause: `start-plugin-core/src/vite/import-protection-plugin/virtualModules.ts`.
- **in a JSX module, a use of a denied file imported through a subpath import alias is located on its source line.** Import protection keeps a module's source map for its diagnostics up front only when the module's compiled code names a denied module (`shouldCaptureDiagnosticSourceMap`, vite/import-protection-plugin/ plugin.ts).
- **with maxTraceDepth, a deeper trace is cut, keeping the importer.** Dev import protection replaces its trace (cut at `maxTraceDepth`) with the trace it finds in Vite's module graph whenever that one is longer (vite/import-protection-plugin/plugin.ts `rebuildAndAnnotateTrace`); the module graph trace runs from the entry and is only cut at `maxTraceDepth + 2` steps, from the entry side (so in a chain deeper than that, it does not reach the importer). Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.

#### `start-plugin-core/tests/integration/importProtection/exemptions.test.ts`

- **an importer that is not exempt gets the mock and is reported.** With `importProtection.include`, a denied file outside the patterns is never mocked: its own transform skips out-of-scope files before the self-denial. Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.
- **the exempt importer gets the real module, and is not reported.** An importer exempted by `ignoreImporters`/`exclude` gets the mock instead of the real module (ruling 2026-10-17: exempt importers get the real module).
- **an importer that is not exempt gets the mock and is reported.** With `importProtection.include`, a denied file outside the patterns is never mocked: its own transform skips out-of-scope files before the self-denial. Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.
- **the exempt importer gets the real module, and is not reported.** An importer exempted by `ignoreImporters`/`exclude` gets the mock instead of the real module (ruling 2026-10-17: exempt importers get the real module).

#### `start-plugin-core/tests/integration/importProtection/known-bugs-dev.test.ts`

- **a server fn factory module calling a denied import at the top level fails to load.** The Start compiler resolves the imports of a server fn factory module with a lookup query (`SERVER_FN_LOOKUP`), and import protection records the module as a lookup module by its path without the query (`serverFnLookupModules`, vite/import-protection-plugin/plugin.ts `resolveId`). Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.
- **a module a server fn factory module imports, calling a denied import at the top level, fails to load.** Same cause as the pin above, one module further: when the Start compiler's lookup of a server fn factory module resolves the module's imports, import protection records each imported module as a lookup module too (vite/import-protection-plugin/plugin.ts `resolveId`, "Propagate pre-transform status transitively"), by its path, so the client's own transform of that module is silenced as well. Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.
- **a module of a custom type importing $name is reported, and its real code does not run.** Rsbuild import protection checks importers by file extension (`isImportProtectionSourceFile`, rsbuild/import-protection.ts, only JS/TS extensions), and its loader rule only rewrites those files, so an importer of another module type that compiles to JS (a custom type here, `.mdx` through its real loader below) is never checked: a denied file is mocked (the file rule) but not reported, and a denied specifier is neither reported nor mocked. Cause: `start-plugin-core/src/rsbuild/import-protection.ts`.
- **an .mdx page importing $name is reported in its source, and its real code does not run.** Rsbuild import protection checks importers by file extension (JS/TS only), so an `.mdx` importer is never checked: a denied file is mocked but not reported, and a denied specifier's real code runs. Cause: `start-plugin-core/src/rsbuild/import-protection.ts`.
- **vite dev: ${name}.** The mock edge of a denied specifier exports only the names the importer reads statically, so `ns[key]` of a namespace import is `undefined`; a mock-mode Rsbuild build also inlines the real value of an enum member of a denied file. Cause: `start-plugin-core/src/import-protection/virtualModules.ts`.

#### `start-plugin-core/tests/integration/importProtection/known-bugs.test.ts`

- **a denied module the client bundle drops does not fail the build.** The build check counts a denied module as surviving when the compilation contains it, whether or not the client uses it. Cause: `start-plugin-core/src/import-protection/virtualModules.ts`.
- **in mock mode, an unused denied module leaves nothing in the client bundle and no warning.** Same as above, in mock mode: the mock of a denied module the client never uses stays in the client bundle, and the build warns about it.
- **a client dynamic import of a denied specifier fails the build, reporting one client violation.** A dynamic `import('db-lib')` of a denied specifier is neither reported nor mocked: the Rsbuild loader only rewrites static imports and re-exports (`rewriteDeniedImports`, import-protection/rewrite.ts), and the build reports specifier violations only through the mock modules of rewritten imports (`processAssets` in rsbuild/import-protection.ts). Cause: `start-plugin-core/src/import-protection/rewrite.ts`, `start-plugin-core/src/rsbuild/import-protection.ts`.
- **in mock mode, a denied .server.json file is mocked, with a warning.** In mock mode, a denied file that is not JavaScript or TypeScript keeps its content: Vite replaces a denied file with its mock in a transform hook whose filter only lets JS/TS modules through (`/\.[cm]?[tj]sx?($|\?)/`, transform-cache plugin of vite/import-protection-plugin/plugin.ts), and the Rsbuild loader rule only applies to JS/TS modules (`test: /\.[cm]?[tj]sx?$/`, rsbuild/import-protection.ts). Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`, `start-plugin-core/src/rsbuild/import-protection.ts`.
- **in mock mode, a denied .server.cjs file is mocked, with a warning.** In mock mode, a denied CommonJS file (`.server.cjs`) fails the build: the mock that replaces the file is an ES module, which Vite's parser rejects in a `.cjs` file (`export default mock`), and whose named exports are the ES exports of the denied file, which a CommonJS file has none of, so Rspack cannot link the named import (`export 'secret' ... was not found`).

#### `start-plugin-core/tests/integration/importProtection/reported-location-trace.test.ts`

- **the trace goes through modules outside the source directory.** The trace of a Vite build starts at the first module of the trace that is in the source directory and not in `node_modules`: the Vite adapter does not record the imports of other modules in its import graph (vite/import-protection-plugin/plugin.ts). Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.
- **the trace starts at the entry when a module imports the entry back.** Rsbuild: when a module imports the entry back, the trace collapses to the importer alone, tagged as the entry (the concatenated entry module is registered by its loader path). Cause: `start-plugin-core/src/rsbuild/import-protection.ts`.
- **$build: after $name.** A trace step's location is the import's position in the compiled code of the module unless import protection captured a source map of it: the Vite adapter captures one only for modules whose code names a denied file or specifier pattern or a marker (`shouldCaptureDiagnosticSourceMap` in vite/import-protection-plugin/plugin.ts), the Rsbuild adapter only when the build emits source maps. Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.

#### `start-plugin-core/tests/integration/importProtection/reported-location.test.ts`

- **$channel: $name.** The usage lookup counts a member property named like a denied import (`db.eq`) as a use of the import (shared `findPostCompileUsagePos` / `findOriginalUnsafeUsagePos` in import-protection/analysis.ts, used by both adapters). Cause: `start-plugin-core/src/import-protection/analysis.ts`.
- **$channel: $name.** The original-source usage lookup, which the Rsbuild adapter tries first, takes any `<name>ServerFn.handler(...)` callback for a server fn handler by its name (`/ServerFn$/`, `isCompilerSafeBoundaryCall` in import-protection/analysis.ts) and skips the use inside it; the compiled-code lookup it then falls back to reports compiled-code coordinates (the same fallback as the pins below). Cause: `start-plugin-core/src/import-protection/analysis.ts`.
- **$channel: $name.** The original-source usage lookup, which the Rsbuild adapter tries first, counts uses in type positions (`typeof secret`), which TypeScript erases, and does not count a JSX element (`<Secret />`) as a use; the compiled-code lookup it then falls back to reports compiled-code coordinates when the module has no column source map (production builds, and Rsbuild's default `cheap-module-source-map` in development).
- **$channel: $name.** The original-source usage lookup, which the Rsbuild adapter tries first, skips only functions passed directly to a compiler-safe boundary call (`isInsideCompilerSafeBoundaryNodes`, import-protection/analysis.ts), but the client compile removes the whole `createServerOnlyFn(...)` call, whatever its argument (here a function wrapped in `wrap(...)`), so the use inside it never runs in the client; the lookup reports it (src/a.tsx:5:48) instead of the leak on line 6. Cause: `start-plugin-core/src/import-protection/analysis.ts`.
- **$channel ($name): a JSX element.** With source maps, Rsbuild import protection names the importer after the map's source URL (`webpack://<namespace>/./src/a.tsx`), a path that is no file of the app, for imports it finds in the compiled code. Cause: `start-plugin-core/src/import-protection/sourceLocation.ts`.

#### `start-plugin-core/tests/integration/importProtection/v2-alias.test.ts`

- **the build fails, reporting the aliased specifier at its original line.** With vite-tsconfig-paths, a violation through a `paths` alias is reported with the mapped specifier (`src/secret.server`) and no location, not the `~/secret.server` the user wrote. Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.

#### `start-plugin-core/tests/integration/importProtection/v2-edits-page.test.ts`

- **the step reports its violations, and only those.** The violation the edit adds is never logged. Cause: `start-plugin-core/src/import-protection/trace.ts`, `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.

#### `start-plugin-core/tests/integration/importProtection/v2-policy.test.ts`

- **an importer $how gets the real module.** Rsbuild dev replaces a denied file with its mock in the file's own transform, for every importer (rsbuild/import-protection-loader.ts: `checkFileDenial` matches, then `generateDevSelfDenialModule`), before an importer's exemption or the verdict of `onViolation` (`reportViolation`, rsbuild/import-protection.ts, at the end of the compile) counts. Cause: `start-plugin-core/src/rsbuild/import-protection-loader.ts`, `start-plugin-core/src/rsbuild/import-protection.ts`.
- **the client gets the real module.** The `Promise<false>` twin of the pin "returning false allows the import: the client gets the real module" (dev.test.ts): dev import protection replaces the denied file with its mock when it resolves the import, before `onViolation` decides; returning `Promise<false>` only silences the report (the control above).

#### `start-plugin-core/tests/integration/known-bugs-dev-server.test.ts`

- **client: a server fn module calling a function of a denied specifier at the top level loads.** When the Start compiler resolves an import of the module it is compiling (here the callee of a top-level call next to a server fn), import protection handles a denied specifier before the module's transform result exists, and falls back to `getModuleInfo(importer).code`, which Vite's dev server does not support: reading it throws (vite/import-protection-plugin/plugin.ts `resolveExportsForDeniedSpecifier`). Cause: `start-plugin-core/src/vite/import-protection-plugin/plugin.ts`.
- **client: the importer of a module whose server-only marker was removed loads the module.** Import protection replaces a client import of a module it knows is server-only-marked with a mock when it resolves the import.
- **client: a name re-exported with `export \*` from $name is a mock, or the server warns at the `export \*`.** In dev, a client module's `export * from` a denied module re-exports nothing: the mock edge of a denied specifier exports only the names its importer uses, and `export *` uses none; a denied file's `export *` is removed from the importer. The importer of the name fails to load (ruling Q4: a safe mock, or a warning at the `export *`, never a crash or the denied module's value).

#### `start-plugin-core/tests/integration/rsbuild/import-protection.test.ts`

- **the file rule denies the module it resolves to: the importer is reported at the import or the use.** The report of a denied import `source.transformImport` rewrote points at neither the import nor the use of its binding (`src/entry.ts:2:25`, the arrow of `read`; the use `button()` is at 2:27): the location is only found in the rewritten code (through the mock module's path), whose positions do not map back to the source. Cause: `start-plugin-core/src/rsbuild/import-protection.ts`.
- **denied as written, the build fails on it, reporting the importer at the import or the use.** A specifier denied as the user wrote it is not denied once `source.transformImport` rewrote it: the loader matches the specifiers of the code SWC already transformed (`ui-lib/button`), so `'ui-lib'` never matches, and the build ships the library to the client without any error or warning. Cause: `start-plugin-core/src/rsbuild/import-protection-loader.ts`.

### J7 RSC CSS injection (react-start-rsc)

8 pins.

#### `react-start-rsc/tests/integration/rsc-css-diagnostics.test.ts`

- **%s dev warns about the CSS limitation once per source file, naming it.** Identifier and spread stream arguments silently miss CSS delivery: the real RSC integration skips them without a warning (J7.3, D8). Cause: `react-start-rsc/src/plugin/rscCssTransform.ts`.

#### `react-start-rsc/tests/integration/rsc-css-rsbuild-root.test.ts`

- **Rsbuild: the app compiles when the process does not run in the app directory.** Start's Rsbuild plugin writes its virtual modules (serialization adapters, RSC decode) under `<process.cwd()>/node_modules/.virtual` (rsbuild/virtual-modules.ts `virtualPath`, with `resolvedStartConfig.root` still empty at setup), where the app's `@tanstack/react-start` does not resolve when the process runs elsewhere (`rsbuild dev --root <app>` from a monorepo root). Cause: `start-plugin-core/src/rsbuild/virtual-modules.ts`.

#### `react-start-rsc/tests/integration/rsc-css-rsbuild.test.ts`

- **a render call in a helper module styles the server component.** On Rsbuild, the RSC CSS transform only rewrites server function provider modules (`serverFnProviderOnly: true`), so a render call in a helper module that a server function calls gets no CSS: the server component renders unstyled, while Vite styles it. Cause: `react-start/src/plugin/rsbuild.ts`, `react-start-rsc/src/plugin/rscCssTransform.ts`.

#### `react-start-rsc/tests/integration/rsc-css.test.ts`

- **renderToReadableStream($argument) styles the stream.** The transform only wraps an argument that is JSX itself, not a conditional or logical expression whose branches are all JSX, which is as safe to wrap.
- **a false ternary stream carries its selected badge CSS.** The alternate JSX branch has no CSS, just like the consequent. Cause: `react-start-rsc/src/plugin/rscCssTransform.ts`.
- **dev: renderToReadableStream with $name warns, naming the file.** The transform silently skips a `renderToReadableStream` argument it cannot see the JSX of (a variable, a spread).
- **renderToReadableStream does not render $name before the JSX argument.** A comment before the JSX argument of `renderToReadableStream` is moved into the generated CSS fragment, where it becomes JSX text.
- **renderServerComponent styles the server component when its result is chained.** A call whose result is immediately member-called (`renderServerComponent(...).then()`) is recorded as the inner call of a method chain and never visited as a candidate itself. Cause: `start-plugin-core/src/start-compiler/compiler.ts`.

## Upstream issues

Bugs whose root cause is in a dependency. None is worked around in product code. Each one is either pinned (the
dependency is the compiler's own implementation choice), kept out of the pins with its reason, or carries an
authorized harness change with a "remove when" comment ([RULINGS.md](./RULINGS.md#test-workarounds-for-upstream-bugs)).
Nothing here was filed upstream; the proposals are in the working notes (FOLLOWUPS, "UPSTREAM" entries).

- **Rspack's vendored watchpack loses a removal during a compile.** Rspack 2.2 vendors watchpack 2.5.2, which loses
  a file removal that lands while a compile runs (fixed in watchpack 2.6.0, webpack/watchpack#345).
  - Authorized workaround: Rsbuild tests delete or recreate one file per edit and settle before the next write.
    Remove it (merge the steps back) once Rspack bundles watchpack ≥ 2.6. Where:
    `start-plugin-core/tests/integration/importProtection/v2-edits.test.ts`,
    `importProtection/v2-edits-page-rsbuild.test.ts`, `importProtection/v2-hosts.ts`,
    `start-plugin-core/tests/integration/rsbuild/dev-server.test.ts`.
- **Rspack's vendored watchpack never reports a file removed during its first scan.** Rspack attaches its watcher
  on the tick after a compile, and watchpack 2.5.2's first directory scan marks a file listed but deleted before
  its `lstat` as missing without a `remove`.
  - Harness wait (harness realism, may stay): the Rsbuild dev harness resolves only once every compiler's watcher is
    attached and has scanned the app, and writes the initial app files with past modification times. Where:
    `CompileTracker.watching` and the initial-write mtimes in `compiler-test-utils/src/rsbuild-dev-server.ts`.
- **Vite full-bundle dev leaves a rejection unhandled on close.** In Vite 8 `experimental.bundledDev`,
  `BundledDev.listen()` does not handle the `waitForInitialBuildFinish()` rejection, so closing the server during
  its initial build logs "Failed to get bundle state". There is no public API to await it (vitejs/vite#22991).
  - Authorized workaround: before `close()`, the harness waits for Vite's initial-build bookkeeping, reading one
    Vite internal. Remove it once Vite handles the rejection. Where: `compiler-test-utils/src/dev-server.ts`.
- **Vite's dependency optimizer writes its cache after `close()` resolved (final-pass #34).** Vite 8.3.4's
  `depsOptimizer.close()` does not await all of the optimizer's work: `runOptimizeDeps().cancel()` only sets a flag the
  Rolldown build reads before it writes, the run a scan starts while `close()` awaits that scan is never cancelled, and
  a commit removes the previous cache directory without awaiting it. Each keeps writing or removing
  `node_modules/.vite/deps_temp_*` after the server closed: removing the app then fails with `ENOTEMPTY`, or the build
  fails to write into the removed app ("Error during dependency optimization", rolldown "Failed to write file", an
  unhandled rejection).
  - Authorized wait (ruling 2026-10-23): before `close()`, the Vite dev harnesses wait until each environment's
    optimizer has initialized and scanned and no `deps*_temp_*` directory is left in the cache directory
    (`closeViteServer` in `compiler-test-utils/src/dev-server.ts`; RULINGS "Vite's dependency optimizer: close
    wait"). Remove it once Vite awaits its optimizer's work on close. Upstream report drafted, not filed.
- **Vite keeps a stale pre-bundled dependency (final-pass #42).** Vite 8.3.4 computes an optimized dependency's
  `fileHash` from the chunk's imports only. When a late-discovered dependency makes Rolldown export a shared module
  from an existing chunk (`react_jsx-runtime.js` gains `export { … as t }`), the hash and the browser URL stay the
  same, no reload is sent, and the page fails with "does not provide an export named 't'".
  - Not reproduced since 2026-10-22 (0 hits in about 350 runs since the harness apps moved to `tanstackStart()`,
    whose framework plugins pre-bundle React when the server starts); closed by the ruling of 2026-10-23, no
    workaround. Reopen if seen. Signature: a page error `The requested module '/node_modules/.vite/deps/<chunk>.js?v=…'
does not provide an export named '<one letter>'`, first seen in
    `start-plugin-core/tests/integration/known-bugs-start-compiler-dev.test.ts` (the client-pages dev server) and
    `start-compiler-dev-server.test.ts` under load.
- **The React Refresh wrapper appends its footer without a line break.** `@vitejs/plugin-react` 6.0.1 uses Rolldown's
  `viteReactRefreshWrapperPlugin` (Vite 8.3.4), which appends `import * as RefreshRuntime …` right after the
  module's code. A module that ends in a line comment loses the footer's first line, and the next hot update throws
  `RefreshRuntime is not defined`. Reachable at baseline when import protection rewrites a component module whose
  last statement has a trailing line comment.
  - Not pinned: the compiler's output is valid JavaScript; the concatenation is the bug. The R4 printing variant
    was changed instead (it no longer ends its output with a line comment). No harness change.
- **Vite's resolver cuts file paths at `#`.** Outside `node_modules`, Vite's `tryFsResolve` treats `#` in a file
  path as a fragment (`cleanUrl`), so a query import of a file under a directory named `c#proj` does not resolve
  (dev and build). A plain Vite app fails the same way.
  - Not pinned (the Start build-ids pin was removed): not reachable as a compiler outcome.
- **Vite's TypeScript transform skips `.cts`.** `vite:oxc`'s default `include` has no `.cts`, and neither it nor
  Rolldown's extension inference handles a `.cts` id with a query. A `.cts` module with TypeScript-only syntax fails
  in dev, and in a build once it is imported with a query, also in a plain Vite app.
  - Not pinned (the dev pin was dropped; builds are not pinned): the compiler's query-suffixed module is ordinary
    Vite practice.
- **es-module-lexer cannot parse a default and a string-keyed named import in one declaration.** Vite 8's
  es-module-lexer (2.3.2) fails on `import def, { "kebab-name" as kebab } from "x"`, which is valid JavaScript, with
  or without Start.
  - Test input: `start-plugin-core/tests/integration/importProtection/mock-shapes.test.ts` ("every form of import and
    re-export") writes the two imports as separate declarations. Not pinned.
- **@vitejs/plugin-rsc's dev runtime imports a missing `default`.** Its dev runtime imports a `default` export that
  `virtual:vite-rsc/server-references` does not provide.
  - Scoping, not a workaround: the strict module runner of `compiler-test-utils/src/strict-runner.ts` checks named
    imports only in the app's own modules.
- **Node abandons a connection the kernel made when the event loop is blocked (final-pass #56).** Node's
  address-family selection (`autoSelectFamily`) gives each address 500 ms on the event loop's clock and closes the
  pending attempt when its timer fires. A test worker blocked for longer (other tests' synchronous work under heavy
  load) abandoned the `::1` connection to Vite's `localhost` server and was refused at `127.0.0.1`: "no HMR
  connection" at host start.
  - Not a workaround: the Vite dev harness listens on `127.0.0.1`, as every other harness server does, so its URL
    names one address. Where: `compiler-test-utils/src/dev-server.ts`; control in
    `compiler-test-utils/tests/integration/plugin-host.test.ts`.
- **Rspack and webpack leave unbound reads in kept dead code.** In unminified production output, Rspack 2.2 drops an
  unused import specifier whose reader is still emitted, and both Rspack and webpack 5 drop the lexical
  declarations after a computed `return` but keep the hoisted functions that read them.
  - Scoping, not a workaround: the dangling-name check covers only the modules the compilers under test produced or
    changed (SPEC G8, RULINGS "dangling names"). Where: `checkDanglingNames` in
    `compiler-test-utils/src/build-harness.ts`; controls in `compiler-test-utils/tests/integration/build-harness.test.ts`
    ("dangling names in webpack and Rspack production client builds").
- **unplugin drops source maps on webpack and Rspack.** unplugin 3.3's webpack and Rspack transform loaders drop
  the source map a plugin returns when no earlier loader passed one in (`dist/{webpack,rspack}/loaders/transform.mjs`).
  Split chunks then map to the code splitter's output.
  - Pinned: unplugin is the compiler's own bundler-integration layer. Where:
    `router-plugin/tests/integration/build-source-maps.test.ts`, `router-plugin/tests/integration/dev-source-maps.test.ts`,
    `start-plugin-core/tests/integration/start-build-source-maps.test.ts`.
- **`@babel/generator` drops required parentheses.** Version 7.29 prints parenthesized JSX under a non-null
  assertion or a member access (`(<p/>)!`, `(<p/>).valueOf()`) and a type assertion that is the test of a
  conditional whose branch starts with a unary minus (`((a) as any) ? -x : y`) without their parentheses. The output
  does not parse.
  - Pinned: Babel is today's printer. Where: `router-plugin/tests/integration/pages/known-bugs-code-splitter-bindings.test.ts`,
    `start-plugin-core/tests/start-compiler-preserves-user-code.test.ts`.
- **babel-dead-code-elimination counts `typeof` type queries as references.** Version 1.0.12 keeps a declaration
  that only a type reads (`z.infer<typeof schema>`), with its initializer and imports
  (pcattori/babel-dead-code-elimination#50).
  - Pinned: today's dead-code elimination. Where: `start-plugin-core/tests/known-bugs-start-compiler.test.ts`,
    `start-plugin-core/tests/integration/start-build-env-separation.test.ts`.
