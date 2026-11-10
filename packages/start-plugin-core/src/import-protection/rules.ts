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
function targetExcluded(
  rules: ImportProtectionEnvRules,
  relativePath: string,
): boolean {
  return (
    rules.excludeFiles.length > 0 &&
    matchesAny(relativePath, rules.excludeFiles) !== undefined
  )
}

/** The file rule matching the resolved target's root-relative path, if any. */
function matchFile(
  rules: ImportProtectionEnvRules,
  relativePath: string,
): RuleRef | null {
  const m = matchesAny(relativePath, rules.files)
  return m ? { type: 'file', index: rules.files.indexOf(m) } : null
}

/**
 * The other id a target's file and marker rules judge, besides the id: when
 * its path holds a `#`, the path cut at its last `#`. A Vite id keeps a
 * specifier's `#fragment` (`./db.server.ts#x` loads `db.server.ts`), which no
 * id tells from a `#` of a path (`C#/src`): both are judged, and either one
 * denies. Null for an id without a `#`.
 */
function cutAtHash(id: string): string | null {
  if (!id.includes('#')) {
    return null
  }
  const { path } = identify(id)
  const hash = path.lastIndexOf('#')
  return hash === -1 ? null : path.slice(0, hash)
}

/** The file rule denying a module's own path in an environment of `envType` (`excludeFiles` skips it). */
export function ownFileRule(
  config: ImportProtectionConfig,
  envType: EnvType,
  path: string,
): RuleRef | null {
  const rules = rulesFor(config, envType)
  const cut = cutAtHash(path)
  return (
    unexcludedFileRule(config, rules, path) ??
    (cut === null ? null : unexcludedFileRule(config, rules, cut))
  )
}

function unexcludedFileRule(
  config: ImportProtectionConfig,
  rules: ImportProtectionEnvRules,
  id: string,
): RuleRef | null {
  const rel = relativeTargetPath(config, id)
  return targetExcluded(rules, rel) ? null : matchFile(rules, rel)
}

type MarkerReader = (
  id: string,
) => MarkerKind | 'conflict' | null | Promise<MarkerKind | 'conflict' | null>

/**
 * The file rule on a file's root-relative path, else its marker (`excludeFiles` skips both), for the id and
 * the id `cutAtHash` gives (`marker` reads the marker of the one it is given).
 */
export async function fileOrMarkerRule(
  config: ImportProtectionConfig,
  envType: EnvType,
  file: string,
  marker: MarkerReader,
): Promise<RuleRef | null> {
  const rules = rulesFor(config, envType)
  let id: string | null = file
  while (id !== null) {
    const rel = relativeTargetPath(config, id)
    if (!targetExcluded(rules, rel)) {
      const rule =
        matchFile(rules, rel) ??
        (markerViolates(envType, await marker(id)) ? { type: 'marker' } : null)
      if (rule) {
        return rule
      }
    }
    id = id === file ? cutAtHash(file) : null
  }
  return null
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
