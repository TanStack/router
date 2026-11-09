/**
 * Traces, dev report flushing, original positions and the build verdict
 * on hand-made graphs.
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, test } from 'vitest'
import { revision } from '@tanstack/router-utils/compiler'
import { resolveImportProtectionConfig } from '../../src/import-protection/config'
import {
  EdgeIndex,
  cutTrace,
  traceOf,
} from '../../src/import-protection/graph-trace'
import {
  Locator,
  originalPositionFor,
} from '../../src/import-protection/locate'
import {
  DevReporter,
  devViolationError,
} from '../../src/import-protection/report'
import { formatViolation } from '../../src/import-protection/trace'
import { violationInfo } from '../../src/import-protection/violations'
import type { ImportGraphView } from '../../src/import-protection/graph-trace'
import type { EdgeViolation } from '../../src/import-protection/violations'
import type { ImportProtectionOptions } from '../../src/schema'

/** A graph from `importer -> [targets]` lists. */
function graph(
  edges: Record<string, Array<string>>,
  entries: Array<string> = [],
): ImportGraphView & { add: (from: string, to: string) => void } {
  const importers = new Map<string, Set<string>>()
  const add = (from: string, to: string) => {
    let s = importers.get(to)
    if (!s) {
      s = new Set()
      importers.set(to, s)
    }
    s.add(from)
  }
  for (const [from, tos] of Object.entries(edges)) {
    for (const to of tos) {
      add(from, to)
    }
  }
  return {
    importers: (id) => importers.get(id) ?? [],
    isEntry: (id) => entries.includes(id),
    add,
  }
}

const config = (options: ImportProtectionOptions = {}) =>
  resolveImportProtectionConfig(options, {
    root: '/app',
    srcDirectory: '/app/src',
    mode: 'dev',
  })!

function violation(partial: Partial<EdgeViolation> = {}): EdgeViolation {
  return {
    edgeKey: 'k1',
    env: 'client',
    envType: 'client',
    rule: { type: 'file', index: 0 },
    specifier: './secret.server',
    importer: '/app/src/b.ts',
    importerId: '/app/src/b.ts',
    resolved: '/app/src/secret.server.ts',
    loc: { file: '/app/src/b.ts', line: 3, column: 24 },
    snippet: null,
    behavior: 'mock',
    module: null,
    ...partial,
  }
}

