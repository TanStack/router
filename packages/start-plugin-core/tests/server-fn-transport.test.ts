import { describe, expect, test } from 'vitest'
import { parseStartConfig as parseVite } from '../src/vite/schema'
import { parseStartConfig as parseRsbuild } from '../src/rsbuild/schema'
import { createServerFnTransportAliases } from '../src/server-fn-transport'
import {
  createViteConfigPlan,
  createViteDefineConfig,
  createViteResolvedEntryAliases,
} from '../src/vite/planning'
import {
  createRsbuildEnvironmentPlan,
  createRsbuildResolvedEntryAliases,
} from '../src/rsbuild/planning'

describe.each([
  ['vite', parseVite],
  ['rsbuild', parseRsbuild],
] as const)('%s server function transport', (_, parse) => {
  test('defaults to bundled, including SPA mode', () => {
    expect(
      parse({}, { framework: 'react' }, process.cwd()).serverFns.transport,
    ).toBe('bundled')
    expect(
      parse({ spa: { enabled: true } }, { framework: 'react' }, process.cwd())
        .serverFns.transport,
    ).toBe('bundled')
  })
  test('accepts lazy as an explicit build choice', () => {
    expect(
      parse(
        { serverFns: { transport: 'lazy' } },
        { framework: 'react' },
        process.cwd(),
      ).serverFns.transport,
    ).toBe('lazy')
  })
  test('rejects invalid transport values', () => {
    expect(() =>
      parse(
        { serverFns: { transport: 'preload' as 'lazy' } },
        { framework: 'react' },
        process.cwd(),
      ),
    ).toThrow()
  })
})

test('only lazy mode aliases the static codec imports', () => {
  expect(createServerFnTransportAliases('bundled')).toEqual({})
  expect(createServerFnTransportAliases('lazy')).toEqual({
    '#tanstack-start-server-fn-codec':
      '@tanstack/start-client-core/client-rpc/codec-stub',
  })
})

test.each(['bundled', 'lazy'] as const)(
  'forwards %s into both bundler plans',
  (serverFnTransport) => {
    const entryPaths = {
      client: '/app/client.ts',
      server: '/app/server.ts',
      start: '/app/start.ts',
      router: '/app/router.ts',
    }
    const common = {
      clientOutputDirectory: '/app/dist/client',
      serverOutputDirectory: '/app/dist/server',
      serverFnProviderEnv: 'ssr',
      serverFnTransport,
    }
    const vite = createViteConfigPlan({
      ...common,
      viteConfig: {},
      command: 'build',
      framework: 'react',
      entryAliases: createViteResolvedEntryAliases({ entryPaths }),
      optimizeDepsExclude: [],
      noExternal: [],
    })
    const rsbuild = createRsbuildEnvironmentPlan({
      ...common,
      root: '/app',
      publicBase: '/',
      entryAliases: createRsbuildResolvedEntryAliases({ entryPaths }),
    })
    const expected =
      serverFnTransport === 'lazy'
        ? '@tanstack/start-client-core/client-rpc/codec-stub'
        : undefined
    expect(vite.resolve.alias['#tanstack-start-server-fn-codec']).toBe(expected)
    expect(rsbuild.alias['#tanstack-start-server-fn-codec']).toBe(expected)
  },
)

test.each(['bundled', 'lazy'] as const)(
  'defines %s at build time',
  (serverFnTransport) => {
    const definitions = createViteDefineConfig({
      command: 'build',
      mode: 'production',
      serverFnBase: '/_serverFn',
      serverFnTransport,
      routerBasepath: '/',
      spaEnabled: false,
      devSsrStylesEnabled: false,
      devSsrStylesBasepath: '/',
      inlineCssEnabled: false,
      staticNodeEnv: true,
      disableCsrfMiddlewareWarning: false,
    })
    expect(definitions['process.env.TSS_SERVER_FN_TRANSPORT']).toBe(
      JSON.stringify(serverFnTransport),
    )
    expect(definitions['import.meta.env.TSS_SERVER_FN_TRANSPORT']).toBe(
      JSON.stringify(serverFnTransport),
    )
  },
)
