// @vitest-environment node
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  captureConsole,
  diagnosticPosition,
  diagnosticsOf,
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { createStartCompiler } from '../../start-plugin-core/tests/regression-helpers'
import { createRscCssCompilerTransforms } from '../src/plugin/rscCssTransform'

const id = '/test/src/stream.tsx'
const source = `import { renderToReadableStream } from '@tanstack/react-start/rsc'
export function render(node: React.ReactNode) {
  const args = [node] as const
  const first = renderToReadableStream(node)
  const second = renderToReadableStream(...args)
  return [first, second]
}
`

afterEach(() => {
  vi.unstubAllEnvs()
})

async function compile(mode: 'dev' | 'build') {
  vi.stubEnv('NODE_ENV', mode === 'dev' ? 'development' : 'production')
  const compilerTransforms = createRscCssCompilerTransforms({
    loadCssExpression: '[]',
  })
  const { compiler } = createStartCompiler({
    env: 'server',
    mode,
    compilerTransforms,
  })
  const warnings: Array<string> = []
  const captured = await captureConsole(() =>
    compiler.compile({
      code: source,
      id,
      warn: (message) => {
        warnings.push(message)
      },
    }),
  )
  return [...captured.diagnostics, ...diagnosticsOf(warnings, 'warning')]
}

describe('RSC stream diagnostics from the real compiler', () => {
  // Bug: identifier/spread stream arguments silently miss CSS delivery
  // (a dev warning is required: decision D8(c), V1R H01).
  // Source: react-start-rsc src/plugin/rscCssTransform.ts:91-93: the
  // `renderToReadableStream` transform skips a spread argument (92) and an
  // argument that is not JSX (93, `isTopLevelJsx`) with `continue`, and
  // nothing in the transform warns.
  // Impact: no diagnostic tells the developer to pass visible JSX instead.
  test.fails(
    'dev explains the CSS limitation once per source file at an original call position',
    async () => {
      const diagnostics = await compile('dev')
      const diagnostic = expectDiagnostic(diagnostics, {
        file: id,
        names: ['renderToReadableStream'],
        times: 1,
      })
      expect(diagnostic.text).toMatch(/css|styles?/i)
      expect(diagnostic.text).toMatch(/jsx|inline|literal/i)
      expect(diagnostic.text).toMatch(
        /pass|use|wrap|move|instead|direct|cannot|unable|unavailable|unsupported|not supported|required|recommend|prefer|provide|static|literal/i,
      )
      const calls = [
        'renderToReadableStream(node)',
        'renderToReadableStream(...args)',
      ]
      const positions = calls.flatMap((call) => {
        const start = source.indexOf(call)
        return Array.from({ length: call.length }, (_, offset) =>
          diagnosticPosition(source, start + offset),
        )
      })
      expect(
        positions.some(
          (position) =>
            findDiagnostics([diagnostic], {
              file: id,
              position,
              source,
            }).length > 0,
        ),
      ).toBe(true)
    },
  )

  test('production has no development-only stream warning', async () => {
    expect(
      findDiagnostics(await compile('build'), {
        names: ['renderToReadableStream'],
      }),
    ).toEqual([])
  })
})
