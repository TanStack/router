/**
 * Generated route trees of React, Solid and Vue apps loaded by the real
 * router: the pages render with each framework's server renderer (React with
 * react-dom, Solid with solid-js/web, Vue with its server renderer and
 * single-file components). The trees' types are checked in
 * integration/route-types.test.ts. Apps: real-router-cases.ts.
 */
import { describe } from 'vitest'
import { checkApp } from './real-router'
import { frameworkCases } from './real-router-cases'
import { test } from './test'

describe('the real router on the route trees of each framework', () => {
  test.for(frameworkCases)(
    '$name',
    { timeout: 60_000 },
    (testCase, { appRoot, routeTreeHost }) =>
      checkApp({ appRoot, routeTreeHost }, testCase, { types: false }),
  )
})
