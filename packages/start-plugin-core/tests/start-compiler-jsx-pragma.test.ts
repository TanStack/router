/**
 * A file-level JSX pragma decides which JSX runtime the bundler's own JSX
 * transform uses for the module. The Start compiler runs before that
 * transform (`enforce: 'pre'`), so it must not drop the pragma when it
 * removes the import statement the comment sits on, nor insert code above a
 * pragma that must lead the file.
 *
 * Observed through the public Start host (`./start-host`: the Start plugin
 * and `@vitejs/plugin-react`, whose Oxc JSX transform reads the pragmas):
 * the pragma names `pragma-jsx`, a JSX runtime package of the app that
 * wraps React's and marks every element it creates (`data-pragma`), so the
 * effective runtime is visible on the elements a module's code creates, on
 * the client (in the page), on the server and in a server fn's handler.
 * (The former tests named `@emotion/react`; any JSX runtime package is the
 * same input for the compiler.)
 */
import { beforeAll, describe, expect, test } from 'vitest'
import {
  callOnServer,
  inPage,
  serveCase,
  useStartHost,
} from './regression-helpers'

/**
 * The host defaults these tests use: no import
 * protection (its dev mock would hide a leaked server import from the
 * client's loads) and an app tsconfig with `verbatimModuleSyntax` (without
 * it, Vite's TypeScript transform drops unreferenced imports after the
 * compiler and hides leaks).
 */
const hostTsconfig = {
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    jsx: 'react-jsx',
    strict: true,
    verbatimModuleSyntax: true,
  },
}
const hostDefaults = {
  start: { importProtection: { enabled: false } },
  files: { 'tsconfig.json': JSON.stringify(hostTsconfig) },
}

/** A JSX runtime package: React's, marking the elements it creates. */
const runtime = (
  react: string,
  factory: string,
) => `import * as React from '${react}'
export const Fragment = React.Fragment
export function ${factory}(type, props, ...rest) {
  return React.${factory}(type, { ...props, 'data-pragma': 'pragma-jsx' }, ...rest)
}
${
  factory === 'jsx'
    ? `export function jsxs(type, props, ...rest) {
  return React.jsxs(type, { ...props, 'data-pragma': 'pragma-jsx' }, ...rest)
}\n`
    : ''
}`

const host = useStartHost({
  start: hostDefaults.start,
  files: {
    ...hostDefaults.files,
    'node_modules/pragma-jsx/package.json': JSON.stringify({
      name: 'pragma-jsx',
      type: 'module',
      exports: {
        './jsx-runtime': './jsx-runtime.js',
        './jsx-dev-runtime': './jsx-dev-runtime.js',
      },
    }),
    'node_modules/pragma-jsx/jsx-runtime.js': runtime(
      'react/jsx-runtime',
      'jsx',
    ),
    'node_modules/pragma-jsx/jsx-dev-runtime.js': runtime(
      'react/jsx-dev-runtime',
      'jsxDEV',
    ),
  },
  config: { optimizeDeps: { exclude: ['pragma-jsx'] } },
})
beforeAll(async () => {
  await (await host()).page()
}, 60_000)

/** The runtime marker of the element an export returns, in the page. */
async function clientPragma(
  served: Awaited<ReturnType<typeof serveCase>>,
  component: string,
) {
  return inPage(
    served,
    `return module.${component}({})?.props?.['data-pragma'] ?? null`,
  )
}

/** The runtime marker of the element an export returns, on the server. */
async function serverPragma(
  served: Awaited<ReturnType<typeof serveCase>>,
  component: string,
) {
  return (await served.ssr())[component]({})?.props?.['data-pragma'] ?? null
}

// Each comment form sits on the import of a factory the compiler removes;
// the factory and environment only vary to show any removed import
// qualifies.
test.each([
  {
    name: 'a block comment',
    output: 'client',
    component: 'Card',
    code: `/** @jsxImportSource pragma-jsx */
import { createIsomorphicFn } from '@tanstack/react-start'
const where = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')
export function Card() {
  return <div css={{ color: 'hotpink' }}>{where()}</div>
}`,
  },
  {
    name: 'a line comment',
    output: 'ssr',
    component: 'Button',
    code: `// @jsxImportSource pragma-jsx
import { createClientOnlyFn } from '@tanstack/react-start'
const track = createClientOnlyFn(() => window.alert('tracked'))
export function Button() {
  return <button css={{ color: 'hotpink' }} onClick={() => track()} />
}`,
  },
  {
    name: 'a file header comment',
    output: 'client',
    component: 'Panel',
    code: `/**
 * Copyright Example Corp.
 * @jsxImportSource pragma-jsx
 */
import { createServerOnlyFn } from '@tanstack/react-start'
const readSecret = createServerOnlyFn(() => process.env.SECRET)
export function Panel() {
  return <p css={{ color: 'hotpink' }} onClick={() => readSecret()} />
}`,
  },
] as const)(
  '$output: a @jsxImportSource pragma in $name survives the removal of the import it sits on',
  async ({ output, component, code }) => {
    const served = await serveCase(await host(), { 'module.tsx': code })
    expect(
      output === 'client'
        ? await clientPragma(served, component)
        : await serverPragma(served, component),
    ).toBe('pragma-jsx')
  },
)

