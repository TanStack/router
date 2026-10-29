/**
 * Import protection options → the resolved configuration the `import-edges`
 * planner, the edge modules and the hosts share (J6.1–J6.3).
 * Pure: no bundler, no file system.
 */
import { digestOf } from '@tanstack/router-utils/compiler'
import {
  getDefaultImportProtectionRules,
  getMarkerSpecifiers,
} from './defaults'
import { compileMatchers } from './matchers'
import { dedupePatterns, normalizeFilePath } from './utils'
import type { ImportProtectionEnvRules } from './adapterUtils'
import type { CompiledMatcher } from './matchers'
import type { ViolationInfo } from './trace'
import type { ImportProtectionOptions } from '../schema'

export type ImportProtectionMode = 'dev' | 'build'
type ImportProtectionBehavior = 'error' | 'mock'
export type MockAccess = 'error' | 'warn' | 'off'
export type MarkerKind = 'server-only' | 'client-only'

type OnViolation = (
  info: ViolationInfo,
) => boolean | void | Promise<boolean | void>

export interface ImportProtectionConfig {
  /** Absolute project root (paths are matched relative to it). */
  root: string
  /** Absolute source directory: the default importer scope. */
  srcDirectory: string
  mode: ImportProtectionMode
  /** The behaviour of this mode (`behavior` or `behavior.dev|build`). */
  behavior: ImportProtectionBehavior
  mockAccess: MockAccess
  log: 'once' | 'always'
  maxTraceDepth: number
  rules: { client: ImportProtectionEnvRules; server: ImportProtectionEnvRules }
  include: Array<CompiledMatcher>
  exclude: Array<CompiledMatcher>
  ignoreImporters: Array<CompiledMatcher>
  /** Marker specifier → kind (every framework's markers count in every app). */
  markerSpecifiers: Record<string, MarkerKind>
  onViolation: OnViolation | undefined
  /** Part of the compile `configKey`: changes with anything that changes a plan. */
  configKey: string
}

interface ResolveImportProtectionContext {
  root: string
  srcDirectory: string
  mode: ImportProtectionMode
}

/**
 * Resolves the user's `importProtection` option for one session (dev
 * server or build). Returns null when import protection is disabled
 * (`enabled: false`): the planner is then not registered at all.
 */
export function resolveImportProtectionConfig(
  options: ImportProtectionOptions | undefined,
  ctx: ResolveImportProtectionContext,
): ImportProtectionConfig | null {
  if (options?.enabled === false) {
    return null
  }
  const behavior =
    typeof options?.behavior === 'string'
      ? options.behavior
      : ctx.mode === 'dev'
        ? (options?.behavior?.dev ?? 'mock')
        : (options?.behavior?.build ?? 'error')
  const defaults = getDefaultImportProtectionRules()
  const pick = <T>(user: Array<T> | undefined, fallback: Array<T>) =>
    user ? [...user] : [...fallback]
  // client specifiers add to the framework defaults; every other list replaces its default
  const clientSpecifiers = dedupePatterns([
    ...defaults.client.specifiers,
    ...(options?.client?.specifiers ?? []),
  ])
  const rulePatterns = {
    client: {
      specifiers: clientSpecifiers,
      files: pick(options?.client?.files, defaults.client.files),
      excludeFiles: pick(
        options?.client?.excludeFiles,
        defaults.client.excludeFiles,
      ),
    },
    server: {
      specifiers: dedupePatterns(
        pick(options?.server?.specifiers, defaults.server.specifiers),
      ),
      files: pick(options?.server?.files, defaults.server.files),
      excludeFiles: pick(
        options?.server?.excludeFiles,
        defaults.server.excludeFiles,
      ),
    },
  }
  const markers = getMarkerSpecifiers()
  const markerSpecifiers: Record<string, MarkerKind> = {}
  for (const s of markers.serverOnly) {
    markerSpecifiers[s] = 'server-only'
  }
  for (const s of markers.clientOnly) {
    markerSpecifiers[s] = 'client-only'
  }
  const include = options?.include ?? []
  const exclude = options?.exclude ?? []
  const ignoreImporters = options?.ignoreImporters ?? []
  const mockAccess = options?.mockAccess ?? 'error'
  const log = options?.log ?? 'once'
  const maxTraceDepth = options?.maxTraceDepth ?? 20
  const root = normalizeFilePath(ctx.root)
  const srcDirectory = normalizeFilePath(ctx.srcDirectory)
  const patternKey = (list: Array<string | RegExp>) =>
    list.map((p) => (typeof p === 'string' ? `s:${p}` : `r:${String(p)}`))
  return {
    root,
    srcDirectory,
    mode: ctx.mode,
    behavior,
    mockAccess,
    log,
    maxTraceDepth,
    rules: {
      client: {
        specifiers: compileMatchers(rulePatterns.client.specifiers),
        files: compileMatchers(rulePatterns.client.files),
        excludeFiles: compileMatchers(rulePatterns.client.excludeFiles),
      },
      server: {
        specifiers: compileMatchers(rulePatterns.server.specifiers),
        files: compileMatchers(rulePatterns.server.files),
        excludeFiles: compileMatchers(rulePatterns.server.excludeFiles),
      },
    },
    include: compileMatchers(include),
    exclude: compileMatchers(exclude),
    ignoreImporters: compileMatchers(ignoreImporters),
    markerSpecifiers,
    onViolation: options?.onViolation as OnViolation | undefined,
    configKey: digestOf({
      ip: 1,
      root,
      srcDirectory,
      mode: ctx.mode,
      behavior,
      mockAccess,
      rules: {
        client: {
          specifiers: patternKey(rulePatterns.client.specifiers),
          files: patternKey(rulePatterns.client.files),
          excludeFiles: patternKey(rulePatterns.client.excludeFiles),
        },
        server: {
          specifiers: patternKey(rulePatterns.server.specifiers),
          files: patternKey(rulePatterns.server.files),
          excludeFiles: patternKey(rulePatterns.server.excludeFiles),
        },
      },
      include: patternKey(include),
      exclude: patternKey(exclude),
      ignoreImporters: patternKey(ignoreImporters),
    }),
  }
}
