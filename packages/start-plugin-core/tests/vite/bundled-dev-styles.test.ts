import { describe, expect, test, vi } from 'vitest'
import {
  captureBundledDevStyles,
  collectBundledDevStyles,
  loadBundledDevStyles,
} from '../../src/vite/dev-server-plugin/bundled-dev-styles'
import { CSS_FILE_REGEX } from '../../src/vite/dev-server-plugin/dev-styles'
import { devServerPlugin } from '../../src/vite/dev-server-plugin/plugin'
import type { EnvironmentModuleNode, Plugin } from 'vite'

test.each([
  {
    enabled: true,
    bundledDev: true,
    command: 'serve',
    mode: 'development',
    eager: true,
  },
  {
    enabled: false,
    bundledDev: true,
    command: 'serve',
    mode: 'development',
    eager: false,
  },
  {
    enabled: true,
    bundledDev: false,
    command: 'serve',
    mode: 'development',
    eager: false,
  },
  {
    enabled: true,
    bundledDev: true,
    command: 'build',
    mode: 'production',
    eager: false,
  },
  {
    enabled: true,
    bundledDev: true,
    command: 'serve',
    mode: 'test',
    eager: false,
  },
])(
  'only requests an eager bundled client when SSR styles need it: %j',
  ({ enabled, bundledDev, command, mode, eager }) => {
    const plugins = devServerPlugin({
      getConfig: () => {
        throw new Error('Not needed while configuring dev styles')
      },
      devSsrStylesEnabled: enabled,
      installDevServerMiddleware: undefined,
    }) as Array<Plugin>
    const config = plugins[0]!.config
    if (typeof config !== 'function') {
      throw new Error('Expected the dev-server config hook')
    }
    const result = Reflect.apply(config, undefined, [
      { experimental: { bundledDev } },
      { command, mode },
    ])

    expect(result).toEqual(
      eager
        ? {
            environments: {
              client: {
                build: {
                  rolldownOptions: {
                    experimental: { devMode: { lazy: false } },
                  },
                },
              },
            },
          }
        : undefined,
    )
  },
)

function createModule(url: string, id = `/app${url}`): EnvironmentModuleNode {
  return {
    environment: 'ssr',
    url,
    id,
    file: id.split('?')[0]!,
    type: 'js',
    importers: new Set(),
    importedModules: new Set(),
    acceptedHmrDeps: new Set(),
    acceptedHmrExports: null,
    importedBindings: null,
    transformResult: { code: '', map: null },
    ssrModule: null,
    ssrError: null,
    lastHMRTimestamp: 0,
    lastInvalidationTimestamp: 0,
  }
}

function createEnvironment(modules: Array<EnvironmentModuleNode>) {
  const byUrl = new Map(modules.map((module) => [module.url, module]))
  return {
    moduleGraph: {
      getModuleByUrl: vi.fn(async (url: string) => byUrl.get(url)),
    },
    transformRequest: vi.fn(async (_url: string) => ({
      code: 'export default ""',
      map: null,
    })),
  }
}

describe('captureBundledDevStyles', () => {
  test('reads compiled CSS from the completed bundler module graph', () => {
    const css = '.box { color: blue; }'
    const sfcId = '/app/Box.vue?vue&type=style&index=0&lang.css'
    const modules = new Map([
      ['/app/entry.ts', { code: `const __vite__css = "not a stylesheet"` }],
      [
        '/app/style.css',
        { code: `const __vite__css = ${JSON.stringify(css)}` },
      ],
      [
        sfcId,
        { code: 'const __vite__css = ".box[data-v-test] { color: red; }"' },
      ],
      [
        '/app/style.css?inline',
        { code: `export default ${JSON.stringify(css)}` },
      ],
      ['/app/missing.css', null],
    ])
    const context = {
      getModuleIds: () => modules.keys(),
      getModuleInfo: (id: string) => modules.get(id) ?? null,
    }

    const snapshot = captureBundledDevStyles(context)
    expect([...snapshot]).toEqual([
      ['/app/style.css', css],
      [sfcId, '.box[data-v-test] { color: red; }'],
    ])

    modules.delete('/app/style.css')
    expect(captureBundledDevStyles(context).has('/app/style.css')).toBe(false)
    expect(snapshot.get('/app/style.css')).toBe(css)
  })

  test('normalizes Windows module ids without removing their query', () => {
    const id = 'C:\\app\\style.module.css?direct'
    expect(
      captureBundledDevStyles({
        getModuleIds: () => [id],
        getModuleInfo: () => ({ code: 'const __vite__css = ".scoped {}"' }),
      }).get('C:/app/style.module.css?direct'),
    ).toBe('.scoped {}')
  })
})