test('client: classic @jsx and @jsxFrag pragmas survive the removal of the import they sit on', async () => {
  const served = await serveCase(await host(), {
    'module.tsx': `/** @jsxRuntime classic */
// @jsx h
// @jsxFrag Fragment
import { createIsomorphicFn } from '@tanstack/react-start'
import { h, Fragment } from './h'
const where = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')
export function List() {
  return <>{where()}</>
}`,
    // A classic JSX factory (as Preact's `h`): what it was called with.
    'h.ts': `export const Fragment = 'Fragment'
export function h(type: unknown, props: unknown, ...children: Array<unknown>) {
  return { factory: 'h', type, children }
}
`,
  })
  expect(await inPage(served, 'return module.List()')).toEqual({
    factory: 'h',
    type: 'Fragment',
    children: ['client'],
  })
})

// Oxc (Vite 8's JSX transform) only reads JSX pragmas from the comments that
// lead the file, so the imports the compiler inserts must stay below them.
// Bug: the server fn runtime import (RPC or `createServerRpc`) is inserted
// above the pragma comment that leads the file.
// Impact: with Vite 8, a module with a server fn compiles its JSX with the
// default runtime: `css` props (Emotion) are ignored.
// Source: #8504 start-compiler-jsx-pragma.test.ts (red on main); same root
// cause as the code splitter's pragma pin
// (router-plugin/tests/code-splitter-pragmas.test.ts).
describe('inserted server function imports stay below the @jsxImportSource pragma', () => {
  const code = `/** @jsxImportSource pragma-jsx */
import { createServerFn } from '@tanstack/react-start'
export const getGreeting = createServerFn().handler(async () => (
  <b css={{ color: 'hotpink' }}>hi</b>
))
export function Card() {
  return <div css={{ color: 'hotpink' }}>card</div>
}`
  // The module on the client, the module on the server, and the server fn's
  // handler (the element it returns, called from server code in a request).
  test.fails.each(['client', 'ssr', 'handler'] as const)(
    '%s',
    async (where) => {
      const served = await serveCase(await host(), { 'module.tsx': code })
      const pragma =
        where === 'client'
          ? await clientPragma(served, 'Card')
          : where === 'ssr'
            ? await serverPragma(served, 'Card')
            : ((
                (await callOnServer(served, 'module.getGreeting')) as {
                  props?: Record<string, unknown>
                }
              ).props?.['data-pragma'] ?? null)
      expect(pragma).toBe('pragma-jsx')
    },
  )
})

test('client: a pragma after a directive stays ahead of inserted server function imports', async () => {
  const served = await serveCase(await host(), {
    'module.tsx': `'use client'
/** @jsxImportSource pragma-jsx */
import { createServerFn } from '@tanstack/react-start'
export const getGreeting = createServerFn().handler(async () => 'hi')
export function Card() {
  return <div css={{ color: 'hotpink' }}>card</div>
}`,
  })
  expect(await clientPragma(served, 'Card')).toBe('pragma-jsx')
})

/**
 * Mounts `Card` of the case module in the page (React's `createRoot`) and
 * waits until the `<Hydrate>` children rendered (`text` shows); gives the
 * runtime marker of the element that shows it, read from the DOM.
 */
const mountFile = `import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Card } from './module'
export async function mount(text: string) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  root.render(createElement(Card))
  try {
    for (let i = 0; i < 300; i++) {
      const shown = [...container.querySelectorAll('*')].find(
        (element) => element.textContent === text && element.children.length === 0,
      )
      if (shown) {
        return shown.getAttribute('data-pragma')
      }
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    return 'not rendered: ' + container.innerHTML
  } finally {
    root.unmount()
    container.remove()
  }
}
`

test('client: a Hydrate chunk keeps the file-level @jsxImportSource pragma', async () => {
  const served = await serveCase(await host(), {
    'module.tsx': `/** @jsxImportSource pragma-jsx */
import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
export function Card() {
  return (
    <Hydrate when={load()}>
      <div css={{ color: 'hotpink' }}>card</div>
    </Hydrate>
  )
}`,
    'mount.tsx': mountFile,
  })
  expect(
    await inPage(served, `return module.mount('card')`, { file: 'mount.tsx' }),
  ).toBe('pragma-jsx')
})

const hydrateParent = (imports: string) => `/** @jsxImportSource pragma-jsx */
${imports}
import { load } from '@tanstack/react-start/hydration'
export function Card() {
  return (
    <div css={{ color: 'hotpink' }}>
      <Hydrate when={load()}>
        <Widget />
      </Hydrate>
    </div>
  )
}`
// The effective runtime decision is what counts (SPEC J2.16), read
// through Oxc, Vite 8's JSX transform; whether the comment text survives is
// free.
const hydrateParentImports = [
  {
    name: 'moves into a Hydrate chunk',
    imports: `import { Widget } from './widget'
import { Hydrate } from '@tanstack/react-start'`,
  },
  {
    name: 'stays in the parent',
    imports: `import { Hydrate } from '@tanstack/react-start'
import { Widget } from './widget'`,
  },
]

// Bug: the parent's Hydrate chunk loaders are inserted above the pragma
// comment that leads the file.
// Impact: with Vite 8 (Oxc only reads pragmas that lead the file), the
// parent compiles its JSX with the default runtime: `css` props are ignored.
// Source: #8504 start-compiler-jsx-pragma.test.ts (red on main); same root
// cause as the server fn pin above.
test.fails.each(hydrateParentImports)(
  'client: the parent keeps selecting the pragma JSX runtime when the import it sits on $name',
  async ({ imports }) => {
    const served = await serveCase(await host(), {
      'module.tsx': hydrateParent(imports),
      'widget.tsx': `export const Widget = () => <span>widget</span>\n`,
    })
    expect(await clientPragma(served, 'Card')).toBe('pragma-jsx')
  },
)
