import { describe, expect, it } from 'vitest'
import { parseSync } from 'vite'
import { MemoryHost } from './helpers'
import type { PlanContext, Planner } from '../src/compiler'
import type { Node } from 'yuku'

// Kept: the sole coverage of emit paths no shipped planner reaches yet: the
// edits, inserts and generated units below are a planner's that the
// oracle's public inputs cannot write. Each row is a contract the renderer
// owns for any planner (statement separation, an expression boundary's
// shape, rule L), checked as text and re-parsed.
// Source: whole-PR review C5-gemini-r2 (V-21, V-24, V-26).

/** A planner running `plan` on every module. */
const planner = (plan: (ctx: PlanContext) => void): Planner => ({
  name: 'toy-emit',
  tier: 1,
  gate: () => true,
  plan,
})

/** The call expression whose callee starts at the `nth` occurrence of `callee(`. */
function callOf(ctx: PlanContext, callee: string, nth = 0): Node {
  const code = ctx.analysis.source.code
  let at = -1
  for (let i = 0; i <= nth; i++) {
    at = code.indexOf(`${callee}(`, at + 1)
  }
  const call = ctx.t1.parentOf(ctx.t1.nodeAt(at)!)
  if (call?.type !== 'CallExpression') {
    throw new Error(`no call of ${callee}`)
  }
  return call
}

/** `wrap(x)` → `x`: the call replaced by the argument it keeps. */
const unwrap = (ctx: PlanContext, call: Node) => {
  if (call.type !== 'CallExpression') {
    throw new Error('not a call')
  }
  ctx.replaceExpression({
    node: call,
    with: { k: 'kept', node: call.arguments[0]! },
    by: 'toy-emit',
  })
}

/** The env module of `code` under `plan`; fails when it does not parse. */
async function envOf(code: string, plan: (ctx: PlanContext) => void) {
  const out = await new MemoryHost({
    files: { '/app/mod.ts': code },
  }).compile('/app/mod.ts', [planner(plan)])
  const result = parseSync('mod.ts', out!.code, {
    lang: 'ts',
    sourceType: 'module',
  })
  expect(result.errors, out!.code).toEqual([])
  return out!.code
}

/**
 * `code`'s program, positions, parentheses and a literal's spelling aside
 * (its value stays): two texts that differ only in formatting give the same
 * tree, and every value (a literal, a returned or passed expression) is in it.
 */
function programOf(code: string): unknown {
  const { program, errors } = parseSync('mod.ts', code, {
    lang: 'ts',
    sourceType: 'module',
  })
  expect(errors, code).toEqual([])
  const strip = (n: unknown): unknown => {
    if (Array.isArray(n)) {
      return n.map(strip)
    }
    if (n === null || typeof n !== 'object') {
      return n
    }
    const node = n as Record<string, unknown>
    if (node.type === 'ParenthesizedExpression') {
      return strip(node.expression)
    }
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node)) {
      if (k !== 'start' && k !== 'end' && k !== 'range' && k !== 'raw') {
        out[k] = strip(v)
      }
    }
    return out
  }
  return strip(program.body)
}

/** `code` is `expected`, whitespace, parentheses and semicolons that change nothing aside. */
const expectProgram = (code: string, expected: string) =>
  expect(programOf(code), code).toEqual(programOf(expected))

describe('statement separation', () => {
  // A generated unit renders before the module's first statement: what
  // separates a statement from the one before it applies there too.
  it('puts a `;` between a generated unit and a first statement whose first token continues it', async () => {
    const code = await envOf('wrap(() => 1)()\n', (ctx) => {
      ctx.rewrites.addGenerated({
        body: [{ k: 'text', parts: ['const g = init()\n'] }],
        declares: [],
        effectful: true,
        anchor: { k: 'after-header' },
        home: 'env',
        by: 'toy-emit',
      })
      unwrap(ctx, callOf(ctx, 'wrap'))
    })
    expectProgram(code, 'const g = init();\n(() => 1)()\n')
  })

  it('starts the statement after a generated unit without a line end on a line of its own', async () => {
    const code = await envOf('export const a = 1\n', (ctx) => {
      ctx.rewrites.addGenerated({
        body: [{ k: 'text', parts: ['console.log("init")'] }],
        declares: [],
        effectful: true,
        anchor: { k: 'after-header' },
        home: 'env',
        by: 'toy-emit',
      })
    })
    expectProgram(code, 'console.log("init")\nexport const a = 1\n')
    // (the generated unit has its line: the statement starts the next one)
    expect(code.split('\n')[1]).toMatch(/^export const a\b/)
  })
})

