const origin = 'http://localhost'
const functionHeader = 'X-Server-Function-Id'
const instanceHeader = 'X-Server-Function-Instance'
export const solidServerFunctionFormatHeader = 'X-Server-Function-Format'

type SolidServerFunctionTarget = {
  endpoint: string
  id: string
}

function resolveSolidServerFunctionTarget(
  url: string,
): SolidServerFunctionTarget {
  const parsed = new URL(url, origin)
  const separator = parsed.pathname.lastIndexOf('/') + 1
  const id = parsed.pathname.slice(separator)

  if (!id) {
    throw new Error(`Unable to resolve Solid server function id from ${url}`)
  }

  return {
    endpoint: parsed.pathname.slice(0, separator),
    id: decodeURIComponent(id),
  }
}

function createSolidServerFunctionHeaders(id: string, instance: string) {
  return new Headers({
    'sec-fetch-site': 'same-origin',
    [functionHeader]: id,
    [instanceHeader]: instance,
  })
}

export function createSolidServerFunctionGetRequest(
  url: string,
  args: Array<unknown>,
  instance: string,
) {
  const { endpoint, id } = resolveSolidServerFunctionTarget(url)
  const search = new URLSearchParams({
    id,
    args: JSON.stringify(args),
  })

  return new Request(`${origin}${endpoint}?${search}`, {
    method: 'GET',
    headers: createSolidServerFunctionHeaders(id, instance),
  })
}

export function createSolidServerFunctionPostRequest(
  url: string,
  args: Array<unknown>,
  instance: string,
) {
  const { endpoint, id } = resolveSolidServerFunctionTarget(url)
  const headers = createSolidServerFunctionHeaders(id, instance)
  headers.set('content-type', 'application/json')
  headers.set(solidServerFunctionFormatHeader, '8')

  return new Request(`${origin}${endpoint}`, {
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
  const { endpoint, id } = resolveSolidServerFunctionTarget(url)
  const search = new URLSearchParams({ args: JSON.stringify(args) })
  const headers = createSolidServerFunctionHeaders(id, instance)
  headers.set('content-type', contentType)
  headers.set(solidServerFunctionFormatHeader, '2')

  return new Request(`${origin}${endpoint}?${search}`, {
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
