import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { promises as fs, realpathSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import {
  Generator,
  getConfig,
  pruneServerOnlySubtrees,
} from '@tanstack/router-generator'
import { parseStartConfig } from '../src/schema'
import { prerender } from '../src/prerender'
import { prerenderRoutesPlugin } from '../src/start-router-plugin/generator-plugins/prerender-routes-plugin'
import { routesManifestPlugin } from '../src/start-router-plugin/generator-plugins/routes-manifest-plugin'

type Framework = 'react' | 'solid' | 'vue'
const frameworks = ['react', 'solid', 'vue'] as const
const bundlers = ['vite', 'rsbuild'] as const
let workspace: string | undefined
afterEach(async () => {
  delete globalThis.TSS_PRERENDABLE_PATHS
  Reflect.deleteProperty(globalThis, 'TSS_ROUTES_MANIFEST')
  if (workspace) {
    await fs.rm(workspace, { recursive: true, force: true })
  }
})

async function fixtures(framework: Framework) {
  const routerPackage = `@tanstack/${framework}-router`
  const startPackage = `@tanstack/${framework}-start`
  const frameworkPackage = framework === 'solid' ? 'solid-js' : framework
  workspace = realpathSync(
    await fs.mkdtemp(path.join(os.tmpdir(), 'start-module-build-')),
  )
  const feature = path.join(workspace, 'feature')
  const app = path.join(workspace, 'app')
  const repository = path.resolve(import.meta.dirname, '../../..')
  for (const root of [feature, app]) {
    await fs.mkdir(path.join(root, 'src/routes'), { recursive: true })
    await fs.mkdir(path.join(root, 'node_modules/@tanstack'), {
      recursive: true,
    })
    await fs.symlink(
      path.join(repository, `packages/${framework}-router`),
      path.join(root, 'node_modules', routerPackage),
    )
    await fs.symlink(
      path.join(repository, `packages/${framework}-start`),
      path.join(root, 'node_modules', startPackage),
    )
    await fs.symlink(
      path.join(
        repository,
        `packages/${framework}-router/node_modules`,
        frameworkPackage,
      ),
      path.join(root, 'node_modules', frameworkPackage),
    )
  }
  await fs.writeFile(
    path.join(feature, 'package.json'),
    JSON.stringify({
      name: '@review/feature',
      type: 'module',
      dependencies: {
        [routerPackage]: '*',
        [startPackage]: '*',
        [frameworkPackage]: '*',
      },
      exports: {
        './package.json': './package.json',
        './route-module': './src/routeModule.gen.ts',
      },
      tanstack: { router: { module: {} } },
    }),
  )
  await fs.writeFile(
    path.join(app, 'package.json'),
    JSON.stringify({
      name: '@review/app',
      type: 'module',
      dependencies: {
        '@review/feature': '*',
        [routerPackage]: '*',
        [startPackage]: '*',
        [frameworkPackage]: '*',
      },
    }),
  )
  await fs.mkdir(path.join(app, 'node_modules/@review'), { recursive: true })
  await fs.symlink(feature, path.join(app, 'node_modules/@review/feature'))
  await fs.writeFile(
    path.join(feature, 'src/routes/__root.tsx'),
    `import { createModuleRoot } from '../routeScope.gen'
export const Route = createModuleRoot()({})
`,
  )
  await fs.writeFile(
    path.join(feature, 'src/routes/about.tsx'),
    `import { createFileRoute } from '../routeScope.gen'
export const Route = createFileRoute('@review/feature:/about')({ component: () => 'module page' })
`,
  )
  await fs.writeFile(
    path.join(feature, 'src/routes/api.tsx'),
    `import { createFileRoute } from '../routeScope.gen'
export const Route = createFileRoute('@review/feature:/api')({ server: { handlers: { GET: () => new Response('module api') } } })
`,
  )
  await fs.writeFile(
    path.join(app, 'src/routes/__root.tsx'),
    `import { createRootRoute } from '${routerPackage}'
export const Route = createRootRoute()
`,
  )
  await fs.writeFile(
    path.join(app, 'src/routes/about.tsx'),
    `import { createFileRoute } from '${routerPackage}'
export const Route = createFileRoute('/about')({ component: () => 'app page' })
`,
  )
  await fs.writeFile(
    path.join(app, 'src/routes/api.tsx'),
    `import { createFileRoute } from '${routerPackage}'
export const Route = createFileRoute('/api')({ server: { handlers: { GET: () => new Response('app api') } } })
`,
  )
  await fs.writeFile(
    path.join(app, 'src/router.ts'),
    `import { createRouter, createMemoryHistory } from '${routerPackage}'
import { routeTree } from './routeTree.gen'
export function getRouter() {
  return createRouter({ routeTree, history: createMemoryHistory() })
}
`,
  )
  for (const [root, moduleId] of [
    [feature, '@review/feature'],
    [app, ''],
  ] as const) {
    const factory = moduleId ? '../routeScope.gen' : routerPackage
    for (const [name, routePath, options] of [
      ['index', '/', "component: () => 'index'"],
      ['parent', '/parent', "component: () => 'parent'"],
      ['parent.index', '/parent/', "component: () => 'parent index'"],
      ['parent.child', '/parent/child', "component: () => 'child'"],
      ['_layout', '/_layout', "component: () => 'layout'"],
      ['_layout.page', '/_layout/page', "component: () => 'pathless child'"],
      ['$id', '/$id', "component: () => 'dynamic'"],
      [
        'mixed',
        '/mixed',
        "component: () => 'mixed', server: { handlers: { GET: () => new Response('server-only-sentinel') } }",
      ],
      [
        'branch',
        '/branch',
        "server: { handlers: { GET: () => new Response('server-only-sentinel') } }",
      ],
      [
        'branch.page',
        '/branch/page',
        "component: () => 'child needs its parent'",
      ],
      [
        'branch.api',
        '/branch/api',
        "server: { handlers: { GET: () => new Response('server-only-sentinel') } }",
      ],
      [
        'only',
        '/only',
        "server: { handlers: { GET: () => new Response('server-only-sentinel') } }",
      ],
      [
        'only.child',
        '/only/child',
        "server: { handlers: { GET: () => new Response('server-only-sentinel') } }",
      ],
    ]) {
      await fs.writeFile(
        path.join(root, `src/routes/${name}.tsx`),
        `import { createFileRoute } from '${factory}'
export const Route = createFileRoute('${moduleId ? `${moduleId}:` : ''}${routePath}')({ ${options} })
`,
      )
    }
  }
  const moduleConfig = getConfig(
    {
      disableLogging: true,
      target: framework,
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
      tmpDir: path.join(workspace, '.tmp'),
    },
    feature,
  )
  const providerGenerator = new Generator({
    root: feature,
    config: moduleConfig,
  })
  await providerGenerator.run()
  return { app, feature, providerGenerator }
}

it.each(frameworks)(
  '%s discovers and renders static mounted module pages without crawling links',
  async (framework) => {
    const { app } = await fixtures(framework)
    const config = getConfig(
      {
        disableLogging: true,
        target: framework,
        routesDirectory: './src/routes',
        generatedRouteTree: './src/routeTree.gen.ts',
        routeModules: {
          includes: [{ module: '@review/feature', at: '/feature' }],
        },
        tmpDir: path.join(workspace!, '.tmp'),
        plugins: [prerenderRoutesPlugin(), routesManifestPlugin()],
      },
      app,
    )
    await new Generator({ root: app, config }).run()
    expect(globalThis.TSS_ROUTES_MANIFEST).toHaveProperty(
      '@review/feature:/about',
    )
    const startConfig = parseStartConfig(
      {
        prerender: { enabled: true, crawlLinks: false },
        router: {
          routeModules: {
            includes: [{ module: '@review/feature', at: '/feature' }],
          },
        },
      },
      { framework },
      app,
    )
    const requested: Array<string> = []
    await prerender({
      startConfig,
      handler: {
        getClientOutputDirectory: () => path.join(workspace!, 'html'),
        request: async (url) => {
          requested.push(url)
          return new Response('<html><body>page</body></html>', {
            headers: { 'content-type': 'text/html' },
          })
        },
      },
    })
    expect(requested.map((pathname) => pathname.replace(/\/$/, ''))).toContain(
      '/feature/about',
    )
    await expect(
      fs.readFile(
        path.join(workspace!, 'html/feature/about/index.html'),
        'utf8',
      ),
    ).resolves.toContain('page')
    const paths = requested
      .map((pathname) => pathname.replace(/\/$/, ''))
      .sort()
    expect(paths).toEqual(
      [
        '',
        '/about',
        '/branch/page',
        '/feature',
        '/feature/about',
        '/feature/branch/page',
        '/feature/mixed',
        '/feature/page',
        '/feature/parent',
        '/feature/parent/child',
        '/mixed',
        '/page',
        '/parent',
        '/parent/child',
      ].sort(),
    )
  },
)

it.each(
  frameworks.flatMap((framework) =>
    bundlers.map((bundler) => ({ framework, bundler })),
  ),
)(
  '$framework/$bundler prunes application and module endpoints from the client',
  async ({ framework, bundler }) => {
    const { app } = await fixtures(framework)
    const repository = path.resolve(import.meta.dirname, '../../..')
    const outputRoot = path.join(app, 'dist')
    const outDir = path.join(outputRoot, 'client')
    await fs.writeFile(
      path.join(app, 'src/client.ts'),
      `import { getRouter } from './router'
globalThis.__routeModuleBuildRouter = getRouter()
`,
    )
    // Use each public Start plugin, including its compiler, environment
    // resolution and default server entry. The custom client entry exposes the
    // actual browser router without starting hydration in this probe.
    const buildScript = path.join(app, 'build.mjs')
    if (bundler === 'vite') {
      await fs.symlink(
        path.join(repository, 'packages/start-plugin-core/node_modules/vite'),
        path.join(app, 'node_modules/vite'),
      )
      const frameworkPlugins = {
        react: ['@vitejs/plugin-react'],
        solid: ['vite-plugin-solid'],
        vue: ['@vitejs/plugin-vue', '@vitejs/plugin-vue-jsx'],
      }[framework]
      for (const plugin of frameworkPlugins) {
        const destination = path.join(app, 'node_modules', plugin)
        await fs.mkdir(path.dirname(destination), { recursive: true })
        await fs.symlink(
          path.join(
            repository,
            `e2e/${framework}-start/server-routes/node_modules`,
            plugin,
          ),
          destination,
        )
      }
      await fs.writeFile(
        buildScript,
        `import { createBuilder } from 'vite'
import { tanstackStart } from '@tanstack/${framework}-start/plugin/vite'
${frameworkPlugins.map((plugin, index) => `import frameworkPlugin${index} from '${plugin}'`).join('\n')}

const builder = await createBuilder({
  configFile: false,
  root: process.cwd(),
  logLevel: 'warn',
  plugins: [
    tanstackStart({
      router: {
        routeModules: { includes: [{ module: '@review/feature', at: '/feature' }] },
        tmpDir: ${JSON.stringify(path.join(workspace!, '.tmp'))},
      },
    }),
    ${frameworkPlugins.map((_, index) => `frameworkPlugin${index}(${framework === 'solid' ? '{ ssr: true }' : ''})`).join(',\n    ')},
  ],
  build: { outDir: ${JSON.stringify(outputRoot)}, minify: false },
  environments: {
    client: { build: { rolldownOptions: { output: { entryFileNames: 'assets/[name].js' } } } },
    ssr: { build: { rolldownOptions: { output: { entryFileNames: 'index.js' } } } },
  },
})
await builder.buildApp()
`,
      )
    } else {
      await fs.mkdir(path.join(app, 'node_modules/@rsbuild'), {
        recursive: true,
      })
      await fs.symlink(
        path.join(
          repository,
          'packages/start-plugin-core/node_modules/@rsbuild/core',
        ),
        path.join(app, 'node_modules/@rsbuild/core'),
      )
      await fs.writeFile(
        buildScript,
        `import { createRsbuild } from '@rsbuild/core'
import { tanstackStart } from '@tanstack/${framework}-start/plugin/rsbuild'

const rsbuild = await createRsbuild({
  cwd: process.cwd(),
  config: {
    plugins: [tanstackStart({
      router: {
        routeModules: { includes: [{ module: '@review/feature', at: '/feature' }] },
        tmpDir: ${JSON.stringify(path.join(workspace!, '.tmp'))},
      },
    })],
    output: {
      distPath: { root: ${JSON.stringify(outputRoot)} },
      filename: { js: '[name].js' },
      filenameHash: false,
      minify: false,
    },
    environments: { ssr: { output: { module: true } } },
  },
})
await rsbuild.build()
`,
      )
    }
    execFileSync(process.execPath, [buildScript], {
      cwd: app,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })

    const serverResult = JSON.parse(
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `const { default: server } = await import(${JSON.stringify(pathToFileURL(path.join(outputRoot, 'server/index.js')).href)});
const paths = ['/api', '/feature/api', '/mixed', '/feature/mixed', '/only/child', '/feature/only/child'];
const responses = await Promise.all(paths.map(async path => {
  const response = await server.fetch(new Request('http://localhost' + path));
  return [path, { status: response.status, body: await response.text() }];
}));
console.log(JSON.stringify(Object.fromEntries(responses)));
`,
        ],
        { cwd: app, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
      ),
    )
    expect(serverResult['/api']).toEqual({ status: 200, body: 'app api' })
    expect(serverResult['/feature/api']).toEqual({
      status: 200,
      body: 'module api',
    })
    for (const route of [
      '/mixed',
      '/feature/mixed',
      '/only/child',
      '/feature/only/child',
    ]) {
      expect(serverResult[route]).toEqual({
        status: 200,
        body: 'server-only-sentinel',
      })
    }
    const jsdom = createRequire(
      path.join(repository, 'packages/react-router/package.json'),
    ).resolve('jsdom')
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `
    import { JSDOM } from ${JSON.stringify(pathToFileURL(jsdom).href)};
    const dom = new JSDOM('', {url: 'http://localhost/'});
    globalThis.window = dom.window;
    globalThis.self = dom.window;
    globalThis.document = dom.window.document;
    await import(${JSON.stringify(pathToFileURL(path.join(outDir, bundler === 'rsbuild' ? 'assets/js/index.js' : 'assets/index.js')).href)});
    const router = globalThis.__routeModuleBuildRouter;
    const summarize = (url) => router.matchRoutes(url).map(match => ({routeId: match.routeId, globalNotFound: match.globalNotFound}));
    console.log(JSON.stringify({
      routes: Object.keys(router.routesById),
      moduleHasServer: !!router.routesById['@review/feature:/api']?.options.server,
      appMatches: summarize('/api'),
      moduleMatches: summarize('/feature/api'),
      matches: Object.fromEntries(['/about', '/mixed', '/branch/page', '/only', '/only/child', '/feature/about', '/feature/mixed', '/feature/branch/page', '/feature/only', '/feature/only/child'].map(url => [url, summarize(url).at(-1)?.routeId])),
      mixedHasServer: !!router.routesById['@review/feature:/mixed']?.options.server,
    }));
    dom.window.close();
  `,
        ],
        { encoding: 'utf8' },
      ),
    )
    expect(result.appMatches.at(-1)?.routeId).not.toBe('/api')
    expect(result.moduleMatches.at(-1)?.routeId).not.toBe(
      '@review/feature:/api',
    )
    expect(result.matches).toMatchObject({
      '/about': '/about',
      '/mixed': '/mixed',
      '/branch/page': '/branch/page',
      '/feature/about': '@review/feature:/about',
      '/feature/mixed': '@review/feature:/mixed',
      '/feature/branch/page': '@review/feature:/branch/page',
    })
    for (const [url, id] of [
      ['/only', '/only'],
      ['/only/child', '/only/child'],
      ['/feature/only', '@review/feature:/only'],
      ['/feature/only/child', '@review/feature:/only/child'],
    ] as const) {
      expect(result.matches[url]).not.toBe(id)
    }
    expect(result.mixedHasServer).toBe(false)
    const files = await fs.readdir(outDir, { recursive: true })
    for (const file of files.filter((file) => file.endsWith('.js'))) {
      expect(await fs.readFile(path.join(outDir, file), 'utf8')).not.toContain(
        'server-only-sentinel',
      )
    }
  },
  60000,
)

