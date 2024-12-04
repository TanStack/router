import { z } from 'zod'
import { initHelpers } from '../../utils/helpers'
import { createModule } from '../../module'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export const vsCodeModule = createModule(z.object({}))
  .validateFn(async ({ targetPath }) => {
    const _ = initHelpers(import.meta.url, targetPath)

    return await _.getTemplateFilesThatWouldBeOverwritten({
      file: '**/*',
      templateFolder: './template',
      targetFolder: targetPath,
      overwrite: false,
    })
  })
  .applyFn(async ({ targetPath }) => {
    // Copy the vscode template folders into the project
    const _ = initHelpers(__dirname, targetPath)

    // TODO: Handle when the settings file already exists and merge settings

    await _.copyTemplateFiles({
      file: '**/*',
      templateFolder: './template',
      targetFolder: '.',
      overwrite: false,
    })
  })
