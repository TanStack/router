/**
 * Not part of the compiler test corpus (out of scope: start manifest
 * metadata, i.e. which chunks and stylesheets the server's start manifest
 * tells SSR to preload and link; no compiler job decides it).
 *
 * The start manifest of a real build (`tanstack-start-manifest:v`), through
 * Start's Vite and Rsbuild plugins (build-harness.ts).
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  buildStart,
  routerRuntimeFiles,
  startBundlers,
} from '../../build-harness'
import type { StartBuild } from '../../build-harness'

const timeout = 60_000

const head = `import { createFileRoute } from '@tanstack/react-router'\n`
const handlers = `server: { handlers: { GET: () => new Response('x') } }`

/**
 * Pages (`/`, and `/users/profile`, whose component imports a stylesheet,
 * under the server-only `/users`) and a server-only subtree (`/api`,
 * `/api/inner`).
 */
const files = {
  ...routerRuntimeFiles,
  'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
  'src/routes/index.tsx': `${head}export const Route = createFileRoute('/')({ component: () => 'MARK_INDEX' })\n`,
  'src/routes/users.tsx': `${head}export const Route = createFileRoute('/users')({ ${handlers} })\n`,
  'src/routes/users/profile.tsx': `${head}import { Profile } from '../../components/Profile'
export const Route = createFileRoute('/users/profile')({ component: Profile })
`,
  'src/components/Profile.tsx': `import './profile.css'
export const Profile = () => 'MARK_PROFILE'
`,
  'src/components/profile.css': `.profile::after { content: 'MARK_PROFILE_CSS'; }\n`,
  'src/routes/api.tsx': `${head}export const Route = createFileRoute('/api')({ ${handlers} })\n`,
  'src/routes/api/inner.tsx': `${head}export const Route = createFileRoute('/api/inner')({ ${handlers} })\n`,
  'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
  // Start's server entry renders with the start manifest
  'src/ssr-entry.ts': `export { getRouter } from './router'
export { tsrStartManifest } from 'tanstack-start-manifest:v'
`,
}

describe.each(startBundlers)('%s build', (bundler) => {
  let build: StartBuild
  let dispose: (() => Promise<void>) | undefined
  beforeAll(async () => {
    build = await buildStart({
      bundler,
      files,
      entry: { client: 'src/router.ts', ssr: 'src/ssr-entry.ts' },
      registerCleanup: (cleanup) => {
        dispose = cleanup
      },
    })
  }, timeout)
  afterAll(() => dispose?.())

  /** The start manifest the SSR build renders with. */
  async function startManifest() {
    return (await build.ssr.run(`return entry.tsrStartManifest()`)).result as {
      routes: Record<
        string,
        { preloads?: Array<string>; css?: Array<string | { href: string }> }
      >
    }
  }

  // Source: mutation round 3 start-router A (no build test loaded the start
  // manifest).
  test("the start manifest preloads each page's component chunk", async () => {
    const { routes } = await startManifest()
    /** The client chunk of a component, as a URL. */
    const chunkOf = (marker: string) => {
      const [chunk] = build.client.locate(marker).lazy
      return `/${chunk}`
    }
    expect({
      index: routes['/']?.preloads,
      profile: routes['/users/profile']?.preloads,
    }).toEqual({
      index: expect.arrayContaining([chunkOf('MARK_INDEX')]),
      profile: expect.arrayContaining([chunkOf('MARK_PROFILE')]),
    })
  })

  test("the start manifest links the stylesheet of a page's component", async () => {
    const { routes } = await startManifest()
    const stylesheets = await Promise.all(
      (routes['/users/profile']?.css ?? []).map((link) =>
        readFile(
          path.join(
            build.client.outDir,
            typeof link === 'string' ? link : link.href,
          ),
          'utf8',
        ),
      ),
    )
    expect(
      stylesheets.filter((css) => css.includes('MARK_PROFILE_CSS')),
    ).toHaveLength(1)
  })
})
