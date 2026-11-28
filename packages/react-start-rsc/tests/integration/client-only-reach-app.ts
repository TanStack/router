/**
 * App files and rows of the RSC build pins for server fns reached only from
 * client-only code (KNOWN-BUGS, "RSC builds: a server fn only client-only
 * code imports is not registered"): each server fn's module is
 * imported only from its row's position, a `<ClientOnly>` child, a
 * `createClientOnlyFn` body or a `<Hydrate>` `fallback`, in a route file
 * or in a component file a route renders. Used by the Rsbuild build file,
 * in the app it already builds, and by the Vite build that fails on them
 * (`rsc-start-build-not-provided.test.ts`). Also: an installed package
 * defining a server fn (`installedServerFnFiles`).
 */
import { answeredText, visit, waitForHydration } from './rsc-app'
import type { Page } from '@tanstack/compiler-test-utils/test'

const serverFn = (
  name: string,
) => `import { createServerFn } from '@tanstack/react-start'
export const ${name} = createServerFn({ method: 'GET' }).handler(() => 'MARK_${name.toUpperCase()}')
`

export const clientOnlyReachFiles = {
  ...Object.fromEntries(
    [
      'childRoute',
      'childComponent',
      'fnBodyRoute',
      'fnBodyComponent',
      'hydrateRoute',
      'hydrateComponent',
    ].map((name) => [`src/client-only/${name}.ts`, serverFn(name)]),
  ),
  // A button calling `fn` and showing its outcome.
  'src/client-only/Call.tsx': `import { useState } from 'react'
export function Call({ name, fn }: { name: string; fn: () => Promise<string> }) {
  const [result, setResult] = useState('')
  return (
    <button data-testid={name} onClick={() => fn().then(setResult, (error) => setResult('error ' + error))}>
      {name} {result}
    </button>
  )
}
`,
  // Children that never resolve keep a `<Hydrate>` fallback up after a
  // client-side navigation (the server would never finish rendering them).
  'src/client-only/Never.tsx': `import { use } from 'react'
const never: Promise<never> = new Promise(() => {})
export function Never() {
  use(never)
  return null
}
`,
  'src/client-only/Child.tsx': `import { ClientOnly } from '@tanstack/react-router'
import { Call } from './Call'
import { childComponent } from './childComponent'
export function Child() {
  return (
    <ClientOnly fallback={<span>loading</span>}>
      <Call name="childComponent" fn={childComponent} />
    </ClientOnly>
  )
}
`,
  'src/client-only/FnBody.tsx': `import { createClientOnlyFn } from '@tanstack/react-start'
import { Call } from './Call'
import { fnBodyComponent } from './fnBodyComponent'
const callBody = createClientOnlyFn(() => fnBodyComponent())
export function FnBody() {
  return <Call name="fnBodyComponent" fn={callBody} />
}
`,
  'src/client-only/HydrateFallback.tsx': `import { Hydrate } from '@tanstack/react-start'
import { visible } from '@tanstack/react-start/hydration'
import { Call } from './Call'
import { Never } from './Never'
import { hydrateComponent } from './hydrateComponent'
export function HydrateFallback() {
  return (
    <Hydrate when={visible()} fallback={<Call name="hydrateComponent" fn={hydrateComponent} />}>
      <Never />
    </Hydrate>
  )
}
`,
  'src/routes/client-only.tsx': `import { ClientOnly, Link, createFileRoute } from '@tanstack/react-router'
import { createClientOnlyFn } from '@tanstack/react-start'
import { Call } from '../client-only/Call'
import { Child } from '../client-only/Child'
import { FnBody } from '../client-only/FnBody'
import { childRoute } from '../client-only/childRoute'
import { fnBodyRoute } from '../client-only/fnBodyRoute'
const callBody = createClientOnlyFn(() => fnBodyRoute())
export const Route = createFileRoute('/client-only')({ component: Page })
function Page() {
  return (
    <main>
      <ClientOnly fallback={<span>loading</span>}>
        <Call name="childRoute" fn={childRoute} />
      </ClientOnly>
      <Call name="fnBodyRoute" fn={callBody} />
      <Child />
      <FnBody />
      <Link data-testid="to-hydrate" to="/client-only-hydrate">hydrate</Link>
    </main>
  )
}
`,
  'src/routes/client-only-hydrate.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { Hydrate } from '@tanstack/react-start'
import { visible } from '@tanstack/react-start/hydration'
import { Call } from '../client-only/Call'
import { HydrateFallback } from '../client-only/HydrateFallback'
import { Never } from '../client-only/Never'
import { hydrateRoute } from '../client-only/hydrateRoute'
export const Route = createFileRoute('/client-only-hydrate')({ component: Page })
function Page() {
  return (
    <main>
      <Hydrate when={visible()} fallback={<Call name="hydrateRoute" fn={hydrateRoute} />}>
        <Never />
      </Hydrate>
      <HydrateFallback />
    </main>
  )
}
`,
}

/**
 * An installed Start library (Start as its peer dependency, the app's
 * dependency, so Start bundles it as it does a real one) defining the
 * server fn `pkgPing`, which answers `MARK_PKGPING`.
 */
export const installedServerFnFiles = {
  'package.json': JSON.stringify({
    name: 'app',
    private: true,
    type: 'module',
    dependencies: { 'pkg-fns': '1.0.0' },
  }),
  'node_modules/pkg-fns/package.json': JSON.stringify({
    name: 'pkg-fns',
    version: '1.0.0',
    type: 'module',
    exports: { '.': './index.js' },
    peerDependencies: { '@tanstack/react-start': '*' },
  }),
  'node_modules/pkg-fns/index.js': serverFn('pkgPing'),
}

/** The positions, by the test id of their button. */
export const clientOnlyPositions = [
  { name: 'childRoute', position: 'a <ClientOnly> child', where: 'route file' },
  {
    name: 'childComponent',
    position: 'a <ClientOnly> child',
    where: 'component file',
  },
  {
    name: 'fnBodyRoute',
    position: 'a createClientOnlyFn body',
    where: 'route file',
  },
  {
    name: 'fnBodyComponent',
    position: 'a createClientOnlyFn body',
    where: 'component file',
  },
  {
    name: 'hydrateRoute',
    position: 'a <Hydrate> fallback',
    where: 'route file',
  },
  {
    name: 'hydrateComponent',
    position: 'a <Hydrate> fallback',
    where: 'component file',
  },
]

/** A click's outcome: the server fn's HTTP status and the button's text. */
export interface ClickOutcome {
  status: number
  text: string
}

/**
 * Opens `server` in `page` and clicks `name`'s button (a client-only
 * position: the `<Hydrate>` fallbacks after a client-side navigation, the
 * only way they show; `counter`: the public #7943 counter of
 * `rsc-reach-app.ts`): the server fn's response status and the text the
 * button shows then.
 */
export async function clickOutcome(
  page: Page,
  server: { url?: string },
  name: string,
): Promise<ClickOutcome> {
  await visit(page, server, name === 'counter' ? '/client-ref' : '/client-only')
  await waitForHydration(page)
  if (name.startsWith('hydrate')) {
    await page.locator('[data-testid=to-hydrate]').click()
  }
  const selector = `[data-testid=${name}]`
  const response = page.waitForResponse((r) => r.url().includes('/_serverFn/'))
  await page.locator(selector).click()
  const status = (await response).status()
  const text = await answeredText(
    page,
    selector,
    (value) => value.includes('MARK_') || value.includes('error'),
  )
  return { status, text }
}
