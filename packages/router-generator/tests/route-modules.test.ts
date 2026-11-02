import fs from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createJiti } from 'jiti'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Generator, getConfig, readRouteModuleManifest } from '../src'

let workspace: string

beforeEach(async () => {
  workspace = realpathSync(
    await fs.mkdtemp(path.join(os.tmpdir(), 'tsr-generator-modules-')),
  )
})

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true })
})

interface PackageSpec {
  name: string
  packageJson?: Record<string, unknown>
  files: Record<string, string>
  dependencies?: Array<string>
}

/** Writes a package into the workspace; dependencies are linked siblings. */
async function writePackage(spec: PackageSpec) {
  const root = path.join(workspace, spec.name.replace('@fixture/', ''))
  await fs.mkdir(root, { recursive: true })
  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify(
      {
        name: spec.name,
        dependencies: Object.fromEntries(
          (spec.dependencies ?? []).map((dependency) => [dependency, '*']),
        ),
        ...spec.packageJson,
      },
      null,
      2,
    ),
  )
  for (const [file, content] of Object.entries(spec.files)) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await fs.writeFile(path.join(root, file), content)
  }
  for (const dependency of spec.dependencies ?? []) {
    const link = path.join(root, 'node_modules', dependency)
    await fs.mkdir(path.dirname(link), { recursive: true })
    await fs.symlink(
      path.join(workspace, dependency.replace('@fixture/', '')),
      link,
      'dir',
    )
  }
  return root
}

async function generate(root: string, inline: Record<string, unknown> = {}) {
  const config = getConfig(
    {
      disableLogging: true,
      tmpDir: path.join(workspace, '.tmp'),
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
      ...inline,
    },
    root,
  )
  await new Generator({ config, root }).run()
}

const read = (root: string, file: string) =>
  readFileSync(path.join(root, file), 'utf8')

/** Generated files are formatted: compare their content on one line. */
const compact = (source: string) => source.replace(/\s+/g, ' ')

function readNamespace(root: string, namespace: string) {
  const entry = [
    ...read(root, 'src/routeScope.gen.ts').matchAll(
      /export \* as (\w+) from '([^']+)'/g,
    ),
  ].find((match) => match[1] === namespace)
  if (!entry) {
    throw new Error(`Generated namespace ${namespace} was not exported`)
  }
  return read(root, path.join('src', `${entry[2]}.ts`))
}

async function linkRouter(root: string) {
  const target = fileURLToPath(new URL('../../react-router', import.meta.url))
  const link = path.join(root, 'node_modules/@tanstack/react-router')
  await fs.mkdir(path.dirname(link), { recursive: true })
  await fs.symlink(target, link, 'dir')
}

async function checkConsumerTypes(
  root: string,
  files: Array<string>,
  compilerOptions: Record<string, unknown> = {},
) {
  await fs.writeFile(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        strict: true,
        skipLibCheck: false,
        noEmit: true,
        types: [],
        ...compilerOptions,
      },
      files,
    }),
  )
  const compiler = fileURLToPath(
    new URL('../../../node_modules/typescript59/lib/tsc.js', import.meta.url),
  )
  const result = spawnSync(
    process.execPath,
    [compiler, '--pretty', 'false', '-p', root],
    {
      encoding: 'utf8',
      stdio: 'pipe',
    },
  )
  if (result.error) {
    throw result.error
  }
  const diagnostics = `${result.stdout ?? ''}${result.stderr ?? ''}`
  return result.status === 0
    ? diagnostics
    : diagnostics || `TypeScript exited with status ${result.status}`
}

const moduleRoot = `import { Outlet } from '@tanstack/react-router'
import { createModuleRoot } from '../routeScope.gen'

export const Route = createModuleRoot()({ component: () => <Outlet /> })
`

const route = (
  id: string,
) => `import { createFileRoute } from '../routeScope.gen'

export const Route = createFileRoute('${id}')({})
`

