import { createFromReadableStream } from 'virtual:tanstack-rsc-browser-decode'
import { awaitLazyElements } from './awaitLazyElements'
import { unwrapRscCssEnvelope } from './rscCssEnvelope'
import type { CssHrefCollector } from './awaitLazyElements'

/**
 * Decodes a Flight stream in the browser and waits for its lazy elements.
 *
 * Loaded on demand by `createServerComponentFromStream` so the Flight client
 * runtime is only fetched once a server component is actually decoded,
 * instead of shipping in the entry chunk of every RSC-enabled app.
 */
export async function decodeRscStream(
  stream: ReadableStream<Uint8Array>,
  cssCollector: CssHrefCollector,
): Promise<unknown> {
  const result = await createFromReadableStream(stream)
  await awaitLazyElements(result, cssCollector)
  return unwrapRscCssEnvelope(result)
}
