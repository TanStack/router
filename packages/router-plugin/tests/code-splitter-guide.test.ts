/**
 * The examples of the user guide's "Top-level code" part
 * (docs/router/guide/automatic-code-splitting.md), as the guide writes them,
 * through the public router plugin: where each piece of code loads and each
 * warning in the production client build of a route app
 * (`route.production()`: what ships), what the page shows on the Vite dev
 * server (`route.run()`), and that each fix the guide's table gives works.
 * The guide copies the code and the warnings from here; the modules the
 * examples import are the app's files (some record what ran in
 * `globalThis.seeded`). The warnings are checked by wording, an exception to
 * compiler-test-utils/AGENTS.md: this test's subject is the text the guide
 * quotes verbatim.
 */
import { describe, expect, it } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { loadRoute } from './route-app'

/** The route file `src/routes/<name>.tsx` (route `/<name>`), with `files` and the app modules below. */
function route(name: string, code: string, files: Record<string, string> = {}) {
  return loadRoute(code, {
    filename: `src/routes/${name}.tsx`,
    routeId: `/${name}`,
    files: { ...app, ...files },
    fresh: true,
  })
}

/** The production build of the route file `src/routes/<name>.tsx`, and the warnings about it. */
async function production(
  name: string,
  code: string,
  files: Record<string, string> = {},
) {
  const built = await (await route(name, code, files)).production()
  const warnings = findDiagnostics(built.warnings, {
    severity: 'warning',
    file: `src/routes/${name}.tsx`,
    root: built.root,
  }).map((d) => d.text)
  return { built, warnings }
}

/** What the page records before and after rendering the split component on the Vite dev server, and its HTML. */
async function rendered(name: string, code: string, first = '') {
  return (await route(name, code)).run<{
    atLoad: Array<string>
    html: string
    after: Array<string>
  }>(
    `const atLoad = [...globalThis.seeded]
${first}
const html = await render('component')
return { atLoad, html, after: [...globalThis.seeded] }`,
    { before: 'globalThis.seeded = []' },
  )
}

describe('the code-splitting guide: where top-level code goes', () => {
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
  errorComponent: () => (
    <button onClick={() => analytics.track('post-retried')} />
  ),
})
`,
    )
    expect(warnings).toEqual([])
    // (one lazy chunk holds it: neither split chunk carries a copy)
    expect(built.locate('posts-analytics')).toMatchObject({ eager: [] })
    expect(built.locate('posts-analytics').lazy).toHaveLength(1)
    expect(built.where('post-opened')).toBe('lazy')
    expect(built.where('post-retried')).toBe('lazy')
  })

  it('runs a statement that moved when its chunk loads', async () => {
    const code = `import { createFileRoute } from '@tanstack/react-router'
import { Sentry } from '../sentry'

const sentryConfig = { dsn: 'https://sentry.example.com/1' }
// runs when the component's chunk loads, not when the app starts
Sentry.init(sentryConfig)

export const Route = createFileRoute('/about')({
  component: () => <p>{sentryConfig.dsn}</p>,
})
`
    const { built, warnings } = await production('about', code)
    expect(warnings).toEqual([])
    expect(built.where('sentry.example.com')).toBe('lazy')
    expect(await rendered('about', code)).toEqual({
      atLoad: [],
      html: '<p>https://sentry.example.com/1</p>',
      after: ['Sentry.init'],
    })
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
    )
    expect(warnings).toEqual([])
    expect(built.where('cart-store')).toBe('lazy')
    expect(built.where('store-log')).toBe('lazy')
  })
})

describe('the code-splitting guide: the warnings and their fixes', () => {
  it('a statement that stays changes the binding', async () => {
    const { warnings } = await production(
      'settings',
      `import { createFileRoute } from '@tanstack/react-router'
import { createSession, createTheme } from '../app'

const theme = createTheme()
const session = createSession()
if (location.hostname === 'localhost') {
  theme.banner = 'Local build'
  session.secure = false
}

export const Route = createFileRoute('/settings')({
  beforeLoad: () => session.check(),
  component: () => <p>{theme.banner}</p>,
})
`,
    )
    expect(warnings).toEqual([
      expect.stringContaining(
        '[tanstack-router] `theme` in src/routes/settings.tsx stays in the route module because the statement on line 6, which changes it, stays there: it also changes `session`, which the route module keeps; change `session` in a statement of its own, so `theme` can load with the split `component`.',
      ),
    ])
    // the fix
    const fixed = await production(
      'settings',
      `import { createFileRoute } from '@tanstack/react-router'
import { createSession, createTheme } from '../app'

const theme = createTheme()
const session = createSession()
if (location.hostname === 'localhost') {
  theme.banner = 'Local build'
}
if (location.hostname === 'localhost') {
  session.secure = false
}