it('refreshes module page eligibility after a provider option edit without a path change', async () => {
  const { app, feature, providerGenerator } = await fixtures('react')
  const config = getConfig(
    {
      disableLogging: true,
      routeModules: {
        includes: [{ module: '@review/feature', at: '/feature' }],
      },
      plugins: [prerenderRoutesPlugin()],
    },
    app,
  )
  const consumerGenerator = new Generator({ root: app, config })
  await consumerGenerator.run()
  expect(globalThis.TSS_PRERENDABLE_PATHS).toContainEqual({
    path: '/feature/about',
  })

  const routeFile = path.join(feature, 'src/routes/about.tsx')
  await fs.writeFile(
    routeFile,
    `import { createFileRoute } from '../routeScope.gen'
export const Route = createFileRoute('@review/feature:/about')({ server: { handlers: { GET: () => new Response('endpoint') } } })
`,
  )
  await providerGenerator.run({ type: 'update', path: routeFile })
  await consumerGenerator.run({
    type: 'update',
    path: path.join(feature, '.tanstack/route-module.json'),
  })
  const requested: Array<string> = []
  await prerender({
    startConfig: parseStartConfig(
      { prerender: { enabled: true, crawlLinks: false } },
      { framework: 'react' },
      app,
    ),
    handler: {
      getClientOutputDirectory: () => path.join(workspace!, 'updated-pages'),
      request: async (url) => {
        requested.push(url)
        return new Response('<html>updated</html>', {
          headers: { 'content-type': 'text/html' },
        })
      },
    },
  })
  expect(requested).not.toContain('/feature/about/')
  expect(requested).toContain('/feature/mixed/')
})

