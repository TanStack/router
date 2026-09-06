# Benchmarks

Read the relevant README before running benchmarks. Compare baseline and candidate with the same workload and production builds; add a focused case when existing scenarios miss the changed mechanism. Keep workloads and benchmark names stable for historical comparisons.

| Changed behavior                           | Guide                              | Nx project                                               |
| ------------------------------------------ | ---------------------------------- | -------------------------------------------------------- |
| Standalone Router navigation/rendering CPU | [client-nav](client-nav/README.md) | `@benchmarks/client-nav`                                 |
| Start request/SSR CPU                      | [ssr](ssr/README.md)               | `@benchmarks/ssr`                                        |
| Client/server retention and allocations    | [memory](memory/README.md)         | `@benchmarks/memory-client`, `@benchmarks/memory-server` |

Use `test:perf:<react|solid|vue>` through Nx. Plain memory runs only smoke-test; memory metrics require CodSpeed. Client navigation benchmarks do not cover Start hydration or client server-function calls.

For build/compiler work, follow the [build-tool checks](../.github/agent-guides/performance.md#build-tool-checks); there is no aggregate build-CPU benchmark in the table above. For inference cost, use the [TypeScript measurement procedure](../.github/agent-guides/performance.md#typescript-cost). For hydration, RPC, paint, or real HTTP behavior, use the affected browser/app workload and validate its [fixture and metric boundaries](../.github/agent-guides/performance.md#browser-and-server-measurements).

Before interpreting CodSpeed or local results, record the [comparison provenance](../.github/agent-guides/performance.md#comparison-provenance). Successful execution, comparable results, and causation are separate conclusions; skipped or baseline-substituted cases do not count as fresh candidate evidence.

For bundle-size work, follow the full optimization skill required by the root guide. Full API fixtures are maintained manually: when public hooks/components change, update matching `bundle-size/scenarios/*-full/src/routes/__root.tsx` fixtures. Save baseline results separately because each run overwrites `bundle-size/results/current.json`; report final gzip deltas and explain remaining growth.

The official bundle runner covers Vite and explicit Rsbuild scenarios, not Webpack. For changes affecting the Webpack adapter or shared splitting/DCE behavior, also measure a real `@tanstack/router-plugin/webpack` consumer using the build-tool checks. Do not describe the official matrix as coverage of every bundler.