describe('directive prologue', () => {
  // A string statement following a removed statement joins its function's
  // prologue unless something precedes it: a generated comment is no token.
  // Source: emit prototype review (Gemini, `lastTokenBefore`)
  it('keeps a string statement after a removed one and a generated comment an expression', async () => {
    const source =
      "export function f(...a: Array<unknown>) {\n  wrap()\n  'use strict'\n  return a.length\n}\n"
    const code = await envOf(source, (ctx) => {
      const call = callOf(ctx, 'wrap')
      ctx.rewrites.edit({
        range: { start: call.start, end: call.end },
        body: [],
        by: 'toy-emit',
      })
      ctx.rewrites.insert({
        at: source.indexOf("'use strict'"),
        body: [{ k: 'text', parts: ['/* c */ '] }],
        by: 'toy-emit',
      })
    })
    expect(code).toContain("/* c */ void 'use strict'")
  })
})

describe('inserts', () => {
  // A renamed export loses its `export` keyword (placement rewrites the
  // statement): an insert at the statement's start is its text and renders
  // once, with it.
  it.each([
    '/* c */ export function foo() { return 1 }\n',
    'export const a = 1\nexport function foo() { return 1 }\n',
  ])(
    'renders an insert at the start of a statement placement rewrites: %j',
    async (source) => {
      const code = await envOf(source, (ctx) => {
        const foo = ctx.analysis.exports.find(
          (e) => e.kind === 'local' && e.name === 'foo',
        )
        if (foo?.kind !== 'local' || foo.local === null) {
          throw new Error('no foo')
        }
        ctx.renameRefs(
          foo.local,
          { sym: ctx.names.alloc('renamed').sym },
          'toy-emit',
        )
        const item =
          ctx.t1.items[
            ctx.t1.units[ctx.t1.declaringUnits.get(foo.local)![0]!]!.item
          ]!
        ctx.rewrites.insert({
          at: item.range.start,
          body: [{ k: 'text', parts: ['/*ins*/'] }],
          by: 'toy-emit',
        })
      })
      expect(code.match(/\/\*ins\*\//g)).toEqual(['/*ins*/'])
      expect(code).toMatch(/function renamed\s*\(/)
    },
  )
})

describe('expression boundaries', () => {
  // A boundary rendering bare where the open one keeps its node reports the
  // shape it renders: the outer one then wraps what it is, not an unknown.
  it.each([
    {
      name: 'an arrow called',
      code: 'export const x = outer(inner(() => 1))()\n',
      expected: 'export const x = (() => 1)()\n',
    },
    {
      name: 'a `new` without arguments, a member read',
      code: 'export const x = outer(inner(new Foo)).bar\n',
      expected: 'export const x = new Foo().bar\n',
    },
  ])(
    'keeps the shape of a nested boundary: $name',
    async ({ code, expected }) => {
      const out = await envOf(code, (ctx) => {
        unwrap(ctx, callOf(ctx, 'outer'))
        unwrap(ctx, callOf(ctx, 'inner'))
      })
      expectProgram(out, expected)
    },
  )

  // Rule L across an edit that renders nothing: the boundary's end meets the
  // text after the erased range.
  it('keeps a kept operand apart from the operator after an erased space', async () => {
    const code = await envOf('export const r = wrap(a) in obj\n', (ctx) => {
      const call = callOf(ctx, 'wrap')
      unwrap(ctx, call)
      ctx.rewrites.edit({
        range: { start: call.end, end: call.end + 1 },
        body: [],
        by: 'toy-emit',
      })
    })
    expectProgram(code, 'export const r = a in obj\n')
  })

  it('keeps a kept operand apart from an insert after an empty one', async () => {
    const code = await envOf('export const r = wrap(a) + b\n', (ctx) => {
      const call = callOf(ctx, 'wrap')
      unwrap(ctx, call)
      for (const text of ['', 'in obj ']) {
        ctx.rewrites.insert({
          at: call.end,
          body: [{ k: 'text', parts: [text] }],
          by: 'toy-emit',
        })
      }
    })
    expectProgram(code, 'export const r = a in obj + b\n')
  })
})
