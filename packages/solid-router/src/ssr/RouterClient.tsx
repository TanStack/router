import { hydrate } from '@tanstack/router-core/ssr/client'
import { Await } from '../awaited'
import { RouterProvider } from '../RouterProvider'
import {
  installRouterPayloadShim,
  readRouterPayload,
} from './routerPayloadClient'
import type { AnyRouter } from '@tanstack/router-core'

let hydrationPromise: Promise<void> | undefined

export function RouterClient(props: { router: AnyRouter }) {
  if (!hydrationPromise) {
    // The payload rides Solid's JSON codec (record queue); the shim hands it
    // to the unchanged core hydrate through a synthetic `$_TSR` and resolves
    // once the (lazily loaded) decoder is ready. The trailing `h()` signals
    // hydration complete — the synthetic deletes itself; a real bootstrap
    // (script-channel server) runs its own teardown.
    hydrationPromise = installRouterPayloadShim(() =>
      readRouterPayload(props.router),
    )
      .then(() => hydrate(props.router))
      .finally(() => window.$_TSR?.h())
  }

  return (
    <Await
      promise={hydrationPromise}
      children={() => <RouterProvider router={props.router} />}
    />
  )
}
