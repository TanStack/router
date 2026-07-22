import { describe, expect, it, vi } from 'vitest'
import { tanstackStart } from '../src/plugin/vite'
import { validateOctaneCompilerOptions } from '../src/plugin/validate-options'
import type { OctaneCompilerOptions } from '../src/plugin/vite'
import type { Plugin, PluginOption } from 'vite'

vi.mock('@tanstack/start-plugin-core/vite', () => ({
  START_ENVIRONMENT_NAMES: {
    client: 'client',
    server: 'ssr',
  },
  tanStackStartVite: () => [{ name: 'tanstack:router-generator' }],
}))

vi.mock('octane/compiler/vite', () => ({
  octane: () => ({ name: 'octane' }),
}))

function flattenPlugins(options: Array<PluginOption>): Array<Plugin> {
  const plugins: Array<Plugin> = []
  for (const option of options) {
    if (Array.isArray(option)) {
      plugins.push(...flattenPlugins(option))
    } else if (option && typeof option === 'object' && !('then' in option)) {
      plugins.push(option)
    }
  }
  return plugins
}

describe('Octane compiler options', () => {
  it('accepts readonly renderer presets', () => {
    const options = {
      renderers: {
        registry: {
          three: {
            module: '@octanejs/three/renderer',
            target: 'universal',
            server: 'client-only',
            capabilities: ['visibility', 'portal'],
          },
        },
        rules: [{ include: '**/*.three.tsrx', renderer: 'three' }],
      },
    } as const satisfies OctaneCompilerOptions

    expect(options.renderers.rules[0].renderer).toBe('three')
  })

  it('rejects a forced Octane SSR compilation mode', () => {
    const options: OctaneCompilerOptions = {
      // @ts-expect-error Start owns the per-environment SSR mode.
      ssr: true,
    }

    expect(() => validateOctaneCompilerOptions(options)).toThrowError(
      '`octane.ssr` is not supported by TanStack Start',
    )
  })

  it('installs source adaptation before Octane compilation and routing', () => {
    const plugins = flattenPlugins(tanstackStart({ octane: { hmr: false } }))
    const names = plugins.map((plugin) => plugin.name)
    const sourceTransformIndex = names.indexOf(
      'tanstack-octane-start:source-transform',
    )
    const compilerIndex = names.indexOf('octane')
    const generatorIndex = names.indexOf('tanstack:router-generator')

    expect(sourceTransformIndex).toBeGreaterThanOrEqual(0)
    expect(compilerIndex).toBeGreaterThan(sourceTransformIndex)
    expect(generatorIndex).toBeGreaterThan(compilerIndex)
  })
})
