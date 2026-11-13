/**
 * Documented Start plugin options that reach the compilers (server fn ids,
 * the route tree) have their effect in real builds, through Start's Vite and
 * Rsbuild plugins (build-harness.ts). `router.codeSplittingOptions`:
 * start-build-code-splitting-options.test.ts (split from this file to keep
 * each within the per-file time limit).
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, test } from 'vitest'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  startBundlers,
} from '../build-harness'
import { solidAppConfig } from './hydrate-pages'

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
  // never exercised). The default id is a SHA256 hash (documented), printed
  // as earlier versions printed it: 64 hex digits. An empty id falls back to
  // it too, as it always did.
  test.each([undefined, ''])(
    'serverFns.generateFunctionId returning %j: the default id, which the SSR build resolves',
    async (returned) => {
      const { client, ssr } = await buildStart({
        bundler,
        files: greetFiles,
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
        start: { serverFns: { generateFunctionId: () => returned } },
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
      ).toEqual({
        id: expect.stringMatching(/^[0-9a-f]{64}$/),
        value: 'MARK_HANDLER',
      })
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

  // A generator that embeds the documented inputs in a readable id: every
  // server fn of the module, also of a name the module repeats or nested in
  // functions, gets an id the client's request carries whole to the server
  // (a URL path segment), and the call runs its own handler. functionName
  // is the handler name earlier versions generated, so custom ids survive
  // the upgrade.
  test(
    'serverFns.generateFunctionId embedding functionName: each server fn of one module reaches its own handler',
    async () => {
      const received = new Set<string>()
      const { client, ssr } = await buildStart({
        bundler,
        files: {
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
let first
let second
{
  const twice = createServerFn().handler(async () => 'the first twice')
  first = twice
}
{
  const twice = createServerFn().handler(async () => 'the second twice')
  second = twice
}
export { first, second }
export function outer() {
  const fn = createServerFn().handler(async () => 'in outer')
  function inner() {
    const fn = createServerFn().handler(async () => 'in inner')
    return fn
  }
  return { fn, inner }
}
`,
          'src/client-entry.ts': `export * from './fns'\n`,
          'src/ssr-entry.ts': `export * from './fns'
${callByIdExports}`,
        },
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
        start: {
          serverFns: {
            generateFunctionId: ({ filename, functionName }) => {
              received.add(functionName)
              return `${filename.replace(/[^A-Za-z0-9]+/g, '-')}-${functionName}`
            },
          },
        },
      })
      const urls = (
        await client.run(`return {
  first: entry.first.url,
  second: entry.second.url,
  outer: entry.outer().fn.url,
  inner: entry.outer().inner().url,
}`)
      ).result as Record<string, string>
      expect(
        (
          await ssr.run(
            `${callByIdPrelude}const urls = ${JSON.stringify(urls)}
const called = {}
for (const [name, url] of Object.entries(urls)) {
  called[name] = await callById(serverFnId(url))
}
return called`,
          )
        ).result,
      ).toEqual({
        first: 'the first twice',
        second: 'the second twice',
        outer: 'in outer',
        inner: 'in inner',
      })
      expect([...received].sort()).toEqual([
        'fn_createServerFn_handler',
        'fn_createServerFn_handler_1',
        'twice_createServerFn_handler',
        'twice_createServerFn_handler_1',
      ])
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
