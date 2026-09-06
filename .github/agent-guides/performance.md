# Performance review

Use this procedure for Router/Start performance audits and changes to runtime, memory, build, type-inference, or shipped-byte cost. Keep the requested scope; discovery does not authorize another fix or publication.

## Evidence and coverage

1. Pin the source revision and name the workload, metric, owning layer, and success condition. Reuse repository fixtures and installed tools. Attribute cost to code, configuration, a dependency, the toolchain, or the harness before choosing a fix; avoid speculative caches, indexes, concurrency, or dependency changes.
2. For multi-surface audits, keep a local coverage row per independently testable requirement: owner, source paths/revision, executed check, evidence, and unresolved boundary. Distinguish inventory/source review, executed mechanism, diagnostic control, verified implementation, and measured user impact. A checked package list does not establish exhaustive path coverage.
3. Establish a supported trigger and baseline before editing. Diagnostic counters must not create the work they claim to observe. Change one variable per control, check equivalent behavior, then run the same protocol on the final implementation. Use profiles or operation counts to explain timing, not a source-level suspicion as proof of a slowdown.
4. Independently inspect each material finding against its owning source and actual check. Promote proven regressions into existing behavioral tests or stable operation/artifact bounds; avoid noisy elapsed-time assertions. Preserve request isolation, side-effect ordering, required waits, and intentional cache/replay lifetimes.
5. Before completion, reconcile every coverage row with the original request. Report findings, rejected candidates, and remaining unverified or blocked surfaces. A diagnostic control is not a production fix; unavailable browser metrics, failed watch integration, or source-only adapter review remain explicit gaps.

### Finding capture

Keep non-blocking discoveries in the task's local evidence document. Give each a stable repository/symptom identity, supported trigger, expected/actual behavior, owning source/revision, measurement and limits, existing issue/PR, disposition, next check, and acceptance condition. Label unverified symptoms as observations. Search existing records and open/closed upstream work before creating a duplicate; distinguish an associated PR from a merged and currently verified fix.

Retain the reason when a finding is rejected or excluded by the user's scope. Capture unrelated evidence without fixing it, adding it to the active task, or posting externally. Resume the current work. A blocker or changed correctness risk must be reported rather than parked. Keep private task evidence and machine paths out of public guidance and PRs.

## Comparison provenance

Record baseline/candidate revisions, benchmark source and workload, runtime/tool versions, framework, adapter, build mode, cache state, runner mode, command, raw outputs, aggregation, and noise. Keep scenario selections and measurement flags identical. Use separate results/dist directories for concurrent tasks; avoid timing against unrelated active builds when possible and report remaining contention.

Separate three conclusions: the benchmark executed, its results are comparable, and the change caused the difference. Check the report's actual base, environment warnings, skipped cases, baseline substitutions, and logs/output artifacts. A successful job or cached result is not fresh execution evidence. Plain memory smoke runs do not supply CodSpeed memory metrics.

Report operation counts, retained bytes, CPU, elapsed time, throughput, initial payload, and later loading cost separately. Do not convert fewer calls into an unmeasured speedup, raw-byte changes into gzip savings, or a larger RSS sample into a leak. Read sample count, variance/error, and relevant percentiles together; narrow or rerun noisy cases before making a comparative claim.

## Build-tool checks

Use the actual adapter and installed compiler version. The official bundle runner covers Vite and explicit Rsbuild scenarios; a Webpack change also needs a real `@tanstack/router-plugin/webpack` consumer. Start's Vite/Rsbuild adapters, direct Rspack, and Router's Webpack adapter are distinct validation surfaces. Inspect existing E2E project scripts/configuration to select executable targets rather than assuming an aggregate benchmark exists.

For the changed mechanism, cover these boundaries:

| Boundary                  | Check                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build work                | Profile resolve/load, parse, analysis, reference/virtual/shared generation, maps, and emit separately. Include ignored files and no-transform routes. Check per-transform reuse and AST mutation ownership before introducing a persistent cache. Compare cold builds, warm builds, and no-op rebuilds.                                                 |
| Production diagnostics    | Distinguish build-host environment checks from conditions emitted into client code. Exercise production compiler mode with host `NODE_ENV` unset and production, plus development behavior. Check emitted diagnostics, absolute paths, and execution; production mode cannot erase an unconditional warning already generated by a plugin.              |
| Source maps               | Trace the actual loader chain and map consumer. Cover `devtool: false`, a source-map-enabled build, and incoming-map present/absent. Preserve source locations, `sourcesContent`, and downstream diagnostics; measure discarded map construction separately from JS output and wall time.                                                               |
| Metadata and assets       | Trace indexes, source text, CSS, and stats to their readers and enabling options. Verify disabled/enabled consumers and output equivalence before removing work. Avoid making a second index or capture that no consumer reads.                                                                                                                         |
| Identity and invalidation | Exercise independent compiler instances, concurrent builds, aliases/query variants, route edits/add/remove, shared dependency and configuration changes, and error recovery. Preserve watch dependencies, module identity, HMR state, and cleanup; unchanged inputs should avoid unnecessary work without hiding changed inputs.                        |
| Shipped graph             | Inspect resolved exports/entry conditions, ESM/CJS paths, module reasons, shared/async chunks, and concatenation bailouts. Verify unused code disappears while required CSS/global effects remain and shared modules initialize once. Measure initial and async payloads and execute navigation; do not infer all bundlers honor a Rolldown annotation. |

Use the same fixture/configuration for baseline and candidate; vary one option deliberately when isolating a cause. Validate annotation and loader behavior from the installed dependency source or matching official documentation. A snapshot or one-shot build cannot establish watch/HMR correctness. Restore fixture edits and close owned watchers/compilers after failures. An environment failure such as `EMFILE` is a coverage blocker, not a library performance finding.

Reference: Webpack's [build-performance](https://webpack.js.org/guides/build-performance/), [mode](https://webpack.js.org/configuration/mode/), and [tree-shaking](https://webpack.js.org/guides/tree-shaking/) documentation.

## Browser and server measurements

Verify the fixture before measuring: production versus development server, framework bootstrap/hydration support, native scheduling and browser capabilities, actual response consumption, and assertions that the intended path ran. A server-CPU fixture may not be a valid browser-hydration app. Release harness-owned routers, DOM references, console records, and request bodies before drawing retention conclusions; inspect reachability/retainers or repeated bounded workloads.

For changed hydration/RPC/streaming behavior, exercise real HTTP/browser consumption, later navigation, cancellation, errors, and disposal as applicable. Keep CPU, Router `onRendered`, hydration completion, presentation/INP, fetch attempts, transferred bytes, and throughput distinct. Name tested engines; Playwright WebKit is not branded Safari. Reuse working app bootstrap and error-checking fixtures, correct harness defects, and rerun before attributing a failure to the product.

## TypeScript cost

Use the repository typecheck/project-reference setup and a representative consumer route tree at increasing sizes. Keep TypeScript version, compiler configuration, fixture, and cold/warm state identical between implementations. Preserve inference assertions and record check time, compiler work, and memory where the installed compiler exposes them; report unavailable measurements. Do not pass individual source files to `tsc` and thereby bypass project configuration. A passing typecheck does not establish unchanged compiler/editor performance.

## Reviewing changes to this guidance

Check that a representative task reaches the right procedure, an unrelated task does not, and a failed or unavailable check remains explicit. For behavioral validation, replay bounded tasks with the guidance revision and record the host/tools, selected checks, actions, result, and human corrections. Link and text checks prove document structure only; skill availability or reviewer count does not prove the agent applied the procedure or made fewer mistakes.
