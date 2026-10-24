/**
 * Documented Start plugin options that reach the compilers (server fn ids,
 * the code splitter, the route tree) have their effect in real builds,
 * through Start's Vite and Rsbuild plugins (build-harness.ts).
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, test } from 'vitest'
import {
  loadMarker,
  loadedModulesExpression,
} from '@tanstack/compiler-test-utils/importers'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  startBundlers,
} from '../build-harness'
import type { StartBuild } from '../build-harness'

const timeout = 60_000

const greetFiles = {
  'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(async () => 'MARK_HANDLER')
`,
  'src/client-entry.ts': `export { greet } from './fns'\n`,
  'src/ssr-entry.ts': `export { greet } from './fns'
${callByIdExports}`,
}

/** Type-checks `files` (relative to `root`); returns the diagnostics. */
function typeCheck(root: string, files: Array<string>) {
  const program = ts.createProgram(
    files.map((file) => path.join(root, file)),
    {
      strict: true,
      noEmit: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowImportingTsExtensions: true,
      jsx: ts.JsxEmit.Preserve,
      skipLibCheck: true,
      types: [],
    },
  )
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
    const where = diagnostic.file
      ? `${path.relative(root, diagnostic.file.fileName)}:${diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1}`
      : ''
    return `${where} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`
  })
}

/**
 * Type assertions on the `Register` interface the route tree declares:
 * the app's router, and its Start config (`withConfig`) or none. (The
 * generated route tree is not type-checked itself, `@ts-nocheck`, so a
 * broken import there would only make these types `any`.)
 */
const registerChecks = (
  withConfig: boolean,
) => `import type { Register } from '@tanstack/react-start'
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
type Expect<T extends true> = T
export type Checks = [
  Expect<Equal<Register['ssr'], true>>,
  Expect<Equal<Register['router']['brand'], 'ROUTER'>>,
  ${withConfig ? `Expect<Equal<Register['config'], { brand: 'CONFIG' }>>,` : `Expect<Equal<'config' extends keyof Register ? true : false, false>>,`}
]
// @ts-expect-error the registered router is the app's
export const router: Register['router'] = { brand: 'OTHER' }
${
  withConfig
    ? `// @ts-expect-error the registered config is the app's
export const config: Register['config'] = { brand: 'OTHER' }`
    : ''
}
`

describe.each(startBundlers)('%s build', (bundler) => {
  // Source: review (serverFns.generateFunctionId returning undefined was
  // never exercised).
  test(
    'serverFns.generateFunctionId returning undefined: the default id, which the SSR build resolves',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: greetFiles,
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
        start: { serverFns: { generateFunctionId: () => undefined } },
      })
      // (the client's server fn, by its public URL: base, then id)
      const url = (await client.run(`return entry.greet.url`)).result
      expect(
        (
          await ssr.run(
            `${callByIdPrelude}const id = serverFnId(${JSON.stringify(url)})
return { id, value: await callById(id) }`,
          )
        ).result,
      ).toEqual({ id: expect.stringMatching(/./), value: 'MARK_HANDLER' })
    },
    timeout,
  )

  // Source: mutation testing (a generator returning an id was
  // never built).
  test(
    'serverFns.generateFunctionId returning an id: the client calls that id, which the SSR build resolves',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: greetFiles,
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
        start: { serverFns: { generateFunctionId: () => 'my-custom-id' } },
      })
      const url = (await client.run(`return entry.greet.url`)).result
      expect(
        (
          await ssr.run(
            `${callByIdPrelude}return {
  id: serverFnId(${JSON.stringify(url)}),
  value: await callById('my-custom-id'),
}`,
          )
        ).result,
      ).toEqual({ id: 'my-custom-id', value: 'MARK_HANDLER' })
    },
    timeout,
  )

  /**
   * A route whose loader and component each read a module of their own
   * that records when it loads (`loadMarker`): what loads, and when, is
   * observed at run time, not through chunk names.
   */
  const routeFiles = {
    'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
    'src/loader-data.ts': `${loadMarker('loader')}export const loaderData = 'MARK_LOADER'\n`,
    'src/component-label.ts': `${loadMarker('component')}export const componentLabel = 'MARK_COMPONENT'\n`,
    'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { loaderData } from '../loader-data'
import { componentLabel } from '../component-label'
export const Route = createFileRoute('/')({
  loader: () => loaderData,
  component: () => componentLabel,
})
`,
    'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
    'src/entry.ts': `export { getRouter } from './router'
export { renderPath } from '../harness/render'
`,
  }

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

  // Source: mutation testing (the footer Start adds to the
  // route tree was never type-checked).
  test.each([
    { name: 'with', withStart: true },
    { name: 'without', withStart: false },
  ])(
    'the route tree registers the router and Start config ($name src/start.ts) for TypeScript, and keeps the router.routeTreeFileFooter',
    async ({ withStart }) => {
      const { ssr } = await buildStart({
        bundler,
        files: {
          'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => null })
`,
          'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = async () =>
  Object.assign(createRouter({ routeTree }), { brand: 'ROUTER' as const })
`,
          ...(withStart && {
            'src/start.ts': `export const startInstance = { getOptions: async () => ({ brand: 'CONFIG' as const }) }
`,
          }),
          'src/entry.ts': `export { FOOTER } from './routeTree.gen'\n`,
        },
        entry: { client: 'src/router.ts', ssr: 'src/entry.ts' },
        start: {
          router: {
            routeTreeFileFooter: [`export const FOOTER = 'MARK_USER_FOOTER'`],
          },
        },
      })
      expect((await ssr.run(`return entry.FOOTER`)).result).toBe(
        'MARK_USER_FOOTER',
      )
      await writeFile(
        path.join(ssr.root, 'src/check.ts'),
        registerChecks(withStart),
      )
      expect(
        typeCheck(ssr.root, ['src/routeTree.gen.ts', 'src/check.ts']),
      ).toEqual([])
    },
    timeout,
  )
})
