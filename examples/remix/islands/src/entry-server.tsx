/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { renderToStream } from '@remix-run/ui/server'
import { Page } from './Page'

export async function render(_url: string): Promise<ReadableStream<Uint8Array>> {
  return renderToStream(<Page />)
}
