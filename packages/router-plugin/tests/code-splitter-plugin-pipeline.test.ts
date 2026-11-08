import { describe, expect, it } from 'vitest'
import { routeFile, transformWithRouteHmrPlugin } from './regression-helpers'
import { getModuleErrors } from './validate-module'
import type { Config } from '../src/core/config'
import type { HmrStyle } from '../src/core/hmr'

describe('route HMR plugin without code splitting', () => {
  function transformWith(
    options: Partial<Config> & { target: 'solid' | 'vue' },
    hmrStyle?: HmrStyle,
  ) {
    const code = `
import { createFileRoute } from '@tanstack/${options.target}-router'
export const Route = createFileRoute('/hmr')({
  component: () => <p>hmr</p>,
})
`
    return transformWithRouteHmrPlugin(
      code,
      options,
      { file: routeFile('hmr'), routeId: '/hmr' },
      hmrStyle,
    )
  }

  it('uses webpack HMR with the generated route id for non-React routes', async () => {
    const output = transformWith({ target: 'solid' }, 'webpack')
    expect(output).toContain('import.meta.webpackHot')
    expect(output).not.toContain('import.meta.hot.')
    expect(output).toContain('"/hmr"')
    expect(output).not.toContain('__react_refresh_utils__')
    expect(await getModuleErrors(output)).toEqual([])
  })
})
