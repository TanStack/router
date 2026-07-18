import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Generator, getConfig } from '../src'
import type { GeneratorPlugin } from '../src'

const tempRoots: Array<string> = []

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      fs.rm(root, {
        recursive: true,
        force: true,
      }),
    ),
  )
})

function maskTsrxComponentBodies(source: string) {
  return source.replace(/@\{[\s\S]*?\}/g, (componentBody) => {
    const inner = componentBody.slice(2, -1).replaceAll(/[^\n\r]/g, ' ')
    return ` {${inner}}`
  })
}

describe('octane target', () => {
  it('discovers, scaffolds, and updates .tsrx route modules through framework hooks', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tsr-octane-'))
    tempRoots.push(root)
    const routesDirectory = path.join(root, 'src/routes')
    await fs.mkdir(routesDirectory, { recursive: true })

    await fs.writeFile(
      path.join(routesDirectory, '__root.tsrx'),
      [
        "import { createRootRoute } from '@tanstack/octane-router'",
        'export const Route = createRootRoute({})',
      ].join('\n'),
    )
    await fs.writeFile(
      path.join(routesDirectory, 'index.tsrx'),
      [
        "import { createFileRoute } from '@tanstack/octane-router'",
        "export const Route = createFileRoute('/stale')({ component: Page })",
        'function Page() @{ <div>Index</div> }',
      ].join('\n'),
    )
    await fs.writeFile(path.join(routesDirectory, 'about.tsrx'), '')

    const hookSources: Array<string> = []
    const sourcePlugin: GeneratorPlugin = {
      name: 'test-octane-source',
      transformRouteSource: ({ source }) => maskTsrxComponentBodies(source),
      formatRoute: ({ source }) => source,
    }
    const userPlugin: GeneratorPlugin = {
      name: 'test-user-plugin',
      transformRouteSource: ({ source }) => {
        hookSources.push(source)
      },
      formatRoute: ({ source }) => `${source}// user-formatted\n`,
    }
    const config = getConfig({
      target: 'octane',
      routesDirectory,
      generatedRouteTree: path.join(root, 'src/routeTree.gen.ts'),
      disableLogging: true,
      plugins: [sourcePlugin, userPlugin],
    })

    await new Generator({ config, root }).run()

    const indexRoute = await fs.readFile(
      path.join(routesDirectory, 'index.tsrx'),
      'utf8',
    )
    const aboutRoute = await fs.readFile(
      path.join(routesDirectory, 'about.tsrx'),
      'utf8',
    )
    const routeTree = await fs.readFile(config.generatedRouteTree, 'utf8')

    expect(indexRoute).toContain("createFileRoute('/')")
    expect(indexRoute).toContain('function Page() @{ <div>Index</div> }')
    expect(aboutRoute).toContain(
      "import { createFileRoute } from '@tanstack/octane-router';",
    )
    expect(aboutRoute).toContain('function RouteComponent() @{')
    expect(aboutRoute).toContain('// user-formatted')
    expect(routeTree).toContain("declare module '@tanstack/octane-router'")
    expect(routeTree).toContain("'./routes/about.tsrx'")
    expect(hookSources.length).toBeGreaterThan(0)
    expect(hookSources.every((source) => !source.includes('@{'))).toBe(true)
  })

  it('honors an explicit extension override', () => {
    expect(getConfig({ target: 'octane' }).addExtensions).toBe(true)
    expect(
      getConfig({ target: 'octane', addExtensions: false }).addExtensions,
    ).toBe(false)
    for (const target of ['react', 'solid', 'vue'] as const) {
      expect(getConfig({ target }).addExtensions).toBe(false)
    }
  })

  it('reports the authored Octane root extension when types are disabled', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tsr-octane-root-'))
    tempRoots.push(root)
    const routesDirectory = path.join(root, 'src/routes')
    await fs.mkdir(routesDirectory, { recursive: true })

    const config = getConfig({
      target: 'octane',
      routesDirectory,
      generatedRouteTree: path.join(root, 'src/routeTree.gen.js'),
      disableLogging: true,
      disableTypes: true,
    })

    await expect(new Generator({ config, root }).run()).rejects.toThrow(
      '__root.tsrx',
    )
  })
})
