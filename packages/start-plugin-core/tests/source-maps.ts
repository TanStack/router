/**
 * Reads the source map of a compiled module: the original position of a
 * generated one. Re-exported by `regression-helpers.ts`.
 */
import type { StartCompilerTransformResult } from '../src/types'

const base64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** The original (0-based) line and column of each source map segment. */
function originalPositions(mappings: string) {
  const positions: Array<[line: number, column: number]> = []
  let line = 0
  let column = 0
  for (const segment of mappings.split(/[;,]/)) {
    const values: Array<number> = []
    let value = 0
    let shift = 0
    for (const char of segment) {
      const digit = base64.indexOf(char)
      value += (digit & 31) << shift
      if (digit & 32) {
        shift += 5
      } else {
        values.push(value & 1 ? -(value >>> 1) : value >>> 1)
        value = 0
        shift = 0
      }
    }
    if (values.length >= 4) {
      line += values[2]!
      column += values[3]!
      positions.push([line, column])
    }
  }
  return positions
}

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
  const mappings = chunk.map?.mappings
  if (typeof mappings !== 'string') {
    return Infinity
  }
  const lineStarts = [0]
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\n') {
      lineStarts.push(index + 1)
    }
  }
  let start = Infinity
  for (const [line, column] of originalPositions(mappings)) {
    const offset = (lineStarts[line] ?? Infinity) + column
    const boundary = boundaries.find(
      (range) => range.start <= offset && offset < range.end,
    )
    if (boundary) {
      start = Math.min(start, boundary.start)
    }
  }
  return start
}
