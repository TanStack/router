import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'vite'
import { describe, expect, it } from 'vitest'
import { tanstackRouter } from '../src/vite'

describe.each([true, false])(
  'React HMR with autoCodeSplitting=%s',
  (autoCodeSplitting) => {
    it.each([
      [
        'function',
        'export function component() { return null }',
        'component',
        'component',
      ],
      [
        'overloaded function',
        'export function component(): null; export function component() { return null }',
        'component',
        'component',
      ],
      [
        'shared function',
        'export function component() { return null }',
        'component',
        'component, errorComponent: component',
      ],
      [
        'variable',
        'export const component = () => null',
        'component',
        'component',
      ],
      ['class', 'export class component {}', 'component', 'component'],
      [
        'multiple variables',
        'export const component = () => null, pendingComponent = () => null',
        'component',
        'component, pendingComponent',
      ],
      [
        'explicit alias',
        'function component() { return null }; export { component as View }',
        'View',
        'component',
      ],
      [
        'default',
        'export default function component() { return null }',
        'default',
        'component',
      ],
    ])(
      'preserves the %s component export with React HMR',
      async (_, declaration, exportName, routeOptions) => {
        const root = await mkdtemp(path.join(__dirname, '.hmr-exports-'))
        let server: Awaited<ReturnType<typeof createServer>> | undefined
        try {
          await mkdir(path.join(root, 'routes'))
          await writeFile(
            path.join(root, 'routes/__root.tsx'),
            `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})`,
          )
          await writeFile(
            path.join(root, 'routes/page.tsx'),
            `import { createFileRoute } from '@tanstack/react-router'
${declaration}
export function helper(value: string): string
export function helper(value: number): number
export function helper(value: string | number) { return value }
export { helper as helperAlias }
export const Route = createFileRoute('/page')({
  ${routeOptions},
  beforeLoad: () => helper('before'),
  loader: () => helper(42),
})`,
          )
          server = await createServer({
            root,
            configFile: false,
            logLevel: 'silent',
            plugins: [
              tanstackRouter({
                target: 'react',
                autoCodeSplitting,
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
          const transformed = await server.transformRequest('/routes/page.tsx')
          expect(transformed?.code).toContain('TSRFastRefreshAnchor')
          const routeModule = await server.ssrLoadModule('/routes/page.tsx')
          expect(routeModule).toHaveProperty(exportName)
          expect(routeModule[exportName]).toBe(
            routeModule.Route.options.component,
          )
          expect(routeModule.helperAlias).toBe(routeModule.helper)
          expect(routeModule.Route.options.beforeLoad()).toBe('before')
          expect(await routeModule.Route.options.loader()).toBe(42)
          if (routeOptions.includes('pendingComponent')) {
            expect(routeModule.pendingComponent).toBe(
              routeModule.Route.options.pendingComponent,
            )
          }
        } finally {
          await server?.close()
          await rm(root, { recursive: true, force: true })
        }
      },
      30_000,
    )
  },
)