describe('traces', () => {
  const chain = {
    '/app/src/main.ts': ['/app/src/entry.ts'],
    '/app/src/entry.ts': ['/app/src/a.ts'],
    '/app/src/a.ts': ['/app/src/b.ts'],
  }

  test('run from the nearest entry to the importer, each step naming its import of the next', () => {
    const index = new EdgeIndex()
    index.set('/app/src/entry.ts', [
      { resolved: '/app/src/a.ts', specifier: './a' },
    ])
    index.set('/app/src/a.ts', [
      { resolved: '/app/src/b.ts', specifier: './b' },
    ])
    expect(
      traceOf('/app/src/b.ts', graph(chain, ['/app/src/entry.ts']), index)
        .steps,
    ).toEqual([
      { file: '/app/src/entry.ts', specifier: './a' },
      { file: '/app/src/a.ts', specifier: './b' },
      { file: '/app/src/b.ts' },
    ])
  })

  test('a recorded offset is located in the raw file while that is the text the edge was judged in', () => {
    const files: Record<string, string> = {
      '/app/src/entry.ts': `export const zero = 0\nimport { a } from './a'\n`,
      '/app/src/a.ts': `import { b } from './b'\n`,
    }
    const index = new EdgeIndex((file) => files[file] ?? null)
    const entry = files['/app/src/entry.ts']!
    index.set(
      '/app/src/entry.ts',
      [
        {
          resolved: '/app/src/a.ts',
          specifier: './a',
          offset: entry.indexOf("'./a'"),
        },
      ],
      revision(entry),
    )
    // judged in another plugin's output: the raw file is not that text
    index.set(
      '/app/src/a.ts',
      [{ resolved: '/app/src/b.ts', specifier: './b', offset: 18 }],
      revision(`/* rewritten */\n${files['/app/src/a.ts']}`),
    )
    const trace = () =>
      traceOf('/app/src/b.ts', graph(chain, ['/app/src/entry.ts']), index).steps
    expect(trace()).toEqual([
      { file: '/app/src/entry.ts', specifier: './a', line: 2, column: 19 },
      { file: '/app/src/a.ts', specifier: './b' },
      { file: '/app/src/b.ts' },
    ])
    // the file changed since: its offsets mean nothing any more
    files['/app/src/entry.ts'] = `// edited\n${entry}`
    expect(trace()[0]).toEqual({ file: '/app/src/entry.ts', specifier: './a' })
  })

  test('without a known entry, start at a module nothing imports; survive cycles; cut keeping the importer', () => {
    const g = graph({ ...chain, '/app/src/b.ts': ['/app/src/entry.ts'] })
    expect(traceOf('/app/src/b.ts', g, null).steps.map((s) => s.file)).toEqual([
      '/app/src/main.ts',
      '/app/src/entry.ts',
      '/app/src/a.ts',
      '/app/src/b.ts',
    ])
    expect(
      cutTrace(traceOf('/app/src/b.ts', g, null).steps, 1).map((s) => s.file),
    ).toEqual(['/app/src/a.ts', '/app/src/b.ts'])
  })

  test('the edge index supplies edges the bundler graph has not recorded yet; queries are stripped from files', () => {
    const index = new EdgeIndex()
    index.set('/app/src/r.tsx?tsr-split=component', [
      { resolved: '/app/src/b.ts', specifier: './b' },
    ])
    expect(
      traceOf(
        '/app/src/b.ts',
        graph({ '/app/src/entry.ts': ['/app/src/r.tsx?tsr-split=component'] }, [
          '/app/src/entry.ts',
        ]),
        index,
      ).steps.map((s) => [s.file, s.specifier]),
    ).toEqual([
      ['/app/src/entry.ts', undefined],
      ['/app/src/r.tsx', './b'],
      ['/app/src/b.ts', undefined],
    ])
  })

  test('the importer step of a violation names the denied import and its location', () => {
    const info = violationInfo(violation(), config(), () => ({
      steps: [
        { file: '/app/src/a.ts', specifier: './b' },
        { file: '/app/src/b.ts' },
      ],
      fromEntry: false,
    }))
    expect(info.trace.at(-1)).toEqual({
      file: '/app/src/b.ts',
      specifier: './secret.server',
      line: 3,
      column: 24,
    })
    expect(info.pattern).toBe('**/*.server.*')
    expect(info.resolved).toBe('/app/src/secret.server.ts')
  })
})

describe('suggestions', () => {
  test('a server-environment report says a `createClientOnlyFn` function throws when called on the server', () => {
    const v = violation({
      env: 'ssr',
      envType: 'server',
      specifier: './win.client',
      resolved: '/app/src/win.client.ts',
    })
    const text = formatViolation(
      v,
      violationInfo(v, config(), () => ({
        steps: [{ file: '/app/src/b.ts' }],
        fromEntry: false,
      })),
      { config: config(), readSource: () => null, framework: 'react' },
    )
    // (the text changed with R101's message fixes: still names the throw)
    expect(text).toContain(
      'wrap it in createClientOnlyFn(() => ...): it throws if called on the server',
    )
  })
})

