import { describe, expect, test, vi } from 'vitest'
import {
  createViteDevServerFnModuleSpecifierEncoder,
  decodeViteDevServerModuleSpecifier,
} from '../../src/vite/start-compiler-plugin/module-specifier'
import { mergeHotUpdateModules } from '../../src/vite/start-compiler-plugin/hot-update'
import {
  isBundledEnvironment,
  loadViteModuleFromEnvironment,
} from '../../src/vite/start-compiler-plugin/plugin'
import type { Environment, EnvironmentModuleNode } from 'vite'

describe('Vite dev server module specifiers', () => {
  test('encodes app files as root-relative dev server paths', () => {
    const encode = createViteDevServerFnModuleSpecifierEncoder('/repo/app')

    const specifier = encode({
      extractedFilename: '/repo/app/src/routes/index.tsx',
      root: '/repo/app',
    })

    expect(specifier).toBe('/src/routes/index.tsx')
    expect(decodeViteDevServerModuleSpecifier(specifier)).toBe(
      'src/routes/index.tsx',
    )
  })

  test('preserves POSIX absolute /@fs paths outside the app root', () => {
    const encode = createViteDevServerFnModuleSpecifierEncoder('/repo/app')

    const specifier = encode({
      extractedFilename: '/repo/shared/server-fn.ts',
      root: '/repo/app',
    })

    expect(specifier).toBe('/@fs/repo/shared/server-fn.ts')
    expect(decodeViteDevServerModuleSpecifier(`${specifier}?x=1`)).toBe(
      '/repo/shared/server-fn.ts',
    )
  })

  test('preserves Windows drive-letter /@fs paths', () => {
    const encode = createViteDevServerFnModuleSpecifierEncoder('C:/repo/app')

    const specifier = encode({
      extractedFilename: 'D:/repo/shared/server-fn.ts',
      root: 'C:/repo/app',
    })

    expect(specifier).toBe('/@fs/D:/repo/shared/server-fn.ts')
    expect(decodeViteDevServerModuleSpecifier(`${specifier}?x=1`)).toBe(
      'D:/repo/shared/server-fn.ts',
    )
  })
})

describe('mergeHotUpdateModules', () => {
  test('returns undefined when no extra modules were added', () => {
    const current = [{ id: '/src/route.tsx' }] as Array<EnvironmentModuleNode>

    expect(mergeHotUpdateModules(current, [])).toBeUndefined()
  })

  test('keeps native Vite modules and appends extra modules without duplicates', () => {
    const route = { id: '/src/route.tsx' } as EnvironmentModuleNode
    const provider = {
      id: '/src/route.tsx?tss-serverfn-split',
    } as EnvironmentModuleNode

    expect(mergeHotUpdateModules([route], [route, provider])).toEqual([
      route,
      provider,
    ])
  })
})

describe('loadViteModuleFromEnvironment', () => {
  test('uses plugin load hook when environment.mode is build', async () => {
    const env = {
      mode: 'build',
      name: 'server',
      config: {},
    } as unknown as Environment

    const loadMock = vi.fn().mockResolvedValue({ code: 'export const a = 1;' })
    const transformRequestMock = vi.fn()

    const code = await loadViteModuleFromEnvironment(env, '/src/module.ts', {
      load: loadMock,
      error: () => {
        throw new Error('error')
      },
      devId: '/src/module.ts?query',
    })

    expect(loadMock).toHaveBeenCalledWith({ id: '/src/module.ts' })
    expect(transformRequestMock).not.toHaveBeenCalled()
    expect(code).toBe('export const a = 1;')
  })

  test('uses plugin load hook with clean id when environment is bundled in dev (environment.config.isBundled)', async () => {
    const env = {
      mode: 'dev',
      name: 'server',
      config: {
        isBundled: true,
      },
    } as unknown as Environment

    const loadMock = vi
      .fn()
      .mockResolvedValue({ code: 'export const zod = {};' })
    const transformRequestMock = vi.fn()

    const code = await loadViteModuleFromEnvironment(env, 'zod/index.js', {
      load: loadMock,
      error: () => {
        throw new Error('error')
      },
      devId: 'zod/index.js?tss-serverfn-lookup',
    })

    expect(loadMock).toHaveBeenCalledWith({ id: 'zod/index.js' })
    expect(transformRequestMock).not.toHaveBeenCalled()
    expect(code).toBe('export const zod = {};')
  })

  test('uses transformRequest for an unbundled environment even when experimental.bundledDev is set', async () => {
    // Vite seeds the bundledDev default for the client environment only; other
    // environments resolve isBundled to false unless they set it themselves.
    // Following the global flag here would send this environment down the load
    // hook, whose result has no code in an unbundled dev plugin context.
    const transformRequestMock = vi.fn().mockResolvedValue(undefined)
    const env = {
      mode: 'dev',
      name: 'ssr',
      config: {
        isBundled: false,
        experimental: {
          bundledDev: true,
        },
      },
      transformRequest: transformRequestMock,
    } as unknown as Environment

    const loadMock = vi.fn()

    const code = await loadViteModuleFromEnvironment(env, '/src/server-fn.ts', {
      load: loadMock,
      error: () => {
        throw new Error('error')
      },
      devId: '/src/server-fn.ts?query',
    })

    expect(loadMock).not.toHaveBeenCalled()
    expect(transformRequestMock).toHaveBeenCalledWith('/src/server-fn.ts?query')
    expect(code).toBeUndefined()
  })

  test('uses transformRequest when environment.mode is dev and not bundled', async () => {
    const transformRequestMock = vi.fn().mockResolvedValue(undefined)
    const env = {
      mode: 'dev',
      name: 'client',
      config: {
        experimental: {},
      },
      transformRequest: transformRequestMock,
    } as unknown as Environment

    const loadMock = vi.fn()

    const code = await loadViteModuleFromEnvironment(env, '/src/route.tsx', {
      load: loadMock,
      error: () => {
        throw new Error('error')
      },
      devId: '/src/route.tsx?query',
    })

    expect(loadMock).not.toHaveBeenCalled()
    expect(transformRequestMock).toHaveBeenCalledWith('/src/route.tsx?query')
    expect(code).toBeUndefined()
  })
})


describe('isBundledEnvironment', () => {
  test('reports what the bundler resolved for the environment', () => {
    const clientBundled = {
      name: 'client',
      config: { isBundled: true },
    } as unknown as Environment
    const clientOptedOut = {
      name: 'client',
      config: { isBundled: false, experimental: { bundledDev: true } },
    } as unknown as Environment

    expect(isBundledEnvironment(clientBundled)).toBe(true)
    // The tool-wide flag does not override an environment that resolved to false;
    // reading it here is what made the ingest and load paths disagree.
    expect(isBundledEnvironment(clientOptedOut)).toBe(false)
  })
})
