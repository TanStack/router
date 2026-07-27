import { buildServerFnUrlFromBase } from './client-rpc/serverFnUrl'
import type { ServerFnFetcherTypes } from './createServerFn'
import type { IntersectAllValidatorInputs } from './createMiddleware'

type BuildServerFnUrlData<TServerFn> =
  TServerFn extends ServerFnFetcherTypes<
    'GET',
    infer TMiddlewares,
    infer TInputValidator
  >
    ? IntersectAllValidatorInputs<TMiddlewares, TInputValidator>
    : never

type GetServerFn = {
  url: string
} & ServerFnFetcherTypes<'GET', any, any>

export function buildServerFnUrl<TServerFn extends GetServerFn>(
  serverFn: TServerFn,
  ...args: undefined extends BuildServerFnUrlData<TServerFn>
    ? [data?: BuildServerFnUrlData<TServerFn>]
    : [data: BuildServerFnUrlData<TServerFn>]
): Promise<string> {
  return buildServerFnUrlFromBase(
    serverFn.url,
    args.length ? { data: args[0] } : undefined,
  )
}
