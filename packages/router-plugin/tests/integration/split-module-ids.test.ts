/**
 * The ids of split modules and the specifiers that import them keep the
 * format of the Babel splitter (main), as an app's build configuration
 * reads them: a compatibility surface, not the freedom of SPEC §5.3. Apps
 * name their webpack and Rspack chunks from `chunkGroup.origins[].request`
 * (`/routes/<file>.tsx?tsr-split=<a>---<b>`) and their Vite chunks from
 * module ids (`manualChunks`), with the default groupings and with
 * `codeSplitGroupings`. A split group's `import()` specifier is the route
 * file's absolute path (forward slashes) with `?tsr-split=` and the group's
 * options sorted and joined by `---`; the modules main had no counterpart
 * for (code several groups share, an extracted export) are named in the
 * same style. Each route file is one module, however its outputs import it.
 * Runs in the integration smoke set (Windows: `C:\` paths).
 */
import { afterAll, describe, expect, test } from 'vitest'
import { build, rootRoute } from '../build-harness'
import { tanstackRouter } from '../../src/vite'
import type { BuildResult } from '@tanstack/compiler-test-utils/build-harness'
import type { Plugin } from 'vite'
import type { RouterPluginOptions } from '../build-harness'

const timeout = 120_000

const head = `import { createFileRoute } from '@tanstack/react-router'\n`

const files = {
  'routes/__root.tsx': rootRoute,
  // the default groupings; the component and the error component share
  // module state (one module for both), and the component reads the route
  'routes/posts.tsx': `${head}const store = { hits: 0 }
export const Route = createFileRoute('/posts')({
  loader: () => ({ n: 1 }),
  component: () => {
    store.hits++
    return <div>posts {store.hits} {Route.useLoaderData().n}</div>
  },
  errorComponent: () => <div>error {store.hits}</div>,
  notFoundComponent: () => <div>not found</div>,
})
`,
  'routes/grouped.tsx': `${head}export const Route = createFileRoute('/grouped')({
  codeSplitGroupings: [['loader', 'component'], ['errorComponent', 'pendingComponent']],
  loader: () => ({ n: 2 }),
  component: () => <div>grouped</div>,
  errorComponent: () => <div>grouped error</div>,
  pendingComponent: () => <div>grouped pending</div>,
})
`,
  // an exported component the split component reads and another module imports
  'routes/exported.tsx': `${head}export function Card() {
  return <b>card</b>
}
export const Route = createFileRoute('/exported')({ component: Card })
`,
  'routes/index.tsx': `${head}import { Card } from './exported'
export const Route = createFileRoute('/')({ component: () => <Card /> })
`,
  'entry.ts': `export { Route as root } from './routes/__root'
export { Route as posts } from './routes/posts'
export { Route as grouped } from './routes/grouped'
export { Route as exported } from './routes/exported'
export { Route as index } from './routes/index'
`,
}

/** The route files' split modules, by bundler (`<routes>` is the routes directory, forward slashes). */
const splitGroups = {
  default: [
    '<routes>/exported.tsx?tsr-split=component',
    '<routes>/grouped.tsx?tsr-split=component---loader',
    '<routes>/grouped.tsx?tsr-split=errorComponent---pendingComponent',
    '<routes>/index.tsx?tsr-split=component',
    '<routes>/posts.tsx?tsr-split=component',
    '<routes>/posts.tsx?tsr-split=errorComponent',
    '<routes>/posts.tsx?tsr-split=notFoundComponent',
  ],
  // the plugin's `defaultBehavior` (the route's own groupings win)
  defaultBehavior: [
    '<routes>/exported.tsx?tsr-split=component---loader',
    '<routes>/grouped.tsx?tsr-split=component---loader',
    '<routes>/grouped.tsx?tsr-split=errorComponent---pendingComponent',
    '<routes>/index.tsx?tsr-split=component---loader',
    '<routes>/posts.tsx?tsr-split=component---loader',
    '<routes>/posts.tsx?tsr-split=errorComponent---notFoundComponent',
  ],
}

/** The other route-file modules each configuration has (static imports: no chunk origin). */
const otherModules = {
  default: [
    '<routes>/exported.tsx?tsr-split=export---Card',
    '<routes>/posts.tsx?tsr-split=shared---component---errorComponent',
  ],
  defaultBehavior: [
    '<routes>/exported.tsx?tsr-split=export---Card',
    '<routes>/posts.tsx?tsr-split=shared---component---errorComponent---loader---notFoundComponent',
  ],
}

const routeFiles = [
  '<routes>/__root.tsx',
  '<routes>/exported.tsx',
  '<routes>/grouped.tsx',
  '<routes>/index.tsx',
  '<routes>/posts.tsx',
]

const configurations: Record<
  keyof typeof splitGroups,
  RouterPluginOptions | undefined
> = {
  default: undefined,
  defaultBehavior: {
    codeSplittingOptions: {
      defaultBehavior: [
        ['loader', 'component'],
        ['errorComponent', 'notFoundComponent'],
      ],
    },
  },
}

/** A chunk name an app derives from a chunk group's request (the webpack-family convention reported to us). */
const chunkNameOf = (request: string) => {
  const match = /\/routes\/(.+)\.tsx\?tsr-split=(.+)$/.exec(request)
  return match ? `${match[1]}-${match[2]!.split('---').join('-')}` : null
}

interface StatsModule {
  name?: string
  identifier?: string
  nameForCondition?: string
  modules?: Array<StatsModule>
}
interface StatsJson {
  chunks?: Array<{ initial?: boolean; origins?: Array<{ request?: string }> }>
  modules?: Array<StatsModule>
}

