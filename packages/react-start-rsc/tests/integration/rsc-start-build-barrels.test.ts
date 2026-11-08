/**
 * With RSC, on Vite and on Rsbuild: server fns of several modules behind
 * one `export *` barrel (SPEC J4.2, J4.4), as API objects whose server fns
 * share property names across modules and as unexported server fns of the
 * same name in two modules. The production build reports nothing about the
 * barrel, and each server fn answers its own call from the page and from
 * the route's loader on the server.
 */
import { describe, expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import {
  openRscPage,
  startRscPreviewServer,
  startRscRsbuildPreviewServer,
  waitForHydration,
} from './rsc-app'

const head = `import { createServerFn } from '@tanstack/react-start'\n`

/** An API object of server fns, as apps group them by resource. */
const api = (resource: string) => `${head}export const ${resource}Api = {
  get: createServerFn().handler(async () => 'MARK_${resource}_get'),
  list: createServerFn().handler(async () => 'MARK_${resource}_list'),
}
`

/** A module whose exported loader calls an unexported server fn named `fetchData`. */
const loader = (
  name: string,
) => `${head}const fetchData = createServerFn().handler(async () => 'MARK_${name}')
export const ${name} = () => fetchData()
`

const all = `[usersApi.get, usersApi.list, postsApi.get, postsApi.list, loadA, loadB]`
const results = [
  'MARK_users_get',
  'MARK_users_list',
  'MARK_posts_get',
  'MARK_posts_list',
  'MARK_loadA',
  'MARK_loadB',
].join(' ')

const files = {
  'src/api/users.ts': api('users'),
  'src/api/posts.ts': api('posts'),
  'src/api/loadA.ts': loader('loadA'),
  'src/api/loadB.ts': loader('loadB'),
  'src/api/index.ts': `export * from './users'
export * from './posts'
export * from './loadA'
export * from './loadB'
`,
  'src/routes/barrels.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { usersApi, postsApi, loadA, loadB } from '../api'
const callAll = async () => {
  const values = []
  for (const fn of ${all}) {
    values.push(await fn())
  }
  return values.join(' ')
}
export const Route = createFileRoute('/barrels')({
  loader: () => callAll(),
  component: Page,
})
function Page() {
  const loaded = Route.useLoaderData()
  const [called, setCalled] = useState('')
  return (
    <main>
      <p data-testid="loaded">loaded {loaded}</p>
      <p data-testid="called">called {called}</p>
      <button data-testid="call" onClick={() => callAll().then(setCalled)}>call</button>
    </main>
  )
}
`,
}

describe.each([
  ['vite', startRscPreviewServer],
  ['rsbuild', startRscRsbuildPreviewServer],
] as const)('%s', (_bundler, startServer) => {
  test('server fns behind an `export *` barrel build with no report about it, and each answers its own call', async () => {
    const server = await startServer({ files })
    expect(
      findDiagnostics(server.messages, {
        file: 'src/api/index.ts',
        root: server.root,
      }),
    ).toEqual([])
    const page = await openRscPage(server, '/barrels')
    await waitForHydration(page)
    await page.waitForText(`loaded ${results}`, {
      selector: '[data-testid=loaded]',
    })
    await page.page.locator('[data-testid=call]').click()
    await page.waitForText(`called ${results}`, {
      selector: '[data-testid=called]',
    })
  }, 90_000)
})
