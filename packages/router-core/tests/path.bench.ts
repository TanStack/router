import { bench, describe, expect } from 'vitest'
import { interpolatePath } from '../src/path'

const iterations = 10_000
const plainOptions = {
  path: '/organizations/$organizationId/projects/$projectId',
  params: { organizationId: 'tanstack', projectId: 'router' },
}
const bracedOptions = {
  path: '/organizations/prefix{$organizationId}/projects/{-$projectId}',
  params: { organizationId: 'tanstack', projectId: 'router' },
}
let benchmarkSink = 0

expect(interpolatePath(plainOptions).interpolatedPath).toBe(
  '/organizations/tanstack/projects/router',
)
expect(interpolatePath(bracedOptions).interpolatedPath).toBe(
  '/organizations/prefixtanstack/projects/router',
)

function interpolateBatch(options: Parameters<typeof interpolatePath>[0]) {
  let size = 0
  for (let index = 0; index < iterations; index++) {
    size += interpolatePath(options).interpolatedPath.length
  }
  benchmarkSink = size
}

describe('path interpolation', () => {
  bench('plain route templates', () => {
    interpolateBatch(plainOptions)
  })

  bench('braced route templates', () => {
    interpolateBatch(bracedOptions)
  })
})

void benchmarkSink
