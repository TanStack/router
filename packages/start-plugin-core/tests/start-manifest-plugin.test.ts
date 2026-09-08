import { runInNewContext } from 'node:vm'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core/virtual-modules'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { DEV_CLIENT_ENTRY, START_ENVIRONMENT_NAMES } from '../src/constants'
import { startManifestPlugin } from '../src/vite/start-manifest-plugin/plugin'
import type { StartManifest } from '../src/start-manifest-plugin/manifestBuilder'

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
    expect(loadDevManifest({ bundledDev: false }).routes.__root__).toEqual({
      preloads: [`/@id/${DEV_CLIENT_ENTRY}`],
      scripts: [
        {
          attrs: {
            type: 'module',
            async: true,
            src: `/@id/${DEV_CLIENT_ENTRY}`,
          },
        },
      ],
    })
  })

  test('preserves bundled dev without a separate runtime', () => {
    expect(loadDevManifest({ bundledDev: true }).routes.__root__).toEqual({
      preloads: ['/assets/index.js'],
      scripts: [
        {
          attrs: { type: 'module', async: true, src: '/assets/index.js' },
        },
      ],
    })
  })

  test.each(['/', '/base/'])(
    'loads the bundled-dev runtime before the entry with base %s',
    (basePath) => {
      const runtime = `${basePath}bundledDevClient.mjs`
      const entry = `${basePath}assets/index.js`

      expect(
        loadDevManifest({
          bundledDev: true,
          separateRuntime: true,
          basePath,
        }).routes.__root__,
      ).toEqual({
        preloads: [runtime, entry],
        scripts: [
          { attrs: { type: 'module', async: false, src: runtime } },
          { attrs: { type: 'module', async: false, src: entry } },
        ],
      })
    },
  )
})

function loadDevManifest(opts: {
  bundledDev: boolean
  separateRuntime?: boolean
  basePath?: string
}): StartManifest {
  const basePath = opts.basePath ?? '/'
  const plugins = startManifestPlugin({
    getConfig: () =>
      ({
        resolvedStartConfig: {
          basePaths: {
            publicBase: basePath,
          },
        },
      }) as any,
  }) as Array<any>
  const plugin = plugins.find(
    (item) => item.name === 'tanstack-start:start-manifest-plugin',
  )!
  const capturePlugin = plugins.find(
    (item) =>
      item.name === 'tanstack-start:start-manifest-capture-client-build',
  )!
  capturePlugin.configureServer({
    config: { base: basePath },
    environments: {
      [START_ENVIRONMENT_NAMES.client]: {
        ...(opts.separateRuntime ? { bundledDev: {} } : {}),
      },
    },
  })
  const resolvedId = plugin.resolveId.handler(VIRTUAL_MODULES.startManifest)

  const code = plugin.load.handler.call(
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

  return runInNewContext(
    `${code.replace('export const', 'const')}; tsrStartManifest()`,
  )
}
