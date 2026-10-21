/**
 * A route file whose server fn the loader and the split component both read
 * (FIX-PLAN V2-01; SPEC G11, J4.1, J4.12, J2.3, J2.4): the Start compiler,
 * the code splitter and import protection compose on one module. Built
 * with Start's Vite and Rsbuild plugins and served like a deployed app
 * (start-compose-app.ts), with the real router: the server renders the
 * loader's data; in a real page, navigating to the route runs the loader
 * through the server fn and a click calls it again, both by the id the
 * server's handler is registered under; the component's chunk loads on
 * navigation; the route module's state initialises once in the page, and
 * the chunk shares it; nothing of the server-only module reaches the
 * client; import protection reports nothing. A Vite dev server with Start's
 * whole plugin serves the same app to a page.
 */
import react from '@vitejs/plugin-react'
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  onTestFinished,
  test,
} from 'vitest'
import { buildStart, callByIdPrelude, startBundlers } from '../build-harness'
import { startDevServer, startServerEntryFiles } from '../dev-server'
import { reportedViolations } from '../importProtection/start-apps'
import {
  openAppPage,
  pageEntries,
  rootDocument,
  routerFile,
  serveStartBuild,
  startPageEntries,
} from './start-compose-app'
import type { AppPage } from './start-compose-app'
import type { StartBuild } from '../build-harness'

const timeout = 60_000

const files = {
  'src/db.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
  'src/routes/__root.tsx': rootDocument(['/', '/posts']),
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p>MARK_HOME</p> })
`,
  'src/routes/posts.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { secret } from '../db.server'

// Module state the loader fills and the component reads: one instance.
const cache = new Map<string, string>()
// Top-level code of the route module: runs once per environment.
;(globalThis as any).__postsInits = ((globalThis as any).__postsInits ?? 0) + 1

const getPosts = createServerFn().handler(async () => 'posts:' + secret())

function Posts() {
  const data = Route.useLoaderData()
  const [clicked, setClicked] = useState('')
  return (
    <div>
      <p data-testid="data">{'MARK_POSTS_COMPONENT ' + data}</p>
      <button
        data-testid="load"
        onClick={async () => {
          setClicked((await getPosts()) + '|' + (cache.get('posts') ?? 'MARK_NO_CACHE'))
        }}
      >
        load
      </button>
      <p data-testid="clicked">{clicked}</p>
    </div>
  )
}

export const Route = createFileRoute('/posts')({
  loader: async () => {
    const posts = await getPosts()
    cache.set('posts', posts)
    return posts
  },
  component: Posts,
})
`,
  'src/router.ts': routerFile,
  ...pageEntries,
}

/**
 * Drives the page of the app at `/`: navigates to `/posts` (the loader runs
 * through the server fn), clicks `load` (the component calls it), and
 * returns what the page showed, sent and loaded.
 */
async function visitPosts(page: AppPage) {
  const scriptsBefore = page.scriptRequests.length
  await page.follow('posts')
  await page.waitForText('MARK_POSTS_COMPONENT posts:MARK_SECRET', {
    selector: '[data-testid=data]',
  })
  const scriptsLoadedForPosts = page.scriptRequests.slice(scriptsBefore)
  await page.page.locator('[data-testid=load]').click()
  await page.waitForText(/posts:MARK_SECRET\|/, {
    selector: '[data-testid=clicked]',
  })
  return {
    clicked: await page.text('[data-testid=clicked]'),
    inits: await page.page.evaluate<number>('globalThis.__postsInits'),
    requests: [...page.serverFnRequests],
    scriptsLoadedForPosts,
    errors: [...page.errors],
  }
}

/** What `visitPosts` must give, the loaded scripts aside. */
const visited = {
  // The click's call reached the handler, and the chunk reads the route
  // module's cache the loader filled (one instance).
  clicked: 'posts:MARK_SECRET|posts:MARK_SECRET',
  inits: 1,
  // The loader's call and the click's call: two requests, the same id.
  requests: [expect.stringMatching(/^\/_serverFn\/./), expect.any(String)],
  errors: [],
}

