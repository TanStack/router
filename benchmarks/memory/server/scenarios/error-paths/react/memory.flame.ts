import { runServerFlameBenchmark } from '#memory-server/flame-runner'
import { setup } from './setup.ts'

await runServerFlameBenchmark(setup)
