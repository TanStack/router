import fs from 'node:fs'
import path from 'node:path'
import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import {
  DEPLOYMENT_ID,
  HEADER_CARRIER,
} from '../src/deployment-metadata.config'

const deploymentMetadataEnabled = process.env.E2E_DEPLOYMENT_METADATA !== 'off'

function readClientJs() {
  const clientDir = path.resolve(
    import.meta.dirname,
    '..',
    process.env.E2E_DIST_DIR ?? 'dist',
    'client',
  )

  return fs
    .readdirSync(clientDir, { recursive: true, encoding: 'utf-8' })
    .filter((file) => file.endsWith('.js'))
    .map((file) => fs.readFileSync(path.join(clientDir, file), 'utf-8'))
    .join('\n')
}

test.describe('deployment metadata client bundle', () => {
  test.skip(!deploymentMetadataEnabled)

  test('includes the carrier code when metadata is available', () => {
    const js = readClientJs()

    expect(js).toContain('.carriers[0]')
    expect(js).toContain(DEPLOYMENT_ID)
    expect(js).toContain(HEADER_CARRIER)
  })
})

test.describe('no deployment metadata client bundle', () => {
  test.skip(deploymentMetadataEnabled)

  test('drops the carrier code when metadata is unavailable', () => {
    const js = readClientJs()

    expect(js).toContain('x-tsr-serverFn')
    expect(js).not.toContain('carriers')
    expect(js).not.toContain(DEPLOYMENT_ID)
    expect(js).not.toContain(HEADER_CARRIER)
  })
})