describe('installed route-module composition contracts', () => {
  const appRoot = `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`

  it('preserves adjacent TypeScript declaration outputs when regenerating namespaces', async () => {
    const catalog = await writePackage(
      catalogPackage({
        packageJson: {
          tanstack: { router: { module: true } },
          exports: {
            './route-module': './src/routeModule.gen.ts',
            './route-types': './src/routeContract.gen.ts',
          },
        },
        files: {
          'src/routes/__root.tsx': `import { createModuleRoot } from '../routeScope.gen'
export const Route = createModuleRoot()({})`,
          'src/routes/profile.tsx': route('@fixture/catalog:/profile'),
        },
      }),
    )
    await linkRouter(catalog)
    await generate(catalog)
    const shop = await writePackage({
      name: '@fixture/shop',
      dependencies: ['@fixture/catalog'],
      packageJson: {
        tanstack: { router: { module: { uses: ['@fixture/catalog'] } } },
      },
      files: {
        'src/routes/__root.tsx': `import { createModuleRoot } from '../routeScope.gen'
export const Route = createModuleRoot()({})`,
      },
    })
    await linkRouter(shop)
    const config = { routeFileIgnorePattern: '\\.d\\.ts$' }
    await generate(shop, config)
    expect(
      await checkConsumerTypes(shop, ['src/routeScope.gen.ts'], {
        noEmit: false,
        declaration: true,
        emitDeclarationOnly: true,
      }),
    ).toBe('')
    const namespaceFiles = [
      ...read(shop, 'src/routeScope.gen.ts').matchAll(
        /export \* as \w+ from '([^']+)'/g,
      ),
    ].map((match) => path.join('src', `${match[1]}.d.ts`))
    expect(namespaceFiles).toHaveLength(1)
    const declarations = ['src/routeScope.gen.d.ts', ...namespaceFiles].map(
      (file) => ({ file, content: read(shop, file) }),
    )
    await generate(shop, config)
    for (const declaration of declarations) {
      expect(read(shop, declaration.file)).toBe(declaration.content)
    }
  }, 30_000)

  it('uses an explicit installation name for the first installation', async () => {
    const catalog = await writePackage(catalogPackage())
    await generate(catalog)
    const app = await writePackage({
      name: '@fixture/app',
      dependencies: ['@fixture/catalog'],
      files: { 'src/routes/__root.tsx': appRoot },
    })
    const generator = new Generator({
      root: app,
      config: getConfig(
        {
          disableLogging: true,
          tmpDir: path.join(workspace, '.tmp'),
          routeModules: {
            includes: [
              {
                module: '@fixture/catalog',
                as: 'catalogFeature',
                at: '/catalog',
              },
            ],
          },
        },
        app,
      ),
    })
    await generator.run()
    expect(
      generator.getMountedRouteModuleRoutes().map((node) => node.id),
    ).toContain('@fixture/catalog#catalogFeature:/$itemId')
  })

  it.each(['catalog', '/catalog'])(
    'checks collisions for the mount spelling %s',
    async (at) => {
      const catalog = await writePackage(catalogPackage())
      await generate(catalog)
      const app = await writePackage({
        name: '@fixture/app',
        dependencies: ['@fixture/catalog'],
        files: {
          'src/routes/__root.tsx': appRoot,
          'src/routes/catalog.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/catalog')({})
`,
        },
      })
      await expect(
        generate(app, {
          routeModules: { includes: [{ module: '@fixture/catalog', at }] },
        }),
      ).rejects.toThrow(/full path.*used by both/i)
    },
  )

  it.each(['catalog//sale', '/catalog//sale/'])(
    'checks collisions after normalizing interior slashes in %s',
    async (at) => {
      const catalog = await writePackage(catalogPackage())
      await generate(catalog)
      const app = await writePackage({
        name: '@fixture/app',
        dependencies: ['@fixture/catalog'],
        files: {
          'src/routes/__root.tsx': appRoot,
          'src/routes/catalog.sale.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/catalog/sale')({})`,
        },
      })
      await expect(
        generate(app, {
          routeModules: { includes: [{ module: '@fixture/catalog', at }] },
        }),
      ).rejects.toThrow(/full path.*used by both/i)
    },
  )

  it('rejects host and module path parameter overlap', async () => {
    const catalog = await writePackage(catalogPackage())
    await generate(catalog)
    const app = await writePackage({
      name: '@fixture/app',
      dependencies: ['@fixture/catalog'],
      files: {
        'src/routes/__root.tsx': appRoot,
        'src/routes/orgs.$itemId.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/orgs/$itemId')({})`,
      },
    })
    await expect(
      generate(app, {
        routeModules: {
          includes: [
            {
              module: '@fixture/catalog',
              parent: '/orgs/$itemId',
              at: '/catalog',
            },
          ],
        },
      }),
    ).rejects.toThrow(/parameter.*itemId|itemId.*parameter/i)
  })

  it.each(['$', '{$}[.]txt'])(
    'rejects a module wildcard %s that overwrites a host _splat parameter',
    async (file) => {
      const catalog = await writePackage(
        catalogPackage({
          files: {
            'src/routes/__root.tsx': moduleRoot,
            [`src/routes/${file}.tsx`]: '',
          },
        }),
      )
      await generate(catalog)
      const app = await writePackage({
        name: '@fixture/app',
        dependencies: ['@fixture/catalog'],
        files: {
          'src/routes/__root.tsx': appRoot,
          'src/routes/orgs.$_splat.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/orgs/$_splat')({})`,
        },
      })
      await expect(
        generate(app, {
          routeModules: {
            includes: [
              {
                module: '@fixture/catalog',
                parent: '/orgs/$_splat',
                at: '/catalog',
              },
            ],
          },
        }),
      ).rejects.toThrow(/parameter.*_splat|_splat.*parameter/i)
    },
  )

  it('preserves named nested installation contracts and hosted namespace guards', async () => {
    const exports = {
      './route-module': './src/routeModule.gen.ts',
      './route-types': './src/routeContract.gen.ts',
    }
    const catalog = await writePackage(
      catalogPackage({
        packageJson: { tanstack: { router: { module: true } }, exports },
        files: {
          'src/routes/__root.tsx': `import { createModuleRoot } from '../routeScope.gen'
export const Route = createModuleRoot()({})`,
          'src/routes/profile.tsx': route('@fixture/catalog:/profile'),
        },
      }),
    )
    await linkRouter(catalog)
    await generate(catalog)
    const shop = await writePackage({
      name: '@fixture/shop',
      dependencies: ['@fixture/catalog'],
      packageJson: {
        exports,
        tanstack: {
          router: {
            module: {
              includes: [
                {
                  module: '@fixture/catalog',
                  as: 'ownedCatalog',
                  parent: '/teams/$teamId',
                  at: '/catalog',
                },
              ],
            },
          },
        },
      },
      files: {
        'src/routes/__root.tsx': `import { createModuleRoot } from '../routeScope.gen'
export const Route = createModuleRoot()({})`,
        'src/routes/teams.$teamId.tsx': route('@fixture/shop:/teams/$teamId'),
      },
    })
    await linkRouter(shop)
    await generate(shop)
    const manifest = readRouteModuleManifest(shop)!
    expect(manifest.modules).toContainEqual(
      expect.objectContaining({
        id: '@fixture/catalog',
        key: '@fixture/catalog#ownedCatalog',
      }),
    )
    expect(manifest.routes).toContainEqual(
      expect.objectContaining({
        id: '@fixture/catalog#ownedCatalog:/profile',
        parent: '@fixture/catalog#ownedCatalog:',
        fullPath: '/teams/$teamId/catalog/profile',
      }),
    )
    const app = await writePackage({
      name: '@fixture/app',
      dependencies: ['@fixture/shop'],
      files: {
        'src/routes/__root.tsx': appRoot,
        'src/routes/orgs.$orgId.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/orgs/$orgId')({})`,
        'src/consumer.ts': `import type { InstalledRoutesById, InstalledHostParams } from '@fixture/shop/route-types'
import { catalog } from './routeScope.gen'
const id: InstalledRoutesById['@fixture/catalog#ownedCatalog:/profile']['id'] = '@fixture/catalog#ownedCatalog:/profile'
const host: InstalledHostParams['@fixture/catalog#ownedCatalog'] = { teamId: 'team' }
catalog.linkOptions({ to: '/profile', params: { orgId: 'org', teamId: host.teamId } })
export { id }
`,
      },
    })
    await linkRouter(app)
    await generate(app, {
      routeModules: {
        includes: [
          {
            module: '@fixture/shop',
            as: 'namedShop',
            parent: '/orgs/$orgId',
            at: '/shop',
          },
        ],
      },
    })
    expect(await checkConsumerTypes(app, ['src/consumer.ts'])).toBe('')
    const jiti = createJiti(import.meta.url, {
      moduleCache: false,
      fsCache: false,
    })
    const scope = await jiti.import<{
      catalog: {
        isScopedMatch: (match: {
          routeId: string
          localRouteId?: string
        }) => boolean
      }
      namedShop: {
        isScopedMatch: (match: {
          routeId: string
          localRouteId?: string
        }) => boolean
      }
    }>(path.join(app, 'src/routeScope.gen.ts'))
    const match = {
      routeId: '@fixture/catalog#ownedCatalog:/profile',
      localRouteId: '@fixture/catalog:/profile',
    }
    expect(scope.catalog.isScopedMatch(match)).toBe(true)
    expect(scope.namedShop.isScopedMatch(match)).toBe(true)
    expect(
      scope.catalog.isScopedMatch({
        ...match,
        routeId: '@fixture/catalog#other:/profile',
      }),
    ).toBe(false)
    // Membership follows module root ids, not the routes known at generation:
    // a route the module adds later passes, an installation whose name merely
    // starts with the same characters does not, and neither does an
    // application route.
    expect(
      scope.namedShop.isScopedMatch({
        routeId: '@fixture/catalog#ownedCatalog:/added',
        localRouteId: '@fixture/catalog:/added',
      }),
    ).toBe(true)
    expect(
      scope.catalog.isScopedMatch({
        ...match,
        routeId: '@fixture/catalog#ownedCatalogs:/profile',
      }),
    ).toBe(false)
    expect(scope.namedShop.isScopedMatch({ routeId: '/orgs/$orgId' })).toBe(
      false,
    )
    // The provider's own scope combines both checks: its routes pass in any
    // installation through `localRouteId`, the installation it names passes
    // through `routeId`.
    const shopScope = await jiti.import<{
      isScopedMatch: (match: {
        routeId: string
        localRouteId?: string
      }) => boolean
    }>(path.join(shop, 'src/routeScope.gen.ts'))
    expect(
      shopScope.isScopedMatch({
        routeId: '@fixture/shop#namedShop:/teams/$teamId',
        localRouteId: '@fixture/shop:/teams/$teamId',
      }),
    ).toBe(true)
    expect(shopScope.isScopedMatch(match)).toBe(true)
    expect(
      shopScope.isScopedMatch({
        ...match,
        routeId: '@fixture/catalog#ownedCatalogs:/profile',
      }),
    ).toBe(false)
  }, 30_000)

  it('keeps case-only namespace aliases independently addressable on portable filenames', async () => {
    const catalog = await writePackage(catalogPackage())
    await generate(catalog)
    const app = await writePackage({
      name: '@fixture/app',
      dependencies: ['@fixture/catalog'],
      files: { 'src/routes/__root.tsx': appRoot },
    })
    await linkRouter(app)
    await generate(app, {
      routeModules: {
        includes: [
          { module: '@fixture/catalog', as: 'catalog', at: '/first' },
          { module: '@fixture/catalog', as: 'Catalog', at: '/second' },
        ],
      },
    })
    const namespaceFiles = [
      ...read(app, 'src/routeScope.gen.ts').matchAll(
        /export \* as \w+ from '([^']+)'/g,
      ),
    ].map((match) => match[1]!)
    expect(namespaceFiles).toHaveLength(2)
    expect(new Set(namespaceFiles.map((file) => file.toLowerCase())).size).toBe(
      2,
    )
    const jiti = createJiti(import.meta.url, {
      moduleCache: false,
      fsCache: false,
    })
    const scope = await jiti.import<{
      catalog: { linkOptions: (options: { to: string }) => { _module: string } }
      Catalog: { linkOptions: (options: { to: string }) => { _module: string } }
    }>(path.join(app, 'src/routeScope.gen.ts'))
    expect(scope.catalog.linkOptions({ to: '/' })._module).toBe(
      '@fixture/catalog#catalog',
    )
    expect(scope.Catalog.linkOptions({ to: '/' })._module).toBe(
      '@fixture/catalog#Catalog',
    )
  })

  it('loads ordinary routes whose derived private names collide', async () => {
    const app = await writePackage({
      name: '@fixture/app',
      files: {
        'src/routes/__root.tsx': appRoot,
        'src/routes/foo-bar.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/foo-bar')({})`,
        'src/routes/fooBar.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/fooBar')({})`,
      },
    })
    await linkRouter(app)
    await generate(app)
    const jiti = createJiti(import.meta.url, {
      moduleCache: false,
      fsCache: false,
    })
    await expect(
      jiti.import(path.join(app, 'src/routeTree.gen.ts')),
    ).resolves.toHaveProperty('routeTree')
    const source = read(app, 'src/routeTree.gen.ts')
    await generate(app)
    expect(read(app, 'src/routeTree.gen.ts')).toBe(source)
  })

  it('loads packages whose private identifiers normalize to the same name', async () => {
    for (const name of ['foo-bar', 'foo_bar']) {
      const root = await writePackage({
        name: `@fixture/${name}`,
        packageJson: {
          tanstack: { router: { module: true } },
          exports: { './route-module': './src/routeModule.gen.ts' },
        },
        files: {
          'src/routes/__root.tsx': `import { createModuleRoot } from '../routeScope.gen'
export const Route = createModuleRoot()({})`,
          'src/routes/index.tsx': route(`@fixture/${name}:/`),
        },
      })
      await linkRouter(root)
      await generate(root)
    }
    const app = await writePackage({
      name: '@fixture/app',
      dependencies: ['@fixture/foo-bar', '@fixture/foo_bar'],
      files: { 'src/routes/__root.tsx': appRoot },
    })
    await linkRouter(app)
    await generate(app, {
      routeModules: {
        includes: [
          { module: '@fixture/foo-bar', as: 'first', at: '/first' },
          { module: '@fixture/foo_bar', as: 'second', at: '/second' },
        ],
      },
    })
    const jiti = createJiti(import.meta.url, {
      moduleCache: false,
      fsCache: false,
    })
    await expect(
      jiti.import(path.join(app, 'src/routeTree.gen.ts')),
    ).resolves.toHaveProperty('routeTree')
  })

  it('resolves cached provider route files after moving the workspace', async () => {
    const catalog = await writePackage(catalogPackage())
    await generate(catalog)
    await writePackage({
      name: '@fixture/app',
      dependencies: ['@fixture/catalog'],
      files: { 'src/routes/__root.tsx': appRoot },
    })
    const moved = `${workspace}-relocated`
    await fs.rename(workspace, moved)
    workspace = moved
    const app = path.join(workspace, 'app')
    const movedCatalog = path.join(workspace, 'catalog')
    const dependency = path.join(app, 'node_modules/@fixture/catalog')
    await fs.unlink(dependency)
    await fs.symlink(movedCatalog, dependency, 'dir')
    const generator = new Generator({
      root: app,
      config: getConfig(
        {
          disableLogging: true,
          tmpDir: path.join(workspace, '.tmp'),
          routeModules: {
            includes: [{ module: '@fixture/catalog', at: '/catalog' }],
          },
        },
        app,
      ),
    })
    await generator.run()
    expect(
      generator
        .getRoutesByFileMap()
        .get(path.join(movedCatalog, 'src/routes/$itemId.tsx')),
    ).toEqual({ routeId: '@fixture/catalog:/$itemId' })
  })

  it('refreshes consumer topology when provider source and generated tree paths change', async () => {
    const catalog = await writePackage(
      catalogPackage({
        files: {
          'src/routes/__root.tsx': moduleRoot,
          'src/routes/profile.tsx': route('@fixture/catalog:/profile'),
        },
      }),
    )
    await generate(catalog)
    const app = await writePackage({
      name: '@fixture/app',
      dependencies: ['@fixture/catalog'],
      files: { 'src/routes/__root.tsx': appRoot },
    })
    const changes: Array<ReturnType<Generator['getRouteModuleClientTrees']>> =
      []
    const generator = new Generator({
      root: app,
      config: getConfig(
        {
          disableLogging: true,
          tmpDir: path.join(workspace, '.tmp'),
          routeModules: {
            includes: [{ module: '@fixture/catalog', at: '/catalog' }],
          },
          plugins: [
            {
              name: 'observe-provider-paths',
              onRouteTreeChanged() {
                changes.push(generator.getRouteModuleClientTrees())
              },
            },
          ],
        },
        app,
      ),
    })
    await generator.run()
    const originalRoutes = readRouteModuleManifest(catalog)!.routes
    await fs.mkdir(path.join(catalog, 'src/routes/profile'))
    await fs.rename(
      path.join(catalog, 'src/routes/profile.tsx'),
      path.join(catalog, 'src/routes/profile/route.tsx'),
    )
    await generate(catalog)
    expect(readRouteModuleManifest(catalog)!.routes).toEqual(originalRoutes)
    await generator.run({
      type: 'update',
      path: path.join(catalog, '.tanstack/route-module.json'),
    })
    expect(changes).toHaveLength(2)
    expect(generator.getMountedRouteModuleRoutes()).toContainEqual(
      expect.objectContaining({
        id: '@fixture/catalog:/profile',
        filePath: path.join(catalog, 'src/routes/profile/route.tsx'),
      }),
    )
    expect(
      generator
        .getRoutesByFileMap()
        .get(path.join(catalog, 'src/routes/profile/route.tsx')),
    ).toEqual({
      routeId: '@fixture/catalog:/profile',
    })
    await generate(catalog, { generatedRouteTree: './src/movedTree.gen.ts' })
    expect(readRouteModuleManifest(catalog)!.routes).toEqual(originalRoutes)
    await generator.run({
      type: 'update',
      path: path.join(catalog, '.tanstack/route-module.json'),
    })
    expect(changes).toHaveLength(3)
    expect(changes[2]).toContainEqual({
      filePath: path.join(catalog, 'src/movedTree.gen.ts'),
      clientFilePath: path.join(catalog, 'src/movedTree.gen.client.ts'),
    })
  })

  it('accepts routes a used provider gains before and after its namespace is regenerated', async () => {
    const runtimeModuleRoot = `import { createModuleRoot } from '../routeScope.gen'
export const Route = createModuleRoot()({})
`
    const exports = {
      './route-module': './src/routeModule.gen.ts',
      './route-types': './src/routeContract.gen.ts',
      './scope': './src/routeScope.gen.ts',
    }
    const catalog = await writePackage(
      catalogPackage({
        packageJson: { tanstack: { router: { module: true } }, exports },
        files: {
          'src/routes/__root.tsx': runtimeModuleRoot,
          'src/routes/profile.tsx': route('@fixture/catalog:/profile'),
        },
      }),
    )
    await linkRouter(catalog)
    await generate(catalog)
    const shop = await writePackage({
      name: '@fixture/shop',
      dependencies: ['@fixture/catalog'],
      packageJson: {
        exports,
        tanstack: { router: { module: { uses: ['@fixture/catalog'] } } },
      },
      files: { 'src/routes/__root.tsx': runtimeModuleRoot },
    })
    await linkRouter(shop)
    const consumerGenerator = new Generator({
      root: shop,
      config: getConfig(
        { disableLogging: true, tmpDir: path.join(workspace, '.tmp') },
        shop,
      ),
    })
    await consumerGenerator.run()
    const app = await writePackage({
      name: '@fixture/app',
      dependencies: ['@fixture/catalog', '@fixture/shop'],
      files: {
        'src/routes/__root.tsx': appRoot,
        'src/consumer.ts': `import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { catalog } from '@fixture/shop/scope'
export function matchCatalog(pathname: string) {
  const history = createMemoryHistory({ initialEntries: [pathname] })
  const router = createRouter({ routeTree, history, isServer: true })
  try {
    const match = router.matchRoutes(pathname).at(-1)!
    return { routeId: match.routeId, accepted: catalog.isScopedMatch(match) }
  } finally {
    history.destroy()
  }
}
`,
      },
    })
    await linkRouter(app)
    const appOptions = {
      routeModules: {
        includes: [
          { module: '@fixture/catalog', at: '/catalog' },
          { module: '@fixture/shop', at: '/shop' },
        ],
      },
    }
    const loadConsumer = () =>
      createJiti(import.meta.url, {
        moduleCache: false,
        fsCache: false,
      }).import<{
        matchCatalog: (pathname: string) => {
          routeId: string
          accepted: boolean
        }
      }>(path.join(app, 'src/consumer.ts'))
    await generate(app, appOptions)
    expect((await loadConsumer()).matchCatalog('/catalog/profile')).toEqual({
      routeId: '@fixture/catalog:/profile',
      accepted: true,
    })

    await fs.writeFile(
      path.join(catalog, 'src/routes/settings.tsx'),
      route('@fixture/catalog:/settings'),
    )
    await generate(catalog)
    // The guard tests module ids, so the shop scope generated before the route
    // existed accepts it as soon as the application tree contains it.
    await generate(app, appOptions)
    expect((await loadConsumer()).matchCatalog('/catalog/settings')).toEqual({
      routeId: '@fixture/catalog:/settings',
      accepted: true,
    })
    await consumerGenerator.run({
      type: 'update',
      path: path.join(catalog, '.tanstack/route-module.json'),
    })
    await generate(app, appOptions)
    expect((await loadConsumer()).matchCatalog('/catalog/settings')).toEqual({
      routeId: '@fixture/catalog:/settings',
      accepted: true,
    })
  })
})

function catalogPackage(extra: Partial<PackageSpec> = {}): PackageSpec {
  return {
    name: '@fixture/catalog',
    packageJson: {
      tanstack: { router: { module: true } },
    },
    files: {
      'src/routes/__root.tsx': moduleRoot,
      'src/routes/index.tsx': route('@fixture/catalog:/'),
      'src/routes/$itemId.tsx': route('@fixture/catalog:/$itemId'),
      'src/routes/_layout.tsx': route('@fixture/catalog:/_layout'),
      'src/routes/_layout/sale.tsx': route(
        '@fixture/catalog:/_layout/sale',
      ).replace('../routeScope.gen', '../../routeScope.gen'),
    },
    ...extra,
  }
}

describe('route module generation', () => {
  it('generates qualified ids, a local FileRoutesByPath and the module files', async () => {
    const pkg = await writePackage(catalogPackage())
    await generate(pkg)

    const routeTree = read(pkg, 'src/routeTree.gen.ts')
    expect(routeTree).not.toContain('@ts-nocheck')
    expect(routeTree).not.toContain('declare module')
    expect(routeTree).not.toContain('preLoaderRoute')
    await expect(routeTree).toMatchFileSnapshot(
      'route-modules/module/routeTree.snapshot.ts',
    )
    await expect(read(pkg, 'src/routeScope.gen.ts')).toMatchFileSnapshot(
      'route-modules/module/routeScope.snapshot.ts',
    )
    await expect(read(pkg, 'src/routeContract.gen.ts')).toMatchFileSnapshot(
      'route-modules/module/routeContract.snapshot.ts',
    )
    await expect(read(pkg, 'src/routeModule.gen.ts')).toMatchFileSnapshot(
      'route-modules/module/routeModule.snapshot.ts',
    )

    // The module's own guard accepts its routes in any installation, including
    // routes added after generation, and rejects other modules' routes and
    // application routes.
    await linkRouter(pkg)
    const jiti = createJiti(import.meta.url, {
      moduleCache: false,
      fsCache: false,
    })
    const scope = await jiti.import<{
      isScopedMatch: (match: {
        routeId: string
        localRouteId?: string
      }) => boolean
    }>(path.join(pkg, 'src/routeScope.gen.ts'))
    expect(
      scope.isScopedMatch({
        routeId: '@fixture/catalog#eu:/added',
        localRouteId: '@fixture/catalog:/added',
      }),
    ).toBe(true)
    expect(
      scope.isScopedMatch({
        routeId: '@fixture/catalog-extra:/',
        localRouteId: '@fixture/catalog-extra:/',
      }),
    ).toBe(false)
    expect(scope.isScopedMatch({ routeId: '/about' })).toBe(false)
    expect(scope.isScopedMatch({ routeId: '__root__' })).toBe(false)

    const manifest = readRouteModuleManifest(pkg)!
    expect(manifest.id).toBe('@fixture/catalog')
    const root = '@fixture/catalog:'
    expect(manifest.routes).toEqual([
      { id: root, parent: null, fullPath: '/', leaf: false },
      { id: `${root}/`, parent: root, fullPath: '/', leaf: true },
      { id: `${root}/$itemId`, parent: root, fullPath: '/$itemId', leaf: true },
      { id: `${root}/_layout`, parent: root, fullPath: '/', leaf: false },
      {
        id: `${root}/_layout/sale`,
        parent: `${root}/_layout`,
        fullPath: '/sale',
        leaf: true,
      },
    ])
    expect(manifest.routeFiles).toContainEqual({
      owner: [],
      file: 'src/routes/$itemId.tsx',
      routeId: '@fixture/catalog:/$itemId',
    })
    expect(manifest.routeFiles).toContainEqual({
      owner: [],
      file: 'src/routes/__root.tsx',
      routeId: '@fixture/catalog:',
    })
  })

  it('rewrites route ids and route factory imports to the module scope', async () => {
    const root = await writePackage(
      catalogPackage({
        files: {
          'src/routes/__root.tsx': moduleRoot,
          'src/routes/index.tsx': `import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({})
export const A = Link
`,
          'src/routes/empty.tsx': '',
        },
      }),
    )
    await generate(root)

    expect(read(root, 'src/routes/index.tsx'))
      .toBe(`import { createFileRoute } from '../routeScope.gen'
import { Link } from '@tanstack/react-router'

export const Route = createFileRoute('@fixture/catalog:/')({})
export const A = Link
`)
    const scaffolded = read(root, 'src/routes/empty.tsx')
    expect(scaffolded).toContain(
      "import { createFileRoute } from '../routeScope.gen'",
    )
    expect(scaffolded).toContain("createFileRoute('@fixture/catalog:/empty')")
  })

  it('repairs a route factory import from a stale scope path', async () => {
    const root = await writePackage(
      catalogPackage({
        files: {
          'src/routes/__root.tsx': moduleRoot,
          // moved one directory down without updating the import
          'src/routes/nested/moved.tsx': route(
            '@fixture/catalog:/nested/moved',
          ),
        },
      }),
    )
    await generate(root)
    await generate(root)
    expect(read(root, 'src/routes/nested/moved.tsx')).toBe(
      `import { createFileRoute } from '../../routeScope.gen'

export const Route = createFileRoute('@fixture/catalog:/nested/moved')({})
`,
    )
  })

  it('scaffolds a module root', async () => {
    const root = await writePackage(
      catalogPackage({ files: { 'src/routes/__root.tsx': '' } }),
    )
    await generate(root)
    const scaffolded = read(root, 'src/routes/__root.tsx')
    expect(scaffolded).toContain(
      "import { createModuleRoot } from '../routeScope.gen'",
    )
    expect(scaffolded).toContain('export const Route = createModuleRoot()(')
  })

  it('rejects lazy route files', async () => {
    const root = await writePackage(
      catalogPackage({
        files: {
          'src/routes/__root.tsx': moduleRoot,
          'src/routes/about.lazy.tsx': '',
        },
      }),
    )
    await expect(generate(root)).rejects.toThrow(/lazy route files/)
  })

  it('rejects disableTypes', async () => {
    const root = await writePackage(catalogPackage())
    await expect(generate(root, { disableTypes: true })).rejects.toThrow(
      /require TypeScript/,
    )
  })

  it('rejects an invalid declaration', async () => {
    const root = await writePackage(
      catalogPackage({
        packageJson: {
          tanstack: { router: { module: { includes: [{ at: '/x' }] } } },
        },
      }),
    )
    await expect(generate(root)).rejects.toThrow(
      /Invalid "tanstack.router.module"/,
    )
  })
})

describe('mounting route modules', () => {
  async function writeCatalog() {
    const catalog = await writePackage(catalogPackage())
    await generate(catalog)
    return catalog
  }

  it('mounts included modules and composes their routes by id', async () => {
    await writeCatalog()
    const shop = await writePackage({
      name: '@fixture/shop',
      packageJson: {
        tanstack: {
          router: {
            module: {
              includes: [
                { module: '@fixture/catalog', parent: '/_layout', at: '/c' },
              ],
            },
          },
        },
      },
      dependencies: ['@fixture/catalog'],
      files: {
        'src/routes/__root.tsx': moduleRoot,
        'src/routes/index.tsx': route('@fixture/shop:/'),
        'src/routes/_layout.tsx': route('@fixture/shop:/_layout'),
      },
    })
    await generate(shop)

    await expect(read(shop, 'src/routeTree.gen.ts')).toMatchFileSnapshot(
      'route-modules/includer/routeTree.snapshot.ts',
    )
    await expect(read(shop, 'src/routeScope.gen.ts')).toMatchFileSnapshot(
      'route-modules/includer/routeScope.snapshot.ts',
    )
    await expect(readNamespace(shop, 'catalog')).toMatchFileSnapshot(
      'route-modules/includer/routeScope.catalog.snapshot.ts',
    )
    await expect(read(shop, 'src/routeContract.gen.ts')).toMatchFileSnapshot(
      'route-modules/includer/routeContract.snapshot.ts',
    )

    const manifest = readRouteModuleManifest(shop)!
    const catalogRoot = '@fixture/catalog:'
    expect(
      manifest.routes.filter((r) => r.id.startsWith('@fixture/catalog')),
    ).toEqual([
      {
        id: catalogRoot,
        parent: '@fixture/shop:/_layout',
        fullPath: '/c/',
        leaf: false,
      },
      {
        id: `${catalogRoot}/`,
        parent: catalogRoot,
        fullPath: '/c/',
        leaf: true,
      },
      {
        id: `${catalogRoot}/$itemId`,
        parent: catalogRoot,
        fullPath: '/c/$itemId',
        leaf: true,
      },
      {
        id: `${catalogRoot}/_layout`,
        parent: catalogRoot,
        fullPath: '/c/',
        leaf: false,
      },
      {
        id: `${catalogRoot}/_layout/sale`,
        parent: `${catalogRoot}/_layout`,
        fullPath: '/c/sale',
        leaf: true,
      },
    ])
    expect(manifest.modules).toEqual([
      {
        id: '@fixture/shop',
        key: '@fixture/shop',
        uses: [],
        mountPath: '/',
        includedBy: null,
      },
      {
        id: '@fixture/catalog',
        key: '@fixture/catalog',
        uses: [],
        mountPath: '/c/',
        includedBy: '@fixture/shop',
      },
    ])
  })

  it('mounts modules into an application and keeps its own routes plain', async () => {
    await writeCatalog()
    const app = await writePackage({
      name: '@fixture/app',
      dependencies: ['@fixture/catalog'],
      files: {
        'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute()
`,
        'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({})
`,
      },
    })
    await generate(app, {
      routeModules: {
        includes: [{ module: '@fixture/catalog', at: '/catalog' }],
      },
    })

    const routeTree = read(app, 'src/routeTree.gen.ts')
    expect(routeTree).toContain("declare module '@tanstack/react-router'")
    await expect(routeTree).toMatchFileSnapshot(
      'route-modules/application/routeTree.snapshot.ts',
    )
    await expect(read(app, 'src/routeScope.gen.ts')).toMatchFileSnapshot(
      'route-modules/application/routeScope.snapshot.ts',
    )
    await expect(readNamespace(app, 'catalog')).toMatchFileSnapshot(
      'route-modules/application/routeScope.catalog.snapshot.ts',
    )
    expect(existsSync(path.join(app, 'src/routeContract.gen.ts'))).toBe(false)
    expect(existsSync(path.join(app, '.tanstack/route-module.json'))).toBe(
      false,
    )
  })

  it('lists the route files of mounted modules for bundlers', async () => {
    const catalog = await writeCatalog()
    const app = await writePackage({
      name: '@fixture/app',
      dependencies: ['@fixture/catalog'],
      files: {
        'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute()
`,
      },
    })
    const config = getConfig(
      {
        disableLogging: true,
        tmpDir: path.join(workspace, '.tmp'),
        routesDirectory: './src/routes',
        generatedRouteTree: './src/routeTree.gen.ts',
        routeModules: {
          includes: [{ module: '@fixture/catalog', at: '/catalog' }],
        },
      },
      app,
    )
    const generator = new Generator({ config, root: app })
    await generator.run()

    // Keyed like the bundlers' normalized module ids, on every platform.
    const routesByFile = generator.getRoutesByFileMap()
    const routeFile = (root: string, file: string) =>
      path.join(root, file).replaceAll(path.sep, '/')
    expect(routesByFile.get(routeFile(app, 'src/routes/__root.tsx'))).toEqual({
      routeId: '/__root',
    })
    expect(
      routesByFile.get(routeFile(catalog, 'src/routes/$itemId.tsx')),
    ).toEqual({ routeId: '@fixture/catalog:/$itemId' })
    expect(
      generator
        .getMountedRouteModuleRoutes()
        .filter((r) => r.id.includes('$itemId') || r.id.endsWith(':')),
    ).toEqual([
      {
        id: '@fixture/catalog:',
        parent: '__root__',
        filePath: path.join(catalog, 'src/routes/__root.tsx'),
        fullPath: '/catalog/',
      },
      {
        id: '@fixture/catalog:/$itemId',
        parent: '@fixture/catalog:',
        filePath: path.join(catalog, 'src/routes/$itemId.tsx'),
        fullPath: '/catalog/$itemId',
      },
    ])
    expect(generator.getRouteModuleWatchFiles()).toEqual([
      path.join(app, 'package.json'),
      path.join(catalog, 'package.json'),
      path.join(catalog, '.tanstack/route-module.json'),
      path.join(app, 'src/start.ts'),
      path.join(app, 'src/start.tsx'),
    ])
  })

  it('rejects a module that is not a dependency', async () => {
    await writeCatalog()
    const app = await writePackage({
      name: '@fixture/app',
      files: {
        'src/routes/__root.tsx': '',
      },
    })
    await expect(
      generate(app, {
        routeModules: {
          includes: [{ module: '@fixture/catalog', at: '/catalog' }],
        },
      }),
    ).rejects.toThrow(/is not a dependency/)
  })

  it('rejects a module without a manifest', async () => {
    await writePackage(catalogPackage())
    const app = await writePackage({
      name: '@fixture/app',
      dependencies: ['@fixture/catalog'],
      files: { 'src/routes/__root.tsx': '' },
    })
    await expect(
      generate(app, {
        routeModules: {
          includes: [{ module: '@fixture/catalog', at: '/catalog' }],
        },
      }),
    ).rejects.toThrow(/has no route module manifest/)
  })

  it('rejects an unknown parent route', async () => {
    await writeCatalog()
    const app = await writePackage({
      name: '@fixture/app',
      dependencies: ['@fixture/catalog'],
      files: { 'src/routes/__root.tsx': '' },
    })
    await expect(
      generate(app, {
        routeModules: {
          includes: [{ module: '@fixture/catalog', parent: '/_missing' }],
        },
      }),
    ).rejects.toThrow(/parent route "\/_missing"/)
  })

  it('rejects full paths that collide with mounted module routes', async () => {
    await writeCatalog()
    const app = await writePackage({
      name: '@fixture/app',
      dependencies: ['@fixture/catalog'],
      files: {
        'src/routes/__root.tsx': '',
        'src/routes/catalog.sale.tsx': '',
      },
    })
    await expect(
      generate(app, {
        routeModules: {
          includes: [{ module: '@fixture/catalog', at: '/catalog' }],
        },
      }),
    ).rejects.toThrow(/full path "\/catalog\/sale"/)
  })

  it('rejects declaring modules in package.json and in the options', async () => {
    const root = await writePackage(catalogPackage())
    await expect(
      generate(root, { routeModules: { includes: [] } }),
    ).rejects.toThrow(/in one place/)
  })
})

