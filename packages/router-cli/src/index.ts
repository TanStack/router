import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { getConfig } from '@tanstack/router-generator'
import { generate } from './generate'
import { watch } from './watch'
import { initializeNativeScript } from './native-init'
import type { NativeScriptPackageManager } from './native-init'

void main()

export async function main() {
  await yargs(hideBin(process.argv))
    .scriptName('tsr')
    .usage('$0 <cmd> [args]')
    .command('generate', 'Generate the routes for a project', async () => {
      const config = getConfig()
      await generate(config, process.cwd())
    })
    .command(
      'watch',
      'Continuously watch and generate the routes for a project',
      () => {
        watch(process.cwd())
      },
    )
    .command(
      'native',
      'Manage a NativeScript target for this React app',
      (native) =>
        native
          .command(
            'init [root]',
            'Add an iOS and Android NativeScript target',
            (init) =>
              init
                .positional('root', {
                  description: 'TanStack app directory',
                  type: 'string',
                  default: process.cwd(),
                })
                .option('app-id', {
                  description: 'Reverse-DNS iOS and Android application id',
                  type: 'string',
                })
                .option('router-file', {
                  description: 'App router module, relative to root',
                  type: 'string',
                })
                .option('server-fn-base', {
                  description:
                    'Absolute deployed Start server-function endpoint',
                  type: 'string',
                })
                .option('server-port', {
                  description: 'Local TanStack Start server port',
                  type: 'number',
                  default: 3000,
                })
                .option('adapter-version', {
                  description:
                    'NativeScript adapter package version, tag, or tarball',
                  type: 'string',
                })
                .option('package-manager', {
                  choices: ['npm', 'pnpm', 'yarn'] as const,
                  description: 'Package manager used to install dependencies',
                })
                .option('install', {
                  description: 'Install dependencies after writing files',
                  type: 'boolean',
                  default: true,
                })
                .option('force', {
                  description: 'Replace conflicting managed files',
                  type: 'boolean',
                  default: false,
                }),
            async (args) => {
              const result = await initializeNativeScript({
                root: args.root,
                appId: args.appId,
                routerFile: args.routerFile,
                serverFnBase: args.serverFnBase,
                serverPort: args.serverPort,
                adapterVersion: args.adapterVersion,
                packageManager: args.packageManager as
                  | NativeScriptPackageManager
                  | undefined,
                install: args.install,
                force: args.force,
              })

              console.info(
                `Initialized the ${result.mode} NativeScript target in ${result.root}.`,
              )
              console.info(
                `Run ${result.packageManager} run native:ios or ${result.packageManager} run native:android.`,
              )
            },
          )
          .demandCommand(1),
      () => {},
    )
    .demandCommand(1)
    .help()
    .parseAsync()
}
