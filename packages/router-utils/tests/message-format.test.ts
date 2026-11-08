/**
 * The format every host prints a compile message in (R101): files named
 * relative to the project root, and one 1-based position per message. On
 * Vite the message carries it (Rollup's `loc` column is 0-based, and a Vite
 * build drops `loc` from warnings), with a code frame; the webpack-family
 * hosts print the `loc` the loader records (`located-diagnostics.test.ts`).
 */
import { describe, expect, it } from 'vitest'
import { displayPath, positionSuffix, viteLog } from '../src/compiler'

describe('displayPath', () => {
  it('names a file of the project relative to its root', () => {
    expect(displayPath('/app/src/routes/a.tsx', '/app')).toBe(
      'src/routes/a.tsx',
    )
    expect(displayPath('/app/src/routes/a.tsx', '/app/')).toBe(
      'src/routes/a.tsx',
    )
    expect(displayPath('C:\\app\\src\\a.tsx', 'C:\\app')).toBe('src/a.tsx')
  })

  it('names a file outside the root, or without one, by its path', () => {
    expect(displayPath('/app2/src/a.tsx', '/app')).toBe('/app2/src/a.tsx')
    expect(displayPath('/lib/a.ts', '/app')).toBe('/lib/a.ts')
    expect(displayPath('/app/a.ts', undefined)).toBe('/app/a.ts')
  })
})

describe('viteLog', () => {
  const code =
    "import x from 'x'\nconst a = 1\nconst labels = make('a')\nexport { a }\n"

  it('appends the one 1-based position and frames the line, without a 0-based loc', () => {
    const log = viteLog(
      '[tanstack-router] message',
      { line: 3, column: 6 },
      code,
      'src/a.tsx',
      '/app/src/a.tsx',
    )
    expect(log).toEqual({
      message: '[tanstack-router] message (src/a.tsx:3:7)',
      id: '/app/src/a.tsx',
      frame: [
        "1  |  import x from 'x'",
        '2  |  const a = 1',
        "3  |  const labels = make('a')",
        '   |        ^',
        '4  |  export { a }',
        '5  |  ',
      ].join('\n'),
    })
    expect(log).not.toHaveProperty('loc')
    expect(positionSuffix('src/a.tsx', { line: 3, column: 6 })).toBe(
      ' (src/a.tsx:3:7)',
    )
  })

  it('leaves a message without a position as it is, and frames nothing without the text', () => {
    expect(viteLog('m', undefined, code, 'src/a.tsx', '/a')).toEqual({
      message: 'm',
      id: '/a',
    })
    expect(
      viteLog('m', { line: 1, column: 0 }, null, 'src/a.tsx', '/a'),
    ).toEqual({ message: 'm (src/a.tsx:1:1)', id: '/a' })
  })
})
