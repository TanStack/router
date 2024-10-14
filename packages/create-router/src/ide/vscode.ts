import { copyTemplateFiles } from '../utils/copyTemplateFiles'
import type { ApplyParams } from '../types'

export async function apply({ targetFolder }: ApplyParams): Promise<void> {
  await copyTemplateFiles({
    file: '**/*',
    sourceFolder: 'ide/vscode',
    targetFolder,
  })
}
