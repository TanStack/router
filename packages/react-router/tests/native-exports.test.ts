import { describe, expect, it } from 'vitest'
import * as routerCore from '@tanstack/router-core'
import * as nativeEntry from '../src/native'

describe('native entrypoint', () => {
  it('re-exports every router-core runtime value', () => {
    const nativeExports = nativeEntry as Record<string, unknown>

    for (const [name, value] of Object.entries(routerCore)) {
      expect(nativeExports[name], name).toBe(value)
    }
  })
})
