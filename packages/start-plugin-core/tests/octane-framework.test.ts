import { describe, expect, it } from 'vitest'
import { TRANSFORM_ID_REGEX } from '../src/constants'
import { parseStartConfig } from '../src/schema'
import { getLookupConfigurationsForEnv } from '../src/start-compiler/config'
import { composeGeneratorPlugins } from '../src/start-router-plugin/generator-plugins/compose-generator-plugins'
import { startFrameworks } from '../src/types'
import { importProtectionPlugin } from '../src/vite/import-protection-plugin/plugin'
import type { GeneratorPlugin } from '@tanstack/router-generator'
import type { Plugin, PluginOption } from 'vite'

function flattenPlugins(options: PluginOption): Array<Plugin> {
  if (Array.isArray(options)) {
    return options.flatMap(flattenPlugins)
  }
  if (!options || typeof options !== 'object' || 'then' in options) {
    return []
  }
  return [options]
}

describe('Octane framework configuration', () => {
  it('is a supported Start compiler framework', () => {
    expect(startFrameworks).toContain('octane')

    const clientLookups = getLookupConfigurationsForEnv('client', 'octane')
    const serverLookups = getLookupConfigurationsForEnv('server', 'octane')

    expect(clientLookups).toContainEqual(
      expect.objectContaining({
        libName: '@tanstack/octane-start',
        rootExport: 'createServerFn',
      }),
    )
    expect(serverLookups).toContainEqual(
      expect.objectContaining({
        libName: '@tanstack/octane-router',
        rootExport: 'ClientOnly',
      }),
    )
  })

  it('runs Start transforms on compiled .tsrx modules', () => {
    expect(
      TRANSFORM_ID_REGEX.some((pattern) => pattern.test('route.tsrx')),
    ).toBe(true)
    expect(
      TRANSFORM_ID_REGEX.some((pattern) =>
        pattern.test('route.tsrx?tsr-split=component'),
      ),
    ).toBe(true)
  })

  it('caches post-transform TSRX for import-protection verification', () => {
    const plugins = flattenPlugins(
      importProtectionPlugin({
        getConfig: () => {
          throw new Error('not used while inspecting plugin filters')
        },
        framework: 'octane',
        environments: [
          { name: 'client', type: 'client' },
          { name: 'ssr', type: 'server' },
        ],
        providerEnvName: 'ssr',
      }),
    )
    const cachePlugin = plugins.find(
      (plugin) =>
        plugin.name === 'tanstack-start-core:import-protection-transform-cache',
    )
    const transform = cachePlugin?.transform as
      | {
          filter?: { id?: { include?: Array<RegExp> } }
        }
      | undefined

    expect(
      transform?.filter?.id?.include?.some((pattern) =>
        pattern.test('/src/routes/index.tsrx?tsr-split=component'),
      ),
    ).toBe(true)
  })

  it('applies target-specific router defaults before resolving Start config', () => {
    const root = process.cwd()

    expect(
      parseStartConfig({}, { framework: 'octane' }, root).router.addExtensions,
    ).toBe(true)
    expect(
      parseStartConfig(
        { router: { addExtensions: false } },
        { framework: 'octane' },
        root,
      ).router.addExtensions,
    ).toBe(false)

    for (const framework of ['react', 'solid', 'vue'] as const) {
      expect(
        parseStartConfig({}, { framework }, root).router.addExtensions,
      ).toBe(false)
    }
  })

  it('runs required framework adapters before user and built-in plugins', () => {
    const plugin = (name: string): GeneratorPlugin => ({ name })

    expect(
      composeGeneratorPlugins({
        frameworkPlugins: [plugin('framework')],
        userPlugins: [plugin('user')],
        builtInPlugins: [plugin('built-in')],
      }).map(({ name }) => name),
    ).toEqual(['framework', 'user', 'built-in'])
  })
})
