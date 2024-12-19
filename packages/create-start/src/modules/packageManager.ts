import { z } from 'zod'
import { InvalidArgumentError, createOption } from '@commander-js/extra-typings'
import { select } from '@inquirer/prompts'
import { createModule } from '../module'
import { SUPPORTED_PACKAGE_MANAGERS } from '../constants'
import { getPackageManager } from '../utils/getPackageManager'
import { install } from '../utils/runPackageManagerCommand'
import { createDebugger } from '../utils/debug'

const debug = createDebugger('packageManager')

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
    debug.error('Invalid package manager provided', { value, allowed: options })
    throw new InvalidArgumentError(
      `Invalid Package Manager: ${value}. Only the following are allowed: ${options.join(', ')}`,
    )
  }
  return value as PackageManager
})

export const packageManagerModule = createModule(
  z.object({
    packageManager: z.enum(SUPPORTED_PACKAGE_MANAGERS).optional(),
    installDeps: z.boolean().optional(),
  }),
)
  .init((schema) =>
    schema.transform((vals) => {
      debug.verbose('Initializing package manager', vals)
      const detectedPM = getPackageManager()
      debug.verbose('Detected package manager', { detectedPM })
      return {
        packageManager: vals.packageManager ?? detectedPM,
        installDeps: vals.installDeps,
      }
    }),
  )
  .prompt((schema) =>
    schema.transform(async (vals) => {
      debug.verbose('Prompting for package manager options', vals)
      const packageManager =
        vals.packageManager != undefined
          ? vals.packageManager
          : await select({
              message: 'Select a package manager',
              choices: options.map((pm) => ({ value: pm })),
              default: getPackageManager() ?? DEFAULT_PACKAGE_MANAGER,
            })

      const installDeps =
        vals.installDeps != undefined
          ? vals.installDeps
          : await select({
              message: 'Install dependencies',
              choices: [
                { name: 'yes', value: true },
                { name: 'no', value: false },
              ],
              default: 'yes',
            })

      debug.verbose('Package manager options selected', {
        packageManager,
        installDeps,
      })
      return {
        installDeps,
        packageManager,
      }
    }),
  )
  .validateAndApply({
    spinnerConfigFn: (cfg) => {
      debug.verbose('Configuring spinner', cfg)
      return cfg.installDeps
        ? {
            error: `Failed to install dependencies with ${cfg.packageManager}`,
            inProgress: `Installing dependencies with ${cfg.packageManager}`,
            success: `Installed dependencies with ${cfg.packageManager}`,
          }
        : undefined
    },
    apply: async ({ cfg, targetPath }) => {
      if (cfg.installDeps) {
        debug.info('Installing dependencies', {
          packageManager: cfg.packageManager,
          targetPath,
        })

        await install(cfg.packageManager, targetPath)
        debug.info('Dependencies installed successfully')
      } else {
        debug.info('Skipping dependency installation')
      }
    },
  })
