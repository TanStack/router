import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { loadEnvPlugin } from '../../src/load-env-plugin/plugin'

describe('loadEnvPlugin', () => {
  let testDir: string
  const originalEnv = { ...process.env }

  beforeEach(() => {
    testDir = join(tmpdir(), `load-env-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key]
      }
    }
    Object.assign(process.env, originalEnv)
  })

  test('should load .env file', () => {
    writeFileSync(join(testDir, '.env'), 'TEST_BASE_VAR=base_value')

    const plugin = loadEnvPlugin()
    const configHook = (plugin as any).config

    const result = configHook({ root: testDir }, { mode: 'development' })

    expect(process.env.TEST_BASE_VAR).toBe('base_value')
    expect(result.define['process.env.TEST_BASE_VAR']).toBe('"base_value"')
  })

  test('should merge .env.development with .env', () => {
    writeFileSync(
      join(testDir, '.env'),
      'TEST_SECRET=from_env\nTEST_SHARED=shared_value',
    )
    writeFileSync(
      join(testDir, '.env.development'),
      'TEST_SECRET=from_development\nTEST_DEV_ONLY=dev_value',
    )

    const plugin = loadEnvPlugin()
    const configHook = (plugin as any).config

    configHook({ root: testDir }, { mode: 'development' })

    expect(process.env.TEST_SECRET).toBe('from_development')
    expect(process.env.TEST_SHARED).toBe('shared_value')
    expect(process.env.TEST_DEV_ONLY).toBe('dev_value')
  })

  test('should load .env.production in production mode', () => {
    writeFileSync(join(testDir, '.env'), 'TEST_MODE_VAR=base')
    writeFileSync(join(testDir, '.env.production'), 'TEST_MODE_VAR=production')
    writeFileSync(
      join(testDir, '.env.development'),
      'TEST_MODE_VAR=development',
    )

    const plugin = loadEnvPlugin()
    const configHook = (plugin as any).config

    configHook({ root: testDir }, { mode: 'production' })

    expect(process.env.TEST_MODE_VAR).toBe('production')
  })

  test('should load .env.development in development mode', () => {
    writeFileSync(join(testDir, '.env'), 'TEST_MODE_VAR2=base')
    writeFileSync(join(testDir, '.env.production'), 'TEST_MODE_VAR2=production')
    writeFileSync(
      join(testDir, '.env.development'),
      'TEST_MODE_VAR2=development',
    )

    const plugin = loadEnvPlugin()
    const configHook = (plugin as any).config

    configHook({ root: testDir }, { mode: 'development' })

    expect(process.env.TEST_MODE_VAR2).toBe('development')
  })

  test('should return define config with process.env replacements', () => {
    writeFileSync(join(testDir, '.env'), 'TEST_API_KEY=secret123')

    const plugin = loadEnvPlugin()
    const configHook = (plugin as any).config

    const result = configHook({ root: testDir }, { mode: 'development' })

    expect(result.define['process.env.TEST_API_KEY']).toBe('"secret123"')
  })

  test('should preserve existing userConfig.define', () => {
    writeFileSync(join(testDir, '.env'), 'TEST_VAR=value')

    const plugin = loadEnvPlugin()
    const configHook = (plugin as any).config

    const result = configHook(
      {
        root: testDir,
        define: { 'process.env.EXISTING': '"existing_value"' },
      },
      { mode: 'development' },
    )

    expect(result.define['process.env.EXISTING']).toBe('"existing_value"')
    expect(result.define['process.env.TEST_VAR']).toBe('"value"')
  })

  test('should use process.cwd() when root is not specified', () => {
    const plugin = loadEnvPlugin()
    const configHook = (plugin as any).config

    const result = configHook({}, { mode: 'development' })

    expect(result).toHaveProperty('define')
  })
})
