import { readFile } from 'node:fs/promises'
import {
  getDefaultImportProtectionRules,
} from '../import-protection/defaults'
import { compileMatchers } from '../import-protection/matchers'
import {
  getImportProtectionRelativePath,
  shouldCheckImportProtectionImporter,
} from '../import-protection/adapterUtils'
import { getImportSources } from '../import-protection/analysis'
import { rewriteDeniedImports } from '../import-protection/rewrite'
import { loadSilentMockModule } from '../import-protection/virtualModules'
import {
  checkFileDenial,
  normalizeFilePath,
} from '../import-protection/utils'
import { MOCK_MODULE_ID } from '../import-protection/constants'
import type { BunPlugin } from 'bun'
import type { ImportProtectionAdapterConfig } from '../import-protection/adapterUtils'
import type { ImportProtectionOptions } from '../schema'

/**
 * Bun import-protection plugin (deny/mock path).
 * Full Vite/Rsbuild adapters include graph tracing and source maps; this
 * covers the core deny/mock path using the shared analysis/rewrite layer,
 * with clearer violation diagnostics.
 */
export function createBunImportProtectionPlugin(opts: {
  envName: string
  envType: 'client' | 'server'
  root: string
  srcDirectory: string
  importProtection?: ImportProtectionOptions
  mode?: 'dev' | 'build'
}): BunPlugin {
  const defaults = getDefaultImportProtectionRules()
  const user = opts.importProtection ?? {}
  const mode = opts.mode ?? 'build'

  const resolveBehavior = (): 'error' | 'mock' => {
    const behavior = user.behavior
    if (!behavior) {
      return mode === 'dev' ? 'mock' : 'error'
    }
    if (typeof behavior === 'string') {
      return behavior
    }
    if (mode === 'dev') {
      return behavior.dev ?? 'mock'
    }
    return behavior.build ?? 'error'
  }

  const clientSpecifiers = compileMatchers([
    ...defaults.client.specifiers,
    ...(user.client?.specifiers ?? []),
  ])
  const clientFiles = compileMatchers([
    ...defaults.client.files,
    ...(user.client?.files ?? []),
  ])
  const clientExclude = compileMatchers([
    ...defaults.client.excludeFiles,
    ...(user.client?.excludeFiles ?? []),
  ])
  const serverSpecifiers = compileMatchers([
    ...defaults.server.specifiers,
    ...(user.server?.specifiers ?? []),
  ])
  const serverFiles = compileMatchers([
    ...defaults.server.files,
    ...(user.server?.files ?? []),
  ])
  const serverExclude = compileMatchers([
    ...defaults.server.excludeFiles,
    ...(user.server?.excludeFiles ?? []),
  ])

  const adapterConfig: ImportProtectionAdapterConfig = {
    root: opts.root,
    srcDirectory: opts.srcDirectory,
    compiledRules: {
      client: {
        specifiers: clientSpecifiers,
        files: clientFiles,
        excludeFiles: clientExclude,
      },
      server: {
        specifiers: serverSpecifiers,
        files: serverFiles,
        excludeFiles: serverExclude,
      },
    },
    includeMatchers: compileMatchers(user.include ?? []),
    excludeMatchers: compileMatchers(user.exclude ?? []),
    ignoreImporterMatchers: compileMatchers(user.ignoreImporters ?? []),
    envTypeMap: new Map([
      ['client', 'client'],
      ['ssr', 'server'],
    ]),
  }

  const rules =
    opts.envType === 'client'
      ? adapterConfig.compiledRules.client
      : adapterConfig.compiledRules.server

  return {
    name: `tanstack-start-import-protection:${opts.envName}`,
    setup(build) {
      build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
        if (args.path.includes('node_modules')) {
          return undefined
        }

        if (!shouldCheckImportProtectionImporter(adapterConfig, args.path)) {
          return undefined
        }

        const code = await readFile(args.path, 'utf8')
        const sources = getImportSources(code)
        const denied = new Set<string>()
        const denialReasons: Array<string> = []

        for (const source of sources) {
          if (rules.specifiers.some((m) => m.test(source))) {
            denied.add(source)
            denialReasons.push(
              `specifier "${source}" denied in ${opts.envType} environment`,
            )
            continue
          }

          try {
            const resolved = await Bun.resolve(source, args.path)
            const relative = getImportProtectionRelativePath(
              opts.root,
              normalizeFilePath(resolved),
            )
            const fileHit = checkFileDenial(relative, {
              files: rules.files,
              excludeFiles: rules.excludeFiles,
            })
            if (fileHit) {
              denied.add(source)
              denialReasons.push(
                `file "${relative}" (via "${source}") denied in ${opts.envType} environment`,
              )
            }
          } catch {
            // unresolved — skip file rules
          }
        }

        if (denied.size === 0) {
          return undefined
        }

        const relativeImporter = getImportProtectionRelativePath(
          opts.root,
          normalizeFilePath(args.path),
        )
        const detail = denialReasons.join('; ')
        const behavior = resolveBehavior()

        if (behavior === 'error') {
          throw new Error(
            `[tanstack-start-bun] Import protection violation in ${relativeImporter} (${opts.envName}): ${detail}`,
          )
        }

        console.warn(
          `[tanstack-start-bun] Import protection (${opts.envName}) in ${relativeImporter}: ${detail} — rewriting to mock`,
        )

        const rewritten = rewriteDeniedImports(
          code,
          args.path,
          denied,
          () => MOCK_MODULE_ID,
        )

        if (!rewritten) {
          return undefined
        }

        return {
          contents: rewritten.code,
          loader: args.path.endsWith('x') ? 'tsx' : 'ts',
        }
      })

      build.onResolve(
        { filter: /^tanstack-start-import-protection:mock/ },
        (args) => ({
          path: args.path,
          namespace: 'tanstack-import-protection',
        }),
      )

      build.onLoad(
        { filter: /.*/, namespace: 'tanstack-import-protection' },
        () => {
          const mock = loadSilentMockModule()
          return { contents: mock.code, loader: 'js' }
        },
      )
    },
  }
}
