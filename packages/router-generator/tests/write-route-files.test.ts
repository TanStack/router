import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Generator, getConfig } from '../src'

const rootRouteSource = `import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute()
`

let tempDir: string | undefined

afterEach(async () => {
  vi.restoreAllMocks()
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true })
    tempDir = undefined
  }
})

/** A project whose generator writes the route tree and no route file. */
async function createProject(routes: Record<string, string>) {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tsr-generator-tree-only-'))
  const routesDirectory = path.join(tempDir, 'routes')
  await fs.mkdir(routesDirectory)
  for (const [file, content] of Object.entries(routes)) {
    await fs.writeFile(path.join(routesDirectory, file), content)
  }
  const generatedRouteTree = path.join(tempDir, 'routeTree.gen.ts')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const generator = new Generator({
    config: getConfig(
      {
        routesDirectory,
        generatedRouteTree,
        tmpDir: path.join(tempDir, 'tmp'),
      },
      tempDir,
    ),
    root: tempDir,
    writeRouteFiles: false,
  })
  return {
    generator,
    // (the generator names route files with forward slashes on every system)
    route: (file: string) =>
      path.join(routesDirectory, file).replaceAll('\\', '/'),
    routeTree: () => fs.readFile(generatedRouteTree, 'utf8'),
    warnings: () => warn.mock.calls.map((args) => args.join(' ')).join('\n'),
  }
}

describe('generator that does not write route files', () => {
  it('leaves a route file whose route path is out of date as it is and warns', async () => {
    const movedRouteSource = `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/moved-from')({
  component: () => 'moved',
})
`
    const project = await createProject({
      '__root.tsx': rootRouteSource,
      'moved.tsx': movedRouteSource,
    })

    await project.generator.run()

    expect(await fs.readFile(project.route('moved.tsx'), 'utf8')).toBe(
      movedRouteSource,
    )
    // The route tree has the route by the location of its file.
    const routeTree = await project.routeTree()
    expect(routeTree).toContain(`'/moved'`)
    expect(routeTree).not.toContain('moved-from')
    expect(project.warnings()).toContain(
      `Route file "${project.route('moved.tsx')}" is out of date`,
    )
  })

  it('warns about a non-lazy factory in a lazy route without rewriting it', async () => {
    const lazySource = `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: () => 'about',
})
`
    const project = await createProject({
      '__root.tsx': rootRouteSource,
      'about.lazy.tsx': lazySource,
    })

    await project.generator.run()

    expect(await fs.readFile(project.route('about.lazy.tsx'), 'utf8')).toBe(
      lazySource,
    )
    expect(await project.routeTree()).toContain(
      ".lazy(() => import('./routes/about.lazy')",
    )
    expect(project.warnings()).toContain(
      `Route file "${project.route('about.lazy.tsx')}" is out of date`,
    )
  })

  it('leaves an empty route file empty and out of the route tree, and warns', async () => {
    const project = await createProject({
      '__root.tsx': rootRouteSource,
      'empty.tsx': '',
    })

    await project.generator.run()

    expect(await fs.readFile(project.route('empty.tsx'), 'utf8')).toBe('')
    expect(await project.routeTree()).not.toContain('empty')
    expect(project.warnings()).toContain(
      `Route file "${project.route('empty.tsx')}" is empty`,
    )
  })

  it('fails for an empty root route file, which it cannot fill', async () => {
    const project = await createProject({ '__root.tsx': '' })

    await expect(project.generator.run()).rejects.toThrow(
      `The root route file "${project.route('__root.tsx')}" is empty`,
    )
    expect(await fs.readFile(project.route('__root.tsx'), 'utf8')).toBe('')
  })
})