describe('an import another plugin added', () => {
  // R101/R102.2: an importer whose source has no pattern import reached the
  // denied file through an import a later plugin's transform added (an
  // auto-import): the report names that, and its fix, not a pattern import
  const denied = '/app/src/db.server.ts'
  const inj = '/app/src/inj.ts'
  const readSource = (file: string) =>
    file === inj ? `export const read = () => 'x'\n` : null
  const self = violation({
    self: true,
    importer: denied,
    importerId: denied,
    resolved: denied,
    specifier: 'src/db.server.ts',
    loc: null,
  })
  const shapes = {
    // a build names each importer the bundle's graph has, after the pattern import found in its source
    build: {
      v: violation({
        importer: inj,
        importerId: inj,
        resolved: denied,
        specifier: 'src/db.server.ts',
        loc: null,
        pattern: null,
      }),
      steps: ['/app/src/entry.ts', inj],
    },
    // a dev server reports the denied file, the importer from the graph
    dev: { v: self, steps: ['/app/src/entry.ts', inj, denied] },
  }

  test.each(Object.entries(shapes))(
    '%s: the report says another plugin added the import, and to keep it from adding the file',
    (_shape, { v, steps }) => {
      const { text } = printedTrace(steps, true, { v, readSource })!
      expect(text).toMatch(/^ {2}Imported by: src\/inj\.ts, .*another plugin/m)
      expect(text).toMatch(/^ {4}- Keep the plugin that adds this import/m)
      expect(text).not.toMatch(/^ {2}Matched by:/m)
    },
  )
})

describe('what brought a denied file nothing the compiler read imports', () => {
  const denied = '/app/src/db.server.ts'
  const self = violation({
    self: true,
    importer: denied,
    importerId: denied,
    resolved: denied,
    specifier: 'src/db.server.ts',
    loc: null,
  })
  const report = (steps: Array<string>, sources: Record<string, string>) =>
    printedTrace(steps, true, {
      v: self,
      readSource: (file) => sources[file] ?? null,
    })!.text

  test('an importer outside the scope is named as unchecked, with the fixes of an unchecked importer', () => {
    const text = report(['/app/lib/outside.ts', denied], {
      '/app/lib/outside.ts': `import { db } from '../src/db.server'\n`,
    })
    expect(text).toMatch(
      /^ {2}Imported by: lib\/outside\.ts, which import protection does not check/m,
    )
    expect(text).toMatch(/^ {4}- If lib\/outside\.ts should be checked/m)
  })

  // a quote the tokenizer misreads must not turn a real pattern import into "another plugin added it"
  test.each([
    [
      'a glob after JSX text with an apostrophe',
      `export const C = () => <p>Don't</p>\nexport const m = import.meta.glob('./*.server.ts')\n`,
    ],
    [
      'a glob after a regular expression with a quote',
      `const q = (s: string) => s.replace(/'/g, '')\nexport const m = import.meta.glob('./*.server.ts')\n`,
    ],
    [
      'a require() with a variable path (a webpack context)',
      `export const load = (n: string) => require('./' + n)\n`,
    ],
  ])('%s: still a pattern import', (_shape, source) => {
    const text = report(['/app/src/entry.ts', '/app/src/a.tsx', denied], {
      '/app/src/a.tsx': source,
    })
    expect(text).toMatch(/^ {2}Matched by: /m)
    expect(text).not.toMatch(/another plugin/)
  })

  test('a module another plugin generates between the importer and the file: no claim about the importer', () => {
    const text = report(['/app/src/main.tsx', '\0virtual:pages', denied], {
      '/app/src/main.tsx': `import pages from 'virtual:pages'\n`,
    })
    expect(text).not.toMatch(/Imported by: src\/main\.tsx/)
  })
})

