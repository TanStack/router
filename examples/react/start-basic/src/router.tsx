import {
  createSerializationAdapter,
  createRouter as createTanStackRouter,
} from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'
import { Foo } from './foo'

export function createRouter() {
  const router = createTanStackRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    scrollRestoration: true,
    serializationAdapters: [
      createSerializationAdapter({
        key: 'foo',
        test: (value) => value instanceof Foo,
        // order of properties matters for typescript inference
        toSerializable: (value) => value.bar,
        fromSerializable: (value) => new Foo(value),
      }),
    ],
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
