import { bench, describe, expect } from 'vitest'
import { lifecycleEnd, runRouteLifecycle } from '../src/router'
import type { AnyRouteMatch, AnyRouter, AnyRoute } from '../src'
import type { LoadTransaction } from '../src/load-client'

function originalLifecycle(
  router: AnyRouter,
  previous: Array<AnyRouteMatch>,
  matches: Array<AnyRouteMatch>,
  owner?: LoadTransaction,
): void {
  for (const match of previous) {
    if (owner && router._tx !== owner) {
      return
    }
    if (
      matches.find(
        (candidate) =>
          candidate.routeId === match.routeId ||
          candidate.status === 'error' ||
          candidate.status === 'notFound' ||
          candidate._notFound,
      )?.routeId !== match.routeId
    ) {
      ;(router.routesById as Record<string, AnyRoute>)[
        match.routeId
      ]!.options.onLeave?.(match)
    }
    if (
      match.status === 'error' ||
      match.status === 'notFound' ||
      match._notFound
    ) {
      break
    }
  }
  for (const match of matches) {
    if (owner && router._tx !== owner) {
      return
    }
    ;(router.routesById as Record<string, AnyRoute>)[match.routeId]!.options[
      previous.find(
        (candidate) =>
          candidate.routeId === match.routeId ||
          candidate.status === 'error' ||
          candidate.status === 'notFound' ||
          candidate._notFound,
      )?.routeId === match.routeId
        ? 'onStay'
        : 'onEnter'
    ]?.(match)
    if (
      match.status === 'error' ||
      match.status === 'notFound' ||
      match._notFound
    ) {
      break
    }
  }
}

// Compare callback dispatch itself, with both implementations receiving the
// same snapshots. Batch small route trees to amortize the timing overhead.
for (const depth of [1, 2, 4, 12]) {
  for (const scenario of [
    'stay',
    'replace',
    'hide',
    'reveal',
    'hidden',
    'first-load',
    'no-hooks',
    'sparse-hooks',
    'root-error',
    'leaf-notFound',
  ] as const) {
    if (
      process.env.LIFECYCLE_BENCH_CASE &&
      !`${scenario}, depth ${depth}`.includes(process.env.LIFECYCLE_BENCH_CASE)
    ) {
      continue
    }
    describe(`${scenario}, depth ${depth}`, () => {
      let calls: Array<string> | undefined
      let count = 0
      const callback = (name: string) => () => {
        count++
        calls?.push(name)
      }
      const makeMatches = (prefix: string, hidden: boolean) =>
        Array.from({ length: depth }, (_, index) => ({
          routeId: index < 1 ? `shared${index}` : `${prefix}${index}`,
          status: 'success',
          _notFound: hidden && index === Math.min(1, depth - 1),
        })) as Array<AnyRouteMatch>
      const previous =
        scenario === 'first-load'
          ? []
          : makeMatches('a', scenario === 'reveal' || scenario === 'hidden')
      const matches = makeMatches(
        scenario === 'replace' ? 'b' : 'a',
        scenario === 'hide' || scenario === 'hidden',
      )
      if (scenario === 'root-error') {
        matches[0]!.status = 'error'
      }
      if (scenario === 'leaf-notFound') {
        matches[depth - 1]!.status = 'notFound'
      }
      const owner = depth === 1 ? undefined : ([] as unknown as LoadTransaction)
      const router = {
        _tx: owner,
        routesById: Object.fromEntries(
          [...previous, ...matches].map((match) => [
            match.routeId,
            {
              options:
                scenario === 'no-hooks' ||
                (scenario === 'sparse-hooks' && match.routeId !== 'shared0')
                  ? {}
                  : {
                      onEnter: callback(`enter:${match.routeId}`),
                      onStay: callback(`stay:${match.routeId}`),
                      onLeave: callback(`leave:${match.routeId}`),
                    },
            },
          ]),
        ),
      } as unknown as AnyRouter
      const previousEnd = lifecycleEnd(previous)
      const candidateLifecycle = (
        router: AnyRouter,
        previous: Array<AnyRouteMatch>,
        matches: Array<AnyRouteMatch>,
        owner?: LoadTransaction,
      ) => {
        const nextEnd = (router._lifecycleEnd = lifecycleEnd(matches))
        runRouteLifecycle(
          router,
          previous,
          matches,
          previousEnd,
          nextEnd,
          owner,
        )
      }
      calls = []
      originalLifecycle(router, previous, matches, owner)
      const expected = calls
      calls = []
      candidateLifecycle(router, previous, matches, owner)
      expect(calls).toEqual(expected)
      calls = undefined
      for (const [name, run] of [
        ['original', originalLifecycle],
        ['candidate', candidateLifecycle],
      ] as const) {
        bench(
          name,
          () => {
            for (let i = 0; i < 100; i++) {
              router._lifecycleEnd = previousEnd
              run(router, previous, matches, owner)
            }
          },
          { time: 300 },
        )
      }
    })
  }
}
