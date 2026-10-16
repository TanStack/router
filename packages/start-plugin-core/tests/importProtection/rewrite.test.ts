import { createModuleGraph } from '@tanstack/compiler-test-utils/module-linker'
import { SourceMapConsumer } from 'source-map'
import { describe, expect, test } from 'vitest'
import { rewriteDeniedImports } from '../../src/import-protection/rewrite'
import type { RawSourceMap } from 'source-map'

const MOCK_SUBSTR = 'tanstack-start-import-protection:mock'

function rewrite(code: string, denied: Array<string>): string {
  const result = rewriteDeniedImports(code, '/test.ts', new Set(denied))
  expect(result).toBeDefined()
  return result!.code.trim()
}

function expectMockImport(out: string, varName: string): void {
  expect(out).toContain(MOCK_SUBSTR)
  expect(out).toMatch(new RegExp(`import ${varName} from`))
}

/** A mock whose members are `<prefix><name>`. */
function prefixMock(prefix: string) {
  return new Proxy(
    {},
    {
      get: (_, key) => (typeof key === 'string' ? prefix + key : undefined),
    },
  )
}

/**
 * Rewrites the denied imports of `code` (module `id`) to a mock module per
 * denied source, then evaluates it as a real ES module with the project
 * modules `files`: the mock of each source has the members `mock:<name>`, or
 * those of `mocks[source]`. Returns the module's namespace and the graph.
 */
async function evaluateRewritten(
  code: string,
  denied: Array<string>,
  options: {
    id?: string
    files?: Record<string, string>
    mocks?: Record<string, object>
  } = {},
) {
  const id = options.id ?? '/test/module.ts'
  const rewritten = rewriteDeniedImports(
    code,
    id,
    new Set(denied),
    (source) => `mock-of:${source}`,
  )
  expect(rewritten).toBeDefined()
  const graph = createModuleGraph({
    modules: { ...options.files, [id]: rewritten!.code },
    stubs: Object.fromEntries(
      denied.map((source) => [
        `mock-of:${source}`,
        { default: options.mocks?.[source] ?? prefixMock('mock:') },
      ]),
    ),
  })
  return { module: await graph.import(id), graph }
}

