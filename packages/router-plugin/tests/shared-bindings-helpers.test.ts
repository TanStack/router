import { describe, expect, it } from 'vitest'
import {
  addSharedSearchParamToFilename,
  computeSharedBindings,
} from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import type { CodeSplitGroupings } from '../src/core/constants'

describe('addSharedSearchParamToFilename', () => {
  it('should append tsr-shared=1 to bare filename', () => {
    expect(addSharedSearchParamToFilename('src/routes/index.tsx')).toBe(
      'src/routes/index.tsx?tsr-shared=1',
    )
  })

  it('should strip existing query params', () => {
    expect(
      addSharedSearchParamToFilename(
        'src/routes/index.tsx?tsr-split=component',
      ),
    ).toBe('src/routes/index.tsx?tsr-shared=1')
  })
})

describe('computeSharedBindings', () => {
  const defaultGroupings = defaultCodeSplitGroupings

  it('should return empty set when no route options exist', () => {
    const code = 'const x = 1'
    const result = computeSharedBindings({
      code,
      codeSplitGroupings: defaultGroupings,
    })
    expect(result.size).toBe(0)
  })

  it('should return empty set for root routes (unsplittable)', () => {
    const code = `
import { createRootRoute } from '@tanstack/react-router'
const shared = 42
export const Route = createRootRoute({
  component: () => shared,
  beforeLoad: () => shared,
})
`
    const result = computeSharedBindings({
      code,
      codeSplitGroupings: defaultGroupings,
    })
    expect(result.size).toBe(0)
  })

  it('should detect binding shared between split and non-split properties', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router'
const sharedValue = 42
export const Route = createFileRoute('/')({
  component: () => sharedValue,
  beforeLoad: () => sharedValue,
})
`
    const result = computeSharedBindings({
      code,
      codeSplitGroupings: defaultGroupings,
    })
    expect(result).toContain('sharedValue')
  })

  it('should NOT mark binding as shared if only used by split properties', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router'
const myComponent = () => <div />
export const Route = createFileRoute('/')({
  component: myComponent,
})
`
    const result = computeSharedBindings({
      code,
      codeSplitGroupings: defaultGroupings,
    })
    expect(result.size).toBe(0)
  })

  it('should NOT mark binding as shared if only used by non-split properties', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router'
const validator = () => true
export const Route = createFileRoute('/')({
  component: () => <div />,
  beforeLoad: validator,
})
`
    const result = computeSharedBindings({
      code,
      codeSplitGroupings: defaultGroupings,
    })
    expect(result.size).toBe(0)
  })

  it('should detect shared function declaration', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router'
function helperFn() { return 42 }
export const Route = createFileRoute('/')({
  component: () => helperFn(),
  beforeLoad: () => helperFn(),
})
`
    const result = computeSharedBindings({
      code,
      codeSplitGroupings: defaultGroupings,
    })
    expect(result).toContain('helperFn')
  })

  it('should mark shared when binding used by two different split groups', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router'
class Config { value = 1 }
export const Route = createFileRoute('/')({
  component: () => new Config(),
  loader: () => new Config(),
})
`
    const result = computeSharedBindings({
      code,
      codeSplitGroupings: [['component'], ['loader']],
    })
    // component and loader are in different split groups → Config is shared
    expect(result).toContain('Config')
  })

  it('should detect shared class when used by split and non-split', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router'
class Config { value = 1 }
export const Route = createFileRoute('/')({
  component: () => new Config(),
  beforeLoad: () => new Config(),
})
`
    const result = computeSharedBindings({
      code,
      codeSplitGroupings: defaultGroupings,
    })
    expect(result).toContain('Config')
  })

  it('should expand transitive deps into shared set', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router'
const BASE = 10
const multiplier = BASE * 2
export const Route = createFileRoute('/')({
  component: () => multiplier,
  beforeLoad: () => multiplier,
})
`
    const result = computeSharedBindings({
      code,
      codeSplitGroupings: defaultGroupings,
    })
    expect(result).toContain('multiplier')
    expect(result).toContain('BASE')
  })

  it('should expand destructured declarations', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router'
const { a, b } = getValues()
export const Route = createFileRoute('/')({
  component: () => a,
  beforeLoad: () => a,
})
`
    const result = computeSharedBindings({
      code,
      codeSplitGroupings: defaultGroupings,
    })
    expect(result).toContain('a')
    expect(result).toContain('b')
  })

  it('should handle no local bindings gracefully', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  component: () => <div />,
  beforeLoad: () => {},
})
`
    const result = computeSharedBindings({
      code,
      codeSplitGroupings: defaultGroupings,
    })
    expect(result.size).toBe(0)
  })

  it('should not include imported bindings as shared (bundlers dedupe them)', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router'
import { helper } from './utils'
export const Route = createFileRoute('/')({
  component: () => helper(),
  beforeLoad: () => helper(),
})
`
    const result = computeSharedBindings({
      code,
      codeSplitGroupings: defaultGroupings,
    })
    expect(result).not.toContain('helper')
    expect(result.size).toBe(0)
  })

  it('should handle multiple shared bindings', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router'
const a = 1
const b = 2
export const Route = createFileRoute('/')({
  component: () => a + b,
  beforeLoad: () => a + b,
})
`
    const result = computeSharedBindings({
      code,
      codeSplitGroupings: defaultGroupings,
    })
    expect(result).toContain('a')
    expect(result).toContain('b')
  })

  it('should handle chained createFileRoute call pattern', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router'
const data = { value: 42 }
export const Route = createFileRoute('/')({
  component: () => data.value,
  validateSearch: () => data,
})
`
    const result = computeSharedBindings({
      code,
      codeSplitGroupings: defaultGroupings,
    })
    expect(result).toContain('data')
  })

  it('should handle loader in default groupings (not split by default)', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router'
const config = { key: 'value' }
export const Route = createFileRoute('/')({
  component: () => config.key,
  loader: () => config,
})
`
    const result = computeSharedBindings({
      code,
      codeSplitGroupings: defaultGroupings,
    })
    // In default groupings, loader is NOT split → non-split
    // component IS split → config referenced by both → shared
    expect(result).toContain('config')
  })

  it('should handle custom groupings where loader and component are in different split groups', () => {
    const groupings: CodeSplitGroupings = [['component'], ['loader']]
    const code = `
import { createFileRoute } from '@tanstack/react-router'
const config = { key: 'value' }
export const Route = createFileRoute('/')({
  component: () => config.key,
  loader: () => config,
})
`
    const result = computeSharedBindings({
      code,
      codeSplitGroupings: groupings,
    })
    // component and loader are in different split groups → config is shared
    expect(result).toContain('config')
  })

  it('should NOT mark shared when binding used by only one split group', () => {
    const groupings: CodeSplitGroupings = [
      ['loader', 'component'],
      ['errorComponent'],
    ]
    const code = `
import { createFileRoute } from '@tanstack/react-router'
const config = { key: 'value' }
export const Route = createFileRoute('/')({
  component: () => config.key,
  loader: () => config,
})
`
    const result = computeSharedBindings({
      code,
      codeSplitGroupings: groupings,
    })
    // component and loader are in the SAME split group → config only in one group → not shared
    expect(result.size).toBe(0)
  })

  it('should handle custom groupings with non-split property referencing shared binding', () => {
    const groupings: CodeSplitGroupings = [['component'], ['loader']]
    const code = `
import { createFileRoute } from '@tanstack/react-router'
const config = { key: 'value' }
export const Route = createFileRoute('/')({
  component: () => config.key,
  loader: () => config,
  beforeLoad: () => config,
})
`
    const result = computeSharedBindings({
      code,
      codeSplitGroupings: groupings,
    })
    // config used by component (split), loader (split), beforeLoad (non-split)
    // In both splitRefs and nonSplitRefs → shared
    expect(result).toContain('config')
  })

  it('should handle deep transitive chain with destructuring', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router'
const base = 10
const { x, y } = compute(base)
export const Route = createFileRoute('/')({
  component: () => x,
  beforeLoad: () => x,
})
`
    const result = computeSharedBindings({
      code,
      codeSplitGroupings: defaultGroupings,
    })
    // x is shared → y must be shared (destructured together)
    // base is a transitive dep of {x, y} declaration → also shared
    expect(result).toContain('x')
    expect(result).toContain('y')
    expect(result).toContain('base')
  })

  it('should NOT include bindings that transitively depend on Route', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router'
const HEADER = 'Page'
function usePageTitle() { return HEADER + ' - ' + Route.fullPath }
export const Route = createFileRoute('/about')({
  loader: () => usePageTitle(),
  component: () => usePageTitle(),
})
`
    const result = computeSharedBindings({
      code,
      codeSplitGroupings: defaultGroupings,
    })
    // usePageTitle references Route → cannot be shared
    expect(result).not.toContain('usePageTitle')
    // HEADER does NOT reference Route → still safe to share
    expect(result).toContain('HEADER')
    // Route must never be shared
    expect(result).not.toContain('Route')
  })

  it('should remove entire transitive chain if it reaches Route', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router'
const routeInfo = { path: '' }
function initRouteInfo() { routeInfo.path = Route.fullPath }
function getTitle() { initRouteInfo(); return routeInfo.path }
export const Route = createFileRoute('/test')({
  loader: () => getTitle(),
  component: () => getTitle(),
})
`
    const result = computeSharedBindings({
      code,
      codeSplitGroupings: defaultGroupings,
    })
    // getTitle → initRouteInfo → Route: entire chain cannot be shared
    expect(result).not.toContain('getTitle')
    expect(result).not.toContain('initRouteInfo')
    expect(result).not.toContain('Route')
    // routeInfo doesn't reference Route directly, but initRouteInfo does
    // routeInfo itself may or may not be shared depending on its own deps
  })

  it('should keep bindings that do NOT depend on Route alongside ones that do', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router'
const safeConfig = { timeout: 5000 }
function unsafeHelper() { return Route.fullPath }
export const Route = createFileRoute('/mixed')({
  loader: () => ({ config: safeConfig, path: unsafeHelper() }),
  component: () => <div>{safeConfig.timeout} {unsafeHelper()}</div>,
})
`
    const result = computeSharedBindings({
      code,
      codeSplitGroupings: defaultGroupings,
    })
    expect(result).toContain('safeConfig')
    expect(result).not.toContain('unsafeHelper')
    expect(result).not.toContain('Route')
  })
})

// ─── removeBindingsDependingOnRoute ───────────────────────