it('respects explicit page overrides, filters, basepath and disabled discovery for module pages', async () => {
  const { app } = await fixtures('react')
  await new Generator({
    root: app,
    config: getConfig(
      {
        disableLogging: true,
        routeModules: {
          includes: [{ module: '@review/feature', at: '/feature' }],
        },
        plugins: [prerenderRoutesPlugin()],
      },
      app,
    ),
  }).run()
  const requested: Array<string> = []
  const output = path.join(workspace!, 'controlled-pages')
  const run = async (autoStaticPathsDiscovery: boolean) => {
    requested.length = 0
    await prerender({
      startConfig: parseStartConfig(
        {
          router: { basepath: '/base' },
          prerender: {
            enabled: true,
            crawlLinks: false,
            autoStaticPathsDiscovery,
            filter: (page) => page.path !== '/feature/parent',
          },
          pages: [
            { path: '/feature/about/', prerender: { enabled: false } },
            { path: '/feature/mixed', prerender: { outputPath: '/selected' } },
          ],
        },
        { framework: 'react' },
        app,
      ),
      handler: {
        getClientOutputDirectory: () => output,
        request: async (url) => {
          requested.push(url)
          return new Response('<html>selected</html>', {
            headers: { 'content-type': 'text/html' },
          })
        },
      },
    })
  }
  await run(true)
  expect(requested).toContain('/base/feature/mixed/')
  expect(requested).not.toContain('/base/feature/about/')
  expect(requested).not.toContain('/base/feature/parent/')
  await expect(
    fs.readFile(path.join(output, 'selected/index.html'), 'utf8'),
  ).resolves.toContain('selected')
  await run(false)
  expect(requested).toEqual(['/base/feature/mixed/'])
})

