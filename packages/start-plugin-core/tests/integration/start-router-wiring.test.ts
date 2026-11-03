/**
 * The router options of a Start app reach the route generator and the code
 * splitter the way they reach a router app's, in real builds and dev servers
 * of Start's Vite and Rsbuild plugins (`start-app.ts`).
 */
import { describe, expect, test } from 'vitest'
import {
  appFiles,
  buildStartApp,
  createStartApp,
  startViteDevServer,
  until,
} from './start-app'
import type { GeneratorPlugin } from '@tanstack/router-generator'

const timeout = 60_000

const head = `import { createFileRoute } from '@tanstack/react-router'\n`

describe.each(['vite', 'rsbuild'] as const)('%s build', (bundler) => {
  // #7768: Start's own generator plugins replaced the app's.
  test(
    'generator plugins of router.plugins see the route tree',
    async () => {
      const seen = new Set<string>()
      const probe: GeneratorPlugin = {
        name: 'probe',
        onRouteTreeChanged: ({ routeNodes }) => {
          for (const node of routeNodes) {
            seen.add(node.routePath ?? '')
          }
        },
      }
      const app = await createStartApp(
        appFiles({
          'src/routes/about.tsx': `${head}export const Route = createFileRoute('/about')({ component: () => 'MARK_ABOUT' })\n`,
        }),
      )
      const build = await buildStartApp(app, bundler, {
        router: { plugins: [probe] },
      })
      // (Start's own generator plugins still run: the app builds with its route)
      expect(build.client).toContain('MARK_ABOUT')
      expect([...seen]).toEqual(['/about'])
    },
    timeout,
  )

  // The server build erases the options `codeSplittingOptions.deleteNodes`
  // names; the client build erases Start's server-only options instead.
  // Start's Rsbuild plugin dropped the option for the server.
  test(
    'router.codeSplittingOptions.deleteNodes: the server build erases the options, the client build keeps them',
    async () => {
      const app = await createStartApp(
        appFiles({
          'src/routes/index.tsx': `${head}export const Route = createFileRoute('/')({
  staticData: { marker: 'MARK_STATIC' },
  component: () => 'MARK_COMPONENT',
})
`,
        }),
      )
      const build = await buildStartApp(app, bundler, {
        router: { codeSplittingOptions: { deleteNodes: ['staticData'] } },
      })
      expect({
        client: build.client.includes('MARK_STATIC'),
        server: build.server.includes('MARK_STATIC'),
      }).toEqual({ client: true, server: false })
      expect(build.server).toContain('MARK_COMPONENT')
    },
    timeout,
  )
})

describe('vite build', () => {
  const routes = {
    'src/routes/index.tsx': `${head}export const Route = createFileRoute('/')({ component: () => 'MARK_INDEX' })\n`,
    'src/routes/api.tsx': `${head}export const Route = createFileRoute('/api')({ server: { handlers: { GET: () => new Response('MARK_API') } } })\n`,
  }

  // #8839: the client route tree was matched with
  // `new RegExp(<path of the route tree>)`, the path unescaped.
  test(
    'of an app whose path has characters a regular expression reads: the client route tree leaves out the server-only route',
    async () => {
      const app = await createStartApp(
        appFiles(routes),
        'start-app my app (2)+-',
      )
      const build = await buildStartApp(app, 'vite')
      expect(build.client).toContain('MARK_INDEX')
      expect(build.client).not.toMatch(/["'`]\/api["'`]/)
      expect(build.server).toMatch(/["'`]\/api["'`]/)
    },
    timeout,
  )

  // The same unescaped expression: its `.` before `gen` matches any
  // character, so the app's `src/routeTree-gen.ts` got the client route tree.
  test(
    'of an app with a file named one character away from the route tree: the client gets the file',
    async () => {
      const app = await createStartApp(
        appFiles({
          ...routes,
          'src/routeTree-gen.ts': `export const sibling = 'MARK_SIBLING'\n`,
          'src/routes/index.tsx': `${head}import { sibling } from '../routeTree-gen'
export const Route = createFileRoute('/')({ staticData: { sibling } })
`,
        }),
      )
      const build = await buildStartApp(app, 'vite')
      expect(build.client).toContain('MARK_SIBLING')
    },
    timeout,
  )
})

describe('vite dev', () => {
  test(
    'a function-form routeTreeFileFooter gives its current lines at every print of the route tree',
    async () => {
      let line = 'MARK_FOOTER_FIRST'
      const app = await createStartApp(appFiles())
      await startViteDevServer(app, {
        router: { routeTreeFileFooter: () => [`// ${line}`] },
      })
      const tree = () => app.read('src/routeTree.gen.ts').catch(() => '')
      await until(
        async () => (await tree()).includes('MARK_FOOTER_FIRST'),
        'the first route tree',
      )
      line = 'MARK_FOOTER_NEXT'
      await app.write({
        'src/routes/later.tsx': `${head}export const Route = createFileRoute('/later')({})\n`,
      })
      await until(
        async () => (await tree()).includes(`'/later'`),
        'the route tree with /later',
      )
      expect(await tree()).toContain('// MARK_FOOTER_NEXT')
    },
    timeout,
  )
})