describe('dev reports', () => {
  function setup(options: ImportProtectionOptions = {}) {
    let now = 0
    const timers: Array<{ fn: () => void; ms: number }> = []
    const printed: Array<string> = []
    const g = graph({})
    const reporter = new DevReporter({
      config: config(options),
      report: {
        config: config(options),
        readSource: () => null,
        framework: 'react',
      },
      sink: {
        warn: (_m, r) =>
          printed.push(r.info.trace.map((s) => s.file).join(' > ')),
      },
      reachable: (id) => [...g.importers(id)].length > 0,
      now: () => now,
      setTimer: (fn, ms) => {
        const t = { fn, ms }
        timers.push(t)
        return t
      },
      clearTimer: (t) => {
        timers.splice(timers.indexOf(t as never), 1)
      },
    })
    const tick = (ms: number) => {
      now += ms
      const t = timers.shift()
      t?.fn()
    }
    const enqueue = (v = violation()) =>
      reporter.enqueue({
        violation: v,
        info: violationInfo(v, config(options), () =>
          traceOf(v.importerId, g, null),
        ),
      })
    return { reporter, printed, timers, tick, enqueue, g }
  }

  test('wait (one yielding timer, growing delays) until the graph knows how the importer is reached', () => {
    const s = setup()
    s.enqueue()
    expect(s.timers.map((t) => t.ms)).toEqual([0])
    s.tick(0)
    expect(s.printed).toEqual([])
    expect(s.timers.map((t) => t.ms)).toEqual([10])
    s.g.add('/app/src/a.ts', '/app/src/b.ts')
    s.tick(10)
    expect(s.printed).toEqual(['/app/src/a.ts > /app/src/b.ts'])
    expect(s.timers).toEqual([])
  })

  test('print with the trace the graph has after the bounded wait', () => {
    const s = setup()
    s.enqueue()
    let guard = 0
    while (s.timers.length > 0 && guard++ < 50) {
      s.tick(s.timers[0]!.ms || 1)
    }
    expect(s.printed).toEqual(['/app/src/b.ts'])
  })

  test("log 'once' prints a logical edge once; 'always' every time; flush(true) prints at a completion event", () => {
    const once = setup()
    once.enqueue()
    once.enqueue()
    once.reporter.flush(true)
    expect(once.printed).toHaveLength(1)
    const always = setup({ log: 'always' })
    always.enqueue()
    always.enqueue()
    always.reporter.flush(true)
    expect(always.printed).toHaveLength(2)
    always.reporter.close()
    always.enqueue()
    expect(always.timers).toEqual([])
  })
})

describe('positions', () => {
  test('without an input map, 1-based line and column of the input (CR, CRLF)', () => {
    const code = `a\r\nb\rimport x from './x'`
    const at = new Locator(code, '/app/src/a.ts', () => null)
    expect(at.at(code.indexOf("'./x'"))).toEqual({
      file: '/app/src/a.ts',
      line: 3,
      column: 15,
    })
  })

  /** An absolute app root in the form of a host's ids (`D:/app` on Windows). */
  const APP = path.resolve('/app').replace(/\\/g, '/')

  test('through an input map, generated lines are counted by LF only (a lone CR breaks no line)', () => {
    // line 0 → src line 1; line 1 → src line 2; line 2 → src line 3 (all column 0)
    const map = {
      version: 3,
      sources: ['page.mdx'],
      names: [],
      mappings: 'AAAA;AACA;AACA',
    }
    const code = `a\rb\nimport x from './x'\nc`
    const at = new Locator(code, `${APP}/src/page.mdx.js`, () => map)
    expect(at.at(code.indexOf('import'))).toEqual({
      file: `${APP}/src/page.mdx`,
      line: 2,
      column: 1,
    })
  })

  test('through an input map: the original file and position; uncovered positions are none', () => {
    // line 0 col 0 → src 0 (../docs/page.mdx) line 4 col 2; line 1 col 4 → line 9 col 0
    const map = {
      version: 3,
      sources: ['../docs/page.mdx'],
      names: [],
      mappings: 'AAIE;IAKF',
    }
    expect(originalPositionFor(map, 0, 3, `${APP}/src/page.mdx.js`)).toEqual({
      file: `${APP}/docs/page.mdx`,
      line: 5,
      column: 3,
    })
    expect(originalPositionFor(map, 1, 6, `${APP}/src/page.mdx.js`)).toEqual({
      file: `${APP}/docs/page.mdx`,
      line: 10,
      column: 1,
    })
    expect(originalPositionFor(map, 1, 2, `${APP}/src/page.mdx.js`)).toBeNull()
    expect(originalPositionFor(map, 5, 0, `${APP}/src/page.mdx.js`)).toBeNull()
  })

  test('through an input map: a file URL source is its file path', () => {
    const map = {
      version: 3,
      sources: [pathToFileURL(`${APP}/docs/my page.mdx`).href],
      names: [],
      mappings: 'AAIE',
    }
    expect(originalPositionFor(map, 0, 0, `${APP}/src/page.mdx.js`)).toEqual({
      file: `${APP}/docs/my page.mdx`,
      line: 5,
      column: 3,
    })
  })
})

