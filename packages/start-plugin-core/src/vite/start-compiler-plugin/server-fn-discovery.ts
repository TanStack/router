import { TRANSFORM_ID_REGEX } from '../../constants'
import type { ServerFn } from '../../start-compiler/types'

export interface ServerFnModuleGraphInfo {
  importedIds?: ReadonlyArray<string> | null
  dynamicallyImportedIds?: ReadonlyArray<string> | null
}

export type ServerFnModuleLoader = (options: {
  id: string
  resolveDependencies?: boolean
}) => Promise<ServerFnModuleGraphInfo | null | undefined>

function canDeclareServerFns(id: string): boolean {
  if (id.includes('\0') || id.includes('/node_modules/')) {
    return false
  }

  return TRANSFORM_ID_REGEX.some((pattern) => {
    pattern.lastIndex = 0
    return pattern.test(id)
  })
}

export async function discoverProviderServerFns(opts: {
  load: ServerFnModuleLoader
  getServerFns: () => Record<string, ServerFn>
}): Promise<void> {
  const visited = new Set<string>()
  let pending: Array<string> = []

  const enqueue = (id: string) => {
    if (visited.has(id)) {
      return
    }
    visited.add(id)
    pending.push(id)
  }

  const enqueueProviderModules = () => {
    for (const serverFn of Object.values(opts.getServerFns())) {
      enqueue(serverFn.extractedFilename)
    }
  }

  enqueueProviderModules()

  while (pending.length > 0) {
    const batch = pending
    pending = []

    const infos = await Promise.all(
      batch.map((id) =>
        opts
          .load({ id, resolveDependencies: true })
          .catch(() => null as ServerFnModuleGraphInfo | null),
      ),
    )

    for (const info of infos) {
      if (!info) {
        continue
      }

      for (const importedId of [
        ...(info.importedIds ?? []),
        ...(info.dynamicallyImportedIds ?? []),
      ]) {
        if (canDeclareServerFns(importedId)) {
          enqueue(importedId)
        }
      }
    }

    enqueueProviderModules()
  }
}
