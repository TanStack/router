import { transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import {
  findOriginalUnsafeUsagePosFromResult,
  findPostCompileUsagePosFromResult,
  getImportSourcesFromResult,
  getImportSpecifierLocationFromResult,
  getMockExportNamesBySource,
  getNamedExports,
} from '../../src/import-protection/analysis'
import { rewriteDeniedImports } from '../../src/import-protection/rewrite'
import {
  ImportLocCache,
  addTraceImportLocations,
  createImportSpecifierLocationIndex,
  findImportStatementLocationFromTransformed,
  findOriginalUsageLocation,
  findPostCompileUsageLocation,
} from '../../src/import-protection/sourceLocation'
import type { TransformResult } from '../../src/import-protection/sourceLocation'

function result(code: string, filename?: string): TransformResult {
  return { code, filename, map: undefined, originalCode: undefined }
}

/** 1-based line and 0-based column of the first `needle` after `from`. */
function positionOf(code: string, needle: string, from = 0) {
  const index = code.indexOf(needle, from)
  const before = code.slice(0, index).split('\n')
  return { line: before.length, column0: before.at(-1)!.length }
}

describe('import protection analysis edge cases', () => {
  test('default and namespace specifiers collect member names and usages', () => {
    const code = `import secret, * as ns from 'denied'
export function f(other) { return other.notCollected }
export const value = secret.read + ns.write
`
    expect(getMockExportNamesBySource(code, 'f.ts').get('denied')).toEqual([
      'read',
      'write',
    ])
    expect(
      findPostCompileUsagePosFromResult(result(code, 'f.ts'), 'denied'),
    ).toEqual(positionOf(code, 'secret.read'))
  })

  test('re-export forms are import sources with a specifier location', () => {
    const code = `export * as ns from 'denied-a'
export { default } from 'denied-b'
export { default as Named, other } from 'denied-c'
export type { OnlyType } from 'denied-d'
`
    const source = result(code, 'f.ts')
    expect(getImportSourcesFromResult(source)).toEqual([
      'denied-a',
      'denied-b',
      'denied-c',
    ])
    for (const specifier of ['denied-a', 'denied-b', 'denied-c']) {
      expect(getImportSpecifierLocationFromResult(source, specifier)).toBe(
        code.indexOf(specifier),
      )
    }
    expect(getImportSpecifierLocationFromResult(source, 'denied-d')).toBe(-1)
    expect(getNamedExports(code, 'f.ts')).toEqual(['Named', 'other'])
    expect(getMockExportNamesBySource(code, 'f.ts').get('denied-c')).toEqual([
      'other',
    ])
  })

  test('compiler-safe boundaries follow member-call chains and naming conventions', () => {
    const code = `import { secret } from 'denied'
export const a = createServerFn({ method: 'GET' }).validator((d) => d).handler(async () => secret())
export const b = myServerFn.handler(() => secret())
export const c = authMiddleware.server(() => secret())
export const d = createIsomorphicFn().server(() => secret()).client(() => secret())
export const e = ns.createServerFn().handler(() => secret())
`
    const source = result(code, 'f.ts')
    // In the client, the isomorphic client branch is the first unsafe usage;
    // the namespaced factory is not a known boundary either.
    expect(
      findOriginalUnsafeUsagePosFromResult(source, 'denied', 'client'),
    ).toEqual(positionOf(code, 'secret()', code.indexOf('.client(')))
    expect(
      findOriginalUnsafeUsagePosFromResult(
        result(code.replace('.client(() => secret())', ''), 'f.ts'),
        'denied',
        'client',
      ),
    ).toEqual(positionOf(code, 'secret()', code.indexOf('export const e')))
    // In the server, only the isomorphic client branch is a boundary, so the
    // first usage wins; repeated lookups use the per-result cache.
    const serverPos = positionOf(code, 'secret()')
    expect(
      findOriginalUnsafeUsagePosFromResult(source, 'denied', 'server'),
    ).toEqual(serverPos)
    expect(
      findOriginalUnsafeUsagePosFromResult(source, 'denied', 'server'),
    ).toEqual(serverPos)
    expect(findPostCompileUsagePosFromResult(source, 'denied')).toEqual(
      serverPos,
    )
  })

  test('usage positions are UTF-16 columns after astral characters, tabs and CRLF', () => {
    const code =
      "import { secret } from 'denied'\r\n" +
      '// 👨‍👩‍👧 𝒳𝒴 日本語\r\n' +
      "\tconst label = '🎉'; const value = secret()\r\n"
    expect(findPostCompileUsagePosFromResult(result(code), 'denied')).toEqual({
      line: 3,
      column0: "\tconst label = '🎉'; const value = ".length,
    })
  })
})

describe('import protection source locations through a real source map', () => {
  const original = `// ünïcödé 👨‍👩‍👧 comment
import type { Shape } from './types'
import { getSecret } from './secret.server'
interface Props { shape: Shape }
export const Page = ({ shape }: Props) => <div title="é">{getSecret(shape)}</div>
`
  const file = '/root/src/page.tsx'

  async function transformed() {
    const output = await transformWithOxc(original, file, {
      jsx: 'preserve',
      sourcemap: true,
    })
    return {
      code: output.code,
      map: {
        ...output.map!,
        file: undefined,
        sourceRoot: '/root/',
        sources: ['src/page.tsx'],
        sourcesContent: [original],
      },
      originalCode: undefined,
      filename: file,
    } satisfies TransformResult
  }

  test('maps import and usage locations back to the original source', async () => {
    const res = await transformed()
    const provider = { getTransformResult: () => res }
    const cache = new ImportLocCache()
    const index = createImportSpecifierLocationIndex()
    const find = (r: TransformResult, s: string) => index.find(r, s)

    const importLine = 3
    expect(
      await findImportStatementLocationFromTransformed(
        provider,
        file,
        './secret.server',
        cache,
        find,
      ),
    ).toMatchObject({ file, line: importLine })
    // A second lookup is served from the cache.
    expect(cache.has(`${file}::./secret.server`)).toBe(true)

    const usage = positionOf(original, 'getSecret(shape)')
    expect(
      await findPostCompileUsageLocation(provider, file, './secret.server'),
    ).toEqual({ file, line: usage.line, column: usage.column0 + 1 })
    expect(
      findOriginalUsageLocation(
        provider,
        file,
        './secret.server',
        'client',
        '/root',
      ),
    ).toEqual({ file, line: usage.line, column: usage.column0 + 1 })

    const trace: Array<{
      file: string
      specifier?: string
      line?: number
      column?: number
    }> = [
      { file: '/root/src/entry.tsx' },
      { file, specifier: './secret.server' },
      { file, specifier: './types', line: 1, column: 1 },
    ]
    await addTraceImportLocations(provider, trace, cache, find)
    expect(trace[0]).toEqual({ file: '/root/src/entry.tsx' })
    expect(trace[1]).toMatchObject({ line: importLine })
    expect(trace[2]).toMatchObject({ line: 1, column: 1 })
  })

  test('returns undefined for sources that are only imported as types', async () => {
    const res = await transformed()
    const provider = { getTransformResult: () => res }
    const index = createImportSpecifierLocationIndex()
    expect(
      await findImportStatementLocationFromTransformed(
        provider,
        file,
        './types',
        new ImportLocCache(),
        (r, s) => index.find(r, s),
      ),
    ).toBeUndefined()
  })
})

describe('rewriteDeniedImports runtime semantics', () => {
  const mockModule = `data:text/javascript,${encodeURIComponent(
    `export default new Proxy({}, { get: (_, key) => typeof key === 'string' ? 'mock:' + key : undefined })`,
  )}`

  async function evaluate(code: string, denied: Array<string>) {
    const rewritten = rewriteDeniedImports(
      code,
      '/test/module.ts',
      new Set(denied),
      () => mockModule,
    )
    expect(rewritten).toBeDefined()
    const { code: javascript } = await transformWithOxc(
      rewritten!.code,
      'module.ts',
    )
    return (await import(
      /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(javascript)}`
    )) as Record<string, unknown>
  }

  test('mixed type and value specifiers, attributes and string-literal names', async () => {
    const exports = await evaluate(
      `import 'denied'
import def, { type T, value, "kebab-name" as kebab } from 'denied' with { type: 'json' }
import * as ns from 'denied'
export { type U, reexported, reexported as "string export", "a-b" as ab } from 'denied'
export { default as renamedDefault } from 'denied'
export const seen: T = [def === ns, value, kebab] as unknown as T
`,
      ['denied'],
    )
    expect({ ...exports }).toEqual({
      seen: [true, 'mock:value', 'mock:kebab-name'],
      reexported: 'mock:reexported',
      'string export': 'mock:reexported',
      ab: 'mock:a-b',
      renamedDefault: 'mock:default',
    })
  })
})