describe('loadBundledDevStyles', () => {
  test('uses the captured client CSS without requesting another transform', async () => {
    const module = createModule('/style.module.css')
    const environment = createEnvironment([module])

    expect(
      await loadBundledDevStyles(
        environment,
        module.url,
        new Map([[module.id!, '.scoped { color: blue; }']]),
      ),
    ).toBe('.scoped { color: blue; }')
    expect(environment.transformRequest).not.toHaveBeenCalled()
  })

  test.each([
    'const __vite_ssr_export_default__ = ',
    '__vite_ssr_exports__.default = ',
    'export default ',
  ])('loads cold lazy styles through SSR with %s', async (marker) => {
    const url = '/Box.vue?vue&type=style&index=0&lang.css'
    const environment = createEnvironment([createModule(url)])
    const css = '.box[data-v-test]::before { content: "quoted"; }\n'
    environment.transformRequest.mockResolvedValue({
      code: `${marker}${JSON.stringify(css)}`,
      map: null,
    })

    expect(await loadBundledDevStyles(environment, url, new Map())).toBe(css)
    expect(environment.transformRequest).toHaveBeenCalledExactlyOnceWith(
      '/Box.vue?inline&vue&type=style&index=0&lang.css',
    )
    expect(
      CSS_FILE_REGEX.test(environment.transformRequest.mock.calls[0]![0]),
    ).toBe(true)
  })

  test('does not recompile an empty captured stylesheet', async () => {
    const module = createModule('/empty.css')
    const environment = createEnvironment([module])

    expect(
      await loadBundledDevStyles(
        environment,
        module.url,
        new Map([[module.id!, '']]),
      ),
    ).toBe('')
    expect(environment.transformRequest).not.toHaveBeenCalled()
  })

  test.each(['__VITE_ASSET__asset__', '__VITE_PUBLIC_ASSET__asset__'])(
    'resolves %s through the SSR CSS pipeline',
    async (placeholder) => {
      const module = createModule('/style.css')
      const environment = createEnvironment([module])
      const css = '.box { background: url("/image.svg"); }'
      environment.transformRequest.mockResolvedValue({
        code: `const __vite_ssr_export_default__ = ${JSON.stringify(css)}`,
        map: null,
      })

      expect(
        await loadBundledDevStyles(
          environment,
          module.url,
          new Map([
            [module.id!, `.box { background: url("${placeholder}"); }`],
          ]),
        ),
      ).toBe(css)
      expect(environment.transformRequest).toHaveBeenCalledExactlyOnceWith(
        '/style.css?inline',
      )
    },
  )

  test('propagates CSS compilation failures', async () => {
    const environment = createEnvironment([])
    const error = new Error('invalid stylesheet')
    environment.transformRequest.mockRejectedValue(error)

    await expect(
      loadBundledDevStyles(environment, '/style.scss', new Map()),
    ).rejects.toBe(error)
  })

  test('reports an unexpected inline transform instead of dropping the CSS', async () => {
    const environment = createEnvironment([])
    environment.transformRequest.mockResolvedValue({
      code: 'export {}',
      map: null,
    })

    await expect(
      loadBundledDevStyles(environment, '/style.css', new Map()),
    ).rejects.toThrow('Could not extract inline SSR CSS')
  })
})

test('discovers SFC styles from SSR without duplicating CSS imports or loading inline CSS', async () => {
  const entry = createModule('/entry.ts')
  const css = createModule('/Box.vue?vue&type=style&index=0&lang.css')
  const importedCss = createModule('/imported.css')
  const inlineCss = [
    'inline',
    'inline=true',
    'inline-css=1',
    'raw=1',
    'url=true',
  ].map((query) => createModule(`/inline.css?${query}`))
  entry.importedModules.add(css)
  for (const module of inlineCss) {
    entry.importedModules.add(module)
  }
  css.importedModules.add(importedCss)
  const environment = createEnvironment([entry, css, importedCss, ...inlineCss])
  expect(
    await collectBundledDevStyles({
      serverEnvironment: environment,
      rootDirectory: '/app',
      entries: ['/app/entry.ts'],
      styles: new Map([[css.id!, '.box[data-v-test] {}']]),
    }),
  ).toContain('.box[data-v-test] {}')
  expect(environment.transformRequest).not.toHaveBeenCalled()
})
