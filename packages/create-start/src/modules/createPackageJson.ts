import { basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { input } from '@inquirer/prompts'
import { InvalidArgumentError, createOption } from '@commander-js/extra-typings'
import { initHelpers } from '../utils/helpers'
import { createModule } from '../module'
import { validateProjectName } from '../utils/validateProjectName'
import addDependencies from './addDependencies'

import addScripts from './addScripts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export const packageNameCliOption = createOption(
  '--package-name <string>',
  'The name to use in the package.json',
).argParser((name) => {
  const validation = validateProjectName(name)
  if (!validation.valid) {
    throw new InvalidArgumentError(`The project name ${name} is invalid`)
  }
  return name
})

const createPackageJson = createModule(
  z
    .object({
      scripts: z.array(z.string()).optional(),
      name: z.string(),
    })
    .merge(addDependencies._schema)
    .merge(addScripts._schema),
)
  .promptFn(async ({ state, targetPath }) => {
    const defaultName = basename(targetPath)

    const name = state.name
      ? state.name
      : await input({
          message: 'Enter the project name',
          default: defaultName,
          validate: (name) => {
            const validation = validateProjectName(name)
            if (validation.valid) {
              return true
            }
            return 'Invalid project name: ' + validation.problems[0]
          },
        })

    return {
      name,
    }
  })
  .spinnerConfig(() => ({
    success: 'Created package.json',
    error: 'Failed to create package.json',
    inProgress: 'Creating package.json',
  }))
  .applyFn(async ({ state, targetPath }) => {
    const _ = initHelpers(__dirname, targetPath)

    const packageJson = {
      name: state.name,
      version: '0.0.0',
      private: true,
      type: 'module',
    }

    await _.writeTargetfile(
      './package.json',
      JSON.stringify(packageJson, null, 2),
      false,
    )

    await addScripts._apply({
      state: {
        scripts: state.scripts,
      },
      targetPath,
    })

    await addDependencies._apply({
      state: {
        dependencies: state.dependencies,
        devDependencies: state.devDependencies,
      },
      targetPath,
    })
  })

export default createPackageJson
