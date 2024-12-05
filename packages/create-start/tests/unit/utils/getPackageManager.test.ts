import { afterEach, describe, expect, it } from 'vitest'
import { getPackageManager } from '../../../src/utils/getPackageManager'

describe('getPackageManager', () => {
  const originalUserAgent = process.env.npm_config_user_agent

  afterEach(() => {
    process.env.npm_config_user_agent = originalUserAgent
  })

  it('should return undefined when no user agent is set', () => {
    process.env.npm_config_user_agent = undefined
    expect(getPackageManager()).toBeUndefined()
  })

  it('should identify npm from user agent', () => {
    process.env.npm_config_user_agent =
      'npm/8.19.2 node/v16.18.0 linux x64 workspaces/false'
    expect(getPackageManager()).toBe('npm')
  })

  it('should identify yarn from user agent', () => {
    process.env.npm_config_user_agent =
      'yarn/1.22.19 npm/? node/v16.18.0 linux x64'
    expect(getPackageManager()).toBe('yarn')
  })

  it('should identify pnpm from user agent', () => {
    process.env.npm_config_user_agent =
      'pnpm/7.14.0 npm/? node/v16.18.0 linux x64'
    expect(getPackageManager()).toBe('pnpm')
  })

  it('should return undefined for unsupported package manager', () => {
    process.env.npm_config_user_agent = 'unsupported/1.0.0'
    expect(getPackageManager()).toBeUndefined()
  })
})
