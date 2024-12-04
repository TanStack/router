import { z } from 'zod'
import { createModule } from '../module'
import { createOption, InvalidArgumentError } from '@commander-js/extra-typings'
import { select } from '@inquirer/prompts'
import { SUPPORTED_PACKAGE_MANAGERS } from '../constants'
import { getPackageManager } from '../utils/getPackageManager'
import { install } from '../utils/runPackageManagerCommand'

const schema = z.object({
  packageManager: z.enum(SUPPORTED_PACKAGE_MANAGERS),
  installDeps: z.boolean(),
})

const DEFAULT_PACKAGE_MANAGER = 'npm'
const options = schema.shape.packageManager.options
type PackageManager = z.infer<typeof schema>['packageManager']

export const packageManagerOption = createOption(
  `--package-manager <${options.join('|')}>`,
  `use this Package Manager (${options.join(', ')})`,
).argParser((value) => {
  if (!options.includes(value as PackageManager)) {
    throw new InvalidArgumentError(
      `Invalid Package Manager: ${value}. Only the following are allowed: ${options.join(', ')}`,
    )
  }
  return value as PackageManager
})

const packageManager = createModule(schema)
  .initFn(async ({ cfg }) => {
    return {
      ...cfg,
      packageManager: cfg.packageManager ?? getPackageManager(),
    }
  })
  .promptFn(async ({ state, targetPath }) => {
    const packageManager =
      state.packageManager != undefined
        ? state.packageManager
        : await select({
            message: 'Select a package manager',
            choices: options.map((pm) => ({ value: pm })),
            default: getPackageManager() ?? DEFAULT_PACKAGE_MANAGER,
          })

    const installDeps =
      state.installDeps != undefined
        ? state.installDeps
        : await select({
            message: 'Install dependencies',
            choices: [
              { name: 'yes', value: true },
              { name: 'no', value: false },
            ],
            default: 'yes',
          })

    return {
      installDeps,
      packageManager,
    }
  })
  .spinnerConfig(({ state }) =>
    state.installDeps
      ? {
          error: `Failed to install dependencies with ${state.packageManager}`,
          inProgress: `Installing dependencies with ${state.packageManager}`,
          success: `Installed dependencies with ${state.packageManager}`,
        }
      : undefined,
  )
  .applyFn(async ({ state, targetPath }) => {
    if (state.installDeps) {
      await install(state.packageManager, targetPath)
    }
  })

export default packageManager
