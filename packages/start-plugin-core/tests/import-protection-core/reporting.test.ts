/**
 * Traces, dev report flushing, original positions and the build verdict
 * fixed point (DESIGN §3.14.4, §4.1.3; R21, R33), on hand-made graphs.
 */
import { describe, expect, test } from 'vitest'
import { resolveImportProtectionConfig } from '../../src/import-protection/config'
import { EdgeIndex, buildTrace } from '../../src/import-protection/graph-trace'
import {
  Locator,
  originalPositionFor,
} from '../../src/import-protection/locate'
import { DevReporter } from '../../src/import-protection/report'
import { BuildVerdicts } from '../../src/import-protection/verdict'
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
      { resolved: '/app/src/a.ts', specifier: './a', line: 2, column: 15 },
    ])
    index.set('/app/src/a.ts', [
      { resolved: '/app/src/b.ts', specifier: './b' },
    ])
    expect(
      buildTrace(
        '/app/src/b.ts',
        graph(chain, ['/app/src/entry.ts']),
        index,
        20,
      ),
    ).toEqual([
      { file: '/app/src/entry.ts', specifier: './a', line: 2, column: 15 },
      { file: '/app/src/a.ts', specifier: './b' },
      { file: '/app/src/b.ts' },
    ])
  })

  test('without a known entry, start at a module nothing imports; survive cycles; cut keeping the importer', () => {
    const g = graph({ ...chain, '/app/src/b.ts': ['/app/src/entry.ts'] })
    expect(buildTrace('/app/src/b.ts', g, null, 20).map((s) => s.file)).toEqual(
      [
        '/app/src/main.ts',
        '/app/src/entry.ts',
        '/app/src/a.ts',
        '/app/src/b.ts',
      ],
    )
    expect(buildTrace('/app/src/b.ts', g, null, 1).map((s) => s.file)).toEqual([
      '/app/src/a.ts',
      '/app/src/b.ts',
    ])
  })

  test('the edge index supplies edges the bundler graph has not recorded yet; queries are stripped from files', () => {
    const index = new EdgeIndex()
    index.set('/app/src/r.tsx?tsr-split=component', [
      { resolved: '/app/src/b.ts', specifier: './b' },
    ])
    expect(
      buildTrace(
        '/app/src/b.ts',
        graph({ '/app/src/entry.ts': ['/app/src/r.tsx?tsr-split=component'] }, [
          '/app/src/entry.ts',
        ]),
        index,
        20,
      ).map((s) => [s.file, s.specifier]),
    ).toEqual([
      ['/app/src/entry.ts', undefined],
      ['/app/src/r.tsx', './b'],
      ['/app/src/b.ts', undefined],
    ])
  })

  test('the importer step of a violation names the denied import and its location', () => {
    const info = violationInfo(violation(), config(), () => [
      { file: '/app/src/a.ts', specifier: './b' },
      { file: '/app/src/b.ts' },
    ])
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

describe('dev reports', () => {
  function setup(options: ImportProtectionOptions = {}) {
    let now = 0
    const timers: Array<{ fn: () => void; ms: number }> = []
    const printed: Array<string> = []
    const g = graph({})
    const reporter = new DevReporter({
      config: config(options),
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
          buildTrace(v.importerId, g, null, 20),
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

  test('through an input map, generated lines are counted by LF only (a lone CR breaks no line)', () => {
    // line 0 → src line 1; line 1 → src line 2; line 2 → src line 3 (all column 0)
    const map = {
      version: 3,
      sources: ['page.mdx'],
      names: [],
      mappings: 'AAAA;AACA;AACA',
    }
    const code = `a\rb\nimport x from './x'\nc`
    const at = new Locator(code, '/app/src/page.mdx.js', () => map)
    expect(at.at(code.indexOf('import'))).toEqual({
      file: '/app/src/page.mdx',
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
    expect(originalPositionFor(map, 0, 3, '/app/src/page.mdx.js')).toEqual({
      file: '/app/docs/page.mdx',
      line: 5,
      column: 3,
    })
    expect(originalPositionFor(map, 1, 6, '/app/src/page.mdx.js')).toEqual({
      file: '/app/docs/page.mdx',
      line: 10,
      column: 1,
    })
    expect(originalPositionFor(map, 1, 2, '/app/src/page.mdx.js')).toBeNull()
    expect(originalPositionFor(map, 5, 0, '/app/src/page.mdx.js')).toBeNull()
  })
})

describe('build verdicts (R33)', () => {
  test('onViolation once per surviving logical edge; a veto asks for a pass; reports are the final pass', async () => {
    const state = new BuildVerdicts()
    const asked: Array<string> = []
    const changes: Array<string> = []
    state.onStateChange = (k, s) => changes.push(`${k}:${s}`)
    const ask = (v: EdgeViolation) => {
      asked.push(v.edgeKey)
      return Promise.resolve(v.edgeKey === 'veto' ? false : undefined)
    }
    const a = violation({ edgeKey: 'a' })
    const a2 = violation({ edgeKey: 'a', importerId: '/app/src/r.tsx?split' })
    const veto = violation({ edgeKey: 'veto' })
    const first = await state.decide([a, a2, veto], ask)
    expect(first).toEqual({ needPass: true, reports: [] })
    expect(state.stateOf('veto')).toBe('allowed')
    expect(changes).toEqual(['veto:allowed'])
    // pass 2: the vetoed module is real; a new edge it exposed survives
    const inner = violation({ edgeKey: 'inner' })
    const second = await state.decide([a, inner], ask)
    expect(second.needPass).toBe(false)
    expect(second.reports.map((v) => v.edgeKey)).toEqual(['a', 'inner'])
    expect(asked).toEqual(['a', 'veto', 'inner'])
    expect(state.passes).toBe(2)
    // a new logical build asks again and resets the states
    state.beginLogicalBuild()
    expect(changes).toEqual(['veto:allowed', 'veto:mock'])
    expect(state.stateOf('veto')).toBe('mock')
    await state.decide([a], ask)
    expect(asked).toEqual(['a', 'veto', 'inner', 'a'])
  })

  test('runToFixedPoint rebuilds while a pass vetoes, and refuses to loop forever', async () => {
    const state = new BuildVerdicts()
    let n = 0
    await state.runToFixedPoint(async () => {
      n++
      await state.decide([violation({ edgeKey: `e${n}` })], (v) =>
        Promise.resolve(v.edgeKey === 'e1' ? false : undefined),
      )
    })
    expect(n).toBe(2)
    const looping = new BuildVerdicts()
    let m = 0
    await expect(
      looping.runToFixedPoint(async () => {
        m++
        await looping.decide([violation({ edgeKey: `x${m}` })], () =>
          Promise.resolve(false),
        )
      }, 3),
    ).rejects.toThrow(/did not settle after 3 passes/)
  })
})
