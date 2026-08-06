# Compact private frame-decoder result keys

## Principle

Shorten meaningful keys on private producer/consumer contracts while preserving descriptive names and the existing runtime data structure.

This change renames the private `createFrameDecoder` result from `{ getOrCreateStream, jsonChunks }` to `{ getStream, chunks }`. The producer and its sole production consumer change together. The result remains an ordinary two-property object.

## Scope and API boundary

- `createFrameDecoder` and `FrameDecoderResult` have one production reference, a relative import in `serverFnFetcher.ts`, plus direct tests.
- `src/client-rpc/index.ts` exports only `createClientRpc`.
- The package export map has no `frame-decoder` subpath.
- Public entry declarations contain neither symbol.
- The preserve-modules build emits an internal file, but package exports prevent consumers from importing it.

No public API, wire format, stream behavior, or error path changes.

## Bundle-size result

Exact clean artifacts:

- base `697ebb6ddbd433d052b6b4707938a5c595865d58`: `/private/tmp/frame-compact-base-full.json`
- candidate `23171792d50c0dd1312d02e5c8ad4325d4da3781`: `/private/tmp/frame-compact-candidate-full.json`

Before each matrix, an offline frozen install relinked dependencies to the intended worktree. All seven direct benchmark `@tanstack` links and all nine package-internal `start-client-core` links were verified before measurement.

| Scenario                         |   Raw | Initial gzip |  Gzip | Brotli |
| -------------------------------- | ----: | -----------: | ----: | -----: |
| react-router.minimal             |   0 B |          0 B |   0 B |    0 B |
| react-router.full                |   0 B |          0 B |   0 B |    0 B |
| solid-router.minimal             |   0 B |          0 B |   0 B |    0 B |
| solid-router.full                |   0 B |          0 B |   0 B |    0 B |
| vue-router.minimal               |   0 B |          0 B |   0 B |    0 B |
| vue-router.full                  |   0 B |          0 B |   0 B |    0 B |
| react-start.minimal              | -24 B |         -7 B |  -8 B | +207 B |
| react-start.deferred-hydration   | -24 B |         -9 B | -11 B |   +2 B |
| react-start.full                 | -24 B |         -6 B |  -8 B |  +60 B |
| react-start.rsbuild.minimal      | -24 B |         -9 B |  -9 B |  -26 B |
| react-start.rsbuild.minimal-iife | -24 B |        -10 B | -10 B |  +93 B |
| react-start.rsbuild.full         | -24 B |        -12 B | -12 B |  -56 B |
| solid-start.minimal              | -24 B |         -5 B |  -6 B |  +66 B |
| solid-start.deferred-hydration   | -24 B |         -7 B |  -7 B |  -33 B |
| solid-start.full                 | -24 B |         -8 B |  -9 B |  -53 B |
| vue-start.minimal                | -24 B |         -7 B |  -7 B | +188 B |
| vue-start.full                   | -24 B |         -6 B |  -4 B |  +48 B |

All eleven Start scenarios improve the primary gzip metric by 4–12 B and raw size by 24 B. The six router-only scenarios are byte-identical. Brotli is mixed and disclosed rather than used to select the candidate.

### Per-key attribution

Each producer/consumer key rename was independently applied to an exact-base worktree and measured with the official `react-start.minimal` scenario. Each attribution branch was committed before measurement so its artifact records a clean exact SHA. Before every run, an offline frozen install relinked dependencies and all seven benchmark links plus all nine package-internal `start-client-core` links were verified to resolve inside that run's worktree.

| Isolated change                    | Commit                                     |   Raw | Initial raw | Gzip | Initial gzip | Brotli | Initial Brotli |
| ---------------------------------- | ------------------------------------------ | ----: | ----------: | ---: | -----------: | -----: | -------------: |
| `getOrCreateStream` -> `getStream` | `8bf715221eacece8098ef894b16509a2ec8c846c` | -16 B |       -16 B | -6 B |         -4 B |  +80 B |          +82 B |
| `jsonChunks` -> `chunks`           | `5bf6808e9d7ba792fb3fba51fdc393c8a493424a` |  -8 B |        -8 B | -1 B |         -1 B |  +69 B |          +69 B |
| Final composition                  | `23171792d50c0dd1312d02e5c8ad4325d4da3781` | -24 B |       -24 B | -8 B |         -7 B | +207 B |         +207 B |

Both independent changes improve raw and primary gzip size, so both production hunks remain. Compressed deltas are not expected to add linearly; the final composition is the source of truth for publication.

Exact targeted artifacts:

- base: `/private/tmp/frame-key-base-react-start-minimal.json`
- `getStream` only: `/private/tmp/frame-get-stream-only-react-start-minimal.json`
- `chunks` only: `/private/tmp/frame-chunks-only-react-start-minimal.json`
- build logs: `/private/tmp/frame-key-base-react-start-minimal-build.log`, `/private/tmp/frame-get-stream-only-react-start-minimal-build.log`, and `/private/tmp/frame-chunks-only-react-start-minimal-build.log`
- recorded exact diffs: `/private/tmp/frame-get-stream-only.patch` and `/private/tmp/frame-chunks-only.patch`

## Runtime validation

Node 25.8.1 microbenchmarks exercised the full factory-return, destructure, and consume path. Five independent rounds each used 15 warmups, 25 paired samples of 800,000 operations, alternating AB/BA order, and periodic garbage collection.

Escaping-result paired median deltas by round were `+0.16%`, `-1.84%`, `-0.36%`, `+0.89%`, and `-0.82%`. A 4,096-slot retention variant produced `+4.28%`, `-1.51%`, `+1.21%`, `-0.73%`, and `-0.20%`. The distributions broadly overlap and show no directional effect, so the meaningful string-key rename is runtime-neutral.

The nearby numeric-key object variant was rejected before implementation: integer-index properties made escaping allocation roughly 95–123% slower across five rounds. A tuple variant was also rejected after showing a roughly 29% tight-loop slowdown.

## Validation

- focused frame-decoder unit suite: 19 passed with no Vitest type errors
- package type matrix: TypeScript 5.6, 5.7, 5.8, 5.9, 6.0, and 7.0 passed
- ESLint: no errors; 44 pre-existing warnings
- React Start Vite/SSR raw-stream client-RPC e2e: 6 passed in 10.4 seconds
- full 17-scenario bundle matrix: passed
- formatting and `git diff --check`: passed

The raw-stream e2e ran against the final candidate after verifying the React Start and `start-client-core` workspace links resolved inside the candidate worktree:

```sh
CI=1 NX_DAEMON=false pnpm nx run tanstack-react-start-e2e-basic:test:e2e--vite-ssr --outputStyle=stream --skipRemoteCache --skipNxCache -- tests/raw-stream.spec.ts --grep 'RawStream - Client RPC Tests'
```

All six client-RPC cases passed, covering single and multiple binary streams, both JSON/raw completion orders, a 3 KiB payload, and mixed Promise/RawStream delivery. The exact log is `/private/tmp/frame-compact-raw-stream-e2e.log` (SHA-256 `087a40354c5a638d6b40b07a6c047a0c2dda503d5bc1610a9d79fc762d3a77d8`).
