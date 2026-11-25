/**
 * Controls of the diagnostic collection (diagnostics.ts) on real channels:
 * thrown errors of real transforms, console output, aggregated build errors
 * and warnings, each read with the file and position it names.
 */
import * as esbuild from 'esbuild'
import { transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import {
  captureConsole,
  captureThrow,
  diagnosticsOf,
  expectDiagnostic,
  expectNoDiagnostic,
  findDiagnostics,
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
      times: 1,
    })
  })

  test('overlapping captureConsole calls keep their own output and restore the console', async () => {
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
      console.warn('second only')
    })
    expect(console.warn).not.toBe(before)
    releaseFirst()
    const { diagnostics } = await first
    expect(console.warn).toBe(before)
    expect(second.diagnostics.map((diagnostic) => diagnostic.text)).toEqual([
      'second only',
    ])
    expect(diagnostics.map((diagnostic) => diagnostic.text)).toEqual([
      'first only',
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

  test('a captured diagnostic keeps its own severity, also among the warnings an error carries', () => {
    const consoleError = {
      severity: 'error' as const,
      text: 'src/b.ts: logged as an error',
      raw: 'src/b.ts: logged as an error',
      source: 'console' as const,
    }
    const failure = Object.assign(new Error('vite build failed'), {
      errors: ['src/a.ts (2:3): Unexpected token'],
      warnings: [consoleError],
    })
    expect(diagnosticsOf([consoleError], 'warning')).toEqual([consoleError])
    expect(diagnosticsOf(failure).map(({ severity }) => severity)).toEqual([
      'error',
      'error',
    ])
    expect(
      findDiagnostics(failure, { severity: 'warning', file: 'src/b.ts' }),
    ).toEqual([])
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

/** A warning whose text is `text`. */
const warning = (text: string) => [
  { severity: 'warning' as const, text, raw: text },
]

// The spellings tools print (Vite, Rolldown, webpack and Rspack, browsers,
// Node), each read as naming `/app/src/a.ts` or not, and positions read as
// that file's or another's. Source: the X1 review probes (Fable's spelling
// table, Astra's boundaries).
describe('spellings', () => {
  const root = '/app'
  const a = { file: 'src/a.ts', root }
  const at = (line: number, column?: number) => ({
    ...a,
    position: column === undefined ? { line } : { line, column },
  })
  test.each([
    ['relative', 'warning in src/a.ts:3:5 bad', a, true],
    ['dot-relative', 'warning in ./src/a.ts:3:5 bad', a, true],
    ['absolute', 'warning in /app/src/a.ts:3:5 bad', a, true],
    ['Vite /@fs/ path', 'Failed to load /@fs/app/src/a.ts:3:5', a, true],
    [
      'browser URL of /@fs/',
      'at http://localhost:5173/@fs/app/src/a.ts:3:5',
      a,
      true,
    ],
    [
      'webpack-internal',
      'at eval (webpack-internal:///./src/a.ts:3:5)',
      a,
      true,
    ],
    ['webpack:// source', 'webpack://app/./src/a.ts:3:5', a, true],
    [
      'loader chain',
      'builtin:swc-loader??ruleSet[1].rules[2].use[0]!./src/a.ts 3:5-9',
      a,
      true,
    ],
    ['Rspack box', ' × bad\n  ╭─[src/a.ts:3:5]\n 3 │ x', a, true],
    [
      'Rspack box, absolute',
      ' × bad\n  ╭─[/app/src/a.ts:3:5]\n 3 │ x',
      a,
      true,
    ],
    ['stack frame', 'Error: x\n    at f (/app/src/a.ts:3:5)', a, true],
    ['file URL', 'Error: x\n    at f (file:///app/src/a.ts:3:5)', a, true],
    ['TypeScript style', 'src/a.ts(3,5): error TS1', a, true],
    ['quoted', 'Cannot split "src/a.ts".', a, true],
    ['backticks', 'Cannot split `/app/src/a.ts`', a, true],
    ['query', 'in /app/src/a.ts?tsr-split=component:3:5', a, true],
    ['./ inside an absolute path', 'in /app/./src/a.ts', a, true],
    [
      'Windows',
      'in C:\\app\\src\\a.ts:3:5',
      { file: 'src/a.ts', root: 'C:/app' },
      true,
    ],
    ['virtual prefix', 'in \0virtual:/app/src/a.ts', a, true],
    ['id=', 'id=/app/src/a.ts', a, true],
    ['tool prefix', 'vite:oxc:/app/src/a.ts:3:5', a, true],
    ['sentence', 'Fix src/a.ts.', a, true],
    ['ellipsis', 'Fix src/a.ts...', a, true],
    ['comma list', 'files: src/a.ts,src/b.ts', a, true],
    ['arrow list', 'src/b.ts->src/a.ts', a, true],
    [
      'a space in the name',
      'in src/routes/my route.ts:8:1',
      {
        file: 'src/routes/my route.ts',
        root,
        position: { line: 8, column: 1 },
      },
      true,
    ],
    [
      'a space in a directory',
      'in /app/my dir/a.ts:8:1',
      { file: '/app/my dir/a.ts', position: { line: 8, column: 1 } },
      true,
    ],
    [
      'a space, relative to an absolute file',
      'in src/my dir/a.ts:8:1',
      { file: '/app/src/my dir/a.ts', position: { line: 8, column: 1 } },
      true,
    ],
    ['~ alias', 'in ~/src/a.ts', a, false],
    ['joined by +', 'src/b.ts+src/a.ts', a, false],
    ['under another root', 'in /other/app/src/a.ts', a, false],
    [
      'under another group',
      'in /other/(group)/app/src/a.ts',
      { file: '/app/src/a.ts' },
      false,
    ],
    ['.tsx', 'in src/a.tsx', a, false],
    ['.map', 'in src/a.ts.map', a, false],
    [
      'another group',
      'in src/routes/(other)/login.tsx',
      { file: 'src/routes/(auth)/login.tsx', root },
      false,
    ],
    ['another directory', 'in lib/src/a.ts', a, false],
    [
      'group route',
      'in src/routes/(auth)/login.tsx:3:5',
      { file: 'src/routes/(auth)/login.tsx', root },
      true,
    ],
    [
      'param route',
      'in src/routes/[id]/a.tsx:3:5',
      { file: 'src/routes/[id]/a.tsx', root },
      true,
    ],
    [
      '$param in parentheses',
      'bad (src/routes/$id.tsx:3:5)',
      { file: 'src/routes/$id.tsx', root },
      true,
    ],
    [
      'group in parentheses',
      'bad (src/routes/(auth)/login.tsx:3:5)',
      { file: 'src/routes/(auth)/login.tsx', root },
      true,
    ],
    [
      'group in brackets',
      '╭─[src/routes/(auth)/login.tsx:3:5]',
      { file: 'src/routes/(auth)/login.tsx', root },
      true,
    ],
    ['its position', 'src/a.ts:3:5', at(3, 5), true],
    [
      'a later file’s position',
      'src/a.ts imports src/b.ts:3:5',
      at(3, 5),
      false,
    ],
    [
      'a later bare file’s position',
      'src/a.ts imports b.ts:3:5',
      at(3, 5),
      false,
    ],
    [
      'a later bare file’s position, on its line',
      'src/a.ts:2:2\nimported from index.ts:8:1',
      at(8, 1),
      false,
    ],
    [
      'a package file’s position',
      'src/a.ts imports react (node_modules/react/index.js:3:5)',
      at(3, 5),
      false,
    ],
    [
      'a later file’s position, no extension',
      'src/a.ts: see src/routes/__root:3:5',
      at(3, 5),
      false,
    ],
    [
      'its position after another file’s',
      'src/a.ts\n  trace: src/b.ts:9:9\n  at src/a.ts:3:5',
      at(3, 5),
      true,
    ],
    [
      'its position, another file’s frame after',
      'src/a.ts:3:5\n> 9 | x\n at src/b.ts:9:1',
      at(3, 5),
      true,
    ],
    [
      'another file’s code frame',
      'src/a.ts imports src/b.ts\n> 3 | bad',
      at(3),
      false,
    ],
    [
      'its code frame before its location',
      'Unexpected token\n> 3 | bad\n/app/src/a.ts:3',
      at(3),
      true,
    ],
    [
      'its code frame, with an import line before the highlighted one',
      "src/a.ts: cannot split\n  2 | import { b } from './b.ts'\n> 3 | b()",
      at(3),
      true,
    ],
    [
      'its code frame in a box, with an import line',
      " × cannot split in src/a.ts\n  ╭─\n 2 │ import { b } from './b.ts'\n 3 │ b()\n   · ─\n> 3 | b()",
      at(3),
      true,
    ],
    ['a version between', 'src/a.ts (vite v8.3.8) 3:5', at(3, 5), true],
    [
      'a URL between',
      'src/a.ts see https://tanstack.com/router/docs.html 3:5',
      at(3, 5),
      true,
    ],
  ] as const)('%s', (_, text, expected, names) => {
    expect(findDiagnostics(warning(text), expected)).toHaveLength(names ? 1 : 0)
  })

  test('output of unknown owner: a presence check needs its absolute path, an absence check sees it named any way', () => {
    const shared = (text: string) => [
      { severity: 'warning' as const, text, raw: text, shared: true as const },
    ]
    expect(findDiagnostics(shared('warning in src/a.ts:3:5'), a)).toEqual([])
    expect(() =>
      expectNoDiagnostic(shared('warning in src/a.ts:3:5'), a),
    ).toThrow(/unknown owner/)
    expect(() => expectNoDiagnostic(shared('warning'), {})).toThrow(
      /unknown owner/,
    )
    expectDiagnostic(shared('warning in /app/src/a.ts:3:5'), a)
    expectNoDiagnostic(warning('warning in src/b.ts:3:5'), a)
    expect(() => expectNoDiagnostic(warning('in src/a.ts'), a)).toThrow(
      /src\/a\.ts/,
    )
  })
})

// Controls of the file and position matcher: a diagnostic meets an
// expectation only with the expected file's own path and its own position.
describe('file and position', () => {
  test('a position belongs to the file it follows, not to a later file', () => {
    const nested = warning(
      'src/route.ts:2:9: cannot split\n  imported from src/barrel.ts:11:6',
    )
    const route = { file: 'src/route.ts', root: '/app' }
    expectDiagnostic(nested, { ...route, position: { line: 2, column: 9 } })
    expect(
      findDiagnostics(nested, { ...route, position: { line: 11, column: 6 } }),
    ).toEqual([])
    expectDiagnostic(nested, {
      file: 'src/barrel.ts',
      root: '/app',
      position: { line: 11, column: 6 },
    })
    expect(
      findDiagnostics(nested, {
        file: 'src/barrel.ts',
        root: '/app',
        position: { line: 2, column: 9 },
      }),
    ).toEqual([])
  })

  test('an absolute path names its file only as a whole path', () => {
    const at = { file: '/app/src/route.ts', position: { line: 1, column: 1 } }
    for (const other of [
      '/app/src/route.tsx:1:1',
      '/other/app/src/route.ts:1:1',
      '/app/src/route.ts.map:1:1',
    ]) {
      expect(findDiagnostics(warning(`failed: ${other}`), at)).toEqual([])
    }
    for (const same of [
      'failed: /app/src/route.ts:1:1',
      '    at load (/app/src/route.ts:1:1)',
      'failed: file:///app/src/route.ts:1:1',
      '╭─[/app/src/route.ts:1:1]',
      'failed in /app/src/route.ts.\n1:1',
    ]) {
      expectDiagnostic(warning(same), { ...at, times: 1 })
    }
  })

  test('route groups and parameters are part of the path', () => {
    const login = {
      file: '/app/src/routes/(auth)/login.tsx',
      position: { line: 1, column: 1 },
    }
    const page = { file: '/app/src/routes/[slug]/page.tsx' }
    for (const [text, expected] of [
      ['error in src/routes/(other)/login.tsx:1:1', login],
      ['error in /app/src/routes/(other)/login.tsx:1:1', login],
      ['error in src/routes/[id]/page.tsx:1:1', page],
    ] as const) {
      expect(findDiagnostics(warning(text), expected)).toEqual([])
    }
    for (const [text, expected] of [
      ['error in src/routes/(auth)/login.tsx:1:1', login],
      ['    at load (/app/src/routes/(auth)/login.tsx:1:1)', login],
      ['error in (auth)/login.tsx:1:1', login],
      ['error in src/routes/[slug]/page.tsx', page],
    ] as const) {
      expectDiagnostic(warning(text), { ...expected, times: 1 })
    }
    expect(
      findDiagnostics(warning('error in src/routes/(other)/login.tsx'), {
        file: 'src/routes/(auth)/login.tsx',
        root: '/app',
      }),
    ).toEqual([])
    expect(
      findDiagnostics(warning('error in src/routes/[id]/page.tsx'), {
        file: 'routes/[slug]/page.tsx',
      }),
    ).toEqual([])
  })

  test('output of unknown owner names its file only by its absolute path', () => {
    const shared = (text: string) => [
      { severity: 'warning' as const, text, raw: text, shared: true as const },
    ]
    const expected = {
      file: 'src/routes/index.tsx',
      root: '/tmp/apps/b',
      position: { line: 3, column: 1 },
    }
    expect(
      findDiagnostics(
        shared('[plugin] src/routes/index.tsx:3:1 split'),
        expected,
      ),
    ).toEqual([])
    expect(() =>
      expectDiagnostic(shared('[plugin] src/routes/index.tsx:3:1'), expected),
    ).toThrow(/unknown owner/)
    expect(
      findDiagnostics(shared('[plugin] warned'), { severity: 'warning' }),
    ).toEqual([])
    expectDiagnostic(
      shared('[plugin] /tmp/apps/b/src/routes/index.tsx:3:1 split'),
      { ...expected, times: 1 },
    )
    expect(
      findDiagnostics(
        shared('[plugin] /tmp/apps/a/src/routes/index.tsx:3:1 split'),
        expected,
      ),
    ).toEqual([])
  })
})
