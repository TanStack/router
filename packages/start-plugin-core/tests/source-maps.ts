/**
 * Reads the source map of a compiled module through the shared consumer
 * (`@tanstack/compiler-test-utils/source-maps`, `@jridgewell/trace-mapping`).
 * Re-exported by `regression-helpers.ts`.
 */
import {
  offsetAt,
  originalPositions,
} from '@tanstack/compiler-test-utils/source-maps'
import type { SourceMapInput } from '@tanstack/compiler-test-utils/source-maps'
import type { StartCompilerTransformResult } from '../src/types'

/**
 * Where in `source` the children a chunk renders come from: the start of the
 * outermost `<Hydrate>` element of `source` that contains the code the
 * chunk maps back to (through its source map), or `Infinity`.
 */
export function chunkBoundaryStart(
  chunk: StartCompilerTransformResult,
  source: string,
  boundaries: Array<{ start: number; end: number }>,
) {
  if (typeof chunk.map?.mappings !== 'string') {
    return Infinity
  }
  let start = Infinity
  for (const position of originalPositions(chunk.map as SourceMapInput)) {
    let offset: number
    try {
      offset = offsetAt(source, position)
    } catch {
      continue
    }
    const boundary = boundaries.find(
      (range) => range.start <= offset && offset < range.end,
    )
    if (boundary) {
      start = Math.min(start, boundary.start)
    }
  }
  return start
}
