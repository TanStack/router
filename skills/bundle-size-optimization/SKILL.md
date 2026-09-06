---
name: bundle-size-optimization
description: Use when working in this repository on JS bundle size, gzip regressions, benchmark scenarios, source attribution, treeshaking, dead code elimination, or bundler annotations, including Webpack.
---

# Bundle Size Optimization

## Overview

Optimize measured client bundles, not source text. The source of truth is `@benchmarks/bundle-size:build`, `benchmarks/bundle-size/results/current.json`, and emitted JS in `benchmarks/bundle-size/dist/`.
Use `benchmark:bundle-size:run` for local iterations. It uses the same measurement script and builds the selected packages through Nx.

The full measurement, attribution, and regression workflow applies within the accepted change scope. Optimize that change without acquiring unrelated work; larger architectural changes require matching user authority. Preserve others' edits and obtain explicit authorization for commits/pushes. Baseline comparison does not require committing or stashing the working implementation.

For audits, comparison provenance, build-time cost, and adapter-specific verification, follow the [performance review guide](../../.github/agent-guides/performance.md). The official runner does not include Webpack: changes affecting that adapter or shared splitting/DCE also require its real-consumer checks. Do not substitute a Vite/Rsbuild result for Webpack evidence.

## Commands

| Need                       | Command                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full benchmark             | `pnpm benchmark:bundle-size:run`                                                                                                                                                            |
| Save baseline              | `pnpm benchmark:bundle-size:run --name baseline --scenario react-router.minimal`                                                                                                            |
| Measure and compare        | `pnpm benchmark:bundle-size:run --baseline baseline --scenario react-router.minimal`                                                                                                        |
| Save a candidate           | `pnpm benchmark:bundle-size:run --name candidate --baseline baseline --scenario react-router.minimal`                                                                                       |
| Test, measure, compare     | `pnpm benchmark:bundle-size:run --baseline baseline --scenario react-router.minimal --test-projects @tanstack/router-core,@tanstack/react-router -- tests/path.test.ts tests/link.test.tsx` |
| Read result                | `pnpm benchmark:bundle-size:query --id react-router.minimal`                                                                                                                                |
| Compare existing results   | `pnpm benchmark:bundle-size:diff --baseline ./baseline.json --id react-router.minimal`                                                                                                      |
| History deltas             | `git fetch --quiet origin gh-pages && pnpm benchmark:bundle-size:history --id react-router.minimal --top-deltas 20`                                                                         |
| Collect source attribution | `pnpm benchmark:bundle-size:run --scenario react-router.minimal --analysis`                                                                                                                 |
| Read source attribution    | `pnpm benchmark:bundle-size:analyze --id react-router.minimal`                                                                                                                              |
| Symbol refs                | `pnpm ts:symbol-references -- --project packages/router-core/tsconfig.json --file packages/router-core/src/utils.ts --symbol last`                                                          |

Named runs save metrics and logs in `benchmarks/bundle-size/results/runs/<name>/`. Existing named results cannot be overwritten.
Without `--name`, runs replace `results/current.json` and the logs for the steps they run.
`--baseline` accepts a run name or a JSON file path. `--results-dir <dir>` changes the results root for the current and named runs.
Emitted bundles still use `dist/` unless `--dist-dir` specifies another directory.
For named results, pass `--current benchmarks/bundle-size/results/runs/<name>/current.json` to the query, diff, or analysis tools.

## Rules

