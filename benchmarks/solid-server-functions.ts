const origin = 'http://localhost'
const instanceHeader = 'X-Server-Function-Instance'
export const solidServerFunctionFormatHeader = 'X-Server-Function-Format'

// Since solid-js 2.0.0-rc.4 the server resolves the function id from the
// request url pathname (`<endpoint>/<id>`); the X-Server-Function-Id header
// no longer exists. Requests keep the full function url they were given.
function resolveSolidServerFunctionPathname(url: string) {
  const parsed = new URL(url, origin)
  const id = parsed.pathname.slice(parsed.pathname.lastIndexOf('/') + 1)

  if (!id) {
    throw new Error(`Unable to resolve Solid server function id from ${url}`)
  }

  return parsed.pathname
}

function createSolidServerFunctionHeaders(instance: string) {
  return new Headers({
    'sec-fetch-site': 'same-origin',
    [instanceHeader]: instance,
  })
}

export function createSolidServerFunctionGetRequest(
  url: string,
  args: Array<unknown>,
  instance: string,
) {
  const pathname = resolveSolidServerFunctionPathname(url)
  const search = new URLSearchParams({
    args: JSON.stringify(args),
  })

  return new Request(`${origin}${pathname}?${search}`, {
    method: 'GET',
    headers: createSolidServerFunctionHeaders(instance),
  })
}

export function createSolidServerFunctionPostRequest(
  url: string,
  args: Array<unknown>,
  instance: string,
) {
  const pathname = resolveSolidServerFunctionPathname(url)
  const headers = createSolidServerFunctionHeaders(instance)
  headers.set('content-type', 'application/json')
  headers.set(solidServerFunctionFormatHeader, '8')

  return new Request(`${origin}${pathname}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
  })
}

export function createSolidServerFunctionFormDataRequest(
  url: string,
  args: Array<unknown>,
  body: BodyInit,
  contentType: string,
  instance: string,
) {
  const pathname = resolveSolidServerFunctionPathname(url)
  const search = new URLSearchParams({ args: JSON.stringify(args) })
  const headers = createSolidServerFunctionHeaders(instance)
  headers.set('content-type', contentType)
  headers.set(solidServerFunctionFormatHeader, '2')

  return new Request(`${origin}${pathname}?${search}`, {
    method: 'POST',
    headers,
    body,
  })
}

export function validateSolidServerFunctionResponse(
  response: Response,
  request: Request,
) {
  if (response.status !== 200) {
    throw new Error(
      `Expected status 200 for ${request.url}, got ${response.status}`,
    )
  }

  if (!response.headers.has(solidServerFunctionFormatHeader)) {
    throw new Error(
      `Expected ${solidServerFunctionFormatHeader} header for ${request.url}`,
    )
  }
}
