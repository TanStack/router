import { isDeepStrictEqual, styleText } from 'node:util'
import { mergeRsbuildConfig } from '@rsbuild/core'
import { ENTRY_POINTS } from '../constants'
import type { RsbuildConfig } from '@rsbuild/core'

interface EnforcedConfig {
  [key: string]: EnforcedConfig | true
}

interface StartRsbuildEnforcedConfig {
  global: EnforcedConfig
  environments: {
    client: EnforcedConfig
    server: EnforcedConfig
  }
}

const enforcedDefineConfig = {
  'process.env.TSS_SERVER_FN_BASE': true,
  'import.meta.env.TSS_SERVER_FN_BASE': true,
  'process.env.TSS_ROUTER_BASEPATH': true,
  'import.meta.env.TSS_ROUTER_BASEPATH': true,
  'process.env.TSS_DEV_SERVER': true,
  'import.meta.env.TSS_DEV_SERVER': true,
  'process.env.TSS_DEV_SSR_STYLES_ENABLED': true,
  'import.meta.env.TSS_DEV_SSR_STYLES_ENABLED': true,
  'process.env.TSS_DEV_SSR_STYLES_BASEPATH': true,
  'import.meta.env.TSS_DEV_SSR_STYLES_BASEPATH': true,
  'process.env.TSS_INLINE_CSS_ENABLED': true,
  'import.meta.env.TSS_INLINE_CSS_ENABLED': true,
  'process.env.TSS_DISABLE_CSRF_MIDDLEWARE_WARNING': true,
  'import.meta.env.TSS_DISABLE_CSRF_MIDDLEWARE_WARNING': true,
} satisfies EnforcedConfig

const commonEnvironmentConfig = {
  source: {
    define: enforcedDefineConfig,
    entry: {
      index: true,
    },
  },
  resolve: {
    alias: {
      [ENTRY_POINTS.client]: true,
      [ENTRY_POINTS.server]: true,
      [ENTRY_POINTS.start]: true,
      [ENTRY_POINTS.router]: true,
      'react-server-dom-rspack/server$': true,
    },
  },
} satisfies EnforcedConfig

/**
 * Rsbuild config fields that TanStack Start owns.
 *
 * A `true` leaf means that Start writes the final value for that field. Keep
 * user-owned fields such as `server.base`, `dev.assetPrefix`,
 * `output.assetPrefix`, and `output.distPath` out of this object: Start
 * consumes those values but must not claim ownership of them.
 */
const enforcedConfig = {
  global: {
    source: {
      define: enforcedDefineConfig,
    },
    server: {
      compress: true,
      htmlFallback: true,
    },
    dev: {
      lazyCompilation: true,
      liveReload: true,
    },
  },
  environments: {
    client: {
      ...commonEnvironmentConfig,
      output: {
        target: true,
      },
    },
    server: {
      ...commonEnvironmentConfig,
      output: {
        target: true,
      },
    },
  },
} satisfies StartRsbuildEnforcedConfig

function findOverriddenConfig(
  config: unknown,
  resolvedConfig: unknown,
  enforced: EnforcedConfig,
  path = '',
  out: Array<string> = [],
): Array<string> {
  if (!isObject(config) || !isObject(resolvedConfig)) {
    return out
  }

  for (const key in enforced) {
    if (!(key in config) || !(key in resolvedConfig)) {
      continue
    }

    const rule = enforced[key]!
    const configuredValue = config[key]
    const resolvedValue = resolvedConfig[key]

    if (rule === true) {
      if (
        !isDeepStrictEqual(
          comparable(configuredValue),
          comparable(resolvedValue),
        )
      ) {
        out.push(path + key)
      }
    } else {
      findOverriddenConfig(
        configuredValue,
        resolvedValue,
        rule,
        `${path}${key}.`,
        out,
      )
    }
  }

  return out
}

function findRsbuildOverriddenConfig(opts: {
  originalConfig: RsbuildConfig
  resolvedConfig: RsbuildConfig
  clientEnvironmentName: string
  serverEnvironmentName: string
  providerEnvironmentName: string
}): Array<string> {
  const overridden = findOverriddenConfig(
    opts.originalConfig,
    opts.resolvedConfig,
    enforcedConfig.global,
  )
  const originalBaseConfig = { ...opts.originalConfig }
  delete originalBaseConfig.environments
  const resolvedBaseConfig = { ...opts.resolvedConfig }
  delete resolvedBaseConfig.environments

  const environmentNames = new Set([
    opts.clientEnvironmentName,
    opts.serverEnvironmentName,
    opts.providerEnvironmentName,
  ])

  for (const name of environmentNames) {
    const explicitEnvironment = opts.originalConfig.environments?.[name]
    const originalEnvironment = mergeRsbuildConfig(
      originalBaseConfig,
      explicitEnvironment,
    )
    const resolvedEnvironment = mergeRsbuildConfig(
      resolvedBaseConfig,
      opts.resolvedConfig.environments?.[name],
    )

    // Root source.define conflicts are reported once by enforcedConfig.global.
    // Only compare defines explicitly written in this environment here, or an
    // inherited root define would be reported again for every environment.
    if (originalEnvironment.source) {
      originalEnvironment.source.define = explicitEnvironment?.source?.define
    }
    const roleConfig =
      name === opts.clientEnvironmentName
        ? enforcedConfig.environments.client
        : name === opts.serverEnvironmentName ||
            name === opts.providerEnvironmentName
          ? enforcedConfig.environments.server
          : undefined

    if (roleConfig) {
      findOverriddenConfig(
        originalEnvironment,
        resolvedEnvironment,
        roleConfig,
        `environments.${name}.`,
        overridden,
      )
    }
  }

  return [...new Set(overridden)]
}

export function warnOverriddenConfig(opts: {
  originalConfig: RsbuildConfig
  resolvedConfig: RsbuildConfig
  clientEnvironmentName: string
  serverEnvironmentName: string
  providerEnvironmentName: string
}): void {
  const overridden = findRsbuildOverriddenConfig(opts)

  if (overridden.length === 0) {
    return
  }

  console.error(
    styleText(
      ['bold', 'red'],
      'The following Rsbuild config options will be overridden by TanStack Start:',
    ) + overridden.map((key) => `\n  - ${key}`).join(''),
  )
}

function comparable(value: unknown): unknown {
  if (typeof value === 'string') {
    const normalized = value.replaceAll('\\', '/')
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized
  }

  if (Array.isArray(value)) {
    return value.map(comparable)
  }

  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, comparable(entry)]),
    )
  }

  return value
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
