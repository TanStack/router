import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping'
import { describe, expect, it } from 'vitest'
import { OutputBuilder, SourceText } from '../src/compiler'
import type { BuilderEdit } from '../src/compiler'

/** ECMAScript line/column of an offset (LF, CRLF, lone CR, U+2028, U+2029). */
function ecmaLocate(
  code: string,
  offset: number,
): { line: number; column: number } {
  let line = 0
  let lineStart = 0
  for (let i = 0; i < offset; i++) {
    const c = code.charCodeAt(i)
    if (c === 13) {
      if (code.charCodeAt(i + 1) === 10) {
        i++
      }
      line++
      lineStart = i + 1
    } else if (c === 10 || c === 0x2028 || c === 0x2029) {
      line++
      lineStart = i + 1
    }
  }
  return { line, column: offset - lineStart }
}

interface Run {
  origStart: number
  origEnd: number
  genStart: number
}

/** A naive oracle renderer recording each copied run. */
function oracle(
  code: string,
  ops: Array<{ copy: [number, number] } | { text: string }>,
): { out: string; runs: Array<Run> } {
  let out = ''
  const runs: Array<Run> = []
  for (const op of ops) {
    if ('copy' in op) {
      runs.push({
        origStart: op.copy[0],
        origEnd: op.copy[1],
        genStart: out.length,
      })
      out += code.slice(op.copy[0], op.copy[1])
    } else {
      out += op.text
    }
  }
  return { out, runs }
}

function checkAllTokens(
  code: string,
  out: string,
  runs: Array<Run>,
  map: NonNullable<ReturnType<OutputBuilder['finish']>['map']>,
): number {
  const tracer = new TraceMap(map as never)
  let checked = 0
  const re = /[\p{L}_$][\p{L}\p{N}_$]*|[^\s\w$]/gu
  for (const run of runs) {
    const text = code.slice(run.origStart, run.origEnd)
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const orig = run.origStart + m.index
      const gen = run.genStart + m.index
      const o = ecmaLocate(code, orig)
      const g = ecmaLocate(out, gen)
      const pos = originalPositionFor(tracer, {
        line: g.line + 1,
        column: g.column,
      })
      expect(
        pos,
        `token ${JSON.stringify(m[0])} at original ${orig}`,
      ).toMatchObject({ line: o.line + 1, column: o.column })
      checked++
    }
  }
  return checked
}

const FIXTURE_LS = [
  "import { helper } from './helper'",
  'const text = "before after"   // a raw U+2028 inside a string',
  'export function Comp() {',
  '  if (text.length > 3) {',
  '    throw new Error(`fail ${helper(text)}`)',
  '  }',
  '  return <div className="x">{text}</div>',
  '}',
  'const 𝒳 = "😀"; export const Route = { component: Comp, loader: () => helper(𝒳) }',
  '',
].join('\n')

