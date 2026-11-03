// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { promises as fs, realpathSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { Generator, getConfig } from '@tanstack/router-generator'

// Builds a Start application that mounts a route module with this package's
// public Vite and Rsbuild plugins, then runs its server and client output.

const framework = 'react'
const routerPackage = '@tanstack/react-router'
const startPackage = '@tanstack/react-start'
const frameworkPackage = 'react'
const frameworkPlugins = ['@vitejs/plugin-react']
const pluginOptions = ''
const packageRoot = fileURLToPath(new URL('..', import.meta.url))
let workspace: string | undefined
afterEach(async () => {
  if (workspace) {
    await fs.rm(workspace, { recursive: true, force: true })
  }
})

/** A dependency as this package installed it. */
function installed(name: string) {
  return realpathSync(path.join(packageRoot, 'node_modules', name))
}

async function link(root: string, name: string, target: string) {
  const destination = path.join(root, 'node_modules', name)
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.symlink(target, destination, 'dir')
}

async function fixtures() {
  workspace = realpathSync(
    await fs.mkdtemp(path.join(os.tmpdir(), 'start-module-build-')),
  )
  const feature = path.join(workspace, 'feature')
  const app = path.join(workspace, 'app')
  for (const root of [feature, app]) {
    await fs.mkdir(path.join(root, 'src/routes'), { recursive: true })
    await link(root, routerPackage, installed(routerPackage))
    await link(root, startPackage, packageRoot)
    await link(root, frameworkPackage, installed(frameworkPackage))
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
  await link(app, '@review/feature', feature)
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
  await new Generator({ root: feature, config: moduleConfig }).run()
  return { app }
}

it.each(['vite', 'rsbuild'] as const)(
  '%s prunes application and module endpoints from the client',
  async (bundler) => {
    const { app } = await fixtures()
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
      for (const tool of ['vite', ...frameworkPlugins]) {
        await link(app, tool, installed(tool))
      }
      await fs.writeFile(
        buildScript,
        `import { createBuilder } from 'vite'
import { tanstackStart } from '${startPackage}/plugin/vite'
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
    ${frameworkPlugins.map((_, index) => `frameworkPlugin${index}(${pluginOptions})`).join(',\n    ')},
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
      await link(app, '@rsbuild/core', installed('@rsbuild/core'))
      await fs.writeFile(
        buildScript,
        `import { createRsbuild } from '@rsbuild/core'
import { tanstackStart } from '${startPackage}/plugin/rsbuild'

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
    const jsdom = createRequire(path.join(packageRoot, 'package.json')).resolve(
      'jsdom',
    )
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
