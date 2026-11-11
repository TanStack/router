import { getRequestHeader } from '@tanstack/react-start/server'

let installed = false

/**
 * Stand-in for libraries that wrap the global Response and pipe stream bodies,
 * such as varlock's leak prevention: afterwards `new Response(stream).body` is
 * a new stream that reads `stream`. Only requests that send
 * `x-wrap-response: true` are affected.
 */
export function installResponseWrapper() {
  if (installed) {
    return
  }
  installed = true
  globalThis.Response = new Proxy(globalThis.Response, {
    construct(target, [body, init], newTarget) {
      if (body instanceof ReadableStream && wrapsResponses()) {
        body = body.pipeThrough(new TransformStream())
      }
      return Reflect.construct(target, [body, init], newTarget)
    },
  })
}

function wrapsResponses() {
  try {
    return getRequestHeader('x-wrap-response') === 'true'
  } catch {
    // Responses created outside a request are never wrapped.
    return false
  }
}
