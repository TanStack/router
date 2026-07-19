import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Generator, resolveServerSsr } from '../src/generator'
import { getConfig } from '../src/config'

describe('resolveServerSsr', () => {
  it.each([
    [false, false, false],
    [false, 'data-only', false],
    [false, true, false],
    [false, undefined, false],
    ['data-only', false, false],
    ['data-only', 'data-only', 'data-only'],
    ['data-only', true, 'data-only'],
    ['data-only', undefined, 'data-only'],
    [undefined, false, false],
    [undefined, 'data-only', 'data-only'],
    [undefined, true, undefined],
    [undefined, undefined, undefined],
    [true, false, false],
    [true, 'data-only', 'data-only'],
    [true, true, true],
    [true, undefined, undefined],
  ] as const)(
    'resolves parent %s and local %s to %s',
    (parent, local, expected) => {
      expect(resolveServerSsr(parent, local)).toBe(expected)
    },
  )

  it('publishes inherited usage for route files across unchanged runs', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tsr-ssr-usage-'))
    const routesDirectory = path.join(root, 'routes')
    await fs.mkdir(routesDirectory)

    const routeFiles = {
      '__root.tsx': 'createRootRoute({ ssr: true })',
      'parent.tsx': "createFileRoute('/parent')({ ssr: 'data-only' })",
      'parent.child.tsx': "createFileRoute('/parent/child')({ ssr: true })",
      'parent.lazy.tsx': "createLazyFileRoute('/parent')({})",
      'dynamic.tsx': "createFileRoute('/dynamic')({ ssr: () => false })",
    }

    try {
      await Promise.all(
        Object.entries(routeFiles).map(([filename, expression]) =>
          fs.writeFile(
            path.join(routesDirectory, filename),
            `export const Route = ${expression}`,
          ),
        ),
      )

      const generator = new Generator({
        root,
        config: getConfig(
          {
            disableLogging: true,
            routesDirectory,
            generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
          },
          root,
        ),
      })

      await generator.run()
      await generator.run()

      const routesByFile = generator.getRoutesByFileMap()
      const usage = (filename: string) =>
        routesByFile.get(
          path.join(routesDirectory, filename).replaceAll('\\', '/'),
        )?.serverSsr

      expect(usage('__root.tsx')).toBe(true)
      expect(usage('parent.tsx')).toBe('data-only')
      expect(usage('parent.lazy.tsx')).toBe('data-only')
      expect(usage('parent.child.tsx')).toBe('data-only')
      expect(usage('dynamic.tsx')).toBeUndefined()
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
