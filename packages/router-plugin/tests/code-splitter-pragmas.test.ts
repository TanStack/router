import { transformWithOxc } from 'vite'
import { describe, expect, it } from 'vitest'
import {
  compileRouteModules,
  componentModules,
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

/**
 * The JSX runtimes the modules loading the route's component import, once
 * compiled (modules without JSX import none).
 */
async function componentJsxRuntimes(code: string) {
  const runtimes = await Promise.all(
    (await componentModules(code)).map(jsxRuntimeOf),
  )
  return runtimes.filter((runtime) => runtime !== undefined)
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
    expect(await componentJsxRuntimes(styledRoute(header))).toEqual([
      '@emotion/react/jsx-runtime',
    ])
  })

  it('keeps @jsxImportSource written after the imports', async () => {
    // Oxc only reads leading pragmas; esbuild and Babel read them anywhere.
    const modules = await componentModules(
      styledRoute(`${head}/** @jsxImportSource @emotion/react */\n`),
    )
    const withJsx = modules.filter((code) => code.includes('styled'))
    expect(withJsx.length).toBeGreaterThan(0)
    for (const code of withJsx) {
      expect(code).toContain('@jsxImportSource @emotion/react')
    }
  })

  it('keeps @jsxRuntime classic and @jsx pragmas in effect', async () => {
    const modules = await componentModules(
      styledRoute(`/** @jsxRuntime classic */
/** @jsx jsx */
${head}import { jsx } from '@emotion/react'
`),
    )
    const compiled = await Promise.all(modules.map(compileJsx))
    expect(await Promise.all(modules.map(jsxRuntimeOf))).toEqual(
      modules.map(() => undefined),
    )
    expect(compiled.some((code) => /\bjsx\(\s*["']div["']/.test(code))).toBe(
      true,
    )
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
    // Whichever modules hold the shared JSX compile it with the pragma.
    const holders = Object.values(modules).filter((code) =>
      code.includes('<svg'),
    )
    expect(holders.length).toBeGreaterThan(0)
    expect(await Promise.all(holders.map(jsxRuntimeOf))).toEqual(
      holders.map(() => '@emotion/react/jsx-runtime'),
    )
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
  /**
   * Classic JSX factory rendering intrinsic elements to text (`p(text)`),
   * which React renders as is: JSX compiled with React's runtime instead
   * renders `<p>text</p>`.
   */
  const render = (type: unknown, _props: unknown, ...children: Array<any>) => {
    const text = children.flat(Infinity).join('')
    if (typeof type === 'function') {
      return type()
    }
    return type === Fragment ? text : `${String(type)}(${text})`
  }
  const Fragment = Symbol('Fragment')
  const stubs = { '@emotion/react': { jsx: render, Frag: Fragment } }
  const classicHead = `/** @jsxRuntime classic */
/** @jsx jsx */
${head}import { jsx } from '@emotion/react'
`

  // Bug: the route module the code splitter emits starts with the code it
  // adds (the split component's importer and the import of the router's
  // lazy helper), above the file's leading pragma comments, and drops the
  // factory import once the route module's only use of it is its JSX
  // (dead-code elimination does not count a classic JSX pragma as a use of
  // its factory: same root cause as the "classic JSX pragmas" pins of
  // known-bugs-code-splitter.test.ts). Oxc (Vite 8) only reads leading
  // pragmas, so the JSX left in the route module compiles with the
  // project's default runtime. Found when the in-process JSX stand-in (which
  // compiled every module with its own classic factory) was replaced by
  // React's real JSX transform.
  // Source: #8504 (this test passed with the stand-in).
  // Impact: with Vite 8, JSX that stays in the route module of a file with
  // JSX pragmas (a pendingComponent, JSX shared with the loader) ignores them
  // as soon as an option is split: Emotion's `css` props are dropped, and a
  // classic factory would throw "jsx is not defined" once the pragma is read.
  it.fails(
    'in the route module, when the code calling the factory is split',
    async () => {
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
        await route.render('pendingComponent'),
        await route.render('component'),
        await route.isLazy('pendingComponent'),
      ]).toEqual(['p(pending)', 'div(page)', false])
    },
  )
})

// React Refresh and solid-refresh read these comments per module, so every
// module holding route code must keep them. Compile-level: the Solid router
// cannot be linked in process (its runtime under Solid is covered by
// integration/build-frameworks.test.ts); the component's module is the one
// holding its JSX.
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
    const holders = Object.entries(modules).filter(
      ([name, module]) =>
        name !== 'reference' && module.includes('<p>page</p>'),
    )
    expect(holders.length).toBeGreaterThan(0)
    for (const [name, module] of holders) {
      expect(module, name).toContain(pragma)
    }
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
