/**
 * Documented Start plugin options that reach the compilers (server fn ids,
 * the code splitter, the route tree) have their effect in real builds,
 * through Start's Vite and Rsbuild plugins (build-harness.ts). (Options that
 * only become runtime defines are tested in
 * outside-compiler-corpus/start-build-options.test.ts.)
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, test } from 'vitest'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  routerRuntimeFiles,
  startBundlers,
} from './build-harness'
import type { StartBuild } from './build-harness'

const timeout = 60_000

const greetFiles = {
  'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(async () => 'MARK_HANDLER')
`,
  'src/client-entry.ts': `export { greet } from './fns'\n`,
  'src/ssr-entry.ts': `export { greet } from './fns'
${callByIdExports}`,
}

/**
 * Type declarations of the stand-in router (`@tanstack/react-start` is the
 * real package, with its types).
 */
const typeFiles = {
  'node_modules/@tanstack/react-router/index.d.ts': `export interface FileRoutesByPath {}
export interface RouteLike {
  options: any
  update(options: any): RouteLike
  _addFileChildren(children: any): RouteLike
  _addFileTypes<T>(): RouteLike
}
export declare function createRootRoute(options?: any): RouteLike
export declare function createFileRoute(path: any): (options?: any) => RouteLike
export declare function lazyRouteComponent(...args: Array<any>): any
export declare function lazyFn(...args: Array<any>): any
`,
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
  // Source: oracle-gaps "Start options never exercised"
  // (serverFns.generateFunctionId returning undefined).
  test(
    'serverFns.generateFunctionId returning undefined: the default id, which the SSR build resolves',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: greetFiles,
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
        start: { serverFns: { generateFunctionId: () => undefined } },
      })
      const id = (await client.run(`return entry.greet.serverFnMeta.id`)).result
      expect(id).toEqual(expect.stringMatching(/./))
      expect(
        (
          await ssr.run(
            `${callByIdPrelude}return await callById(${JSON.stringify(id)})`,
          )
        ).result,
      ).toBe('MARK_HANDLER')
    },
    timeout,
  )

  // Source: mutation round 3 sc-hosts 6 (a generator returning an id was
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
      expect(
        (await client.run(`return entry.greet.serverFnMeta.id`)).result,
      ).toBe('my-custom-id')
      expect(
        (
          await ssr.run(
            `${callByIdPrelude}return await callById('my-custom-id')`,
          )
        ).result,
      ).toBe('MARK_HANDLER')
    },
    timeout,
  )

  /** A route whose component and loader each carry a marker. */
  const routeFiles = {
    ...routerRuntimeFiles,
    'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
    'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  loader: () => 'MARK_LOADER',
  component: () => 'MARK_COMPONENT',
})
`,
    'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
    'src/entry.ts': `export { getRouter } from './router'\n`,
  }

  // Start passes the router options through to the code splitter of each
  // build (only replacing the options it owns: the route options it deletes
  // from client builds, and HMR). By default the loader stays with the
  // route.
  // Source: oracle-gaps "Start options never exercised"
  // (router.codeSplittingOptions through Start).
  test.each([
    {
      name: 'by default',
      router: {},
      expected: { loader: 'eager', component: 'lazy', oneChunk: false },
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
      expected: { loader: 'lazy', component: 'lazy', oneChunk: true },
    },
  ])(
    'router.codeSplittingOptions: the client and SSR builds load the route loader and component $name',
    async ({ router, expected }) => {
      const { client, ssr } = await buildStart({
        bundler,
        files: routeFiles,
        entry: 'src/entry.ts',
        start: { router },
      })
      /** Where a build has the loader and the component. */
      const placement = (build: StartBuild['client']) => ({
        loader: build.where('MARK_LOADER'),
        component: build.where('MARK_COMPONENT'),
        oneChunk:
          build.locate('MARK_LOADER').lazy[0] ===
          build.locate('MARK_COMPONENT').lazy[0],
      })
      // Source: mutation round 3 start-router H for the SSR build.
      expect({ client: placement(client), ssr: placement(ssr) }).toEqual({
        client: expected,
        ssr: expected,
      })
      // Wherever they are, the route's loader and component still run.
      const script = `const route = Object.values(entry.getRouter().routeTree.children).find(
  (candidate) => candidate.options.id === '/',
)
const { loader, component } = route.options
await component.preload?.()
return { loader: await loader(), component: component() }`
      const runs = { loader: 'MARK_LOADER', component: 'MARK_COMPONENT' }
      expect({
        client: (await client.run(script)).result,
        ssr: (await ssr.run(script)).result,
      }).toEqual({ client: runs, ssr: runs })
    },
    timeout,
  )

  // Source: mutation round 3 start-router F (the footer Start adds to the
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
          ...routerRuntimeFiles,
          ...typeFiles,
          'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => null })
`,
          'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = async () => ({ brand: 'ROUTER' as const, routeTree })
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
