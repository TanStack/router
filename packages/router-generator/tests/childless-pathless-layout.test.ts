import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { Generator, getConfig } from '../src'

let tempDir: string | undefined

afterEach(async () => {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true })
    tempDir = undefined
  }
})

function routeSource(id: string) {
  if (id === '__root__') {
    return `import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute()
`
  }
  return `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('${id}')()
`
}

async function generate(files: Record<string, string>) {
  tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'tsr-generator-childless-layout-'),
  )
  const routesDirectory = path.join(tempDir, 'routes')
  for (const [file, id] of Object.entries(files)) {
    const filePath = path.join(routesDirectory, file)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, routeSource(id))
  }
  const generatedRouteTree = path.join(tempDir, 'routeTree.gen.ts')
  const generator = new Generator({
    config: getConfig(
      {
        disableLogging: true,
        routesDirectory,
        generatedRouteTree,
        tmpDir: path.join(tempDir, 'tmp'),
      },
      tempDir,
    ),
    root: tempDir,
  })
  await generator.run()
  return fs.readFile(generatedRouteTree, 'utf-8')
}

// A route group's layout without child routes yet next to the index route
// generates, as before route-group layouts were typed with the full path `/`.
describe('a route-group layout without child routes yet next to the index route', () => {
  it.each([
    { file: '(group)/_layout.tsx', id: '/(group)/_layout' },
    { file: '(marketing)/route.tsx', id: '/(marketing)' },
  ])('$file is added to the route tree', async ({ file, id }) => {
    const routeTree = await generate({
      '__root.tsx': '__root__',
      'index.tsx': '/',
      [file]: id,
    })

    expect(routeTree).toContain(`'${id}': typeof`)
  })
})

// A pathless layout whose parent directory has no route file of its own
// (`foo/_layout.tsx` without `foo.tsx`) carries that directory's path, so it
// matches `/foo` like any other route there.
describe('a layout without child routes yet that adds a path', () => {
  it.each([
    { file: '(group)/foo.tsx', id: '/(group)/foo' },
    { file: 'foo_.tsx', id: '/foo_' },
  ])('conflicts with $file at the same full path', async ({ file, id }) => {
    await expect(
      generate({
        '__root.tsx': '__root__',
        'foo/_layout.tsx': '/foo/_layout',
        [file]: id,
      }),
    ).rejects.toThrow(
      'Conflicting configuration paths were found for the following routes: "/foo", "/foo".',
    )
  })
})
