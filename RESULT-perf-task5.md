# RESULT — perf/task5-stream-byte-passthrough

## Goal

Eliminate the UTF-8 decode → scan → re-encode round trip in the SSR stream
transformer (`transformStreamWithRouter`, main path). Previously every app
chunk was decoded to a JS string (`TextDecoder`), scanned for closing tags /
the barrier marker, then re-encoded (`TextEncoder`) at enqueue time. The
optimization keeps app bytes as raw `Uint8Array` end-to-end.

## Design

- **Byte-level scanner** (`findHtmlBoundaryBytes`): direct port of
  `findHtmlBoundary` operating on `Uint8Array`. Legal because closing tags and
  tag names are pure ASCII, and no multi-byte UTF-8 sequence contains a byte
  `< 0x80`, so byte-level matching can neither produce false positives inside
  multi-byte characters nor split them.
- **Pending body buffer**: raw bytes not yet emitted downstream (replaces the
  `leftover` string + `pendingTail` string). Grows geometrically, compacts via
  `copyWithin`. Emission is always a `.slice()` copy, so upstream-owned buffers
  are never aliased into our output queue. String chunks (rare; some upstreams)
  are encoded directly into the buffer with `encodeInto`.
- **Barrier-marker scan on written ranges only** (`scanWrittenPrefixForMarker`
  + `byteRangeContains`): preserves the old semantics of marking the barrier ID
  "seen" only once its bytes have actually been flushed downstream (lifting the
  barrier earlier could let injections land inside the marker script tag). The
  search window is rewound by `needle.length - 1` bytes per flush so a marker
  split across two *written* ranges is now detected too (previously missed by
  the old per-chunk `String.includes`).
- **Output queue polymorphism**: `pendingWrites: Array<string | Uint8Array>`.
  Router HTML still arrives/queues as strings (encoded at enqueue time); app
  bytes enqueue verbatim. Backpressure accounting (`MAX_PENDING_WRITE_CHARS`)
  now mixes chars and bytes — an approximate bound, acceptable for a safety cap.
- Tail capture (`</body>` onward), leftover bounds (`MAX_LEFTOVER_CHARS`),
  tail bounds (`MAX_TAIL_CHARS`), finish ordering (leftover → router HTML →
  tail) are byte-for-byte ports of the previous logic.

## Multibyte correctness argument

1. UTF-8 guarantees: lead bytes are `0xC2–0xF4`, continuation bytes
   `0x80–0xBF`. Every ASCII byte (`< 0x80`) encodes to itself and appears
   **only** as itself. Hence:
   - scanning for ASCII patterns (`</`, `>`, tag-name charset, barrier ID)
     never matches a byte inside a multi-byte sequence;
   - slicing/emitting at closing-tag boundaries (ASCII positions) can never
     cut a multi-byte character;
   - compaction (`copyWithin`) and append (`set`) are byte-exact moves.
2. Split-across-chunk sequences are safe because nothing is decoded: chunks are
   concatenated as raw bytes in `pendingBody`; a sequence split across reads is
   simply contiguous bytes by the time any boundary decision is made.
3. String chunks use `encodeInto` with capacity `3 * length + 1` ≥ max UTF-8
   size (surrogate pair = 2 code units ≤ 6 bytes); `encodeInto` never splits
   surrogate pairs.
4. Regression test added: `'é'` (2 B) and `'🎉'` (4 B) each split mid-sequence
   across chunk boundaries round-trip byte-identically.

## Audit findings & fixes made during this session

- **Bug fixed**: in the `</body>` branch, `state = MergeState.HoldingTail` was
  set *before* `emitBodyPrefix(bodyEndIndex, /* scanMarker */ true)`, but the
  marker scan is gated on `state < HoldingTail`. If the marker script and
  `</body>` completed in the same upstream chunk, the marker was never marked
  seen and `liftScriptBarrier()` never fired (router scripts silently dropped).
  Fixed by emitting/scanning while still in `ReadingBody`, then transitioning
  state; regression test added (`detects barrier marker arriving in the same
  chunk as </body>`).
- **Lint fix**: removed two unnecessary `as Uint8Array` casts in
  `appendToPendingBody`.
- **Type fix in bench fake**: `takeBufferedHtml` needed an explicit
  `string | undefined` return type.
- Verified equivalent-to-old behavior for: closing tags split across chunks,
  injection immediately after barrier lift at a boundary, MAX_LEFTOVER forced
  flushes, no-`</body>` termination ordering (leftover before injected HTML,
  tail last), and out-of-bounds reads in the byte scanner (return `undefined`,
  failing all comparisons).

## Benchmarks

Node v22, vitest bench, Linux. Baseline = same bench files against stashed
original implementation. Full runs saved at `/tmp/opencode/bench-before.txt`
and `/tmp/opencode/bench-after.txt`.

### End-to-end transform throughput (`transformStreamWithRouter.bench.ts`)

| Scenario | Before | After | Δ |
|---|---:|---:|---:|
| Large body passthrough (~2 MB, 256×8 KB chunks) | 385 ops/s | 423 ops/s | **+9.9%** |
| Small body with frequent injections | 12,424 ops/s | 18,864 ops/s | **+51.8%** |
| Fast path passthrough (control, unchanged code) | 7,023 ops/s | 7,396 ops/s | +5.3% (noise) |

### Boundary scanner micro-benches (`closing-tag-detection.bench.ts`, new section)

| Scenario | String impl | Byte impl | Δ |
|---|---:|---:|---:|
| Small chunk (~70 B), last-closing-tag scan | 26.7 M ops/s | 28.3 M ops/s | +6% |
| Medium chunk (~1.5 KB), lazy boundary scan | 0.94 M ops/s | 1.50 M ops/s | **+60%** |
| Medium chunk (~1.5 KB), last-closing-tag scan | 26.8 M ops/s | 28.7 M ops/s | +7% |
| Large chunk w/o `</body>` (~13 KB), lazy boundary scan | 126 K ops/s | 198 K ops/s | **+57%** |
| Large chunk w/o `</body>` (~13 KB), last-closing-tag scan | 26.7 M ops/s | 28.5 M ops/s | +7% |

The byte-level implementations were cross-verified against the string
implementations over 14 generated/adversarial cases at bench-module load time
(`verifyByteImplementations()` asserts identical results).

## Verification status

- `pnpm nx run @tanstack/router-core:test:unit` — **pass**
  (106 files, 1610 passed / 3 expected fail; includes 4 new tests)
- `pnpm nx run @tanstack/router-core:test:eslint` — **pass**
- `pnpm nx run @tanstack/router-core:test:types` — **pass**
- Prettier check on changed files — **clean**
