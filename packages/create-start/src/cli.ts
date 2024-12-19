import { Command, createOption } from '@commander-js/extra-typings'
import { packageManagerOption } from './modules/packageManager'
import { logo } from './logo'
import {
  scaffoldTemplate,
  templateCliOption,
  templatePrompt,
} from './templates'
import { createDebugger, debugCliOption, initDebug } from './utils/debug'
import { getAbsolutePath, newProjectDirectoryPrompt } from './directory'
import { packageNameCliOption } from './modules/packageJson'
import { ideCliOption } from './modules/ide'
import type { TEMPLATE_NAME } from './templates'

const logger = createDebugger('cli')

const options = {
  template: templateCliOption,
  packageNameCliOption: packageNameCliOption,
  packageManager: packageManagerOption,
  directory: createOption('--directory <string>', 'The directory to use'),
  installDeps: createOption(
    '--install-deps',
    'Install dependencies after scaffolding',
  ),
  noInstallDeps: createOption(
    '--no-install-deps',
    'Skip installing dependencies after scaffolding',
  ),
  initGit: createOption('--init-git', 'Initialise git'),
  noInitGit: createOption('--no-init-git', 'Skip initialising git'),
  hideLogo: createOption('--hide-logo', 'Hide the Tanstack Start logo'),
  ide: ideCliOption,
  debug: debugCliOption,
}

const addNewProjectOptions = (command: Command) => {
  return command
    .addOption(options.template)
    .addOption(options.packageNameCliOption)
    .addOption(options.packageManager)
    .addOption(options.directory)
    .addOption(options.installDeps)
    .addOption(options.noInstallDeps)
    .addOption(options.initGit)
    .addOption(options.noInitGit)
    .addOption(options.hideLogo)
    .addOption(options.ide)
    .addOption(options.debug)
}

// const addQueryCommand = addBaseOptions(
//   new Command()
//     .name('tanstack-query')
//     .description('Add the Tanstack Query module'),
// ).action((options) => {})

// const addCommand = new Command()
//   .name('add')
//   .description('Add a module to your Tanstack Start project')

const program = addNewProjectOptions(
  new Command('create-start')
    .name('create-start')
    .description('Scaffold a Tanstack Start appliaction')
    .command('default', {
      isDefault: true,
      hidden: true,
    }),
)
  // .addCommand(addCommand)
  .action(async (options) => {
    logger.info('Starting CLI action', { options })
    initDebug(options.debug)

    const templateId: TEMPLATE_NAME =
      options.template ?? (await templatePrompt())
    logger.verbose('Template selected', { templateId })

    const directory = options.directory ?? (await newProjectDirectoryPrompt())
    const targetPath = getAbsolutePath(directory)
    logger.verbose('Target directory resolved', { directory, targetPath })

    logger.info('Starting scaffold process', {
      templateId,
      targetPath,
      packageManager: options.packageManager,
      installDeps: options.installDeps,
      packageName: options.packageName,
      initGit: options.initGit,
      ide: options.ide,
    })

    await scaffoldTemplate({
      cfg: {
        packageManager: {
          packageManager: options.packageManager,
          installDeps: options.installDeps,
        },
        packageJson: {
          type: 'new',
          name: options.packageName,
        },
        git: {
          setupGit: options.initGit,
        },
        ide: {
          ide: options.ide,
        },
      },
      targetPath,
      templateId,
    })
    logger.info('Scaffold process complete')
  })

export async function runCli(argv: Array<string>) {
  logger.info('CLI starting', { argv })
  if (!argv.includes('--hide-logo')) {
    logo()
  }

  return new Promise((resolve, reject) => {
    logger.verbose('Parsing CLI arguments')
    program
      .parseAsync(argv)
      .then(resolve)
      .catch((error) => {
        logger.error('CLI execution failed', error)
        reject(error)
      })
  })
}
