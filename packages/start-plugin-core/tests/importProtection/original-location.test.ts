import { expect, test } from 'vitest'
import { expectOriginalFrame, originalLocation } from './original-location'
import type { ViolationReport } from './violation-report'

const source = `import { secret } from './secret.server' /* ORIGINAL_IMPORT */
export const read = () => secret() /* ORIGINAL_USE */`
const use = 'src/page.ts:2:27'

test.each(['src/page.ts:1:1', 'src/page.ts:1:26', use, `/app/${use}`])(
  'accepts the original import or surviving use: %s',
  (at) => {
    expect(originalLocation(use, 1).asymmetricMatch(at)).toBe(true)
  },
)

test.each([
  'src/page.ts',
  'src/page.ts:2:26',
  'src/page.ts:3:27',
  'src/page.ts:1:0',
  'src/other.ts:2:27',
  // (absolute or project-relative only, §5.7)
  'page.ts:2:27',
])(
  'rejects an unavailable, unrelated or incorrect original location: %s',
  (at) => {
    expect(originalLocation(use, 1).asymmetricMatch(at)).toBe(false)
  },
)

test('only an explicitly unavailable rewritten location may omit coordinates', () => {
  expect(originalLocation(use, 1, true).asymmetricMatch('src/page.ts')).toBe(
    true,
  )
  expect(
    originalLocation(use, 1, true).asymmetricMatch('src/page.ts:3:1'),
  ).toBe(false)
})

test.each([1, 2])('accepts a minimal original frame at line %s', (line) => {
  const column = line === 1 ? 1 : 27
  const original = source.split('\n')[line - 1]!
  const location = `src/page.ts:${line}:${column}`
  const report: ViolationReport = {
    environment: 'client',
    importer: location,
    specifier: './secret.server',
    trace: [],
    text: '',
    code: {
      line,
      pointsAt: original.slice(column - 1),
      shows: [original],
      location,
    },
  }
  expectOriginalFrame(report, source, use, 1)
  expect(() =>
    expectOriginalFrame(
      { ...report, code: { ...report.code!, shows: ['compiled source'] } },
      source,
      use,
      1,
    ),
  ).toThrow()
})
