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
    'captures inline CSS according to the resolved config (%s)',
    (enabled) => {
      vi.stubGlobal('TSS_ROUTES_MANIFEST', { __root__: {} })
      const readCss = vi.fn(() => new TextEncoder().encode('.root{color:red}'))
      const plugins = startManifestPlugin({
        getConfig: () =>
          ({
            resolvedStartConfig: { basePaths: { publicBase: '/assets' } },
            startConfig: { server: { build: { inlineCss: { enabled } } } },
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
            get source() {
              return readCss()
            },
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

      expect(readCss).toHaveBeenCalledTimes(enabled ? 1 : 0)
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
