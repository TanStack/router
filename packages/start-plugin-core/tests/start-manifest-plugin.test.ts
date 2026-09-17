import { VIRTUAL_MODULES } from '@tanstack/start-server-core/virtual-modules'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { DEV_CLIENT_ENTRY, START_ENVIRONMENT_NAMES } from '../src/constants'
import { startManifestPlugin } from '../src/vite/start-manifest-plugin/plugin'

vi.mock('@tanstack/start-server-core/virtual-modules', () => ({
  VIRTUAL_MODULES: {
    startManifest: 'tanstack-start-manifest:v',
  },
}))

describe('startManifestPlugin', () => {
  afterEach(() => vi.unstubAllGlobals())

  test.each([false, true])(
    'exports server-route presence determined from generated routes (%s)',
    (serverRoute) => {
      vi.stubGlobal('TSS_ROUTES_MANIFEST', {
        routes: { __root__: {} },
        hasServerRoutes: serverRoute,
      })
      const manifest = loadBuildManifest()

      expect(manifest).toContain(
        `export const hasServerRoutes = ${serverRoute}`,
      )
    },
  )

  test('keeps server routing when route metadata is missing', () => {
    vi.stubGlobal('TSS_ROUTES_MANIFEST', { routes: { __root__: {} } })
    const manifest = loadBuildManifest()

    expect(manifest).toContain('export const hasServerRoutes = true')
  })

  test.each(['serve', 'client', 'scan'])(
    'keeps server-route handling enabled for %s manifests',
    (mode) => {
      const manifest = loadBuildManifest({
        command: mode === 'serve' ? 'serve' : 'build',
        environment:
          mode === 'client'
            ? START_ENVIRONMENT_NAMES.client
            : START_ENVIRONMENT_NAMES.server,
        captureClientBuild: mode !== 'scan',
      })

      expect(manifest).toContain('export const hasServerRoutes = true')
    },
  )

  test.each([false, true])(
    'captures inline CSS according to the resolved config (%s)',
    (enabled) => {
      vi.stubGlobal('TSS_ROUTES_MANIFEST', {
        routes: { __root__: {} },
        hasServerRoutes: false,
      })
      const plugins = startManifestPlugin({
        getConfig: () =>
          ({
            resolvedStartConfig: { basePaths: { publicBase: '/assets' } },
            startConfig: {
              router: {},
              server: { build: { inlineCss: { enabled } } },
            },
          }) as any,
      }) as Array<any>
      const capture = plugins.find(
        (item) =>
          item.name === 'tanstack-start:start-manifest-capture-client-build',
      )!
      capture.generateBundle.call(
        { environment: { name: START_ENVIRONMENT_NAMES.client } },
        {},
        {
          'entry.js': {
            type: 'chunk',
            fileName: 'entry.js',
            isEntry: true,
            imports: [],
            dynamicImports: [],
            moduleIds: [],
            viteMetadata: { importedCss: new Set(['root.css']) },
          },
          'root.css': {
            type: 'asset',
            name: 'root.css',
            fileName: 'root.css',
            source: new TextEncoder().encode('.root{color:red}'),
          },
        },
      )
      const plugin = plugins.find(
        (item) => item.name === 'tanstack-start:start-manifest-plugin',
      )!
      const resolvedId = plugin.resolveId.handler(VIRTUAL_MODULES.startManifest)
      const manifest = plugin.load.handler.call(
        {
          environment: {
            name: START_ENVIRONMENT_NAMES.server,
            config: { command: 'build', build: {} },
          },
        },
        resolvedId,
      )

      expect(manifest).toContain('/assets/root.css')
      expect(manifest.includes('.root{color:red}')).toBe(enabled)
    },
  )

  test('uses the virtual client entry during unbundled dev', () => {
    expect(loadDevManifest({ bundledDev: false })).toContain(
      `src: '/@id/${DEV_CLIENT_ENTRY}'`,
    )
  })

  test('uses the bundled client entry during bundled dev', () => {
    expect(loadDevManifest({ bundledDev: true })).toContain(
      `src: '/assets/index.js'`,
    )
  })
})

function loadBuildManifest(
  opts: {
    command?: string
    environment?: string
    captureClientBuild?: boolean
  } = {},
) {
  const plugins = startManifestPlugin({
    getConfig: () =>
      ({
        resolvedStartConfig: {
          basePaths: { publicBase: '/' },
        },
        startConfig: {
          server: { build: { inlineCss: { enabled: false } } },
        },
      }) as any,
  }) as Array<any>
  if (opts.captureClientBuild !== false) {
    plugins
      .find((plugin) => plugin.generateBundle)
      .generateBundle.call(
        { environment: { name: START_ENVIRONMENT_NAMES.client } },
        {},
        {
          'entry.js': {
            type: 'chunk',
            fileName: 'entry.js',
            isEntry: true,
            imports: [],
            dynamicImports: [],
            moduleIds: [],
          },
        },
      )
  }
  const plugin = plugins.find(
    (item) => item.name === 'tanstack-start:start-manifest-plugin',
  )!
  return plugin.load.handler.call(
    {
      environment: {
        name: opts.environment ?? START_ENVIRONMENT_NAMES.server,
        config: { command: opts.command ?? 'build', build: {} },
      },
    },
    plugin.resolveId.handler(VIRTUAL_MODULES.startManifest),
  ) as string
}

function loadDevManifest(opts: { bundledDev: boolean }) {
  const plugins = startManifestPlugin({
    getConfig: () =>
      ({
        resolvedStartConfig: {
          basePaths: {
            publicBase: '/',
          },
        },
      }) as any,
  }) as Array<any>
  const plugin = plugins.find(
    (item) => item.name === 'tanstack-start:start-manifest-plugin',
  )!
  const resolvedId = plugin.resolveId.handler(VIRTUAL_MODULES.startManifest)

  return plugin.load.handler.call(
    {
      environment: {
        name: START_ENVIRONMENT_NAMES.server,
        config: {
          command: 'serve',
          environments: {
            [START_ENVIRONMENT_NAMES.client]: {
              isBundled: opts.bundledDev,
            },
          },
        },
      },
    },
    resolvedId,
  )
}
