# TanStack Octane Start

SSR, streaming, server functions, server routes, and bundling for Octane, powered by [TanStack Router](https://tanstack.com/router) and Vite.

The Start Vite plugin uses Octane's native streaming injection and deferred
hydration compiler. `Hydrate` is available from the root package, with its
strategies on the `hydration` subpath:

```ts
import { Hydrate } from '@tanstack/octane-start'
import { interaction } from '@tanstack/octane-start/hydration'

function DeferredWidget() @{
  <Hydrate when={interaction({ events: 'click' })}>
    <button>{'Load widget'}</button>
  </Hydrate>
}
```

Split children stay out of the initial JavaScript graph while their SSR HTML
and CSS remain available for adoption.

Visit [tanstack.com/start](https://tanstack.com/start) for TanStack Start documentation.
