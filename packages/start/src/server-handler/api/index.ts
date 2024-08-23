/// <reference types="vinxi/types/server" />
import { eventHandler, toWebRequest } from 'vinxi/http'
import { getManifest } from 'vinxi/manifest'
import type { HTTPEvent } from 'vinxi/http'

async function handleServerRequest(event: HTTPEvent) {
  const request = toWebRequest(event)

  const url = new URL(request.url, 'http://localhost:3000')

  const vinxiAPIManifest = getManifest('api')

  let filepath = url.pathname
  if (filepath.startsWith(vinxiAPIManifest.base)) {
    filepath = filepath.slice(vinxiAPIManifest.base.length)
  }

  const method = request.method.toUpperCase()

  const requestHandler = (await vinxiAPIManifest.chunks[filepath]?.import())?.[
    method
  ] as Function

  return requestHandler({ request })
}

export default eventHandler(handleServerRequest)
