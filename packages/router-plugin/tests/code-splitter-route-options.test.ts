import { describe, expect, it } from 'vitest'
import {
  buildAndRun,
  compileRouteModules,
  declarationOf,
  expectValidModules,
  exportedNames,
  head,
  importSources,
  importedNames,
} from './regression-helpers'
import type { CodeSplitGroupings } from '../src/core/constants'

describe('route options', () => {
  it('are split when declared in a variable', async () => {
    const { modules } =
      compileRouteModules(`${head}import { fetchPosts } from './api'
function Posts() {
  return <ul>{Route.useLoaderData().length}</ul>
}
const options = {
  loader: () => fetchPosts(),
  component: Posts,
}
export const Route = createFileRoute('/posts')(options)
`)
    expect(modules.reference).toContain('tsr-split=component')
    expect(modules.reference).not.toMatch(declarationOf('Posts'))
    expect(importedNames(modules.reference!, './api')).toEqual(['fetchPosts'])
    const chunk = modules['virtual component']!
    expect(chunk).toMatch(declarationOf('Posts'))
    // The split component reads the Route singleton from the reference module
    expect(importedNames(chunk, 'route.tsx')).toEqual(['Route'])
    expect(importSources(chunk)).not.toContain('./api')
    await expectValidModules(modules)
  })

  it('that repeat a split key are split like the runtime object: the last one wins', async () => {
    const { modules } =
      compileRouteModules(`${head}export const Route = createFileRoute('/')({
  component: () => <div>first-marker</div>,
  component: () => <div>last-marker</div>,
})
`)
    expect(modules['virtual component']).toContain('last-marker')
    expect(modules['virtual component']).not.toContain('first-marker')
    await expectValidModules(modules)
  })
})

describe('split options that read the Route singleton', () => {
  // `Route` stays in the reference module, so reading it from a split option
  // must not attribute every dependency of the route options to that option.
  it.each([
    {
      name: 'an inline arrow component',
      component: `() => <p>{format(Route.useLoaderData().length)}</p>`,
    },
    {
      name: 'an inline named function component',
      component: `function Posts() {
    const { page } = Route.useSearch()
    return <p>{format(page)}</p>
  }`,
    },
  ])(
    'share only what the loader and $name both read',
    async ({ component }) => {
      const { modules, sharedBindings } =
        compileRouteModules(`${head}const format = (value: unknown) => String(value)
const prefix = 'post:'
function fetchPosts() {
  return [prefix + 1]
}
export const Route = createFileRoute('/posts')({
  loader: () => [fetchPosts(), format(0)],
  component: ${component},
})
`)
      expect(sharedBindings).toEqual(['format'])
      expect(modules.reference).toMatch(declarationOf('fetchPosts'))
      expect(modules.reference).toMatch(declarationOf('prefix'))
      await expectValidModules(modules)
    },
  )

  it('do not turn a reassigned loader-only binding into an import', () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}let label = 'initial'
label = 'updated'
export const Route = createFileRoute('/label')({
  loader: () => label,
  component: () => <p>{Route.useLoaderData()}</p>,
})
`)
    expect(sharedBindings).toEqual([])
    // An imported binding is read-only: `label = ...` would throw at runtime
    expect(modules.reference).toMatch(declarationOf('label'))
    expect(importSources(modules.reference!)).toEqual([
      '@tanstack/react-router',
    ])
  })

  it('never share a destructuring whose sibling depends on Route', async () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}const getRoute = () => Route
const [cache, routeGetter] = [new Map(), getRoute]
export const Route = createFileRoute('/')({
  loader: () => cache.size,
  component: () => <div>{cache.size}{typeof routeGetter}</div>,
})
`)
    // Intended trade-off (packages/router-plugin/AGENTS.md): bindings that
    // depend on `Route` are never shared, so each module that reads `cache`
    // creates its own copy.
    expect(sharedBindings).toEqual([])
    await expectValidModules(modules)
  })
})

describe('a loader in object form', () => {
  const groupings: CodeSplitGroupings = [['loader'], ['component']]

  /** Loads `/` with a real router and returns each match's loader data. */
  const routerEntry = `import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export { Route } from './routes/index'
export async function load() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return router.state.matches.map((match) => match.loaderData ?? null)
}`

  it.each([
    { name: 'an arrow handler', handler: `handler: async () => 'loaded'` },
    {
      name: 'a method handler',
      handler: `async handler() {
      return 'loaded'
    }`,
    },
    {
      name: 'an imported handler',
      imports: `import { load } from '../load'\n`,
      handler: `handler: load`,
    },
  ])(
    'loads route data and keeps its options with $name split',
    async ({ imports = '', handler }) => {
      const result = await buildAndRun(
        `${head}${imports}export const Route = createFileRoute('/')({
  loader: {
    staleReloadMode: 'blocking',
    ${handler},
  },
  component: () => <p>index</p>,
})`,
        `return [await entry.load(), entry.Route.options.loader.staleReloadMode]`,
        {
          files: {
            'entry.ts': routerEntry,
            'load.ts': `export const load = async () => 'loaded'`,
          },
          groupings,
        },
      )
      expect(result).toEqual([[null, 'loaded'], 'blocking'])
    },
    30_000,
  )

  it.each([
    {
      name: 'a spread after the handler',
      loader: `{ handler: () => 1, ...defaults }`,
    },
    {
      name: 'a computed key after the handler',
      loader: `{ handler: () => 1, [key]: () => 2 }`,
    },
    { name: 'no handler', loader: `{ ...defaults }` },
    {
      name: 'a getter handler',
      loader: `{ get handler() { return () => 1 } }`,
    },
    {
      name: 'a method handler that uses super',
      loader: `{ handler() { return super.valueOf() } }`,
    },
  ])('stays in the route file with $name', async ({ loader }) => {
    const { modules } = compileRouteModules(
      `${head}import { defaults, key } from './defaults'
export const Route = createFileRoute('/')({
  loader: ${loader},
  component: () => <p>index</p>,
})
`,
      { groupings },
    )
    expect(modules.reference).not.toContain('tsr-split=loader')
    expect(exportedNames(modules['virtual loader']!)).toEqual([])
    await expectValidModules(modules)
  })

  it('shares what its other options and a split option in the same chunk read', async () => {
    const { modules, sharedBindings } = compileRouteModules(
      `${head}const settings = { mode: 'blocking' as const }
export const Route = createFileRoute('/')({
  loader: {
    staleReloadMode: settings.mode,
    handler: () => settings,
  },
  component: () => <p>index</p>,
})
`,
      { groupings: [['loader', 'component']] },
    )
    // The handler moves to the chunk while `staleReloadMode` stays in the
    // route file, so both read one `settings` object from the shared module.
    expect(sharedBindings).toEqual(['settings'])
    expect(modules.reference).not.toMatch(declarationOf('settings'))
    expect(modules['virtual loader-component']).not.toMatch(
      declarationOf('settings'),
    )
    await expectValidModules(modules)
  })
})
