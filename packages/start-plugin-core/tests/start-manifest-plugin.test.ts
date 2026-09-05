import { runInNewContext } from 'node:vm'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core/virtual-modules'
import { describe, expect, test, vi } from 'vitest'
import { DEV_CLIENT_ENTRY, START_ENVIRONMENT_NAMES } from '../src/constants'
import { startManifestPlugin } from '../src/vite/start-manifest-plugin/plugin'
import type { StartManifest } from '../src/start-manifest-plugin/manifestBuilder'

vi.mock('@tanstack/start-server-core/virtual-modules', () => ({
  VIRTUAL_MODULES: {
    startManifest: 'tanstack-start-manifest:v',
  },
}))

describe('startManifestPlugin', () => {
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