describe('OutputBuilder', () => {
  it('maps every token of an env-style output with nested edits, raw U+2028 included', () => {
    const code = FIXTURE_LS
    const src = new SourceText(code)
    const b = new OutputBuilder(src, '/app/route.tsx')
    const throwAt = code.indexOf('throw')
    const importEnd = code.indexOf('\n') + 1
    const edits: Array<BuilderEdit> = [
      { kind: 'insert', at: importEnd, text: "import { tsr } from 'tsr'\n" },
      {
        kind: 'replace',
        start: throwAt,
        end: throwAt + 'throw new Error(`fail ${helper(text)}`)'.length,
        parts: [
          { text: 'tsr(' },
          {
            start: throwAt + 6,
            end: throwAt + 'throw new Error(`fail ${helper(text)}`)'.length,
          },
          { text: ')' },
        ],
      },
    ]
    b.copy(0, code.length, edits)
    b.text('export { Comp as tsrComp }\n')
    const { code: out, map } = b.finish()
    expect(map).not.toBeNull()
    const { out: expected, runs } = oracle(code, [
      { copy: [0, importEnd] },
      { text: "import { tsr } from 'tsr'\n" },
      { copy: [importEnd, throwAt] },
      { text: 'tsr(' },
      {
        copy: [
          throwAt + 6,
          throwAt + 'throw new Error(`fail ${helper(text)}`)'.length,
        ],
      },
      { text: ')' },
      {
        copy: [
          throwAt + 'throw new Error(`fail ${helper(text)}`)'.length,
          code.length,
        ],
      },
      { text: 'export { Comp as tsrComp }\n' },
    ])
    expect(out).toBe(expected)
    expect(map!.sources).toEqual(['/app/route.tsx'])
    const n = checkAllTokens(code, out, runs, map!)
    expect(n).toBeGreaterThan(60)
  })

  it('maps a derived-style output assembled from reversed slices of a lone-CR file', () => {
    const code = FIXTURE_LS.replace(/\n/g, '\r')
    const src = new SourceText(code)
    const b = new OutputBuilder(src, '/app/route.tsx')
    const lines: Array<[number, number]> = []
    let start = 0
    for (let i = 0; i < code.length; i++) {
      if (code.charCodeAt(i) === 13) {
        lines.push([start, i + 1])
        start = i + 1
      }
    }
    const compStart = lines[2]![0]
    const compEnd = lines[7]![1]
    const ops: Array<{ copy: [number, number] } | { text: string }> = [
      { text: 'const TsrSplit = 1\n' },
      { copy: [compStart, compEnd] },
      { copy: [lines[1]![0], lines[1]![1]] },
      { copy: [lines[0]![0], lines[0]![1]] },
      { text: 'export { Comp as component }\n' },
    ]
    for (const op of ops) {
      if ('copy' in op) {
        b.copy(op.copy[0], op.copy[1])
      } else {
        b.text(op.text)
      }
    }
    const { code: out, map } = b.finish()
    const { out: expected, runs } = oracle(code, ops)
    expect(out).toBe(expected)
    const n = checkAllTokens(code, out, runs, map!)
    expect(n).toBeGreaterThan(50)
  })

  it('maps glue with mapTo to its anchor and leaves other glue unmapped', () => {
    const code = 'const a = 1\nconst b = a + 1\n'
    const src = new SourceText(code)
    const b = new OutputBuilder(src, 'x.ts')
    b.copy(0, 12)
    b.text('const c = ', 12)
    b.text('/* glue */ ')
    b.copy(12, code.length)
    const { code: out, map } = b.finish()
    expect(out).toBe('const a = 1\nconst c = /* glue */ const b = a + 1\n')
    const tracer = new TraceMap(map as never)
    expect(originalPositionFor(tracer, { line: 2, column: 0 })).toMatchObject({
      line: 2,
      column: 0,
    })
    const unmapped = originalPositionFor(tracer, { line: 2, column: 11 })
    expect(unmapped.line).toBeNull()
    expect(originalPositionFor(tracer, { line: 2, column: 21 })).toMatchObject({
      line: 2,
      column: 0,
    })
  })

  it('produces code only with map: false and the same bytes', () => {
    const code = FIXTURE_LS
    const src = new SourceText(code)
    const a = new OutputBuilder(src, 'x', { map: false })
    const m = new OutputBuilder(src, 'x')
    for (const b of [a, m]) {
      b.copy(40, code.length)
      b.text('// tail')
      b.newline()
    }
    const ra = a.finish()
    const rm = m.finish()
    expect(ra.map).toBeNull()
    expect(ra.code).toBe(rm.code)
    expect(ra.code.endsWith('// tail\n')).toBe(true)
  })

  it('SourceText counts ECMAScript line terminators', () => {
    const src = new SourceText('a b\r\nc\rd\n')
    expect(src.locate(2)).toEqual({ line: 1, column: 0 })
    expect(src.locate(5)).toEqual({ line: 2, column: 0 })
    expect(src.locate(7)).toEqual({ line: 3, column: 0 })
    const lf = new SourceText('a b\r\nc\rd\n', { lines: 'lf' })
    expect(lf.locate(2)).toEqual({ line: 0, column: 2 })
  })
})