describe.each(startBundlers)('%s production build, served', (bundler) => {
  let build: StartBuild
  const cleanups: Array<() => Promise<void>> = []
  let served: Awaited<ReturnType<typeof serveStartBuild>>

  beforeAll(async () => {
    build = await buildStart({
      bundler,
      files: { ...startPageEntries, ...files },
      entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
      registerCleanup: (cleanup) => cleanups.push(cleanup),
    })
    served = await serveStartBuild(build, {
      registerCleanup: (cleanup) => cleanups.push(cleanup),
    })
  }, timeout)

  afterAll(async () => {
    await Promise.all(cleanups.map((cleanup) => cleanup()))
  })

  test('nothing of the server-only module is in the client build, and import protection reports nothing', () => {
    expect({
      secret: build.client.where('MARK_SECRET'),
      serverModule: build.client.chunks
        .filter((chunk) => chunk.code.includes('db.server'))
        .map((chunk) => chunk.fileName),
      // (every channel of the build)
      violations: reportedViolations(build),
    }).toEqual({ secret: 'nowhere', serverModule: [], violations: [] })
  })

  test('the component is in a chunk of its own', () => {
    expect(build.client.where('MARK_POSTS_COMPONENT')).toBe('lazy')
  })

  test(
    'the server renders the loader data through the server fn',
    async () => {
      const { result } = await build.ssr.run(
        `return await entry.renderPath(entry.getRouter().routeTree, '/posts')`,
      )
      expect(result).toContain('MARK_POSTS_COMPONENT posts:MARK_SECRET')
    },
    timeout,
  )

  // Same bug as known-bugs-start-compiler.test.ts "SSR: a server fn module
  // is initialised once and shares its state with SSR code": the SSR bundle
  // holds the route module twice (the SSR module and the server fn provider
  // module of the same file), so its top-level code runs twice.
  test.fails(
    'the server runs the route module once',
    async () => {
      const { result } = await build.ssr.run(
        `await entry.renderPath(entry.getRouter().routeTree, '/posts')
return globalThis.__postsInits`,
      )
      expect(result).toBe(1)
    },
    timeout,
  )

  test(
    'the page navigates to the route, loads its chunk, and the loader and a click call the same server fn the server answers',
    async () => {
      const page = await openAppPage(served, '/', {
        registerCleanup: onTestFinished,
      })
      await page.waitForText('MARK_HOME', { selector: '#app' })
      const result = await visitPosts(page)
      const chunks = build.client.locate('MARK_POSTS_COMPONENT').lazy
      expect(result).toEqual({
        ...visited,
        scriptsLoadedForPosts: expect.arrayContaining(
          chunks.map((chunk) => `/${chunk}`),
        ),
      })
      expect(result.requests[1]).toBe(result.requests[0])
      // That id is the one the server's handler is registered under.
      const id = result.requests[0]!.slice('/_serverFn/'.length)
      expect(
        (
          await build.ssr.run(
            `${callByIdPrelude}return await callById(${JSON.stringify(id)})`,
          )
        ).result,
      ).toBe('posts:MARK_SECRET')
    },
    timeout,
  )
})

describe('Vite dev server with Start', () => {
  test(
    'the page navigates to the route, and the loader and a click call the same server fn the dev server answers',
    async () => {
      const server = await startDevServer({
        start: {},
        browser: true,
        config: {
          optimizeDeps: {
            include: [
              'react',
              'react/jsx-dev-runtime',
              'react-dom',
              'react-dom/client',
              '@tanstack/react-router',
              '@tanstack/react-router > @tanstack/router-core > seroval',
              '@tanstack/react-router > @tanstack/router-core > seroval-plugins/web',
            ],
          },
        },
        plugins: [react()],
        files: {
          ...startServerEntryFiles,
          'harness/client-entry.ts':
            startPageEntries['harness/client-entry.ts'],
          ...files,
        },
      })
      const page = await openAppPage({ url: server.url! }, '/', {
        registerCleanup: onTestFinished,
      })
      await page.waitForText('MARK_HOME', { selector: '#app' })
      const result = await visitPosts(page)
      expect(result).toEqual({
        ...visited,
        scriptsLoadedForPosts: expect.any(Array),
      })
      // The route's component loads on navigation: one of the scripts the
      // page requested then serves it (whatever its URL).
      const served = await Promise.all(
        result.scriptsLoadedForPosts.map(
          async (url) => (await server.fetch(url)).body,
        ),
      )
      expect(served.some((code) => code.includes('MARK_POSTS_COMPONENT'))).toBe(
        true,
      )
      expect(result.requests[1]).toBe(result.requests[0])
      // (every channel of the dev server)
      expect(reportedViolations(server)).toEqual([])
    },
    timeout,
  )
})
