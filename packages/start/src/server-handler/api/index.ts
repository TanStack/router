/// <reference types="vinxi/types/server" />
import { eventHandler, toWebRequest } from 'vinxi/http'
import { getManifest } from 'vinxi/manifest'
import type { HTTPEvent } from 'vinxi/http'

async function handleServerRequest(event: HTTPEvent) {
  const request = toWebRequest(event)

  const url = new URL(request.url, 'http://localhost:3000')

  let filepath = url.pathname
  if (filepath.startsWith('/api')) {
    filepath = filepath.slice(4)
  }

  const method = request.method.toUpperCase()

  const requestHandler = (
    await getManifest('api').chunks[filepath]?.import()
  )?.[method] as Function

  return requestHandler({ request })
}

export default eventHandler(handleServerRequest)
