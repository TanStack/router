# Known bugs of today's compilers

Each bug is pinned by `.fails` tests that assert the correct outcome and accept any correct fix. When your compiler
fixes a bug, its pins fail with "Expect test to fail": remove the `.fails` and keep the test.

One entry per root cause: the bug, the SPEC clause, the pins (`file` and test names; paths under `packages/`;
`$name`, `%s` and `${…}` are table-row placeholders), and what a fix must achieve. The test comment (`Bug:`,
`Impact:`) has the details. "Cause" files name today's implementation; a rewrite may have no such file.

Totals: 369 pin sites in 102 test files (a table test counts once; Vitest counts each row).

Pins whose input picks a name today's compiler generates (S6) flip with a compiler that generates other names. The
adaptive pins next to them, which read the names a compiler actually generates, are the real check.

## Shared causes (several jobs)

**S1. JSX pragmas are not kept effective.** Code the compilers insert lands above a file's leading pragma (Oxc reads
leading pragmas only); a non-leading pragma becomes leading in a chunk; dead-code elimination does not count a
classic pragma as a use of its factory, so the factory import is dropped. SPEC J2.16, G12. Fix: every emitted module
compiles its JSX under the runtime the untouched file has, and keeps the factory it needs. 13 pins:

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
- `start-plugin-core/tests/known-bugs-start-compiler.test.ts`: "client: the factory of a classic JSX pragma stays
  imported"; "ssr: a module with a classic JSX runtime pragma keeps its React import".
- `start-plugin-core/tests/integration/pages/known-bugs-hydrate-module-level.test.ts`: "client: a module with a
  classic JSX pragma renders through its factory".

**S2. Dead-code elimination keeps what only types or non-reads mention, and never removes some declaration kinds.**
babel-dead-code-elimination counts `typeof x` type queries, TypeScript-only positions (enum members, overload and
constructor parameters) and a local of a function's own name as reads, and never removes classes, enums, namespaces,
overloaded functions or redeclared `var`s. Server-only imports then stay on the client. SPEC J4.12, J2.5. Fix: code
only server code (or only types) reads is gone from the client, with its imports. 9 pins:

- `start-plugin-core/tests/known-bugs-start-compiler.test.ts`: "client: $name does not load its server-only import";
  "client: a server-only import last mentioned by a type alias is not loaded with verbatimModuleSyntax"; "client: a
  validator schema that a type alias reads with typeof is not loaded"; "ssr: a declaration a client-only fn reads and
  a type alias reads with typeof is not loaded".
- `start-plugin-core/tests/integration/known-bugs-start-compiler.test.ts`: "client: the server-only module of a class
  only server code uses is not bundled"; "client: a server-only module a type mentions is not bundled with
  verbatimModuleSyntax".
- `start-plugin-core/tests/integration/start-build-user-code.test.ts`: "the decorated class only a server fn handler
  uses is not in the client bundle".
- `start-plugin-core/tests/createServerFn/caller-dead-code.test.ts`: "when client code uses its name in $name";
  "callers drop a handler-only function that declares a local of its own name".

**S3. The printer drops required parentheses** (`@babel/generator`): `count as number++`, `a as any ? -x : y` do not
parse. SPEC G12. Fix: printed code parses and means the same. 4 pins:

- `router-plugin/tests/integration/pages/known-bugs-code-splitter-bindings.test.ts`: "an asserted update operand keeps
  its parentheses in a split component"; "an asserted conditional test keeps its parentheses in a split component".
- `start-plugin-core/tests/start-compiler-preserves-user-code.test.ts`: "keeps the parentheses of asserted update
  operands"; "keeps the parentheses of an asserted conditional test".

**S4. Source maps are lost on webpack and Rspack.** unplugin's webpack and Rspack transform loaders drop the map a
plugin returns when no earlier loader passed one in. SPEC G6. Fix: a throw in a split chunk maps to the route file's
line (and column). 4 pins:

- `router-plugin/tests/integration/build-source-maps.test.ts`: "a throw in a split component maps to its line in the
  route file ($name)"; "a throw in $name maps to its line and column in the route file".
- `router-plugin/tests/integration/dev-source-maps.test.ts`: "the route module and every module derived from it map a
  throw to its line in the route file".
- `start-plugin-core/tests/integration/start-build-source-maps.test.ts`: "rsbuild build: client: a throw in a split
  route component maps to its line in the route file ($name)".

**S5. A type-only import re-exported as `export { Settings }` loses its import** (valid TypeScript without
`verbatimModuleSyntax`), so the TypeScript transform can no longer erase the export. SPEC G1, §2.1. Fix: the module
still compiles and the type export is erased. 2 pins:

- `router-plugin/tests/integration/pages/known-bugs-code-splitter-bindings.test.ts`: "a type-only import re-exported
  as `export { Settings }` is erased (%s)".
- `start-plugin-core/tests/known-bugs-start-compiler.test.ts`: "client and SSR: a type-only import re-exported as
  `export { Settings }` is erased (%s)".

**S6. Generated names collide with user bindings.** SPEC G15, §5.1. Fix: no generated name shadows or redeclares a
user binding. 8 pins:

- `router-plugin/tests/integration/pages/known-bugs-code-splitter-shapes.test.ts`: "a route file binding named $name
  keeps its value"; "route file bindings named like what the compiled modules introduce keep their values"
  (adaptive).
- `router-plugin/tests/known-bugs-route-hmr.test.ts`: "a user binding named hot ($name) does not collide with the
  injected HMR code".
- `router-plugin/tests/known-bugs-route-hmr-bindings.test.ts`: "a route file importing a binding named Map renders
  with route HMR".
- `start-plugin-core/tests/known-bugs-start-compiler.test.ts`: "a user binding named %s does not collide with
  generated code"; "a server fn named opts runs on the server"; "no name the compiler introduces collides with a user
  binding or a server fn of that name" (adaptive).
- `start-plugin-core/tests/integration/pages/known-bugs-hydrate-module-level.test.ts`: "client: module-level $name,
  named like the generated bindings, do not collide".

## J1 Route file upkeep (30 pins)

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
  `router-generator/tests/generator-options.test.ts`: "an empty .ts route file is scaffolded, and the other routes
  still generate". Fix: a valid scaffold, and the other routes generate.
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
  J1.10. `router-plugin/tests/integration/known-bugs-rsbuild-generator-physical.test.ts`: "a route file created under a
  physical() mount outside the routes directory reaches the live routes".
