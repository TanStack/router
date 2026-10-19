/**
 * The types of the route trees of the generator fixtures with a virtual
 * route config (`virtual*`) agree with the router (SPEC J1.13; helper and
 * method: fixture-types.ts).
 */
import { describe, expect, test } from 'vitest'
import { typeErrorsOfFixture, typedFixtureNames } from './fixture-types'

const names = (await typedFixtureNames()).filter((name) =>
  name.startsWith('virtual'),
)

describe('the types of the generator fixtures with a virtual route config', () => {
  test.each(names)(
    'the "%s" route tree types its routes like the router',
    async (name) => {
      expect(await typeErrorsOfFixture(name)).toEqual([])
    },
  )
})