export const Route = createFileRoute('/settings')({
  beforeLoad: () => session.check(),
  component: () => <p>{theme.banner}</p>,
})
`,
    )
    expect(fixed.warnings).toEqual([])
    expect(fixed.built.where('Local build')).toBe('lazy')
  })

  it('a value read at load from state the module changes later', async () => {
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
    )
    expect(warnings).toEqual([
      expect.stringContaining(
        '[tanstack-router] `initialTheme` in src/routes/theme.tsx stays in the route module because it uses `prefs` when the module loads, and the module writes `prefs`; use `prefs` inside the code that needs it, or move both to their own module, so `initialTheme` can load with the split `component`.',
      ),
    ])
    // the fix
    const fixed = await production(
      'theme',
      `import { createFileRoute } from '@tanstack/react-router'
import { loadPrefs, readTheme } from '../prefs'

const prefs = loadPrefs()
window.addEventListener('storage', () => {
  prefs.theme = readTheme()
})

export const Route = createFileRoute('/theme')({
  component: () => <p>{prefs.theme}</p>,
})
`,
    )
    expect(fixed.warnings).toEqual([])
    expect(fixed.built.where('storage')).toBe('lazy')
  })

  it('a function handed to a call may read state the module changes', async () => {
    const { warnings } = await production(
      'preferences',
      `import { createFileRoute } from '@tanstack/react-router'
import { debounce } from '../debounce'
import { loadPrefs, readTheme, savePrefs } from '../prefs'

const prefs = loadPrefs()
window.addEventListener('storage', () => {
  prefs.theme = readTheme()
})
const save = debounce(() => savePrefs(prefs))

export const Route = createFileRoute('/preferences')({
  component: () => <button onClick={save}>Save</button>,
})
`,
    )
    expect(warnings).toEqual([
      expect.stringContaining(
        '[tanstack-router] `save` in src/routes/preferences.tsx stays in the route module because it may use `prefs` when the module loads (the function is handed to `debounce`), and the module writes `prefs`; move both to their own module, so `save` can load with the split `component`.',
      ),
    ])
    // the fix
    const fixed = await production(
      'preferences',
      `import { createFileRoute } from '@tanstack/react-router'
import { save } from '../prefs-store'

export const Route = createFileRoute('/preferences')({
  component: () => <button onClick={save}>Save</button>,
})
`,
      {
        'src/prefs-store.ts': `import { debounce } from './debounce'
import { loadPrefs, readTheme, savePrefs } from './prefs'

const prefs = loadPrefs()
window.addEventListener('storage', () => {
  prefs.theme = readTheme()
})
export const save = debounce(() => savePrefs(prefs))
`,
      },
    )
    expect(fixed.warnings).toEqual([])
    expect(fixed.built.where('storage')).toBe('lazy')
  })

  it('unused code reads the bindings of two chunks', async () => {
    const code = (
      debugDump: string,
    ) => `import { createFileRoute } from '@tanstack/react-router'
import { createCache, createClient } from '../app'

const cache = createCache()
const client = createClient()
${debugDump}
export const Route = createFileRoute('/dashboard')({
  component: () => <p>{cache.size}</p>,
  errorComponent: () => <p>{client.status}</p>,
})
`
    const { warnings } = await production(
      'dashboard',
      code(`function debugDump() {
  return [cache, client]
}
`),
    )
    expect(warnings).toEqual([
      expect.stringContaining(
        '[tanstack-router] In src/routes/dashboard.tsx, unused `debugDump` (line 6) puts `cache` and `client` in one shared module the split `component` and `errorComponent` import; delete `debugDump`, so each loads with the split code that needs it.',
      ),
    ])
    // the fix
    expect((await production('dashboard', code(''))).warnings).toEqual([])
  })

  it('unused code reads a binding the route module keeps', async () => {
    const code = (
      debugDump: string,
    ) => `import { createFileRoute } from '@tanstack/react-router'
import { createCache, createSession } from '../app'

const cache = createCache()
const session = createSession()
${debugDump}
export const Route = createFileRoute('/inbox')({
  beforeLoad: () => session.check(),
  component: () => <p>{cache.size}</p>,
})
`
    const { warnings } = await production(
      'inbox',
      code(`function debugDump() {
  return [cache, session]
}
`),
    )
    expect(warnings).toEqual([
      expect.stringContaining(
        '[tanstack-router] In src/routes/inbox.tsx, unused `debugDump` (line 6) keeps `cache` in the route module; delete `debugDump`, so it can load with the split code that needs it.',
      ),
    ])
    // the fix
    expect((await production('inbox', code(''))).warnings).toEqual([])
  })

  it('an export only split code uses reads what the route module keeps', async () => {
    const { warnings } = await production(
      'list',
      `import { createFileRoute } from '@tanstack/react-router'
