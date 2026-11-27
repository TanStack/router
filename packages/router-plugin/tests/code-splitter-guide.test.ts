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
import {
  expectNoDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
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
  const about = {
    severity: 'warning' as const,
    file: `src/routes/${name}.tsx`,
    root: built.root,
  }
  const warnings = findDiagnostics(built.warnings, about).map((d) => d.text)
  /** Asserts that the build warns about nothing in the route file, on any channel. */
  const noWarning = () => expectNoDiagnostic(built, about)
  return { built, warnings, noWarning }
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
  it('puts what two split chunks use in one shared module', async () => {
    const { built, noWarning } = await production(
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
    noWarning()
    // (one lazy chunk holds it: neither split chunk carries a copy)
    expect(built.locate('posts-analytics')).toMatchObject({ eager: [] })
    expect(built.locate('posts-analytics').lazy).toHaveLength(1)
    expect(built.where('post-opened')).toBe('lazy')
    expect(built.where('post-retried')).toBe('lazy')
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
    await production('look', code).then(({ noWarning }) => noWarning())
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
    await production('data', code).then(({ noWarning }) => noWarning())
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
    await production('keys', code).then(({ noWarning }) => noWarning())
    // (as written, the page would show `dark`)
    expect(await rendered('keys', code)).toMatchObject({
      html: '<p>dark,compact</p>',
    })
  })
})

describe('the code-splitting guide: what stays in the route file', () => {
  it('a function that uses `this`', async () => {
    const code = `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  codeSplitGroupings: [['loader'], ['component']],
  loader() {
    return typeof this
  },
})
`
    const { built, warnings } = await production('posts', code)
    // (the bundler prefixes its plugin's name and appends the position)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain(
      '[tanstack-router] The `loader` option of src/routes/posts.tsx uses `this`, so it is not code-split (splitting can change what `this` refers to). Use an arrow function or avoid `this` to split it.',
    )
    expect(built.where('typeof this')).toBe('eager')
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