- Run one Nx command at a time.
- Use the runner instead of shell chains for environment variables, redirection, exit codes, log tails, and result queries.
- For agent runs, use `pnpm --silent benchmark:bundle-size:run ...` to omit the package-manager command echo.
- The runner sets `CI=1` and `NX_DAEMON=false`. It saves full output in `tests.log` and `measure.log` beside `current.json`.
- If a step fails, the runner stops and prints at most 40 log lines, limited to 8,000 characters. Read the reported log for more detail.
- Quiet stdout does not indicate an Nx hang. Inspect the reported log for progress before applying the Nx reset/retry guardrail.
- Use `--test-projects` for the packages that changed. Pass unit-test file selectors and flags after `--`.
- The runner does not select tests automatically. Keep type tests, performance benchmarks, and e2e tests separate.
- Keep baseline and candidate scenario selections and measurement flags identical. Use a new `--name` for each retained snapshot.
- Do not add `--skip-package-builds` after package source changes. The default rebuilds through Nx and preserves valid package caches.
- Track `gzipBytes` first; also inspect `initialGzipBytes`, `rawBytes`, `brotliBytes`, `jsFiles`, and per-file `files`.
- Dist paths use `scenarioDir`/`outDir`, not metric ids: `react-router.minimal` maps to `dist/react-router-minimal/`.
- For tiny changes, measure after each candidate; gzip can move opposite raw bytes.
- To compare a base commit, measure the same scenario in a separate worktree. Pass its saved `current.json` path to `--baseline`.
- Use history for prior patterns and baselines, not source attribution. It is commit-level data.
- Runtime performance and security may never be sacrificed for bundle size.
- Do not stop after the first verified win. Keep iterating through reasonable local, emitted-JS, and algorithmic candidates until measured regressions, readability, or risk rule out the remaining paths.
- When inlining helpers or simplifying non-obvious logic, preserve readability with a short comment explaining the meaning/invariant, not the mechanics.
- Before inlining or deleting a helper/function, use the TypeScript language-service script to check references: `pnpm ts:symbol-references -- --project <package>/tsconfig.json --file <decl-file> --symbol <name>`. If the helper is used elsewhere, inlining one use is usually not worth it for bundle size unless measurement proves otherwise. If no references remain, delete the helper and verify with the script.
- Run unit/types tests for the package being modified plus relevant e2e tests under `e2e/`.
- Continue optimizing until further reductions would make code unreadable/unmaintainable, or no more reductions remain. A user-provided byte target is not required.
- Be willing to make large, risky architectural or algorithmic changes, but only within the runtime, security, readability, maintainability, and test constraints above.
- If you are unsure whether to land a passing change because runtime semantics might change, add unit/e2e tests and/or ask clarifying questions. If codebase exploration can answer the question, explore instead. For each question, provide your recommended answer.
- If runtime performance implications are unclear, add a focused Vitest benchmark (`*.bench.ts`) comparing candidate implementations across realistic and edge-case inputs, like `packages/router-core/tests/closing-tag-detection.bench.ts`; verify implementations produce identical results before `bench()` cases.
- If you learn a reusable bundle-size pattern, hit a tooling gap, or lack analysis capability, ask the user before updating this skill or the benchmark scripts.

## Benchmark Rules

