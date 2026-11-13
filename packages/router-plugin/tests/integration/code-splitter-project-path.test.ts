/**
 * The project's path (SPEC §2.1, J2.15, G1): an app under a directory whose
 * name carries characters a project path may (`#` as in `C#` or `project
 * #2`, `%`, spaces, parentheses, non-ASCII) is code-split like any other
 * app, in every bundler's build. A `#` matters most: read as a URL fragment,
 * every route module of the app silently stays unsplit (nothing fails, the
 * app only ships everything eagerly).
 */
import { expect, test } from 'vitest'
import { build, head, rootRoute, ssrRenderEntry } from '../build-harness'

type BundlerName = 'vite' | 'rspack' | 'webpack'

// the split component reads `Route`: its chunk imports the route module itself
const route = `${head}function Page() {
  return <p>{'MARK_COMPONENT ' + typeof Route}</p>
}
export const Route = createFileRoute('/')({
  loader: () => 'MARK_LOADER',
  component: Page,
})
`

/** Builds the app under a directory named with `prefix` and returns what the build placed where, and the render. */
async function buildUnder(bundler: BundlerName, prefix: string) {
  const app = await build({
    bundler,
    env: 'ssr',
    minify: false,
    prefix,
    files: {
      'routes/__root.tsx': rootRoute,
      'routes/index.tsx': route,
      'entry.ts': ssrRenderEntry,
    },
    // the harness's entry is an absolute path; a `!` in it would read as
    // loader syntax, so name it relative to the context, as an app does
    configure:
      bundler === 'vite'
        ? undefined
        : (options) => {
            options.entry = { entry: './entry.ts' }
          },
  })
  const run = await app.run(
    `return [await entry.render(entry.Route.options.component), await entry.Route.options.loader({})]`,
  )
  return {
    root: app.root,
    component: app.where('MARK_COMPONENT'),
    rendered: run.result,
  }
}

const all = ['vite', 'rspack', 'webpack'] as const
const directories: Array<{
  name: string
  prefix: string
  bundlers?: ReadonlyArray<BundlerName>
}> = [
  { name: 'a # (C#, project #2)', prefix: '.project-path-C# project #2-' },
  { name: 'a %', prefix: '.project-path-100%-' },
  {
    name: 'spaces, parentheses and non-ASCII',
    prefix: '.project-path-café 日本語 (2)+-',
  },
  // a `!` separates loaders in a webpack-family request; webpack refuses
  // such a `context` in its configuration schema, Rspack builds it
  {
    name: 'a !',
    prefix: '.project-path-my!app-',
    bundlers: ['vite', 'rspack'],
  },
]

test.each(
  directories.flatMap(({ name, prefix, bundlers = all }) =>
    bundlers.map((bundler) => ({
      name,
      prefix,
      bundler,
    })),
  ),
)(
  'an app under a directory with $name is code-split and renders ($bundler)',
  async ({ prefix, bundler }) => {
    const result = await buildUnder(bundler, prefix)
    expect(result.root).toContain(prefix.slice(1, -1))
    expect(result).toMatchObject({
      component: 'lazy',
      rendered: ['<p>MARK_COMPONENT object</p>', 'MARK_LOADER'],
    })
  },
  120_000,
)
