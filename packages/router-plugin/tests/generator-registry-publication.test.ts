/**
 * The Vite generator plugin publishes the route registry (`routesByFile`) to
 * its context after each watcher event, and the compilers subscribed to the
 * context compare the whole registry with the previous one: an event that
 * leaves the registry as it was (an edit of a module that is no route, or of
 * a route whose id stays) notifies no subscriber, so the cost of an edit
 * does not grow with the number of routes.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizePath } from 'vite'
import { expect, test } from 'vitest'
import { createAppDirectory } from '@tanstack/compiler-test-utils/app-directory'
import { onTestFinished } from '@tanstack/compiler-test-utils/test-scope'
import {
  changedRoutePaths,
  createRouterPluginContext,
  onRoutesChanged,
} from '@tanstack/router-plugin/context'
import { tanstackRouterGenerator } from '@tanstack/router-plugin/vite'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

test('a watcher event that changes no route notifies no registry subscriber', async () => {
  const root = await createAppDirectory(harnessDir, '.registry-publication-')
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const file = (relative: string) => path.join(root, relative)
  // The registry is keyed by the generator's posix-form paths.
  const registryKey = (relative: string) => normalizePath(file(relative))
  await mkdir(file('src/routes'), { recursive: true })
  await mkdir(file('src/components'), { recursive: true })
  await writeFile(
    file('src/routes/__root.tsx'),
    `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})
`,
  )
  await writeFile(
    file('src/routes/index.tsx'),
    `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => 'index' })
`,
  )
  await writeFile(
    file('src/components/Widget.tsx'),
    `export const Widget = () => 'v0'\n`,
  )
  const context = createRouterPluginContext()
  const notified: Array<Array<string>> = []
  onRoutesChanged(context, (next, previous) => {
    notified.push(changedRoutePaths(next, previous))
  })
  const plugin = tanstackRouterGenerator(
    {
      target: 'react',
      routesDirectory: file('src/routes'),
      generatedRouteTree: file('src/routeTree.gen.ts'),
      disableLogging: true,
    },
    context,
  ) as any
  await plugin.configResolved({ root })
  expect(notified).toEqual([
    [registryKey('src/routes/__root.tsx'), registryKey('src/routes/index.tsx')],
  ])

  await writeFile(
    file('src/components/Widget.tsx'),
    `export const Widget = () => 'v1'\n`,
  )
  await plugin.watchChange(file('src/components/Widget.tsx'), {
    event: 'update',
  })
  await writeFile(
    file('src/routes/index.tsx'),
    `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => 'index v1' })
`,
  )
  await plugin.watchChange(file('src/routes/index.tsx'), { event: 'update' })
  expect(notified).toHaveLength(1)

  await writeFile(
    file('src/routes/about.tsx'),
    `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/about')({ component: () => 'about' })
`,
  )
  await plugin.watchChange(file('src/routes/about.tsx'), { event: 'create' })
  expect(notified).toEqual([
    [registryKey('src/routes/__root.tsx'), registryKey('src/routes/index.tsx')],
    [registryKey('src/routes/about.tsx')],
  ])
})
