import { describe, expect, it } from 'vitest'
import {
  buildAndRun,
  compileRouteModules,
  declarationOf,
  evaluateModule,
  expectValidModules,
  head,
  importSources,
  importedNames,
} from './regression-helpers'

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

describe('split loaders', () => {
  /** Loads `/` with a real router and returns each match's loader data. */
  const routerEntry = `import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export async function load() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return router.state.matches.map((match) => match.loaderData ?? null)
}`

  function loadWithSplitLoader(loader: string) {
    return buildAndRun(
      `${head}export const Route = createFileRoute('/')({
  loader: ${loader},
  component: () => <p>index</p>,
})`,
      `return await entry.load()`,
      {
        files: { 'entry.ts': routerEntry },
        groupings: [['loader'], ['component']],
      },
    )
  }

  it('load route data', async () => {
    expect(await loadWithSplitLoader(`() => 'loaded'`)).toEqual([
      null,
      'loaded',
    ])
  }, 30_000)

  it('load route data in object form', async () => {
    expect(
      await loadWithSplitLoader(
        `{ handler: () => 'loaded', staleReloadMode: 'blocking' }`,
      ),
    ).toEqual([null, 'loaded'])
  }, 30_000)

  // The router reads the other keys of a loader object (`staleReloadMode`)
  // from the route options when the route loads.
  it('move only the handler of a loader in object form into their chunk', async () => {
    const { modules, sharedBindings } = compileRouteModules(
      `${head}import { fetchPosts } from './api'
import { init } from './state'
const mode = init('blocking')
export const Route = createFileRoute('/')({
  loader: {
    handler: () => [mode, fetchPosts()],
    staleReloadMode: mode,
  },
  component: () => <p>index</p>,
})
`,
      { groupings: [['loader'], ['component']] },
    )
    // `mode` is read by the handler and by the route module: initialized once
    expect(sharedBindings).toEqual(['mode'])
    expect(importSources(modules.reference!)).not.toContain('./api')
    expect(modules.reference).toContain('staleReloadMode')
    const chunk = await evaluateModule(modules['virtual loader']!, {
      './api': { fetchPosts: () => 'posts' },
      'route.tsx?tsr-shared=1': { mode: 'blocking' },
    })
    expect(chunk.loader!()).toEqual(['blocking', 'posts'])
    await expectValidModules(modules)
  })

  it.each([
    {
      name: 'a method',
      loader: `{ handler() { return fetchPosts() } }`,
    },
    {
      name: 'a spread after the handler',
      loader: `{ handler: () => fetchPosts(), ...defaults }`,
    },
  ])(
    'keep a loader object whose handler is $name in the route module',
    async ({ loader }) => {
      const { modules } = compileRouteModules(
        `${head}import { fetchPosts, defaults } from './api'
export const Route = createFileRoute('/')({
  loader: ${loader},
  component: () => <p>index</p>,
})
`,
        { groupings: [['loader'], ['component']] },
      )
      expect(importedNames(modules.reference!, './api')).toContain('fetchPosts')
      expect(modules.reference).not.toContain('tsr-split=loader')
      await expectValidModules(modules)
    },
  )
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
