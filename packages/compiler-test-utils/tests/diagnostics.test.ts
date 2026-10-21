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
  expectFrameAt,
  expectRelevantLocation,
  findDiagnostics,
  identifiesEnvRestriction,
  importLines,
  importedBindingUses,
  isRelevantLocation,
  mentionsFile,
  parseLocation,
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
    'src\\routes\\posts.tsx',
    'webpack://my-app/./src/routes/posts.tsx',
    '/app/src/routes/posts.tsx?tsr-split=component',
    '"/app/src/routes/posts.tsx"',
    'in src/routes/posts.tsx.',
  ])('accepts %s', (spelling) => {
    expect(mentionsFile(`warning: ${spelling}`, file, { root })).toBe(true)
  })

  // SPEC §5.7 (DECISIONS 2026-10-20 "file names in diagnostics"): a file is
  // named absolute or project-relative; a part of its project-relative
  // path alone does not say which file it is.
  test.each([
    '/other/src/routes/posts.tsx',
    'src/routes/posts.tsx.bak',
    'src/routes/myposts.tsx',
    'src/routes/blog/posts.tsx',
    'a sentence about posts',
    'routes/posts.tsx',
    'posts.tsx',
    'posts.tsx:3:5',
    './posts.tsx',
    'webpack://my-app/./posts.tsx',
    'other/src/routes/posts.tsx',
  ])('rejects %s', (spelling) => {
    expect(mentionsFile(`warning: ${spelling}`, file, { root })).toBe(false)
  })

  test('a bare basename does not name a file under src (other.ts:2:24 for src/other.ts)', () => {
    expect(
      mentionsFile('other.ts:2:24', 'src/other.ts', { root: '/app' }),
    ).toBe(false)
    expect(mentionsFile('other.ts:2:24', 'src/other.ts')).toBe(false)
    expect(
      mentionsFile('src/other.ts:2:24', 'src/other.ts', { root: '/app' }),
    ).toBe(true)
    expect(
      mentionsFile('/app/src/other.ts:2:24', 'src/other.ts', { root: '/app' }),
    ).toBe(true)
    // (a file at the app root is named by its basename)
    expect(mentionsFile('vite.config.ts:1:1', 'vite.config.ts')).toBe(true)
  })

  test('a spelling that also names another file is ambiguous', () => {
    // A longer relative path ending with the project-relative path names
    // the file, unless it is also the path of another file
    expect(mentionsFile('in lib/src/a.ts', 'src/a.ts')).toBe(true)
    expect(
      mentionsFile('in lib/src/a.ts', 'src/a.ts', {
        distinctFrom: ['lib/src/a.ts'],
      }),
    ).toBe(false)
    expect(
      mentionsFile('in src/a.ts', 'src/a.ts', {
        distinctFrom: ['lib/src/a.ts'],
      }),
    ).toBe(true)
  })

  // Route file names with brackets (route groups, dynamic segments, optional
  // params). Control: a bracket-free path quoted in brackets still counts.
  test.each([
    ['src/routes/(group).tsx', 'in /app/src/routes/(group).tsx'],
    ['src/routes/(group).tsx', 'in src/routes/(group).tsx'],
    ['src/routes/(group).tsx', '(src/routes/(group).tsx)'],
    ['src/routes/(group).tsx', 'src\\routes\\(group).tsx(3,5)'],
    ['src/routes/posts.[id].tsx', 'src/routes/posts.[id].tsx:3:5'],
    ['src/routes/{-$lang}.tsx', '"/@fs/app/src/routes/{-$lang}.tsx"'],
    ['src/routes/[...slug].tsx', 'file:///app/src/routes/%5B...slug%5D.tsx'],
    ['src/routes/posts.tsx', '(src/routes/posts.tsx)'],
  ])('accepts %s named as %s', (file, text) => {
    expect(mentionsFile(`warning: ${text}`, file, { root })).toBe(true)
  })

  test.each([
    ['src/routes/(group).tsx', 'in group.tsx'],
    ['src/routes/(group).tsx', 'in (other).tsx'],
    ['src/routes/(group).tsx', 'in src/routes/(group)/index.tsx'],
    ['src/routes/(group).tsx', 'in (group).index.tsx'],
    ['src/routes/(group).tsx', 'in (group).tsx'],
    ['src/routes/(group).tsx', '((group).tsx)'],
    ['src/routes/nested/(group).tsx', 'at `nested/(group).tsx`'],
    ['src/routes/posts.[id].tsx', 'in posts.id.tsx'],
    ['src/routes/posts.[id].tsx', 'routes/posts.[id].tsx:3:5'],
  ])('rejects %s named as %s', (file, text) => {
    expect(mentionsFile(`warning: ${text}`, file, { root })).toBe(false)
  })

  test('a bracketed name reports its position', () => {
    expectDiagnostic('error: src/routes/(group).tsx:3:5 bad', {
      file: 'src/routes/(group).tsx',
      root,
      position: { line: 3, column: 5 },
    })
  })

  test('without a root, a relative file is project-relative: a longer path ending with it names it, a part of it does not', () => {
    expect(mentionsFile('/tmp/x/src/a.ts:1:1', 'src/a.ts')).toBe(true)
    expect(mentionsFile('src/a.ts', 'src/a.ts')).toBe(true)
    expect(mentionsFile('a.ts', 'src/a.ts')).toBe(false)
    expect(mentionsFile('/tmp/x/src/b.ts', 'src/a.ts')).toBe(false)
  })

  test('an absolute file without a root is named absolute only', () => {
    expect(mentionsFile('/app/src/a.ts:1:1', '/app/src/a.ts')).toBe(true)
    expect(mentionsFile('src/a.ts:1:1', '/app/src/a.ts')).toBe(false)
    expect(mentionsFile('a.ts:1:1', '/app/src/a.ts')).toBe(false)
    expect(
      mentionsFile('src/a.ts:1:1', '/app/src/a.ts', { root: '/app' }),
    ).toBe(true)
  })

  test('an expectation and a reported location name the file the same way', () => {
    expect(() =>
      expectDiagnostic('error: a.ts:3:5 bad', {
        file: 'src/a.ts',
        root,
        position: { line: 3, column: 5 },
      }),
    ).toThrow()
    expect(
      isRelevantLocation('a.ts:1:1', {
        file: 'src/a.ts',
        source: `import { x } from './x'\n`,
        imports: ['./x'],
      }),
    ).toBe(false)
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
    // No tolerance (final pass #12): a caret one column left points at the
    // character before the code (a 0-based column handed to a 1-based
    // code-frame API, Start's F1).
    [
      'a caret one column left of the code',
      `src/a.ts
  2 | export const value = a(
> 3 |   createServerFn().handler(() => 1),
    |  ^^^^^^^^^^^^^^`,
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

// RULES-AUDIT R18: each spelling counts its column from its own base, and a
// position is tied to the named file. A spelling whose producer is unknown
// (a plain string; Vite and esbuild print 0-based columns in `file:line:col`,
// editors 1-based) still reads either base.
describe('position strictness', () => {
  const at = { line: 3, column: 3 }

  test.each([
    ['TypeScript (line,column) is 1-based', 'src/a.ts(3,2): x'],
    ['Babel (line:column) is 0-based', 'src/a.ts: x (3:3)'],
    ['webpack line:column-column is 0-based', 'ERROR in ./src/a.ts 3:3-16'],
  ])('rejects the other base: %s', (_, text) => {
    expect(findDiagnostics(text, { file: 'src/a.ts', position: at })).toEqual(
      [],
    )
  })

  test('a structured location is printed 1-based and read exactly', () => {
    const exact = diagnosticsOf({
      message: 'bad',
      id: '/app/src/a.ts',
      loc: { file: '/app/src/a.ts', line: 3, column: 2 },
    })
    expect(exact[0]!.columnBase).toBe(1)
    expectDiagnostic(exact, {
      file: 'src/a.ts',
      root: '/app',
      position: { line: 3, column: 3 },
    })
    // One column off (a 0-based reading of the printed position) fails
    expect(
      findDiagnostics(exact, {
        file: 'src/a.ts',
        root: '/app',
        position: { line: 3, column: 4 },
      }),
    ).toEqual([])
  })

  test('a `line N` phrase counts only beside the named file', () => {
    expectDiagnostic('src/a.ts, line 3: bad', {
      file: 'src/a.ts',
      position: { line: 3 },
    })
    expect(
      findDiagnostics('src/a.ts: bad\nsee line 3 of the guide', {
        file: 'src/a.ts',
        position: { line: 3 },
      }),
    ).toEqual([])
  })
})

// SPEC G5, §5.7: a cause is judged by content, never by a closed list of
// words (EMPIRICAL R5: "has to be stored in a variable" failed the old
// placement list). An explanation in any words passes; a crash, a bare
// failure, quoted code alone, or a message missing what tells the cause
// apart fails.
describe("explains: a cause in the diagnostic's own words", () => {
  test('accepts an actionable client-access refusal without a wording whitelist', () => {
    expectDiagnostic(
      diagnosticsOf('Server function not accessible from client', 'error'),
      { severity: 'error', explains: true },
    )
  })
  const source = `import { createServerFn } from '@tanstack/react-start'
export const value = wrap(createServerFn().handler(() => 1))
`
  test.each([
    'createServerFn result has to be stored in a variable',
    'createServerFn() must live at module scope',
    'Move this createServerFn call to the top level of the module',
    "createServerFn() can't be nested inside another call",
    'Nested createServerFn() calls are unsupported',
    '[plugin:start] /app/src/a.ts:2:27: createServerFn() is only supported in a variable declaration',
  ])('accepts %s', (text) => {
    expectDiagnostic(text, {
      names: ['createServerFn'],
      explains: true,
      source,
    })
  })

  test.each([
    [
      'an engine crash naming the API',
      new TypeError(
        "Cannot read properties of undefined (reading 'createServerFn')",
      ),
    ],
    [
      'an engine crash message in a plain error',
      new Error('createServerFn: x.handler is not a function'),
    ],
    ['a bare failure', new Error('createServerFn internal error')],
    [
      'a bare failure with quoted code',
      new Error('Failed to compile createServerFn at `wrap(createServerFn())`'),
    ],
    [
      'a code frame of the source only',
      new Error(`createServerFn
> 2 | export const value = wrap(createServerFn().handler(() => 1))
    |                           ^`),
    ],
    // Final pass #3 (DECISIONS 2026-10-21): an internal error that names the
    // API passes no longer. The old check took "node" and "type" for a cause.
    [
      'an internal error in the compiler’s own terms',
      new Error('createServerFn: unexpected node type'),
    ],
    [
      'an unexpected AST kind',
      new Error('createServerFn: unexpected callee kind in visitor'),
    ],
    [
      'an invariant of the compiler',
      new Error('createServerFn: Invariant failed: handler declarator missing'),
    ],
    [
      'a report asking for a bug report',
      new Error(
        'createServerFn handler went wrong. This is a bug, please report it',
      ),
    ],
  ])('rejects %s', (_, error) => {
    expect(
      findDiagnostics(error, {
        names: ['createServerFn'],
        explains: true,
        source,
      }),
    ).toEqual([])
  })

  // An actionable cause: the category, and the API it names or guidance.
  // Without an expected API, guidance carries it (any requirement,
  // restriction or directive); a category alone does not.
  test.each([
    'Hydrate cannot code-split function-as-children. Use split={false} for this boundary.',
    'Server functions are only callable from the server',
    'A route file must export Route',
  ])('without names, accepts a cause with guidance: %s', (text) => {
    expectDiagnostic(diagnosticsOf(text, 'error'), { explains: true })
  })

  test.each([
    'the nested closure broke the split',
    'Hydrate boundary extraction went sideways',
  ])(
    'without names, rejects a category with neither an API nor guidance: %s',
    (text) => {
      expect(
        findDiagnostics(diagnosticsOf(text, 'error'), { explains: true }),
      ).toEqual([])
    },
  )

  test('naming the API in its own words makes the category actionable', () => {
    const expectation = { names: ['createServerFn'], explains: true as const }
    expectDiagnostic('createServerFn handler closures are hoisted', expectation)
    // The API only in a quoted frame line is not named in the prose
    expect(
      findDiagnostics(
        `src/a.ts: handler closures are hoisted
> 2 | export const value = wrap(createServerFn().handler(() => 1))`,
        { ...expectation, source },
      ),
    ).toEqual([])
  })

  test('mentions: what tells the cause apart must be named in the explanation', () => {
    const capture = {
      names: ['createServerFn'],
      explains: { mentions: ['id'] },
    }
    expectDiagnostic(
      'createServerFn handler reads `id` from the enclosing function',
      capture,
    )
    expectDiagnostic('the handler of createServerFn closes over id', capture)
    expect(
      findDiagnostics(
        'createServerFn must be declared at the top level',
        capture,
      ),
    ).toEqual([])
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

  test('a name given as alternatives is named by any one of them', () => {
    const missingHandler = 'src/a.ts:2:19 handler() expects a function'
    expectDiagnostic(missingHandler, {
      names: [['createServerFn', 'handler']],
    })
    expect(
      findDiagnostics(missingHandler, { names: [['createServerFn', 'fn']] }),
    ).toEqual([])
  })
})

describe('prose and causes', () => {
  const source = `import { Hydrate } from '@tanstack/react-start'
export const Page = () => (
  <Hydrate when={idle()}>{(...args) => <Child value={arguments[0]} />}</Hydrate>
)
`

  // What a diagnostic says in its own words never comes from the code it
  // quotes: a full, a cropped and a highlighted frame line, in the layouts
  // of several tools, and a caret line (V1R start N13).
  test.each([
    ['a full numbered frame line', `> 3 |   ${source.split('\n')[2]}`],
    [
      'a cropped numbered frame line',
      '> 3 | … <Hydrate when={idle()}>{(...args) => <Child value={arguments[0]} … ',
    ],
    ['a Rollup-style frame line', '3:   <Hydrate … arguments[0] …'],
    ['a frame line in a box', '│ ❯ 3 │ <Hydrate … arguments[0]'],
    [
      'an unnumbered cropped quote',
      '… <Hydrate when={idle()}>{(...args) => <Child value={arguments[0]} …',
    ],
    ['the whole source line', source.split('\n')[2]!],
  ])(
    'source tokens of %s are not prose: an internal error naming nothing does not pass',
    (_name, quoted) => {
      const text = `Internal compiler error\n${quoted}\n  |        ^`
      expect(
        findDiagnostics(text, {
          names: ['Hydrate', 'arguments'],
          prose: true,
          source,
        }),
      ).toEqual([])
      // Without the prose option, the quoted tokens count (the old reading).
      expect(
        findDiagnostics(text, { names: ['Hydrate', 'arguments'], source }),
      ).toHaveLength(1)
    },
  )

  test.each([
    [
      'before a frame',
      `src/a.tsx:3:3: <Hydrate> children cannot read \`arguments\`\n> 3 | ${source.split('\n')[2]}\n    |   ^`,
    ],
    [
      'after the caret of a frame',
      `> 3 | ${source.split('\n')[2]}\n    |   ^^^^ Hydrate children cannot read arguments`,
    ],
    [
      'on one line, without a frame',
      'Hydrate: the children function reads arguments, which the split loses',
    ],
  ])('a clear message %s names its names in prose', (_name, text) => {
    expectDiagnostic(text, {
      names: ['Hydrate', 'arguments'],
      prose: true,
      source,
    })
  })

  test('a cause is required in prose: naming the API (and a captured name) is not explaining the cause', () => {
    const causes = ['captur', 'closure', /\bout(?:side|er)\b.*\bscope\b/]
    const code = `export function make(id: string) {
  return createServerFn().handler(() => db.inner(id))
}`
    for (const crash of [
      'createServerFn internal error at src/a.ts:2:10',
      'createServerFn id internal error at src/a.ts:2:10',
      `Cannot read properties of undefined (reading 'id')\n> 2 |   return createServerFn().handler(() => db.inner(id)) // captures id`,
    ]) {
      expect(
        findDiagnostics(crash, {
          names: ['createServerFn', 'id'],
          causes,
          source: code,
        }),
        crash,
      ).toEqual([])
    }
    for (const clear of [
      'createServerFn: the handler captures `id`, a local of `make`',
      'src/a.ts:2:10 createServerFn handler reads id from an outer scope',
      'createServerFn cannot be compiled: its handler forms a closure over id',
    ]) {
      expectDiagnostic(clear, {
        names: ['createServerFn', 'id'],
        causes,
        source: code,
      })
    }
  })
})

describe('reported locations', () => {
  const source = `import { other } from './other'
import {
  secret,
} from './secret.server'
export const read = () => secret()
export const later = () => import('./secret.server')
`
  const expected = {
    file: 'src/a.ts',
    source,
    uses: [{ line: 5, column: 27 }],
    imports: ['./secret.server'],
  }

  test('the use and any line of the import of the specifier are relevant, whatever the file spelling', () => {
    for (const reported of [
      'src/a.ts:5:27',
      '/app/src/a.ts:5:27',
      'src/a.ts:2:1',
      'src/a.ts:3:3',
      'src/a.ts:4:8',
      // the dynamic import of the same specifier
      'src/a.ts:6:34',
    ]) {
      expectRelevantLocation(reported, expected)
    }
  })

  test.each([
    ['another column of the use line', 'src/a.ts:5:1'],
    ['an unrelated line', 'src/a.ts:1:1'],
    ['the import of another specifier', 'src/a.ts:1:10'],
    ['a line past the end (compiled coordinates)', 'src/a.ts:9:4'],
    ['another file', 'src/b.ts:5:27'],
    ['no coordinates', 'src/a.ts'],
    ['a column 0 of the import (columns are 1-based)', 'src/a.ts:2:0'],
    ['the file named by its basename (§5.7)', 'a.ts:5:27'],
  ])('%s is not relevant', (_name, reported) => {
    expect(isRelevantLocation(reported, expected)).toBe(false)
    expect(() => expectRelevantLocation(reported, expected)).toThrow()
  })

  test('a use without a column accepts any column of its line', () => {
    expect(
      isRelevantLocation('src/a.ts:5:1', { ...expected, uses: [{ line: 5 }] }),
    ).toBe(true)
  })

  test('no coordinates and other places are accepted only when the caller allows them', () => {
    expect(
      isRelevantLocation('src/a.ts', { ...expected, unlocated: true }),
    ).toBe(true)
    const marker = {
      ...expected,
      others: [{ file: 'src/b.ts', lines: [1], unlocated: true }],
    }
    expect(isRelevantLocation('src/b.ts:1:8', marker)).toBe(true)
    expect(isRelevantLocation('src/b.ts', marker)).toBe(true)
    expect(isRelevantLocation('src/b.ts:2:1', marker)).toBe(false)
  })

  test('importLines spans every line of a statement importing exactly the specifier', () => {
    expect(importLines('src/a.ts', source, './secret.server')).toEqual([
      2, 3, 4, 6,
    ])
    expect(importLines('src/a.ts', source, './secret')).toEqual([])
    expect(importLines('src/a.ts', `export { x } from './x'\n`, './x')).toEqual(
      [1],
    )
  })

  test('importedBindingUses finds the references to the bindings an import of the specifier introduces', () => {
    expect(importedBindingUses('src/a.ts', source, './secret.server')).toEqual([
      { line: 5, column: 27 },
    ])
    const jsx = `import Secret, { secret as s } from './secret.server'
import { other } from './other'
// secret
export const Page = () => <Secret value={s()} other={other} />
`
    expect(importedBindingUses('src/a.tsx', jsx, './secret.server')).toEqual([
      { line: 4, column: 28 },
      { line: 4, column: 42 },
    ])
    expect(importedBindingUses('src/a.tsx', jsx, './missing')).toEqual([])
  })

  // SPEC J6.5: a report is never at an erased type position, so such a
  // position is not a use.
  test('importedBindingUses leaves out type positions, which compiling erases', () => {
    const typed = `import { Secret, secret } from './secret.server'
export const read = (value: Secret): Secret => value as Secret
export type Kind = typeof secret
export interface Box extends Secret { inner: Secret }
export class Holder implements Secret { declare field: Secret }
declare const later: typeof secret
export const run = () => secret<Secret>()
export enum Code { A = secret() }
`
    expect(importedBindingUses('src/a.ts', typed, './secret.server')).toEqual([
      { line: 7, column: 26 },
      { line: 8, column: 24 },
    ])
  })

  test('importedBindingUses leaves out names a local binding shadows', () => {
    const shadowed = `import { secret } from './secret.server'
export function local() {
  const secret = () => 'local'
  return secret()
}
export const param = (secret: () => string) => secret()
export const pick = ({ secret }: { secret: () => string }) => secret()
try {} catch (secret) { void secret }
for (const secret of [() => '']) { void secret }
export const named = function secret() { return secret }
export const leak = () => secret()
`
    expect(
      importedBindingUses('src/a.ts', shadowed, './secret.server'),
    ).toEqual([{ line: 11, column: 27 }])
  })

  test('importedBindingUses leaves out names that are not references: keys, members, labels, re-exports, JSX attributes', () => {
    const names = `import { secret } from './secret.server'
export const named = { secret: 1 }.secret
export const shorthand = { secret }
secret: {
  break secret
}
export { secret }
export { secret as other } from './elsewhere'
export const el = <div secret={secret} />
`
    expect(importedBindingUses('src/a.tsx', names, './secret.server')).toEqual([
      { line: 3, column: 28 },
      { line: 7, column: 10 },
      { line: 9, column: 32 },
    ])
  })

  test('parseLocation reads a file with or without a line and column', () => {
    expect(parseLocation('C:/app/a.ts:3:4')).toEqual({
      file: 'C:/app/a.ts',
      line: 3,
      column: 4,
    })
    expect(parseLocation('src/a.ts:3')).toEqual({ file: 'src/a.ts', line: 3 })
    expect(parseLocation('src/a.ts')).toEqual({ file: 'src/a.ts' })
  })

  test('a frame must highlight the reported line, show it and point at the column; its context is free', () => {
    const line = 'export const read = () => secret()'
    expectFrameAt({ line: 5, pointsAt: 'secret()', shows: [line] }, source, {
      line: 5,
      column: 27,
    })
    // cropped, with no context
    expectFrameAt(
      { line: 5, pointsAt: 'secret…', shows: ['… secret()'] },
      source,
      {
        line: 5,
        column: 27,
      },
    )
    for (const frame of [
      { line: 4, pointsAt: 'secret()', shows: [line] },
      { line: 5, pointsAt: 'read = () => secret()', shows: [line] },
      { line: 5, pointsAt: 'secret()', shows: ['import { other }'] },
      { line: 5, pointsAt: '', shows: [line] },
    ]) {
      expect(() =>
        expectFrameAt(frame, source, { line: 5, column: 27 }),
      ).toThrow()
    }
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
    'Cannot call a server-only function on the client.',
    'createServerOnlyFn() is not available in the browser',
    'This function must not run on the client',
  ])(
    'accepts a restriction stated as a forbidden other side: %s',
    (message) => {
      expect(identifiesEnvRestriction(new Error(message), 'server')).toBe(true)
      expect(identifiesEnvRestriction(new Error(message), 'client')).toBe(false)
    },
  )

  // RULES-AUDIT R18: the old check accepted any message containing
  // "server", whatever it said.
  test.each([
    'Server function not found',
    'Failed to reach the server',
    'serverFn handler threw',
  ])(
    'rejects a message that names the environment without restricting the call: %s',
    (message) => {
      expect(identifiesEnvRestriction(new Error(message), 'server')).toBe(false)
      expect(identifiesEnvRestriction(new Error(message), 'client')).toBe(false)
    },
  )

  test.each([
    ['the other environment', new Error('only callable on the client')],
    ['a restriction away from it', new Error('not available on the server')],
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
