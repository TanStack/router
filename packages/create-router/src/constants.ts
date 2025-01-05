import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const TEMPLATES_FOLDER = resolve(
  fileURLToPath(import.meta.url),
  '../../templates',
)
export const NAME = 'create-router'

export const SUPPORTED_PACKAGE_MANAGERS = [
  'npm',
  'yarn',
  'pnpm',
  'bun',
] as const
export type PackageManager = (typeof SUPPORTED_PACKAGE_MANAGERS)[number]
export const DEFAULT_PACKAGE_MANAGER: PackageManager = 'npm'

export const SUPPORTED_BUNDLERS = ['vite', 'webpack', 'rspack'] as const
export type Bundler = (typeof SUPPORTED_BUNDLERS)[number]
export const DEFAULT_BUNDLER: Bundler = 'vite'

export const SUPPORTED_IDES = ['vscode', 'cursor', 'other'] as const
export type Ide = (typeof SUPPORTED_IDES)[number]
export const DEFAULT_IDE: Ide = 'vscode'
