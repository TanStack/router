/**
 * Server fns of several modules behind one `export *` barrel (SPEC J4.2,
 * J4.4): API objects whose server fns share property names across modules
 * (`usersApi.get`, `postsApi.get`) and whose handlers read module state of
 * the same name (`store`), and unexported server fns of the same
 * name in two modules, re-exported again by a second barrel. The app
 * builds and runs with no diagnostic about the barrels, in builds and on
 * dev servers, and every server fn answers its own client's call.
 */
import { pluginReact } from '@rsbuild/plugin-react'
import { describe, expect, onTestFinished, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  requestsOfPrelude,
  startBundlers,
} from '../build-harness'
import { callServerFn, startDevServer, startRequestFiles } from '../dev-server'
import { startRsbuildStartDevServer } from '../rsbuild-dev-server'
import { rootDocument, routerFile, startPageEntries } from './start-compose-app'

const timeout = 90_000

const head = `import { createServerFn } from '@tanstack/react-start'\n`

/**
 * An API object of server fns, as apps group them by resource, whose
 * handlers read module state (the same name in every such module).
 */
const api = (
  resource: string,
) => `${head}const store = new Map([['get', 'MARK_${resource}_get'], ['list', 'MARK_${resource}_list']])
export const ${resource}Api = {
  get: createServerFn().handler(async () => store.get('get')),
  list: createServerFn().handler(async () => store.get('list')),
}
`

/**
 * A module whose exported loader calls an unexported server fn named
 * `fetchData` (with the caller's options: a test sees its request).
 */
const loader = (
  name: string,
) => `${head}const fetchData = createServerFn().handler(async () => 'MARK_${name}')
export const ${name} = (options?: Parameters<typeof fetchData>[0]) => fetchData(options)
`

const apiFiles = {
  'src/api/users.ts': api('users'),
  'src/api/posts.ts': api('posts'),
  'src/api/loadA.ts': loader('loadA'),
  'src/api/loadB.ts': loader('loadB'),
  'src/api/index.ts': `export * from './users'
export * from './posts'
export * from './loadA'
export * from './loadB'
`,
  'src/barrel.ts': `export * from './api'\n`,
}

/** The barrel files, each of which a diagnostic about them would name. */
const barrels = ['src/api/index.ts', 'src/barrel.ts']

/** The API objects' server fns (by their path from the barrel) and their results. */
const calls = {
  'usersApi.get': 'MARK_users_get',
  'usersApi.list': 'MARK_users_list',
  'postsApi.get': 'MARK_posts_get',
  'postsApi.list': 'MARK_posts_list',
}
const expected = {
  ...calls,
  loadA: 'MARK_loadA',
  loadB: 'MARK_loadB',
}

describe.each(startBundlers)('%s build', (bundler) => {
  test(
    'server fns behind `export *` barrels build with no diagnostic about the barrels, and each answers its own call by id',
    async () => {
      const build = await buildStart({
        bundler,
        files: {
          ...apiFiles,
          'src/client-entry.ts': `export { usersApi, postsApi, loadA, loadB } from './barrel'\n`,
          'src/ssr-entry.ts': `export { usersApi, postsApi, loadA, loadB } from './barrel'
${callByIdExports}`,
        },
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
      })
      for (const file of barrels) {
        expect(
          findDiagnostics(build.diagnostics, { file, root: build.root }),
        ).toEqual([])
      }
      // The URL each server fn's client call requests.
      const urls = (
        await build.client.run(`${requestsOfPrelude}
const fns = { ${Object.keys(expected)
          .map((name) => `${JSON.stringify(name)}: entry.${name}`)
          .join(', ')} }
const urls = {}
for (const [name, fn] of Object.entries(fns)) {
  urls[name] = (await requestsOf(fn))[0]?.url
}
return urls`)
      ).result as Record<string, string>
      const { result } = await build.ssr.run(`${callByIdPrelude}
const urls = ${JSON.stringify(urls)}
const results = {}
for (const [name, url] of Object.entries(urls)) {
  try {
    results[name] = await callById(serverFnId(url))
  } catch (error) {
    results[name] = 'rejected: ' + String(error?.message ?? error)
  }
}
return results`)
      expect(result).toEqual(expected)
    },
    timeout,
  )
})

describe('Vite dev', () => {
  test(
    'server fns behind `export *` barrels each answer their own call by id',
    async () => {
      const server = await startDevServer({
        start: {},
        files: { ...startRequestFiles, ...apiFiles },
      })
      const m = await server.import('/src/barrel.ts')
      const results: Record<string, unknown> = {}
      for (const name of Object.keys(calls)) {
        const [object, key] = name.split('.') as [string, string]
        results[name] = await callServerFn(server, m[object][key])
      }
      expect(results).toEqual(calls)
    },
    timeout,
  )
})

describe('Rsbuild dev', () => {
  test(
    'server fns behind `export *` barrels compile with no error, and each answers its own call from the page',
    async () => {
      const server = await startRsbuildStartDevServer({
        browser: true,
        hmr: false,
        config: { plugins: [pluginReact()] },
        files: {
          ...startPageEntries,
          ...apiFiles,
          'src/ssr-entry.ts': `export { getRouter } from './router'`,
          'src/router.ts': routerFile,
          'src/routes/__root.tsx': rootDocument(),
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => null })`,
          'src/client-entry.ts': `import './entry'`,
          'src/entry.ts': `import { usersApi, postsApi, loadA, loadB } from './barrel'
;(globalThis as Record<string, unknown>).fns = {
  'usersApi.get': usersApi.get,
  'usersApi.list': usersApi.list,
  'postsApi.get': postsApi.get,
  'postsApi.list': postsApi.list,
  loadA,
  loadB,
}
`,
        },
      })
      expect(server.errors).toEqual([])
      for (const file of barrels) {
        expect(
          findDiagnostics(server.diagnostics, { file, root: server.root }),
        ).toEqual([])
      }
      const page = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      await page.waitForText('hydrated', { selector: '[data-testid=hydrated]' })
      const result = await page.page.evaluate(async () => {
        const fns = (globalThis as any).fns as Record<string, () => unknown>
        const results: Record<string, unknown> = {}
        for (const [name, fn] of Object.entries(fns)) {
          try {
            results[name] = await fn()
          } catch (error) {
            results[name] = `rejected: ${String((error as Error).message)}`
          }
        }
        return results
      })
      expect(page.errors).toEqual([])
      expect(result).toEqual(expected)
    },
    timeout,
  )
})
