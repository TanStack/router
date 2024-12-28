import { copyTemplateFiles } from './utils/copyTemplateFiles'
import type { ApplyParams, PeerDependency } from './types'

export const dependencies = [
  '@tanstack/react-router',
  '@tanstack/router-devtools',
  'react',
  'react-dom',
] as const satisfies Array<PeerDependency>
export const devDependencies = [
  '@types/react',
  '@types/react-dom',
  '@tanstack/router-plugin',
] as const satisfies Array<PeerDependency>

export const scripts = {
  typecheck: 'tsc --noEmit',
}

export async function apply({ targetFolder }: ApplyParams) {
  await copyTemplateFiles({ file: '**/*', sourceFolder: 'core', targetFolder })
  return {
    dependencies,
    devDependencies,
    scripts,
  }
}