- During iteration, pick one bundle-size scenario that is most likely to contain the changed code. Use `react-router.minimal` for router-core and react-router changes by default; use `solid-router.minimal` for solid-router changes, `vue-router.minimal` for vue-router changes, `react-start.minimal` or `react-start.rsbuild.minimal` for React Start changes, and `solid-start.minimal` for Solid Start changes.
- Override the default targeted scenario when code is only pulled into a fuller scenario. For example, if a hook/function is referenced only by `solid-router.full`, iterate on `solid-router.full` instead of `solid-router.minimal`.
- If a change can affect several package families, pick the smallest scenario that imports the shared code for quick iteration, then spot-check the next most likely affected family before finalizing.
- Before finalizing, run the full bundle-size benchmark without `--scenario` and compare all scenarios. Look for outliers/anomalies even when the targeted scenario improved.
- Benchmark the changed mechanism directly, not just the public API around it.
- Confirm the affected code survives into the measured scenario. If stock scenarios omit an optional feature such as deferred hydration or RSC, add a focused supported consumer and report its cost separately; unchanged stock totals do not establish zero cost for that feature.
- For runtime/vendor chunk layout changes, follow the [chunk caching and deployment checks](../../.github/agent-guides/performance.md#chunk-caching-and-deployment-recovery). Report cold-load cost separately from repeat-deployment savings; a favorable transfer result does not establish faster loading.
- Keep broad realistic scenarios as smoke/regression coverage; use focused cases for proof.
- Compare baseline and current with the same benchmark file. Use a separate worktree when only implementation should differ.
- Run noisy benchmark families separately with `-t <pattern>`; all-in-one suites can perturb tiny operations.
- For branchy fast paths, include best-case, worst-case, and expected mixed distributions.
- Batch ultra-fast operations inside one benchmark iteration when single calls are dominated by timer/outlier noise.
- Read `hz`, `mean`, `p99`/`p999`, `rme`, and samples together. Do not trust one noisy `hz` value.
- Treat high `rme` or large p999 outliers as directional only; rerun narrower cases before deciding.
- Name cases after the behavior under test so future readers know what result matters.
- Verify correctness before timed cases so benchmarks do not measure invalid or dead paths.

## Attribution Round

Before calling an optimization final, prove which exact production hunks should remain:

1. Snapshot the unoptimized baseline and the full candidate metrics.
2. Split the production diff into logical hunks or dependent hunk groups. Include syntax-only and readability-only edits if they can affect emitted code.
3. Benchmark each independent hunk alone against the same baseline. Benchmark relevant combinations when hunks only matter together or interact.
4. For each hunk/group, record bundle metrics and focused performance results when runtime cost could change.
5. Keep only changes that improve bundle size or performance, or are required for correctness/tests/style and do not regress measured results. Revert neutral or harmful optimization-only changes.
6. Rebuild and remeasure the final composed version. It must not be larger or slower than the pre-attribution candidate unless the retained change is explicitly required for correctness or style.

## Optimization Loop

1. Measure the baseline scenario with `--name baseline`.
2. Inspect diff, emitted JS, per-file sizes, and analysis sources if needed.
3. Analyze the algorithm before syntax. Identify redundant loops, duplicate branches, repeated scans/slices/lowercasing, allocation-heavy paths, search order, and data-shape choices.
4. Make the smallest behavior-preserving algorithmic edit that removes work or code shape first; use syntax-only edits only after algorithmic candidates are exhausted.
5. Re-measure with `--baseline baseline` and keep only proven wins.
6. Run package unit/types, relevant e2e, and `git diff --check`.
7. Run the attribution round, then the post-optimization coverage/perf workflow before finalizing.

## Algorithmic Pass

For hot files, split the code into phases and optimize each phase by work removed, not characters removed:

- Parsing/scanning: prefer one pass over helper scans plus substring allocation; keep offsets into source strings when possible.
- Tree/building: fuse identical node-creation branches when the data shape is shared; cache repeated route/options fields in locals.
- Matching/search: preserve priority order, but merge candidate loops only when stack push order stays identical; avoid allocation in suffix/prefix checks unless correctness needs it.
- Extraction/validation: compute params lazily and carry state only where needed; do not reuse partial params across skipped/pathless branches unless covered by tests.
- Sorting/scoring: replace helper calls and comparator ladders only when measured and still readable.
- Sorting/tree post-processing: if a full tree walk only sorts sparse child arrays, record arrays when they become sortable (length reaches 2) during construction, then sort the recorded arrays once.

After each candidate, run focused perf benchmarks before bundle measurement. Reject wins that hide runtime regressions or make invariants hard to audit.

## Post-Optimization Coverage/Perf Workflow

When done optimizing:

1. Review the optimization diff against existing tests for missing behavior cases, newly uncovered edge cases, and performance coverage. Use independent reviewers for bounded questions when the task permits and the host supports them; reconcile their findings against source and checks. Without reviewers, perform a separate review pass and state that independence was not verified.
2. If a possible regression is unclear, ask the user or explore the codebase until the expected behavior is clear.
3. Use the review findings to add focused unit tests and benchmarks.
4. Prepare isolated baseline and candidate worktrees/snapshots with the same tests and benchmark harness, differing only in the implementation under comparison. Build each snapshot's dependencies through Nx; use separate results/dist paths and preserve the working checkout.
5. Run tests, performance benchmarks, and the relevant bundle-size measurement on the baseline, then write BEFORE results and revision/environment details to local `RESULT-optimization-{topic}.md`.
6. Run the same checks on the candidate, then append AFTER results to the same file. Keep raw outputs and identify skipped/cached checks. Publish task evidence only when requested.
7. When reviewing benchmark output, consider statistical quality: standard deviation, margin of error, variance/noise, sample count, and percentiles. Re-run or narrow conclusions when results are noisy.
8. Compare BEFORE and AFTER. If anything regressed, iterate within the accepted scope or revert the task-owned regression. Recheck the final composed implementation after changes.

Useful patterns: remove prod-only strings, remove unused exports, flatten wrappers, inline one-use helpers, avoid duplicate literals, improve treeshaking boundaries, simplify branches after preserving behavior.

## DCE And Annotations

Rolldown removes code only when unused and side-effect-free. Property reads may trigger getters; storage/global access can observe or throw.

Validate annotation support and emitted effects with the installed bundler/minifier. For Webpack, use the [shipped-graph checks](../../.github/agent-guides/performance.md#build-tool-checks), including unused-import removal, required CSS/global effects, and one-time initialization across eager/lazy chunks.

| Annotation                                | Valid                                                                       | Unsafe                                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `/* @__PURE__ */ call()`                  | immediately before a call/new expression whose unused result can be dropped | declarations, property reads, setup, storage, DOM/history/listener code            |
| `/* @__NO_SIDE_EFFECTS__ */ function f()` | every call of the function is side-effect-free                              | functions touching globals, storage, DOM, history, subscriptions, warnings, caches |
| `sideEffects`/module flags                | module has no import-time effects when unused                               | CSS, polyfills, storage hydration, DOM/history setup                               |

## Red Flags

- Using package `test:build` as a size proxy.
- Trusting source bytes or raw bytes instead of measured `gzipBytes`.
- Inspecting `dist/<metric-id>` instead of `dist/<scenarioDir>`.
- Adding DCE annotations to effectful code because the byte target is small.
- Skipping behavior or benchmark tests because the change is “only bundle size.”
- Skipping hunk-level attribution and keeping changes only because the full candidate improved.
- Trading runtime performance, security, readability, or maintainability for bytes.
