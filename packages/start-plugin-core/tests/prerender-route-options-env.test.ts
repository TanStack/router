import { describe, expect, it } from 'vitest'
import {
  applySeparateRouteOptionsDefault,
  shouldSeparateRouteOptions,
} from '../src/prerender-route-options-env'
import { parseStartConfig } from '../src/schema'

describe('separate prerender route options environment', () => {
  it('is enabled by default when prerendering is enabled', () => {
    const startConfig = parseStartConfig(
      { prerender: { enabled: true } },
      { framework: 'react' },
      process.cwd(),
    )

    expect(shouldSeparateRouteOptions(startConfig)).toBe(true)
  })

  it('can be disabled to keep route options in the final server bundle', () => {
    const startConfig = parseStartConfig(
      {
        prerender: {
          enabled: true,
          separateRouteOptionsBundle: false,
        },
      },
      { framework: 'react' },
      process.cwd(),
    )

    expect(shouldSeparateRouteOptions(startConfig)).toBe(false)
  })

  it('can be disabled by a deployment-specific default', () => {
    const startConfig = parseStartConfig(
      { prerender: { enabled: true } },
      { framework: 'react' },
      process.cwd(),
    )

    applySeparateRouteOptionsDefault(startConfig, false)

    expect(shouldSeparateRouteOptions(startConfig)).toBe(false)
  })

  it('preserves explicit user configuration over deployment defaults', () => {
    const startConfig = parseStartConfig(
      {
        prerender: {
          enabled: true,
          separateRouteOptionsBundle: true,
        },
      },
      { framework: 'react' },
      process.cwd(),
    )

    applySeparateRouteOptionsDefault(startConfig, false)

    expect(shouldSeparateRouteOptions(startConfig)).toBe(true)
  })

  it('is enabled for SPA builds so final server output is stripped', () => {
    const startConfig = parseStartConfig(
      {
        spa: { enabled: true },
        prerender: { enabled: true },
      },
      { framework: 'react' },
      process.cwd(),
    )

    expect(shouldSeparateRouteOptions(startConfig)).toBe(true)
  })
})
