/**
 * Slow-tier half of this suite: real builds, the route's loader run and its
 * component mounted in a DOM. A split option assigning a module `let` that
 * another split option reads: the two chunks cannot each hold a copy (the
 * reader would see its own copy, never the write), so the writing option
 * stays in the route module and the reader's chunk imports the one binding
 * from there. The page shows what the unsplit route shows. (`main` fails
 * these builds: the writing chunk assigns the shared module's import.)
 */
import { describe, expect, test } from 'vitest'
import { build, clientMountEntry, head, routeApp } from '../build-harness'

const timeout = 120_000

type Grouping = Array<Array<'loader' | 'component'>>

/** The two ways to put the loader and the component in groups of their own. */
const groupings: Array<[string, { plugin?: Grouping; inFile?: string }]> = [
  ['the plugin option', { plugin: [['loader'], ['component']] }],
  [
    "the route's `codeSplitGroupings`",
    { inFile: `  codeSplitGroupings: [['component'], ['loader']],\n` },
  ],
]

const route = (options: string, inFile = '') =>
  `${head}let count = 0
export const Route = createFileRoute('/')({
${options}
${inFile}})
`

async function run(
  bundler: 'vite' | 'rspack',
  code: string,
  plugin: Grouping | undefined,
  /** Run in the page: the loader first, or the component first. */
  order: 'loader-first' | 'component-first',
) {
  const app = await build({
    bundler,
    env: 'client',
    minify: false,
    ...(plugin && {
      pluginOptions: { codeSplittingOptions: { defaultBehavior: plugin } },
    }),
    files: routeApp(code, {
      env: 'client',
      files: { 'entry.ts': clientMountEntry },
    }),
  })
  try {
    const loader = `const l = entry.Route.options.loader
const load = typeof l === 'function' ? l : l.handler`
    const { result, html } = await app.run(
      order === 'loader-first'
        ? `${loader}
const data = await load({})
await entry.mount(entry.Route.options.component)
return data`
        : `${loader}
await entry.mount(entry.Route.options.component)
return await load({})`,
    )
    return { data: result, text: (html as string).replace(/<[^>]*>/g, '') }
  } finally {
    await app.dispose()
  }
}

describe.each(['vite', 'rspack'] as const)('a %s build', (bundler) => {
  describe.each(groupings)('grouped by %s', (_, { plugin, inFile }) => {
    test(
      'shows the count a split loader updates in the split component',
      async () => {
        const r = await run(
          bundler,
          route(
            `  loader: () => 'data ' + count++,
  component: () => <p>MARK_PAGE c{count}</p>,`,
            inFile,
          ),
          plugin,
          'loader-first',
        )
        expect(r).toEqual({ data: 'data 0', text: 'MARK_PAGE c1' })
      },
      timeout,
    )

    test(
      'returns from a split loader the count the split component updates',
      async () => {
        const r = await run(
          bundler,
          route(
            `  loader: () => 'data ' + count,
  component: () => {
    count++
    return <p>MARK_PAGE c{count}</p>
  },`,
            inFile,
          ),
          plugin,
          'component-first',
        )
        expect(r).toEqual({ data: 'data 1', text: 'MARK_PAGE c1' })
      },
      timeout,
    )

    test(
      "shows the count an object loader's split handler updates in the split component",
      async () => {
        const r = await run(
          bundler,
          route(
            `  loader: { handler: () => 'data ' + count++, staleReloadMode: 'blocking' },
  component: () => <p>MARK_PAGE c{count}</p>,`,
            inFile,
          ),
          plugin,
          'loader-first',
        )
        expect(r).toEqual({ data: 'data 0', text: 'MARK_PAGE c1' })
      },
      timeout,
    )
  })
})
