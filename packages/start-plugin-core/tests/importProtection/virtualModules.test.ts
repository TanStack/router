/**
 * The mock modules import protection serves, evaluated as ES modules: what
 * a mock is when used, that the build mock of a denied file stands alone,
 * and that the dev mock of a client violation reports each use through the
 * browser console. Which names each mock exposes is covered by
 * analysis.exports.test.ts ("mock modules expose every importable name").
 */
import { createModuleGraph } from '@tanstack/compiler-test-utils/module-linker'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  generateDevSelfDenialModule,
  generateSelfContainedMockModule,
  loadMockRuntimeModule,
  loadSilentMockModule,
  mockRuntimeModuleIdFromViolation,
} from '../../src/import-protection/virtualModules'
import {
  loadResolvedVirtualModule,
  resolveInternalVirtualModuleId,
} from '../../src/vite/import-protection-plugin/virtualModules'
import { evaluateWithMock, isMock } from './mock-helpers'
import type { ViolationInfo } from '../../src/import-protection/trace'

type MockValue = {
  toString: () => string
  valueOf: () => string
  toJSON: () => string
}

type MockFunction = {
  (): MockValue
}

/**
 * Evaluates a generated module as an ES module; its imports link to the
 * virtual modules import protection serves (none when `standalone`).
 */
function evaluateGeneratedModule<T>(
  code: string,
  options: { standalone?: boolean } = {},
): Promise<T> {
  const id = '/test/mock.js'
  return createModuleGraph({
    modules: { [id]: code },
    ...(!options.standalone && {
      resolve: (specifier: string) => resolveInternalVirtualModuleId(specifier),
      load: (virtualId: string) => loadResolvedVirtualModule(virtualId)?.code,
    }),
  }).import(id) as Promise<T>
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the silent mock', () => {
  test('supports primitive conversion for called mocks', async () => {
    const mod = await evaluateGeneratedModule<{ default: MockFunction }>(
      loadSilentMockModule().code,
    )
    const value = mod.default()

    expect(String(value)).toBe('[import-protection mock]')
    expect(value.toString()).toBe('[import-protection mock]')
    expect(value.valueOf()).toBe('[import-protection mock]')
    expect(JSON.stringify(value)).toBe('"[import-protection mock]"')
  })

  // Replaces assertions on the purity annotations in the generated text; the
  // build-level effect (an unused mock is dropped from the bundle) is pinned
  // in known-bugs.test.ts.
  test('links on its own, and evaluating and using it has no side effects', async () => {
    const globals = Object.getOwnPropertyNames(globalThis)
    const output = (['log', 'info', 'warn', 'error'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    )
    const mod = await evaluateGeneratedModule<{
      default: Record<string, MockFunction>
    }>(loadSilentMockModule().code, { standalone: true })
    String(mod.default.anything!())
    expect(Object.getOwnPropertyNames(globalThis)).toEqual(globals)
    expect(output.filter((spy) => spy.mock.calls.length > 0)).toEqual([])
  })

  test('`new` on a member returns a mock', async () => {
    const mod = await evaluateGeneratedModule<{
      default: Record<string, new () => unknown>
    }>(loadSilentMockModule().code)
    expect(isMock(new mod.default.Client!())).toBe(true)
  })
})

describe('the build mock of a denied file', () => {
  // Evaluated with nothing to link to: the build mock imports nothing.
  test('supports primitive conversion for named export calls', async () => {
    const mod = await evaluateGeneratedModule<{ getSecret: MockFunction }>(
      generateSelfContainedMockModule(['getSecret']).code,
      { standalone: true },
    )

    expect(String(mod.getSecret())).toBe('[import-protection mock]')
  })

  test('`new` on a member of an export returns a mock', async () => {
    const mod = await evaluateGeneratedModule<{
      api: Record<string, new () => unknown>
    }>(generateSelfContainedMockModule(['api']).code, { standalone: true })
    expect(isMock(new mod.api.Client!())).toBe(true)
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
// chosen for the violation (`mockAccess`, the environment): in the client,
// each use of the mock reports the violation in the browser console.
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
    use: (mod: { getSecret: any }) => unknown = (mod) => mod.getSecret(),
  ) {
    const output = captureConsole()
    const runtimeId = mockRuntimeModuleIdFromViolation(info, mode, '/project')
    const mod = await evaluateGeneratedModule<{ getSecret: MockFunction }>(
      generateDevSelfDenialModule(['getSecret'], runtimeId).code,
    )
    use(mod)
    return output()
  }

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

  test.each<{ name: string; use: (mod: { getSecret: any }) => unknown }>([
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

  test.each([
    { name: 'mockAccess off', mode: 'off', info: violation },
    {
      name: 'a server environment',
      mode: 'error',
      info: { ...violation, env: 'ssr', envType: 'server' },
    },
  ] as const)('$name: a use is not reported', async ({ mode, info }) => {
    expect(await useDevMock(mode, info)).toEqual({ warn: [], error: [] })
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

// Rsbuild serves the mock runtime of a client violation for every
// `mockAccess` mode, with the mode in the module's payload (encoded as
// `ensureRuntimeMockModule` in src/rsbuild/import-protection.ts does).
test.each([
  { mode: 'error', reported: 1 },
  { mode: 'off', reported: 0 },
] as const)(
  'the Rsbuild mock runtime for mockAccess $mode reports $reported use(s)',
  async ({ mode, reported }) => {
    const output = captureConsole()
    const encoded = Buffer.from(
      JSON.stringify({
        mode,
        env: 'client',
        importer: '/project/src/routes/index.tsx',
        specifier: './secret.server',
        trace: [],
      }),
      'utf8',
    ).toString('base64url')
    const mod = await evaluateGeneratedModule<{
      default: Record<string, MockFunction>
    }>(loadMockRuntimeModule(encoded).code, { standalone: true })
    mod.default.getSecret!()
    expect(output()).toEqual({
      warn: [],
      error: Array.from({ length: reported }, () =>
        expect.stringContaining('Mocked import used in dev client'),
      ),
    })
  },
)
