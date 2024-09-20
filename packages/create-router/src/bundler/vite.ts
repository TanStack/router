import { copyTemplateFiles } from '../utils/copyTemplateFiles'
import type { ApplyParams, BundlerResult, PeerDependency } from '../types'

export const scripts = {
  dev: 'vite --port=3001',
  build: 'vite build',
  serve: 'vite preview',
  start: 'vite',
} as const

export const devDependencies = [
  '@vitejs/plugin-react',
  'vite',
] as const satisfies Array<PeerDependency>

export async function apply({
  targetFolder,
}: ApplyParams): Promise<BundlerResult> {
  await copyTemplateFiles({
    file: '**/*',
    sourceFolder: 'bundler/vite',
    targetFolder,
  })
  return {
    scripts,
    devDependencies,
  }
}
