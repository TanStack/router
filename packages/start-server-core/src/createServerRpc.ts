import { TSS_SERVER_FUNCTION } from '@tanstack/start-client-core'

export const createServerRpc = (
  functionId: string,
  splitImportFn: (...args: any) => any,
) => {
  const url = process.env.TSS_SERVER_FN_BASE + functionId

  return Object.assign(splitImportFn, {
    url,
    functionId,
    [TSS_SERVER_FUNCTION]: true,
  })
}
