import { afterEach, describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute } from '../src'
import {
  defaultLoadModule,
  getLoadModule,
  setLoadModule,
} from '../src/router'
import { createTestRouter } from './routerTestUtils'

afterEach(() => {
  setLoadModule(undefined)
})

describe('loadModule', () => {
  test('defaults to defaultLoadModule', () => {
    expect(getLoadModule()).toBe(defaultLoadModule)
  })

  test('createRouter installs options.loadModule', () => {
    const loadModule = async (url: string) => ({ default: url })
    const router = createTestRouter({
      routeTree: new BaseRootRoute({}),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      loadModule,
    })

    expect(router.options.loadModule).toBe(loadModule)
    expect(getLoadModule()).toBe(loadModule)
  })

  test('setLoadModule(undefined) restores the default', () => {
    const loadModule = async (url: string) => ({ default: url })
    setLoadModule(loadModule)
    expect(getLoadModule()).toBe(loadModule)
    setLoadModule(undefined)
    expect(getLoadModule()).toBe(defaultLoadModule)
  })
})
