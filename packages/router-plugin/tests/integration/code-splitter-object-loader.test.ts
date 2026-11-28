/**
 * A loader in object form (`loader: { handler, staleReloadMode }`, #8753)
 * with the loader split: its handler, and what only the handler reads, load
 * with the loader's chunk, as a function-valued loader's would; the object
 * and its other keys stay with the route, so the router reads them when the
 * route loads; the handler returns the route's data. Real production client
 * builds, one app holding every shape (one route each), per framework and
 * bundler; a handler shape the rule leaves in the route module keeps
 * working there.
 */
import { describe, expect, test } from 'vitest'
import { build, rootRouteOf, routeHead } from '../build-harness'
import type { Bundler } from '@tanstack/compiler-test-utils/build-harness'
import type { Framework } from '../build-harness'

/** Each route's loader, with what the route file declares before the route. */
interface Shape {
  loader: string
  declarations?: string
}

const shapes: Record<string, Shape> = {
  arrow: {
    loader: `{
    staleReloadMode: 'blocking',
    handler: async () => heavy('MARK_HANDLER_arrow'),
  }`,
  },
  method: {
    loader: `{
    async handler() {
      return heavy('MARK_HANDLER_method')
    },
    staleReloadMode: 'blocking',
  }`,
  },
  local: {
    declarations: `function load() {
  return heavy('MARK_HANDLER_local')
}
`,
    loader: `{ handler: load, staleReloadMode: 'blocking' }`,
  },
  shorthand: {
    declarations: `const handler = () => heavy('MARK_HANDLER_shorthand')
`,
    loader: `{ handler, staleReloadMode: 'blocking' }`,
  },
  imported: {
    declarations: `import { load } from '../load-imported'
`,
    loader: `{ handler: load, staleReloadMode: 'blocking' }`,
  },
  cast: {
    loader: `{
    handler: () => heavy('MARK_HANDLER_cast'),
    staleReloadMode: 'blocking',
  } as const`,
  },
  // the handler and another key read one binding: one instance, which the
  // route module keeps for `staleReloadMode`
  shared: {
    declarations: `const settings = {
  mode: 'blocking' as const,
  inits: ((globalThis as any).__settingsInits = ((globalThis as any).__settingsInits ?? 0) + 1),
}
`,
    loader: `{
    handler: () => heavy('MARK_HANDLER_shared ' + settings.inits),
    staleReloadMode: settings.mode,
  }`,
  },
}

/** Shapes outside the rule: the loader stays in the route module, and works there. */
const unsplit: Record<string, Shape> = {
  // a spread after the handler may replace it
  spread: {
    loader: `{
    handler: () => heavy('MARK_HANDLER_spread'),
    ...{ staleReloadMode: 'blocking' as const },
  }`,
  },
  // a getter is no value the chunk can hold
  getter: {
    loader: `{
    get handler() {
      return () => heavy('MARK_HANDLER_getter')
    },
    staleReloadMode: 'blocking',
  }`,
  },
  // the object is not written in the route options
  byName: {
    declarations: `const loaderObject = {
  handler: () => heavy('MARK_HANDLER_byName'),
  staleReloadMode: 'blocking' as const,
}
`,
    loader: 'loaderObject',
  },
}

const names = [...Object.keys(shapes), ...Object.keys(unsplit)]

function routeFile(framework: Framework, name: string): string {
  const { loader, declarations = '' } = shapes[name] ?? unsplit[name]!
  const heavyImport =
    name === 'imported' ? '' : `import { heavy } from '../heavy-${name}'\n`
  return `${routeHead(framework)}${heavyImport}${declarations}export const Route = createFileRoute('/${name}')({
  loader: ${loader},
  component: () => null,
})
`
}

function appFiles(framework: Framework): Record<string, string> {
  const files: Record<string, string> = {
    'routes/__root.tsx': rootRouteOf(framework),
    'entry.ts': names
      .map((name) => `export { Route as ${name} } from './routes/${name}'\n`)
      .join(''),
    'load-imported.ts': `import { heavy } from './heavy-imported'
export function load() {
  return heavy('MARK_HANDLER_imported')
}
`,
  }
  for (const name of names) {
    files[`routes/${name}.tsx`] = routeFile(framework, name)
    files[`heavy-${name}.ts`] =
      `export const heavy = (from: string) => 'MARK_HEAVY_${name} ' + from\n`
  }
  return files
}

const builds: Array<{ bundler: Bundler; framework: Framework }> = [
  { bundler: 'vite', framework: 'react' },
  { bundler: 'vite', framework: 'solid' },
  { bundler: 'rspack', framework: 'react' },
]

describe.each(builds)('$bundler, $framework', ({ bundler, framework }) => {
  test('a split object-form loader loads its handler with the loader chunk and keeps its other keys', async () => {
    const app = await build({
      bundler,
      framework,
      env: 'client',
      pluginOptions: {
        codeSplittingOptions: {
          defaultBehavior: [['loader'], ['component']],
        },
      },
      files: appFiles(framework),
    })
    const placement = (marker: string) =>
      Object.fromEntries(
        Object.keys(shapes).map((name) => [
          name,
          app.where(`${marker}_${name}`),
        ]),
      )
    expect(placement('MARK_HANDLER')).toEqual(
      Object.fromEntries(Object.keys(shapes).map((name) => [name, 'lazy'])),
    )
    expect(placement('MARK_HEAVY')).toEqual(
      Object.fromEntries(Object.keys(shapes).map((name) => [name, 'lazy'])),
    )
    const run = await app.run(`const out = {}
for (const name of ${JSON.stringify(names)}) {
  const loader = entry[name].options.loader
  out[name] = {
    staleReloadMode: loader.staleReloadMode,
    data: await loader.handler({ params: {} }),
  }
}
return { loaded: out, settingsInits: globalThis.__settingsInits }`)
    expect(run.result).toEqual({
      loaded: Object.fromEntries(
        names.map((name) => [
          name,
          {
            staleReloadMode: 'blocking',
            data: `MARK_HEAVY_${name} MARK_HANDLER_${name}${name === 'shared' ? ' 1' : ''}`,
          },
        ]),
      ),
      settingsInits: 1,
    })
  })
})
