import { afterEach, expect, test, vi } from 'vitest'
import { createControlledPromise } from '../src'
import { loadRouteChunk } from '../src/route-chunks'

afterEach(() => {
  vi.unstubAllEnvs()
})

test('production lazy loading does not let an obsolete hot owner overwrite its successor', async () => {
  vi.stubEnv('NODE_ENV', 'production')

  const obsoleteImport = createControlledPromise<any>()
  const successorImport = createControlledPromise<any>()
  const obsoleteComponent = () => null
  const successorComponent = () => null
  const route = {
    options: {},
    lazyFn: () => obsoleteImport,
  } as any

  const obsoleteLoad = loadRouteChunk(route)
  route._lazy = undefined
  route.lazyFn = () => successorImport
  const successorLoad = loadRouteChunk(route)
  const successorOwner = route._lazy

  obsoleteImport.resolve({ options: { component: obsoleteComponent } })
  await obsoleteLoad

  expect(route.options.component).not.toBe(obsoleteComponent)
  expect(route._lazy).toBe(successorOwner)

  successorImport.resolve({ options: { component: successorComponent } })
  await successorLoad

  expect(route.options.component).toBe(successorComponent)
  expect(route._lazy).toBe(true)
})
