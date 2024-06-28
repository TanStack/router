// import { getBaseUrl } from '../client-runtime/getBaseUrl'

export function createServerReference<TPayload, TResponse>(
  fn: any,
  id: string,
  name: string,
) {
  // const functionUrl = getBaseUrl('http://localhost:3000', id, name)
  const functionUrl = 'https://localhost:3000'

  return Object.assign(fn, {
    url: functionUrl,
  })
}
