/**
 * Where import protection reports the use of a denied import in a module
 * that the Start compiler compiled, the way the plugins look it up: the
 * module is compiled for `output` by the real Start compiler, and the
 * compiled code, its source map and the original code go to
 * `findOriginalUsageLocation`, the lookup the plugins call for a module whose
 * denied import survived compilation.
 */
import { findOriginalUsageLocation } from '../../src/import-protection/sourceLocation'
import { compileFor } from '../regression-helpers'
import type { Output } from '../regression-helpers'
import type {
  SourceMapLike,
  TransformResultProvider,
} from '../../src/import-protection/sourceLocation'

const id = '/test/src/module.tsx'

/**
 * The reported location of the use of `source` in `code` compiled for
 * `output` (1-based line and column in `code`), or `undefined` when no use is
 * reported (e.g. every use is inside code the compiler removes).
 */
export async function usageLocation(
  code: string,
  output: Output,
  source = 'denied',
): Promise<{ line: number; column: number } | undefined> {
  const compiled = await compileFor(output, code, { id })
  const provider: TransformResultProvider = {
    getTransformResult: () => ({
      code: compiled.code ?? code,
      map: (compiled.map ?? undefined) as SourceMapLike | undefined,
      originalCode: code,
    }),
  }
  const location = findOriginalUsageLocation(
    provider,
    id,
    source,
    output === 'client' ? 'client' : 'server',
  )
  return location && { line: location.line, column: location.column }
}

/** Location of the first `needle` on 1-based line `line` of `code`. */
export function locationOf(code: string, line: number, needle: string) {
  const column = code.split('\n')[line - 1]!.indexOf(needle)
  if (column === -1) {
    throw new Error(`${needle} is not on line ${line}`)
  }
  return { line, column: column + 1 }
}
