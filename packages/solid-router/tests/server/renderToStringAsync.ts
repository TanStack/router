import { renderToStream } from '@solidjs/web'

// Solid 2 has no renderToStringAsync: awaiting the stream yields the settled HTML.
export function renderToStringAsync(
  ...args: Parameters<typeof renderToStream>
): Promise<string> {
  return Promise.resolve(renderToStream(...args) as unknown as string)
}
