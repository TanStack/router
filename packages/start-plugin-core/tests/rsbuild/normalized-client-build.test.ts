import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { rspack } from '@rsbuild/core'
import { join } from 'pathe'
import { describe, expect, test, vi } from 'vitest'
import {
  normalizeRspackClientBuild,
  registerClientBuildCapture,
} from '../../src/rsbuild/normalized-client-build'
import { buildStartManifest } from '../../src/start-manifest-plugin/manifestBuilder'
import type { RsbuildPluginAPI, Rspack } from '@rsbuild/core'
import type { GetConfigFn, NormalizedClientGroupBuild } from '../../src/types'

async function buildClientFixture(
  files: Record<string, string>,
  config: Rspack.Configuration = {},
  captureBuild: (
    compilation: Rspack.Compilation,
  ) => NormalizedClientGroupBuild = (compilation) =>
    normalizeRspackClientBuild(compilation, true),
) {
  const directory = await mkdtemp(join(tmpdir(), 'tss-rsbuild-css-'))
  let clientBuild: NormalizedClientGroupBuild | undefined
  const compiler = rspack({
    ...config,
    context: directory,
    mode: 'production',
    cache: false,
    entry: config.entry ?? { index: './index.js' },
    output: {
      path: join(directory, 'dist'),
      filename: '[name].js',
      chunkFilename: '[name].js',
      cssFilename: '[name].css',
      cssChunkFilename: '[name].css',
      assetModuleFilename: '[name][ext]',
      publicPath: '',
    },
    module: config.module ?? {
      rules: [
        { test: /\.css$/, type: 'css' },
        { test: /\.svg$/, type: 'asset/resource' },
      ],
    },
    optimization: {
      minimize: false,
      concatenateModules: false,
      splitChunks: false,
      ...config.optimization,
    },
    plugins: [
      new rspack.experiments.VirtualModulesPlugin(
        Object.fromEntries(
          Object.entries(files).map(([name, source]) => [
            join(directory, name),
            source,
          ]),
        ),
      ),
      {
        apply(compiler: Rspack.Compiler) {
          compiler.hooks.thisCompilation.tap(
            'CaptureClientBuild',
            (compilation) => {
              compilation.hooks.processAssets.tap(
                {
                  name: 'CaptureClientBuild',
                  stage: rspack.Compilation.PROCESS_ASSETS_STAGE_REPORT,
                },
                () => {
                  clientBuild = captureBuild(compilation)
                },
              )
            },
          )
        },
      },
    ],
  })
  try {
    const stats = await promisify(compiler.run.bind(compiler))()
    expect(stats?.toJson({ all: false, errors: true }).errors).toEqual([])
    expect(clientBuild).toBeDefined()
    return { clientBuild: clientBuild!, directory }
  } finally {
    await promisify(compiler.close.bind(compiler))()
    await rm(directory, { recursive: true, force: true })
  }
}

const stylesheetFiles = {
  'index.js': `
    import './root.css'
    globalThis.route = () => import(/* webpackChunkName: "posts" */ './posts.js?tsr-split=component')
  `,
  'posts.js': `import './posts.css'; export const render = () => 'posts'`,
  'root.css': '.card{background:url(./dot.svg)}',
  'posts.css': '.card{background:url(./dot.svg)}',
  'dot.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
}

function manifestForRoutes(
  clientBuild: NormalizedClientGroupBuild,
  directory: string,
  routes: Array<string>,
) {
  return buildStartManifest({
    clientBuild,
    basePath: '/',
    routeTreeRoutes: {
      __root__: { children: routes.map((route) => `/${route}`) },
      ...Object.fromEntries(
        routes.map((route) => [
          `/${route}`,
          { filePath: join(directory, `${route}.js`) },
        ]),
      ),
    },
  })
}

// Rspack reports module paths using the OS native separator on Windows
// (e.g. `C:\app\src\routes\posts.tsx`), while the generated route tree always
// records `filePath` with POSIX separators. This compilation mimics that
// Windows output so we can verify the route still keys its chunk correctly.
function makeWindowsCompilation(readCss: () => string | Uint8Array) {
  const entryChunk = {
    name: 'index',
    files: new Set(['index.js', 'root.css']),
    auxiliaryFiles: new Set(),
    groupsIterable: new Set(),
    runtime: new Set(['index']),
  }
  const routeChunk = {
    files: new Set(['posts.js']),
    auxiliaryFiles: new Set(['posts.css']),
    groupsIterable: new Set(),
    runtime: new Set(['index']),
  }
  const getAssets = () => [
    { name: 'root.css', source: { source: readCss } },
    { name: 'posts.css', source: { source: readCss } },
  ]
  const entryGroup = {
    chunks: [entryChunk],
    getEntrypointChunk: () => entryChunk,
    isInitial: () => true,
    getParents: () => [],
    origins: [],
    getModulePostOrderIndex: () => null,
    childrenIterable: [],
  }
  const request = String.raw`C:\app\src\routes\posts.tsx?tsr-split=component`
  const routeGroup = {
    chunks: [routeChunk],
    isInitial: () => false,
    getParents: () => [entryGroup],
    origins: [
      {
        request,
        module: { blocks: [{ dependencies: [{ request }], blocks: [] }] },
      },
    ],
    getModulePostOrderIndex: () => null,
    childrenIterable: [],
  }
  const compilation = {
    entrypoints: new Map([['index', entryGroup]]),
    chunkGroups: [entryGroup, routeGroup],
    moduleGraph: {
      getModule: () => ({
        nameForCondition: () => String.raw`C:\app\src\routes\posts.tsx`,
      }),
    },
    chunkGraph: { getChunkModulesIterableBySourceType: () => [] },
    getAssets,
  } as unknown as Rspack.Compilation
  return compilation
}

