import path from 'node:path'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { Generator, getConfig } from '@tanstack/router-generator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Workspace, errorsIn } from './workspace'

let workspace: Workspace

beforeEach(() => {
  workspace = new Workspace()
})

afterEach(() => {
  workspace.dispose()
})

async function publishModules() {
  for (const name of ['catalog', 'notes', 'settings', 'team']) {
    const result = await workspace.publish(name)
    expect(result.diagnostics, name).toEqual([])
  }
}

describe('Start route modules', () => {
  it.each([
    {
      specifier: 'http',
      importedType: 'IncomingMessage',
      requiredContext: '{ request: IncomingMessage }',
      validConsumer:
        'export const method: string | undefined = context.request.method',
      invalidConsumer: 'export const invalid: number = context.request.method',
    },
    {
      specifier: '#request-context',
      importedType: 'RequestContext',
      requiredContext: 'RequestContext',
      validConsumer: 'export const traceId: string = context.traceId',
      invalidConsumer: 'export const invalid: number = context.traceId',
    },
  ])(
    'consumes published requirements that import $specifier',
    async ({
      specifier,
      importedType,
      requiredContext,
      validConsumer,
      invalidConsumer,
    }) => {
      const catalog = workspace.pkg('catalog')
      const app = workspace.pkg('web')
      rmSync(path.join(catalog, 'src'), { recursive: true, force: true })
      mkdirSync(path.join(catalog, 'src/routes'), { recursive: true })
      if (specifier === 'http') {
        const nodeTypes = path.join(catalog, 'node_modules/@types/node')
        mkdirSync(path.dirname(nodeTypes), { recursive: true })
        if (!existsSync(nodeTypes)) {
          symlinkSync(
            realpathSync(
              path.resolve(
                import.meta.dirname,
                '../../../../node_modules/@types/node',
              ),
            ),
            nodeTypes,
            'dir',
          )
        }
        workspace.edit('catalog', 'package.json', (source) => {
          const pkg = JSON.parse(source)
          pkg.devDependencies['@types/node'] = '*'
          return JSON.stringify(pkg)
        })
        workspace.edit('catalog', 'tsconfig.json', (source) => {
          const config = JSON.parse(source)
          config.compilerOptions.types = ['node']
          return JSON.stringify(config)
        })
      } else {
        mkdirSync(path.join(catalog, 'types'), { recursive: true })
        writeFileSync(
          path.join(catalog, 'types/request-context.d.ts'),
          'export interface RequestContext { traceId: string }\n',
        )
        workspace.edit('catalog', 'package.json', (source) => {
          const pkg = JSON.parse(source)
          pkg.imports = { '#request-context': './types/request-context.d.ts' }
          return JSON.stringify(pkg)
        })
      }
      writeFileSync(
        path.join(catalog, 'src/requirements.ts'),
        `export type { StartModuleRequirements } from '@tanstack/react-start'
import type { ${importedType} } from '${specifier}'
declare module '@tanstack/react-start' {
  interface StartModuleRequirements {
    '@start-route-modules/catalog': { requestContext: ${requiredContext} }
  }
}
`,
      )
      writeFileSync(
        path.join(catalog, 'src/routes/__root.tsx'),
        `export type {} from '../requirements'
import { createModuleRoot } from '../routeScope.gen'
export const Route = createModuleRoot()({})
`,
      )
      const published = await workspace.publish('catalog')
      expect(published.diagnostics).toEqual([])
      expect(
        readFileSync(
          path.join(catalog, '.tanstack/types/src/requirements.d.ts'),
          'utf8',
        ),
      ).toContain(`from '${specifier}'`)

      rmSync(path.join(app, 'src'), { recursive: true, force: true })
      mkdirSync(path.join(app, 'src/routes'), { recursive: true })
      writeFileSync(
        path.join(app, 'src/routes/__root.tsx'),
        `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
      )
      writeFileSync(
        path.join(app, 'src/request-context.ts'),
        `import type { StartModuleRequirements } from '@tanstack/react-start'
type RequiredContext = StartModuleRequirements['@start-route-modules/catalog']['requestContext']
declare module '@tanstack/react-start' {
  interface Register { server: { requestContext: RequiredContext } }
}
declare const context: RequiredContext
${validConsumer}
// @ts-expect-error Published requirement imports preserve their field types.
${invalidConsumer}
`,
      )
      workspace.edit('web', 'tsconfig.json', (source) => {
        const config = JSON.parse(source)
        config.compilerOptions.skipLibCheck = false
        config.compilerOptions.types = ['node']
        config.include = ['src']
        return JSON.stringify(config)
      })
      await new Generator({
        root: app,
        config: getConfig(
          {
            disableLogging: true,
            tmpDir: path.join(workspace.root, '.tmp'),
            routeModules: { includes: ['@start-route-modules/catalog'] },
          },
          app,
        ),
      }).run()
      rmSync(path.join(catalog, 'src'), { recursive: true, force: true })
      expect(workspace.checkApp().diagnostics).toEqual([])
    },
  )

  it('checks published requirements-only modules against the default Start instance', async () => {
    const catalog = workspace.pkg('catalog')
    const app = workspace.pkg('web')
    rmSync(path.join(catalog, 'src'), { recursive: true, force: true })
    mkdirSync(path.join(catalog, 'src/routes'), { recursive: true })
    writeFileSync(
      path.join(catalog, 'src/requirements.ts'),
      `export type { StartModuleRequirements } from '@tanstack/react-start'
declare module '@tanstack/react-start' {
  interface StartModuleRequirements {
    '@start-route-modules/catalog': { requestContext: { shopper: string } }
  }
}
`,
    )
    writeFileSync(
      path.join(catalog, 'src/routes/__root.tsx'),
      `export type {} from '../requirements'
import { createModuleRoot } from '../routeScope.gen'
export const Route = createModuleRoot()({})
`,
    )
    writeFileSync(
      path.join(catalog, 'src/routes/index.tsx'),
      `import { createFileRoute } from '../routeScope.gen'
export const Route = createFileRoute('@start-route-modules/catalog:/')({})
`,
    )
    const published = await workspace.publish('catalog')
    expect(published.diagnostics).toEqual([])

    rmSync(path.join(app, 'src'), { recursive: true, force: true })
    mkdirSync(path.join(app, 'src/routes'), { recursive: true })
    writeFileSync(
      path.join(app, 'src/routes/__root.tsx'),
      `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
    )
    workspace.edit('web', 'tsconfig.json', (source) => {
      const config = JSON.parse(source)
      config.compilerOptions.skipLibCheck = false
      config.compilerOptions.types = ['node']
      config.include = ['src']
      return JSON.stringify(config)
    })
    await new Generator({
      root: app,
      config: getConfig(
        {
          disableLogging: true,
          tmpDir: path.join(workspace.root, '.tmp'),
          routeModules: {
            includes: [
              {
                module: '@start-route-modules/catalog',
                as: 'requirementsOnly',
                at: '/catalog',
              },
            ],
          },
        },
        app,
      ),
    }).run()

    // Consumer checking must load the augmentation from the published contract.
    rmSync(path.join(catalog, 'src'), { recursive: true, force: true })
    const missing = workspace.checkApp()
    expect(missing.ok).toBe(false)
    expect(
      errorsIn(missing.diagnostics, 'startModules.gen.ts').join('\n'),
    ).toContain(
      "Route module '@start-route-modules/catalog' requires request context 'shopper' that is not provided from application middleware",
    )

    // handler.fetch can satisfy requirements without a custom Start instance.
    writeFileSync(
      path.join(app, 'src/request-context.ts'),
      `import '@tanstack/react-start'
declare module '@tanstack/react-start' {
  interface Register {
    server: { requestContext: { shopper: string } }
  }
}
`,
    )
    expect(workspace.checkApp().diagnostics).toEqual([])
  })

  it('the application type-checks against the published modules', async () => {
    await publishModules()
    await workspace.generateApp()

    expect((await workspace.checkApp()).diagnostics).toEqual([])
  })

  it('the application must provide the request context a module requires', async () => {
    await publishModules()
    workspace.edit('web', 'src/start.ts', (source) =>
      source.replace('  requestMiddleware: [shopper],\n', ''),
    )
    await workspace.generateApp()

    const result = await workspace.checkApp()
    expect(result.ok).toBe(false)
    expect(
      errorsIn(result.diagnostics, 'startModules.gen.ts').join('\n'),
    ).toContain(
      "Route module '@start-route-modules/catalog' requires request context 'shopper' that is not provided from application middleware",
    )
  })

  it('the application must install the fragments of its modules', async () => {
    await publishModules()
    workspace.edit('web', 'src/start.ts', (source) =>
      source.replace('  extends: startModules,\n', ''),
    )
    await workspace.generateApp()

    const result = await workspace.checkApp()
    expect(result.ok).toBe(false)
    expect(
      errorsIn(result.diagnostics, 'startModules.gen.ts').join('\n'),
    ).toContain(
      "Route module '@start-route-modules/catalog' is not installed: add 'extends: startModules' to createStart()",
    )
  })

  it("a module's server functions and loaders are validated against its fragment", async () => {
    workspace.edit('catalog', 'src/start.ts', (source) =>
      source.replace('  serializationAdapters: [moneyAdapter],\n', ''),
    )

    const result = await workspace.publish('catalog')
    expect(result.ok).toBe(false)
    // `Money` has a method, so it is only serializable with the adapter.
    const diagnostics = result.diagnostics.join('\n')
    expect(diagnostics).toMatch(/src\/api\.ts\(\d+,\d+\): error TS2345/)
    expect(diagnostics).toContain('Function may not be serializable')
  })

  it("the application serializes a router-only module's results", async () => {
    workspace.edit('notes', 'src/routes/index.tsx', (source) =>
      source.replace(
        "loader: () => ({ notes: ['Compose route modules', 'Ship it'] }),",
        "loader: () => ({ notes: ['Compose route modules'], open: () => {} }),",
      ),
    )
    await publishModules()
    await workspace.generateApp()

    const result = await workspace.checkApp()
    expect(result.ok).toBe(false)
    expect(
      errorsIn(result.diagnostics, 'routeTree.gen.ts').join('\n'),
    ).toContain(
      "Route module '@start-route-modules/notes' returns loader or beforeLoad results from '@start-route-modules/notes:/' that the application cannot serialize",
    )
  })

  // The generated scope of a Start module imports private bindings of the
  // same names; the namespace export must not collide with them.
  it.each(['bindRouteScopeLink', 'createStartServerFn'])(
    'a module may name a used module %s',
    async (alias) => {
      workspace.edit('team', 'package.json', (source) => {
        const manifest = JSON.parse(source)
        manifest.tanstack.router.module.uses = [
          { module: '@start-route-modules/settings', as: alias },
        ]
        return JSON.stringify(manifest, null, 2)
      })
      workspace.edit('team', 'src/routes/index.tsx', (source) =>
        source.replace(
          'import { Link, createFileRoute, settings } from',
          `import { Link, createFileRoute, ${alias} as settings } from`,
        ),
      )
      writeFileSync(
        path.join(workspace.pkg('team'), 'src/consumer.ts'),
        `import { ${alias}, linkOptions, createServerFn } from './routeScope.gen'
export const ownLink = linkOptions({ to: '/' })
export const dependencyLink = ${alias}.linkOptions({ to: '/profile' })
export const serverFn = createServerFn().handler(() => 'ok')
// @ts-expect-error The dependency namespace retains its provider's local paths.
${alias}.linkOptions({ to: '/outside' })
`,
      )
      for (const name of ['settings', 'team']) {
        const result = await workspace.publish(name)
        expect(result.diagnostics, name).toEqual([])
      }
    },
  )
})