it('discovers nested and named installations while excluding dynamic host URLs', async () => {
  const { app } = await fixtures('react')
  const wrapper = path.join(workspace!, 'wrapper')
  await fs.mkdir(path.join(wrapper, 'src/routes'), { recursive: true })
  await fs.symlink(
    path.join(app, 'node_modules'),
    path.join(wrapper, 'node_modules'),
    'dir',
  )
  await fs.symlink(
    wrapper,
    path.join(app, 'node_modules/@review/wrapper'),
    'dir',
  )
  const appPackagePath = path.join(app, 'package.json')
  const appPackage = JSON.parse(await fs.readFile(appPackagePath, 'utf8'))
  appPackage.dependencies['@review/wrapper'] = '*'
  await fs.writeFile(appPackagePath, JSON.stringify(appPackage))
  await fs.writeFile(
    path.join(wrapper, 'package.json'),
    JSON.stringify({
      name: '@review/wrapper',
      type: 'module',
      dependencies: {
        '@review/feature': '*',
        '@tanstack/react-router': '*',
        '@tanstack/react-start': '*',
      },
      exports: {
        './route-module': './src/routeModule.gen.ts',
        './package.json': './package.json',
      },
      tanstack: {
        router: {
          module: { includes: [{ module: '@review/feature', at: '/nested' }] },
        },
      },
    }),
  )
  await fs.writeFile(
    path.join(wrapper, 'src/routes/__root.tsx'),
    `import { createModuleRoot } from '../routeScope.gen'
export const Route = createModuleRoot()({})
`,
  )
  await new Generator({
    root: wrapper,
    config: getConfig({ disableLogging: true }, wrapper),
  }).run()
  await new Generator({
    root: app,
    config: getConfig(
      {
        disableLogging: true,
        plugins: [prerenderRoutesPlugin()],
        routeModules: {
          includes: [{ module: '@review/wrapper', at: '/outer' }],
        },
      },
      app,
    ),
  }).run()
  expect(globalThis.TSS_PRERENDABLE_PATHS).toContainEqual({
    path: '/outer/nested/about',
  })

  await fs.writeFile(
    path.join(app, 'src/routes/orgs.$orgId.tsx'),
    `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/orgs/$orgId')({ component: () => 'organization' })
`,
  )
  await new Generator({
    root: app,
    config: getConfig(
      {
        disableLogging: true,
        plugins: [prerenderRoutesPlugin()],
        routeModules: {
          includes: [
            { module: '@review/feature', at: '/first', as: 'first' },
            { module: '@review/feature', at: '/second', as: 'second' },
            {
              module: '@review/feature',
              parent: '/orgs/$orgId',
              at: '/third',
              as: 'third',
            },
          ],
        },
      },
      app,
    ),
  }).run()
  const requested: Array<string> = []
  await prerender({
    startConfig: parseStartConfig(
      { prerender: { enabled: true, crawlLinks: false } },
      { framework: 'react' },
      app,
    ),
    handler: {
      getClientOutputDirectory: () => path.join(workspace!, 'installations'),
      request: async (url) => {
        requested.push(url)
        return new Response('<html>installed</html>', {
          headers: { 'content-type': 'text/html' },
        })
      },
    },
  })
  expect(requested).toContain('/first/about/')
  expect(requested).toContain('/second/about/')
  expect(requested.some((url) => url.includes('$'))).toBe(false)
  expect(new Set(requested).size).toBe(requested.length)
})

it('can rebuild full and pruned trees repeatedly from the same generated provider', async () => {
  const { providerGenerator } = await fixtures('react')
  const crawl = await providerGenerator.getCrawlingResult()
  expect(crawl).toBeDefined()
  const original = providerGenerator.buildRouteTree(crawl!).routeTreeContent
  const client = () =>
    providerGenerator.buildRouteTree({
      ...crawl!,
      acc: { ...crawl!.acc, ...pruneServerOnlySubtrees(crawl!) },
      config: { disableTypes: true },
    }).routeTreeContent
  const first = client()
  expect(client()).toBe(first)
  expect(providerGenerator.buildRouteTree(crawl!).routeTreeContent).toBe(
    original,
  )
})
