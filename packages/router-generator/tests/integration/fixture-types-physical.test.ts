/**
 * The types of the route trees of the generator fixtures without a virtual
 * route config agree with the router (SPEC J1.13; helper and method:
 * fixture-types.ts).
 */
import { describe, expect, test } from 'vitest'
import {
  knownTypeBugs,
  typeErrorsOfFixture,
  typedFixtureNames,
} from './fixture-types'

const names = (await typedFixtureNames()).filter(
  (name) => !name.startsWith('virtual'),
)

describe('the types of the generator fixtures without a virtual route config', () => {
  test.each(names)(
    'the "%s" route tree types its routes like the router',
    async (name) => {
      expect(await typeErrorsOfFixture(name)).toEqual([])
    },
  )

  // Bug: a pathless layout in a route group directory
  // (`(group-a)/_layout-a.tsx`, `(bar)/_bar.tsx`) is typed with
  // `fullPath: ''` while the router gives it `/` (the same bug as the
  // group layout pin of route-types.test.ts, `(marketing)/route.tsx`).
  // Source: src/utils.ts:929-950 (`inferFullPath`: `/(group-a)/_layout-a`
  // without its layout segment and group is `/`, which is no index path, so
  // its trailing slash is dropped).
  // Impact: `Route.fullPath` and the types derived from it (`from` of links
  // and hooks) say `''` in such a layout while the app sees `/`.
  test.fails.each([...knownTypeBugs])(
    'the "%s" route tree types its routes like the router',
    async (name) => {
      expect(await typeErrorsOfFixture(name)).toEqual([])
    },
  )
})
