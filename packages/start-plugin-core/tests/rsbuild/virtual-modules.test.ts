import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  START_MANIFEST_PLACEHOLDER,
  registerVirtualModules,
} from '../../src/rsbuild/virtual-modules'
import { RSBUILD_ENVIRONMENT_NAMES } from '../../src/rsbuild/planning'
import type { NormalizedClientBuild } from '../../src/types'

afterEach(() => vi.unstubAllGlobals())

function createRegistry(
  options: {
    isDev?: boolean
  } = {},
) {
  vi.stubGlobal('TSS_ROUTES_MANIFEST', {
    routes: { __root__: {} },
    hasServerRoutes: false,
  })
  let configure: (config: any, utils: any) => void
  const state = registerVirtualModules(
    {
      context: { action: options.isDev ? 'dev' : 'build' },
      modifyRspackConfig(callback: typeof configure) {
        configure = callback
      },
    } as any,
    {
      root: '/app',
      getConfig: () =>
        ({
          resolvedStartConfig: {
            basePaths: { publicBase: '/' },
          },
          startConfig: {
            server: {
              build: { inlineCss: { enabled: false, transformAssets: false } },
            },
          },
        }) as any,
      serverFnsById: {},
      providerEnvName: RSBUILD_ENVIRONMENT_NAMES.server,
      ssrIsProvider: true,
      serializationAdapters: undefined,
      getDevClientEntryUrl: () => '/assets/index.js',
      scriptFormat: 'module',
    },
  )

  return {
    state,
    initialManifest(
      environmentName: string = RSBUILD_ENVIRONMENT_NAMES.server,
    ) {
      let content: Record<string, string> = {}
      configure(
        { plugins: [], resolve: {} },
        {
          environment: { name: environmentName },
          rspack: {
            experiments: {
              VirtualModulesPlugin: class {
                constructor(modules: Record<string, string>) {
                  content = modules
                }
              },
            },
            NormalModuleReplacementPlugin: class {},
          },
        },
      )
      return content[state.manifestPath]!
    },
  }
}

function clientBuild(): NormalizedClientBuild {
  return {
    entryChunkFileName: 'entry.js',
    chunksByFileName: new Map([
      [
        'entry.js',
        {
          fileName: 'entry.js',
          isEntry: true,
          imports: [],
          dynamicImports: [],
          routeFilePaths: [],
          hydrationIds: [],
          css: [],
        },
      ],
    ]),
    cssContentByFileName: new Map(),
  }
}

function readHasServerRoutes(code: string) {
  return new Function(
    `${code.replaceAll('export const ', 'const ')}\nreturn hasServerRoutes`,
  )() as boolean
}

describe('Rsbuild manifest server routes', () => {
  test('keeps server-route handling enabled when a parallel build replaces its placeholder', () => {
    const registry = createRegistry()
    const initial = registry.initialManifest()
    expect(initial).toContain(START_MANIFEST_PLACEHOLDER)

    const final = initial.replace(
      JSON.stringify(START_MANIFEST_PLACEHOLDER),
      registry.state.generateManifestValueLiteral(clientBuild()),
    )
    expect(readHasServerRoutes(final)).toBe(true)
    expect(
      readHasServerRoutes(
        registry.state.generateManifestContent(clientBuild()),
      ),
    ).toBe(false)
  })

  test('does not optimize when route metadata is missing', () => {
    const registry = createRegistry()
    vi.stubGlobal('TSS_ROUTES_MANIFEST', { routes: { __root__: {} } })
    const manifest = registry.state.generateManifestContent(clientBuild())

    expect(readHasServerRoutes(manifest)).toBe(true)
  })

  test('exports the flag in the client manifest', () => {
    const registry = createRegistry()
    const manifest = registry.initialManifest(RSBUILD_ENVIRONMENT_NAMES.client)

    expect(manifest).toContain('export const hasServerRoutes = true')
  })

  test('keeps server-route handling enabled in development after client builds', () => {
    const registry = createRegistry({ isDev: true })
    const initial = registry.initialManifest()
    expect(initial).toContain('export const hasServerRoutes = true')

    registry.state.updateManifest(clientBuild())
    const updated = registry.state.generateManifestContent(clientBuild())
    expect(readHasServerRoutes(updated)).toBe(true)
  })
})
