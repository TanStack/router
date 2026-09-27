import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { bench, describe, expect, vi } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import type { ParsedLocation } from '../src'
import type * as ReactStore from '@tanstack/react-store'

type Selection = [string | undefined, boolean?]
type Selector = (location: ParsedLocation) => Selection
const captured = vi.hoisted(() => ({
  select: undefined as Selector | undefined,
}))

// Capture the actual hook selector without exporting production internals or
// timing React renders. Locations below come from the public buildLocation API.
vi.mock('@tanstack/react-store', async (importOriginal) => {
  const original = await importOriginal<typeof ReactStore>()
  return {
    ...original,
    useSelector: (...args: Parameters<typeof original.useSelector>) => {
      captured.select = args[1] as Selector
      return original.useSelector(...args)
    },
  }
})

describe.each([
  'inactive',
  'active',
  'trailing-slash',
  'mixed-search',
  'dynamic',
  'dynamic-inactive',
  'dynamic-external',
  'changing-href',
  'direct-external',
] as const)('Link selector reruns: %s', (kind) => {
  const root = createRootRoute()
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/posts/$id' }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/posts/1'] }),
    trailingSlash: kind === 'trailing-slash' ? 'always' : 'never',
  })
  if (kind === 'dynamic-external') {
    router.history.createHref = () => 'https://other.example/'
  }
  const search = { filter: { page: 1, tags: ['a', 'b'] } }
  render(
    <RouterContextProvider router={router}>
      <Link
        to={
          kind === 'direct-external' ? 'https://other.example/' : '/posts/$id'
        }
        params={{ id: '1' }}
        search={
          kind.startsWith('dynamic')
            ? (previous: Record<string, unknown>) => previous
            : kind === 'mixed-search'
              ? search
              : {}
        }
      >
        Post
      </Link>
    </RouterContextProvider>,
  )
  const select = captured.select!
  const locations = Array.from({ length: 32 }, (_, i) =>
    router.buildLocation({
      to: '/posts/$id',
      params: { id: kind.endsWith('inactive') ? '2' : '1' },
      search: i % 2 === 0 ? search : {},
    }),
  )
  const build = vi.spyOn(router, 'buildLocation')
  select(locations[0]!)
  select(locations[1]!)
  if (kind === 'direct-external') {
    expect(build).not.toHaveBeenCalled()
  } else {
    expect(build.mock.results[0]!.value === build.mock.results[1]!.value).toBe(
      !kind.startsWith('dynamic'),
    )
  }
  build.mockRestore()
  for (const [i, location] of locations.entries()) {
    const selected = select(location)
    expect(selected[0]).toContain(
      kind.endsWith('external') ? 'https://other.example/' : '/posts/1',
    )
    expect(selected[1]).toBe(
      kind.endsWith('external')
        ? undefined
        : !kind.endsWith('inactive') &&
            (kind !== 'mixed-search' || i % 2 === 0),
    )
  }
  if (kind === 'changing-href') {
    let index = 0
    router.history.createHref = () => `/shell-${index++ % 2}#/posts/1`
    expect(select(locations[0]!)[0]).toBe('/shell-0#/posts/1')
    expect(select(locations[1]!)[0]).toBe('/shell-1#/posts/1')
  }
  cleanup()
  let checksum = 0
  bench(
    '1024 location updates',
    () => {
      for (let i = 0; i < 1024; i++) {
        const selected = select(locations[i % locations.length]!)
        checksum += selected[0]!.length + Number(selected[1] === true)
      }
    },
    {
      time: 1500,
      warmupTime: 500,
      iterations: 100,
      teardown: () => {
        expect(checksum).toBeGreaterThan(0)
      },
    },
  )
})
