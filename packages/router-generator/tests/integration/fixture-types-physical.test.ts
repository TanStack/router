/**
 * The types of the route trees of the generator fixtures without a virtual
 * route config agree with the router (SPEC J1.13; helper and method:
 * fixture-types.ts).
 */
import { describe, expect } from 'vitest'
import { test } from '../test'
import { typeErrorsOfFixture, typedFixtureNames } from './fixture-types'

const names = (await typedFixtureNames()).filter(
  (name) => !name.startsWith('virtual'),
)

// (route-groups and nested-route-groups-with-layouts-before-physical: a
// pathless layout in a route group directory, `(bar)/_bar.tsx`, was typed
// with `fullPath: ''` while the router gives it `/`; same bug as the group
// layout row of route-types.test.ts. Source: src/utils.ts `inferFullPath`.)
describe('the types of the generator fixtures without a virtual route config', () => {
  test.for(names)(
    'the "%s" route tree types its routes like the router',
    async (name, { appRoot }) => {
      expect(await typeErrorsOfFixture(appRoot, name)).toEqual([])
    },
  )
})
