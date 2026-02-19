import type { CompileStartFrameworkOptions } from '../types'
import type { ImportProtectionEnvRules } from '../schema'
import type { Pattern } from './utils'

export interface DefaultImportProtectionRules {
  client: Required<ImportProtectionEnvRules>
  server: Required<ImportProtectionEnvRules>
}

/**
 * Returns the default import protection rules for a given framework.
 */
export function getDefaultImportProtectionRules(
  _framework: CompileStartFrameworkOptions,
): DefaultImportProtectionRules {
  const frameworks: Array<CompileStartFrameworkOptions> = [
    'react',
    'solid',
    'vue',
  ]

  // Deny client importing server-specific entrypoints
  const clientSpecifiers: Array<Pattern> = frameworks.map(
    (fw) => `@tanstack/${fw}-start/server`,
  )

  return {
    client: {
      specifiers: clientSpecifiers,
      files: ['**/*.server.*'],
    },
    server: {
      specifiers: [],
      files: ['**/*.client.*'],
    },
  }
}

/**
 * Marker module specifiers that restrict a file to a specific environment.
 */
export function getMarkerSpecifiers(_framework: CompileStartFrameworkOptions): {
  serverOnly: Array<string>
  clientOnly: Array<string>
} {
  const frameworks: Array<CompileStartFrameworkOptions> = [
    'react',
    'solid',
    'vue',
  ]

  return {
    serverOnly: frameworks.map((fw) => `@tanstack/${fw}-start/server-only`),
    clientOnly: frameworks.map((fw) => `@tanstack/${fw}-start/client-only`),
  }
}
