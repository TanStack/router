import { beforeEach, expect, test, vi } from 'vitest'

// Platforms without a native binary, or installs without optional
// dependencies, cannot load Yuku's native binding.
const wasm = vi.hoisted(() => ({ fail: false, loads: 0 }))

vi.mock('yuku-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('yuku-core')>()),
  load: () => {
    throw new Error('Failed to load native binding')
  },
}))

vi.mock('@yuku-core/wasm', async (importOriginal) => {
  const original = await importOriginal<typeof import('@yuku-core/wasm')>()
  return {
    ...original,
    loadSync: (...args: Parameters<typeof original.loadSync>) => {
      wasm.loads++
      if (wasm.fail) {
        throw new Error('WebAssembly is unavailable')
      }
      return original.loadSync(...args)
    },
  }
})

beforeEach(() => {
  // The loaded core is cached per module instance
  vi.resetModules()
  wasm.fail = false
  wasm.loads = 0
})

test('analyzes and prints modules with the WebAssembly core when the native binding cannot load', async () => {
  const { analyzeModule, cloneModuleAst, generateModule } =
    await import('../src')
  const module = analyzeModule({
    code: `import { lazy } from 'react'
const Page = lazy(() => import('./page'))
export const render = (id: string) => <Page id={id} />
`,
    filename: 'route.tsx',
  })
  expect(module.rootScope.find('Page')!.references).toHaveLength(1)
  expect(generateModule(cloneModuleAst(module).program).code).toContain(
    'export const render = (id: string) => <Page id={id} />',
  )
  analyzeModule({ code: 'export const other = 1' })
  expect(wasm.loads).toBe(1)
})

test('reports both causes when neither core can load', async () => {
  wasm.fail = true
  const { analyzeModule } = await import('../src')
  const error = (() => {
    try {
      analyzeModule({ code: 'export const value = 1' })
    } catch (caught) {
      return caught
    }
    return undefined
  })()
  expect(error).toBeInstanceOf(AggregateError)
  expect(
    (error as AggregateError).errors.map((cause: Error) => cause.message),
  ).toEqual(['Failed to load native binding', 'WebAssembly is unavailable'])
})