interface Ids {
  /** The requests of the lazy chunk groups (webpack, Rspack), or the facades of the dynamic entries (Vite). */
  requests: Array<string>
  /** The ids of the route files' modules (Vite) or their `nameForCondition` + query (webpack, Rspack). */
  modules: Array<string>
  /** webpack, Rspack: the readable module names (`./routes/posts.tsx?tsr-split=component`). */
  names: Array<string>
  root: string
}

const sorted = (values: Iterable<string>) => [...new Set(values)].sort()

async function webpackIds(
  bundler: 'rspack' | 'webpack',
  pluginOptions: RouterPluginOptions | undefined,
): Promise<{ app: BuildResult; ids: Ids }> {
  let json: StatsJson | undefined
  const app = await build({
    bundler,
    env: 'client',
    minify: false,
    files,
    pluginOptions,
    configure: (options) => {
      // every module listed on its own (a concatenated module lists its
      // members only on webpack)
      options.optimization = {
        ...(options.optimization as object),
        concatenateModules: false,
      }
      ;(options.plugins as Array<unknown>).push({
        apply(compiler: {
          hooks: {
            done: {
              tap: (
                name: string,
                fn: (stats: { toJson: (o: object) => StatsJson }) => void,
              ) => void
            }
          }
        }) {
          compiler.hooks.done.tap('test:split-module-ids', (stats) => {
            json = stats.toJson({
              all: false,
              chunks: true,
              chunkOrigins: true,
              modules: true,
              nestedModules: true,
              ids: true,
            })
          })
        },
      })
    },
  })
  const flat: Array<StatsModule> = []
  const visit = (list: Array<StatsModule> | undefined) => {
    for (const m of list ?? []) {
      flat.push(m)
      visit(m.modules)
    }
  }
  visit(json!.modules)
  const routes = flat.filter((m) =>
    /[\\/]routes[\\/]/.test(m.nameForCondition ?? ''),
  )
  return {
    app,
    ids: {
      root: app.root,
      requests: sorted(
        json!.chunks!.filter((c) => !c.initial).flatMap((c) =>
          (c.origins ?? []).map((o) => o.request!),
        ),
      ),
      modules: routes.map((m) => {
        const query = m.name!.indexOf('?')
        return (
          m.nameForCondition!.replace(/\\/g, '/') +
          (query === -1 ? '' : m.name!.slice(query))
        )
      }),
      names: sorted(routes.map((m) => m.name!)),
    },
  }
}

async function viteIds(
  pluginOptions: RouterPluginOptions | undefined,
): Promise<{ app: BuildResult; ids: Ids }> {
  const modules: Array<string> = []
  const requests: Array<string> = []
  const observe: Plugin = {
    name: 'test:split-module-ids',
    generateBundle(_options, bundle) {
      for (const id of this.getModuleIds()) {
        if (/\/routes\//.test(id)) {
          modules.push(id)
        }
      }
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk' && chunk.isDynamicEntry) {
          requests.push(chunk.facadeModuleId!)
        }
      }
    },
  }
  const app = await build({
    bundler: 'vite',
    env: 'client',
    minify: false,
    files,
    pluginOptions,
    routerPlugins: (config) => [tanstackRouter(config), observe],
  })
  return {
    app,
    ids: { root: app.root, requests: sorted(requests), modules, names: [] },
  }
}

const routesOf = (root: string) => `${root.replace(/\\/g, '/')}/routes`
const expand = (root: string, ids: Array<string>) =>
  ids.map((id) => id.replace('<routes>', routesOf(root)))
const relative = (ids: Array<string>) =>
  ids.map((id) => id.replace('<routes>', './routes'))

describe.each(Object.keys(configurations) as Array<keyof typeof splitGroups>)(
  'groupings: %s',
  (configuration) => {
    const pluginOptions = configurations[configuration]
    const groups = splitGroups[configuration]
    const all = sorted([...groups, ...otherModules[configuration]])

    describe.each(['rspack', 'webpack'] as const)('%s', (bundler) => {
      let built: ReturnType<typeof webpackIds> | undefined
      const ids = async () => (await (built ??= webpackIds(bundler, pluginOptions))).ids
      afterAll(async () => {
        await (await built)?.app.dispose()
      })

      test(
        "a split group's chunk origin is the route file's absolute path with main's query",
        async () => {
          const { root, requests } = await ids()
          expect(requests).toEqual(sorted(expand(root, groups)))
          expect(requests.map(chunkNameOf)).not.toContain(null)
        },
        timeout,
      )

      test(
        "the route files' modules are named as main named them, one module per route file",
        async () => {
          const { root, names, modules } = await ids()
          expect(names).toEqual(sorted(relative([...routeFiles, ...all])))
          // one module per id: the route module itself once, whatever imports it
          expect(sorted(modules)).toEqual(
            sorted(expand(root, [...routeFiles, ...all])),
          )
          expect(modules).toHaveLength(routeFiles.length + all.length)
        },
        timeout,
      )
    })

    describe('vite', () => {
      let built: ReturnType<typeof viteIds> | undefined
      const ids = async () => (await (built ??= viteIds(pluginOptions))).ids
      afterAll(async () => {
        await (await built)?.app.dispose()
      })

      test(
        "a split group's chunk facade is the route file's absolute path with main's query",
        async () => {
          const { root, requests } = await ids()
          expect(requests).toEqual(sorted(expand(root, groups)))
        },
        timeout,
      )

      test(
        "the route files' module ids are main's, one module per route file",
        async () => {
          const { root, modules } = await ids()
          expect(sorted(modules)).toEqual(
            sorted(expand(root, [...routeFiles, ...all])),
          )
          expect(modules).toHaveLength(routeFiles.length + all.length)
        },
        timeout,
      )
    })
  },
)