/** A report's printed trace as structure (step numbers, files and positions, the entry tag) and the steps it says it left out. */
function printedTrace(
  steps: Array<string>,
  fromEntry: boolean,
  o: {
    root?: string
    options?: ImportProtectionOptions
    v?: EdgeViolation
    readSource?: (file: string) => string | null
  } = {},
) {
  const root = o.root ?? '/app'
  const c = resolveImportProtectionConfig(o.options ?? {}, {
    root,
    srcDirectory: `${root.replace(/\/$/, '')}/src`,
    mode: 'dev',
  })!
  const v = o.v ?? violation()
  const text = formatViolation(
    v,
    violationInfo(v, c, () => ({
      steps: steps.map((file) => ({ file })),
      fromEntry,
    })),
    { config: c, readSource: o.readSource ?? (() => null), framework: 'react' },
  )
  const lines = text.split('\n')
  const at = lines.indexOf('  Trace:')
  if (at < 0) {
    return null
  }
  const out: Array<[number, string, boolean]> = []
  let left = 0
  for (const line of lines.slice(at + 1)) {
    if (!line.trim()) {
      break
    }
    const m = /^\s+(\d+)\. (\S+)( \(entry\))?/.exec(line)
    if (m) {
      out.push([Number(m[1]), m[2]!, m[3] !== undefined])
    } else {
      left = Number(/\d+/.exec(line)?.[0])
    }
  }
  return { steps: out, left, text }
}

const NM = '/app/node_modules/@tanstack/react-start/dist/client.js'

describe('printed traces', () => {
  test("start at the app's first file, which is the entry when an entry reaches it; a route module and its split module print once", () => {
    expect(
      printedTrace(
        [
          NM,
          '/app/src/entry.ts',
          '/app/src/r.tsx',
          '/app/src/r.tsx',
          '/app/src/b.ts',
        ],
        true,
      )!.steps,
    ).toEqual([
      [1, 'src/entry.ts', true],
      [2, 'src/r.tsx', false],
      [3, 'src/b.ts:3:24', false],
    ])
  })

  test('a lone importer step prints no trace (the lines above name it), entry or not', () => {
    expect(printedTrace(['/app/src/b.ts'], false)).toBeNull()
    expect(printedTrace(['/app/src/b.ts'], true)).toBeNull()
    expect(printedTrace([NM, '/app/src/b.ts'], true)).toBeNull()
  })

  test('a trace not from an entry tags no step', () => {
    expect(
      printedTrace(['/app/src/a.ts', '/app/src/b.ts'], false)!.steps.map(
        (s) => s[2],
      ),
    ).toEqual([false, false])
  })

  test('a cut keeps the last steps, numbered as in the whole trace, tags no entry and says how many it left out', () => {
    const files = ['a', 'b', 'c', 'd', 'e'].map((n) => `/app/src/${n}.ts`)
    const t = printedTrace([...files, '/app/src/b.ts'], true, {
      options: { maxTraceDepth: 2 },
    })!
    expect(t.steps.map(([n, , entry]) => [n, entry])).toEqual([
      [4, false],
      [5, false],
      [6, false],
    ])
    expect(t.left).toBe(3)
  })

  test('without any app file every step prints', () => {
    const v = violation({
      importer: '/lib/b.ts',
      importerId: '/lib/b.ts',
      loc: { file: '/lib/b.ts', line: 3, column: 24 },
    })
    expect(
      printedTrace(['/lib/entry.ts', '/lib/a.ts', '/lib/b.ts'], true, { v })!
        .steps.length,
    ).toBe(3)
  })

  test("a module that is its own violation: the importer's step is its pattern import, its own step names no import", () => {
    const denied = '/app/src/x.server.ts'
    const v = violation({
      self: true,
      importer: denied,
      importerId: denied,
      resolved: denied,
      specifier: 'src/x.server.ts',
      loc: null,
    })
    const glob = `export const zero = 0\nexport const m = import.meta.glob('./*.server.ts')\n`
    const t = printedTrace(['/app/src/glob.ts', denied], true, {
      v,
      readSource: (file) => (file === '/app/src/glob.ts' ? glob : null),
    })!
    expect(t.steps.map((s) => s[1])).toEqual([
      'src/glob.ts:2:18',
      'src/x.server.ts',
    ])
    expect(t.text).toMatch(/^\s+2\. src\/x\.server\.ts$/m)
  })
})