describe('rewriteDeniedImports', () => {
  test('rewrites named imports', () => {
    const out = rewrite(`import { foo, bar } from './secret.server';`, [
      './secret.server',
    ])
    expectMockImport(out, '__tss_deny_0')
    expect(out).toContain('const foo = __tss_deny_0.foo')
    expect(out).toContain('const bar = __tss_deny_0.bar')
    expect(out).not.toContain('./secret.server')
  })

  test('rewrites default import', () => {
    const out = rewrite(`import secret from './secret.server';`, [
      './secret.server',
    ])
    expectMockImport(out, '__tss_deny_0')
    expect(out).toContain('const secret = __tss_deny_0')
    expect(out).not.toContain('./secret.server')
  })

  test('rewrites namespace import', () => {
    const out = rewrite(`import * as ns from './secret.server';`, [
      './secret.server',
    ])
    expectMockImport(out, '__tss_deny_0')
    expect(out).toContain('const ns = __tss_deny_0')
    expect(out).not.toContain('./secret.server')
  })

  test('rewrites aliased named import', () => {
    const out = rewrite(`import { foo as myFoo } from './secret.server';`, [
      './secret.server',
    ])
    expect(out).toContain('const myFoo = __tss_deny_0.foo')
  })

  test('rewrites mixed default + named imports', () => {
    const out = rewrite(`import def, { a, b } from './secret.server';`, [
      './secret.server',
    ])
    expect(out).toContain('const def = __tss_deny_0')
    expect(out).toContain('const a = __tss_deny_0.a')
    expect(out).toContain('const b = __tss_deny_0.b')
  })

  test('skips type-only import declaration', () => {
    const result = rewriteDeniedImports(
      `import type { Foo } from './secret.server';`,
      '/test.ts',
      new Set(['./secret.server']),
    )
    expect(result).toBeUndefined()
  })

  test('skips type-only specifiers but rewrites value specifiers', () => {
    const out = rewrite(`import { type Foo, bar } from './secret.server';`, [
      './secret.server',
    ])
    expect(out).toContain('const bar = __tss_deny_0.bar')
    expect(out).not.toContain('const Foo')
  })

  test('rewrites export { x } from "denied"', () => {
    const out = rewrite(`export { foo, bar } from './secret.server';`, [
      './secret.server',
    ])
    expectMockImport(out, '__tss_deny_0')
    expect(out).toContain('const __tss_reexport_foo = __tss_deny_0.foo')
    expect(out).toContain('const __tss_reexport_bar = __tss_deny_0.bar')
    expect(out).toMatch(/export\s*\{/)
    expect(out).toContain('__tss_reexport_foo as foo')
    expect(out).toContain('__tss_reexport_bar as bar')
    expect(out).not.toContain('./secret.server')
  })

  test('rewrites aliased re-export', () => {
    const out = rewrite(`export { foo as myFoo } from './secret.server';`, [
      './secret.server',
    ])
    expect(out).toContain('const __tss_reexport_foo = __tss_deny_0.foo')
    expect(out).toContain('__tss_reexport_foo as myFoo')
  })

  test('rewrites string-literal import names with computed access', () => {
    const out = rewrite(
      `import { "foo-bar" as fooBar } from './secret.server';`,
      ['./secret.server'],
    )
    expect(out).toContain('const fooBar = __tss_deny_0["foo-bar"]')
  })

  test('rewrites string-literal re-export names with computed access', () => {
    const out = rewrite(
      `export { "foo-bar" as exposed } from './secret.server';`,
      ['./secret.server'],
    )
    expect(out).toContain('const __tss_reexport_0 = __tss_deny_0["foo-bar"]')
    expect(out).toContain('__tss_reexport_0 as exposed')
  })

  // Loosened: the names `export *` re-exports from a denied module are not
  // mocked (see the dev-server goal pin in known-bugs-dev-server.test.ts);
  // the module still evaluates without loading the denied module.
  test('a module with `export * from` a denied module evaluates without it', async () => {
    const { module, graph } = await evaluateRewritten(
      `export * from './secret.server';\nexport const x = 1;`,
      ['./secret.server'],
      { files: { '/test/secret.server.ts': `export const secret = 1` } },
    )
    expect(module.x).toBe(1)
    expect(graph.evaluated).not.toContain('/test/secret.server.ts')
  })

  test('returns undefined when no denied imports are found', () => {
    const result = rewriteDeniedImports(
      `import { ok } from './safe';\nimport { also } from './fine';`,
      '/test.ts',
      new Set(['./secret.server']),
    )
    expect(result).toBeUndefined()
  })

  test('imports that are not denied keep their real values', async () => {
    const { module } = await evaluateRewritten(
      `import { safe } from './ok'
import { secret } from './secret.server'
export const values = [safe, secret]`,
      ['./secret.server'],
      { files: { '/test/ok.ts': `export const safe = 'real'` } },
    )
    expect(module.values).toEqual(['real', 'mock:secret'])
  })

  test('each denied source gets its own mock', async () => {
    const { module } = await evaluateRewritten(
      `import { a } from './server-a'
import { b } from './server-b'
export const values = [a, b]`,
      ['./server-a', './server-b'],
      {
        mocks: {
          './server-a': prefixMock('A:'),
          './server-b': prefixMock('B:'),
        },
      },
    )
    expect(module.values).toEqual(['A:a', 'B:b'])
  })

  test('the source map maps code after a rewritten import back to its origin', async () => {
    const result = rewriteDeniedImports(
      `import { foo } from './secret.server'
const unrelated = 1
export const used = foo + unrelated`,
      '/test.ts',
      new Set(['./secret.server']),
    )
    const lines = result!.code.split('\n')
    const line = lines.findIndex((text) => text.includes('used = foo')) + 1
    const consumer = await new SourceMapConsumer(
      result!.map as unknown as RawSourceMap,
    )
    try {
      expect(
        consumer.originalPositionFor({
          line,
          column: lines[line - 1]!.indexOf('foo +'),
        }),
      ).toMatchObject({ line: 3, column: 'export const used = '.length })
    } finally {
      consumer.destroy()
    }
  })

  test('skips type-only export declaration', () => {
    const result = rewriteDeniedImports(
      `export type { Foo } from './secret.server';`,
      '/test.ts',
      new Set(['./secret.server']),
    )
    expect(result).toBeUndefined()
  })

  test('skips type-only export * from denied', () => {
    const result = rewriteDeniedImports(
      `export type * from './secret.server';`,
      '/test.ts',
      new Set(['./secret.server']),
    )
    expect(result).toBeUndefined()
  })

  // Source: TanStack/router#7341. In a `.ts` module, `<T>value` is a type
  // assertion and `<T>(value: T) => value` a generic arrow function, not JSX.
  test('rewrites a .ts module with angle-bracket type assertions', async () => {
    const { module } = await evaluateRewritten(
      `import { secret } from './secret.server'
const identity = <T>(value: T) => value
export const seen = <string>identity(<unknown>secret)
`,
      ['./secret.server'],
    )
    expect(module.seen).toBe('mock:secret')
  })

  test('rewritten modules evaluate with mock values for every specifier form', async () => {
    const { module } = await evaluateRewritten(
      `import 'denied'
import def, { type T, value, value as renamed, "kebab-name" as kebab } from 'denied' with { type: 'json' }
import * as ns from 'denied'
export { type U, reexported, reexported as aliased, reexported as "string export", "a-b" as ab } from 'denied'
export { default as renamedDefault } from 'denied'
export const seen: T = [def === ns, value, renamed, kebab] as unknown as T
`,
      ['denied'],
    )
    expect({ ...module }).toEqual({
      seen: [true, 'mock:value', 'mock:value', 'mock:kebab-name'],
      reexported: 'mock:reexported',
      aliased: 'mock:reexported',
      'string export': 'mock:reexported',
      ab: 'mock:a-b',
      renamedDefault: 'mock:default',
    })
  })

  // Bug: the rewrite names the import of the mock `__tss_deny_<n>` without
  // checking the names the module declares.
  // Impact: once one of its imports is denied, a module that declares such a
  // name fails to compile (duplicate declaration), or, when a TypeScript
  // transform elides the shadowed import (as here), reads its own binding
  // instead of the mock.
  // Source: PR #8504 (rewrite.test.ts "does not reuse a name the module
  // declares for the mock import"), found by mutation testing.
  test.fails(
    'a module declaring the name of the mock import evaluates',
    async () => {
      const { module } = await evaluateRewritten(
        `const __tss_deny_0 = 'mine'
import { foo } from './secret.server'
export const both = [foo, __tss_deny_0]`,
        ['./secret.server'],
      )
      expect(module.both).toEqual(['mock:foo', 'mine'])
    },
  )
})
