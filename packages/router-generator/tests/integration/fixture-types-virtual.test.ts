/**
 * The types of the route trees of the generator fixtures with a virtual
 * route config (`virtual*`) agree with the router (SPEC J1.13; helper and
 * method: fixture-types.ts).
 */
import { describe, expect } from 'vitest'
import { test } from '../test'
import { typeErrorsOfFixture, typedFixtureNames } from './fixture-types'

const names = (await typedFixtureNames()).filter((name) =>
  name.startsWith('virtual'),
)

describe('the types of the generator fixtures with a virtual route config', () => {
  test.for(names)(
    'the "%s" route tree types its routes like the router',
    async (name, { appRoot }) => {
      expect(await typeErrorsOfFixture(appRoot, name)).toEqual([])
    },
  )
})