- **Rsbuild: a route file the generator cannot parse is left out of the bundle, so its fix is never seen.** SPEC
  J1.10, G5. `router-plugin/tests/integration/known-bugs-rsbuild-generator.test.ts`: "a created route file the
  generator cannot parse is reported, and fixing it adds the route".

## J2 Route code splitting (105 pins: 89 below, 16 in S1, S3–S6)

Router-plugin paths below are under `router-plugin/tests/`; `pages/` means `integration/pages/`.

- **Imported route options are not read** (only an object literal of the route file is): nothing is split or
  deleted, silently. SPEC J2.8, J2.14. `code-splitter-imported-options.test.ts`: "are split, or reported once naming
  the route file"; "lose the options of deleteNodes and what only they import, or are reported once naming the route
  file". (Start's client build: J2.14 section.)
- **A JSX tag starting with `_`, `$` or a non-ASCII lowercase letter is taken for an intrinsic element.** SPEC J2.4.
  `code-splitter-jsx.test.ts`: "gives separate loader and component chunks the one JSX component %s".
- **The esbuild adapter never runs the generator in a build**, so nothing is split and nothing refuses. SPEC J2.18.
  `integration/build-harness.test.ts`: "router plugin with esbuild loads a split component lazily and renders it, or
  refuses the build (%s)".
- **An already-lazy option value is wrapped again** and suspends after preload. SPEC §6 OQ13.
  `integration/code-splitter-router.test.ts`: "renders without a new request or a pending fallback once the router
  preloaded it".
- **Default-exported declarations shared by options are duplicated** ("Duplicate declaration"). SPEC J2.4.
  `integration/code-splitter-runtime.test.ts`: "preserves executable route contracts with shared named-default
  declarations"; `pages/known-bugs-code-splitter-bindings.test.ts`: "a split option renders the default-exported
  component other modules import"; "a default-exported function the loader and the split component call works on one
  state".
- **Split chunks keep exports of the route file their option does not use.** SPEC J2.5.
  `integration/known-bugs-code-splitter-page-code.test.ts`: "$name loads with its chunk"; "${exportedSharedByOptions.name}
  loads with its chunk"; "${unreadExport.name} is not in its chunk"; `pages/known-bugs-code-splitter-shapes.test.ts`: "a
  split chunk holds only what its option needs, not the other exports of the route file"; "split chunks do not
  re-export or declare the re-exports and default class of the route file". Fix: a chunk carries only what its group
  needs.
- **Split chunks copy exported declarations they read instead of importing them** (two instances), or miss an
  export written as `X as any`. SPEC J2.4. `integration/known-bugs-code-splitter-ssr-builds.test.ts`: "the split
  component and other modules share an exported $name"; `integration/known-bugs-code-splitter-client-builds.test.ts`:
  "an exported errorComponent written as `PostErrorComponent as any` is one instance in the client (vite build)";
  `pages/known-bugs-code-splitter-bindings.test.ts`: "an exported errorComponent written as `%s` is the instance its
  importers get". Fix: one instance for importers and chunks.
- **Bindings that read `Route` are never shared**, so chunks copy them. SPEC J2.4.
  `pages/known-bugs-code-splitter-bindings.test.ts`: "an exported function that reads Route is the one the split
  component calls"; "a destructuring whose sibling reads Route keeps one cache for the loader and the component".
- **A split component reading `Route` declared with `const` and exported later (`export { Route }`) recreates the
  route.** SPEC J2.4. `pages/known-bugs-code-splitter-bindings.test.ts`: "a split component reads the route the route
  module exports through export { Route }".
- **Root routes are never split.** SPEC J2.7 (goal). `integration/known-bugs-code-splitter-page-code.test.ts`: "a root
  route's %s loads lazily".
- **A component declared by a destructuring is not split, or the build throws.** SPEC J2.8, J2.9.
  `integration/known-bugs-code-splitter-page-code.test.ts`: "${destructured.name} load with their chunk or are
  reported"; `integration/known-bugs-code-splitter-client-builds.test.ts`: "a component declared by an array
  destructuring of a call shared with the errorComponent is split or reported";
  `pages/known-bugs-code-splitter-shapes.test.ts`: "a component declared by an array destructuring of a call shared
  with the errorComponent renders".
- **The split compiler accepts a fixed list of value shapes** ("Unexpected splitNode type": object-form loaders,
  classes, casts, `satisfies`, member/logical/tagged-template/class expressions; a call is printed and re-parsed
  without JSX or TypeScript). SPEC J2.8, J2.9. `integration/known-bugs-code-splitter-ssr-builds.test.ts`: "a split
  loader in object form with $name loads route data"; "a split loader in object form passed by reference loads route
  data"; `pages/known-bugs-code-splitter-server.test.ts`: "a class component declared in the route file renders
  (exported: $exported)"; "a class component and the imports of its static fields leave the route module";
  `pages/known-bugs-code-splitter-shapes.test.ts`: "a component is split with $name"; "an option written as $name is
  split and works"; "a component written as $name is split and renders"; `pages/known-bugs-code-splitter.test.ts`: "the
  handler of a split loader in object form with $name loads lazily"; "a split loader in object form keeps $name
  working, created once". Fix: split any valid value, or keep it unsplit and warn.
- **Top-level statements that write a moved binding stay behind** (`Page.displayName = …` throws). SPEC J2.12, G3.
  `integration/known-bugs-code-splitter-property-write.test.ts`: "a component the route file writes a property of
  loads with its chunk and renders the property ($hint)"; `pages/known-bugs-code-splitter.test.ts`: "top-level writes
  to $name stay with the binding they write".
- **A split binding's declaration or import is deleted from the route module although other code still reads it.**
  SPEC J2.12. `pages/known-bugs-code-splitter-server.test.ts`: "a split component that $name reads renders from both";
  "a split component renders through a function $name"; "a component read by a split and an unsplit option renders
  from both"; "an unsplit option that reads the split component with typeof sees a function"; "a split component that
  a top-level call reads renders from both"; "an imported split component that head() reads renders, and head() reads
  it"; "an imported split errorComponent that an exported component renders works for an importer"; "an imported
  pendingComponent split by custom groupings renders, and an unsplit option renders it";
  `integration/known-bugs-code-splitter-ssr-builds.test.ts`: "an imported split component that head() reads renders,
  and head() reads it (%s build)"; `integration/known-bugs-code-splitter-client-builds.test.ts`: "a split component that
  an unused object names renders (vite)"; `pages/known-bugs-code-splitter-bindings.test.ts`: "a split component renders
  the exported component of another option that reads Route ($name)".
