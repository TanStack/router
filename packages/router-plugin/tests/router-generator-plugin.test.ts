import path from 'node:path'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRouterGeneratorPlugin } from '../src/core/router-generator-plugin'
import { createRouterPluginContext } from '../src/core/router-plugin-context'
import { buildAndRun } from './regression-helpers'
import type { UnpluginOptions } from 'unplugin'

const rootRoute = `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})`
const badRoute = `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/bad[%]')({})`
const indexRoute = `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => null })`
const disallowed = 'Disallowed character "%" found in square brackets'

const roots: Array<string> = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

/** Resolves the generator plugin's Vite config for an app with a bad route. */
async function configureGenerator(command: 'serve' | 'build') {
  const root = await mkdtemp(path.join(__dirname, '.generator-plugin-'))
  roots.push(root)
  await mkdir(path.join(root, 'routes'))
  await writeFile(path.join(root, 'routes/__root.tsx'), rootRoute)
  await writeFile(path.join(root, 'routes/bad[%].tsx'), badRoute)
  const plugin = createRouterGeneratorPlugin(
    {
      target: 'react',
      routesDirectory: './routes',
      generatedRouteTree: './routeTree.gen.ts',
      disableLogging: true,
    },
    createRouterPluginContext(),
  ) as UnpluginOptions
  const hook = plugin.vite!.configResolved!
  const handler = typeof hook === 'function' ? hook : hook.handler
  return handler.call({} as never, { root, command } as never)
}

describe('route generation errors', () => {
  it('a dev server reports a disallowed escaped character and keeps running', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(configureGenerator('serve')).resolves.toBeUndefined()
    expect(error).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: expect.stringContaining(disallowed),
      }),
    )
  })

  it('a build fails on a disallowed escaped character', async () => {
    await expect(configureGenerator('build')).rejects.toThrow(disallowed)
  })

  it('a Vite build of the app fails', async () => {
    await expect(
      buildAndRun(indexRoute, 'return null', {
        files: { 'routes/bad[%].tsx': badRoute },
      }),
    ).rejects.toThrow(disallowed)
  })
})
