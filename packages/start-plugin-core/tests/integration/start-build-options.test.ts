/**
 * Documented Start plugin options that reach the compilers (server fn ids,
 * the code splitter, the route tree) have their effect in real builds,
 * through Start's Vite and Rsbuild plugins (build-harness.ts).
 */
import { readFile, writeFile } from 'node:fs/promises'
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
import { solidAppConfig } from './hydrate-pages'
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
  framework: 'react' | 'solid',
) => `import type { Register } from '@tanstack/${framework}-start'
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

  // A server fn defined inside an option the server build deletes: the
  // client keeps the option and calls the server fn, which the server
  // still serves (as it does one declared at the top level of the file).
  test(
    'router.codeSplittingOptions.deleteNodes: a server fn defined inside a deleted option runs on the server',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: {
          ...routeFiles,
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
export const Route = createFileRoute('/')({
  loader: () => {
    const greet = createServerFn().handler(async () => 'MARK_NESTED_FN')
    return { greet }
  },
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
            `${callByIdPrelude}${route}return {
  loader: route.options.loader ?? null,
  called: await callById(serverFnId(${JSON.stringify(url)})),
}`,
          )
        ).result,
      ).toEqual({ loader: null, called: 'MARK_NESTED_FN' })
    },
    timeout,
  )

  // Source: mutation testing (the footer Start adds to the
  // route tree was never type-checked).
  // The footer augments the Start package of the app's framework.
  test.each([
    { name: 'with', withStart: true, framework: 'react' },
    { name: 'without', withStart: false, framework: 'react' },
    { name: 'with', withStart: true, framework: 'solid' },
  ] as const)(
    'the route tree registers the router and Start config ($framework, $name src/start.ts) for TypeScript, and keeps the router.routeTreeFileFooter',
    async ({ withStart, framework }) => {
      const { ssr } = await buildStart({
        bundler,
        framework,
        ...(framework === 'solid' && solidAppConfig),
        files: {
          'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/${framework}-router'
export const Route = createRootRoute()
`,
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/${framework}-router'
export const Route = createFileRoute('/')({ component: () => null })
`,
          'src/router.ts': `import { createRouter } from '@tanstack/${framework}-router'
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
        registerChecks(withStart, framework),
      )
      expect(
        typeCheck(ssr.root, ['src/routeTree.gen.ts', 'src/check.ts']),
      ).toEqual([])
    },
    timeout,
  )

  // Bug: Start's footer of the route tree (its Register augmentation) is
  // printed with single quotes and no semicolons whatever router.quoteStyle
  // and router.semicolons say, so the route tree mixes both styles.
  // Source: src/start-router-plugin/route-tree-footer.ts (hardcoded quotes).
  // Impact: a project formatting with double quotes and semicolons gets a
  // route tree its formatter or linter rewrites (#8437's footer churn).
  test(
    'the route tree, Start footer included, follows router.quoteStyle and router.semicolons',
    async () => {
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
export const getRouter = async () => createRouter({ routeTree })
`,
          'src/start.ts': `export const startInstance = { getOptions: async () => ({}) }
`,
        },
        entry: 'src/router.ts',
        start: { router: { quoteStyle: 'double', semicolons: true } },
      })
      const code = await readFile(
        path.join(ssr.root, 'src/routeTree.gen.ts'),
        'utf8',
      )
      const source = ts.createSourceFile(
        'routeTree.gen.ts',
        code,
        ts.ScriptTarget.Latest,
        true,
      )
      // The quotes of the string literals without quote characters in them,
      // and the import and variable statements (which end with `;`)
      const quotes = new Set<string>()
      const statements: Array<string> = []
      const visit = (node: ts.Node) => {
        if (ts.isStringLiteral(node) && !/["']/.test(node.text)) {
          quotes.add(node.getText(source)[0]!)
        }
        if (ts.isImportDeclaration(node) || ts.isVariableStatement(node)) {
          statements.push(node.getText(source))
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
      expect([...quotes]).toEqual(['"'])
      expect(statements.length).toBeGreaterThan(0)
      expect(statements.filter((text) => !text.endsWith(';'))).toEqual([])
    },
    timeout,
  )

  // Bug: generator plugins given as router.plugins never run: Start's own
  // generator plugins replace them.
  // Source: src/vite/start-router-plugin/plugin.ts, src/rsbuild/
  // router-generator.ts (`plugins` set after the user's router options).
  // Impact: #7768: a generator plugin works with the router plugin but is
  // silently ignored in a Start app.
  test(
    'generator plugins of router.plugins see the route tree',
    async () => {
      const seen = new Set<string>()
      const { ssr } = await buildStart({
        bundler,
        files: {
          'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
          'src/routes/about.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/about')({ component: () => 'MARK_ABOUT' })
`,
          'src/entry.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
        },
        entry: 'src/entry.ts',
        start: {
          router: {
            plugins: [
              {
                name: 'probe',
                onRouteTreeChanged: ({ model }) => {
                  for (const route of model.routes) {
                    seen.add(route.id)
                  }
                },
              },
            ],
          },
        },
      })
      // (the routes of the app's route tree, which Start's own generator
      // plugins still make)
      const routeIds = (
        await ssr.run(`return Object.keys(entry.getRouter().routesById)`)
      ).result as Array<string>
      expect(routeIds).toContain('/about')
      expect([...seen].sort()).toEqual(
        routeIds.filter((id) => id !== '__root__').sort(),
      )
    },
    timeout,
  )
})
