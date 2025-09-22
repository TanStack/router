import { createMiddleware, createStart } from '@tanstack/react-start'

import {
  createRouter,
  createSerializationAdapter,
} from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'
import type { SSROption } from '@tanstack/router-core'
import type { Register } from '@tanstack/react-start'
import type {
  GetRegisteredConfigKey,
  RegisteredProperty,
} from '../../../../packages/router-core/dist/esm/router'

declare module '@tanstack/react-start' {
  interface Register {
    server: {
      requestContext: {
        fromFetch: boolean
      }
    }
  }
}

// @manuel
export const serverMw = createMiddleware().server(({ next, context }) => {
  context.fromFetch
  //      ^?

  return next({
    context: {
      fromServerMw: true,
    },
  })
})

export const fnMw = createMiddleware({ type: 'function' })
  .middleware([serverMw])
  .server(({ next, context }) => {
    context.fromFetch
    //      ^?

    return next({
      context: {
        fromFnMw: true,
      },
    })
  })

const serializeClass = createSerializationAdapter({
  key: 'Test',
  test: (v) => v instanceof Test,
  toSerializable: (v) => v.test,
  fromSerializable: (v) => new Test(v),
})

export class Test {
  constructor(public test: string) {}
  init() {
    return this.test
  }
}

export const startInstance = createStart(() => {
  return {
    // defaultSsr: false,
    serializationAdapters: [
      // serializeClass
    ],
    requestMiddleware: [serverMw],
    functionMiddleware: [fnMw],
  }
})

// type configKey2 = Register['configKey']

// type configKey = GetRegisteredConfigKey<Register>

// type test3 = Register[GetRegisteredConfigKey<Register>]['~types']

// type test = Register[GetRegisteredConfigKey<Register>] extends {
//   '~types': infer TTypes
// }
//   ? 'defaultSsr' extends keyof TTypes
//     ? TTypes['defaultSsr']
//     : unknown
//   : unknown

type RegisteredType<TRegister, TKey> =
  RegisteredProperty<TRegister, GetRegisteredConfigKey<TRegister>> extends {
    '~types': infer TTypes
  }
    ? TKey extends keyof TTypes
      ? TTypes[TKey]
      : unknown
    : unknown

type RegisteredSSROption<TRegister> =
  unknown extends RegisteredType<TRegister, 'defaultSsr'>
    ? SSROption
    : RegisteredType<TRegister, 'defaultSsr'>

type test = RegisteredSSROption<Register>

startInstance.createMiddleware().server(({ next, context }) => {
  context.fromFetch
  //      ^?
  context.fromServerMw
  //      ^?

  return next({
    context: {
      fromStartInstanceMw: true,
    },
  })
})

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    scrollRestoration: true,
  })
}
