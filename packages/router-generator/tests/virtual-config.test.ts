import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { Generator, getConfig } from '../src'

test.each(
  ['relative', 'absolute'].flatMap((configPath) =>
    [
      { failure: 'syntax', source: 'export default {' },
      {
        failure: 'schema',
        source: "export default { type: 'root', file: 42 }",
      },
    ].map((invalid) => ({ configPath, ...invalid })),
  ),
)(
  'recovers from an initial $failure error in a $configPath virtual configuration',
  async ({ configPath, source }) => {
    const root = await mkdtemp(path.join(tmpdir(), 'router-virtual-recovery-'))
    const routes = path.join(root, 'routes')
    const configFile = path.join(root, 'virtual-routes.ts')
    const generatedRouteTree = path.join(root, 'routeTree.gen.ts')
    try {
      await mkdir(routes)
      await Promise.all([
        writeFile(
          path.join(routes, '__root.tsx'),
          `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})\n`,
        ),
        writeFile(configFile, source),
      ])
      const generator = new Generator({
        root,
        config: getConfig(
          {
            routesDirectory: routes,
            generatedRouteTree,
            virtualRouteConfig:
              configPath === 'relative' ? 'virtual-routes.ts' : configFile,
            tmpDir: path.join(root, 'tmp'),
            disableLogging: true,
          },
          root,
        ),
      })
      await expect(generator.run()).rejects.toThrow()
      expect(generator.getWatchDependencies().files).toEqual([configFile])
      await writeFile(
        configFile,
        "export default { type: 'root', file: '__root.tsx' }\n",
      )
      await generator.run({ path: configFile, type: 'update' })
      expect(await readFile(generatedRouteTree, 'utf8')).toContain(
        "import { Route as rootRouteImport } from './routes/__root'",
      )
      expect(generator.getWatchDependencies().files).toEqual([configFile])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
)

test.each([
  { source: 'configuration', depth: 0 },
  { source: 'helper', depth: 1 },
  { source: 'transitive helper', depth: 2 },
])('reloads an edited $source from its file event', async ({ depth }) => {
  const root = await mkdtemp(path.join(tmpdir(), 'router-virtual-config-'))
  const routes = path.join(root, 'routes')
  const configFile = path.join(root, 'virtual-routes.ts')
  const editedFile = depth ? path.join(root, `helper${depth}.ts`) : configFile
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
      ...['before', 'after', 'replacement'].map((name) =>
        writeFile(
          path.join(routes, `${name}.tsx`),
          `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/${name}')({})\n`,
        ),
      ),
      writeFile(editedFile, virtualConfig('before')),
      ...Array.from({ length: depth }, (_, index) =>
        writeFile(
          index ? path.join(root, `helper${index}.ts`) : configFile,
          `export { default } from './helper${index + 1}'\n`,
        ),
      ),
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
    const dependencies = [
      configFile,
      ...Array.from({ length: depth }, (_, index) =>
        path.join(root, `helper${index + 1}.ts`),
      ),
    ]
    expect(generator.getWatchDependencies()).toEqual({
      files: expect.arrayContaining(dependencies),
      directories: [],
    })
    expect(generator.getWatchDependencies().files).toHaveLength(
      dependencies.length,
    )

    const isolatedConfig = path.join(root, 'isolated-routes.ts')
    await writeFile(isolatedConfig, virtualConfig('replacement'))
    const isolated = new Generator({
      root,
      config: getConfig(
        {
          routesDirectory: routes,
          generatedRouteTree: path.join(root, 'isolated-routeTree.gen.ts'),
          virtualRouteConfig: isolatedConfig,
          tmpDir: path.join(root, 'tmp'),
          disableLogging: true,
        },
        root,
      ),
    })
    await isolated.run()
    expect(isolated.getWatchDependencies().files).toEqual([isolatedConfig])
    expect(generator.getWatchDependencies().files).toEqual(
      expect.arrayContaining(dependencies),
    )
    expect(generator.getWatchDependencies().files).toHaveLength(
      dependencies.length,
    )

    await writeFile(editedFile, virtualConfig('after'))
    await generator.run({ path: editedFile, type: 'update' })
    const updated = await readFile(generatedRouteTree, 'utf8')
    expect(updated).toContain("'/after'")
    expect(updated).not.toContain("'/before'")

    await generator.run({ path: editedFile, type: 'update' })
    expect(await readFile(generatedRouteTree, 'utf8')).toBe(updated)

    await writeFile(`${editedFile}.next`, virtualConfig('replacement'))
    await rename(`${editedFile}.next`, editedFile)
    await generator.run({ path: editedFile, type: 'update' })
    const replaced = await readFile(generatedRouteTree, 'utf8')
    expect(replaced).toContain("'/replacement'")
    expect(replaced).not.toContain("'/after'")
    expect(replaced).not.toContain("'/before'")

    await writeFile(configFile, virtualConfig('before'))
    await generator.run({ path: configFile, type: 'update' })
    expect(await readFile(generatedRouteTree, 'utf8')).toContain("'/before'")
    expect(generator.getWatchDependencies().files).toEqual([configFile])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('watches imports awaited by a nested __virtual factory', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'router-virtual-factory-'))
  const routes = path.join(root, 'routes')
  const nested = path.join(routes, 'nested')
  const configFile = path.join(nested, '__virtual.ts')
  const helperFile = path.join(root, 'helper.ts')
  const leafFile = path.join(root, 'leaf.ts')
  const generatedRouteTree = path.join(root, 'routeTree.gen.ts')
  const subtree = (name: string) =>
    `export default [{ type: 'route', path: '/${name}', file: '${name}.tsx' }]\n`
  try {
    await mkdir(nested, { recursive: true })
    await Promise.all([
      writeFile(
        path.join(routes, '__root.tsx'),
        `import { createRootRoute } from '@tanstack/react-router'; export const Route = createRootRoute({})\n`,
      ),
      ...['before', 'after'].map((name) =>
        writeFile(
          path.join(nested, `${name}.tsx`),
          `import { createFileRoute } from '@tanstack/react-router'; export const Route = createFileRoute('/nested/${name}')({})\n`,
        ),
      ),
      writeFile(
        configFile,
        `export default async () => (await import('../../helper')).default\n`,
      ),
      writeFile(helperFile, `export { default } from './leaf'\n`),
      writeFile(leafFile, subtree('before')),
    ])
    const generator = new Generator({
      root,
      config: getConfig(
        {
          routesDirectory: routes,
          generatedRouteTree,
          tmpDir: path.join(root, 'tmp'),
          disableLogging: true,
        },
        root,
      ),
    })
    await generator.run()
    expect(await readFile(generatedRouteTree, 'utf8')).toContain(
      "'/nested/before'",
    )
    expect(generator.getWatchDependencies()).toEqual({
      files: expect.arrayContaining([configFile, helperFile, leafFile]),
      directories: [routes],
    })
    expect(generator.getWatchDependencies().files).toHaveLength(3)
    await writeFile(leafFile, subtree('after'))
    await generator.run({ path: leafFile, type: 'update' })
    const updated = await readFile(generatedRouteTree, 'utf8')
    expect(updated).toContain("'/nested/after'")
    expect(updated).not.toContain("'/nested/before'")

    await writeFile(configFile, subtree('before'))
    await generator.run({ path: configFile, type: 'update' })
    expect(await readFile(generatedRouteTree, 'utf8')).toContain(
      "'/nested/before'",
    )
    expect(generator.getWatchDependencies().files).toEqual([configFile])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('evaluates a cyclic virtual configuration once per generation', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'router-virtual-cycle-'))
  const routes = path.join(root, 'routes')
  const configFile = path.join(root, 'virtual-routes.ts')
  const evaluationLog = path.join(root, 'evaluations.log')
  try {
    await mkdir(routes)
    await writeFile(
      path.join(routes, '__root.tsx'),
      `import { createRootRoute } from '@tanstack/react-router'; export const Route = createRootRoute({})\n`,
    )
    await writeFile(
      configFile,
      `import { appendFileSync } from 'node:fs'
import './virtual-routes'
appendFileSync(${JSON.stringify(evaluationLog)}, 'run\\n')
export default { type: 'root', file: '__root.tsx', children: [] }
`,
    )
    const generator = new Generator({
      root,
      config: getConfig(
        {
          routesDirectory: routes,
          virtualRouteConfig: configFile,
          generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
          tmpDir: path.join(root, 'tmp'),
          disableLogging: true,
        },
        root,
      ),
    })
    await generator.run()
    expect(await readFile(evaluationLog, 'utf8')).toBe('run\n')
    await generator.run({ path: configFile, type: 'update' })
    expect(await readFile(evaluationLog, 'utf8')).toBe('run\nrun\n')
    expect(generator.getWatchDependencies().files).toEqual([configFile])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
