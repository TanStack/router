import { afterAll, bench } from 'vitest'
import { createBenchmark } from './ready-routes.fixture'

for (const mode of [
  'none',
  'cached',
  'sync',
  'async',
  'deferred',
  'chunks',
  'mixed',
] as const) {
  for (const depth of [2, 8]) {
    const fixture = await createBenchmark(mode, depth)
    bench(`${mode}, ${depth} matches, 100 navigations`, () => fixture.run(100))
    afterAll(() => {
      fixture.verify()
      fixture.dispose()
    })
  }
}
