import { configSchema, getConfig } from '@tanstack/router-plugin/config'
import { expect, test } from 'vitest'

test('the public configuration entry validates options without a bundler adapter', () => {
  const config = configSchema.parse({
    target: 'react',
    routesDirectory: './src/routes',
  })
  expect(config.target).toBe('react')
  expect(config.routesDirectory).toBe('./src/routes')
  expect(getConfig).toBeTypeOf('function')
})
