import {
  defineStart,
  RegisteredStartConfig,
  Register,
  RegisteredRequestContext,
} from '@tanstack/react-start'
import { useRouter } from '@tanstack/react-router'
import { createRouter } from './router'
import {
  createRouterConfig,
  createSerializationAdapter,
  RegisteredConfig,
  RegisteredSerializationAdapters,
} from '@tanstack/router-core'
import { Register as RegisterCore } from '@tanstack/router-core'
import { Foo } from './Foo'

export const fooAdapter = createSerializationAdapter({
  key: 'foo',
  test: (value: any) => value instanceof Foo,
  toSerializable: (foo) => foo.test,
  fromSerializable: (value) => new Foo(),
})

export const createStart = defineStart(() => {
  const router = createRouter()
  const config = createRouterConfig({
    //    defaultSsr: false,
    serializationAdapters: [fooAdapter],
  })
  return { router, config }
})

declare module '@tanstack/react-start' {
  interface Register {
    createStart: typeof createStart
    server: {
      requestContext: {
        test: string
      }
    }
  }
}

type X =
  RegisteredStartConfig['~types']['router']['routesById']['/posts/$postId']
//   ^?

// const router = useRouter()
// router.navigate({to: '/posts/$postId', params: {postId: '123'}})

type R = RegisteredRequestContext
//   ^?

type A = RegisteredSerializationAdapters<RegisterCore>
//   ^?

type B = RegisteredConfig['~types']['serializationAdapters']
//   ^?
