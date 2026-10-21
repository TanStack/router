# Lifecycle type performance

The acceptance workloads are Router Large and Start Large. Run their existing
`gen` targets first: each generates 402 routes alongside nine existing routes
(**411 routes per app**). Builds regenerate the route trees. A nine-route checkout
is not the large workload.

Use Node 26.10.0, pnpm 11.21.0, and the same generated sources for both revisions.
The examples' `test:types` scripts resolve to TypeScript 7.0.2 (`@typescript/native`).
Rebuild dependencies before measuring consumers. Use instantiations as the main
metric; check time and memory are supporting observations.

```sh
CI=1 NX_DAEMON=false pnpm nx run-many --target=gen \
  --projects=tanstack-router-react-example-large-file-based,tanstack-start-example-large \
  --parallel=1 --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run-many --target=test:types \
  --projects=tanstack-router-react-example-large-file-based,tanstack-start-example-large \
  --parallel=1 --outputStyle=stream --skipRemoteCache --skipNxCache
```

| Version / experiment                                                        | Router instantiations | Start instantiations | Outcome                                                      |
| --------------------------------------------------------------------------- | --------------------: | -------------------: | ------------------------------------------------------------ |
| Before phased client-result types                                           |               736,206 |            1,377,157 | Baseline, both pass                                          |
| First draft, separate context views and SSR guard                           |               754,064 |            1,450,914 | Both pass; +2.4% / +5.4%, keep optimizing                    |
| Remove serialization deferral, retain helper return `NoInfer`               |               754,064 |                    — | Held whole codec inference fails; rejected                   |
| Normalize inferred function/object entries and preserve callable precedence |               777,514 |            1,498,080 | Full new phase matrix passes; +5.6% / +8.8%, keep optimizing |
| Consolidate return inference; skip SSR guard early in SPA                   |               761,702 |            1,466,161 | Retained; +3.46% / +6.46%, full phase matrix passes          |
| Cache the excluded context result behind another alias                      |               761,774 |            1,464,219 | Reverted: negligible Start improvement, Router regression    |
| Derive the shared parent context recursively instead of storing its type    |               762,088 |                    — | Reverted: Start declaration compiler stack overflow          |

The stable/nested-thenable constraint retains the consolidated version's exact
761,702 / 1,466,161 instantiation counts. Native, object, and callable thenables
remain supported without widening public client data.

The final shared effective-SSR calculation reports **764,572 / 1,469,787**
instantiations: **+3.85% / +6.73%** over the baseline. Resolving registered
omissions/undefined results before parent caps adds 2,870 / 3,626 instantiations
compared with the consolidated draft. This correction also removes the separate
serialization exemption for a disabled default; an explicit SSR override must
still validate transported values.

Logs and exact command records for these runs are in
`/tmp/pr6631-phase-types/`. Each row uses freshly rebuilt declarations. The failed
experiment does not establish a successful Start measurement.

The retained version uses about 283 MB / 536 MB in these runs, compared with
281 MB / 533 MB before the change. Check times vary between runs; instantiation
counts expose a measurable compiler-cost increase despite removing three hydrate
result generics. The recursive parent-context experiment cannot be accepted on
the strength of its Router result because the Start build fails.

## TypeScript 6 cross-check

Run the JavaScript compiler explicitly after rebuilding the selected version.
`--excludeTaskDependencies` limits this diagnostic command to the two consumers;
their dependencies must already have been built.

```sh
CI=1 NX_DAEMON=false pnpm nx exec \
  --projects=tanstack-router-react-example-large-file-based,tanstack-start-example-large \
  --excludeTaskDependencies -- \
  node "$PWD/node_modules/typescript/lib/tsc.js" --extendedDiagnostics
```

