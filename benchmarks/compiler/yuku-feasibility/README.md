# Yuku feasibility and upstream findings

Reported upstream:

- [Missing JSX component references (migration blocker)](https://github.com/yuku-toolchain/yuku/issues/204)
- [Whitespace-padded purity comments are dropped](https://github.com/yuku-toolchain/yuku/issues/202)
- [Invalid object-method AST crashes code generation](https://github.com/yuku-toolchain/yuku/issues/203)

Investigated with Node 24.8.0 on macOS arm64, using published `yuku-parser`,
`yuku-analyzer`, and `yuku-codegen` **0.11.0**. The independent syntax oracle was
`@babel/parser` 7.28.5; it is only an investigation tool, not a proposed runtime
compatibility layer. The initial isolated probes did not change workspace dependencies. The subsequent
migration uses Yuku directly in the compiler packages; Babel is not retained as
an AST compatibility layer.

## Migration blocker: non-ASCII-uppercase JSX component references are missing

Published `yuku-analyzer` 0.11.0 records no binding references for standalone
`<_Widget />`, `<$Widget />`, `<ÉWidget />`, or `<éWidget />` tags. These tags
refer to JavaScript values. Plain ASCII-uppercase `<Widget />` and member tags
such as `<_Widget.Child />` work. Lowercase intrinsic tags such as `<widget />`
and namespaced tags such as `<svg:path />` correctly produce no value references.
Opening and closing component tags are both affected.

Run the standalone dependency-only reproducer against an installation containing
`yuku-analyzer`:

```sh
node benchmarks/compiler/yuku-feasibility/jsx-reference-repro.mjs packages/router-utils
```

The assertion fails with eight missing-reference cases and one false reference
for the intrinsic `<Widget-card />` tag on 0.11.0. This script
uses only the published `analyze` API and does not modify semantic tables or ASTs.
The separate public Vite Router reproducer,
[`jsx-prefixed-route-repro.mjs`](./jsx-prefixed-route-repro.mjs), demonstrates a
runtime consequence: a component used by an eager route option and a split JSX
component can be omitted from the lazy chunk, causing a `ReferenceError`.
The ASCII-uppercase control passes. This is a migration correctness blocker,
not only a bundle-size issue.

Run the public Router check in the native checkout (expected to fail), or verify
the exact known failure without leaving the diagnostic process unsuccessful:

```sh
node benchmarks/compiler/yuku-feasibility/jsx-prefixed-route-repro.mjs --workspace "$PWD"
node benchmarks/compiler/yuku-feasibility/jsx-prefixed-route-repro.mjs --workspace "$PWD" --expect-regression
```

Passing `--workspace /path/to/baseline/router` runs the same public plugin and
runtime contract against the built baseline. The Babel baseline passed all three
component names (`Widget`, `_Widget`, `$Widget`); the native version throws for
the latter two. This checks rendering and loader execution, not cross-chunk
identity: the baseline has a separate, preexisting duplication limitation.

Root cause is the ASCII-uppercase-only condition in upstream
[`src/parser/semantic/binder.zig:1038`](https://github.com/yuku-toolchain/yuku/blob/eb400037678815bdbc2e5477c4b5458e436286ad/src/parser/semantic/binder.zig#L1038).
The inspected source is commit `eb400037678815bdbc2e5477c4b5458e436286ad`.
[`jsx-reference-upstream.patch`](./jsx-reference-upstream.patch) proposes recording
every non-intrinsic standalone tag, retaining the existing member-root behavior.
It includes upstream tests for underscore, dollar, and Unicode names; opening
and closing tags; lexical shadowing; intrinsic tags; and namespaced tags. The
patch is a proposal, has not been applied to the dependency, and has not been
compiled or run in the upstream repository.

The full bundle comparison also exposed this defect through generated `<_H0 />`
Hydrate tags: the missing reference makes route cleanup preserve the lazy factory
as an initially unused declaration. Each deferred-hydration eager entry retains
65 raw bytes of unnecessary output (React +33 gzip/+22 Brotli; Solid +32 gzip/+61
Brotli across all client assets). These are removable residues once upstream
reference tracking is corrected, not required runtime behavior. No production
workaround, generated-name change, or purity annotation was added locally.

## Confirmed upstream defect: whitespace-padded purity comments disappear

The documented default `comments: 'some'` policy promises preservation of
annotations, but drops common forms such as `/* @__PURE__ */` and
`/* #__PURE__ */`. The annotation is present in the parsed AST. Printing removes
it. This can prevent a downstream bundler from removing a pure call.

Install the published versions in a scratch directory, then run:

```sh
node benchmarks/compiler/yuku-feasibility/pure-comment-repro.mjs /path/to/scratch-install
```

The assertion fails with 0.11.0. The generated code is
`const value = factory();`.

Root cause is in upstream
[`src/parser/codegen/utils.zig`](https://github.com/yuku-toolchain/yuku/blob/eb400037678815bdbc2e5477c4b5458e436286ad/src/parser/codegen/utils.zig#L162),
`isSignificantBlockComment`. It recognizes `@` and `#` only as the first byte of
the comment value, and its subsequent scan recognizes legal notices but not
purity annotations. Parser comment values preserve whitespace after `/*`.
The same root cause remains in upstream commit
`eb400037678815bdbc2e5477c4b5458e436286ad` examined during this investigation.

Proposed upstream fix: normalize leading whitespace before checking annotation
markers, or explicitly recognize whitespace-padded `@__PURE__`, `#__PURE__`, and
no-side-effects annotation forms. Add parser-to-codegen regression tests for
both marker styles, with and without whitespace and newlines, and verify the
other comment policies remain unchanged.

`comments: 'all'` is an existing documented option and preserves these comments.
Preserving all source comments is a reasonable compiler policy independently of
this defect. No special annotation-repair workaround has been added here.

## Initial feasibility evidence

### Invalid AST robustness report

`invalid-method-repro.mjs` deliberately replaces an object method's
`FunctionExpression` value with a `CallExpression` while retaining `method: true`.
This inconsistent AST originated in an early migration implementation and is
fixed in the compiler by retaining method/accessor semantics. Yuku 0.11.0 codegen
terminates its process with `SIGBUS` (null exit status, no stderr) on macOS arm64
for this input. Run it with a dependency directory argument; a parent process
captures the crash safely. This is invalid-input hardening, **not** a supported
syntax defect or migration blocker. Proposed upstream improvement: validate
method/accessor value shapes at the native boundary and return a diagnostic
instead of terminating the host process.

The initial corpus contained 115 input fixtures: 72 from router-plugin (including
all 52 route-splitting fixtures) and 43 from start-plugin-core. Each was analyzed,
cloned with `structuredClone`, printed, and independently parsed by Babel.
Normalized Babel ASTs matched their original input ASTs after excluding source
locations, comments, and parser metadata. This establishes structural syntax
roundtrip fidelity, **not** the correctness of a migrated transform pipeline.

Focused public-API checks passed for JSX component references and shadowing,
closure captures and writes, nested shadowing, TypeScript enum-member resolution,
type-only references, generated expression precedence, and cloned output edits
that leave the original AST/semantic analysis intact. A separate comment movement
check confirmed that explicit full-comment printing moves annotations with their
AST nodes and removes them with deleted nodes.

Unicode checks used astral and accented characters. AST `start`/`end` values use
JavaScript UTF-16 offsets, while flat comment spans are documented as byte offsets.
Generated source-map mappings resolved sampled identifier locations correctly
through `@jridgewell/trace-mapping` 0.3.31. Consumers must not conflate the different
span APIs. This is a smoke check, not exhaustive source-map validation.

Supported syntax probes included import attributes and deprecated import asserts,
explicit resource management, generic TSX arrows, TypeScript angle-bracket
assertions, type imports/exports, and decorators. Yuku can move a decorator from
before `export` to after `export`; downstream parser settings must accept valid
output independent of the old Babel-specific configuration.

The native packages advertise macOS x64/arm64, Windows x64/arm64, Linux
x64/arm64/arm GNU and musl, FreeBSD x64, and Android arm64 binaries. Only macOS
arm64 was executed here. The packages are ESM and declare no Node `engines`
constraint. A SHA-256-verified official Node 20.19.0 binary also successfully
loaded the built router-utils CommonJS entry point and exercised its public
analyze/clone/generate helpers, the router-plugin Vite factory initialization,
and the router-generator `Generator` export. A separately verified official
Node 22.12.0 binary loaded Start's built public ESM and Vite entrypoints and
exercised native analysis, cloning, and generation of TypeScript generic syntax.
Node 24.8.0 drives the normal workspace checks; other native platforms remain
unverified in this environment.
