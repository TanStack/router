import { installOutletsRemountsFlameGlobals, window } from '../flame-jsdom.ts'
import { workload } from './setup.ts'

const DURATION_MS = 10_000
const restoreGlobals = installOutletsRemountsFlameGlobals()

try {
  await workload.sanity()
  await workload.before()

  const startedAt = performance.now()
  while (performance.now() - startedAt < DURATION_MS) {
    await workload.run()
  }
} finally {
  await workload.after()
  restoreGlobals()
  window.close()
}
