import { TSS_SERVER_FUNCTION } from '@tanstack/start-client-core'
import { getServerFnById } from './getServerFnById'

export const createSsrRpc = (functionId: string) => {
  const url = process.env.TSS_SERVER_FN_BASE + functionId
  const fn = async (opts: any, signal: any): Promise<any> => {
    const serverFn = await getServerFnById(functionId)
    return serverFn(opts ?? {}, signal)
  }

  return Object.assign(fn, {
    url,
    functionId,
    [TSS_SERVER_FUNCTION]: true,
  })
}
