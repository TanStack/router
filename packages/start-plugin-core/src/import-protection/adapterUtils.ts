import { matchesAny } from './matchers'
import { isInsideDirectory, normalizeFilePath, relativizePath } from './utils'
import type { CompiledMatcher } from './matchers'

export interface ImportProtectionEnvRules {
  specifiers: Array<CompiledMatcher>
  files: Array<CompiledMatcher>
  excludeFiles: Array<CompiledMatcher>
}

/** The subset of the config that decides whether an importer is checked at all. */
interface ImporterScopeConfig {
  root: string
  srcDirectory: string
  includeMatchers: Array<CompiledMatcher>
  excludeMatchers: Array<CompiledMatcher>
  ignoreImporterMatchers: Array<CompiledMatcher>
}

export function shouldCheckImportProtectionImporter(
  config: ImporterScopeConfig,
  importer: string,
  cache?: Map<string, boolean>,
): boolean {
  const normalizedImporter = normalizeFilePath(importer)

  if (cache) {
    const cached = cache.get(normalizedImporter)
    if (cached !== undefined) {
      return cached
    }
  }

  const relativePath = relativizePath(normalizedImporter, config.root)

  let result: boolean
  if (
    (config.excludeMatchers.length > 0 &&
      matchesAny(relativePath, config.excludeMatchers)) ||
    (config.ignoreImporterMatchers.length > 0 &&
      matchesAny(relativePath, config.ignoreImporterMatchers))
  ) {
    result = false
  } else if (config.includeMatchers.length > 0) {
    result = !!matchesAny(relativePath, config.includeMatchers)
  } else if (config.srcDirectory) {
    result = isInsideDirectory(normalizedImporter, config.srcDirectory)
  } else {
    result = true
  }

  cache?.set(normalizedImporter, result)
  return result
}
