import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test('prerenders with a config loaded through a custom Node condition', () => {
  const html = readFileSync(
    join(process.cwd(), 'dist', 'client', 'index.html'),
    'utf-8',
  )
  expect(html).toContain('Prerendered with the native config loader')
})
