/// <reference types="vinxi/types/server" />
import { eventHandler, toWebRequest } from 'vinxi/http'
import type { HTTPEvent } from 'vinxi/http'

// eslint-disable-next-line @typescript-eslint/require-await
async function handleServerRequest(event: HTTPEvent) {
  const request = toWebRequest(event)

  return new Response('Hello, world!')
}

export default eventHandler(handleServerRequest)
