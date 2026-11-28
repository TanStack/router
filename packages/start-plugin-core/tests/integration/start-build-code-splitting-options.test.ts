/**
 * `router.codeSplittingOptions` given to Start reaches the code splitter of
 * each build (split from start-build-options.test.ts to keep each file within
 * the per-file time limit): what loads, and when, in real builds through
 * Start's Vite and Rsbuild plugins (build-harness.ts).
 */
import { describe, expect, test } from 'vitest'
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { expectNoDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { loadedModulesExpression } from '@tanstack/compiler-test-utils/importers'
import {
  callByIdExports,
  callByIdPrelude,
  requestsOfPrelude,
  startBundlers,
} from '../build-harness'
import { buildStart } from '../build-start'
import { routeFiles } from './start-build-route-app'
import type { StartBuild } from '../build-harness'

const timeout = 60_000

describe.each(startBundlers)('%s build', (bundler) => {
  // Start passes the router options through to the code splitter of each
  // build (only replacing the options it owns: the route options it deletes
  // from client builds, and HMR). By default the loader stays with the
  // route.
  // Source: review (router.codeSplittingOptions through Start was never
  // exercised).
  test.each([
    {
      name: 'by default',
      router: {},
      expected: {
        loader: 'eager',
        component: 'lazy',
        loaderBringsComponent: false,
        componentBringsLoader: false,
      },
    },
    {
      name: 'with a defaultBehavior grouping the loader with the component',
      router: {
        codeSplittingOptions: {
          defaultBehavior: [['loader', 'component']] as Array<
            Array<'loader' | 'component'>
          >,
        },
      },
      expected: {
        loader: 'lazy',
        component: 'lazy',
        loaderBringsComponent: true,
        componentBringsLoader: true,
      },
    },
  ])(
    'router.codeSplittingOptions: the client build loads the route loader and component $name, and both builds run them',
    async ({ router, expected }) => {
      const { client, ssr } = await buildStart({
        bundler,
        files: routeFiles,
        entry: 'src/entry.ts',
        start: { router },
      })
      /**
       * What loads with the app (eager) or later (lazy), and whether loading
       * one option (running the loader, preloading the component) loads the
       * other's code too (one group). Each direction gets a fresh run.
       */
      const placementScript = (load: string, other: string, key: string) =>
        `const loaded = () => [...${loadedModulesExpression}]
const atStart = loaded()
const route = Object.values(entry.getRouter().routeTree.children).find(
  (candidate) => candidate.options.id === '/',
)
await ${load}
return {
  loader: atStart.includes('loader') ? 'eager' : 'lazy',
  component: atStart.includes('component') ? 'eager' : 'lazy',
  ${key}: !atStart.includes('${other}') && loaded().includes('${other}'),
}`
      const placement = async (build: StartBuild['client']) => ({
        ...((
          await build.run(
            placementScript(
              'route.options.loader()',
              'component',
              'loaderBringsComponent',
            ),
          )
        ).result as object),
        ...((
          await build.run(
            placementScript(
              'route.options.component.preload()',
              'loader',
              'componentBringsLoader',
            ),
          )
        ).result as object),
      })
      // The SSR build need not split route options like the client: it is
      // not required for correctness, an eventual optimisation (SPEC §5.3).
      expect(await placement(client)).toEqual(expected)
      // Wherever they are, the route's loader and component still run: the
      // real router renders the page at `/`.
      const script = `const route = Object.values(entry.getRouter().routeTree.children).find(
  (candidate) => candidate.options.id === '/',
)
return {
  loader: await route.options.loader(),
  page: await entry.renderPath(entry.getRouter().routeTree, '/'),
}`
      const runs = {
        loader: 'MARK_LOADER',
        page: expect.stringContaining('MARK_COMPONENT'),
      }
      expect({
        client: (await client.run(script)).result,
        ssr: (await ssr.run(script)).result,
      }).toEqual({ client: runs, ssr: runs })
    },
    timeout,
  )

  // `codeSplittingOptions.deleteNodes` erases its options from the route
  // modules of the server build. The client build erases Start's own
  // server-only options (`ssr`, `server`, `headers`) instead and keeps the
  // user's (as main did on both bundlers; Start on Rsbuild ignored the
  // option on the server).
  test(
    'router.codeSplittingOptions.deleteNodes: the server build erases the options, the client build erases ssr instead',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: {
          ...routeFiles,
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  ssr: true,
  staticData: { marker: 'MARK_STATIC' },
  component: () => 'MARK_COMPONENT',
})
`,
        },
        entry: 'src/entry.ts',
        start: {
          router: { codeSplittingOptions: { deleteNodes: ['staticData'] } },
        },
      })
      const script = `const route = Object.values(entry.getRouter().routeTree.children).find(
  (candidate) => candidate.options.id === '/',
)
return { staticData: route.options.staticData ?? null, ssr: route.options.ssr ?? null }`
      expect({
        client: (await client.run(script)).result,
        ssr: (await ssr.run(script)).result,
      }).toEqual({
        client: { staticData: { marker: 'MARK_STATIC' }, ssr: null },
        ssr: { staticData: null, ssr: true },
      })
    },
    timeout,
  )

  // A loader that is a server fn, in a chunk of its own: each build
  // compiles it, and the client's loader calls the server's. Written in
  // place as the loader, Start rewrites it in the route module, so the
  // loader stays there, warned at, and runs on the server. An object-form
  // loader stays in the route module (a value main's chunk compile cannot
  // take, R153) and runs on the server.
  const routeModule = (declarations: string, loader: string) =>
    `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
${declarations}export const Route = createFileRoute('/')({
  loader: ${loader},
  component: () => 'MARK_COMPONENT',
})
`
  const buildSplitLoader = (module: string) =>
    buildStart({
      bundler,
      files: {
        ...routeFiles,
        'src/routes/index.tsx': module,
        'src/client-entry.ts': `export { getRouter } from './router'\n`,
        'src/ssr-entry.ts': `export { getRouter } from './router'
${callByIdExports}`,
      },
      entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
      start: {
        router: {
          codeSplittingOptions: {
            defaultBehavior: [['loader'], ['component']] as Array<
              Array<'loader' | 'component'>
            >,
          },
        },
      },
    })
  /** What the server returns to the client's call of the route's loader, and the server fn's id. */
  const callServerFnLoader = async (
    build: Awaited<ReturnType<typeof buildSplitLoader>>,
  ) => {
    const requests = (
      await build.client.run(
        `${requestsOfPrelude}const route = Object.values(entry.getRouter().routeTree.children).find(
  (candidate) => candidate.options.id === '/',
)
const { loader } = route.options
return requestsOf((options) => (typeof loader === 'function' ? loader : loader.handler)(options))`,
      )
    ).result as Array<{ url: string }>
    expect(requests).toHaveLength(1)
    const url = requests[0]!.url.split('?')[0]!
    const { result } = await build.ssr.run(
      `${callByIdPrelude}return callById(serverFnId(${JSON.stringify(url)}))`,
    )
    return {
      result,
      id: decodeURIComponent(url.slice(url.lastIndexOf('/') + 1)),
    }
  }
  const runServerFnLoader = async (
    build: Awaited<ReturnType<typeof buildSplitLoader>>,
  ) => (await callServerFnLoader(build)).result
  // (the fixes the warning and the error below give)
  test.each([
    { name: 'a loader calling it', loader: '(ctx) => loaderFn(ctx)' },
    { name: 'a loader', loader: 'loaderFn' },
  ])(
    'router.codeSplittingOptions: $name that is a server fn declared before the route, split into its own chunk, runs on the server',
    async ({ loader }) => {
      const built = await buildSplitLoader(
        routeModule(
          `const loaderFn = createServerFn().handler(async () => 'MARK_LOADER_FN')\n`,
          loader,
        ),
      )
      const { result, id } = await callServerFnLoader(built)
      expect(result).toBe('MARK_LOADER_FN')
      // split: the loader (with the client's call of the server fn, by its
      // id) loads on demand, not with the app
      expect(built.client.where(id)).toBe('lazy')
    },
    timeout,
  )
  // The client splits it (its call of the server fn, by id, loads on
  // demand); only the server's module keeps it, where Start hoists the
  // handler: nothing to tell the user (Fable's review of the
  // implementation, 8).
  test(
    'router.codeSplittingOptions: a loader that is a server fn written in place is split on the client, runs on the server, and nothing is reported',
    async () => {
      const built = await buildSplitLoader(
        routeModule(
          '',
          `createServerFn().handler(async () => 'MARK_LOADER_FN')`,
        ),
      )
      const { result, id } = await callServerFnLoader(built)
      expect(result).toBe('MARK_LOADER_FN')
      expect(built.client.where(id)).toBe('lazy')
      expectNoDiagnostic(problems(built.diagnostics), {
        file: 'src/routes/index.tsx',
        root: built.root,
      })
    },
    timeout,
  )
  test.each([
    {
      name: 'written in place',
      loader: `{ handler: createServerFn().handler(async () => 'MARK_LOADER_FN') }`,
    },
    {
      name: 'declared before the route',
      declarations: `const loaderFn = createServerFn().handler(async () => 'MARK_LOADER_FN')\n`,
      loader: '{ handler: loaderFn }',
    },
  ])(
    "router.codeSplittingOptions: an object-form loader's handler that is a server fn $name stays in the route module and runs on the server",
    async ({ declarations = '', loader }) => {
      const built = await buildSplitLoader(routeModule(declarations, loader))
      expect(await runServerFnLoader(built)).toBe('MARK_LOADER_FN')
    },
    timeout,
  )

  test.each([
    {
      shape: 'an array element only the loader reads',
      declarations: `const [greet, title] = [createServerFn().handler(async () => 'MARK_NESTED_FN'), 'T']`,
      loader: `() => ({ greet, title })`,
    },
    {
      shape: 'a cast array element only the loader reads',
      declarations: `const [greet, title] = [createServerFn().handler(async () => 'MARK_NESTED_FN') as any, 'T']`,
      loader: `() => ({ greet, title })`,
    },
  ])(
    'router.codeSplittingOptions.deleteNodes: $shape inside a deleted option runs on the server',
    async ({ declarations, loader }) => {
      const { client, ssr } = await buildStart({
        bundler,
        files: {
          ...routeFiles,
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
${declarations}
export const Route = createFileRoute('/')({
  loader: ${loader},
  component: () => 'MARK_COMPONENT',
})
`,
          'src/client-entry.ts': `export { getRouter } from './router'\n`,
          'src/ssr-entry.ts': `export { getRouter } from './router'
${callByIdExports}`,
        },
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
        start: {
          router: { codeSplittingOptions: { deleteNodes: ['loader'] } },
        },
      })
      const route = `const route = Object.values(entry.getRouter().routeTree.children).find(
  (candidate) => candidate.options.id === '/',
)
`
      const url = (
        await client.run(
          `${route}return (await route.options.loader()).greet.url`,
        )
      ).result
      expect(
        (
          await ssr.run(
            `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}))`,
          )
        ).result,
      ).toBe('MARK_NESTED_FN')
    },
    timeout,
  )
})
