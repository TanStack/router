import { describe, expect, it } from 'vitest'
import {
  isExpressionWrapper,
  parseModule,
  unwrapExpression,
} from '../src/compiler'
import type { Node } from 'yuku'

/** The expression of the module's first statement. */
function firstExpression(code: string): Node {
  const parsed = parseModule(code, { lang: 'ts', path: '/app/m.ts' })
  if (!parsed.ok) {
    throw new Error(parsed.diagnostics[0]!.message)
  }
  const stmt = parsed.file.program.body[0] as { expression: Node }
  return stmt.expression
}

describe('parseModule', () => {
  it('reports a syntax error as a positioned parse diagnostic instead of a file', () => {
    const code =
      'export const Route = createFileRoute("/")({\n  component: ,\n})\n'
    const parsed = parseModule(code, { lang: 'tsx', path: '/app/m.tsx' })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) {
      return
    }
    expect(parsed.diagnostics.length).toBeGreaterThan(0)
    const d = parsed.diagnostics[0]!
    expect(d.severity).toBe('error')
    expect(d.by).toBe('parse')
    expect(d.range).toBeDefined()
    // positioned on line 2 (the missing value), in the same text the host
    // locates its message in
    expect(parsed.source.locate(d.range!.start).line).toBe(1)
    expect(parsed.source.code).toBe(code)
  })

  it('parses a module whose only diagnostics are not errors', () => {
    const parsed = parseModule('export const a = 1\n', {
      lang: 'ts',
      path: '/app/m.ts',
    })
    expect(parsed.ok).toBe(true)
  })
})

describe('expression wrappers', () => {
  it('sees through parentheses, TS wrappers and optional chains to the value', () => {
    const wrapped = firstExpression(
      '(((value as A) satisfies B)!)<T>\n' + 'const value = 1\n',
    )
    expect(isExpressionWrapper(wrapped)).toBe(true)
    const inner = unwrapExpression(wrapped)
    expect(inner.type).toBe('Identifier')
    expect(isExpressionWrapper(inner)).toBe(false)
    expect(unwrapExpression(inner)).toBe(inner)

    const chain = firstExpression('a?.b\n')
    expect(chain.type).toBe('ChainExpression')
    expect(isExpressionWrapper(chain)).toBe(true)
    expect(unwrapExpression(chain).type).toBe('MemberExpression')

    const assertion = firstExpression('<T>value\n')
    expect(assertion.type).toBe('TSTypeAssertion')
    expect(unwrapExpression(assertion).type).toBe('Identifier')
  })

  it('does not treat a call or an await as transparent', () => {
    for (const code of ['f()\n', 'await x\n', 'a.b\n']) {
      const node = firstExpression(code)
      expect(isExpressionWrapper(node), code).toBe(false)
      expect(unwrapExpression(node)).toBe(node)
    }
  })
})
