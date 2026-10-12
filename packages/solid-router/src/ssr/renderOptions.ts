import { makeSsrSerovalPlugin } from '@tanstack/router-core/ssr/server'
import type { renderToStream } from 'solid-js/web'
import type { AnyRouter } from '@tanstack/router-core'

/** Solid renderer options shared by the stream and string paths. */
export function getSolidRenderOptions(
  router: AnyRouter,
  tracker: { didRun: boolean },
) {
  return {
    nonce: router.options.ssr?.nonce,
    // `plugins` is honoured by Solid's server runtime but absent from its
    // public option type.
    plugins: router.options.serializationAdapters?.map((adapter) =>
      makeSsrSerovalPlugin(adapter, tracker),
    ),
  } as Parameters<typeof renderToStream>[1]
}
