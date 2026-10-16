import { transformWithOxc } from 'vite'
import { describe, expect, it } from 'vitest'
import {
  compileRouteModules,
  componentChunk,
  head,
  loadRoute,
  transformWithRouteHmrPlugin,
} from './regression-helpers'

const styledRoute = (
  header: string,
) => `${header}export const Route = createFileRoute('/pragma')({
  component: () => <div css={{ color: 'red' }}>styled</div>,
})
`

/** Compiles JSX like Vite 8 (Oxc) does, with React's automatic runtime by default. */
async function compileJsx(code: string) {
  const { code: javascript } = await transformWithOxc(code, 'chunk.tsx', {
    jsx: { runtime: 'automatic', importSource: 'react' },
  })
  return javascript
}

/** The JSX runtime module a compiled module imports, if any. */
async function jsxRuntimeOf(code: string) {
  return (await compileJsx(code)).match(
    /from ["']([^"']+\/jsx-(?:dev-)?runtime)["']/,
  )?.[1]
}

// JSX pragmas apply per module: the code splitter runs before the bundler's
// JSX transform, which then runs on each split module separately, so a module
// without the pragma compiles its JSX with the project default runtime (e.g.
// `css` props are no longer handled by Emotion).
describe('split modules keep file-level JSX pragmas', () => {
  it.each([
    ['on the first import', `/** @jsxImportSource @emotion/react */\n${head}`],
    ['as a line comment', `// @jsxImportSource @emotion/react\n${head}`],
    [
      'inside a file header',
      `/**\n * Header\n * @jsxImportSource @emotion/react\n */\n${head}`,
    ],
  ])('keeps @jsxImportSource %s in effect', async (_, header) => {
    const chunk = componentChunk(styledRoute(header))
    expect(chunk).toContain('@jsxImportSource @emotion/react')
    expect(await jsxRuntimeOf(chunk)).toBe('@emotion/react/jsx-runtime')
  })

  it('keeps @jsxImportSource written after the imports', () => {
    // Oxc only reads leading pragmas; esbuild and Babel read them anywhere.
    const chunk = componentChunk(
      styledRoute(`${head}/** @jsxImportSource @emotion/react */\n`),
    )
    expect(chunk).toContain('@jsxImportSource @emotion/react')
  })

  it('keeps @jsxRuntime classic and @jsx pragmas in effect', async () => {
    const chunk = componentChunk(
      styledRoute(`/** @jsxRuntime classic */
/** @jsx jsx */
${head}import { jsx } from '@emotion/react'
`),
    )
    expect(await jsxRuntimeOf(chunk)).toBeUndefined()
    expect(await compileJsx(chunk)).toMatch(/\bjsx\(\s*["']div["']/)
  })

  const sharedJsxRoute = `/** @jsxImportSource @emotion/react */
${head}const icon = <svg css={{ width: 1 }} />
export const Route = createFileRoute('/pragma')({
  loader: () => ({ icon }),
  component: () => <div css={{ color: 'red' }}>{icon}</div>,
})
`

  it('keeps the pragma in effect for JSX the loader and the component share', async () => {
    const { modules } = compileRouteModules(sharedJsxRoute)
    const holders = Object.values(modules).filter((code) =>
      code.includes('<svg'),
    )
    expect(holders).toHaveLength(1)
    expect(await jsxRuntimeOf(holders[0]!)).toBe('@emotion/react/jsx-runtime')
  })

  // Bug: a split chunk that imports a binding it shares with the route
  // module gets that import inserted above the file's leading pragma
  // comment, and Oxc (Vite 8's JSX transform) only reads pragmas that lead
  // the file.
  // Impact: with Vite 8, the split component compiles with the default JSX
  // runtime as soon as it shares a binding with the loader: `css` props
  // are ignored and the component renders unstyled.
  it.fails(
    'keeps the pragma in effect in every module that contains JSX',
    async () => {
      const { modules } = compileRouteModules(sharedJsxRoute)
      const runtimes: Record<string, string | undefined> = {}
      for (const [name, code] of Object.entries(modules)) {
        runtimes[name] = await jsxRuntimeOf(code)
      }
      // Modules without JSX import no runtime.
      const withJsx = Object.entries(runtimes).filter(([, runtime]) => runtime)
      expect(withJsx.length).toBeGreaterThan(0)
      expect(Object.fromEntries(withJsx)).toEqual(
        Object.fromEntries(
          withJsx.map(([name]) => [name, '@emotion/react/jsx-runtime']),
        ),
      )
    },
  )
})

// With the classic runtime, the JSX of each module compiles to calls of the
// factory its pragmas name, so the factory import must stay wherever JSX
// does. Source: #8504. (A chunk whose only use of the factory is its JSX, or
// that imports it from the route module: pinned in
// known-bugs-code-splitter.test.ts, "classic JSX pragmas".)
describe('split modules keep the classic JSX factories their JSX compiles to', () => {
  /** Classic JSX factory rendering intrinsic elements to text. */
  const render = (type: unknown, _props: unknown, ...children: Array<any>) => {
    const text = children.flat(Infinity).join('')
    if (typeof type === 'function') {
      return type()
    }
    return type === Fragment ? text : `<${String(type)}>${text}</${type}>`
  }
  const Fragment = Symbol('Fragment')
  const stubs = { '@emotion/react': { jsx: render, Frag: Fragment } }
  const classicHead = `/** @jsxRuntime classic */
/** @jsx jsx */
${head}import { jsx } from '@emotion/react'
`

  it('in the route module, when the code calling the factory is split', async () => {
    const route = await loadRoute(
      `${classicHead}function Page() {
  return jsx('div', null, 'page')
}
export const Route = createFileRoute('/')({
  component: Page,
  pendingComponent: () => <p>pending</p>,
})`,
      { stubs },
    )
    expect([
      route.isLazy('pendingComponent'),
      route.options.pendingComponent(),
      (await route.load('component'))(),
    ]).toEqual([false, '<p>pending</p>', '<div>page</div>'])
  })
})

// React Refresh and solid-refresh read these comments per module, so every
// module holding route code must keep them.
describe('split modules keep HMR pragma comments', () => {
  const solidHead = `import { createFileRoute } from '@tanstack/solid-router'\n`
  const page = `function Page() {
  return <p>page</p>
}
export const Route = createFileRoute('/')({ component: Page })
`
  it.each([
    {
      // Source: React Refresh ReactFreshIntegration-test "resets state on every
      // edit with @refresh reset annotation"
      name: 'a /* @refresh reset */ file header for React Refresh',
      target: 'react',
      code: `/* @refresh reset */\n${head}${page}`,
      pragma: '@refresh reset',
    },
    {
      // Source: solid-refresh tests/client/vite.test.ts "@refresh reload should work"
      name: 'a // @refresh reload file header for solid-refresh',
      target: 'solid',
      code: `// @refresh reload\n${solidHead}${page}`,
      pragma: '@refresh reload',
    },
    {
      // Source: solid-refresh tests/client/vite.test.ts "should skip
      // FunctionDeclaration with @refresh reload"
      name: 'a // @refresh reload comment above the split component',
      target: 'solid',
      code: `${solidHead}// @refresh reload\n${page}`,
      pragma: '@refresh reload',
    },
  ] as const)('keeps $name', ({ target, code, pragma }) => {
    expect(transformWithRouteHmrPlugin(code, { target })).toContain(pragma)
    const { modules } = compileRouteModules(code, {
      hmr: true,
      targetFramework: target,
    })
    expect(modules.reference).toContain(pragma)
    expect(modules['virtual component']).toContain(pragma)
  })
})

// Minifiers keep legal comments in the modules that carry them. Source: #8504.
it('split modules keep the leading legal comment of the route file', () => {
  const legal = '/*! Example Corp. | MIT License */'
  const { modules } = compileRouteModules(
    `${legal}\n${head}export const Route = createFileRoute('/')({
  component: () => <p>page</p>,
})`,
  )
  expect(Object.keys(modules).length).toBeGreaterThan(1)
  for (const [name, code] of Object.entries(modules)) {
    expect(code, name).toContain(legal)
  }
})
