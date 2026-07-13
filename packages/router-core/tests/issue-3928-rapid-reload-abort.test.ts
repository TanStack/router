import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * Repro for https://github.com/TanStack/router/issues/3928
 *
 * Rapid same-route reloads (loaderDeps changing on every keystroke) abort the
 * superseded in-flight loader generation. Loaders that forward
 * abortController.signal to fetch() re-throw an AbortError when that happens.
 * That AbortError belongs to an abandoned load pass: it must never be
 * committed as a route error (historically it surfaced through the root
 * error boundary as "signal is aborted without reason"), and the parent
 * stay-match must keep its own un-aborted signal and settled data.
 */

const waitForMacrotask = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })

describe('issue #3928: rapid reloads abort superseded loaders silently', () => {
  test('superseded loader AbortErrors never surface as route errors', async () => {
    let rootLoaderCalls = 0
    let rootSignal: AbortSignal | undefined

    const indexInvocations = new Map<
      string,
      { resolve: () => void; signal: AbortSignal }
    >()

    const rootRoute = new BaseRootRoute({
      loader: ({ abortController }: { abortController: AbortController }) => {
        rootLoaderCalls++
        rootSignal = abortController.signal
        return 'root data'
      },
    })

    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      validateSearch: (search: Record<string, unknown>) => ({
        filter: typeof search.filter === 'string' ? search.filter : '',
      }),
      loaderDeps: ({ search }: { search: { filter: string } }) => ({
        filter: search.filter,
      }),
      loader: ({
        deps,
        abortController,
      }: {
        deps: { filter: string }
        abortController: AbortController
      }) =>
        new Promise<string>((resolve, reject) => {
          indexInvocations.set(deps.filter, {
            resolve: () => resolve(`data:${deps.filter}`),
            signal: abortController.signal,
          })
          abortController.signal.addEventListener('abort', () => {
            const abortError = new Error('signal is aborted without reason')
            abortError.name = 'AbortError'
            reject(abortError)
          })
        }),
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const initialLoad = router.load()
    await vi.waitFor(() => expect(indexInvocations.has('')).toBe(true))
    indexInvocations.get('')!.resolve()
    await initialLoad

    expect(rootLoaderCalls).toBe(1)
    expect(rootSignal?.aborted).toBe(false)

    // Rapid "keystroke" navigations: each one changes loaderDeps, so each
    // starts a new index loader generation and supersedes the previous one.
    const nav1 = router.navigate({ to: '/', search: { filter: 'a' } })
    await vi.waitFor(() => expect(indexInvocations.has('a')).toBe(true))

    const nav2 = router.navigate({ to: '/', search: { filter: 'ab' } })
    await vi.waitFor(() => expect(indexInvocations.has('ab')).toBe(true))
    // The superseded generation's signal is aborted (its fetch is canceled).
    await vi.waitFor(() =>
      expect(indexInvocations.get('a')!.signal.aborted).toBe(true),
    )

    const nav3 = router.navigate({ to: '/', search: { filter: 'abc' } })
    await vi.waitFor(() => expect(indexInvocations.has('abc')).toBe(true))
    await vi.waitFor(() =>
      expect(indexInvocations.get('ab')!.signal.aborted).toBe(true),
    )

    // Give the aborted generations' rejections time to (incorrectly) commit.
    await waitForMacrotask()
    await waitForMacrotask()

    for (const match of router.state.matches) {
      expect(match.status).not.toBe('error')
      expect((match.error as Error | undefined)?.name).not.toBe('AbortError')
    }

    indexInvocations.get('abc')!.resolve()
    await Promise.all([nav1, nav2, nav3])

    expect(router.state.location.search).toEqual({ filter: 'abc' })

    const indexMatch = router.state.matches.find(
      (match) => match.routeId === indexRoute.id,
    )!
    expect(indexMatch.status).toBe('success')
    expect(indexMatch.error).toBeUndefined()
    expect(indexMatch.loaderData).toBe('data:abc')

    const rootMatch = router.state.matches[0]!
    expect(rootMatch.status).toBe('success')
    expect(rootMatch.error).toBeUndefined()
    expect(rootMatch.loaderData).toBe('root data')

    // The parent stay-match was never re-fetched or aborted by the churn.
    expect(rootLoaderCalls).toBe(1)
    expect(rootSignal?.aborted).toBe(false)
  })
})