| Version                     | Router instantiations | Start instantiations |
| --------------------------- | --------------------: | -------------------: |
| Before phased result types  |               557,897 |            1,174,721 |
| Retained consolidated draft |               583,417 |            1,265,473 |
| Effective SSR calculation   |               586,110 |            1,268,828 |
| Final change                |                +5.06% |               +8.01% |

The baseline and candidate compile identical generated route sources against
fresh declarations. Their check times were 2.17 / 3.34 seconds and 1.83 / 3.36
seconds respectively. These single-run timings do not establish a speedup or
exclude a regression; the increased instantiation counts remain the primary
result. Logs: `baseline-large-ts6-isolated.log` and
`candidate-consolidated-large-ts6-isolated.log`.

After retaining the recursive thenable constraint, TypeScript 6 reported the same
583,417 / 1,265,473 instantiations. The final effective-SSR correction increases
those to 586,110 / 1,268,828. Its check times were 4.88 / 4.26 seconds; earlier
candidate runs were 1.83 / 3.36 seconds. TypeScript 7's final run checked in
0.411 / 0.735 seconds and used approximately 283 / 537 MB. Use instantiation
counts for the comparison; these timings vary substantially. The change has a
measurable compiler cost, and these workloads do not establish performance for
larger or differently shaped route trees. Final logs:
`candidate-large-effective-ssr.log` and
`candidate-effective-ssr-large-ts6-isolated.log`.

## Validation

- The affected package type targets pass across TypeScript 5.6–7. Vue Router's
  type target uses its Vitest inference suite. These checks preserve contextual
  parameters, required client fields, serializability errors, and async transforms.
- All 11 changed production TypeScript files emit identical JavaScript to their
  pre-change versions with comments removed. This change adds no client runtime
  or bundle code. Evidence: `emitted-code-comparison.json` in the log directory.
- Unit/inference checks, lint, and package export checks pass. Solid's chained
  unit target must run without `--typecheck.only`: its server suite has no type
  test files. The final full rerun passes both browser and server suites.
- Documentation link validation still reports the two existing missing example
  links in `production-checklist.md` and `tanstack-query.md`; changed pages pass.
- The maintainer resolved the loader-data read contract: parent components cannot
  depend on descendant data, since the descendant can still be pending. F12 is
  dismissed, and required client types remain unchanged. Registered-default and
  explicit override checks share an effective SSR calculation and pass their
  public regressions.

The temporary `(gen)` directories were removed after measurement. Normal Nx
builds regenerated both route trees back to their original nine-route state;
neither generated tree has a tracked diff. Re-run `gen` before repeating these
numbers. The exact measured route sources and hashes are archived under
`/tmp/pr6631-phase-types/generated-large-workloads/`.

## Inference experiments

- A direct `handler: F & Callable` loses contextual parameter inference and
  checks the default slot as `never`. Rejected.
- `ConstrainLiteral` preserves metadata for held functions, but alone loses the
  result of an inline generic helper chain beside a contextual hydrate callback.
- A whole-result `NoInfer` on the isomorphic builder's return preserves inference
  from its implementation callbacks. Both chaining orders pass. It does not
  change the callable server/client union.
- TypeScript can capture a held lifecycle object through the function/object
  option union. Normalize its handler when reading results. Callable entries
  keep their own implementation even if they also have a `handler` property.
- Phase regressions use separate TypeScript and Vitest projects in React,
  Solid, and Vue. Their `Register.ssr` and `Register.config` augmentations apply
  only to those programs. The normal program separately checks an unregistered
  SPA loader returning a function field. Before isolation, that public regression
  failed the SSR serializability check (`registration-isolation-red.log`).
  Each TypeScript 5.6–7 target checks both programs. Vue Start now runs its
  inference suite instead of its former placeholder unit command.
- New phase regressions compile against the actual Start helper in React,
  Solid, and Vue. They cover required client fields, server codec input,
  functional/inherited SSR policies, raw transport, held objects, inline chains,
  and serialization rejection. Compiler-cost reductions must preserve them.
