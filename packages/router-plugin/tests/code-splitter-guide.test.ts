/**
 * The examples of the user guide's "Top-level code" part
 * (docs/router/guide/automatic-code-splitting.md), as the guide writes them,
 * through the public router plugin in the production client build of a
 * route app (`route.production()`: what ships, no page): where each piece of
 * code loads, and each warning the build prints, in full. The guide copies
 * the code and the warnings from here; the modules the examples import are
 * the app's files. The warnings are checked by wording, an exception to
 * compiler-test-utils/AGENTS.md: this test's subject is the text the guide
 * quotes verbatim.
 */
import { describe, expect, it } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { loadRoute } from './route-app'

/** The production build of the route file `src/routes/<name>.tsx` (route `/<name>`), with `files`. */
async function production(
  name: string,
  code: string,
  files: Record<string, string>,
) {
  const route = await loadRoute(code, {
    filename: `src/routes/${name}.tsx`,
    routeId: `/${name}`,
    files,
    fresh: true,
  })
  const built = await route.production()
  const warnings = findDiagnostics(built.warnings, {
    severity: 'warning',
    file: `src/routes/${name}.tsx`,
    root: built.root,
  }).map((d) => d.text)
  return { built, warnings }
}

describe('the code-splitting guide: top-level code', () => {
  it('moves a declaration with side effects and a statement using it into the chunk', async () => {
    const { built, warnings } = await production(
      'account',
      `import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { Confetti } from '../confetti'
import { registry } from '../registry'

// ✅ both move into the component's chunk and run when it loads
const confetti = new Confetti({ colors: ['gold'] })
registry.add(confetti, 'account-confetti')

export const Route = createFileRoute('/account')({
  validateSearch: z.object({ success: z.boolean().optional() }),
  component: () => <button onClick={() => confetti.fire()} />,
})
`,
      {
        'src/confetti.ts': `export class Confetti {
  constructor(readonly options: { colors: Array<string> }) {}
  fire() {}
}
`,
        'src/registry.ts': `export const registry = {
  add: (value: unknown, name: string) => [value, name],
}
`,
      },
    )
    expect(warnings).toEqual([])
    expect(built.where('gold')).toBe('lazy')
    expect(built.where('account-confetti')).toBe('lazy')
  })

  it('puts what two split chunks use in one shared module', async () => {
    const { built, warnings } = await production(
      'posts',
      `import { createFileRoute } from '@tanstack/react-router'
import { createAnalytics } from '../analytics'

// ✅ one shared module for the component and the error component
const analytics = createAnalytics('posts-analytics')

export const Route = createFileRoute('/posts')({
  component: () => <button onClick={() => analytics.track('post-opened')} />,
  errorComponent: () => <button onClick={() => analytics.track('post-retried')} />,
})
`,
      {
        'src/analytics.ts': `export const createAnalytics = (name: string) => ({
  name,
  track: (event: string) => [name, event],
})
`,
      },
    )
    expect(warnings).toEqual([])
    // (one lazy chunk holds it: neither split chunk carries a copy)
    expect(built.locate('posts-analytics')).toMatchObject({ eager: [] })
    expect(built.locate('posts-analytics').lazy).toHaveLength(1)
    expect(built.where('post-opened')).toBe('lazy')
    expect(built.where('post-retried')).toBe('lazy')
  })

  it('moves an exported binding only split code uses to a module of its own, with its statements', async () => {
    const { built, warnings } = await production(
      'cart',
      `import { createFileRoute } from '@tanstack/react-router'
import { createStore, log } from '../store'

// ✅ split: a module of its own, which the chunk imports
export const store = createStore('cart-store')
store.subscribe(log)

export const Route = createFileRoute('/cart')({
  component: () => <p>{store.count}</p>,
})
`,
      {
        'src/store.ts': `export const createStore = (name: string) => ({
  name,
  count: 0,
  subscribe: (listener: (name: string) => void) => listener(name),
})
export const log = (name: string) => console.log('store-log', name)
`,
      },
    )
    expect(warnings).toEqual([])
    expect(built.where('cart-store')).toBe('lazy')
    expect(built.where('store-log')).toBe('lazy')
  })

  it('warns for a binding a statement that stays changes', async () => {
    const { warnings } = await production(
      'settings',
      `import { createFileRoute } from '@tanstack/react-router'
import { createSession, createTheme } from '../app'

const theme = createTheme()
const session = createSession()
if (import.meta.env.PROD) {
  theme.mode = 'dark'
  session.secure = true
}

export const Route = createFileRoute('/settings')({
  beforeLoad: () => session.check(),
  component: () => <p>{theme.mode}</p>,
})
`,
      { 'src/app.ts': app },
    )
    expect(warnings).toEqual([
      expect.stringContaining(
        '[tanstack-router] `theme` in src/routes/settings.tsx stays in the route module because the statement on line 6, which changes it, stays there: it also changes `session`, which the route module keeps; change `session` in a statement of its own, so `theme` can load with the split `component`.',
      ),
    ])
  })

  it('warns for a value read at load from state the module changes later', async () => {
    const { warnings } = await production(
      'theme',
      `import { createFileRoute } from '@tanstack/react-router'
import { loadPrefs, readTheme } from '../prefs'

const prefs = loadPrefs()
const initialTheme = prefs.theme
window.addEventListener('storage', () => {
  prefs.theme = readTheme()
})

export const Route = createFileRoute('/theme')({
  component: () => <p>{initialTheme}</p>,
})
`,
      {
        'src/prefs.ts': `export const loadPrefs = () => ({ theme: 'light' })
export const readTheme = () => 'dark'
`,
      },
    )
    expect(warnings).toEqual([
      expect.stringContaining(
        '[tanstack-router] `initialTheme` in src/routes/theme.tsx stays in the route module because it uses `prefs` when the module loads, and the module writes `prefs`; use `prefs` inside the code that needs it, or move both to their own module, so `initialTheme` can load with the split `component`.',
      ),
    ])
  })

  it('warns for unused code that puts the bindings of two chunks in one shared module', async () => {
    const { warnings } = await production(
      'dashboard',
      `import { createFileRoute } from '@tanstack/react-router'
import { createCache, createClient } from '../app'

const cache = createCache()
const client = createClient()
function debugDump() {
  return [cache, client]
}

export const Route = createFileRoute('/dashboard')({
  component: () => <p>{cache.size}</p>,
  errorComponent: () => <p>{client.status}</p>,
})
`,
      { 'src/app.ts': app },
    )
    expect(warnings).toEqual([
      expect.stringContaining(
        '[tanstack-router] In src/routes/dashboard.tsx, unused `debugDump` (line 6) puts `cache` and `client` in one shared module the split `component` and `errorComponent` import; delete `debugDump`, so each loads with the split code that needs it.',
      ),
    ])
  })
})

/** The app module the warning examples import. */
const app = `export const createTheme = () => ({ mode: 'light' })
export const createSession = () => ({ secure: false, check: () => true })
export const createCache = () => new Map()
export const createClient = () => ({ status: 'idle' })
`
