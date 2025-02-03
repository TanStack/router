import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { initHelpers } from '../../utils/helpers'
import { createModule } from '../../module'
import { createDebugger } from '../../utils/debug'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const debug = createDebugger('vscode')

export const vsCodeModule = createModule(z.object({}))
  .init((schema) => schema)
  .prompt((schema) => schema)
  .validateAndApply({
    validate: async ({ targetPath }) => {
      debug.verbose('Validating vscode module', { targetPath })
      const _ = initHelpers(__dirname, targetPath)

      const issues = await _.getTemplateFilesThatWouldBeOverwritten({
        file: '**/*',
        templateFolder: './template',
        targetFolder: targetPath,
        overwrite: false,
      })

      debug.verbose('Validation complete', { issueCount: issues.length })
      return issues
    },
    apply: async ({ targetPath }) => {
      debug.info('Applying vscode module', { targetPath })
      // Copy the vscode template folders into the project
      const _ = initHelpers(__dirname, targetPath)

      // TODO: Handle when the settings file already exists and merge settings
      debug.verbose('Copying template files')
      await _.copyTemplateFiles({
        file: '**/*',
        templateFolder: './template',
        targetFolder: '.',
        overwrite: false,
      })
      debug.info('VSCode module applied successfully')
    },
  })
