import { describe, expect, it } from 'vitest'
import { buildAndRun, head } from './regression-helpers'

const codec = `{
  handler: () => ({ domain: 7 }),
  dehydrate: ({ data }) => ({ wire: data.domain }),
  hydrate: ({ data }) => ({ domain: data.wire }),
  staleReloadMode: 'background',
}`

describe('inline lifecycle compiler contract', () => {
  it.each([
    {
      name: 'an imported object',
      declaration: `import { loader } from '../loader'`,
      value: 'loader',
    },
    {
      name: 'a helper result',
      declaration: `import { makeLoader } from '../loader'`,
      value: 'makeLoader()',
    },
    {
      name: 'a namespace member',
      declaration: `import * as loaders from '../loader'`,
      value: 'loaders.loader',
    },
    {
      name: 'a same-file object',
      declaration: `const loader = ${codec}`,
      value: 'loader',
    },
    {
      name: 'a wrapped same-file object',
      declaration: `const loader = ${codec} satisfies Record<string, unknown>`,
      value: '(loader as any)!',
    },
  ])(
    'preserves the codecs and handler of $name',
    async ({ declaration, value }) => {
      const result = await buildAndRun(
        `${head}${declaration}
const options = {
  loader: ${value},
  component: () => <p>posts</p>,
}
export const Route = createFileRoute('/')(options)
`,
        `const loader = entry.Route.options.loader
const data = await loader.handler()
return {
  data,
  wire: loader.dehydrate({ data }),
  restored: loader.hydrate({ data: { wire: 7 } }),
  mode: loader.staleReloadMode,
}`,
        {
          groupings: [['loader'], ['component']],
          deleteNodes: ['loader.dehydrate', 'loader.hydrate'],
          files: {
            'loader.ts': `export const loader = ${codec}
export const makeLoader = () => loader
`,
          },
        },
      )
      expect(result).toEqual({
        data: { domain: 7 },
        wire: { wire: 7 },
        restored: { domain: 7 },
        mode: 'background',
      })
    },
    30_000,
  )

  it.each([
    { declaration: `import { loader } from '../loader'`, value: 'loader' },
    {
      declaration: `import { makeLoader } from '../loader'`,
      value: 'makeLoader()',
    },
    {
      declaration: `import * as loaders from '../loader'`,
      value: 'loaders.loader',
    },
  ])(
    'keeps opaque function modules eager: $value',
    async ({ declaration, value }) => {
      const result = await buildAndRun(
        `${head}${declaration}
export const Route = createFileRoute('/')({
  loader: ${value},
  component: () => <p>posts</p>,
})
`,
        `const before = globalThis.__loaderModuleInitializations
const data = await entry.Route.options.loader()
return { before, data, after: globalThis.__loaderModuleInitializations }`,
        {
          groupings: [['loader'], ['component']],
          files: {
            'loader.ts': `globalThis.__loaderModuleInitializations = (globalThis.__loaderModuleInitializations ?? 0) + 1
export const loader = () => ({ domain: 7 })
export const makeLoader = () => loader
`,
          },
        },
      )
      expect(result).toEqual({ before: 1, data: { domain: 7 }, after: 1 })
    },
    30_000,
  )

  it.each(['context', 'beforeLoad'] as const)(
    'retains the codecs of a shared %s object',
    async (key) => {
      const result = await buildAndRun(
        `${head}const lifecycle = ${codec}
export const Route = createFileRoute('/')({
  ${key}: lifecycle,
  component: () => <p>{lifecycle.staleReloadMode}</p>,
})
`,
        `const lifecycle = entry.Route.options.${key}
return {
  wire: lifecycle.dehydrate({ data: { domain: 7 } }),
  restored: lifecycle.hydrate({ data: { wire: 7 } }),
  rendered: await entry.render(entry.Route.options.component),
}`,
        {
          deleteNodes: [`${key}.dehydrate`, `${key}.hydrate`],
        },
      )
      expect(result).toEqual({
        wire: { wire: 7 },
        restored: { domain: 7 },
        rendered: '<p>background</p>',
      })
    },
    30_000,
  )

  it('restores an imported loader before hydration and reruns its handler on invalidation', async () => {
    const result = await buildAndRun(
      `${head}import { loader } from '../loader'
export const Route = createFileRoute('/')({ loader })
`,
      'return entry.run()',
      {
        groupings: [['loader']],
        files: {
          'loader.ts': `export const loader = {
  handler: () => ({ domain: globalThis.__loads = (globalThis.__loads ?? 0) + 1 }),
  dehydrate: ({ data }) => ({ wire: data.domain }),
  hydrate: ({ data }) => ({ domain: data.wire }),
}`,
          'entry.ts': `import { runInNewContext } from 'node:vm'
import { createRootRoute, createRoute, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { attachRouterServerSsrUtils } from '@tanstack/router-core/ssr/server'
import { hydrate } from '@tanstack/router-core/ssr/client'
import { Route } from './routes/index'
import { loader } from './loader'

export async function run() {
  const buildRouter = (isServer) => {
    const root = createRootRoute({})
    const index = createRoute({
      getParentRoute: () => root,
      path: '/',
      loader: isServer ? loader : Route.options.loader,
    })
    return createRouter({
      routeTree: root.addChildren([index]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer,
    })
  }
  const server = buildRouter(true)
  attachRouterServerSsrUtils({ router: server, manifest: { routes: {} } })
  await server.load()
  await server.serverSsr.dehydrate()
  const scripts = server.serverSsr.takeInitialHydrationScriptTags()
  const scope = { document: { currentScript: { remove() {} } } }
  scope.self = scope
  for (const script of scripts.before) {
    runInNewContext(script.children, scope)
  }
  server.serverSsr.cleanup()
  globalThis.self = globalThis
  globalThis.window = {
    $_TSR: scope.$_TSR,
    location: { origin: 'http://localhost' },
    history: { state: {} },
    addEventListener() {},
    removeEventListener() {},
  }
  globalThis.document = { querySelector() { return null } }
  const client = buildRouter(false)
  await hydrate(client)
  const hydrated = client.state.matches.at(-1).loaderData
  const callsAfterHydration = globalThis.__loads
  await client.invalidate({ sync: true })
  return {
    server: server.state.matches.at(-1).loaderData,
    hydrated,
    callsAfterHydration,
    reloaded: client.state.matches.at(-1).loaderData,
  }
}`,
        },
      },
    )
    expect(result).toEqual({
      server: { domain: 1 },
      hydrated: { domain: 1 },
      callsAfterHydration: 1,
      reloaded: { domain: 2 },
    })
  }, 30_000)
  it('strips inline codecs when the outer route options are shared', async () => {
    const result = await buildAndRun(
      `${head}import { toWire } from '../server-only'
const options = {
  loader: {
    handler: () => ({ domain: 7 }),
    dehydrate: ({ data }) => toWire(data),
    hydrate: ({ data }) => ({ domain: data.wire }),
  },
  head: () => ({ meta: [{ title: String(options.loader.handler().domain) }] }),
  component: () => <p>{options.loader.handler().domain}</p>,
}
export const Route = createFileRoute('/')(options)
`,
      `return {
  data: entry.Route.options.loader.handler(),
  restored: entry.Route.options.loader.hydrate({ data: { wire: 7 } }),
  rendered: await entry.render(entry.Route.options.component),
  serverModuleInitializations: globalThis.__serverModuleInitializations ?? 0,
}`,
      {
        deleteNodes: ['loader.dehydrate'],
        files: {
          'server-only.ts': `globalThis.__serverModuleInitializations = (globalThis.__serverModuleInitializations ?? 0) + 1
export const toWire = (data) => ({ wire: data.domain })`,
        },
      },
    )
    expect(result).toEqual({
      data: { domain: 7 },
      restored: { domain: 7 },
      rendered: '<p>7</p>',
      serverModuleInitializations: 0,
    })
  }, 30_000)
  it.each([
    {
      name: 'a removed option',
      options: `headers: () => { loader = () => 'changed'; return {} },
  component: () => <p>posts</p>,`,
      deleteNodes: ['headers'] as const,
    },
    {
      name: 'a split component',
      options: `component: () => { loader = () => 'changed'; return <p>posts</p> },`,
      deleteNodes: [] as const,
    },
  ])(
    'preserves reassignment in $name across compiled modules',
    async ({ options, deleteNodes }) => {
      const result = await buildAndRun(
        `${head}let loader = () => 'data'
export const Route = createFileRoute('/')({
  ${options}
  loader,
})
`,
        `const before = await entry.Route.options.loader()
const rendered = await entry.render(entry.Route.options.component)
return { before, rendered, after: await entry.Route.options.loader() }`,
        {
          groupings: [['loader'], ['component']],
          deleteNodes: [...deleteNodes],
        },
      )
      expect(result).toEqual({
        before: 'data',
        rendered: '<p>posts</p>',
        after: 'data',
      })
    },
    30_000,
  )
})
