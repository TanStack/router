import { Command, createOption } from '@commander-js/extra-typings'
import { packageManagerOption } from './modules/packageManager'
import { logo } from './logo'
import {
  DEFAULT_TEMPLATE,
  scaffoldTemplate,
  TEMPLATE_NAME,
  templateCliOption,
  templatePrompt,
} from './templates'
import { getAbsolutePath, newProjectDirectoryPrompt } from './directory'
import { packageNameCliOption } from './modules/createPackageJson'
import { ideCliOption } from './modules/ide'

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
    const templateId: TEMPLATE_NAME =
      options.template ?? (await templatePrompt())

    const directory = options.directory ?? (await newProjectDirectoryPrompt())
    const targetPath = getAbsolutePath(directory)

    await scaffoldTemplate({
      cfg: {
        installDeps: options.installDeps,
        packageManager: options.packageManager,
        name: options.packageName,
        setupGit: options.initGit,
        ide: options.ide,
      },
      targetPath,
      templateId,
    })
  })

export async function runCli(argv: string[]) {
  if (!argv.includes('--hide-logo')) {
    logo()
  }

  return new Promise((resolve, reject) => {
    program.parseAsync(argv).then(resolve).catch(reject)
  })
}