- **Export lists and aliases of a moved declaration are left without it** ("Export 'load' is not defined"). SPEC
  J2.12, J3.3. `pages/known-bugs-code-splitter-bindings.test.ts`: "a split loader exported through an export list keeps
  working"; `known-bugs-dev-server.test.ts`: "keep a $name component exported as the route option value";
  `integration/known-bugs-route-hmr-components.test.ts`: "vite: a split component exported by an export list renders,
  and an edit shows in place"; `known-bugs-route-hmr.test.ts`: "a component exported by an export list renders for a
  module importing it and as the route component" (the last two count under J3).
- **The user's own `import './Page'` is removed with the split component's import.** SPEC G3, J2.12.
  `pages/known-bugs-code-splitter-server.test.ts`: "a side-effect import of the split component's module runs when the
  route module loads".
- **`deleteNodes` removes only options written as `key: value`**: methods, spreads, computed keys and options in a cast
  or `satisfies` keep their server code on the client. SPEC J2.14, J4.12.
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
  directory name break builds). SPEC G1, G11. `integration/known-bugs-code-splitter-ssr-builds.test.ts`: "an app in a
  directory with # in its name builds and preloads a split component"; "an app in a directory whose name contains what
  split module ids contain builds and preloads a split component"; "an app in a directory with ' in its name builds and
  preloads a split component".
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
- **The shared-binding analysis misses readers** (method options, computed keys, nested `var`s, enums, namespaces,
  class static initialisers), so state is created twice. SPEC J2.4, G3.
  `pages/code-splitter-module-state-bindings.test.ts`: "$name"; `pages/known-bugs-code-splitter-bindings.test.ts`:
  "module state a method option shares with a split option is created once"; `pages/known-bugs-code-splitter.test.ts`:
  "a binding read by a computed-key option and a split option is created once"; "a binding declared by $name and read
  by the loader and the split component is initialized once"; "module state that the reference module keeps for $name
  is initialized once".
- **Chunks keep unreferenced top-level statements** (side effects run twice; `export *` repeated). SPEC G3, J2.5.
  `pages/known-bugs-code-splitter.test.ts`: "an unreferenced top-level side effect ($name) runs once, with the route
  module"; "split chunks do not re-export a module-level export \*, which importers of the route file still get".
- **A declaration only an exported type alias reads loses its initializer.** SPEC G3.
  `pages/known-bugs-code-splitter.test.ts`: "the initializers of $name run when the route module loads"; "the
  initializer of a declaration only an exported type alias reads runs when a route module compiled for HMR loads".
- **Code only the split component needs stays when something looks like a read** (a type of the same name, an
  overload signature, a second `var`, an unused renderer). SPEC J2.5. `pages/known-bugs-code-splitter.test.ts`: "a split
  component and its imports leave the route module next to $name".
- **A value import only types read is copied into every chunk.** SPEC J2.5.
  `pages/known-bugs-code-splitter-bindings.test.ts`: "split chunks do not import what only $name reads".
- **`codeSplitGroupings` in a module-level constant is refused.** SPEC J2.2.
  `pages/known-bugs-code-splitter-bindings.test.ts`: "groupings declared in a module-level constant are honoured".
- **The not-split warning is printed only when the splitter changed the module.** SPEC J2.8.
  `pages/known-bugs-code-splitter-bindings.test.ts`: "an exported component ($name) that is the only split candidate is
  split or reported as not code-split".
- **Decorators after `export` and parameter decorators do not parse.** SPEC §2.1, G1.
  `pages/known-bugs-code-splitter-bindings.test.ts`: "a decorator after `export` compiles"; "a class with a parameter
  decorator that the split component uses compiles into parseable modules".
- **A namespace is copied into a chunk without its body.** SPEC G1. `pages/known-bugs-code-splitter-bindings.test.ts`:
  "a namespace the split component reads keeps its body".