import { loadSettings } from '../settings'

const settings = loadSettings()
export const pageSize = settings.pageSize * 2

export const Route = createFileRoute('/list')({
  loader: () => settings,
  component: () => <p>{pageSize}</p>,
})
`,
    )
    expect(warnings).toEqual([
      expect.stringContaining(
        '[tanstack-router] The export `pageSize` of src/routes/list.tsx is used only by the split `component`, but stays in the route module because it reads `settings` when it loads, which the route module keeps, so it loads with the route module instead of with that code. Move it and `settings` to their own module and import them from there.',
      ),
    ])
    // the fixes: not exported, or in a module of their own
    const unexported = await production(
      'list',
      `import { createFileRoute } from '@tanstack/react-router'
import { loadSettings } from '../settings'

const settings = loadSettings()
const pageSize = settings.pageSize * 2

export const Route = createFileRoute('/list')({
  loader: () => settings,
  component: () => <p>{pageSize}</p>,
})
`,
    )
    expect(unexported.warnings).toEqual([])
    expect(unexported.built.where(/\.pageSize\*2/)).toBe('lazy')
    const own = await production(
      'list',
      `import { createFileRoute } from '@tanstack/react-router'
import { pageSize, settings } from '../list-settings'

export const Route = createFileRoute('/list')({
  loader: () => settings,
  component: () => <p>{pageSize}</p>,
})
`,
      {
        'src/list-settings.ts': `import { loadSettings } from './settings'

export const settings = loadSettings()
export const pageSize = settings.pageSize * 2
`,
      },
    )
    expect(own.warnings).toEqual([])
  })

  it('a split option writes a `let` the route module uses', async () => {
    const { built, warnings } = await production(
      'counter',
      `import { createFileRoute } from '@tanstack/react-router'

let count = 0

export const Route = createFileRoute('/counter')({
  loader: () => count,
  component: () => <button onClick={() => count++}>Add one</button>,
})
`,
    )
    expect(warnings).toEqual([
      expect.stringContaining(
        '[tanstack-router] The `component` option of src/routes/counter.tsx is not code-split: it writes `count`, which the route module also uses, and a split chunk cannot write a binding of another module. Keep that state in an object (`state.count`), or in a module of its own that also exports the functions writing it.',
      ),
    ])
    expect(built.where('Add one')).toBe('eager')
    // the fix
    const fixed = await production(
      'counter',
      `import { createFileRoute } from '@tanstack/react-router'

const state = { count: 0 }

export const Route = createFileRoute('/counter')({
  loader: () => state.count,
  component: () => <button onClick={() => state.count++}>Add one</button>,
})
`,
    )
    expect(fixed.warnings).toEqual([])
    expect(fixed.built.where('Add one')).toBe('lazy')
  })
})

describe("the code-splitting guide: what the compiler doesn't see", () => {
  it('what an imported function does to what it is handed', async () => {
    const code = `import { createFileRoute } from '@tanstack/react-router'
import { loadPrefs, mutate } from '../prefs'

const prefs = loadPrefs()
const initialTheme = prefs.theme // moves: reads \`prefs\` after \`mutate\` ran
mutate(prefs) // stays with \`prefs\`, which the loader reads

export const Route = createFileRoute('/look')({
  loader: () => prefs.theme,
  component: () => <p>{initialTheme}</p>,
})
`
    expect((await production('look', code)).warnings).toEqual([])
    // (as written, the page would show `light`)
    expect(await rendered('look', code)).toMatchObject({
      html: '<p>dark</p>',
    })
  })

  it('an imported call that names nothing of the file', async () => {
    const code = `import { createFileRoute } from '@tanstack/react-router'
import { connectEmulator, initializeApp } from '../firebase'

const app = initializeApp({ projectId: 'demo' }) // moves
connectEmulator() // stays, and runs first

export const Route = createFileRoute('/data')({
  component: () => <p>{app.name}</p>,
})
`
    expect((await production('data', code)).warnings).toEqual([])
    expect(await rendered('data', code)).toEqual({
      atLoad: ['connectEmulator'],
      html: '<p>demo</p>',
      after: ['connectEmulator', 'initializeApp'],
    })
  })

  it('a call result that is the object it was handed', async () => {
    const code = `import { createFileRoute } from '@tanstack/react-router'
import { reactive } from '../reactive'

const settings = { dark: false }
const keys = Object.keys(settings) // moves: sees \`compact\`
const store = reactive(settings) // the same object as \`settings\`
Object.assign(store, { compact: true }) // stays with \`store\`

