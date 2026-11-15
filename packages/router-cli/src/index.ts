import { cac } from 'cac'
import { getConfig } from '@tanstack/router-generator'
import { generate } from './generate'
import { watch } from './watch'

declare const __TSR_VERSION__: string

main()

export function main() {
  const cli = cac('tsr')

  cli
    .command('generate', 'Generate the routes for a project')
    .action(async () => {
      const config = getConfig()
      await generate(config, process.cwd())
    })

  cli
    .command(
      'watch',
      'Continuously watch and generate the routes for a project',
    )
    .action(() => {
      watch(process.cwd())
    })

  cli.help()
  cli.version(__TSR_VERSION__)

  try {
    cli.parse()
  } catch (err) {
    // cac throws `CACError` for invalid usage (unknown option, extra args)
    if (err instanceof Error && err.name === 'CACError') {
      console.error(err.message)
      process.exit(1)
    }
    throw err
  }

  if (!cli.matchedCommand && !cli.options.help && !cli.options.version) {
    // `tsr` and `tsr help` print help; unknown commands also exit with 1
    if (cli.args.length && cli.args[0] !== 'help') {
      console.error(`Unknown command: ${cli.args.join(' ')}\n`)
      process.exitCode = 1
    }
    cli.outputHelp()
  }
}
