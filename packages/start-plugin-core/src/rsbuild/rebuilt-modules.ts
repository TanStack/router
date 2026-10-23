import type { Rspack } from '@rsbuild/core'

/**
 * A rebuilt dependency can change what its importer sees without the importer
 * itself being rebuilt.
 */
export function getRebuiltModulesAndImporters(
  compilation: Rspack.Compilation,
): Array<Rspack.Module> {
  const modules = new Set<Rspack.Module>()
  for (const module of compilation.builtModules) {
    modules.add(module)
    for (const connection of compilation.moduleGraph.getIncomingConnections(
      module,
    )) {
      if (connection.originModule) {
        modules.add(connection.originModule)
      }
    }
  }
  return Array.from(modules)
}
