/**
 * Controls of the source-map helpers (source-maps.ts) on maps real
 * transforms emit (Oxc through Vite, esbuild): positions resolve through
 * `@jridgewell/trace-mapping`, executed throws resolve through their
 * stack, tokens are found by parsing whatever the printing, and CRLF
 * sources count lines like editors.
 */
import vm from 'node:vm'
import * as esbuild from 'esbuild'
import { transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import {
  expectMapsTo,
  findNodes,
  inlineSourceMap,
  offsetAt,
  originalPositionOf,
  originalPositions,
  positionAt,
  tokenOffsets,
  traceStack,
} from '../src/source-maps'

// TypeScript-only lines before the throw shift it: a map that skips the
// type erasure points at the wrong line.
const source = `interface Failure {
  message: string
}
type Reason = Failure['message']
export function fail(reason: Reason = 'MARK_FAIL'): string {
  throw new Error(reason)
}
`
const throwLine = 6

describe('positions', () => {
  test('positionAt and offsetAt count every JavaScript line terminator', () => {
    const code = 'a\r\nb\rc\u2028d\u2029e\nf'
    expect(positionAt(code, code.indexOf('e'))).toEqual({ line: 5, column: 0 })
    expect(positionAt(code, code.indexOf('f'))).toEqual({ line: 6, column: 0 })
    for (const char of 'abcdef') {
      const offset = code.indexOf(char)
      expect(offsetAt(code, positionAt(code, offset))).toBe(offset)
    }
  })

  test('tokens are found by parsing, whatever the quotes or spacing', () => {
    const code = `const a = "box"; const b = 'box'; const c = \`box\`; box(); throw a`
    expect(tokenOffsets(code, { string: 'box' })).toHaveLength(3)
    expect(tokenOffsets(code, { identifier: 'box' })).toEqual([
      code.indexOf('box()'),
    ])
    expect(tokenOffsets(code, { throw: true })).toEqual([code.indexOf('throw')])
    expect(
      findNodes(code, (node) => node.type === 'CallExpression'),
    ).toHaveLength(1)
  })
})

describe.each([
  {
    name: 'Oxc (Vite)',
    transform: async (code: string, file: string) => {
      const result = await transformWithOxc(code, file, {
        lang: 'ts',
        sourcemap: true,
      })
      return { code: result.code, map: result.map! }
    },
  },
  {
    name: 'esbuild',
    transform: async (code: string, file: string) => {
      const result = await esbuild.transform(code, {
        loader: 'ts',
        format: 'cjs',
        sourcefile: file,
        sourcemap: 'external',
      })
      return { code: result.code, map: JSON.parse(result.map) }
    },
  },
])('$name maps', ({ transform }) => {
  test('a generated token resolves to the original line and column', async () => {
    const { code, map } = await transform(source, '/app/src/fail.ts')
    const generated = positionAt(code, tokenOffsets(code, { throw: true })[0]!)
    const original = expectMapsTo(map, generated, {
      file: 'src/fail.ts',
      root: '/app',
      line: throwLine,
      column: positionAt(source, tokenOffsets(source, { throw: true })[0]!)
        .column,
    })
    expect(original.source).toContain('fail.ts')
    expect(
      originalPositions(map).some((position) => position.line === throwLine),
    ).toBe(true)
  })

  test('an executed throw resolves through its stack', async () => {
    const { code, map } = await transform(
      `${source}fail()\n`,
      '/app/src/fail.ts',
    )
    const location = '/generated/fail.js'
    let stack = ''
    try {
      vm.runInThisContext(
        `(function (exports, module) {${code.replace(/^export /gm, '')}\n})({}, {})`,
        { filename: location },
      )
    } catch (error) {
      stack = (error as Error).stack!
    }
    expect(stack).toContain('MARK_FAIL')
    const frames = traceStack(stack, (file) =>
      file === location ? map : undefined,
    )
    expect(frames[0]).toMatchObject({
      location,
      original: { line: throwLine },
    })
    expect(frames[0]!.original!.source).toContain('fail.ts')
  })

  test('a wrong line or file fails', async () => {
    const { code, map } = await transform(source, '/app/src/fail.ts')
    const generated = positionAt(code, tokenOffsets(code, { throw: true })[0]!)
    expect(() =>
      expectMapsTo(map, generated, { file: 'src/fail.ts', line: 1 }),
    ).toThrow()
    expect(() =>
      expectMapsTo(map, generated, { file: 'src/other.ts', line: throwLine }),
    ).toThrow()
  })
})

// A dev server names a module's source relative to the module (`fail.ts`
// for `/src/fail.ts`): the source map specification resolves it against
// the map's URL. The name alone does not name `src/fail.ts` (SPEC §5.7).
test('a source relative to its module names the file once resolved against the module', async () => {
  const { code, map } = await transformWithOxc(source, '/app/src/fail.ts', {
    lang: 'ts',
    sourcemap: true,
  })
  const relative = { ...map!, sources: ['fail.ts'] }
  const generated = positionAt(code, tokenOffsets(code, { throw: true })[0]!)
  const expected = { file: 'src/fail.ts', root: '/app', line: throwLine }
  expectMapsTo(relative, generated, {
    ...expected,
    mapUrl: '/app/src/fail.ts?v=1',
  })
  expectMapsTo(relative, generated, {
    ...expected,
    mapUrl: 'file:///app/src/fail.ts',
  })
  expect(() => expectMapsTo(relative, generated, expected)).toThrow()
  expect(() =>
    expectMapsTo(relative, generated, {
      ...expected,
      mapUrl: '/app/lib/fail.js',
    }),
  ).toThrow()
})

test('a CRLF source maps to the lines an editor shows', async () => {
  const crlf = source.replaceAll('\n', '\r\n')
  const { code, map } = await transformWithOxc(crlf, '/app/src/fail.ts', {
    lang: 'ts',
    sourcemap: true,
  })
  const generated = positionAt(code, tokenOffsets(code, { throw: true })[0]!)
  expectMapsTo(map!, generated, { file: 'src/fail.ts', line: throwLine })
})

test('inlineSourceMap reads a data URL map, and nothing else', async () => {
  const { code, map } = await transformWithOxc(source, '/app/src/fail.ts', {
    lang: 'ts',
    sourcemap: true,
  })
  const inline = `${code}\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(map)).toString('base64')}\n`
  expect(inlineSourceMap(inline)).toEqual(JSON.parse(JSON.stringify(map)))
  expect(inlineSourceMap(code)).toBeUndefined()
  const generated = positionAt(code, tokenOffsets(code, { throw: true })[0]!)
  expect(originalPositionOf(inlineSourceMap(inline)!, generated)?.line).toBe(
    throwLine,
  )
})
