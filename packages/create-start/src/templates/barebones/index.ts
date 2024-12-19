import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { createModule, runWithSpinner } from '../../module'
import { coreModule } from '../../modules/core'
import { initHelpers } from '../../utils/helpers'
import { createDebugger } from '../../utils/debug'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const debug = createDebugger('barebones-template')
const schema = coreModule._initSchema

export const barebonesTemplate = createModule(schema)
  .init((schema) => schema)
  .prompt((schema) =>
    schema.transform(async (vals) => {
      debug.verbose('Transforming prompt schema', { vals })
      const core = await coreModule._promptSchema.parseAsync(vals)
      debug.verbose('Core module prompt complete')

      return {
        ...core,
      }
    }),
  )
  .validateAndApply({
    validate: async ({ cfg, targetPath }) => {
      debug.verbose('Validating barebones template', { targetPath })
      const _ = initHelpers(__dirname, targetPath)

      const issues = await _.getTemplateFilesThatWouldBeOverwritten({
        file: '**/*',
        templateFolder: './template',
        targetFolder: targetPath,
        overwrite: false,
      })

      debug.verbose('Template file conflicts found', { issues })

      const coreIssues =
        (await coreModule._validateFn?.({ cfg, targetPath })) ?? []
      debug.verbose('Core module validation issues', { coreIssues })

      issues.push(...coreIssues)

      return issues
    },
    apply: async ({ cfg, targetPath }) => {
      debug.info('Applying barebones template', { targetPath })
      const _ = initHelpers(__dirname, targetPath)

      await runWithSpinner({
        spinnerOptions: {
          inProgress: 'Copying barebones template files',
          error: 'Failed to copy barebones template files',
          success: 'Copied barebones template files',
        },
        fn: async () => {
          debug.verbose('Copying template files')
          await _.copyTemplateFiles({
            file: '**/*',
            templateFolder: './template',
            targetFolder: '.',
            overwrite: false,
          })
          debug.verbose('Template files copied successfully')
        },
      })

      debug.verbose('Applying core module')
      await coreModule._applyFn({ cfg, targetPath })
      debug.info('Barebones template applied successfully')
    },
  })
