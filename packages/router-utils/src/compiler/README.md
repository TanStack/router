# Compiler core (`@tanstack/router-utils/compiler`)

The shared compiler behind route code splitting and route HMR (`@tanstack/router-plugin`) and every TanStack Start
transform (`@tanstack/start-plugin-core`: server functions, environment separation, `<Hydrate>`, RSC CSS, import
protection). It is built on [Yuku](https://github.com/yuku-toolchain/yuku) (parser + semantic model). The route
generator (`@tanstack/router-generator`) uses Yuku directly and does not go through this core.

This file is the map. The contract the compilers must satisfy is the oracle's
[SPEC](../../../compiler-test-utils/oracle/SPEC.md); the toy planners and the in-memory host in
[`tests/helpers.ts`](../../tests/helpers.ts) show every interface below in use.

## The model

**One analysis per (environment, module, input text), one plan, many outputs.** A compile parses its module once with
Yuku's semantic model (summaries are a separate read of the raw text: see "Values and summaries"). Every job is a _planner_ that reads that analysis and adds to one shared plan; no job
re-parses, re-prints or reads another job's output. The plan yields:

- the env module (the code returned for the requested id),
- every derived module of the same source in that env: split chunks (`?tsr-split=…`), the shared module
  (`?tsr-split=shared---…`), Hydrate chunks (`?tss-hydrate=…`), server-function provider modules
  (`?tss-serverfn-split`), server-function handler modules (`?tss-serverfn-handler`),
- facts: surviving import edges (import protection), server-function registry entries, diagnostics, file
  dependencies, per-planner data.

Any id of a file may arrive first: a derived id computes (or reuses) the plan of its file at the same revision and
emits its own output. Nothing depends on transform order.

### Units, regions, edits

- **Units** (`units.ts`): the top level split into the smallest things placement reasons about: one import specifier,
  one declarator, one function/class/enum/namespace (merged declarations together), one export specifier, every other
  statement. **Regions** are ranges planned as one thing; every unit is one, and planners register sub-regions
  (route option values, Hydrate children, nested server-fn chains). A sub-region nests in one unit (on exactly its
  range at most): one holding statements is a conflict as it is registered.
- **Rewrite tree** (`rewrite.ts`): every range a planner addresses has two answers per output: its **text** (what it
  reads as wherever it renders) and its **place** (what stands where it is written). `edit` sets the text, in every
  output: an edit's body names source text only as slices of the range it rewrites (rendered with what the output
  does inside them), next to structured text with symbol references (`SymRef`), glue specifiers and context-aware
  reference rewrites (shorthand properties expand, export names stay). `insert` adds text at a position, in some
  outputs. `placeholder` puts generated text at a range's place in some outputs; the range's text then renders
  nowhere there. A _generated unit_ can `claim` a region: the owner renders the region's text whole
  (`{ k: 'region' }`, its only way to name source text), wherever the owner is placed, and the claim's placeholder
  stands at its place, in the outputs of the claim's scope. An erasure enclosing the occurrence kills the claim and
  its owner, unless other generated code (a unit, a placeholder) reads the owner (the provider's hoisted server fn
  its RPC wrapper calls): then only the placeholder goes. In an output outside the claim's scope the region's text
  is the text around it (Start's nested server-fn chain stays in place in the RSC env module, with its handler's
  stub, while the provider output hoists it). Text and place never conflict: a handler that is itself an env-only or
  isomorphic call has its stub as its place and its compiled call as its text, which renders in the provider or
  handler module. Two edits, or two placeholders (a claim's included), on one range in one output conflict. A route
  option written as a method claims its function; an edit of the property writes the key before the placeholder.
  The server-code check (`server-code.ts`, R132) is a redundancy net beside the planners, removable in one deletion
  (its module comment says how): after freeze, each planner's `serverCode` recorder lists the server-only text its
  recognition finds in a client compile (Start: every server fn's handler and validator, middleware's `.server()`
  and validator, isomorphic fn's `.server()`, `createServerOnlyFn` body; the router: every recognised route option in
  `deleteNodes`), whatever the planner did with it; a slice of any output over one, or text mapped into one, fails
  the module (an error in users' runs, a throw under the self-checks). A compile already holding an error is not
  checked. It catches a planner skipping a recognised site; not recognition failures, declarations only server code
  reads, imports of server-only modules or unreadable route options. The core's removal (`removal/render.ts`) is the
  only edit with a scope (`scopedEdit`, not on `PlanContext`). A generated unit has a home (`auto`: placement
  decides; an output), or `env-readers`: placement copies it into every derived output importing a binding of the
  env module other than the ones it names, once inclusion is decided (route HMR registers the chunks reading what
  the route module keeps); it declares nothing, owns no claim and reads only its own imports.
- **Expression boundaries** (`expression.ts`): where one complete expression renders where a different one (or
  none) stood, planners name what goes where and write no grouping. Two entry points: `replaceExpression` (an
  edit replacing a factory call by the expression it keeps, or by generated text of a declared shape: Start's
  env-only and isomorphic fns) and `RegionFrag.expr` (a claimed region rendered as one expression in a generated
  position, an initialiser: the router's split and HMR consts, Start's lazy handler and hoisted chain; a method's
  `function` keyword is the boundary's head). Each boundary has three records, plain integers computed at plan time:
  the **role** (`value`: a call's value, never a reference; `reference`: a reference rendered as another one, as a
  captured `cb` reads `props.cb`; `moved`: the expression it was), the **destination** (the precedence level the
  position takes, how the value is used, read through groups and TypeScript wrappers: called, tagged, a decorator,
  `delete`, `typeof`; what follows; a statement's or an arrow body's first token; a `for` initialiser) and the
  **shape** of what renders there. The renderer asks three questions on what rendered, never merged: **V**
  (`(0, x)` where the value would become a reference: a receiver, a direct `eval`, a deletion, an unresolvable
  name's `typeof`; `(void x)`, `x` grouped below unary precedence, where it is all of a statement of a module or a
  function body once TypeScript's wrappers around it are erased: what precedes it may vanish, and no lowering or
  minifier makes a string alone of it, as they do of `('s' as T)` or `(0, 's')`), **G** (parentheses: three levels, sequence < open < tight, no operator table, then the cases
  precedence does not describe: an optional chain continued, a number before `.`, JSX as a left-hand side, a
  decorator, a rendered first token that opens a declaration or a block) and **L** (a space where the
  edge characters would merge with their neighbours, `impl` + `in`; a boundary opening where an enclosing one opens leaves its start to that one's opening, `n<(<></> as any)`). What renders on a boundary's kept node
  reports its shape: a substituted or renamed reference its own (Solid's `props.cb` is a member), a nested boundary
  or a planner's text the shape its edit or placeholder declares (a server fn's stub is a call), else an unknown one (grouped as an operand, valued where called, deleted, decorated or under `typeof`); a nested boundary that is all
  of the kept node renders bare and the outer one wraps it once, seeing the shape the inner one resolved to; under a
  group or a TypeScript wrapper of the kept node (`inner() as Fn`) it is that wrapper's operand, wrapped there, and
  the outer one sees the reference of what it rendered: none once V made it a value (`(0, x)`), the same through
  parentheses G wrote (`(obj.m)()` still calls with `this`). Each open boundary is one record on a
  stack (`Boundary` in `freeze.ts`): what renders on its kept node reports there. The opening text is a segment reserved before the
  body and written after it (no splice), mapped to the first token it wraps (one segment with that token when it is generated text mapped to the same offset, `(0, props.cb`); a closing `)` after generated text mapped to the source joins that text (`(0, props.cb)`, as a callee's `(0, x)`), any other closing text and spaces are unmapped (copied source text ends its mapping there).
  Statement separation stays apart (`Renderer.statementStart`, below): it decides whether two statements join,
  after the wrapping.
- **One region tree per plan** (`RegionTable`, `rewrite.ts`): the module, every sub-region (one per range) and the
  range of every edit, placeholder and claim, shared by every output and checked against the units, so two ranges
  nest or are disjoint whatever outputs they apply in; a range that partly overlaps another is a conflict as it is
  registered, and so is a second claim on one range. Each plan has its own (a fallback round starts again from the
  units). How regions nest is read on the tree (`parentOf`, `innermostAt`); placement derives the nesting, where
  each unit is, and what each region's text holds of the tree, once per plan.
- **One walk per output** (`OutputView.walk`): source text enters an output only through it. A node renders its
  place (`placeholderOf`: a placeholder, or a kept claim's) or its text (`editOf`: its edit's body, or its source
  with the nodes inside it); a node that renders as its source is walked through. An insert has one owner, the
  text holding its position (`RegionTable.insertOwnerAt`): the innermost node strictly holding it, whose level
  renders it, and that text's region, else the unit holding the byte there, which reads what it names (one at a
  claimed region's edge renders once, beside the placeholder; one at a unit's start is the unit's: it renders and
  is read where the unit is). An insert where no unit holds the position (a statement's keyword, between
  statements, the module's end) is refused: nothing would read what it names. A slice that cuts a node rewritten in that output fails the
  compile in every mode (it would copy the text the node replaces). The renderer (`freeze.ts`), placement's reads
  (`reads.ts`) and the erased parts are the walk's visitors; the point questions (whether a byte renders,
  the claims an output keeps) climb the tree from a position's innermost range asking each node the same two
  questions: a place without an owner erases the text, a claim's relocates it. A question costs the nesting depth,
  not the number of edits. Whether a region is claimed is asked per output (`OutputView.isClaimed`): a member reads
  a nested region claimed only for other outputs as its own text (its references, no edge to the owner).
- **Outputs are put together from pieces** (`freeze.ts`). A derived output: its header, glue imports, the
  statements it includes and its generated units in order, export glue. The env module: the walk's text between
  its pieces, which are the statements placement rewrites (their recipes), the generated units at their anchors, the
  glue imports after the header and the export glue at the end. At one position a planner's insert renders first
  (with the text before it), then a statement's line end, the glue imports, the generated units, a statement's
  `;`, the statement; at a statement placement rewrites, the insert is the statement's and renders with what it
  keeps. A planner's node that a piece's position cuts
  fails the compile, as a slice cutting it does. Whether a byte renders in the env module is the tree's answer,
  else the rewritten statement's.
- **Generated code declares its reads** (`SymRef`s); nothing is re-parsed to find them. Names come from one
  allocator per file over every name in every scope (`names.ts`), so a name means the same thing in every output.
  Glue export names avoid the module's export names; in a module with `export * from …`, whose re-exported names are
  unknown, they are the compiler's own (`tsr$x`). A planner can name a binding's glue export ahead
  (`glueExportName`: React route HMR lists them for plugin-react to ignore).

### The one placement (`placement.ts`, R153, R155)

Every plan is placed by `computePlacement`. A plan a planner marks as a route file (`PlanContext.setRouteModule`, the
router planner's split part) is placed as route splitting on main places it, by its outcome; every other plan
(server-fn handler modules, the RSC provider copy, erasure only, `<Hydrate>` chunks) by the same rules, with no name a
chunk imports and none main shares. It reads names, references and assignments only, never what code does:

- **clusters** (`clusters.ts` `buildClusters`): one per unit (units declaring one symbol are one), a claimed region
  with the generated unit owning it, an unclaimed sub-region with the region around it. Its kind comes from the unit
  kinds, which statement syntax sets.
- **the write table**: every assignment of a module binding (`ref.kind === 'write'`), with the unit or claimed region
  holding it. It answers two questions: a shared name some code outside the set assigns, and an output that would
  assign a binding it imports (or a `<Hydrate>` chunk its copy).
- **reads** (`reads.ts` `readIndex`): what a cluster reads in an output is what the walk of its members' text there
  renders (`OutputView.walk`): the references of the source it renders and the symbols generated text names; its
  successors are the clusters those lead to. The removal's closure (below) reads the source's text, rendered or
  not, through the same index (`clusterReads(c, o, false)`).

The rules, per output:

- **the env module** loses only what the split made unused (the R153 amendment, `removal/`, the rule erasure
  uses): a declaration or import specifier the source used from text the module no longer holds (a claimed option
  value, erased text, a type: see **types**; a use in a type counts) goes with its initialiser when nothing that stays
  reads it by value.
  Top-level statements (R154), exports, code already unused in the source and what they reach stay; enums and
  namespaces are declarations like any other (R155). In a route module, splitting never removes a class, enum or
  namespace declaration, whatever names it (by value or in a type, in split or kept text), and it keeps what it
  reads, unless it is a name main shares (R163: main's removal rule never removes one, so its body runs at load).
  Only erasure removes one: when text the module erases, or another planner's output claims (a handler module, a
  `<Hydrate>` chunk) reads it by value, or erased text names it in a type, and no split chunk reads it by value
  (leaks first, R163 round 2 (b) and round 3).
- **a split chunk** takes what its option's value reads, transitively. What the env module also keeps it imports from
  there when main does (`RouteModule.imported`, from the router planner: the route binding, `export const|let|var`)
  and copies otherwise, with the top-level code reaching what it copies through the names it references (R1: every
  statement, every class, enum and namespace (R163) and every declaration no other declaration or statement of the
  source reads by value (an export is a reference, as in main's removal rule; a read by another output's text, a
  server fn handler's, is one; its own text and a type are none) whose names reach it, transitively; main's second
  instance,
  spec-main-splitting.md §1.8; `export default <expression>` is such a statement, rendered there as
  `void (<expression>)`); a binding a statement declares (`if (…) { var x }`) is imported. A derived output drops
  only the `export` (`default`) keywords of what it copies: comments and annotations stay with the copy.
  What the env module does not keep the chunk copies too, also what another chunk copies. The names main shares
  (`RouteModule.shared`: two option groups read them, a staying option counting as one) and nothing else are one
  shared module per file (`?tsr-split=shared---<keys>`, main's `?tsr-shared=1`): the env module and the chunks import
  them, the env module re-exports the exported ones; one code outside the set assigns (a chunk, the env module,
  another planner's output), or one reading a declaration outside it, leaves the set and is placed like any other (one
  fixed point). Import specifiers are copied where read. A planner renders its own text
  in split chunks with a `{ kinds }` scope (Start: a split chunk's copy of a server fn is a caller, its handler
  `createSsrRpc(id)` and its validator gone, R159).
- **a `<Hydrate>` chunk** (spec-phase2-hydrate H1/H2) copies every declaration its children reach, by binding and
  transitively, exported or not, and no top-level statement; it imports only what cannot be a copy: a binding its
  planner names (`OutputDecl.imported`: a declaration leading back to the boundary, a recursive component), the route
  binding (`RouteModule.route`, whatever encloses the boundary), a name a statement declares and a declaration such a
  statement reads (KNOWN-BUGS), what another module of the file holds (a shared name, a generated declaration with
  its own home). It is no home of anything: two chunks reaching one helper each copy it. Code that left the env module
  (the children, what only they use) assigning such an import, or its copy of a binding the env module keeps, falls
  back (`shared-writer`); a helper the env module holds too writes each side's own copy.
- Another planner's derived output (the server-fn handler module, one per file) imports what the env module keeps,
  and what it alone needs moves there; a provider output copies what it reaches (R157). A
  declaration a planner's lazy module (`custom`, the server-fn handler module) reaches stays in the env module when
  evaluating it reads, by name and transitively, something the env module keeps (`const snapshot = cfg.url;
set(cfg)`): it runs at load, as in the source; a declaration that is exactly a function moves (one fixed point
  after the env closure). A handler assigning what the env module keeps falls back in place (`shared-writer`).
- **code already unused**: an import nothing in the source references, a bare `import './polyfill'` included, moves
  to the shared module when the env module imports it (statically, first), in source order with the shared module's
  own imports: it runs at the same point, once, and a module a shared declaration reads still runs after a bare import
  written before it; a CSS import keeps its cascade position, as in `main`'s shared module. Otherwise it stays in the
  env module. Chunks and Start's derived outputs (Hydrate, the server-function handler module) load after the
  env module has run (a handler module through the memoised loader of its defining module, D6/R66) and get none. Only
  imports the source wrote (not a planner's generated `lazyRouteComponent`). A declaration nothing references stays in
  the env module only: a copy would run its initialiser again (`main`'s chunks do). React's classic JSX runtime is not
  supported with splitting: a chunk holding JSX has `React` only when its code reads it.
- **a fixed home says where, not whether**: the owner of a claim whose output no longer keeps the claim (`hasClaim`:
  an erasure removed its occurrence, e.g. a boundary in a route option the router deletes on the client) is unused,
  whatever home its planner gave it: no root, no home (the removal rule).
- **one fallback, on the outcome**: a derived output that would assign a binding homed in another module of the file,
  or its copy of a binding another derived output holds without the assigning code (two split chunks copying a `let`
  one of them assigns; for a `<Hydrate>` chunk also the env module's), does not take the root bringing that code
  (`Placement.fallbacks`, `shared-writer`), and its planner keeps the root in place (the router planner's
  `assignsWhatItImports`, start-env's handler, Hydrate keeps the children in place). An output holding the assigning code
  too (a helper both call) writes its own copy. A split chunk's copy of what the env module keeps is `main`'s copy
  (it imports what `main` shares), so the env module's copy alone does not make a split chunk fall back.

A chunk's copies are main's: state is one instance where main has one, and a statement runs again in a chunk only
where main's chunk runs it again (never a declaration already unused: better than main).

### Removal (`removal/`, `declarations.ts`)

One algorithm for every level (SPEC G16, R153 amendment, R170): a definition the source used from text an output no
longer holds leaves that output when nothing that stays reads it by value. Placement calls it once per plan, before it
reads the tree (`Removal` in `removal/index.ts`):

| Module                         | Job                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `declarations.ts`              | the one table of what a declaration is: per declaration its spaces (value, type, namespace) and whether it is a `definition` (runs only to give its names a value), a `statement` (`using`) or `erased` (types, a `declare`, a type-only import); `resolve(binding, reference)` picks what a reference names, by its space. Units, placement's removal rule, the definitions below the units and the closure read only it                                                                                                                                                        |
| `removal/closure.ts`           | provenance: one worklist over bindings at every level, seeded by the references inside removed text (erased text, text another output claims) and by every type in code that stays (a type never keeps a value). Causes `USED` (a candidate), `ERASED` (no output holds the text: a type declaration is a name along it), `NAMED` (R163: what erasure may take from a route module), `REMOVED` (removed text leads to it: the text of a `declare`, which stays as written, names imports for it only then). A binding declared inside the text being read is not reached from it |
| `removal/build.ts`             | the definitions below the units (a function's locals, pattern leaves, a namespace's members, a hoisted `var`), each in its grammar slot; built when the closure first reaches such a binding. `readsItself`: a declaration that reads its binding before it has its value is a statement (a direct read only, no function, class field value or static block between; KNOWN-BUGS)                                                                                                                                                                                                |
| `removal/mark.ts`              | what stays, in one view: reachability by value from what stays whatever reads it, over clusters and definitions together (no order between the levels; a cycle of candidates keeps nothing)                                                                                                                                                                                                                                                                                                                                                                                      |
| `removal/render.ts`            | how a definition that does not stay gives up its text, by its slot                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `removal/named.ts`, `lists.ts` | what generated text names, by position; the comma-list helper planners share                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

- **by provenance**: only what is reached can leave: code the source never used from removed text stays as written (an
  unused `const`, an import nothing reads, a declaration whose own text only reads it). A top-level statement that is
  no declaration (`x.p = v`, `x = v`) is never removed (R154). Type units stay in the env module as written whatever
  their cluster, never in a derived output unless a planner roots one there (route HMR copies a type statement
  holding a `@refresh` comment into a component chunk) or it declares a value (an ambient value declaration,
  `declare enum`, `declare const`, exported or not, is copied: Vite 8's Oxc with any tsconfig inlines the members of a
  `declare enum` and a `declare const enum`, Rsbuild's SWC those of a `declare const enum`, so a derived output without
  it would read a name the env module inlined and no runtime holds), under the
  same two rules; the TypeScript-only syntax no output
  renders is a unit's `stripped` (type-only export syntax, `isTypeOnlyExport`; an inline `type` import specifier, which
  follows its statement's value specifiers). A read the core
  synthesises from a name (a Solid `use:` directive) binds only to a declaration with a runtime value. A type name
  decorator metadata serializes is a read by value where the class is defined (`metadataNames`). JSX reads the
  factories a classic pragma of the header names (`@jsx h`, `@jsxFrag Frag`, React's for `@jsxRuntime classic`:
  `jsxFactories`), by value where it is.
- **types**: a type never keeps a value. Every type position in code that stays (`Reference.inTypePosition`, the
  parser's) is erased text where it stands, and what it names was used by the source (an annotation, a cast, a type
  argument, an overload signature, an abstract or `declare` member, in running code or not), except an import,
  named directly or through any chain of aliases (whether an import stays is the host's: `verbatimModuleSyntax`;
  `follow` reads a declaration for its imports only from removed text), and the text of a named erased declaration
  (an alias, an interface, a `declare`), which is read when the declaration is named or exported (a `declare`'s, which
  stays as written, for its imports only along `REMOVED`). Type export syntax
  (`Unit.stripped`) and exported erased declarations (`export interface X`, `export { X }`, `export default X`, an
  exported namespace's types; `Declarations.exportedErased`) are removed text in every module (main's
  `stripTypeExports`), imports included. The pass runs where a type position names a value of the module
  (`Tier1.typesNameValues`): elsewhere it reaches nothing. It does not run in a module with decorators (what their
  metadata reads is the emitter's, which no rule here models) or with a `React` of its own (a classic JSX runtime the
  bundler may be set to calls it): types keep what they name there, as on main. Its seeds are not erasure's `NAMED`: a route module keeps a
  class, enum or namespace only types name (R163). A value only types name leaves with its initialiser, in every environment (user decision,
  2026-11-25). Along `ERASED` text a type declaration is a name: what an alias, an interface, a
  namespace of types or a `declare` of a value names was used. A reference names the declarations of its space only (D1): `x: Shape` the
  alias, `typeof Shape` and reads the value; `N.T` of a namespace of types the member `T`, never a value declared
  beside `N`; `import A = N.M` names what the whole path selects, and an alias named only for a type leaves unread.
  Moved text (a split chunk, a provider copy) names its types for itself: no type declaration is followed from it.
- **the contract** (D2 to D8, user decisions of 2026-11-22): a removed definition takes its own evaluation with it
  (D7); a rest element is code of its own, a plain never-read name leaves with its declarator (D2); a pattern that
  stays drops its dead positions, what cannot leave is emptied (`{}`, holes) and an emptied pattern's default becomes
  `{}` or `[]` (D8, D8d); a plain parameter keeps its place and a default that reads or calls anything becomes
  `void 0` (D4); static references only (D6: an `eval` reads nothing).
- **slots** (`build.ts` `Slot`): `list` (a statement with its line), `init` (a `for` initialiser), `body` (`;` stays),
  `item` (one of a comma list, with one separator), `hole` (an array element: the iterator steps as before), `tied`
  (with its holder: the only declarator, an array rest element, a computed key), `fixed` (never: a parameter, a `catch`
  binding, a `for…in/of` head). What cannot leave is contracted in place.
- **views**: the mark runs on the edits addressed to every output, and again on the env module's alone when its view
  differs (its own erasures, a claim that applies in one view only, an output that copies the module): what only the
  env module's erasures orphan stays in the outputs that still render the readers. Invariant (h) (`verify.ts`): no
  output holds more declarators binding nothing than the source.
- **planning rounds**: a derived output that would assign a binding it imports reports a _fallback_
  (`ctx.fallbackAt(range)` on the next round), and `compileModule` re-runs the planners with that region kept in
  place, until no new region is reported (a kept region can free the next one). Every planner answers a fallback by
  keeping that root in place, so every round keeps one more region and the rounds end within the module's region
  count; past it is a compiler bug (an `internal-invariant`).

### Emit and source maps (`emit.ts`, `output-builder.ts`)

Each output is a flat recipe of original slices and generated text, rendered by our `OutputBuilder` straight into a
v3 source map. User code is never re-printed: comments, escapes and directives survive, and segments start at every
word and punctuator of copied text, so positions in every output (derived modules included) map to the user's
line:column. Lines follow every ECMAScript line terminator. Hosts compose the map with the bundler's input map. The
map names the file without its text (`sourcesContent`): Vite reads it, Rollup and Rolldown take the module's code, and
the webpack-family hosts put it in the module map in production and in the emitted map files in development
(`hosts/emitted-maps.ts`: the bundler hashes a module with its map, and the whole file in every output's map would hot-update
every output of an edited file). Rollup and Rolldown name a module's source by its id (`route.tsx?tsr-split=…`); the
Vite hosts' `outputOptions` compose `sourcemapPathTransform` with `withOwnSourcesNamedByFile` (`hosts/vite.ts`), which
drops the owned query keys, so every output of a file names it once (R135); the webpack family names the resource
path already. The header (hashbang, pragmas, license, directives) is handled by `header.ts`; derived outputs copy pragmas and
directives: a comment holding a JSX pragma's name is copied as written (a license notice holding one too), and the
host's JSX transform decides whether it is in effect there as it does in the source; no other license comment.

`output-builder.ts` is the one reader of characters: line terminators and whitespace, where two pieces meet (L of
the boundaries, `spaceBefore`/`spaceAfter`), and what an output's segments render (`RecipeWriter`, which freeze
writes into). One rule separates a statement from what renders before it, in every statement list and both
assemblers (`Renderer.statementStart`), wherever a statement may follow something other than its source predecessor
(text after an edit, a removal, a piece of the env module, a statement of a derived module): a `;` when its first
token would continue what precedes, a line break when it is a statement of the module sharing the line of what
precedes it, and `void` before a string the source has after other statements once it would join a directive
prologue. A JSX pragma the source has after its first statement (`Header.latePragmas`) gets a token before it when
an output would make it lead (`Renderer.keepPragmasLate`, J2.16).

### Values and summaries (`values.ts`, `summary.ts`, `resolve.ts`, `facts.ts`)

- Recognition is by binding identity, never by name: an abstract value domain over bindings (factory, builder with
  links, isomorphic fn, namespace, function returns, unknown, plus symbolic `importRef`/`member`/`call` terms) with a
  pluggable `RecognizerTable` (Start supplies its kinds; the core ships none).
- Across modules, **summaries**: the export table and the abstract values of exports, computed from the module's
  _raw_ text (filesystem read or exact-id virtual load, never the bundler's transform pipeline), environment-
  independent, holding no AST. `ExportResolver` follows re-export chains over summaries. Known TanStack packages are
  recognised by specifier and never resolved. An importer's prefetch normally asks for a module's summary before the
  module's own transform runs, so a compiled module is parsed twice: once for its raw facts, once for its compile; a
  transform's parse is never reused as a summary. The one import answered without a read is a route file's `Route` when
  the route registry says the router package's constructor made it (`RouteRegistry.lookup().routerConstructor`): the
  Start prefetch takes it as a value it knows and records a `route-registry` dependency, so the route tree's imports
  read no route file.
- `RawFactsCache` retains, per canonical id, the facts of one read and its revision, and serves summaries and
  import-protection _target facts_ (marker, export names, evaluation and lazy imports) from it.

## Pipeline (`pipeline.ts` `settleModule`)

| phase | what                                                                                                                                                                                                                                                                                                        |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | identify (canonical id = host id minus compiler-owned query keys), validated plan-cache lookup, parse, Tier 0 analysis (imports/exports/edges/markers), each planner's `gate`, async `prefetch` (resolutions, summaries, target facts; may withdraw the planner)                                            |
| B     | synchronous `plan` of every planner in order on an `AnalysisPlan`, `resolve()` (claims, clusters, roots, homes, glue, the removal), `freeze()` (`freeze.ts`) into a plain-data `EmitPlan`, beside the per-output edges the policies read (`edges.ts`, one builder for both tiers; not cached with the plan) |
| C     | per-output edge `policy` (import protection substitutes specifiers), snapshot validation of every dependency, publication to the cache                                                                                                                                                                      |
| D     | emission of the requested output, on demand                                                                                                                                                                                                                                                                 |

Tier 1 (units, symbols, classified references) is built only when a planner needs it. Phase C restarts the compile
(up to 3 attempts) when a dependency changed underneath it or an eviction or its file's event of another text moved
its key's generation; a compile overtaken by a newer revision of its own file is returned but not published. A request settles on the module untouched or compiled (a derived id
of an untouched module is the empty module) and its host acts on it while the request is open (`settleModule(input,
host, caches, use)`; `compileModule` is its output): `current()` says no newer answer of the key exists (the key's
latest text is the request's, and its generation is the one the answer was taken at: a request of another text, a
file event, a removal or an eviction moves it; sibling outputs of one text share it). A host writes shared state
only for a current answer, such as Start's server-function registry. A revision is newer by its request's arrival, noted once: a request that waits (a plan hit's
validation, a compile it shares) and then compiles never takes back the latest revision from one that arrived meanwhile. Requests of one text share one compile: a request (any id of the file) arriving while that
text compiles waits for it and emits its own output from the result.

## Caches and invalidation (`cache.ts`, `host.ts`)

- `PlanCache`: one plan per (env, canonical id, config key; the late pass is a second config key of a file), the latest revision only. A hit is _validated_ (same canonical identity,
  input hash, config/env digest, and every dependency fingerprint still current). Live keys (published, or with a
  request in progress) are indexed by path, so `invalidate()` finds a changed file's plans without scanning.
- `DependencyLedger`: dependencies are recorded as facts are acquired (resolutions, the exports a lookup read and a
  module's `export *` list when a lookup went through it, whole summaries for a listing of a namespace's exports or a
  module without a summary, target facts, route registry digests, failed resolutions), and a `DependentsIndex` maps a
  published (or restored) plan's dependencies back to it, until it is evicted or replaced. An event checks the plans
  that depend on its path; a compile running has no rows: its snapshot check asks again what the event moved (the file
  set, the raw facts), and refuses or accepts in its own turn.
- `invalidate(caches, change, hosts)` is **the** invalidation operation: hosts call it for every file event they see
  (every hook, every environment) and for registry changes. Calls for one path run one after the other;
  `caches.settled()` resolves once none runs. The call returns nothing.
  - **Repeats are harmless.** The raw-facts cache keeps the revision of the text it read of each path (`seen`); the
    event reads the file once, and a change whose text is what the caches read (an echo, a touch, the same event
    through a second hook) marks no fact stale.
  - **An event is judged by the file as it is.** A removal of a file that reads back is an add, and a change of one that
    reads nothing a removal. An event
    that reads the file empty reads it again for a moment (an in-place save reported between truncation and write),
    when a raw fact or a plan depends on the file's text, unless an event read it empty and waited in vain and the file's modification time is the same (a repeat of that
    event through another hook; a time of whole seconds counts as unknown: a filesystem of coarse times stamps a save
    like the write before it).
  - **Every file event moves the file set** (`fileSetVersion`), a repeat included: any may hide a creation (chokidar
    folds a removal and a re-creation within its window into one change; Rspack lists a file back in its batch as
    modified). So the resolution memo is dropped, a plan's resolutions are asked again at its next request, and a
    snapshot check asks its resolutions again once an event ran since they were checked (`stable`, below). The event also asks the failed resolutions of every published plan, and the resolutions the file may take
    (a file of the same name with another extension, or of a directory a resolution went into, looked up in the
    dependents index by directory and name, not scanned).
  - **Dependents.** A change marks the file's raw facts stale (its next build takes the text the event read) and
    re-validates dependents' fingerprints with each environment's own resolver (a resolver that throws makes the plan
    stale, and its next compile reports the error). A plan answers for its file's text: the file's change evicts its
    plans of another text in every environment (`PlanCache.supersede`). The event never sets the key's latest text
    from the file's raw text (an upstream plugin may hand the compiler another text: a banner). An event of another
    text than the latest request's, or of a text the compiler cannot compare (a file it does not read: a module another
    plugin compiles from it, compiled in place, such as `.mdx` or a Vue SFC's blocks, whose every event reads the same),
    is of a text no request settled: the key's generation moves (a compile running attempts again, an open answer is
    not current) and the file enters the stale set until a request settles the event's text. An event of the latest
    request's text moves nothing. Only the file's removal clears the latest text (`PlanCache.removed`): no compile
    running publishes until a request notes its text. A plan
    of the text the event read stays, with its rows (a touch, a request of the new text ahead of its event); an evicted one's file enters the
    stale set, for a bundler that skipped building it (webpack's content-hash snapshot of a file written unchanged
    after a loader before the compiler rewrote it; the takers let the event's own file go). A compile of a key's
    latest text without a plan (untouched, empty, not parsed) evicts the plan of an older one, or a restored one. A removal evicts the file's plans and stales every plan that read the
    file, unasked, on every host alike: its modules are built again at once, against what its imports find now
    (another file: `./b` found `b.ts` and finds `b/index.ts`; an external; or nothing, a failed resolution that every
    later file event asks again, so the file's return or a fallback created later builds them again). Vite dev keeps
    no module of a removed import waiting: the removal's update invalidates the importer, as Rsbuild, webpack and a
    watch build rebuild it (an import its output keeps fails there; one the compile erased does not). Events of
    different paths run at once: a plan judged stale is evicted and enters the stale set only if it is still the key's
    plan once its checks answered (another event may have evicted it meanwhile, e.g. its own file's removal, which
    took the file out of the stale sets). A removal is told to the session (`createCompilerCaches`' `removed`: Start forgets the file's server
    functions and import protection's records there).
  - **Stale sets.** The plans found stale enter their environment's **stale set** (`caches.stale`): the files whose
    modules the bundler must build again and will not build on its own, kept until a host takes them
    (`take(env)`). The other writers: a registry
    change (the file, in every environment that has compiled or whose bundler holds modules: `stale.track(env)`, a
    Vite dev environment, a webpack-family compiler from its first drain), a plan hit that fails validation (the file,
    so its other outputs follow; when no invalidation runs, counted as `staleHits` when a fact failed, a defect:
    `invalidate()` checks every fact, and as `lazyHits` when only a resolution or a route-registry digest did, which
    the next request asks again by design; the compiler test suites fail a file whose compilers count a stale hit or
    leave a stale path), and a compile every attempt of which was overtaken.
  - **Takers.** The webpack-family hosts take their environments' sets at `finishMake` (`StaleSetDrain`: a compiler
    takes the sets of the environments it builds, and builds a module again when its own environment's set holds its
    file), the Vite
    dev hosts in each environment's `hotUpdate` (`staleHotUpdate`: the event's own file leaves the set first, its
    modules are the event's), and a Vite watch build at each environment's `buildStart`: a Rolldown watch rebuild runs
    every `load` and `transform` again, so it builds every stale module (an assumption test in
    `start-build-watch.test.ts` fails if a rebuild stops doing so).
  - **Virtual modules.** Raw facts are of a text: a file's, one entry for every environment, or a virtual module's
    (`isVirtualId`), one entry per environment, since each environment's bundler loads the id itself and a plugin's
    `load` may answer each differently (R36: the summary domain is the exact-id load). No file event names a virtual
    module: its host's update does. A Vite host's `hotUpdate` (`staleHotUpdate`) forwards a `change` of each virtual
    module its update lists (a plugin that regenerated one puts it there) or that imports one of them (a file the
    module's `load` watched, which Vite records as an import), with the id as the path: every environment's entry is
    stale, and its dependents are re-validated. It moves no file: no resolution is asked again. One nothing read
    changes nothing. A Vite watch rebuild tells no virtual module's change: each environment's `buildStart` expires
    the virtual modules it read and evicts its plans that read one (`expireVirtual`): the rebuild loads them again.
  - **Summaries.** A summary change invalidates an importer only when what it read changed: the digest of an export
    it looked up (`exportKeyOf`; an absent name appearing counts), the `export *` list a lookup walked, or the whole
    export-facts digest for a listing. An export added to a widely imported module re-plans none of its importers. A
    published plan keeps one `exports` record per module it looked names up in: the names and their keys, or none
    when the module exports none of them (a barrel's star targets are visited for every name, so one record per name
    grew with names × targets), and the module's `export *` list when a lookup walked it.
- **One snapshot check** (`stable(snapshot)`, for an attempt before publication, a plan hit and `restorePlans`): a
  snapshot is the dependencies read plus the `fileSetVersion` and
  `RawFactsCache.version` they were checked at (`CacheEntry.resolvedAt`, `factsAt`). The asynchronous part asks what
  may have moved: resolutions once the file set moved, raw facts once their version did. The caller acts in the turn
  the verdict is reached: it refuses (a fingerprint not current: a failed hit evicts and is counted there) or accepts
  (both versions unmoved since the round began, the route-registry digests read again: a watch build's registry
  publication calls no `invalidate`), and only while the entry judged is still the one (a hit: still the key's plan;
  an attempt: the key's generation unmoved). A version that moved during a round makes the check ask again what it
  answers (it ends once a round overlaps no event: a hit during an event storm waits for the storm). A hit's plan is
  left only through its refusal, an eviction, never replaced by a compile of its own text. An attempt reads one answer of each fact,
  however many reads ask it (`runAttempt`): what the ledger records is what the plan was made of. The raw-facts
  version moves on every `markStale`, `forget`, `retain` drop, `expireVirtual` and `releaseVirtual`, which is how
  anything that changes a raw-facts answer reaches the cache (a host that saw a file missing marks it stale when it
  may have appeared; a virtual module's miss is kept, as its text would be: no file event names it).
- **The generation.** Evicting a plan of the key's latest text moves it (`PlanCache.delete`: a failed hit, an
  invalidation, a registry change, an own-file event of another text): an attempt begun before it does not publish,
  and an answer taken before it is not current. A plan of an older text, or a restored one, has no current answer:
  its eviction moves nothing. An own-file event of another text than the latest request's, or of a text the compiler
  cannot compare, moves it too (`PlanCache.supersede`), and one of the latest request's text moves nothing.
- `restorePlans(caches, plans, hosts)`: a host with a persistent bundler cache persists each output's plan key and
  dependencies (`CompileOutput.persisted`) with its module; a later process checks them for the modules the cache
  restores without compiling: a current plan (`stable`, installed in its accepting turn unless the key has a plan or a
  request of its own) joins its environment's plans as a _restored_ plan (never a hit; its
  dependencies are in the dependents index, so `invalidate()` reports it like any plan; a compile replaces it), a stale
  one is returned for the host to build again.
- `releaseEnvironment(caches, env)` is the end of an environment's lifetime: a production build releases an
  environment's plans as soon as that environment's build is finished (several environments build one after the
  other in one process). Raw facts are shared by the environments and stay, but for its virtual modules' (no other
  environment reads them).
- Resolutions: each compile records its answers in its ledger; validation asks the module's resolver again (its
  host's: `invalidate` and `restorePlans` take the host of each plan's key) only once a file event was applied since
  the plan's resolutions were validated (`CompilerCaches.fileSetVersion`). An environment has one resolver (Rsbuild's
  RSC layer, which resolves with `react-server` through rule options, is an environment of its own). The
  environment's `PlanCache` memoises its answers per (importer, specifier) for one `fileSetVersion`
  (the compiles of a build would otherwise ask for a barrel's re-exports once per importing module, and so would
  those of a dev server's start); the same version bump drops the memo, and `releaseEnvironment` releases it with the
  plans.
- Not cached: emitted outputs (emission from a frozen recipe costs microseconds).
- Invariants: no Yuku object is reachable from any cache (measured by `benchmarks/compiler-perf`'s `memory` and `leak`
  scenarios); every cache is bounded by the live
  module set; derived outputs are pure functions of (env, source, config, summaries).

## Hosts

| host                     | where                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router, Vite             | `router-plugin/src/hosts/vite.ts` (+ `session.ts`): native plugin, hook filters (no module of `node_modules`), `load` for derived ids, `hotUpdate` invalidation                                                                                                                                                                                                                                                                                                                                                |
| Router, Rspack / webpack | `router-plugin/src/hosts/webpack.ts`, `loader.ts`: the plugin's own loader on every JS module outside `node_modules` (compiles route modules, composes input maps, `addDependency`); the stale set built again at `finishMake` (`StaleSetDrain`)                                                                                                                                                                                                                                                               |
| Router, esbuild          | `router-plugin/src/esbuild.ts`: generator only; `autoCodeSplitting` throws                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Start, Vite              | `start-plugin-core/src/vite/compiler-plugin.ts` (+ `compiler-state.ts`, `invalidation.ts`, `late-pass-plugin.ts`, `server-fn-plugins.ts`, `handler-reach.ts`, `planning.ts`, `bundled-dev.ts`) over the Start session (`compiler/session.ts`, both Start hosts): Start planners and the router planner in one compile per module and env; the client build the server embeds is one record of the run (`ClientBuildRecord`), and a watch build's server watches a sentinel the client rewrites when it differs |
| Start, Rsbuild           | `start-plugin-core/src/rsbuild/` ([COMPILER_ARCHITECTURE.md](../../../start-plugin-core/src/rsbuild/COMPILER_ARCHITECTURE.md)): Rspack loaders per compile environment (an Rspack layer is one), facts in `buildInfo` replayed for the persistent cache                                                                                                                                                                                                                                                        |

The bundler-shaped helpers the hosts share (a Vite build's last pass, derived ids' `load`, module-graph
invalidation and live modules of a hot update, a webpack-family loader's map and module id,
the webpack-family stale-set drain (`StaleSetDrain`: rebuilds at `finishMake`, a compilation for an idle compiler), emitted maps' text, the key of a persistent cache, a loader's
diagnostics at their positions) live in
`hosts/`, exported apart from the core model, which uses none of them.

A persistent bundler cache restores modules without compiling them, so Start's Rsbuild host adds `compilerCacheKey`
(the compiler packages' manifests, and their built scripts outside `node_modules`) to the cache's version.

Derived ids and the specifiers that import them keep the Babel splitter's format, which apps' chunk naming reads
(webpack/Rspack `chunkGroup.origins[].request`, Vite module ids): `identity.ts` alone prints and parses it. A split
group is `<path>?tsr-split=<a>---<b>` (the options sorted); the shared module, which main names `?tsr-shared=1`,
follows that style after a first key no route option has (`tsr-split=shared---<keys>`); Hydrate is
`?tss-hydrate=<id>`. An output imports another output of its file (and the
route module itself) by the file's absolute path (`sameFileSpecifier`), a `#` of the path escaped as `\0#` (the
webpack-family request escape); under a path with a `!` (loader syntax there, no escape), by its basename
(`./route.tsx?…`). webpack and Rspack resolve it themselves; the Vite hosts resolve it with
`resolveSameFileSpecifier`, only for the importer's own file (a browser URL `/src/…?tsr-split=…` looks absolute too).

Hosts decide dev/build from the bundler's mode, never from `process.env.NODE_ENV` at plugin creation. An id without
a language (an asset, or an asset query a script honours: `SCRIPT_ASSET_QUERY_RE`, `isAssetId`) is never compiled, and its facts are never read from its
file. A host returns no transform for an env output equal to its input (an output ending where the source ends gets no
line feed). Start's hosts compile a `node_modules` module only as `start-plugin-core/src/compiler/scope.ts` decides.

## Planners

Fixed order per env (an array the host passes): `start-env` → `hydrate` → `rsc-css` → `router` → `import-edges`. A
planning round runs each planner's `plan` in that order; a planner sees the regions, edits and generated names of the
planners before it. The router plugin alone runs only the `router` planner.

| planner        | job                                                                   | file                                                                                                                                         |
| -------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `router`       | route option splitting (`placement.ts`), `deleteNodes`, route HMR     | `router-plugin/src/planners/router.ts` (`split.ts`, `hmr.ts`); runtime in `router-core/src/hmr.ts` and `{react,solid,vue}-router/src/hmr.ts` |
| `start-env`    | server functions, middleware, isomorphic/env-only fns, `<ClientOnly>` | `start-plugin-core/src/planners/start-env.ts`; recognition `src/compiler/`; ids/registry/resolver `src/server-fns/`                          |
| `hydrate`      | `<Hydrate>` extraction into chunks                                    | `start-plugin-core/src/planners/hydrate.ts`                                                                                                  |
| `rsc-css`      | RSC CSS injection in the provider env                                 | `start-plugin-core/src/planners/rsc-css.ts`                                                                                                  |
| `import-edges` | import protection: per-output edges, mock substitution (policy phase) | `start-plugin-core/src/planners/edges.ts`; rules, verdicts, reports `src/import-protection/`                                                 |

Code moved across a function boundary (Hydrate's children, Start's hoisted chain, the router's split function
values) is read by one walk, `walkMoved` (`moved.ts`), on the language's table of who provides `this`, `super`,
`new.target`, `arguments`, `await`, `yield` and private names (a parameter decorator has the code around its class),
with when each node runs (`now`, `maybe` in an instance field, `later` in a function) and the moved code's callables;
`contextOwner` climbs to the construct providing a use. Planners keep their policy and messages. Under Solid
(`ModuleAnalysis`'s `jsx`, one per session), a `ref={x}` read is marked as possibly assigning `x`
(`ClassifiedRef.assigns`), which the mutation model (through a liveness filter) and placement's write table count.
Server code passed by name (a Start position, a route's server option) whose binding the module assigns outside the
server-only text is refused: one rule, `reassignedServerCode` (`mutation.ts`), on the source alone, with no read,
guard or export analysis. The server-only text is
one view of the module, `PlanContext.serverText`: every planner's `serverText` (its recognition alone, the same in every
environment), computed on first use. Each planner passes its own arguments and words the refusal.

Composition: `startPlanners()` in `start-plugin-core/src/planners/index.ts`; the router planner and its configuration
builder (`routerPlannerConfigFrom`) are exported from `@tanstack/router-plugin/planners`.

### Adding a planner

1. Implement `Planner` (`host.ts`): `name`, `tier` (0 if you only need import/export tables), a cheap `gate`, an
   optional async `prefetch` (everything cross-module happens here and is recorded as a dependency; resolve to
   `false` to withdraw), `plan(ctx)` (synchronous: register regions, emit edits, `declareOutput`/`addRoot` for
   derived modules, `setFacts`, `diagnostic`), and an optional per-output `policy` (async: it may resolve and read
   target facts and markers too, recorded as dependencies the same way).
2. Never walk the whole AST when a semantic query from the import table or a binding's references answers the
   question; never keep a Yuku node beyond `plan()`; facts must be JSON data.
3. Declare its `PlannerData` entry (`host.ts`: the types of its config, prefetch result and facts, by its name) next
   to it with `declare module '@tanstack/router-utils/compiler'`, and type it `Planner<typeof NAME>`: `ctx.config`,
   `ctx.prefetched.get(name)`, `setFacts` and `facts.planners[name]` then carry those types, for the planner and for the
   hosts reading its facts. Slot it into the host's planner array at its fixed position.
4. Test the behaviour through the public plugins in the consumers' oracle suites (and keep the invariants above).

## Testing

- Core unit tests: `packages/router-utils/tests/` holds only what no public input reaches (the safety nets
  `verify`, `server-code`, `self-checks` and the cut check, pure functions, a filesystem assumption) and rows kept as
  the sole coverage of a path the oracle does not reach yet ([AGENTS.md](../../AGENTS.md)), on toy planners and a
  `MemoryHost` (`helpers.ts`). Run `@tanstack/router-utils:test:unit`.
- Behaviour: the oracle in `packages/compiler-test-utils/oracle/` ([README](../../../compiler-test-utils/oracle/README.md),
  [SPEC](../../../compiler-test-utils/oracle/SPEC.md), [KNOWN-BUGS](../../../compiler-test-utils/oracle/KNOWN-BUGS.md)):
  `test:unit` and `test:integration` of router-generator, router-plugin, start-plugin-core and react-start-rsc. Real
  bundlers, dev servers and browsers, public entry points only, no output snapshots. Known bugs are `.fails` pins;
  `COMPILER_TESTS_PINS=run` runs them as ordinary tests. Harness rules: [AGENTS.md](../../../compiler-test-utils/AGENTS.md).
- Planners have no tests of their own: they are tested through their plugins, in the oracle above (the fast tiers of
  router-plugin and start-plugin-core included).

## Debugging knobs

Environment variables read by the bundler's Node process (never by a bundle). They are diagnostics, not a supported
API: names and output may change. Unset, they cost one `process.env` read when a cache or session is created and
nothing per compile.

- `TSR_COMPILER_NO_CACHE=<list>`: disables caches, comma-separated: `plans` (no plan is a hit, every request
  compiles again; a published plan is kept for all else, so an edit still reports the modules that read it, an event
  of the text it was compiled from keeps it, and a request is compared with its text), `facts` (every raw-facts read of a file re-reads and re-analyses it), `targets` (target facts of
  imported modules are rebuilt on every read), `registry` (a route file's `Route` is read from the file instead of
  answered from the route registry's `routerConstructor`), or `all`. Output must be identical with any combination; only speed
  changes. Use it on a report of stale or wrong output after an edit (HMR serving old code, a split that ignores a
  changed dependency, a dev/build mismatch): if `all` fixes it, an invalidation is missing; bisect with the single
  names to find the cache, then reproduce it as a dev-server test of the consumer's oracle (an edit and what the page
  or the next request shows).
- `TSR_COMPILER_VERIFY=1`: after every compile, each emitted output is re-parsed and checked against the plan
  (`verify.ts`), independently of what placement believes: every output parses; no output assigns a binding it
  imports (a); a same-file import names a runtime export of its home (b); every surviving top-level statement is
  emitted once in its home and once per chunk that copies it, counting the source text an output renders, not a
  generated unit's own text (`Segment.gen`) (d); planner facts are JSON (f); no output reads a module binding of the
  source, or a generated one, it neither declares nor imports, outside ambient text (g: the heritage of a `declare class`
  is erased); no output holds more declarators binding nothing
  than the source (h). A violation fails the compile. Every test run sets
  it (the shared run-directory setup and the core's own config); unset, it costs one boolean per compile. It is the
  one switch of the compiler's self-checks (`self-checks.ts`): set, the internal asserts run and a violated invariant
  throws; unset (users' dev servers, builds and their own tests), a violation is one `internal-invariant` warning for
  the module (an internal compiler error, please report it: the output may be wrong).
- `TSR_COMPILER_STATS=1`: every cache owner (the compiler caches, the router and Start host sessions with their
  import-protection and server-function state, the route generator) registers a reader of its entry counts and
  approximate bytes in a process-global registry, held through a `WeakRef` and read by a function outside the owner's
  scope, so it retains nothing. Read it in the same
  process with `compilerStats()` from `@tanstack/router-utils/compiler` (e.g. a temporary
  `setInterval(() => console.log(compilerStats()), 10_000)` in the bundler config); the raw registry is
  `globalThis[Symbol.for('tanstack.compiler.stats')]` when the package is not importable from the app. Use it on a
  report of dev-server memory growth: counts that grow with edits rather than with the module set point at the leaking
  cache. `TSR_COMPILER_STATS_BYTES=0` skips the byte estimates (structured-clone sizes, slow on large caches).
  Test contract: the owner names `start:<bundler>` / `start:<bundler>:session` and their `plans` / `ip.envs` counts
  are the only observable of the per-environment release in a production build
  (`start-plugin-core/tests/integration/perf-guards/start-build-environment-release.test.ts`); rename them there too.

## Performance and bytes

- Compiler perf harness: [`benchmarks/compiler-perf/`](../../../../benchmarks/compiler-perf/README.md): generated
  338-route Start/Router apps (React and Solid), dev startup, compile-all, HMR, builds, the _floor_ (compiler outputs
  replayed) and memory/leak checks.
- Client bytes: `pnpm benchmark:bundle-size:run` (18 scenarios); server bytes and cold start:
  `scripts/benchmarks/bundle-size/server.mjs`. Client production bytes must not grow.
- Rules: semantic queries over full-AST walks, cheap planner gates on the Tier 0 tables (after the parse, before Tier 1
  and any cross-module work), no worker pool, `yuku` pinned to an exact version, every cache bounded and invalidated.
