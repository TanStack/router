import { derivePort } from '@tanstack/router-e2e-utils'
import packageJson from '../../package.json' with { type: 'json' }

export default async function teardown() {
  const port = await derivePort(`${packageJson.name}-external`)

  await fetch(`http://localhost:${port}/stop`, {
    method: 'POST',
  })
}
