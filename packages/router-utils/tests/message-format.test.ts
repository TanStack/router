/**
 * The format every host prints a compile message in (R101): files named
 * relative to the project root, and one position per message. A Vite build
 * drops `loc` from warnings: the message carries the position, 1-based, with
 * a code frame. Vite dev gets `loc` (0-based by Rollup's contract), which it
 * maps through earlier plugins' source maps and frames itself. The
 * webpack-family hosts print the 1-based `loc` the loader records
 * (`located-diagnostics.test.ts`).
 */
import { describe, expect, it } from 'vitest'
import { displayPath, viteLog } from '../src/compiler'
import { positionSuffix } from '../src/compiler/diagnostics'

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

  it('in a build, appends the one 1-based position and frames the line', () => {
    const log = viteLog(
      '[tanstack-router] message',
      { line: 3, column: 6 },
      code,
      'src/a.tsx',
      '/app/src/a.tsx',
      false,
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
    expect(positionSuffix('src/a.tsx', { line: 3, column: 6 })).toBe(
      ' (src/a.tsx:3:7)',
    )
  })

  it('in a build, widens the gutter for three-digit lines', () => {
    const long = Array.from({ length: 101 }, (_, i) => `line${i + 1}`).join(
      '\n',
    )
    const log = viteLog(
      'm',
      { line: 100, column: 0 },
      long,
      'a.ts',
      '/a',
      false,
    )
    expect(log.frame).toBe(
      [
        '98  |  line98',
        '99  |  line99',
        '100 |  line100',
        '    |  ^',
        '101 |  line101',
      ].join('\n'),
    )
  })

  it('in dev, hands Vite the position as loc to map and frame, the message as it is', () => {
    expect(
      viteLog(
        'm',
        { line: 3, column: 6 },
        code,
        'src/a.tsx',
        '/app/src/a.tsx',
        true,
      ),
    ).toEqual({
      message: 'm',
      id: '/app/src/a.tsx',
      loc: { file: '/app/src/a.tsx', line: 3, column: 6 },
    })
  })

  it('leaves a message without a position as it is, and carries a position mapped elsewhere in the message, unframed', () => {
    for (const dev of [false, true]) {
      expect(viteLog('m', undefined, code, 'src/a.tsx', '/a', dev)).toEqual({
        message: 'm',
        id: '/a',
      })
      expect(
        viteLog('m', { line: 1, column: 0 }, null, 'src/a.tsx', '/a', dev),
      ).toEqual({ message: 'm (src/a.tsx:1:1)', id: '/a' })
    }
  })
})
