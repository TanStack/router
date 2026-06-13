import { runClientFlameBenchmark } from '#memory-client/flame-runner'
import { setup } from './setup.ts'

await runClientFlameBenchmark(setup)
