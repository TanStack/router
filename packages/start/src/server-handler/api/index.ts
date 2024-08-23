/// <reference types="vinxi/types/server" />
import { eventHandler, toWebRequest } from 'vinxi/http'
import type { HTTPEvent } from 'vinxi/http'

async function handleServerRequest(event: HTTPEvent) {
  const request = toWebRequest(event)

  const url = new URL(request.url, 'http://localhost:3000')

  // need to figure out a way to resolve this both in dev and in production,
  // keeping into mind that this hardcoded `app/routes` is not the final path
  const filepath = `app/routes${url.pathname}`
  const name = request.method.toUpperCase()

  const requestHandler = (
    await import.meta.env.MANIFEST[import.meta.env.ROUTER_NAME]!.chunks[
      filepath
    ]!.import()
  )[name]

  return requestHandler({ request })
}

export default eventHandler(handleServerRequest)
