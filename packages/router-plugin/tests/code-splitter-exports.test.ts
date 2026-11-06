import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'vite'
import { describe, expect, it } from 'vitest'
import { tanstackRouter } from '../src/vite'

// Loads a route file through the Vite dev pipeline with automatic code
// splitting on, then hands the module to the assertions while the server is
// still up, so lazy route options can import their split chunks.
async function withSplitRoute(
  routeSource: string,
  assert: (routeModule: Record<string, any>) => Promise<void> | void,
) {
  const root = await mkdtemp(path.join(__dirname, '.split-exports-'))
  let server: Awaited<ReturnType<typeof createServer>> | undefined
  try {
    await mkdir(path.join(root, 'routes'))
    await writeFile(
      path.join(root, 'routes/__root.tsx'),
      `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})`,
    )
    await writeFile(path.join(root, 'routes/page.tsx'), routeSource)
    server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [
        tanstackRouter({
          target: 'react',
          autoCodeSplitting: true,
          codeSplittingOptions: {
            defaultBehavior: [['component'], ['loader']],
          },
          routesDirectory: './routes',
          generatedRouteTree: './routeTree.gen.ts',
        }),
      ],
      server: { middlewareMode: true },
      appType: 'custom',
    })
    await assert(await server.ssrLoadModule('/routes/page.tsx'))
  } finally {
    await server?.close()
    await rm(root, { recursive: true, force: true })
  }
}

describe('route exports under automatic code splitting', () => {
  it('keeps a shared function with overload signatures importable and aliased', async () => {
    await withSplitRoute(
      `
import { createFileRoute } from '@tanstack/react-router'
export function helper(value: string): string
export function helper(value: number): number
export function helper(value: string | number) { return value }
export { helper as helperAlias }
export const Route = createFileRoute('/page')({
  component: () => null,
  beforeLoad: () => helper('before'),
  loader: () => helper(42),
})`,
      async (routeModule) => {
        expect(routeModule.helper).toBeTypeOf('function')
        expect(routeModule.helperAlias).toBe(routeModule.helper)
        expect(routeModule.Route.options.beforeLoad()).toBe('before')
        expect(await routeModule.Route.options.loader()).toBe(42)
      },
    )
  }, 30_000)

  it('retains an exported class component', async () => {
    await withSplitRoute(
      `
import { createFileRoute } from '@tanstack/react-router'
export class Layout { render() { return null } }
export const Route = createFileRoute('/page')({
  component: Layout,
})`,
      async (routeModule) => {
        expect(routeModule.Layout).toBeTypeOf('function')
        expect(routeModule.Route.options.component).toBe(routeModule.Layout)
      },
    )
  }, 30_000)

  it('retains route options exported under an alias', async () => {
    await withSplitRoute(
      `
import { createFileRoute } from '@tanstack/react-router'
function Layout() { return null }
function loadLayout() { return 'loaded' }
export { Layout as View, loadLayout as load }
export const Route = createFileRoute('/page')({
  component: Layout,
  loader: loadLayout,
})`,
      async (routeModule) => {
        expect(routeModule.View).toBeTypeOf('function')
        expect(routeModule.Route.options.component).toBe(routeModule.View)
        expect(routeModule.load).toBeTypeOf('function')
        expect(routeModule.Route.options.loader).toBe(routeModule.load)
        expect(routeModule.load()).toBe('loaded')
      },
    )
  }, 30_000)
})
