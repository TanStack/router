import { TSS_SERVER_FUNCTION } from '@tanstack/start-client-core'

export const createServerRpc = (
  functionId: string,
  splitImportFn: (...args: any) => any,
) => {
  return Object.assign(splitImportFn, {
    functionId,
    [TSS_SERVER_FUNCTION]: true,
  })
}
