import { runCli } from './cli'

runCli(process.argv).catch((error) => {
  console.error(error)
  process.exit(1)
})
