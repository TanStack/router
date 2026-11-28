/**
 * Start's Rsbuild host on the persistent cache: what a compilation that
 * restores its modules builds again, and a dev server restarted on a cache a
 * dev session wrote.
 *
 * A compilation whose inputs are the ones its modules were built from
 * builds nothing: the modules Start generates (the client's route tree,
 * the server-function resolver, the Start manifest) are as current as the
 * content they were built from, whichever process built them (rule 3 of the
 * Rsbuild host).
 * Source: hotspot 3 design study (design-hotspot3-fable.md, gates G1, G2;
 * the handler-removal fixture of the node_modules policy review, round 4).
 */
import { describe, expect, test } from 'vitest'
import { buildStart } from '../../build-start'
import { startRsbuildStartDevServer } from '../../rsbuild-dev-server'
import { rsbuildEntries } from '../route-css-cases'
import type { RsbuildPlugin } from '@rsbuild/core'

const timeout = 120_000

/**
 * The modules each compilation builds once its `finishMake` began (what a
 * plugin builds again in place: Rspack's own builds are done by then), by
 * file name, of the compilations since the last `take`.
 */
function lateBuilds() {
  const built: Array<string> = []
  const plugin: RsbuildPlugin = {
    name: 'test:late-builds',
    setup(api) {
      api.onAfterCreateCompiler(({ compiler }) => {
        const all = 'compilers' in compiler ? compiler.compilers : [compiler]
        for (const one of all) {
          one.hooks.thisCompilation.tap('test:late-builds', (compilation) => {
            let late = false
            one.hooks.finishMake.tap(
              { name: 'test:late-builds', stage: -100_000 },
              (finishing) => {
                if (finishing === compilation) {
                  late = true
                }
              },
            )
            compilation.hooks.buildModule.tap('test:late-builds', (module) => {
              if (late) {
                const resource = (module as { resource?: string }).resource
                built.push(
                  `${one.name}: ${(resource ?? module.identifier()).split(/[\\/]/).pop()}`,
                )
              }
            })
          })
        }
      })
    },
  }
  return { plugin, take: () => built.splice(0) }
}

const routes = {
  ...rsbuildEntries,
  'src/routes/__root.tsx': `import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
`,
  'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(async () => 'MARK_GREET')
`,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { greet } from '../fns'
export const Route = createFileRoute('/')({
  loader: () => greet(),
  component: () => <p>MARK_INDEX</p>,
})
`,
}

describe('rsbuild on the persistent cache, unchanged sources', () => {
  // G1. On head: the client builds its route tree module again and the
  // server its server-function resolver, in every process.
  test(
    'a build on the cache builds no module again',
    async () => {
      const late = lateBuilds()
      const cold = await buildStart({
        bundler: 'rsbuild',
        rsbuildConfig: {
          plugins: [late.plugin],
          performance: { buildCache: true },
        },
        files: routes,
      })
      late.take()
      await cold.rebuild({})
      expect(late.take()).toEqual([])
    },
    timeout,
  )

  // G1 (dev). On head: the route tree, the resolver and the manifest.
  test(
    'a dev server restarted on the cache builds no module again',
    async () => {
      const late = lateBuilds()
      const first = await startRsbuildStartDevServer({
        config: { plugins: [late.plugin], performance: { buildCache: true } },
        files: routes,
      })
      await first.settle()
      await first.stop()
      late.take()
      const server = await first.restart()
      await server.settle()
      expect(late.take()).toEqual([])
    },
    timeout,
  )
})

describe('rsbuild dev on a cache a dev session wrote', () => {
  // G2 (dev): the same edits in a dev server, stopped and started again.
  test(
    'a dev server removes an import, then edits a route: a dev server restarted on the cache compiles',
    async () => {
      const index = `import { createFileRoute } from '@tanstack/react-router'
import { greet } from '../fns'
import { dep } from '../dep'
export const Route = createFileRoute('/')({
  loader: () => greet(),
  component: () => <p>MARK_INDEX{String(dep)}</p>,
})
`
      const first = await startRsbuildStartDevServer({
        config: { performance: { buildCache: true } },
        files: {
          ...routes,
          'src/dep.ts': `import { z } from 'zod'\nexport const dep = z.string().describe('MARK_ZOD')\n`,
          'src/routes/index.tsx': index,
        },
      })
      await first.settle()
      await first.edit({ 'src/dep.ts': `export const dep = 'MARK_PLAIN'\n` })
      await first.edit({ 'src/routes/index.tsx': `${index}// edited\n` })
      expect(first.errors).toEqual([])
      await first.stop()
      const server = await first.restart()
      await server.settle()
      expect(server.errors).toEqual([])
    },
    timeout,
  )
})