describe('mounting under path params', () => {
  /** `@fixture/shop` mounts the catalog below its `/orgs/$orgId` route. */
  async function writeShop(includes: Array<Record<string, string>> = []) {
    const catalog = await writePackage(catalogPackage())
    await generate(catalog)
    const shop = await writePackage({
      name: '@fixture/shop',
      packageJson: {
        tanstack: {
          router: {
            module: {
              includes: [
                {
                  module: '@fixture/catalog',
                  parent: '/orgs/$orgId',
                  at: '/catalog',
                },
                ...includes,
              ],
            },
          },
        },
      },
      dependencies: [
        '@fixture/catalog',
        ...includes.map((include) => include.module!),
      ],
      files: {
        'src/routes/__root.tsx': moduleRoot,
        'src/routes/index.tsx': route('@fixture/shop:/'),
        'src/routes/orgs.$orgId.tsx': route('@fixture/shop:/orgs/$orgId'),
      },
    })
    return shop
  }

  it('types the namespace of the mounted module with the path params above it', async () => {
    const shop = await writeShop()
    await generate(shop)

    await expect(read(shop, 'src/routeTree.gen.ts')).toMatchFileSnapshot(
      'route-modules/host-params/routeTree.snapshot.ts',
    )
    await expect(read(shop, 'src/routeScope.gen.ts')).toMatchFileSnapshot(
      'route-modules/host-params/routeScope.snapshot.ts',
    )
    await expect(readNamespace(shop, 'catalog')).toMatchFileSnapshot(
      'route-modules/host-params/routeScope.catalog.snapshot.ts',
    )
    await expect(read(shop, 'src/routeContract.gen.ts')).toMatchFileSnapshot(
      'route-modules/host-params/routeContract.snapshot.ts',
    )
  })

  it('adds the path params inside a module for the modules it installs', async () => {
    const shop = await writeShop()
    await generate(shop)
    const app = await writePackage({
      name: '@fixture/app',
      dependencies: ['@fixture/shop'],
      files: {
        'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute()
`,
      },
    })
    await generate(app, { routeModules: { includes: ['@fixture/shop'] } })

    const scope = compact(readNamespace(app, 'catalog'))
    expect(scope).toContain(
      "HostedRouter< FixtureShopInstalledRouters['@fixture/catalog'], MountedModuleHostParams['@fixture/shop'] & FixtureShopInstalledHostParams['@fixture/catalog']",
    )
    expect(scope).toContain("bindRouteScopeLink<Router>('@fixture/catalog')")
    // The shop itself is mounted at the root: its namespace takes no params.
    expect(compact(readNamespace(app, 'shop'))).toContain(
      "type Router = ScopedRouter<FixtureShopRouter, '@fixture/shop'>",
    )
  })

  async function writeAccount() {
    const account = await writePackage({
      name: '@fixture/account',
      packageJson: {
        tanstack: { router: { module: { uses: ['@fixture/catalog'] } } },
      },
      dependencies: ['@fixture/catalog'],
      files: {
        'src/routes/__root.tsx': moduleRoot,
        'src/routes/index.tsx': route('@fixture/account:/'),
      },
    })
    await generate(account)
  }

  it('rejects a module that uses it from outside the routes with the params', async () => {
    const shop = await writeShop([
      { module: '@fixture/account', at: '/account' },
    ])
    await writeAccount()

    await expect(generate(shop)).rejects.toThrow(
      '"@fixture/account" links into "@fixture/catalog", which is mounted below "/orgs/$orgId", but "@fixture/account" is mounted at "/account"',
    )
  })

  it('accepts a module that uses it from below the routes with the params', async () => {
    const shop = await writeShop([
      { module: '@fixture/account', parent: '/orgs/$orgId', at: '/account' },
    ])
    await writeAccount()

    await generate(shop)
    expect(compact(readNamespace(shop, 'account'))).toContain(
      "HostedRouter< FixtureAccountRouter, MountedModuleHostParams['@fixture/account']",
    )
  })
})

describe('installing a module several times', () => {
  const appRoute = (
    path: string,
  ) => `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('${path}')({})
`

  /**
   * `@fixture/app` installs the catalog under `/orgs/$orgId` (`orgCatalog`)
   * and `/users/$userId` (`userCatalog`); `@fixture/account`, which uses the
   * catalog, is mounted at `account`.
   */
  async function writeApp() {
    const catalog = await writePackage(catalogPackage())
    await generate(catalog)
    const account = await writePackage({
      name: '@fixture/account',
      packageJson: {
        tanstack: { router: { module: { uses: ['@fixture/catalog'] } } },
      },
      dependencies: ['@fixture/catalog'],
      files: {
        'src/routes/__root.tsx': moduleRoot,
        'src/routes/index.tsx': route('@fixture/account:/'),
      },
    })
    await generate(account)
    return writePackage({
      name: '@fixture/app',
      dependencies: ['@fixture/catalog', '@fixture/account'],
      files: {
        'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute()
`,
        'src/routes/orgs.$orgId.tsx': appRoute('/orgs/$orgId'),
        'src/routes/users.$userId.tsx': appRoute('/users/$userId'),
      },
    })
  }

  const installations = [
    {
      module: '@fixture/catalog',
      parent: '/orgs/$orgId',
      at: '/catalog',
      as: 'orgCatalog',
    },
    {
      module: '@fixture/catalog',
      parent: '/users/$userId',
      at: '/catalog',
      as: 'userCatalog',
    },
  ]

  it('mounts every installation and gives it a namespace', async () => {
    const app = await writeApp()
    await generate(app, {
      routeModules: {
        includes: [
          ...installations,
          {
            module: '@fixture/account',
            parent: '/orgs/$orgId',
            at: '/account',
          },
        ],
      },
    })

    await expect(read(app, 'src/routeTree.gen.ts')).toMatchFileSnapshot(
      'route-modules/installations/routeTree.snapshot.ts',
    )
    await expect(read(app, 'src/routeScope.gen.ts')).toMatchFileSnapshot(
      'route-modules/installations/routeScope.snapshot.ts',
    )
    for (const namespace of ['orgCatalog', 'userCatalog', 'account']) {
      await expect(readNamespace(app, namespace)).toMatchFileSnapshot(
        `route-modules/installations/routeScope.${namespace}.snapshot.ts`,
      )
    }
  })

  it('requires a name for every installation', async () => {
    const app = await writeApp()

    await expect(
      generate(app, {
        routeModules: {
          includes: [installations[0], { ...installations[1], as: undefined }],
        },
      }),
    ).rejects.toThrow(
      '"@fixture/catalog" is included more than once. Name every installation with "as".',
    )
    await expect(
      generate(app, {
        routeModules: {
          includes: [
            installations[0],
            { ...installations[1], as: 'orgCatalog' },
          ],
        },
      }),
    ).rejects.toThrow(
      'two installations of "@fixture/catalog" are named "orgCatalog"',
    )
  })

  it('rejects a module that uses it from below no installation', async () => {
    const app = await writeApp()

    await expect(
      generate(app, {
        routeModules: {
          includes: [
            ...installations,
            { module: '@fixture/account', at: '/account' },
          ],
        },
      }),
    ).rejects.toThrow(
      '"@fixture/account" links into "@fixture/catalog", which is installed several times, but no installation can take path params from "/account"',
    )
  })

  it('lets only applications install a module several times', async () => {
    const catalog = await writePackage(catalogPackage())
    await generate(catalog)
    const shop = await writePackage({
      name: '@fixture/shop',
      packageJson: {
        tanstack: { router: { module: { includes: installations } } },
      },
      dependencies: ['@fixture/catalog'],
      files: {
        'src/routes/__root.tsx': moduleRoot,
        'src/routes/orgs.$orgId.tsx': route('@fixture/shop:/orgs/$orgId'),
        'src/routes/users.$userId.tsx': route('@fixture/shop:/users/$userId'),
      },
    })

    await expect(generate(shop)).rejects.toThrow(
      'Only an application can install a route module several times.',
    )
  })
})

describe('TanStack Start fragments', () => {
  const startDependency = { '@tanstack/react-start': '*' }
  const startFile = `import { createStartModule } from './routeScope.gen'

export const start = createStartModule(() => ({}))
`
  const appRoot = `import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute()
`

  async function writeStartCatalog(withFragment = true) {
    const base = catalogPackage()
    const catalog = await writePackage({
      ...base,
      packageJson: { ...base.packageJson, dependencies: startDependency },
      files: {
        ...base.files,
        ...(withFragment ? { 'src/start.ts': startFile } : {}),
      },
    })
    await generate(catalog)
    return catalog
  }

  async function writeStartApp(opts: {
    startApp: boolean
    startFile: boolean
  }) {
    return writePackage({
      name: '@fixture/app',
      dependencies: ['@fixture/catalog'],
      packageJson: {
        dependencies: {
          '@fixture/catalog': '*',
          ...(opts.startApp ? startDependency : {}),
        },
      },
      files: {
        'src/routes/__root.tsx': appRoot,
        ...(opts.startFile
          ? {
              'src/start.ts': `import { createStart } from '@tanstack/react-start'
import { startModules } from './startModules.gen'

export const startInstance = createStart(() => ({ extends: startModules }))
`,
            }
          : {}),
      },
    })
  }

  it('gives a Start module typed server functions and exports its fragment', async () => {
    const catalog = await writeStartCatalog()

    await expect(read(catalog, 'src/routeScope.gen.ts')).toMatchFileSnapshot(
      'route-modules/start-module/routeScope.snapshot.ts',
    )
    await expect(read(catalog, 'src/routeModule.gen.ts')).toMatchFileSnapshot(
      'route-modules/start-module/routeModule.snapshot.ts',
    )
    expect(readRouteModuleManifest(catalog)!.startModules).toBe(true)
  })

  it('registers a Start module without a fragment for server rendering only', async () => {
    const catalog = await writeStartCatalog(false)

    const scope = read(catalog, 'src/routeScope.gen.ts')
    expect(scope).toContain('  ssr: true\n}')
    expect(scope).toContain('export const createServerFn')
    expect(scope).not.toContain('StartModuleConfig')
    expect(read(catalog, 'src/routeModule.gen.ts')).not.toContain(
      'startModules',
    )
    expect(readRouteModuleManifest(catalog)!.startModules).toBe(false)
  })

  it('generates installed requirement validation for the default Start instance', async () => {
    await writeStartCatalog(false)
    const app = await writeStartApp({ startApp: true, startFile: false })
    await generate(app, {
      routeModules: {
        includes: [{ module: '@fixture/catalog', at: '/catalog' }],
      },
    })
    const validation = compact(read(app, 'src/startModules.gen.ts'))
    expect(validation).toContain(
      'export type StartModulesCheck = AssertStartModules<',
    )
    expect(validation).toMatch(
      /ValidateStartModules<[^,]+, typeof startModules, readonly \['@fixture\/catalog'\]/,
    )
    expect(validation).toContain("from '@tanstack/react-start'")
  })

  it('passes the fragments of mounted modules on to the application', async () => {
    await writeStartCatalog()
    const shop = await writePackage({
      name: '@fixture/shop',
      packageJson: {
        tanstack: {
          router: {
            module: {
              includes: [{ module: '@fixture/catalog', at: '/catalog' }],
            },
          },
        },
      },
      dependencies: ['@fixture/catalog'],
      files: { 'src/routes/__root.tsx': moduleRoot },
    })
    await generate(shop)

    const routeModule = read(shop, 'src/routeModule.gen.ts')
    expect(routeModule).toContain(
      "import { startModules as FixtureCatalogStartModules } from '@fixture/catalog/route-module'",
    )
    expect(routeModule).toMatch(
      /export const startModules: readonly \[\.\.\.typeof FixtureCatalogStartModules\] = \[\s*\.\.\.FixtureCatalogStartModules,?\s*\]/,
    )
    // The includer itself does not use Start.
    expect(read(shop, 'src/routeScope.gen.ts')).not.toContain('createServerFn')
    expect(readRouteModuleManifest(shop)!.startModules).toBe(true)
  })

  it('lists the fragments for the Start instance of an application', async () => {
    await writeStartCatalog()
    const app = await writeStartApp({ startApp: true, startFile: true })
    await generate(app, {
      routeModules: {
        includes: [{ module: '@fixture/catalog', at: '/catalog' }],
      },
    })

    await expect(read(app, 'src/startModules.gen.ts')).toMatchFileSnapshot(
      'route-modules/start-application/startModules.snapshot.ts',
    )
  })

  it('retains installed requirement validation when the final fragment is removed', async () => {
    await writeStartCatalog()
    const app = await writeStartApp({ startApp: true, startFile: true })
    await generate(app, {
      routeModules: {
        includes: [{ module: '@fixture/catalog', at: '/catalog' }],
      },
    })
    expect(existsSync(path.join(app, 'src/startModules.gen.ts'))).toBe(true)

    await writeStartCatalog(false)
    await fs.rm(path.join(workspace, 'catalog/src/start.ts'))
    await generate(path.join(workspace, 'catalog'))
    await generate(app, {
      routeModules: {
        includes: [{ module: '@fixture/catalog', at: '/catalog' }],
      },
    })
    const validation = compact(read(app, 'src/startModules.gen.ts'))
    expect(validation).toContain('export const startModules: readonly [] = []')
    expect(validation).toContain(
      'export type StartModulesCheck = AssertStartModules<',
    )
    expect(validation).toContain("readonly ['@fixture/catalog']")
  })

  it('requires a Start file in an application that installs a fragment', async () => {
    await writeStartCatalog()
    const app = await writeStartApp({ startApp: true, startFile: false })

    await expect(
      generate(app, {
        routeModules: {
          includes: [{ module: '@fixture/catalog', at: '/catalog' }],
        },
      }),
    ).rejects.toThrow(
      /"@fixture\/catalog" has a TanStack Start fragment\. Install it in ".*src[\\/]start\.ts": export const startInstance = createStart/,
    )
  })

  it('rejects a fragment in an application without TanStack Start', async () => {
    await writeStartCatalog()
    const app = await writeStartApp({ startApp: false, startFile: false })

    await expect(
      generate(app, {
        routeModules: {
          includes: [{ module: '@fixture/catalog', at: '/catalog' }],
        },
      }),
    ).rejects.toThrow(
      /Install it in a TanStack Start application, which depends on "@tanstack\/react-start"/,
    )
  })
})
