export const NAME = 'create-start'
export const SUPPORTED_PACKAGE_MANAGERS = [
  'bun',
  'pnpm',
  'npm',
  'yarn',
] as const
export type PackageManager = (typeof SUPPORTED_PACKAGE_MANAGERS)[number]
