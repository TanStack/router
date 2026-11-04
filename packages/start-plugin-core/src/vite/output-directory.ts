import { isAbsolute, join } from 'pathe'
import { VITE_ENVIRONMENT_NAMES } from '../constants'
import type { ViteEnvironmentNames } from '../constants'
import type * as vite from 'vite'

export function getClientOutputDirectory(
  userConfig: vite.UserConfig | vite.ResolvedConfig,
) {
  return getOutputDirectory(userConfig, VITE_ENVIRONMENT_NAMES.client, 'client')
}

export function getServerOutputDirectory(
  userConfig: vite.UserConfig | vite.ResolvedConfig,
) {
  return getOutputDirectory(userConfig, VITE_ENVIRONMENT_NAMES.server, 'server')
}

/**
 * `build.outDir` stays relative to `root` in the resolved config.
 * `join` instead of `resolve`, which drops a slash from UNC paths (`//server/share`).
 */
export function resolveOutputDirectory(root: string, outputDirectory: string) {
  return isAbsolute(outputDirectory)
    ? outputDirectory
    : join(root, outputDirectory)
}

function getOutputDirectory(
  userConfig: vite.UserConfig | vite.ResolvedConfig,
  environmentName: ViteEnvironmentNames,
  directoryName: string,
) {
  const rootOutputDirectory = userConfig.build?.outDir ?? 'dist'

  return (
    userConfig.environments?.[environmentName]?.build?.outDir ??
    join(rootOutputDirectory, directoryName)
  )
}
