/**
 * Edge rules (J6.1, J6.7, J6.10): importer scope on the
 * importer's path, the specifier rule on the raw specifier as written, then
 * on the resolved target `excludeFiles`, the file rule (root-relative
 * resolved path) and the target's marker. Pure functions of the config and
 * their inputs (J6.11).
 */
import { identify } from '@tanstack/router-utils/compiler'
import { shouldCheckImportProtectionImporter } from './adapterUtils'
import { matchesAny } from './matchers'
import { normalizeFilePath, relativizePath } from './utils'
import type { ImportProtectionConfig, MarkerKind } from './config'
import type { ImportProtectionEnvRules } from './adapterUtils'

export type EnvType = 'client' | 'server'

/** Which rule matched: the list and index of the pattern (so `pattern` is the user's own value). */
export type RuleRef =
  | { type: 'specifier'; index: number }
  | { type: 'file'; index: number }
  | { type: 'marker' }

export function rulesFor(
  config: ImportProtectionConfig,
  envType: EnvType,
): ImportProtectionEnvRules {
  return envType === 'client' ? config.rules.client : config.rules.server
}

/** Whether an importer (its path, query stripped) is checked: `srcDirectory` or `include`, minus `exclude` and `ignoreImporters`. */
export function importerInScope(
  config: ImportProtectionConfig,
  importerPath: string,
  cache?: Map<string, boolean>,
): boolean {
  return shouldCheckImportProtectionImporter(
    {
      root: config.root,
      srcDirectory: config.srcDirectory,
      includeMatchers: config.include,
      excludeMatchers: config.exclude,
      ignoreImporterMatchers: config.ignoreImporters,
    },
    importerPath,
    cache,
  )
}

/** The specifier rule matching the raw specifier, if any. */
export function matchSpecifier(
  rules: ImportProtectionEnvRules,
  rawSpecifier: string,
): RuleRef | null {
  const m = matchesAny(rawSpecifier, rules.specifiers)
  return m ? { type: 'specifier', index: rules.specifiers.indexOf(m) } : null
}

/** The root-relative path of a resolved canonical id (query stripped). */
export function relativeTargetPath(
  config: ImportProtectionConfig,
  resolved: string,
): string {
  return relativizePath(normalizeFilePath(identify(resolved).path), config.root)
}

/** Whether the resolved target skips the file and marker rules (`excludeFiles`). */
export function targetExcluded(
  rules: ImportProtectionEnvRules,
  relativePath: string,
): boolean {
  return (
    rules.excludeFiles.length > 0 &&
    matchesAny(relativePath, rules.excludeFiles) !== undefined
  )
}

/** The file rule matching the resolved target's root-relative path, if any. */
export function matchFile(
  rules: ImportProtectionEnvRules,
  relativePath: string,
): RuleRef | null {
  const m = matchesAny(relativePath, rules.files)
  return m ? { type: 'file', index: rules.files.indexOf(m) } : null
}

/** The file rule denying a module's own path in an environment of `envType` (`excludeFiles` skips it). */
export function ownFileRule(
  config: ImportProtectionConfig,
  envType: EnvType,
  path: string,
): RuleRef | null {
  const rules = rulesFor(config, envType)
  const rel = relativeTargetPath(config, path)
  return targetExcluded(rules, rel) ? null : matchFile(rules, rel)
}

/** Whether a target's marker denies it in an env of `envType` (a conflict is reported in the marked file itself). */
export function markerViolates(
  envType: EnvType,
  marker: MarkerKind | 'conflict' | null,
): boolean {
  return envType === 'client'
    ? marker === 'server-only'
    : marker === 'client-only'
}

/** The user's pattern of a rule (`info.pattern`). */
export function patternOf(
  rules: ImportProtectionEnvRules,
  rule: RuleRef,
): string | RegExp | undefined {
  if (rule.type === 'specifier') {
    return rules.specifiers[rule.index]?.pattern
  }
  if (rule.type === 'file') {
    return rules.files[rule.index]?.pattern
  }
  return undefined
}
