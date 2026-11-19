import { getToken as getConvexToken } from '@convex-dev/better-auth/utils'
import { getRequestHeaders } from '@tanstack/solid-start/server'
import { ConvexHttpClient } from 'convex/browser'
import type {
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from 'convex/server'

// `@convex-dev/better-auth/react-start` depends on React, so this example
// wires the same helpers to Solid Start's request APIs.
const convexUrl = process.env.VITE_CONVEX_URL!
const convexSiteUrl = process.env.VITE_CONVEX_SITE_URL!

export async function getToken() {
  const headers = new Headers(getRequestHeaders())
  headers.delete('content-length')
  headers.delete('transfer-encoding')
  headers.set('accept-encoding', 'identity')
  const { token } = await getConvexToken(convexSiteUrl, headers)
  return token
}

async function createClient() {
  const client = new ConvexHttpClient(convexUrl)
  const token = await getToken()
  if (token) {
    client.setAuth(token)
  }
  return client
}

export async function fetchQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  ...args: OptionalRestArgs<Query>
): Promise<FunctionReturnType<Query>> {
  return (await createClient()).query(query, ...args)
}

export async function fetchMutation<
  Mutation extends FunctionReference<'mutation'>,
>(
  mutation: Mutation,
  ...args: OptionalRestArgs<Mutation>
): Promise<FunctionReturnType<Mutation>> {
  return (await createClient()).mutation(mutation, ...args)
}

// Proxies Better Auth requests to the Convex site, forwarding the original
// origin so Better Auth builds correct callback URLs.
export function authHandler(request: Request) {
  const requestUrl = new URL(request.url)
  const headers = new Headers(request.headers)
  headers.delete('transfer-encoding')
  headers.delete('content-length')
  headers.delete('connection')
  headers.delete('x-forwarded-host')
  headers.delete('x-forwarded-proto')
  headers.set('accept-encoding', 'application/json')
  headers.set('host', new URL(convexSiteUrl).host)
  headers.set('x-better-auth-forwarded-host', requestUrl.host)
  headers.set(
    'x-better-auth-forwarded-proto',
    requestUrl.protocol.replace(/:$/, ''),
  )
  return fetch(`${convexSiteUrl}${requestUrl.pathname}${requestUrl.search}`, {
    method: request.method,
    headers,
    redirect: 'manual',
    body: request.body,
    // @ts-expect-error - required for streaming request bodies
    duplex: 'half',
  })
}
