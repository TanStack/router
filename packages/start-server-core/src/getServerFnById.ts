import { loadVirtualModule } from './loadVirtualModule'
import { VIRTUAL_MODULES } from './virtual-modules'

export async function getServerFnById(serverFnId: string) {
  const { default: serverFnManifest } = await loadVirtualModule(
    VIRTUAL_MODULES.serverFnManifest,
  )

  const serverFnInfo = serverFnManifest[serverFnId]

  if (!serverFnInfo) {
    console.info('serverFnManifest', serverFnManifest)
    throw new Error('Server function info not found for ' + serverFnId)
  }

  const fnModule = await serverFnInfo.importer()

  if (!fnModule) {
    console.info('serverFnInfo', serverFnInfo)
    throw new Error('Server function module not resolved for ' + serverFnId)
  }

  const action = fnModule[serverFnInfo.functionName]

  if (!action) {
    console.info('serverFnInfo', serverFnInfo)
    console.info('fnModule', fnModule)
    throw new Error(
      `Server function module export not resolved for serverFn ID: ${serverFnId}`,
    )
  }
  return action
}