describe('normalizeRspackClientBuild', () => {
  test.each(
    ['shared', 'none', 'css-module', 'css-only'].flatMap((extraction) =>
      [false, true].flatMap((concatenateModules) =>
        [false, true].map((barrel) => ({
          extraction,
          concatenateModules,
          barrel,
        })),
      ),
    ),
  )(
    'isolates SSR assets with $extraction extraction, concatenateModules=$concatenateModules, barrel=$barrel',
    async ({ extraction, concatenateModules, barrel }) => {
      const files = {
        'index.js': `
          import './root.css'
          globalThis.routes = [
            () => import(/* webpackChunkName: "alpha" */ './alpha.js?tsr-split=component'),
            () => import(/* webpackChunkName: "beta" */ './beta.js?tsr-split=component'),
          ]
        `,
        'alpha.js': `
          import { header } from './${barrel ? 'barrel' : 'header'}.js'
          import './alpha.css'
          export const render = () => header() + 'alpha'
          export const lazy = () => import(/* webpackChunkName: "lazy" */ './lazy.js')
        `,
        'beta.js': `
          import { header } from './${barrel ? 'barrel' : 'header'}.js'
          import './beta.css'
          export const render = () => header() + 'beta'
        `,
        'barrel.js': `export { header } from './header.js'`,
        'header.js':
          extraction === 'css-only'
            ? `import './shared.module.css'; export const header = () => 'header'`
            : `
              import * as styles from './shared.module.css'
              export const header = () => styles.header
            `,
        'lazy.js': `import './lazy.css'; export const lazy = 'lazy'`,
        'root.css': 'body { margin: 0; }',
        'alpha.css': '.alpha { color: red; }',
        'beta.css': '.beta { color: blue; }',
        'lazy.css': '.lazy { color: green; }',
        'shared.module.css': '.header { display: grid; height: 64px; }',
      }
      const { clientBuild, directory } = await buildClientFixture(files, {
        module: {
          rules: [
            { test: /barrel\.js$/, sideEffects: false },
            {
              test: /\.css$/,
              type: extraction === 'css-only' ? 'css' : 'css/auto',
            },
          ],
        },
        optimization: {
          minimize: false,
          concatenateModules,
          splitChunks:
            extraction === 'none'
              ? false
              : {
                  minSize: 0,
                  cacheGroups: {
                    default: false,
                    defaultVendors: false,
                    shared: {
                      name: 'shared',
                      test:
                        extraction === 'shared'
                          ? /(?:header\.js|shared\.module\.css)$/
                          : /shared\.module\.css$/,
                      chunks: 'async',
                      enforce: true,
                    },
                  },
                },
        },
      })

      for (const routeOrder of [
        ['alpha', 'beta'],
        ['beta', 'alpha'],
      ]) {
        const manifest = buildStartManifest({
          clientBuild,
          basePath: '/',
          routeTreeRoutes: {
            __root__: { children: routeOrder.map((route) => `/${route}`) },
            ...Object.fromEntries(
              routeOrder.map((route) => [
                `/${route}`,
                { filePath: join(directory, `${route}.js`) },
              ]),
            ),
          },
        })

        expect(manifest.routes.__root__?.css).toEqual(['/index.css'])
        for (const route of routeOrder) {
          expect(manifest.routes[`/${route}`]?.css).toEqual([
            ...(extraction === 'none' ? [] : ['/shared.css']),
            `/${route}.css`,
          ])
          expect(manifest.routes[`/${route}`]?.preloads).toEqual([
            `/${route}.js`,
            ...(extraction === 'shared' || extraction === 'css-module'
              ? ['/shared.js']
              : []),
          ])
          const headerCss = clientBuild.cssContentByFileName?.get(
            extraction === 'none' ? `${route}.css` : 'shared.css',
          )
          expect(headerCss).toMatch(/display:\s*grid/)
          expect(headerCss).toMatch(/height:\s*64px/)
        }
      }
    },
  )

  test.each([false, true])(
    'resolves aliased route origins with concatenateModules=%s',
    async (concatenateModules) => {
      const { clientBuild, directory } = await buildClientFixture(
        {
          'index.js': `import { load } from './loader.js'; globalThis.load = load`,
          'loader.js': `export const load = () => import(/* webpackChunkName: "alpha" */ '@route?tsr-split=component')`,
          'alpha.js': `import './alpha.css'; export const component = 'alpha'`,
          'alpha.css': '.alpha { color: red }',
        },
        {
          resolve: { alias: { '@route': './alpha.js' } },
          optimization: { concatenateModules },
        },
      )
      const manifest = manifestForRoutes(clientBuild, directory, ['alpha'])
      expect(manifest.routes['/alpha']?.preloads).toEqual(['/alpha.js'])
      expect(manifest.routes['/alpha']?.css).toEqual(['/alpha.css'])
    },
  )

  test('maps every tagged origin when routes share a named loading group', async () => {
    const { clientBuild, directory } = await buildClientFixture({
      'index.js': `globalThis.routes = [
        () => import(/* webpackChunkName: "routes" */ './alpha.js?tsr-split=component'),
        () => import(/* webpackChunkName: "routes" */ './beta.js?tsr-split=component'),
      ]`,
      'alpha.js': `import './alpha.css'; export const component = 'alpha'`,
      'beta.js': `import './beta.css'; export const component = 'beta'`,
      'alpha.css': '.alpha { color: red }',
      'beta.css': '.beta { color: blue }',
    })
    const manifest = manifestForRoutes(clientBuild, directory, [
      'alpha',
      'beta',
    ])
    for (const route of ['/alpha', '/beta']) {
      expect(manifest.routes[route]?.preloads).toEqual(['/routes.js'])
      expect(manifest.routes[route]?.css).toEqual(['/routes.css'])
    }
  })

  test('merges component and loader groups for the same physical route', async () => {
    const { clientBuild, directory } = await buildClientFixture({
      'index.js': `globalThis.routes = [
        () => import(/* webpackChunkName: "component" */ './alpha.js?tsr-split=component'),
        () => import(/* webpackChunkName: "loader" */ './alpha.js?tsr-split=loader'),
      ]`,
      'alpha.js': `import './alpha.css'; export const route = 'alpha'`,
      'alpha.css': '.alpha { color: red }',
    })
    const manifest = manifestForRoutes(clientBuild, directory, ['alpha'])
    expect(manifest.routes['/alpha']?.preloads).toEqual(
      expect.arrayContaining(['/component.js', '/loader.js']),
    )
    expect(manifest.routes['/alpha']?.preloads).toHaveLength(2)
    expect(manifest.routes['/alpha']?.css).toEqual(
      expect.arrayContaining(['/component.css', '/loader.css']),
    )
    expect(manifest.routes['/alpha']?.css).toHaveLength(2)
  })

  test('includes nested deferred hydration CSS without preloading its JS or ordinary lazy children', async () => {
    const { clientBuild, directory } = await buildClientFixture({
      'index.js': `globalThis.routes = [
        () => import(/* webpackChunkName: "alpha" */ './alpha.js?tsr-split=component'),
        () => import(/* webpackChunkName: "beta" */ './beta.js?tsr-split=component'),
      ]`,
      'alpha.js': `
        import './alpha.css'
        export const deferred = () => import(/* webpackChunkName: "deferred" */ './deferred.js?tss-hydrate=first')
        export const lazy = () => import(/* webpackChunkName: "lazy" */ './lazy.js')
      `,
      'beta.js': `export const component = 'beta'`,
      'deferred.js': `
        import './deferred.css'
        export const nested = () => import(/* webpackChunkName: "nested" */ './nested.js?tss-hydrate=second')
      `,
      'nested.js': `import './nested.css'; export const component = 'nested'`,
      'lazy.js': `
        import './lazy.css'
        export const deferred = () => import(/* webpackChunkName: "unrelated" */ './unrelated.js?tss-hydrate=third')
      `,
      'unrelated.js': `import './unrelated.css'; export const component = 'unrelated'`,
      'alpha.css': '.alpha { color: red }',
      'deferred.css': '.deferred { color: blue }',
      'nested.css': '.nested { color: green }',
      'lazy.css': '.lazy { color: yellow }',
      'unrelated.css': '.unrelated { color: orange }',
    })
    const manifest = manifestForRoutes(clientBuild, directory, [
      'alpha',
      'beta',
    ])
    expect(manifest.routes['/alpha']?.preloads).toEqual(['/alpha.js'])
    expect(manifest.routes['/alpha']?.css).toEqual([
      '/alpha.css',
      '/deferred.css',
      '/nested.css',
    ])
    expect(manifest.routes['/beta']?.preloads).toEqual(['/beta.js'])
    expect(manifest.routes['/beta']?.css).toBeUndefined()
  })

  test('includes hydration CSS from an entrypoint root without preloading hydration JS', async () => {
    const { clientBuild, directory } = await buildClientFixture({
      'index.js': `
        import { widget } from './root.js'
        globalThis.widget = widget
        globalThis.routes = [
          () => import(/* webpackChunkName: "alpha" */ './alpha.js?tsr-split=component'),
        ]
      `,
      'root.js': `
        export const widget = () => import(/* webpackChunkName: "deferred" */ './deferred.js?tss-hydrate=root_widget')
      `,
      'alpha.js': `
        import { widget } from './root.js'
        export const component = widget
      `,
      'deferred.js': `import './deferred.css'; export const component = 'deferred'`,
      'deferred.css': '.deferred { color: blue }',
    })
    const manifest = buildStartManifest({
      clientBuild,
      basePath: '/',
      routeTreeRoutes: {
        __root__: {
          filePath: join(directory, 'root.js'),
          children: ['/alpha'],
        },
        '/alpha': { filePath: join(directory, 'alpha.js') },
      },
    })
    const root = manifest.routes.__root__
    const alpha = manifest.routes['/alpha']
    const css = [...(root?.css ?? []), ...(alpha?.css ?? [])]
    const preloads = [...(root?.preloads ?? []), ...(alpha?.preloads ?? [])]

    expect(css).toEqual(['/deferred.css'])
    expect(preloads).toEqual(expect.arrayContaining(['/index.js', '/alpha.js']))
    expect(preloads).not.toContain('/deferred.js')
  })

  test('preserves initial script order and includes RSC entry CSS without its JS', async () => {
    const { clientBuild } = await buildClientFixture(
      {
        'index.js': `import { value } from './vendor.js'; globalThis.value = value()`,
        'vendor.js': `export const value = () => 'vendor'`,
        'rsc.js': `import './rsc.css'; globalThis.rsc = true`,
        'rsc.css': '.rsc { color: red }',
      },
      {
        entry: { index: './index.js', rsc: './rsc.js' },
        optimization: {
          runtimeChunk: { name: 'runtime' },
          splitChunks: {
            cacheGroups: {
              vendor: {
                test: /vendor\.js$/,
                name: 'vendor',
                chunks: 'all',
                enforce: true,
              },
            },
          },
        },
      },
    )
    const manifest = buildStartManifest({
      clientBuild,
      basePath: '/assets/',
      routeTreeRoutes: { __root__: {} },
      scriptFormat: 'iife',
      additionalRouteAssets: { __root__: [{ attrs: { src: '/custom.js' } }] },
    })
    expect(
      manifest.routes.__root__?.scripts?.map((script) => script.attrs?.src),
    ).toEqual([
      '/custom.js',
      '/assets/runtime.js',
      '/assets/vendor.js',
      '/assets/index.js',
    ])
    expect(manifest.routes.__root__?.css).toEqual(['/assets/rsc.css'])
    expect(manifest.routes.__root__?.preloads).toEqual([
      '/assets/runtime.js',
      '/assets/vendor.js',
      '/assets/index.js',
    ])
  })

  test('preloads second-level static dependency chunks and orders their css first', async () => {
    const { clientBuild, directory } = await buildClientFixture(
      {
        'index.js': `
          import './root.css'
          globalThis.routes = [
            () => import(/* webpackChunkName: "alpha" */ './alpha.js?tsr-split=component'),
            () => import(/* webpackChunkName: "beta" */ './beta.js?tsr-split=component'),
          ]
        `,
        'alpha.js': `
          import { header } from './header.js'
          import './alpha.css'
          export const render = () => header() + 'alpha'
        `,
        'beta.js': `
          import { header } from './header.js'
          import './beta.css'
          export const render = () => header() + 'beta'
        `,
        'header.js': `
          import { format } from './format.js'
          import './header.css'
          export const header = () => format('header')
        `,
        'format.js': `
          import './format.css'
          export const format = (value) => '[' + value + ']'
        `,
        'root.css': 'body { margin: 0; }',
        'alpha.css': '.alpha { color: red; }',
        'beta.css': '.beta { color: blue; }',
        'header.css': '.header { display: grid; }',
        'format.css': '.format { font-weight: bold; }',
      },
      {
        optimization: {
          splitChunks: {
            minSize: 0,
            cacheGroups: {
              default: false,
              defaultVendors: false,
              header: {
                name: 'header',
                test: /header\.(?:js|css)$/,
                chunks: 'async',
                enforce: true,
              },
              format: {
                name: 'format',
                test: /format\.(?:js|css)$/,
                chunks: 'async',
                enforce: true,
              },
            },
          },
        },
      },
    )

    const manifest = buildStartManifest({
      clientBuild,
      basePath: '/',
      routeTreeRoutes: {
        __root__: { children: ['/alpha', '/beta'] },
        '/alpha': { filePath: join(directory, 'alpha.js') },
        '/beta': { filePath: join(directory, 'beta.js') },
      },
    })

    for (const route of ['alpha', 'beta']) {
      expect(manifest.routes[`/${route}`]?.css).toEqual([
        '/format.css',
        '/header.css',
        `/${route}.css`,
      ])
      expect(manifest.routes[`/${route}`]?.preloads).toEqual([
        `/${route}.js`,
        '/format.js',
        '/header.js',
      ])
    }
  })

  test('keeps route css off the root when an initial vendor chunk is shared with route groups', async () => {
    const { clientBuild, directory } = await buildClientFixture(
      {
        'index.js': `
          import './root.css'
          import { lib } from './lib.js'
          globalThis.lib = lib()
          globalThis.routes = [
            () => import(/* webpackChunkName: "root" */ './root.js?tsr-split=component'),
            () => import(/* webpackChunkName: "alpha" */ './alpha.js?tsr-split=component'),
            () => import(/* webpackChunkName: "beta" */ './beta.js?tsr-split=component'),
          ]
        `,
        'root.js': `
          import { lib2 } from './lib2.js'
          import './shell.css'
          export const render = () => lib2() + 'root'
        `,
        'alpha.js': `
          import { lib2 } from './lib2.js'
          import './alpha.css'
          export const render = () => lib2() + 'alpha'
        `,
        'beta.js': `
          import { lib } from './lib.js'
          import { lib2 } from './lib2.js'
          import './beta.css'
          export const render = () => lib() + lib2() + 'beta'
        `,
        'lib.js': `export const lib = () => 'lib'`,
        'lib2.js': `export const lib2 = () => 'lib2'`,
        'root.css': 'body { margin: 0; }',
        'shell.css': '.shell { display: flex; }',
        'alpha.css': '.alpha { color: red; }',
        'beta.css': '.beta { color: blue; }',
      },
      {
        optimization: {
          splitChunks: {
            minSize: 0,
            cacheGroups: {
              default: false,
              defaultVendors: false,
              vendor: {
                name: 'vendor',
                test: /lib2?\.js$/,
                chunks: 'all',
                enforce: true,
              },
            },
          },
        },
      },
    )

    // The vendor chunk belongs to the entry group and to every route group that
    // uses it. Group membership must not pull route CSS into the root.
    const manifest = buildStartManifest({
      clientBuild,
      basePath: '/',
      routeTreeRoutes: {
        __root__: {
          filePath: join(directory, 'root.js'),
          children: ['/alpha', '/beta'],
        },
        '/alpha': { filePath: join(directory, 'alpha.js') },
        '/beta': { filePath: join(directory, 'beta.js') },
      },
    })

    expect(manifest.routes.__root__?.css).toEqual(['/root.css', '/index.css'])
    expect(manifest.routes.__root__?.preloads).toEqual([
      '/root.js',
      '/vendor.js',
      '/index.js',
    ])
    expect(manifest.routes['/alpha']?.css).toEqual(['/alpha.css'])
    expect(manifest.routes['/alpha']?.preloads).toEqual(['/alpha.js'])
    expect(manifest.routes['/beta']?.css).toEqual(['/beta.css'])
    expect(manifest.routes['/beta']?.preloads).toEqual(['/beta.js'])
  })

  test('excludes tree-shaken imports even when the module is in an initial chunk', async () => {
    const { clientBuild, directory } = await buildClientFixture(
      {
        'index.js': `
        import { unused } from './unused.js'
        globalThis.value = unused
        globalThis.route = () => import(/* webpackChunkName: "alpha" */ './alpha.js?tsr-split=component')
      `,
        'alpha.js': `
        import { unused } from './unused.js'
        import './alpha.css'
        export const render = () => 'alpha'
      `,
        'unused.js': `export const unused = 'unused'`,
        'alpha.css': '.alpha { color: red; }',
      },
      {
        module: {
          rules: [
            { test: /unused\.js$/, sideEffects: false },
            { test: /\.css$/, type: 'css' },
          ],
        },
      },
    )

    const manifest = manifestForRoutes(clientBuild, directory, ['alpha'])
    expect(manifest.routes['/alpha']?.preloads).toEqual(['/alpha.js'])
    expect(manifest.routes['/alpha']?.css).toEqual(['/alpha.css'])
  })

  test('uses a dependency in the parent group without importing its copy in another entry', async () => {
    const { clientBuild, directory } = await buildClientFixture(
      {
        'index.js': `
        import { header } from './header.js'
        globalThis.header = header
        globalThis.route = () => import(/* webpackChunkName: "alpha" */ './alpha.js?tsr-split=component')
      `,
        'other.js': `import { header } from './header.js'; globalThis.otherHeader = header`,
        'alpha.js': `import { header } from './header.js'; export const render = () => header()`,
        'header.js': `import './header.css'; export const header = () => 'header'`,
        'header.css': '.header { display: grid; }',
      },
      { entry: { index: './index.js', other: './other.js' } },
    )

    const manifest = manifestForRoutes(clientBuild, directory, ['alpha'])
    expect(manifest.routes.__root__?.css).toEqual(['/index.css'])
    expect(manifest.routes['/alpha']?.preloads).toEqual(['/alpha.js'])
    expect(manifest.routes['/alpha']?.css).toBeUndefined()
  })

  test('does not import sibling route copies of a module from a shared chunk', async () => {
    const routes = ['alpha', 'beta', 'gamma']
    const { clientBuild, directory } = await buildClientFixture(
      {
        'index.js': `globalThis.routes = [${routes
          .map(
            (route) =>
              `() => import(/* webpackChunkName: "${route}" */ './${route}.js?tsr-split=component')`,
          )
          .join(', ')}]`,
        ...Object.fromEntries(
          routes.flatMap((route) => [
            [
              `${route}.js`,
              `
                import { shared } from './shared.js'
                import './${route}.css'
                export const render = () => shared() + '${route}'
              `,
            ],
            [`${route}.css`, `.${route} { color: red; }`],
          ]),
        ),
        'shared.js': `import { widget } from './widget.js'; export const shared = () => widget()`,
        'widget.js': `import './widget.css'; export const widget = () => 'widget'`,
        'widget.css': '.widget { display: grid; }',
      },
      {
        optimization: {
          splitChunks: {
            minSize: 0,
            cacheGroups: {
              default: false,
              defaultVendors: false,
              shared: {
                name: 'shared',
                test: /shared\.js$/,
                chunks: 'async',
                enforce: true,
              },
            },
          },
        },
      },
    )
    const manifest = buildStartManifest({
      clientBuild,
      basePath: '/',
      routeTreeRoutes: {
        __root__: { children: routes.map((route) => `/${route}`) },
        ...Object.fromEntries(
          routes.map((route) => [
            `/${route}`,
            { filePath: join(directory, `${route}.js`) },
          ]),
        ),
      },
    })

    for (const route of routes) {
      expect(manifest.routes[`/${route}`]?.css).toEqual([`/${route}.css`])
      expect(manifest.routes[`/${route}`]?.preloads).toEqual([
        `/${route}.js`,
        '/shared.js',
      ])
      expect(clientBuild.cssContentByFileName?.get(`${route}.css`)).toMatch(
        /\.widget\s*\{/,
      )
    }
  })

  test('links the split chunk a shared chunk uses in each route that loads it', async () => {
    const routes = ['alpha', 'beta', 'gamma']
    const { clientBuild, directory } = await buildClientFixture(
      {
        'index.js': `globalThis.routes = [${routes
          .map(
            (route) =>
              `() => import(/* webpackChunkName: "${route}" */ './${route}.js?tsr-split=component')`,
          )
          .join(', ')}]`,
        ...Object.fromEntries(
          routes.flatMap((route) => [
            [
              `${route}.js`,
              `
                import { shared } from './shared.js'
                import './${route}.css'
                export const render = () => shared() + '${route}'
              `,
            ],
            [`${route}.css`, `.${route} { color: red; }`],
          ]),
        ),
        'shared.js': `import { widget } from './widget.js'; export const shared = () => widget()`,
        'widget.js': `import './widget.css'; export const widget = () => 'widget'`,
        'widget.css': '.widget { display: grid; }',
      },
      {
        optimization: {
          splitChunks: {
            minSize: 0,
            cacheGroups: {
              default: false,
              defaultVendors: false,
              shared: {
                name: 'shared',
                test: /shared\.js$/,
                chunks: 'async',
                enforce: true,
              },
              widget: {
                name: 'widget',
                test: /widget\.(?:js|css)$/,
                chunks: (chunk) => chunk.name !== 'gamma',
                enforce: true,
              },
            },
          },
        },
      },
    )
    const manifest = buildStartManifest({
      clientBuild,
      basePath: '/',
      routeTreeRoutes: {
        __root__: { children: routes.map((route) => `/${route}`) },
        ...Object.fromEntries(
          routes.map((route) => [
            `/${route}`,
            { filePath: join(directory, `${route}.js`) },
          ]),
        ),
      },
    })

    for (const route of ['alpha', 'beta']) {
      expect(manifest.routes[`/${route}`]?.css).toEqual([
        '/widget.css',
        `/${route}.css`,
      ])
      expect(manifest.routes[`/${route}`]?.preloads).toEqual([
        `/${route}.js`,
        '/widget.js',
        '/shared.js',
      ])
    }
    expect(manifest.routes['/gamma']?.css).toEqual(['/gamma.css'])
    expect(manifest.routes['/gamma']?.preloads).toEqual([
      '/gamma.js',
      '/shared.js',
    ])
  })

  test('does not import a chunk that only one parent of a lazy group supplies', async () => {
    const { clientBuild, directory } = await buildClientFixture(
      {
        'index.js': `
          globalThis.routes = [
            () => import(/* webpackChunkName: "first" */ './first.js?tsr-split=component'),
            () => import(/* webpackChunkName: "second" */ './second.js?tsr-split=component'),
          ]
        `,
        'first.js': `
          import { dep } from './dep.js'
          export const render = () => dep() + 'first'
          export const open = () => import(/* webpackChunkName: "lazy" */ './lazy.js?tsr-split=component')
        `,
        'second.js': `
          import { dep } from './dep.js'
          export const render = () => dep() + 'second'
          export const open = () => import(/* webpackChunkName: "lazy" */ './lazy.js?tsr-split=component')
        `,
        'lazy.js': `import { dep } from './dep.js'; export const lazy = () => dep()`,
        'dep.js': `export const dep = () => 'dep'`,
      },
      {
        optimization: {
          splitChunks: {
            minSize: 0,
            cacheGroups: {
              default: false,
              defaultVendors: false,
              dep: {
                name: 'dep',
                test: /dep\.js$/,
                chunks: (chunk) => chunk.name === 'first',
                enforce: true,
              },
            },
          },
        },
      },
    )

    const manifest = manifestForRoutes(clientBuild, directory, [
      'first',
      'second',
      'lazy',
    ])
    expect(manifest.routes['/first']?.preloads).toEqual([
      '/first.js',
      '/dep.js',
    ])
    expect(manifest.routes['/lazy']?.preloads).toEqual(['/lazy.js'])
  })

  test('imports a chunk that every parent of a lazy group supplies', async () => {
    const { clientBuild, directory } = await buildClientFixture(
      {
        'index.js': `
          import { base } from './base.js'
          globalThis.base = base
          globalThis.routes = [
            () => import(/* webpackChunkName: "first" */ './first.js?tsr-split=component'),
            () => import(/* webpackChunkName: "second" */ './second.js?tsr-split=component'),
          ]
        `,
        'first.js': `
          import { common } from './common.js'
          export const render = () => common() + 'first'
          export const open = () => import(/* webpackChunkName: "lazy" */ './lazy.js?tsr-split=component')
        `,
        'second.js': `
          import { common } from './common.js'
          export const render = () => common() + 'second'
          export const open = () => import(/* webpackChunkName: "lazy" */ './lazy.js?tsr-split=component')
        `,
        'lazy.js': `
          import { base } from './base.js'
          import { common } from './common.js'
          export const lazy = () => base() + common()
        `,
        'base.js': `export const base = () => 'base'`,
        'common.js': `export const common = () => 'common'`,
      },
      {
        optimization: {
          splitChunks: {
            minSize: 0,
            cacheGroups: {
              default: false,
              defaultVendors: false,
              common: {
                name: 'common',
                test: /common\.js$/,
                chunks: 'async',
                enforce: true,
              },
            },
          },
        },
      },
    )

    const manifest = manifestForRoutes(clientBuild, directory, [
      'first',
      'second',
      'lazy',
    ])
    expect(manifest.routes['/lazy']?.preloads).toEqual([
      '/lazy.js',
      '/common.js',
    ])
  })

  test.each([
    { routeOrder: ['ping', 'pong'] },
    { routeOrder: ['pong', 'ping'] },
  ])(
    'resolves static imports in cyclic lazy routes regardless of order ($routeOrder)',
    async ({ routeOrder }) => {
      const otherRoute = { ping: 'pong', pong: 'ping' } as const
      const { clientBuild, directory } = await buildClientFixture(
        {
          'index.js': `globalThis.routes = [${routeOrder
            .map(
              (route) =>
                `() => import(/* webpackChunkName: "${route}" */ './${route}.js?tsr-split=component')`,
            )
            .join(', ')}]`,
          ...Object.fromEntries(
            (['ping', 'pong'] as const).map((route) => [
              `${route}.js`,
              `
                import { shared } from './shared.js'
                export const render = () => shared() + '${route}'
                export const next = () => import(/* webpackChunkName: "${otherRoute[route]}" */ './${otherRoute[route]}.js?tsr-split=component')
              `,
            ]),
          ),
          'shared.js': `import { widget } from './widget.js'; export const shared = () => widget()`,
          'widget.js': `export const widget = () => 'widget'`,
        },
        {
          optimization: {
            splitChunks: {
              minSize: 0,
              cacheGroups: {
                default: false,
                defaultVendors: false,
                shared: {
                  name: 'shared',
                  test: /shared\.js$/,
                  chunks: 'async',
                  enforce: true,
                },
              },
            },
          },
        },
      )

      const manifest = manifestForRoutes(clientBuild, directory, [
        'ping',
        'pong',
      ])
      for (const route of ['ping', 'pong'] as const) {
        expect(manifest.routes[`/${route}`]?.preloads).toEqual([
          `/${route}.js`,
          '/shared.js',
        ])
      }
    },
  )

  test('collects nested CSS imports before the importing route stylesheet', async () => {
    const { clientBuild, directory } = await buildClientFixture(
      {
        'index.js': `globalThis.route = () => import(/* webpackChunkName: "alpha" */ './alpha.js?tsr-split=component')`,
        'alpha.js': `import './alpha.css'; export const render = () => 'alpha'`,
        'alpha.css': '@import "./theme.css"; .alpha { color: red; }',
        'theme.css': '@import "./base.css"; .theme { color: blue; }',
        'base.css': '.base { color: green; }',
      },
      {
        optimization: {
          splitChunks: {
            minSize: 0,
            cacheGroups: {
              default: false,
              defaultVendors: false,
              theme: {
                name: 'theme',
                test: /theme\.css$/,
                chunks: 'async',
                enforce: true,
              },
              base: {
                name: 'base',
                test: /base\.css$/,
                chunks: 'async',
                enforce: true,
              },
            },
          },
        },
      },
    )
    const manifest = buildStartManifest({
      clientBuild,
      basePath: '/',
      routeTreeRoutes: {
        __root__: { children: ['/alpha'] },
        '/alpha': { filePath: join(directory, 'alpha.js') },
      },
    })

    expect(manifest.routes['/alpha']?.css).toEqual([
      '/base.css',
      '/theme.css',
      '/alpha.css',
    ])
  })

  test('keeps route stylesheet links with inline CSS disabled by default', async () => {
    const { clientBuild, directory } = await buildClientFixture(
      stylesheetFiles,
      {},
      normalizeRspackClientBuild,
    )
    const manifest = buildStartManifest({
      clientBuild,
      routeTreeRoutes: {
        __root__: { children: ['/posts'] },
        '/posts': { filePath: join(directory, 'posts.js') },
      },
      basePath: '/assets',
    })

    expect(manifest.routes.__root__?.css).toEqual(['/assets/index.css'])
    expect(manifest.routes['/posts']?.css).toEqual(['/assets/posts.css'])
    expect(manifest.inlineCss).toBeUndefined()
  })

  test.each([
    { action: 'build', enabled: false, captureCss: false },
    { action: 'build', enabled: true, captureCss: true },
    { action: 'dev', enabled: false, captureCss: false },
    { action: 'dev', enabled: true, captureCss: false },
  ])(
    'captures inline CSS according to the action and resolved config ($action, $enabled)',
    async ({ action, enabled, captureCss }) => {
      const processAssets = vi.fn<RsbuildPluginAPI['processAssets']>()
      const getConfig = () => ({
        startConfig: { server: { build: { inlineCss: { enabled } } } },
      })
      const { getClientBuild } = registerClientBuildCapture(
        { context: { action }, processAssets } as unknown as RsbuildPluginAPI,
        getConfig as unknown as GetConfigFn,
      )

      const [, capture] = processAssets.mock.calls[0]!
      const { clientBuild, directory } = await buildClientFixture(
        stylesheetFiles,
        {},
        (compilation) => {
          capture({ compilation } as Parameters<typeof capture>[0])
          return getClientBuild()!
        },
      )
      const manifest = buildStartManifest({
        clientBuild,
        routeTreeRoutes: {
          __root__: { children: ['/posts'] },
          '/posts': { filePath: join(directory, 'posts.js') },
        },
        basePath: '/assets',
        inlineCss: { enabled: captureCss, transformAssets: false },
      })

      expect(manifest.routes.__root__?.css).toEqual(['/assets/index.css'])
      expect(manifest.routes['/posts']?.css).toEqual(['/assets/posts.css'])
      if (captureCss) {
        expect(manifest.inlineCss?.styles).toEqual({
          '/assets/index.css': expect.stringContaining('/assets/dot.svg'),
          '/assets/posts.css': expect.stringContaining('/assets/dot.svg'),
        })
      } else {
        expect(manifest.inlineCss).toBeUndefined()
      }
    },
  )

  test('maps Windows route paths to matching route assets', () => {
    const compilation = makeWindowsCompilation(() => '.card{color:red}')
    const clientBuild = normalizeRspackClientBuild(compilation)
    const manifest = buildStartManifest({
      clientBuild,
      routeTreeRoutes: {
        __root__: {},
        '/posts': { filePath: 'C:/app/src/routes/posts.tsx' },
      },
      basePath: '/assets',
    })

    expect(manifest.routes['/posts']?.css).toEqual(['/assets/posts.css'])
    expect(manifest.routes['/posts']?.preloads).toEqual(['/assets/posts.js'])
  })
})
