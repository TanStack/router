import { join } from 'pathe'
import { VITE_ENVIRONMENT_NAMES } from './constants'
import type * as vite from 'vite'

export function getClientOutputDirectory(userConfig: vite.UserConfig) {
  return (
    userConfig.environments?.[VITE_ENVIRONMENT_NAMES.client]?.build?.outDir ??
    join(getServerOutputDirectory(userConfig), 'public')
  )
}

export function getServerOutputDirectory(userConfig: vite.UserConfig) {
  const rootOutputDirectory = userConfig.build?.outDir ?? 'dist'
  return (
    userConfig.environments?.[VITE_ENVIRONMENT_NAMES.server]?.build?.outDir ??
    rootOutputDirectory
  )
}
