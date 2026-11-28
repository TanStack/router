import { afterEach, describe, expect, test, vi } from 'vitest'
import { isVitestRun } from '../src/test-mode'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isVitestRun', () => {
  test('is true for the config Vitest resolves to run tests', () => {
    vi.stubEnv('VITEST', 'true')

    expect(isVitestRun({ command: 'serve', mode: 'test' })).toBe(true)
  })

  // A test file can start a dev server or a build of the app. Both run in a
  // process where Vitest has set `VITEST`.
  test.each([
    { command: 'serve', mode: 'development' },
    { command: 'build', mode: 'production' },
    { command: 'build', mode: 'test' },
  ])(
    'is false for the $command command in $mode mode inside a Vitest process',
    (env) => {
      vi.stubEnv('VITEST', 'true')

      expect(isVitestRun(env)).toBe(false)
    },
  )

  // `vite dev --mode test` serves the app.
  test('is false for a dev server in test mode outside Vitest', () => {
    vi.stubEnv('VITEST', undefined)

    expect(isVitestRun({ command: 'serve', mode: 'test' })).toBe(false)
  })
})
