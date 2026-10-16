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
  loadSilentMockModule,
  mockRuntimeModuleIdFromViolation,
} from '../../src/import-protection/virtualModules'
import {
  loadResolvedVirtualModule,
  resolveInternalVirtualModuleId,
} from '../../src/vite/import-protection-plugin/virtualModules'
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
})

// In dev, the mock served in place of a denied file imports a mock runtime
// chosen for the violation (`mockAccess`, the environment): in the client,
// each use of the mock reports the violation in the browser console.
describe('the dev mock of a denied file', () => {
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
   * Evaluates the dev mock of a denied file exporting `getSecret`, for
   * `violation` with the `mockAccess` mode `mode`, calls `getSecret()`, and
   * returns the messages the call logged, by console method.
   */
  async function useDevMock(
    mode: 'error' | 'warn' | 'off',
    info: ViolationInfo = violation,
  ) {
    const spies = {
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    }
    const runtimeId = mockRuntimeModuleIdFromViolation(info, mode, '/project')
    const mod = await evaluateGeneratedModule<{ getSecret: MockFunction }>(
      generateDevSelfDenialModule(['getSecret'], runtimeId).code,
    )
    mod.getSecret()
    const messages = (spy: (typeof spies)['warn']) =>
      spy.mock.calls.map(([logged]) => String((logged as Error).message))
    return { warn: messages(spies.warn), error: messages(spies.error) }
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
