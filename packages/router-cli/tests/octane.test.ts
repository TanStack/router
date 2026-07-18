import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getConfig } from '@tanstack/router-generator'
import { createGenerator } from '../src/create-generator'

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

describe('Octane route generation', () => {
  it('loads the Octane source adapter from the project', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tsr-cli-octane-'))
    tempRoots.push(root)

    const routesDirectory = path.join(root, 'src/routes')
    const packageDirectory = path.join(
      root,
      'node_modules/@tanstack/octane-router',
    )
    await fs.mkdir(routesDirectory, { recursive: true })
    await fs.mkdir(path.dirname(packageDirectory), { recursive: true })
    await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}')
    await fs.symlink(
      path.resolve(import.meta.dirname, '../../octane-router'),
      packageDirectory,
      'dir',
    )

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
        'function Page() @{ <main>Octane</main> }',
      ].join('\n'),
    )

    const config = getConfig({
      target: 'octane',
      routesDirectory,
      generatedRouteTree: path.join(root, 'src/routeTree.gen.ts'),
      disableLogging: true,
    })
    const generator = await createGenerator(config, root)

    await generator.run()

    const routeSource = await fs.readFile(
      path.join(routesDirectory, 'index.tsrx'),
      'utf8',
    )
    const routeTree = await fs.readFile(config.generatedRouteTree, 'utf8')

    expect(routeSource).toContain("createFileRoute('/')")
    expect(routeSource).toContain('function Page() @{ <main>Octane</main> }')
    expect(routeTree).toContain("'./routes/index.tsrx'")
  })
})