describe('onViolation traces', () => {
  test('are the whole chain cut at maxTraceDepth, framework steps and split modules included, the same once frozen', () => {
    const c = config({ maxTraceDepth: 2 })
    const info = violationInfo(violation(), c, () => ({
      steps: [
        NM,
        '/app/src/r.tsx',
        '/app/src/r.tsx?tsr-split=component',
        '/app/src/b.ts',
      ].map((file) => ({ file })),
      fromEntry: true,
    }))
    const expected = [
      { file: '/app/src/r.tsx' },
      { file: '/app/src/r.tsx?tsr-split=component' },
      {
        file: '/app/src/b.ts',
        specifier: './secret.server',
        line: 3,
        column: 24,
      },
    ]
    expect(info.trace).toEqual(expected)
    info.freezeTrace()
    expect(info.trace).toEqual(expected)
  })

  test('a module that is its own violation: the last step names its own specifier, as before', () => {
    const x = '/app/src/x.server.ts'
    const info = violationInfo(
      violation({
        self: true,
        importer: x,
        importerId: x,
        resolved: x,
        specifier: 'src/x.server.ts',
        loc: null,
      }),
      config(),
      () => ({
        steps: [{ file: '/app/src/glob.ts' }, { file: x }],
        fromEntry: false,
      }),
    )
    expect(info.trace.at(-1)).toEqual({ file: x, specifier: 'src/x.server.ts' })
  })
})

describe('dev error', () => {
  test("names every report, is positioned at the first one's import (1-based, no Rollup loc), and carries no stack frames", () => {
    const first = violation({
      importer: '/app/src/page.mdx',
      importerId: '/app/src/page.mdx',
      loc: { file: '/app/src/page.mdx', line: 4, column: 9 },
    })
    const second = violation({
      importer: '/app/src/c.ts',
      importerId: '/app/src/c.ts',
      loc: null,
    })
    const ctx = {
      config: config(),
      readSource: () => null,
      framework: 'react' as const,
    }
    const report = (v: EdgeViolation) => ({
      violation: v,
      info: violationInfo(v, ctx.config, () => ({
        steps: [],
        fromEntry: false,
      })),
    })
    const error = devViolationError([report(first), report(second)], ctx)
    expect(error.id).toBe('/app/src/page.mdx')
    expect(error.at).toEqual({ line: 4, column: 9 })
    expect('loc' in error).toBe(false)
    expect(error.stack).toBe(error.message)
    expect(error.message).toContain('src/page.mdx')
    expect(error.message).toContain('src/c.ts')
    const unlocated = devViolationError([report(second)], ctx)
    expect(unlocated.id).toBe('/app/src/c.ts')
    expect(unlocated.at).toBeUndefined()
  })
})
