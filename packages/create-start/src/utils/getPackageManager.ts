import { SUPPORTED_PACKAGE_MANAGERS } from '../constants'
import type { PackageManager } from '../constants'

export function getPackageManager(): PackageManager | undefined {
  const userAgent = process.env.npm_config_user_agent

  if (userAgent === undefined) {
    return undefined
  }

  const packageManager = SUPPORTED_PACKAGE_MANAGERS.find((manager) =>
    userAgent.startsWith(manager),
  )

  return packageManager
}
