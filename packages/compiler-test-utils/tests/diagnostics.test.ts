/**
 * Controls of the diagnostic oracle (diagnostics.ts): it reads the real
 * channels (thrown errors of real transforms, console output, aggregated
 * build errors and warnings), accepts every spelling SPEC §5.7 frees (file
 * absolute or relative, any frame layout, 0- or 1-based columns, any prose)
 * and still rejects a diagnostic that names another file, another line or
 * not the API/option, or the wrong environment.
 */
import * as esbuild from 'esbuild'
import { transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import {
  captureConsole,
  captureThrow,
  diagnosticPosition,
  diagnosticsOf,
  envRestrictionError,
  expectDiagnostic,
  expectEnvRestrictionThrow,
  findDiagnostics,
  identifiesEnvRestriction,
  mentionsFile,
} from '../src/diagnostics'

const broken = `const a = 1
export const b = (
`

describe('real channels', () => {
  test('an Oxc parse error names the file and the line, whatever its path spelling', async () => {
    const diagnostics = await captureThrow(() =>
      transformWithOxc(broken, '/app/src/a.ts', { lang: 'ts' }),
    )
    expect(diagnostics).toHaveLength(1)
    expectDiagnostic(diagnostics, {
      severity: 'error',
      file: 'src/a.ts',
      root: '/app',
      position: { line: 2 },
    })
    expect(
      findDiagnostics(diagnostics, { file: 'src/a.ts', root: '/other' }),
    ).toEqual([])
    expect(
      findDiagnostics(diagnostics, {
        file: 'src/a.ts',
        root: '/app',
        position: { line: 1 },
      }),
    ).toEqual([])
  })

  test('an esbuild failure reads as one error with its structured location', async () => {
    const diagnostics = await captureThrow(() =>
      esbuild.transform(broken, { loader: 'ts', sourcefile: '/app/src/a.ts' }),
    )
    expectDiagnostic(diagnostics, {
      severity: 'error',
      file: '/app/src/a.ts',
      position: { line: 3, column: 1 },
      times: 1,
    })
  })

  test('captureThrow fails when the run completes', async () => {
    await expect(captureThrow(() => 'fine')).rejects.toThrow()
    await expect(captureThrow(() => Promise.resolve('fine'))).rejects.toThrow()
  })

  test('captureConsole reads console output by severity and restores the console', async () => {
    const before = console.warn
    const { result, diagnostics } = await captureConsole(() => {
      console.warn('[plugin] could not split `loader` in src/routes/a.tsx')
      console.error(new Error('broken'))
      console.info('done')
      return 'result'
    })
    expect(console.warn).toBe(before)
    expect(result).toBe('result')
    expect(diagnostics.map((diagnostic) => diagnostic.severity)).toEqual([
      'warning',
      'error',
      'info',
    ])
    expectDiagnostic(diagnostics, {
      severity: 'warning',
      file: 'src/routes/a.tsx',
      names: ['loader'],
      times: 1,
    })
  })

  test('overlapping captureConsole calls each get what is logged while they run, and the last one restores the console', async () => {
    const before = console.warn
    let releaseFirst!: () => void
    const first = captureConsole(async () => {
      console.warn('first only')
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      console.warn('after the second ended')
    })
    const second = await captureConsole(() => {
      console.warn('both')
    })
    expect(console.warn).not.toBe(before)
    releaseFirst()
    const { diagnostics } = await first
    expect(console.warn).toBe(before)
    expect(second.diagnostics.map((diagnostic) => diagnostic.text)).toEqual([
      'both',
    ])
    expect(diagnostics.map((diagnostic) => diagnostic.text)).toEqual([
      'first only',
      'both',
      'after the second ended',
    ])
  })

  test('an aggregated build error is one error; its warnings and a result’s messages are their own', () => {
    const failure = Object.assign(
      new Error('vite build failed:\nsrc/a.ts (2:3): Unexpected token'),
      {
        errors: ['src/a.ts (2:3): Unexpected token'],
        warnings: ['src/b.ts: a warning'],
      },
    )
    expect(diagnosticsOf(failure).map(({ severity }) => severity)).toEqual([
      'error',
      'warning',
    ])
    expect(
      diagnosticsOf({ warnings: ['one', 'two'], errors: [] }).map(
        ({ severity }) => severity,
      ),
    ).toEqual(['warning', 'warning'])
    expectDiagnostic(diagnosticsOf(failure), {
      severity: 'warning',
      file: 'src/b.ts',
    })
  })

  test('Rollup-style locations count with 0-based columns', () => {
    const [diagnostic] = diagnosticsOf(
      {
        message: 'Use of eval is strongly discouraged',
        id: '/app/src/a.ts',
        loc: { file: '/app/src/a.ts', line: 4, column: 2 },
      },
      'warning',
    )
    expectDiagnostic(diagnostic!, {
      severity: 'warning',
      file: 'src/a.ts',
      root: '/app',
      position: { line: 4, column: 3 },
    })
  })
})

describe('files', () => {
  const file = 'src/routes/posts.tsx'
  const root = '/app'
  test.each([
    '/app/src/routes/posts.tsx',
    'file:///app/src/routes/posts.tsx',
    '/@fs/app/src/routes/posts.tsx',
    'src/routes/posts.tsx',
    './src/routes/posts.tsx',
    '../../app/src/routes/posts.tsx',
    'routes/posts.tsx',
    'posts.tsx',
    'src\\routes\\posts.tsx',
    'webpack://my-app/./src/routes/posts.tsx',
    '/app/src/routes/posts.tsx?tsr-split=component',
    '"/app/src/routes/posts.tsx"',
    'in src/routes/posts.tsx.',
  ])('accepts %s', (spelling) => {
    expect(mentionsFile(`warning: ${spelling}`, file, { root })).toBe(true)
  })

  test.each([
    '/other/src/routes/posts.tsx',
    'src/routes/posts.tsx.bak',
    'src/routes/myposts.tsx',
    'src/routes/blog/posts.tsx',
    'a sentence about posts',
  ])('rejects %s', (spelling) => {
    expect(mentionsFile(`warning: ${spelling}`, file, { root })).toBe(false)
  })

  test('a spelling that also names another file is ambiguous', () => {
    const distinctFrom = ['src/routes/blog/posts.tsx']
    expect(mentionsFile('in posts.tsx', file, { root, distinctFrom })).toBe(
      false,
    )
    expect(
      mentionsFile('in routes/posts.tsx', file, { root, distinctFrom }),
    ).toBe(true)
    expect(
      mentionsFile('in blog/posts.tsx', file, { root, distinctFrom }),
    ).toBe(false)
  })

  test('without a root, a relative file matches trailing segments either way', () => {
    expect(mentionsFile('/tmp/x/src/a.ts:1:1', 'src/a.ts')).toBe(true)
    expect(mentionsFile('a.ts', 'src/a.ts')).toBe(true)
    expect(mentionsFile('/tmp/x/src/b.ts', 'src/a.ts')).toBe(false)
  })
})

describe('positions', () => {
  const source = `import { a } from './a'
export const value = a(
  createServerFn().handler(() => 1),
)
`
  const position = diagnosticPosition(source, 'createServerFn')

  test('diagnosticPosition gives a 1-based line and column, counting every line terminator', () => {
    expect(position).toEqual({ line: 3, column: 3 })
    expect(diagnosticPosition('a\r\nb\rc\u2028d\u2029e', 'e')).toEqual({
      line: 5,
      column: 1,
    })
  })

  test.each([
    ['file:line:column', 'src/a.ts:3:3: nested server fn'],
    ['0-based column', 'src/a.ts:3:2: nested server fn'],
    ['file(line,column)', 'src/a.ts(3,3): nested server fn'],
    ['webpack location', 'ERROR in ./src/a.ts 3:2-16'],
    ['Babel location', 'src/a.ts: nested server fn (3:2)'],
    ['words', 'src/a.ts, line 3, column 3: nested server fn'],
    [
      'Babel code frame',
      `src/a.ts: nested server fn
  2 | export const value = a(
> 3 |   createServerFn().handler(() => 1),
    |   ^^^^^^^^^^^^^^
  4 | )`,
    ],
    [
      'Babel code frame inside a report box (Rspack)',
      `./src/a.ts:   × Module build failed:
  ╰─▶   × Error:    2 | export const value = a(
        │ >  3 |   createServerFn().handler(() => 1),
        │      |   ^^^^^^^^^^^^^^ nested server fn
        │    4 | )`,
    ],
    [
      'unmarked frame with a caret line',
      `src/a.ts
2  |  export const value = a(
3  |    createServerFn().handler(() => 1),
   |    ^
4  |  )`,
    ],
  ])('accepts a %s', (_, text) => {
    expectDiagnostic(text, { file: 'src/a.ts', position, source })
  })

  test.each([
    ['another line', 'src/a.ts:2:3: nested server fn'],
    ['another column', 'src/a.ts:3:9: nested server fn'],
    ['a position of another file', 'src/b.ts:3:3 and src/a.ts'],
    [
      'a context line of a frame',
      `src/a.ts
> 2 | export const value = a(
  3 |   createServerFn().handler(() => 1),`,
    ],
    [
      'a caret under another column',
      `src/a.ts
  2 | export const value = a(
> 3 |   createServerFn().handler(() => 1),
    |                    ^`,
    ],
  ])('rejects %s', (_, text) => {
    expect(
      findDiagnostics(diagnosticsOf(text), {
        file: 'src/a.ts',
        position,
        source,
      }),
    ).toEqual([])
  })

  test('without a column, a frame line marked with > is enough', () => {
    expectDiagnostic(`src/a.ts\n> 3 | createServerFn()`, {
      file: 'src/a.ts',
      position: { line: 3 },
    })
  })
})

describe('names, severity and counts', () => {
  test('names match whole identifiers only', () => {
    expect(
      findDiagnostics('`loaderDeps` of src/a.tsx', {
        names: ['loader'],
      }),
    ).toEqual([])
    expectDiagnostic('`loader` of src/a.tsx stays in the route', {
      names: ['loader'],
      file: 'src/a.tsx',
    })
  })

  test('times counts the matching diagnostics exactly', () => {
    const warnings = diagnosticsOf(['src/a.tsx: loader', 'src/a.tsx: loader'])
    expectDiagnostic(warnings, { file: 'src/a.tsx', times: 2 })
    expect(() =>
      expectDiagnostic(warnings, { file: 'src/a.tsx', times: 1 }),
    ).toThrow()
  })

  test('the failure lists each diagnostic with why it does not match', () => {
    expect(() =>
      expectDiagnostic(diagnosticsOf('src/b.tsx', 'warning'), {
        severity: 'error',
        file: 'src/a.tsx',
      }),
    ).toThrow(/#0 \[warning\] severity warning, expected error; does not name/)
  })
})

describe('environment restrictions', () => {
  const thrower = (error: unknown) => () => {
    throw error
  }

  test.each([
    'createServerOnlyFn() functions can only be called on the server!',
    'createServerOnlyFn() is restricted to the server; move this call to the server environment.',
    'This function is server-only.',
  ])('accepts any prose naming the server: %s', (message) => {
    expect(identifiesEnvRestriction(new Error(message), 'server')).toBe(true)
    expectEnvRestrictionThrow(thrower(new Error(message)), 'server')
    expect({ value: new Error(message) }).toEqual({
      value: envRestrictionError('server'),
    })
  })

  test('the client may be called the browser', () => {
    expectEnvRestrictionThrow(
      thrower(new Error('only callable in the browser')),
      'client',
    )
  })

  test.each([
    ['the other environment', new Error('only callable on the client')],
    [
      'an engine crash',
      new TypeError("Cannot read properties of undefined (reading 'server')"),
    ],
    ['a thrown string', 'server only'],
  ])('rejects %s', (_, error) => {
    expect(identifiesEnvRestriction(error, 'server')).toBe(false)
    expect(() => expectEnvRestrictionThrow(thrower(error), 'server')).toThrow()
  })

  test('fails when the call returns', () => {
    expect(() => expectEnvRestrictionThrow(() => 'value', 'server')).toThrow()
  })

  test('a returned promise must reject with the restriction', async () => {
    await expectEnvRestrictionThrow(
      () => Promise.reject(new Error('server only')),
      'server',
    )
    await expect(
      expectEnvRestrictionThrow(() => Promise.resolve(1), 'server'),
    ).rejects.toThrow()
  })
})