export const Route = createFileRoute('/keys')({
  loader: () => store,
  component: () => <p>{keys.join()}</p>,
})
`
    expect((await production('keys', code)).warnings).toEqual([])
    // (as written, the page would show `dark`)
    expect(await rendered('keys', code)).toMatchObject({
      html: '<p>dark,compact</p>',
    })
  })

  it('a callback registered at load', async () => {
    const code = `import { createFileRoute } from '@tanstack/react-router'
import { loadFlags } from '../flags'

let flags = {}
// moves with \`flags\`: the request starts when the component's chunk loads
loadFlags().then((f) => {
  flags = f
})

export const Route = createFileRoute('/beta')({
  component: () => <p>{JSON.stringify(flags)}</p>,
})
`
    expect((await production('beta', code)).warnings).toEqual([])
    expect(await rendered('beta', code)).toMatchObject({
      atLoad: [],
      after: ['loadFlags'],
    })
  })

  it('a component factory that runs its function at once', async () => {
    const code = `import { createFileRoute } from '@tanstack/react-router'
import { createIcon } from '../icon'

const seen = new Set<string>()

export const Route = createFileRoute('/icon')({
  loader: () => {
    seen.add('icon')
  },
  // createIcon calls its function at once: it runs when the chunk loads,
  // after the loader added to \`seen\`
  component: createIcon(() => {
    const count = seen.size
    return () => <p>{count}</p>
  }),
})
`
    expect((await production('icon', code)).warnings).toEqual([])
    // (as written, the page would show 0)
    expect(
      await rendered('icon', code, 'await options.loader()'),
    ).toMatchObject({ html: '<p>1</p>' })
  })

  it('an exported value that moved runs before the route file when another module imports it', async () => {
    const { built, warnings } = await production(
      'visits',
      `import { createFileRoute } from '@tanstack/react-router'
import { formatCount, recordVisit, visits } from '../visits'

recordVisit()
// moves to a module of its own; imported through this file, it runs first
export const label = formatCount(visits)

export const Route = createFileRoute('/visits')({
  component: () => <p>{label}</p>,
})
`,
      {
        // another module loaded with the app imports it through the route file
        '__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
import { label } from './src/routes/visits'

export const Route = createRootRoute({
  head: () => ({ meta: [{ title: label }] }),
})
`,
      },
    )
    expect(warnings).toEqual([])
    // (as written, `formatCount` would see 1)
    expect((await built.run('return globalThis.formatted')).result).toBe(0)
  })
})

/** The app modules the examples import. */
const app: Record<string, string> = {
  'src/confetti.ts': `export class Confetti {
  constructor(readonly options: { colors: Array<string> }) {}
  fire() {}
}
`,
  'src/registry.ts': `export const registry = {
  add: (value: unknown, name: string) => [value, name],
}
`,
  'src/analytics.ts': `export const createAnalytics = (name: string) => ({
  name,
  track: (event: string) => [name, event],
})
`,
  'src/sentry.ts': `export const Sentry = {
  init: (_config: { dsn: string }) => {
    ;(globalThis as any).seeded?.push('Sentry.init')
  },
}
`,
  'src/store.ts': `export const createStore = (name: string) => ({
  name,
  count: 0,
  subscribe: (listener: (name: string) => void) => listener(name),
})
export const log = (name: string) => console.log('store-log', name)
`,
  'src/app.ts': `export const createTheme = () => ({ banner: '' })
export const createSession = () => ({ secure: true, check: () => true })
export const createCache = () => new Map()
export const createClient = () => ({ status: 'idle' })
`,
  'src/prefs.ts': `export const loadPrefs = () => ({ theme: 'light' })
export const readTheme = () => 'dark'
export const savePrefs = (prefs: { theme: string }) => prefs
export const mutate = (prefs: { theme: string }) => {
  prefs.theme = 'dark'
}
`,
  'src/debounce.ts': `export const debounce = (f: () => unknown) => () => setTimeout(f, 100)
`,
  'src/settings.ts': `export const loadSettings = () => ({ pageSize: 10 })
`,
  'src/firebase.ts': `export const initializeApp = (options: { projectId: string }) => {
  ;(globalThis as any).seeded?.push('initializeApp')
  return { name: options.projectId }
}
export const connectEmulator = () => {
  ;(globalThis as any).seeded?.push('connectEmulator')
}
`,
  'src/reactive.ts': `export const reactive = <T,>(value: T) => value
`,
  'src/flags.ts': `export const loadFlags = () => {
  ;(globalThis as any).seeded?.push('loadFlags')
  return Promise.resolve({ beta: true })
}
`,
  'src/icon.ts': `export const createIcon = <T,>(render: () => T) => render()
`,
  'src/visits.ts': `export let visits = 0
export const recordVisit = () => {
  visits++
}
export const formatCount = (n: number) => {
  ;(globalThis as any).formatted = n
  return \`\${n} visits\`
}
`,
}
