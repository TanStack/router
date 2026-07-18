import { describe, expect, it } from 'vitest'
import { TRANSFORM_ID_REGEX } from '../src/constants'
import { parseStartConfig } from '../src/schema'
import { getLookupConfigurationsForEnv } from '../src/start-compiler/config'
import { composeGeneratorPlugins } from '../src/start-router-plugin/generator-plugins/compose-generator-plugins'
import { startFrameworks } from '../src/types'
import type { GeneratorPlugin } from '@tanstack/router-generator'

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
