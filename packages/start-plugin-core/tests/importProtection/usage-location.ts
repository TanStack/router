/**
 * Where import protection reports the use of a denied import in a module
 * that the Start compiler compiled, the way the Vite plugin does
 * (`resolveImporterLocation` in `src/vite/import-protection-plugin/plugin.ts`):
 * the module is compiled for `output` by the real Start compiler; a module
 * whose compiled code no longer imports the denied source has no violation
 * (the edge does not survive compilation); otherwise the violation is reported
 * at the first of: the use found in the compiled code mapped back through its
 * source map (`findPostCompileUsageLocation`), the unsafe use found in the
 * original code (`findOriginalUsageLocation`), the import statement.
 *
 * The Rsbuild adapter tries the two usage lookups in the opposite order; this
 * harness follows Vite. reported-location.test.ts reads the location real
 * Vite and Rsbuild apps report.
 */
import {
  ImportLocCache,
  createImportSpecifierLocationIndex,
  findImportStatementLocationFromTransformed,
  findOriginalUsageLocation,
  findPostCompileUsageLocation,
} from '../../src/import-protection/sourceLocation'
import { compileFor, importSources } from '../regression-helpers'
import type { Output } from '../regression-helpers'
import type {
  SourceMapLike,
  TransformResultProvider,
} from '../../src/import-protection/sourceLocation'

const id = '/test/src/module.tsx'

/**
 * The reported location of the violation for `source` in `code` compiled for
 * `output` (1-based line and column in `code`), or `undefined` when no
 * violation is reported because the compiled code no longer imports `source`
 * (e.g. every use is inside code the compiler removes).
 */
export async function usageLocation(
  code: string,
  output: Output,
  source = 'denied',
): Promise<{ line: number; column: number } | undefined> {
  const compiled = await compileFor(output, code, { id })
  const compiledCode = compiled.code ?? code
  if (!importSources(compiledCode).includes(source)) {
    return undefined
  }
  const provider: TransformResultProvider = {
    getTransformResult: () => ({
      code: compiledCode,
      map: (compiled.map ?? undefined) as SourceMapLike | undefined,
      originalCode: code,
    }),
  }
  const location =
    (await findPostCompileUsageLocation(provider, id, source)) ||
    findOriginalUsageLocation(
      provider,
      id,
      source,
      output === 'client' ? 'client' : 'server',
    ) ||
    (await findImportStatementLocationFromTransformed(
      provider,
      id,
      source,
      new ImportLocCache(),
      createImportSpecifierLocationIndex().find,
    ))
  if (!location) {
    throw new Error(`No location for the surviving import of ${source}`)
  }
  return { line: location.line, column: location.column }
}

/** Location of the first `needle` on 1-based line `line` of `code`. */
export function locationOf(code: string, line: number, needle: string) {
  const column = code.split('\n')[line - 1]!.indexOf(needle)
  if (column === -1) {
    throw new Error(`${needle} is not on line ${line}`)
  }
  return { line, column: column + 1 }
}
