import {
  createRouter as createTanStackRouter,
  createTransformer,
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
    transformers: [
      createTransformer({
        key: 'foo',
        test: (value): value is Foo => value instanceof Foo,
        // order of properties matters for typescript inference
        toValue: (value) => value.bar,
        fromValue: (value) => new Foo(value),
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
