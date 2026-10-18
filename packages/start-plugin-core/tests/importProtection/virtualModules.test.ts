/**
 * The mock modules import protection serves, evaluated as ES modules and
 * linked to the virtual modules the adapter resolves for them: what a mock
 * is when used (a safe mock, `mock-helpers.ts`), and that the dev mock of a
 * client violation reports each use through the browser console as
 * `mockAccess` says. Which names each mock exposes is covered by
 * analysis.exports.test.ts ("mock modules expose every importable name");
 * what the mocks of a real app do, by the mock-mode rows of
 * integration/importProtection/{build,dev}.test.ts.
 */
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  generateDevSelfDenialModule,
  generateSelfContainedMockModule,
  loadSilentMockModule,
  mockRuntimeModuleIdFromViolation,
} from '../../src/import-protection/virtualModules'
import {
  evaluateMockModule,
  evaluateWithMock,
  expectSafeMock,
} from './mock-helpers'
import type { ViolationInfo } from '../../src/import-protection/trace'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the silent mock', () => {
  test('is a safe mock, as is what it gives', async () => {
    const mod = await evaluateMockModule(loadSilentMockModule().code)
    expectSafeMock(mod.default)
    expectSafeMock(mod.default())
    expectSafeMock(new mod.default.Client())
  })

  // The build-level effect (an unused mock is dropped from the bundle) is
  // pinned in integration/importProtection/known-bugs.test.ts.
  test('evaluating and using it has no side effects', async () => {
    const globals = Object.getOwnPropertyNames(globalThis)
    const output = (['log', 'info', 'warn', 'error'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    )
    const mod = await evaluateMockModule(loadSilentMockModule().code)
    String(mod.default.anything())
    expect(Object.getOwnPropertyNames(globalThis)).toEqual(globals)
    expect(output.filter((spy) => spy.mock.calls.length > 0)).toEqual([])
  })
})

describe('the build mock of a denied file', () => {
  test('exposes its exports as safe mocks, as is what they give', async () => {
    const mod = await evaluateMockModule(
      generateSelfContainedMockModule(['getSecret', 'api']).code,
    )
    expectSafeMock(mod.getSecret)
    expectSafeMock(mod.getSecret())
    expectSafeMock(new mod.api.Client())
  })
})

/** A client violation of a dev mock: `./secret.server` in a route. */
const violation: ViolationInfo = {
  env: 'client',
  envType: 'client',
  type: 'file',
  behavior: 'mock',
  specifier: './secret.server',
  importer: '/project/src/routes/index.tsx',
  trace: [
    { file: '/project/src/main.tsx' },
    {
      file: '/project/src/routes/index.tsx',
      specifier: './secret.server',
      line: 5,
      column: 10,
    },
  ],
}

/**
 * Silences `console.warn` and `console.error`; the returned function reads
 * the messages of the errors logged since, by console method.
 */
function captureConsole() {
  const spies = {
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  }
  const messages = (spy: (typeof spies)['warn']) =>
    spy.mock.calls.map(([logged]) => String((logged as Error).message))
  return () => ({ warn: messages(spies.warn), error: messages(spies.error) })
}

// In dev, the mock served in place of a denied file imports a mock runtime
// chosen for the violation (`mockAccess`): each use of the mock reports the
// violation in the browser console.
describe('the dev mock of a denied file', () => {
  /**
   * Evaluates the dev mock of a denied file exporting `getSecret`, for
   * `violation` with the `mockAccess` mode `mode`, uses it (default: calls
   * `getSecret()`), and returns the messages the use logged, by console
   * method.
   */
  async function useDevMock(
    mode: 'error' | 'warn' | 'off',
    info: ViolationInfo = violation,
    use: (mod: Record<string, any>) => unknown = (mod) => mod.getSecret(),
  ) {
    const output = captureConsole()
    const runtimeId = mockRuntimeModuleIdFromViolation(info, mode, '/project')
    const mod = await evaluateMockModule(
      generateDevSelfDenialModule(['getSecret'], runtimeId).code,
    )
    use(mod)
    return output()
  }

  test('is a safe mock, whatever mockAccess', async () => {
    for (const mode of ['error', 'warn', 'off'] as const) {
      await useDevMock(mode, violation, (mod) => {
        expectSafeMock(mod.getSecret)
        expectSafeMock(mod.getSecret())
      })
    }
  })

  test.each([
    { mode: 'error', method: 'error' },
    { mode: 'warn', method: 'warn' },
  ] as const)(
    'mockAccess $mode: a use in the client is reported with console.$method, naming the import, importer and trace',
    async ({ mode, method }) => {
      const output = await useDevMock(mode)
      expect(output[method === 'error' ? 'warn' : 'error']).toEqual([])
      expect(output[method]).toEqual([expect.any(String)])
      expect(output[method][0]).toContain('Mocked import used in dev client')
      for (const text of [
        './secret.server',
        '/project/src/routes/index.tsx',
        'src/main.tsx',
        'src/routes/index.tsx:5:10',
      ]) {
        expect(output[method][0]).toContain(text)
      }
    },
  )

  test.each<{ name: string; use: (mod: Record<string, any>) => unknown }>([
    { name: 'a conversion to a string', use: (mod) => String(mod.getSecret) },
    { name: 'a toString() call', use: (mod) => mod.getSecret.toString() },
    { name: '`new`', use: (mod) => new mod.getSecret() },
    {
      name: 'a property write',
      use: (mod) => {
        mod.getSecret.value = 1
      },
    },
  ])('$name is reported as a use', async ({ use }) => {
    expect(await useDevMock('error', violation, use)).toEqual({
      warn: [],
      error: [expect.stringContaining('Mocked import used in dev client')],
    })
  })

  test('mockAccess off: a use is not reported', async () => {
    expect(await useDevMock('off')).toEqual({ warn: [], error: [] })
  })
})

// In dev, an importer of a denied module links against a mock edge exporting
// the names it uses, as members of the mock runtime chosen for the violation.
test('the dev mock edge of a denied import reports a use in the client', async () => {
  const output = captureConsole()
  const { read } = await evaluateWithMock(
    `import { secret } from './secret.server'
export const read = () => secret()`,
    './secret.server',
    {
      runtimeId: mockRuntimeModuleIdFromViolation(
        violation,
        'error',
        '/project',
      ),
    },
  )
  read()
  expect(output()).toEqual({
    warn: [],
    error: [expect.stringContaining('Mocked import used in dev client')],
  })
})
