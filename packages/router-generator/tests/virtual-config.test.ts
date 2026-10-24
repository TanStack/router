import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { Generator } from '../src/generator'
import { getConfig } from '../src/config'

test('reloads an edited virtual route configuration on the next generation', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'router-virtual-config-'))
  const routes = path.join(root, 'routes')
  const configFile = path.join(root, 'virtual-routes.ts')
  const generatedRouteTree = path.join(root, 'routeTree.gen.ts')
  const virtualConfig = (name: string) =>
    `export default ${JSON.stringify({
      type: 'root',
      file: '__root.tsx',
      children: [{ type: 'route', path: `/${name}`, file: `${name}.tsx` }],
    })}\n`

  try {
    await mkdir(routes)
    await Promise.all([
      writeFile(
        path.join(routes, '__root.tsx'),
        `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})\n`,
      ),
      ...['before', 'after'].map((name) =>
        writeFile(
          path.join(routes, `${name}.tsx`),
          `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/${name}')({})\n`,
        ),
      ),
      writeFile(configFile, virtualConfig('before')),
    ])
    const generator = new Generator({
      root,
      config: getConfig(
        {
          routesDirectory: routes,
          generatedRouteTree,
          virtualRouteConfig: 'virtual-routes.ts',
          tmpDir: path.join(root, 'tmp'),
          disableLogging: true,
        },
        root,
      ),
    })

    await generator.run()
    expect(await readFile(generatedRouteTree, 'utf8')).toContain("'/before'")

    await writeFile(configFile, virtualConfig('after'))
    await generator.run()
    const updated = await readFile(generatedRouteTree, 'utf8')
    expect(updated).toContain("'/after'")
    expect(updated).not.toContain("'/before'")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