- **A route module's CSS import loads on every page**: the code splitter keeps the bare import in the route module,
  which the route tree imports eagerly (in dev the CSS is injected once the client runs; a build merges it into the
  entry's CSS). SPEC J2.22. `start-plugin-core/tests/integration/known-bugs-route-css.test.ts`: "the CSS of the /%s
  route applies only once the route matches" (Vite dev and build). Fix: the CSS loads when its route matches.
- **Vite dev: the maps of the split and shared modules name the route file with the splitter's query**
  (`index.tsx?tsr-split=component`), so a debugger sees another file than the route file. SPEC G6.
  `integration/dev-source-maps.test.ts`: "a throw in $name maps to its line in the route file, which its module names
  as its source". Fix: every module derived from the route file names the route file itself as its source.
- **Overload signatures of a shared function stay next to its import**, and the TypeScript transform drops the import.
  SPEC G1, J2.12. `pages/known-bugs-code-splitter-bindings.test.ts`: "an overloaded function the route module and a
  split loader share keeps working"; `known-bugs-dev-server.test.ts`: "keep exported overloads and their aliases that
  unsplit and split options call".

## J2.14/J2.15 Start's router wiring (12 pins)

Paths under `start-plugin-core/tests/integration/`.

- **Rsbuild does not prune server-only routes from the client route tree.** SPEC J2.15.
  `known-bugs-route-options.test.ts`: "a route with only server handlers is not in the client route tree" (two
  tables); `start-build-manifest.test.ts`: "the client route tree is the SSR route tree without the server-only
  subtree"; `start-compose-server-only-routes.test.ts`: "the client route tree leaves out the server-only subtree";
  "client-side navigation to a server-only route finds nothing".
- **The generator records only plain option keys**, so a route with server handlers and computed, method or spread
  client options is pruned. SPEC J1.9, J2.15. `known-bugs-route-options.test.ts`: "a route with server handlers and these
  options is in the client route tree"; `start-compose-server-only-routes.test.ts`: "the client route tree keeps the
  page whose component is spread in"; "client-side navigation reaches the page whose component is spread in". Fix:
  never prune because a key was missed.
- **Options in a cast skip `deleteNodes`** (see J2). `known-bugs-route-options.test.ts`: "the server handler code of
  the route is not in the client bundle".
- **Imported route options keep `server.handlers` on the client** (see J2). `start-compose-imported-options.test.ts`:
  "the client build never ships the server handlers of imported route options silently".
- **The client route tree module is matched by `new RegExp(<path>)`, unescaped.** SPEC J2.15, G11.
  `start-compose-project-path.test.ts`: "the client route tree leaves out the server-only route"; "the client gets the
  file, not the client route tree".

## J3 Route HMR (26 pins: 20 below, 2 in S6, 4 in J2)

Paths under `router-plugin/tests/`.

- **Inline components that are not plain functions** (`memo`, `forwardRef`, method shorthand, `as`/`satisfies`), and
  components inside a route helper function, **are not registered for React Refresh**, so edits do not show. SPEC J3.2,
  J3.3. `integration/known-bugs-route-hmr-components.test.ts`: "vite: an edit of an inline component written as $name
  shows in place (autoCodeSplitting: $pluginOptions.autoCodeSplitting)"; `integration/known-bugs-route-hmr.test.ts`:
  "%s: an edit of a route a helper function creates shows its new component, reloading only when the file is reported
  (autoCodeSplitting: false)".
- **Lowercase components break under React HMR** (renamed in a chunk, renamed in the route module after the code
  splitter chose the shared bindings, not registered, or hoisted out of order). SPEC J3.2, J2.4, G1. `integration/known-bugs-route-hmr-components.test.ts`: "vite: an edit of a split component declared
  lowercase as $name shows in place"; "vite: a lowercase function component that is also the unsplit pendingComponent
  renders, and an edit shows in place"; `integration/known-bugs-route-hmr-removals.test.ts`: "vite: an inline pending
  component hoisted before a renamed lowercase component renders it"; `known-bugs-route-hmr.test.ts`: "a lowercase
  function component split into two chunks renders with the module state they share"; "a lowercase function component
  shared with the loader renders with the module state it shares"; "a lowercase function component that is also the
  unsplit pendingComponent renders as both"; "a destructured binding that the loader, the split component and the
  unsplit pendingComponent share works and is created once".
- **A removed split option's module stays in Vite's graph and is compiled as CommonJS.** SPEC J2.13, J3.3.
  `integration/known-bugs-route-hmr-removals.test.ts`: "vite: an edit that removes a split option the page loaded
  applies in place without errors".
- **Route HMR keeps the previous component for React Refresh to patch**, also without a Refresh runtime and after a
  rename. SPEC J3.3. `integration/known-bugs-route-hmr-removals.test.ts`: "rsbuild without React Refresh: an edit of the
  route component shows in place (autoCodeSplitting: %s)"; `integration/known-bugs-route-hmr.test.ts`: "renaming the
  route component shows the renamed component in place (autoCodeSplitting: %s)".
- **The HMR code reads the route through the identifier `Route`.** SPEC J3.1.
  `integration/known-bugs-route-hmr-removals.test.ts`: "a route exported under another local name is hot-updated in
  place".
- **Solid and Vue split components get a new lazy component on every update.** SPEC J3.2.
  `integration/known-bugs-route-hmr.test.ts`: "$bundler: an edit of a split $target route shows in place, keeping the
  split component".
- **Vite: the accept call is on an alias (`const hot = import.meta.hot`)**, so the module is no HMR boundary and the
  page reloads. SPEC J3.1, G10. `integration/known-bugs-route-hmr.test.ts`: "vite: an edit of an unsplit Vue route shows
  in place"; "vite: an edit of a React .ts route module shows its new loader data in place (autoCodeSplitting: %s)";
  "vite: an edit of a route component in an app without @vitejs/plugin-react shows in place (autoCodeSplitting: %s)".
- **Rsbuild: an unsplit Solid route keeps rendering the old component.** SPEC J3.3.
  `integration/known-bugs-route-hmr.test.ts`: "rsbuild: an edit of an unsplit Solid route shows its new component in
  place".
- **Rsbuild: an edit of a split loader only never reaches the page** (the route module did not change). SPEC J3.3.
  `integration/known-bugs-route-hmr.test.ts`: "rsbuild: an edit of a split loader (codeSplitGroupings: %s) shows its
  data in place".
- **With options in a variable, the HMR transform declares the component binding after the object that reads it.**
  SPEC G1. `known-bugs-route-hmr.test.ts`: "route options in a variable ($name) evaluate to a route with a component".

## J4 Start environment separation (83 pins: 65 below, 18 in S1–S6)

Paths under `start-plugin-core/tests/` unless noted.

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
  wrapped chain link: %s"; `known-bugs-start-compiler.test.ts`: "each output keeps its implementation of an isomorphic
  fn whose chain passes through a helper function".
- **A factory callee wrapped in `as any` is not resolved.** SPEC J4.5. `start-compiler-factories.test.ts`: "each output
  keeps its implementation of $shape with the callee in $name".
- **Builders are traced through identifiers and member expressions only**: namespace members, a re-exported Start
  namespace, a builder returned by a call or passed through a helper, `wrap(wrap(...))`, a library function creating
  server fns. SPEC J4.5, J4.12. `known-bugs-start-compiler.test.ts`: "client builds compile a builder read from a
  namespace import"; "client builds compile factories of a re-exported Start namespace"; "client builds compile a
  builder returned by a function of $name"; "client builds compile a server fn whose builder passes through a helper
  function"; `createServerFn/declaration-sites.test.ts`: "with %s imported, a server fn wrapped in two calls works like
  an unwrapped one"; `integration/known-bugs-start-compiler.test.ts`: "a server fn created by a library function: the
  handler is not in the client bundle, or the build fails clearly". Fix: the client has no server code, or the build
  fails at the call.
- **The bundler plugins choose modules by their text** (a factory name, `.handler(`, `<ClientOnly`): builders from
  other modules, comments inside a chain and namespace `ClientOnly` are missed, and a CommonJS dependency whose text
  matches is parsed as an ES module. SPEC J4.5, J4.11, J4.16, §5.15. `createServerFn/createServerFn.test.ts`: "a
  handler called with ${name} is extracted"; `known-bugs-start-compiler.test.ts`: "client builds compile $name finished
  or called in another module"; `integration/pages/start-compiler-import-forms.test.ts`: "$name alone in its module: the
  other environment neither loads nor runs the implementation"; "through a namespace member";
  `integration/start-build-call-shapes.test.ts`: "$name are recognised: the client bundle holds no server code and the
  shape works"; `integration/known-bugs-start-compiler.test.ts`: "a CommonJS dependency with a top-level return builds
  and keeps its meaning"; "a CommonJS dependency with a top-level return compiles and keeps its meaning".
- **Nested env-only factories are found by the factory's exported name**, so a renamed import or local alias is
  missed. SPEC J4.5, J4.10. `known-bugs-start-compiler.test.ts`: "client: a createServerOnlyFn called through $name is
  compiled"; "a createServerOnlyFn local alias called in a top-level block works in each environment, or is rejected at
  the call".
- **A chain method called through a computed member, or a call whose result is member-called, is never visited.**
  SPEC J4.5, J4.12. `known-bugs-start-compiler.test.ts`: "$name: the client holds no server code, or the module is
  rejected at the call"; `integration/start-build-call-shapes.test.ts`: "$name: the client bundle holds no server code
  and the shape works, or the build fails at the call". (Same cause in J7: "renderServerComponent styles the server
  component when its result is chained".)
- **Server fns outside a top-level variable declaration are left untransformed, broken or rejected without a
  position.** SPEC J4.6. `createServerFn/declaration-sites.test.ts`: "a server fn declared in $name never ships its
  nested handler to the client"; "supports a server fn in $name"; "with %s imported, supports a server fn in the
  handler of another server fn"; "with %s imported, supports server fns of the same name in two functions"; "a server
  fn created through an optional call chain compiles like a plain chain or is rejected";
  `known-bugs-start-compiler.test.ts`: "a createServerFn in $name does not ship its handler to the client"; "with
  another Start factory imported, a server fn in $name works or is rejected at the call"; "with %s imported, a nested
  server fn whose handler reads a local of its function is supported or rejected at the capture".
- **A handler that is a `createIsomorphicFn()` or `createServerOnlyFn()` call is compiled first, and the caller never
  becomes an RPC.** SPEC J4.1, J4.2, G5. `createServerFn/handler-scope.test.ts`: "the handler can be a
  createIsomorphicFn call, or the module is reported"; `known-bugs-start-compiler.test.ts`: "%s: a server fn whose
  handler is a createServerOnlyFn call returns the handler result, or is reported". Fix: the server fn works, or the
  build fails with an error naming the file (in dev, an error or a warning naming the file).
- **Dev edits of a factory module do not recompile its (transitive) importers.** SPEC J4.5, G10.
  `integration/known-bugs-dev-server.test.ts`: "client: a module importing an edited factory module through a
  re-export ($name) loads no server code"; "SSR: a module importing an edited factory module through a re-export
  ($name) gets a server fn"; `known-bugs-start-compiler.test.ts`: "a dev edit of a module a re-export chain ends in
  recompiles its importers"; `start-compiler-factories.test.ts`: "dev: editing a factory module recompiles its
  importers against the new code"; `integration/start-compiler-dev-server.test.ts`: "a module whose factory becomes a
  server fn builder: the client bundle drops the handler".
- **Dev lookups go through a derived id** (`?server-fn-module-lookup`) a virtual-module plugin or a fresh server does
  not know. SPEC J4.4, G11. `createServerFn/createServerFn.test.ts`: "a server fn whose factory a virtual module serves by
  its exact id compiles in dev"; `integration/known-bugs-start-compiler-dev.test.ts`: "calls a server fn id on a fresh
  dev server that has not compiled its module".
- **The dev client compiler loads a top-level callee's module from inside the transform**, which deadlocks with
  Vite's dependency optimizer. SPEC G1. `integration/known-bugs-start-compiler-dev.test.ts`: "transforms a client module
  with a server fn and a top-level call of a pre-bundled dependency".
- **A Vue SFC `<script lang="ts">` block is parsed as TSX** (the parser is chosen from the id without its query).
  SPEC §2.1. `integration/known-bugs-start-compiler-vue-sfc.test.ts`: "build: a server fn in a <script lang="ts"> block
  may use angle-bracket type assertions".
- **With SSR as the provider, a module is two instances in the SSR bundle**, so its top-level code runs twice. SPEC
  J4.14, G3. `integration/known-bugs-start-compiler.test.ts`: "SSR: a server fn module is initialised once and shares
  its state with SSR code"; `integration/start-compose-server-fn-route.test.ts`: "the server runs the route module once".
- **Server fns no client code references answer HTTP calls by id.** SPEC J4.2.
  `integration/known-bugs-start-compiler.test.ts`: "SSR: a server fn only server code references is not callable over
  HTTP"; `react-start-rsc/tests/integration/rsc-start-private.test.ts`: "a server function only server code calls is not
  callable from the browser".
- **Vite: the production server-fn resolver is generated before the SSR build found every server fn** (#7213). SPEC
  J4.2, G4. `integration/known-bugs-start-compiler.test.ts`: "is callable, the app files written %s"; "its caller only
  client code imports: the caller is callable over HTTP, the app files written %s".
- **Library discovery reads the `package.json` of `process.cwd()`, not Vite's root.** SPEC J4.16.
  `integration/known-bugs-start-compiler.test.ts`: "a build run from another directory: a library's server fn runs in
  the SSR build".
- **Vite dev: discovered Start libraries are left out of pre-bundling** (`optimizeDeps.exclude`), so their CommonJS
  dependencies reach the browser untransformed. SPEC J4.16, G13. `integration/known-bugs-start-compiler-dev.test.ts`:
  "a Start library's import of a CommonJS dependency works in a client route". Fix: such a library works in dev as in
  a build.
- **Rsbuild SSR: an isomorphic fn makes the compiler resolve the module's `createMiddleware` import.** SPEC J4.8.
  `integration/known-bugs-start-compiler.test.ts`: "a module with a middleware and an isomorphic fn builds, and its
  middleware runs on the server".
- **Collision suffixes follow discovery order across fresh builds.** SPEC J4.4, G4.
  `integration/start-build-determinism.test.ts`: "fresh builds keep the function-to-id mapping when discovery order
  reverses".
- **`export *` diamonds and cycles poison the build-mode export cache.** SPEC J4.5.
  `integration/start-compiler-build-export-cache.test.ts`: "export \* $name do not poison the build-mode export cache".
- **Re-exports are looked up by local name only**, so distinct aliases and shadowing locals resolve to the wrong
  factory. SPEC J4.5, G15. `known-bugs-start-compiler.test.ts`: "distinct re-export aliases of two factories keep their
  own kind"; "%s: parameters and locals shadowing the factories are left alone next to a compiled factory call".
- **Removing the other env's implementation deletes hook calls only it read.** SPEC G3, J4.9.
  `known-bugs-start-compiler.test.ts`: "$output: hook calls read only by the removed implementation still run".
- **Env-specific functions inside a handler are not compiled on the server.** SPEC J4.10.
  `start-compiler-factories.test.ts`: "the server compiles env-specific functions inside a server fn handler".
- **A provider module keeps the source's `'use client'`**, so RSC makes its exports client references. SPEC J4.2,
  J4.17. `react-start-rsc/tests/integration/rsc-start-client-module.test.ts`: "a server function of a 'use client'
  module runs on the server".
- **Vite RSC build: a server fn whose only importer is a `'use client'` component is not registered** (the
  provider build never reaches a module only a client reference imports), so the call answers 500. SPEC J4.2.
  `react-start-rsc/tests/integration/rsc-start-build.test.ts`: "a server fn only a 'use client' component of a server
  component imports runs when clicked". Fix: every server fn the client references is callable by id.

## J5 Deferred hydration `<Hydrate>` (37 pins: 34 below, 3 in S1, S6)

Paths under `start-plugin-core/tests/integration/`; `pages/` means `integration/pages/`.

- **A split component with a boundary that another option reads goes to the shared module without its lazy
  component.** SPEC J2.20. `hydrate-build-cases.ts`: "boundaries in split route options that another option reads
  hydrate in the boundaries the server renders".
- **The lazy component of a boundary is created by an unmarked module-level call**, so an unused component's children
  still ship. SPEC J5.6. `hydrate-build-cases.ts`: "an unused exported component with a boundary is not in the client".
- **An export only the children use, initialised by a call, must run once.** SPEC J5.6, G3. `hydrate-build-cases.ts`:
  "an export only the children use, initialized by a call, is initialized once and hydrates".
- **A namespace member `<Start.Hydrate>` is not a boundary.** SPEC J5.1. `hydrate-pages-react.ts` and
  `hydrate-pages-solid.ts`: "a namespace-imported Start.Hydrate loads its children when it hydrates".
- **The chunk re-declares module-level bindings and exports instead of using the parent's.** SPEC J5.8, G3, J2.4.
  `hydrate-pages-solid.ts`: "split children read a context declared in the page module";
  `pages/known-bugs-hydrate-module-level.test.ts`: "client: the children use the module-level $name of the parent
  module"; "client: an exported declaration the children use has one instance, initialized once".
- **Module-level declarations reach the chunk only for some forms** (statements completing them, nested `var`s,
  `import X = ns.X`, default-exported functions, enums, namespaces, assigned `let`s are dropped). SPEC G1.
  `pages/known-bugs-hydrate-module-level.test.ts`: "client: $name that the children rely on reaches the chunk";
  "client: a var declared in a nested block that the children read reaches the chunk"; "client: a TypeScript import
  alias used by the split children is declared in the chunk"; "client: $name used by the children reaches the chunk".
- **The chunk removes any binding named `Route` without importing the route.** SPEC G1, J2.4.
  `pages/known-bugs-hydrate-module-level.test.ts`: "client: split children reading Route $name use the one route";
  "client: an unexported component named Route that the children render reaches the chunk".
- **A hook called through a namespace (`React.useId()`) is not rejected.** SPEC J5.5.
  `pages/hydrate-boundary-forms.test.ts`: "client: a hook called through a namespace is rejected at the boundary".
- **Children are read from JSX children only, never from a `children` prop or spread.** SPEC J5.2, J5.4.
  `pages/hydrate-split-modules.test.ts`: "client: the children prop ($name) of a self-closing boundary is deferred";
  `pages/known-bugs-hydrate.test.ts`: "client: children passed through $name render without unused chunks"; "client: a
  boundary nested in a children prop hydrates with the id the server renders".
- **`<Hydrate>` is matched by name, not binding.** SPEC G15. `pages/known-bugs-hydrate.test.ts`: "client: a local
  component named Hydrate is left alone".
- **Server and client number boundaries differently** (a boundary in a `fallback`, a copied component, code other
  transforms removed first). SPEC J5.4. `pages/known-bugs-hydrate.test.ts`: "a Hydrate inside a fallback does not shift
  the chunks of later boundaries"; "client: $name hydrates like the server renders it"; "a later boundary keeps its id
  and its children next to $name".
- **Text children move as raw strings** (no JSX line collapsing; edge spaces dropped). SPEC G1, J5.9.
  `pages/known-bugs-hydrate.test.ts`: "client: a text-only child renders like JSX text: $name"; "client: spaces around a
  single child on one line render like on the server".
- **Capture analysis is wrong**: locals named `key`/`ref` become React props; tags starting with `_`, `$` or non-ASCII
  letters, member-expression tags and enums are not passed; bindings declared inside the children and property names
  are taken for captures; `arguments` changes meaning. SPEC J5.2. `pages/known-bugs-hydrate.test.ts`: "client: captured
  locals named key and ref reach the split children"; "client: the split children render a local component named %s";
  "client: the split children render member-expression tags of $name"; "client: the split children render a component
  bound inside them"; "client: property names, method keys and optional members are no reads of a local"; "client: the
  split children read a local enum"; "client: split children reading the component's arguments render its props".
- **A `this` owned by a function inside the children is rejected.** SPEC J5.5. `pages/known-bugs-hydrate.test.ts`:
  "client: split children may use the own `this` of $name".
- **`await` in children moves into a synchronous chunk component.** SPEC J5.5, G1. `pages/known-bugs-hydrate.test.ts`:
  "client: await in split children is rejected at the boundary or renders".
- **A text-only boundary's chunk has an empty source map.** SPEC G6. `pages/known-bugs-hydrate.test.ts`: "client: the
  split text of a text-only boundary maps to its line and column".

## J6 Import protection (68 pins)

Paths under `start-plugin-core/tests/integration/`; `ip/` means `integration/importProtection/`.

- **`onViolation` returning `false` only silences the report**: the mock was already chosen. SPEC J6.6.
  `ip/build-markers.test.ts`: "allows the import of %s: the build succeeds and the client gets the real module";
  `ip/dev.test.ts`: "returning false allows the import: the client gets the real module"; "with behavior "error", an
  import of a denied file it allows gets the real module"; `ip/v2-policy.test.ts`: "the client gets the real module".
- **Exempt importers get the mock** (the denied file is mocked in its own transform, for every importer). SPEC J6.7.
  `ip/exemptions.test.ts`: "the exempt importer gets the real module, and is not reported" (two tables);
  `ip/v2-policy.test.ts`: "an importer $how gets the real module".
- **With `include`, a denied file outside the patterns is never mocked.** SPEC J6.8. `ip/exemptions.test.ts`: "an
  importer that is not exempt gets the mock and is reported" (two tables).
- **Marker violations ignore which importer is exempt** (Vite reports the marked module; Rsbuild mocks it for every
  importer and blames the nearest chain). SPEC J6.7, J6.5. `ip/build-markers.test.ts`: "imported only by an ignored
  importer does not fail the build"; "imported only by an ignored importer: the ignored importer gets the real module";
  "in mock mode, an ignored importer gets the real module, another importer a safe mock, and only the other importer is
  reported"; "imported by an ignored importer and, further from the entry, another importer: the violation blames the
  other importer".
- **`mockAccess` is ignored in production and server mocks** (always silent). SPEC J6.3. `ip/build-mock.test.ts`:
  "with mockAccess $mockAccess, using the mock of $denied is reported as an $severity naming the import";
  `ip/dev.test.ts`: "$mockAccess: the server gets a safe mock, and using it is reported as an $severity naming the
  import".
- **A build marker violation mocks only the marker import**; the marked module keeps its code. SPEC J6.3, J6.8.
  `ip/build-mock.test.ts`: "%s is mocked, with a warning".
- **`export *` from a denied module re-exports nothing** (`undefined` in an Rsbuild build; the importer fails to load
  in dev). SPEC J6.8. `ip/build-mock.test.ts`: "a name re-exported with `export \*` from a denied specifier is a safe
  mock, or the build fails"; `known-bugs-dev-server.test.ts`: "client: a name re-exported with `export \*` from $name is
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
  `ip/known-bugs.test.ts`: "a denied module the client bundle drops does not fail the build"; "in mock mode, an unused
  denied module leaves nothing in the client bundle and no warning".
- **Dev logs only violations reachable from Start's router and start entries.** SPEC J6.9. `ip/dev-page.test.ts`: "a
  denied import of a module the client entry imports is logged"; "a client-only import of a module the server entry
  imports is mocked on the server and logged".
- **An edit drops every import-graph edge pointing at the edited module**, so new violations are discarded. SPEC
  J6.13. `ip/dev.test.ts`: "added by an edit of the importer is logged at its original import or surviving use, with a
  trace from the entry"; "'always' logs a violation again after an edit"; `ip/v2-edits-page.test.ts`: "the step reports
  its violations, and only those".
- **`log` counts are wrong in dev** (one import logged for the specifier and again for the mock's resolved path, and
  twice per load with `'always'`). SPEC J6.5. `ip/dev.test.ts`: "'once' logs one warning for one import"; "'always' logs
  one warning for one import each time its module is loaded".
- **An MDX importer's location ignores its source map.** SPEC J6.5. `ip/dev.test.ts`: "importing a denied file, the
  warning names the .mdx page, located in its original mapped source".
- **Dev reads `getModuleInfo(importer).code`, which Vite's dev server does not support.** SPEC J6.8.
  `ip/dev.test.ts`: "importing a denied specifier gets the mock, and the dev server logs a warning naming it";
  `known-bugs-dev-server.test.ts`: "client: a server fn module calling a function of a denied specifier at the top
  level loads".
- **Marker state is known only after a transform**, and Vite keeps importers' transforms after an edit. SPEC J6.11,
  J6.13. `ip/dev.test.ts`: "is mocked when the client loads the importer first"; "after an edit adds the marker, the
  violation is logged"; "after an edit adds the marker, the importer gets the mock"; `known-bugs-dev-server.test.ts`:
  "client: the importer of a module whose server-only marker was removed loads the module".
- **Server-fn lookups pre-transform modules and silence them** (recorded as lookup modules by path). SPEC J6.4.
  `ip/dev.test.ts`: "a helper a server fn factory module uses only inside .server() is not logged";
  `ip/known-bugs-dev.test.ts`: "a server fn factory module calling a denied import at the top level fails to load"; "a
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
- **Rsbuild checks importers by file extension** (JS/TS only): custom module types and `.mdx` are never checked. SPEC
  J6.1, §2.1. `ip/known-bugs-dev.test.ts`: "a module of a custom type importing $name is reported, and its real code does
  not run"; "an .mdx page importing $name is reported in its source, and its real code does not run".
- **A specifier mock exports only statically read names, and an Rsbuild mock build inlines enum values.** SPEC J6.8.
  `ip/known-bugs-dev.test.ts`: "vite dev: ${name}."
- **Rsbuild: a dynamic `import()` of a denied specifier is neither reported nor mocked.** SPEC J6.1.
  `ip/known-bugs.test.ts`: "a client dynamic import of a denied specifier fails the build, reporting one client
  violation".
- **Denied non-JS/TS files (`.server.json`, `.server.cjs`) keep their content or fail the build.** SPEC J6.8.
  `ip/known-bugs.test.ts`: "in mock mode, a denied .server.json file is mocked, with a warning"; "in mock mode, a denied
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
  G11. `ip/v2-alias.test.ts`: "the build fails, reporting the aliased specifier at its original line".
- **Rsbuild `source.transformImport` bypasses specifier denials, and its locations do not map back.** SPEC J6.1,
  J6.5. `rsbuild/import-protection.test.ts`: "the file rule denies the module it resolves to: the importer is reported at
  the import or the use"; "denied as written, the build fails on it, reporting the importer at the import or the use".

## J7 RSC CSS injection (8 pins, plus one in J4)

Paths under `react-start-rsc/tests/integration/`.

- **An identifier or spread `renderToReadableStream` argument is skipped silently** (no warning; Rsbuild's compiler
  host would drop it too). SPEC J7.3. `rsc-css-diagnostics.test.ts`: "%s dev warns about the CSS limitation once per
  source file, naming it"; `rsc-css.test.ts`: "dev: renderToReadableStream with $name warns, naming the file";
  `start-plugin-core/tests/integration/start-rsc-warnings.test.ts`: "renderToReadableStream with a variable or a spread
  warns once per file, naming the module" (counts under J4).
- **Rsbuild writes Start's virtual modules under `process.cwd()`.** SPEC G11, J4.16. `rsc-css-rsbuild-root.test.ts`:
  "Rsbuild: the app compiles when the process does not run in the app directory".
- **Rsbuild injects CSS in server-fn provider modules only**, so a render call in a helper module is unstyled. SPEC
  J7.1, J7.2. `rsc-css-rsbuild.test.ts`: "a render call in a helper module styles the server component".
- **A conditional whose branches are all JSX is not wrapped.** SPEC J7.3. `rsc-css.test.ts`:
  "renderToReadableStream($argument) styles the stream"; "a false ternary stream carries its selected badge CSS".
- **A comment before the JSX argument becomes JSX text.** SPEC J7.4, G12. `rsc-css.test.ts`: "renderToReadableStream
  does not render $name before the JSX argument".
- **A call whose result is member-called is never visited** (see J4). SPEC J7.2. `rsc-css.test.ts`:
  "renderServerComponent styles the server component when its result is chained".

## Upstream issues that affect the suite

None is filed upstream yet. "Remove when" says when a harness change can go.

| Tool                                                      | Symptom                                                                                                                                                                                       | What the suite does                                                                                                                                                                                                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rspack 2.2 (vendored watchpack 2.5.2)                     | a file removal that lands while a compile runs is lost (fixed in watchpack 2.6.0, webpack/watchpack#345)                                                                                      | Rsbuild tests delete or recreate one file per edit and settle before the next write (`start-plugin-core/tests/integration/importProtection/v2-edits*.test.ts`, `v2-hosts.ts`, `integration/rsbuild/dev-server.test.ts`). Remove when Rspack bundles watchpack ≥ 2.6. |
| Rspack 2.2 (vendored watchpack 2.5.2)                     | a file deleted during the watcher's first scan is never reported                                                                                                                              | the Rsbuild dev harness resolves once every compiler's watcher has scanned the app, and writes the initial files with past modification times (`compiler-test-utils/src/rsbuild-dev-server.ts`). This is what "the server is up" means; it may stay.                 |
| Vite 8 `experimental.bundledDev`                          | closing the server during its initial build leaves a rejection unhandled ("Failed to get bundle state"); no public API to await it (vitejs/vite#22991)                                        | before `close()` the harness waits for the initial build, reading one Vite internal (`compiler-test-utils/src/dev-server.ts`). Remove when Vite handles the rejection.                                                                                               |
| Vite 8.3.4 dependency optimizer                           | keeps writing `node_modules/.vite/deps_temp_*` after `close()` resolved: removing the app fails with `ENOTEMPTY`, or a write into the removed app is an unhandled rejection                   | before `close()` the Vite dev harnesses wait until each environment's optimizer has scanned and no `deps*_temp_*` directory is left (`closeViteServer` in `compiler-test-utils/src/dev-server.ts`). Remove when Vite awaits its optimizer on close.                  |
| Vite 8.3.4 dependency optimizer                           | a late-discovered dependency changes a pre-bundled chunk's exports without changing its hash; the page fails with "does not provide an export named '<letter>'"                               | not seen since the harness apps use `tanstackStart()` (whose framework plugins pre-bundle React at start). No workaround. If seen, re-run the file alone.                                                                                                            |
| `@vitejs/plugin-react` 6.0.1 (Rolldown's Refresh wrapper) | the Refresh footer is appended without a line break: a module whose code ends in a line comment loses the footer's first line, and the next hot update throws `RefreshRuntime is not defined` | not pinned (the compiler's output is valid). Avoid ending emitted modules with a line comment.                                                                                                                                                                       |
| Vite resolver                                             | `#` in a file path outside `node_modules` is read as a fragment; a query import of such a file does not resolve                                                                               | not pinned (a plain Vite app fails the same way).                                                                                                                                                                                                                    |
| Vite `vite:oxc`                                           | `.cts` with TypeScript syntax is not transformed (also with a query)                                                                                                                          | not pinned.                                                                                                                                                                                                                                                          |
| es-module-lexer 2.3.2 (Vite 8)                            | fails on `import def, { "kebab-name" as kebab } from "x"`                                                                                                                                     | `importProtection/mock-shapes.test.ts` writes the two imports as separate declarations.                                                                                                                                                                              |
| `@vitejs/plugin-rsc` dev runtime                          | imports a `default` that `virtual:vite-rsc/server-references` does not provide                                                                                                                | the strict module runner (`compiler-test-utils/src/strict-runner.ts`) checks named imports only in the app's own modules.                                                                                                                                            |
| Node `autoSelectFamily`                                   | a worker blocked for over 500 ms abandons the `::1` attempt to a `localhost` server and is refused at `127.0.0.1`                                                                             | every harness server listens on `127.0.0.1` and its URL names that address.                                                                                                                                                                                          |
| Node 24/26 `fs.rmSync`                                    | returns without an error and leaves files behind when another process removes part of the tree meanwhile                                                                                      | only the run's teardown removes the run's temp directory (`compiler-test-utils/src/run-directory.ts`).                                                                                                                                                               |
| Rspack 2.2, webpack 5                                     | unminified production output keeps reads of dropped bindings in dead code of modules no compiler touched                                                                                      | the dangling-name check covers only modules the compilers produced or changed (SPEC G8; `checkDanglingNames` in `compiler-test-utils/src/build-harness.ts`).                                                                                                         |
| Chromium (Playwright, `--disable-dev-shm-usage`)          | shared memory lives in files in `TMPDIR`; a full router-plugin `test:integration` holds up to about 2.2 GB; with little room, module requests fail (`net::ERR_INSUFFICIENT_RESOURCES`)        | the browser helpers bound open pages (`runPageLimit`, `openPageLimit` in `compiler-test-utils/src/browser.ts`). Use a `TMPDIR` with room, or re-run the file alone.                                                                                                  |
| unplugin 3.3                                              | webpack and Rspack loaders drop the plugin's source map                                                                                                                                       | pinned (S4): unplugin is today's integration layer.                                                                                                                                                                                                                  |
| `@babel/generator` 7.29                                   | drops required parentheses                                                                                                                                                                    | pinned (S3): Babel is today's printer.                                                                                                                                                                                                                               |
| babel-dead-code-elimination 1.0.12                        | counts `typeof` type queries as references (pcattori/babel-dead-code-elimination#50)                                                                                                          | pinned (S2): today's dead-code elimination.                                                                                                                                                                                                                          |
