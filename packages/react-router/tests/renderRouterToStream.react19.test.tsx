import { Suspense } from 'react'
import { afterEach, describe, expect, test } from 'vitest'
import { attachRouterServerSsrUtils } from '@tanstack/router-core/ssr/server'
import { HYDRATION_SCRIPT_BOUNDARY_SOURCE } from '../../router-core/src/ssr/hydrationScripts'
import {
  RouterContextProvider,
  Scripts,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '../src'
import { renderRouterToStream } from '../src/ssr/renderRouterToStream'
import type { AnyRouter } from '@tanstack/router-core'

const activeRouters: Array<AnyRouter> = []

afterEach(() => {
  for (const router of activeRouters.splice(0)) {
    router.serverSsr?.cleanup()
  }
})

async function buildRouter(dehydratedData: { routerData: Promise<string> }) {
  const rootRoute = createRootRoute({ component: () => null })
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/'] }),
    routeTree: rootRoute,
    dehydrate: () => dehydratedData,
  })
  activeRouters.push(router)
  router.isServer = true
  attachRouterServerSsrUtils({ router, manifest: undefined })
  await router.load()
  await router.serverSsr!.dehydrate()
  return router
}

function createSuspendingComponent(id: string, text: string) {
  let ready = false
  let resolve!: () => void
  const pending = new Promise<void>((done) => {
    resolve = () => {
      ready = true
      done()
    }
  })

  return {
    Component() {
      if (!ready) {
        throw pending
      }
      return <div id={id}>{text}</div>
    },
    resolve,
  }
}

async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Timed out waiting for React SSR output')),
          2000,
        )
      }),
    ])
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  state: { html: string },
  condition: (html: string) => boolean,
) {
  while (!condition(state.html)) {
    const { done, value } = await readWithTimeout(reader)
    if (done) {
      throw new Error('React SSR response ended before the expected output')
    }
    state.html += decoder.decode(value, { stream: true })
  }
}

describe('renderRouterToStream - real React 19 renderer', () => {
  test('emits router data after a real Suspense patch while React is still rendering', async () => {
    let resolveRouterData!: (value: string) => void
    const routerData = new Promise<string>((resolve) => {
      resolveRouterData = resolve
    })
    const router = await buildRouter({ routerData })
    const first = createSuspendingComponent('first-result', 'first-resolved')
    const second = createSuspendingComponent('second-result', 'second-resolved')
    const requestController = new AbortController()

    const { response } = await renderRouterToStream({
      request: new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      router,
      responseHeaders: new Headers(),
      children: (
        <html>
          <body>
            <RouterContextProvider router={router}>
              <Suspense fallback={<p>first-fallback</p>}>
                <first.Component />
              </Suspense>
              <Suspense fallback={<p>second-fallback</p>}>
                <second.Component />
              </Suspense>
              <Scripts />
            </RouterContextProvider>
          </body>
        </html>
      ),
    })
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    const state = { html: '' }

    try {
      await readUntil(reader, decoder, state, (html) =>
        html.includes(HYDRATION_SCRIPT_BOUNDARY_SOURCE),
      )
      expect(state.html).toContain('first-fallback')
      expect(state.html).toContain('second-fallback')

      first.resolve()
      await readUntil(reader, decoder, state, (html) => {
        const result = html.indexOf('first-resolved')
        return result >= 0 && html.indexOf('</script>', result) >= 0
      })

      const firstResult = state.html.indexOf('first-resolved')
      const reactPatchEnd =
        state.html.indexOf('</script>', firstResult) + '</script>'.length
      const reactPatch = state.html.slice(firstResult, reactPatchEnd)
      expect(reactPatch).toContain('<script')
      expect(reactPatch.endsWith('</script>')).toBe(true)
      expect(state.html).not.toContain('second-resolved')
      expect(state.html).not.toContain('</body></html>')

      resolveRouterData('late-react19-router-value')
      await readUntil(reader, decoder, state, (html) =>
        html.includes('late-react19-router-value'),
      )

      // The second Suspense boundary still keeps React's renderer open. The
      // router batch can therefore only have used React's completed patch
      // script as its insertion point.
      const routerValue = state.html.indexOf('late-react19-router-value')
      expect(routerValue).toBeGreaterThan(reactPatchEnd)
      expect(state.html).not.toContain('second-resolved')
      expect(state.html).not.toContain('</body></html>')

      second.resolve()
      for (;;) {
        const { done, value } = await readWithTimeout(reader)
        if (done) {
          break
        }
        state.html += decoder.decode(value, { stream: true })
      }
      state.html += decoder.decode()

      expect(state.html).toContain('second-resolved')
      expect(state.html.endsWith('</body></html>')).toBe(true)
      expect(router.serverSsr).toBeUndefined()
    } finally {
      first.resolve()
      second.resolve()
      requestController.abort(new Error('test-complete'))
      await reader.cancel().catch(() => {})
    }
  })
})
