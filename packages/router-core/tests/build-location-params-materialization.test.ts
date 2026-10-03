import { expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

test('literal params copy enumerable keys in order and keep __proto__ as owned data', () => {
  const token = Symbol('token')
  const hiddenToken = Symbol('hidden')
  const reads: Array<PropertyKey> = []
  const prototypeData = { marker: 'data' }
  const inherited = { inherited: 'excluded' }
  const params = Object.create(inherited) as { userId: string }
  const getUserId = () => {
    reads.push('userId')
    return '456'
  }
  Object.defineProperties(params, {
    '2': {
      enumerable: true,
      get: () => {
        reads.push('2')
        return 'two'
      },
    },
    '1': {
      enumerable: true,
      get: () => {
        reads.push('1')
        return 'one'
      },
    },
    userId: { enumerable: true, get: getUserId },
    note: {
      enumerable: true,
      get: () => {
        reads.push('note')
        return 'visible'
      },
    },
    ['__proto__']: { enumerable: true, value: prototypeData },
    hidden: {
      get: () => {
        reads.push('hidden')
        return 'excluded'
      },
    },
    [token]: {
      enumerable: true,
      get: () => {
        reads.push(token)
        return 'symbol-value'
      },
    },
    [hiddenToken]: {
      get: () => {
        reads.push(hiddenToken)
        return 'excluded'
      },
    },
  })
  const callerDescriptors = Object.getOwnPropertyDescriptors(params)

  let copied: object | undefined
  let keysAtEntry: Array<PropertyKey> | undefined
  let readsAtEntry: Array<PropertyKey> | undefined
  let userIdAtEntry: PropertyDescriptor | undefined
  const root = new BaseRootRoute({})
  const user = new BaseRoute({
    getParentRoute: () => root,
    path: '/users/$userId',
    params: {
      stringify: (merged) => {
        copied = merged
        keysAtEntry = Reflect.ownKeys(merged)
        readsAtEntry = [...reads]
        userIdAtEntry = Object.getOwnPropertyDescriptor(merged, 'userId')
        reads.push('stringify')
        return { userId: '789' }
      },
    },
  })
  const history = createMemoryHistory({ initialEntries: ['/users/123'] })
  const router = createTestRouter({
    routeTree: root.addChildren([user]),
    history,
  })

  try {
    expect(router.buildLocation({ to: '/users/$userId', params }).href).toBe(
      '/users/789',
    )
    expect(readsAtEntry).toEqual(['1', '2', 'userId', 'note', token])
    expect(reads).toEqual(['1', '2', 'userId', 'note', token, 'stringify'])
    expect(copied).not.toBe(params)
    expect(Object.getPrototypeOf(copied)).toBeNull()
    expect(keysAtEntry).toEqual([
      '1',
      '2',
      'userId',
      'note',
      '__proto__',
      token,
    ])
    expect(userIdAtEntry).toEqual({
      value: '456',
      writable: true,
      enumerable: true,
      configurable: true,
    })
    expect(Object.getOwnPropertyDescriptor(copied, '__proto__')).toEqual({
      value: prototypeData,
      writable: true,
      enumerable: true,
      configurable: true,
    })
    expect(Object.getOwnPropertyDescriptor(copied, token)).toEqual({
      value: 'symbol-value',
      writable: true,
      enumerable: true,
      configurable: true,
    })
    expect(Object.getOwnPropertyDescriptors(params)).toEqual(callerDescriptors)
    expect(Object.getPrototypeOf(params)).toBe(inherited)
  } finally {
    history.destroy()
  }
})

test('params updater result writes through its installed setter and retains descriptors', () => {
  const writes: Array<string> = []
  let selected = '123'
  let target: object | undefined
  const getUserId = () => selected
  const setUserId = (value: string) => {
    writes.push(value)
    selected = `${value}-via-setter`
  }
  const root = new BaseRootRoute({})
  const user = new BaseRoute({
    getParentRoute: () => root,
    path: '/users/$userId',
  })
  const history = createMemoryHistory({ initialEntries: ['/users/123'] })
  const router = createTestRouter({
    routeTree: root.addChildren([user]),
    history,
  })

  try {
    const location = router.buildLocation({
      to: '/users/$userId',
      params: (current: { userId: string }) => {
        target = current
        Object.defineProperty(current, 'userId', {
          enumerable: true,
          configurable: false,
          get: getUserId,
          set: setUserId,
        })
        return { userId: '456' }
      },
    })
    expect(location.href).toBe('/users/456-via-setter')
    expect(writes).toEqual(['456'])
    expect(Object.getOwnPropertyDescriptor(target, 'userId')).toEqual({
      get: getUserId,
      set: setUserId,
      enumerable: true,
      configurable: false,
    })
    expect(
      router.buildLocation({ to: '/users/$userId', params: true }).href,
    ).toBe('/users/123')
  } finally {
    history.destroy()
  }
})
