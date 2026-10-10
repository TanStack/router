import { getConfig } from '@tanstack/router-generator'
import { generate } from './generate'
import { watch } from './watch'

declare const __TSR_VERSION__: string

const usage = `tsr <cmd> [args]

Commands:
  tsr generate  Generate the routes for a project
  tsr watch     Continuously watch and generate the routes for a project

Options:
  --version  Show version number
  --help     Show help`

main()

export function main() {
  const args = process.argv.slice(2)

  if (args.includes('--help')) {
    console.log(usage)
    return
  }

  if (args.includes('--version')) {
    console.log(__TSR_VERSION__)
    return
  }

  const command = args.find((arg) => !arg.startsWith('-'))

  if (command === 'generate') {
    let config
    try {
      config = getConfig()
    } catch (err) {
      console.error(err)
      process.exit(1)
    }
    generate(config, process.cwd())
    return
  }

  if (command === 'watch') {
    watch(process.cwd())
  }
}
