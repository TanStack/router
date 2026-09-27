import { describe, expect, it } from 'vitest'
import {
  shouldSeparateRouteOptions,
  shouldStripRouteOptionsFromServer,
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

  it('is disabled for SPA builds', () => {
    const startConfig = parseStartConfig(
      {
        spa: { enabled: true },
        prerender: { enabled: true },
      },
      { framework: 'react' },
      process.cwd(),
    )

    expect(shouldSeparateRouteOptions(startConfig)).toBe(false)
  })
})

describe('final server route option stripping', () => {
  it.each([
    { name: 'SSR', input: {}, expected: true },
    {
      name: 'SPA',
      input: { spa: { enabled: true } },
      expected: true,
    },
    {
      name: 'separate prerender bundle',
      input: { prerender: { enabled: true } },
      expected: true,
    },
    {
      name: 'shared prerender bundle',
      input: {
        prerender: {
          enabled: true,
          separateRouteOptionsBundle: false,
        },
      },
      expected: false,
    },
  ])(
    'strips route options from $name final server output: $expected',
    ({ input, expected }) => {
      const startConfig = parseStartConfig(
        input,
        { framework: 'react' },
        process.cwd(),
      )

      expect(shouldStripRouteOptionsFromServer(startConfig)).toBe(expected)
    },
  )
})
