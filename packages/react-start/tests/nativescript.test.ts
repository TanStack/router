import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { tanstackStartNativeScript } from '../src/plugin/nativescript'
import {
  configureNativeScriptStart,
  createNativeScriptServerFnFetch,
} from '../src/nativescript'
import type { AnyStartInstanceOptions } from '@tanstack/start-client-core'

type ResolvedId = { id: string; external?: boolean }

interface TestResolverContext {
  resolve: (
    source: string,
    importer?: string,
    options?: { skipSelf?: boolean },
  ) => Promise<ResolvedId | null>
  error: (message: string) => never
}

interface TestResolverPlugin {
  configResolved: (config: { root: string }) => void
  resolveId: (
    this: TestResolverContext,
    source: string,
    importer?: string,
  ) => Promise<string | ResolvedId | null>
}

const temporaryDirectories: Array<string> = []

afterEach(async () => {
  delete (window as Window & { __TSS_START_OPTIONS__?: unknown })
    .__TSS_START_OPTIONS__
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'tanstack-nativescript-'))
  temporaryDirectories.push(root)

  const files = {
    importer: path.join(root, 'src/app.tsx'),
    screen: path.join(root, 'src/screens/Home.tsx'),
    nativeScreen: path.join(root, 'src/screens/Home-native.tsx'),
    rootRoute: path.join(root, 'src/routes/__root.tsx'),
    nativeRootRoute: path.join(root, 'src/native/root-route.tsx'),
  }

  await Promise.all([
    mkdir(path.dirname(files.screen), { recursive: true }),
    mkdir(path.dirname(files.rootRoute), { recursive: true }),
    mkdir(path.dirname(files.nativeRootRoute), { recursive: true }),
  ])
  await Promise.all(
    Object.values(files).map((file) => writeFile(file, 'export {}\n')),
  )

  return { root, files }
}

function getResolverPlugin(
  options: Parameters<typeof tanstackStartNativeScript>[0],
): TestResolverPlugin {
  const plugin = tanstackStartNativeScript({
    ...options,
    router: false,
  })[0]
  return plugin as unknown as TestResolverPlugin
}

function createResolverContext(
  resolve: TestResolverContext['resolve'],
): TestResolverContext {
  return {
    resolve,
    error(message): never {
      throw new Error(message)
    },
  }
}

describe('NativeScript Start resolver', () => {
  test('resolves native screens, the native root route, and app package aliases', async () => {
    const { root, files } = await createFixture()
    const plugin = getResolverPlugin({
      serverFnBase: 'https://api.example.com/_serverFn/',
      nativeRootRoute: 'src/native/root-route.tsx',
    })
    plugin.configResolved({ root })

    const resolve = vi.fn<TestResolverContext['resolve']>(async (source) => {
      if (source === './screens/Home') {
        return { id: files.screen }
      }
      if (source === './routes/__root') {
        return { id: files.rootRoute }
      }
      if (source === '@tanstack/react-nativescript-router') {
        return { id: '/resolved/react-nativescript-router.js' }
      }
      if (source === '@tanstack/react-start/nativescript') {
        return { id: '/resolved/react-start-nativescript.js' }
      }
      return null
    })
    const context = createResolverContext(resolve)

    await expect(
      plugin.resolveId.call(context, './screens/Home', files.importer),
    ).resolves.toBe(files.nativeScreen)
    await expect(
      plugin.resolveId.call(context, './routes/__root', files.importer),
    ).resolves.toBe(files.nativeRootRoute)
    await expect(
      plugin.resolveId.call(context, '@tanstack/react-router', files.importer),
    ).resolves.toEqual({ id: '/resolved/react-nativescript-router.js' })
    await expect(
      plugin.resolveId.call(context, '@tanstack/react-start', files.importer),
    ).resolves.toEqual({ id: '/resolved/react-start-nativescript.js' })
  })

  test('does not redirect imports from dependencies', async () => {
    const { root } = await createFixture()
    const plugin = getResolverPlugin({
      serverFnBase: 'https://api.example.com/_serverFn/',
    })
    plugin.configResolved({ root })
    const resolve = vi.fn<TestResolverContext['resolve']>(async () => null)

    await expect(
      plugin.resolveId.call(
        createResolverContext(resolve),
        '@tanstack/react-router',
        path.join(root, 'node_modules/example/index.js'),
      ),
    ).resolves.toBeNull()
    expect(resolve).not.toHaveBeenCalled()
  })

  test('keeps the native root override when native siblings are disabled', async () => {
    const { root, files } = await createFixture()
    const plugin = getResolverPlugin({
      serverFnBase: 'https://api.example.com/_serverFn/',
      nativeOverrides: false,
      nativeRootRoute: 'src/native/root-route.tsx',
    })
    plugin.configResolved({ root })
    const resolve = vi.fn<TestResolverContext['resolve']>(async (source) => {
      if (source === './routes/__root') {
        return { id: files.rootRoute }
      }
      if (source === './screens/Home') {
        return { id: files.screen }
      }
      return null
    })
    const context = createResolverContext(resolve)

    await expect(
      plugin.resolveId.call(context, './routes/__root', files.importer),
    ).resolves.toBe(files.nativeRootRoute)
    await expect(
      plugin.resolveId.call(context, './screens/Home', files.importer),
    ).resolves.toBeNull()
  })

  test('fails configuration when the native root route is missing', async () => {
    const { root } = await createFixture()
    const plugin = getResolverPlugin({
      serverFnBase: 'https://api.example.com/_serverFn/',
      nativeRootRoute: 'src/native/missing.tsx',
    })

    expect(() => plugin.configResolved({ root })).toThrow(
      'NativeScript root route does not exist',
    )
  })
})

describe('NativeScript Start runtime', () => {
  test('adds the request origin without replacing caller headers', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => new Response())
    const nativeFetch = createNativeScriptServerFnFetch(fetchImplementation)

    await nativeFetch('https://api.example.com/_serverFn/test', {
      headers: { Authorization: 'Bearer test' },
    })

    const init = fetchImplementation.mock.calls[0]?.[1]
    const headers = new Headers(init?.headers)
    expect(headers.get('Origin')).toBe('https://api.example.com')
    expect(headers.get('Authorization')).toBe('Bearer test')
  })

  test('installs the native server-function fetch by default', () => {
    configureNativeScriptStart()

    const options = (
      window as Window & {
        __TSS_START_OPTIONS__?: AnyStartInstanceOptions
      }
    ).__TSS_START_OPTIONS__

    expect(options?.serverFns?.fetch).toBeTypeOf('function')
  })

  test('merges client fetch configuration across initialization', () => {
    const firstFetch = vi.fn<typeof fetch>()
    const secondFetch = vi.fn<typeof fetch>()

    configureNativeScriptStart({ serverFns: { fetch: firstFetch } })
    configureNativeScriptStart({ serverFns: { fetch: secondFetch } })

    const options = (
      window as Window & {
        __TSS_START_OPTIONS__?: AnyStartInstanceOptions
      }
    ).__TSS_START_OPTIONS__

    expect(options?.serverFns?.fetch).toBe(secondFetch)
  })
})
