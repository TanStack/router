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
import type { GetConfigFn, NormalizedClientBuild } from '../../src/types'

async function buildClientFixture(
  files: Record<string, string>,
  config: Rspack.Configuration = {},
  captureBuild: (compilation: Rspack.Compilation) => NormalizedClientBuild = (
    compilation,
  ) => normalizeRspackClientBuild(compilation, true),
) {
  const directory = await mkdtemp(join(tmpdir(), 'tss-rsbuild-css-'))
  let clientBuild: NormalizedClientBuild | undefined
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
  }
  const routeChunk = {
    files: new Set(['posts.js']),
    auxiliaryFiles: new Set(['posts.css']),
    groupsIterable: new Set(),
  }
  const getAssets = () => [
    { name: 'root.css', source: { source: readCss } },
    { name: 'posts.css', source: { source: readCss } },
  ]
  const compilation = {
    entrypoints: new Map([['index', { chunks: [entryChunk] }]]),
    chunks: new Set([entryChunk, routeChunk]),
    chunkGraph: {
      getChunkModules: (chunk: unknown) =>
        chunk === routeChunk
          ? [
              {
                identifier: () =>
                  'builtin:swc-loader??ruleSet[0]!C:\\app\\src\\routes\\posts.tsx?tsr-split=component',
                nameForCondition: () => 'C:\\app\\src\\routes\\posts.tsx',
              },
            ]
          : [],
    },
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

      expect(
        clientBuild.chunksByFileName.get('alpha.js')?.dynamicImports,
      ).toContain('lazy.js')

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

  test('excludes tree-shaken imports even when the module is in an initial chunk', async () => {
    const { clientBuild } = await buildClientFixture(
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

    expect(clientBuild.chunksByFileName.get('alpha.js')?.imports).toEqual([])
    expect(clientBuild.chunksByFileName.get('alpha.js')?.css).toEqual([
      'alpha.css',
    ])
  })

  test('uses a dependency in the parent group without importing its copy in another entry', async () => {
    const { clientBuild } = await buildClientFixture(
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

    expect(clientBuild.chunksByFileName.get('index.js')?.css).toEqual([
      'index.css',
    ])
    expect(clientBuild.chunksByFileName.get('other.js')?.css).toEqual([
      'other.css',
    ])
    expect(clientBuild.chunksByFileName.get('alpha.js')?.imports).toEqual([
      'index.js',
    ])
  })

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

    expect(clientBuild.chunksByFileName.has('base.js')).toBe(false)
    expect(clientBuild.chunksByFileName.has('theme.js')).toBe(false)
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

  test('keys the route chunk by a POSIX path when rspack reports OS native module paths', () => {
    const compilation = makeWindowsCompilation(() => '.card{color:red}')
    const clientBuild = normalizeRspackClientBuild(compilation)

    expect(
      clientBuild.chunksByFileName.get('posts.js')?.routeFilePaths,
    ).toEqual(['C:/app/src/routes/posts.tsx'])
  })

  test('gives a route its stylesheet and preload when rspack reports OS native module paths', () => {
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
