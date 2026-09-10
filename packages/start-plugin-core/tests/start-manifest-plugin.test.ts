import { VIRTUAL_MODULES } from '@tanstack/start-server-core/virtual-modules'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { DEV_CLIENT_ENTRY, START_ENVIRONMENT_NAMES } from '../src/constants'
import { startManifestPlugin } from '../src/vite/start-manifest-plugin/plugin'

const viteVersion = vi.hoisted(() => ({ value: '8.2.2' }))

vi.mock('vite', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vite')>()),
  get version() {
    return viteVersion.value
  },
}))

vi.mock('@tanstack/start-server-core/virtual-modules', () => ({
  VIRTUAL_MODULES: {
    startManifest: 'tanstack-start-manifest:v',
  },
}))

describe('startManifestPlugin', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    viteVersion.value = '8.2.2'
  })

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
    const manifest = loadDevManifest({ bundledDev: false })
    expect(manifest.routes.__root__.scripts).toEqual([
      {
        attrs: { type: 'module', async: true, src: `/@id/${DEV_CLIENT_ENTRY}` },
      },
    ])
  })

  test.each(['8.0.0', '8.2.0'])(
    'uses the entry with its embedded runtime on Vite %s',
    (version) => {
      viteVersion.value = version
      const manifest = loadDevManifest({ bundledDev: true })
      expect(manifest.routes.__root__.scripts).toEqual([
        { attrs: { type: 'module', async: true, src: '/assets/index.js' } },
      ])
    },
  )

  test.each(['8.2.1', '8.2.2', '8.3.0', '9.0.0'])(
    'loads the separate runtime before the bundled entry on Vite %s',
    (version) => {
      viteVersion.value = version
      const manifest = loadDevManifest({ bundledDev: true, basePath: '/app/' })
      expect(manifest.routes.__root__.scripts).toEqual([
        {
          attrs: { type: 'module', async: true },
          children:
            'await import("/app/bundledDevClient.mjs");\nawait import("/app/assets/index.js");',
        },
      ])
      expect(manifest.routes.__root__.preloads).toEqual([
        '/app/assets/index.js',
      ])
    },
  )
})

function loadDevManifest(opts: { bundledDev: boolean; basePath?: string }) {
  const plugins = startManifestPlugin({
    getConfig: () =>
      ({
        resolvedStartConfig: {
          basePaths: {
            publicBase: opts.basePath ?? '/',
          },
        },
      }) as any,
  }) as Array<any>
  const plugin = plugins.find(
    (item) => item.name === 'tanstack-start:start-manifest-plugin',
  )!
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
  return new Function(
    code.replace('export const tsrStartManifest =', 'return'),
  )()()
}
