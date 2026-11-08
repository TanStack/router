/**
 * The pattern import a report names for a denied file a pattern brought
 * (`findPatternImport`, read from the importer's raw text), and the relative
 * specifier its suggested negative pattern uses.
 */
import { describe, expect, test } from 'vitest'
import {
  findPatternImport,
  relativeSpecifier,
} from '../../src/import-protection/pattern-imports'

const root = '/app'
const importer = '/app/src/routes/index.tsx'
const denied = '/app/src/routes/secret.server.ts'
const find = (text: string, file = denied, from = importer) =>
  findPatternImport(text, from, file, root)

describe('findPatternImport', () => {
  test('the literal glob matching the file, not an earlier one that does not', () => {
    const text = "import.meta.glob('./a/*.ts')\nimport.meta.glob('./*.ts')\n"
    expect(find(text)).toEqual({
      kind: 'import.meta.glob',
      offset: text.lastIndexOf('import.meta'),
      patterns: ['./*.ts'],
    })
  })

  test('a literal glob that provably misses the file is never named', () => {
    expect(find("import.meta.glob('./a/*.ts')\n")).toBeNull()
    expect(
      find("import.meta.glob(['./*.ts', '!./secret.server.ts'])\n"),
    ).toBeNull()
    // a glob it cannot read may have matched
    const text = "import.meta.glob('./a/*.ts')\nimport.meta.glob(patterns)\n"
    expect(find(text)).toEqual({
      kind: 'import.meta.glob',
      offset: text.lastIndexOf('import.meta'),
      patterns: null,
    })
  })

  test('type arguments, nested ones too', () => {
    for (const t of [
      '<string>',
      '<Record<string, X>>',
      '<() => X>',
      '<{ default: () => X }>',
    ]) {
      expect(find(`import.meta.glob${t}('./*.ts')\n`)?.patterns).toEqual([
        './*.ts',
      ])
    }
  })

  test('a call in a comment or a string is no call', () => {
    const text =
      "// import.meta.glob('./*.ts')\nconst s = \"import.meta.glob('./*.ts')\"\nimport.meta.glob('./*.server.ts')\n"
    expect(find(text)?.offset).toBe(text.lastIndexOf('import.meta'))
  })

  test('root-relative patterns, patterns above the importer, and directories with glob characters', () => {
    expect(find("import.meta.glob('/src/routes/*.ts')\n")?.patterns).toEqual([
      '/src/routes/*.ts',
    ])
    expect(
      find("import.meta.glob('../lib/*.ts')\n", '/app/src/lib/db.server.ts')
        ?.patterns,
    ).toEqual(['../lib/*.ts'])
    const grouped = '/app/src/routes/(auth)/index.tsx'
    const text = "import.meta.glob('./a/*.ts')\nimport.meta.glob('./*.ts')\n"
    expect(
      find(text, '/app/src/routes/(auth)/x.server.ts', grouped)?.offset,
    ).toBe(text.lastIndexOf('import.meta'))
  })

  test('aliases and a base option are patterns a negative pattern cannot extend: the call is named, its patterns are not', () => {
    expect(find("import.meta.glob('@/lib/*.ts')\n")).toMatchObject({
      patterns: null,
    })
    expect(
      find("import.meta.glob('./*.ts', { base: './sub' })\n"),
    ).toMatchObject({ patterns: null })
  })

  test('webpack contexts and import() with a variable path, with a magic comment or a concatenation', () => {
    expect(
      find("import.meta.webpackContext('./', { regExp: /\\.ts$/ })\n")?.kind,
    ).toBe('import.meta.webpackContext')
    expect(find("require.context('./', false, /\\.ts$/)\n")?.kind).toBe(
      'require.context',
    )
    expect(find('const m = (n) => import(`./${n}.ts`)\n')?.kind).toBe(
      'import()',
    )
    expect(
      find('const m = (n) => import(/* webpackChunkName: "x" */ `./${n}.ts`)\n')
        ?.kind,
    ).toBe('import()')
    expect(find("const m = (n) => import('./' + n)\n")?.kind).toBe('import()')
    expect(find("const m = () => import('./x.ts')\n")).toBeNull()
  })

  test('line endings and a second text are independent of the first', () => {
    const crlf = "const a = 1\r\nimport.meta.glob('./*.ts')\r\n"
    expect(find(crlf)?.offset).toBe(crlf.indexOf('import.meta'))
    expect(find("import.meta.glob('./*.ts')\n")?.offset).toBe(0)
  })
})

describe('relativeSpecifier', () => {
  test.each([
    ['/app/src/server/x.ts', '../server/x.ts'],
    ['/app/src/routes/a/x.ts', './a/x.ts'],
    ['/app/src/routes/.x.ts', './.x.ts'],
    ['/app/src/routes/..x.ts', './..x.ts'],
  ])('%s', (file, expected) => {
    expect(relativeSpecifier(importer, file)).toBe(expected)
  })
})
