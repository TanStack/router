import type { Rspack } from '@rsbuild/core'

const resolutionConfigFileRegex =
  /(?:^|[\\/])(?:package|[jt]sconfig(?:\.[^\\/]*)?)\.json$/

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

/**
 * A changed or removed file that no rebuilt module was built from, such as
 * package.json or tsconfig.json, can re-resolve imports in modules that were
 * not rebuilt.
 */
export function mayHaveReResolvedImports(
  compiler: Rspack.Compiler,
  compilation: Rspack.Compilation,
): boolean {
  if (compiler.removedFiles?.size) {
    return true
  }
  if (!compiler.modifiedFiles?.size) {
    return false
  }

  const rebuiltFiles = new Set<string>()
  for (const module of compilation.builtModules) {
    const file = (
      module as Rspack.Module & { resourceResolveData?: { path?: string } }
    ).resourceResolveData?.path
    if (file) {
      rebuiltFiles.add(file)
    }
  }
  for (const file of compiler.modifiedFiles) {
    // An imported package.json is rebuilt, but it still configures resolution.
    if (!rebuiltFiles.has(file) || resolutionConfigFileRegex.test(file)) {
      return true
    }
  }
  return false
}
