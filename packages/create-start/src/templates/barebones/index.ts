import { createModule } from '../../module'
import { coreModule } from '../../modules/core'
import { initHelpers } from '../../utils/helpers'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const schema = coreModule._schema

export const barebonesTemplate = createModule(schema)
  .initFn(async (args) => {
    const coreInit = await coreModule._init(args)

    return {
      ...coreInit,
    }
  })
  .promptFn(async (opts) => {
    const corePrompts = await coreModule._prompt(opts)

    return {
      ...corePrompts,
    }
  })
  .validateFn(async ({ targetPath, state }) => {
    const _ = initHelpers(__dirname, targetPath)

    const issues = await _.getTemplateFilesThatWouldBeOverwritten({
      file: '**/*',
      templateFolder: './template',
      targetFolder: targetPath,
      overwrite: false,
    })

    issues.push(...(await coreModule._validate({ targetPath, state })))

    return issues
  })
  .applyFn(async ({ state, targetPath }) => {
    const _ = initHelpers(__dirname, targetPath)

    await _.copyTemplateFiles({
      file: '**/*',
      templateFolder: './template',
      targetFolder: '.',
      overwrite: false,
    })

    await coreModule._apply({ state, targetPath })
  })
