import { describe, expect, test } from 'vitest'
import { renderServer, renderSource } from '../regression-helpers'
import type { ModuleStub, Render } from '../regression-helpers'

// On the server, `<ClientOnly>` (of a TanStack router package) renders its
// fallback: the server output drops its children, so the server never
// evaluates them (on the server, the libraries the children use throw when
// called, here even while the children's elements are created). Rendered
// with the real React and the real `ClientOnly` of `@tanstack/react-router`
// (which renders its fallback whenever it renders on a server), the server
// output renders what the uncompiled source renders there. Whether the SSR
// output keeps the children's imports is left open (neutral names, user
// ruling 2026-10-17). The client keeps the children: it renders them once
// the page hydrated (integration/clientOnlyJSX.test.ts). Other components
// named ClientOnly are left alone.
// N4 (replaces the former snapshot fixtures of this directory).
describe('<ClientOnly> children', () => {
  /** The libraries the fixtures import (plain text components). */
  const libraries: Record<string, Record<string, unknown>> = {
    'heavy-chart-library': { Chart: () => 'chart' },
    './utils': { formatData: () => 'data' },
    'video-player-lib': { VideoPlayer: () => 'video' },
    'audio-viz-lib': { AudioVisualizer: () => 'audio' },
    'animation-library': { HeavyAnimation: () => 'animation' },
    './WindowSize': { WindowSize: () => 'size' },
    'outer-lib': { OuterWidget: () => 'outer' },
    'inner-lib': { InnerWidget: () => 'inner' },
    'some-other-package': {
      ClientOnly: (props: { children?: unknown }) => props.children ?? null,
    },
  }
  /**
   * The libraries the children of `childModules` use, as the server must
   * never run them: each export throws when called.
   */
  const serverLibraries = (
    childModules: Array<string>,
  ): Record<string, ModuleStub> =>
    Object.fromEntries(
      childModules.map((specifier) => [
        specifier,
        Object.fromEntries(
          Object.keys(libraries[specifier]!).map((name) => [
            name,
            () => {
              throw new Error(`client-only code ran during SSR: ${name}`)
            },
          ]),
        ),
      ]),
    )
  const render: Render = (m, h) => h(m.MyComponent)

  test.each([
    {
      // Source: snapshot fixture clientOnlyBasic.tsx
      name: 'a fallback',
      code: `import { ClientOnly } from '@tanstack/react-router'
import { Chart } from 'heavy-chart-library'
import { formatData } from './utils'
export function MyComponent() {
  return (
    <div>
      <ClientOnly fallback={<div>Loading...</div>}>
        <Chart data={formatData()} />
      </ClientOnly>
    </div>
  )
}`,
      childModules: ['./utils', 'heavy-chart-library'],
      ssr: '<div><div>Loading...</div></div>',
    },
    {
      // Source: snapshot fixture clientOnlyMultiple.tsx
      name: 'two boundaries',
      code: `import { ClientOnly } from '@tanstack/react-router'
import { VideoPlayer } from 'video-player-lib'
import { AudioVisualizer } from 'audio-viz-lib'
export function MyComponent() {
  return (
    <div>
      <ClientOnly fallback={<span>Loading video...</span>}>
        <VideoPlayer src="/video.mp4" />
      </ClientOnly>
      <p>Some server content</p>
      <ClientOnly fallback={<span>Loading audio...</span>}>
        <AudioVisualizer frequency={440} />
      </ClientOnly>
    </div>
  )
}`,
      childModules: ['audio-viz-lib', 'video-player-lib'],
      ssr: '<div><span>Loading video...</span><p>Some server content</p><span>Loading audio...</span></div>',
    },
    {
      // Source: snapshot fixture clientOnlyNested.tsx
      name: 'a nested boundary',
      code: `import { ClientOnly } from '@tanstack/react-router'
import { OuterWidget } from 'outer-lib'
import { InnerWidget } from 'inner-lib'
export function MyComponent() {
  return (
    <div>
      <ClientOnly fallback={<div>Outer loading</div>}>
        <div>
          Outer content
          <OuterWidget />
          <ClientOnly fallback={<span>Inner loading</span>}>
            <InnerWidget />
          </ClientOnly>
        </div>
      </ClientOnly>
    </div>
  )
}`,
      childModules: ['inner-lib', 'outer-lib'],
      ssr: '<div><div>Outer loading</div></div>',
    },
    {
      // Source: snapshot fixture clientOnlyNoFallback.tsx
      name: 'no fallback',
      code: `import { ClientOnly } from '@tanstack/react-router'
import { HeavyAnimation } from 'animation-library'
export function MyComponent() {
  return (
    <div>
      <ClientOnly>
        <HeavyAnimation type="fade" />
      </ClientOnly>
    </div>
  )
}`,
      childModules: ['animation-library'],
      ssr: '<div></div>',
    },
    {
      // Source: snapshot fixture clientOnlyRenamed.tsx
      name: 'a renamed import',
      code: `import { ClientOnly as CO } from '@tanstack/react-router'
import { WindowSize } from './WindowSize'
export function MyComponent() {
  return (
    <div>
      <CO fallback={<div>Loading...</div>}>
        <WindowSize />
      </CO>
    </div>
  )
}`,
      childModules: ['./WindowSize'],
      ssr: '<div><div>Loading...</div></div>',
    },
  ])(
    'a boundary with $name renders its fallback on the server without running its children',
    async ({ code, childModules, ssr }) => {
      const source = await renderSource(code, { render, stubs: libraries })
      const server = await renderServer(code, {
        render,
        stubs: { ...libraries, ...serverLibraries(childModules) },
      })
      expect(server.html).toBe(source.html)
      expect(server.html).toBe(ssr)
    },
  )

  test.each([
    {
      // Source: snapshot fixture clientOnlyNotFromTanstack.tsx
      name: 'a ClientOnly of another package',
      code: `import { ClientOnly } from 'some-other-package'
export function MyComponent() {
  return (
    <div>
      <ClientOnly fallback={<div>Loading...</div>}>
        <div>This should remain as-is</div>
      </ClientOnly>
    </div>
  )
}`,
      html: '<div><div>This should remain as-is</div></div>',
    },
    {
      // Source: snapshot fixture clientOnlyWrongImportName.tsx, with
      // `CatchBoundary` instead of `Link`: the real `Link` needs a router
      // around it, `CatchBoundary` renders its children anywhere.
      name: 'another router component imported as ClientOnly',
      code: `import { CatchBoundary as ClientOnly } from '@tanstack/react-router'
export function MyComponent() {
  return (
    <div>
      <ClientOnly getResetKey={() => 'about'}>Go to About</ClientOnly>
    </div>
  )
}`,
      html: '<div>Go to About</div>',
    },
  ])('the server renders the children of $name', async ({ code, html }) => {
    const source = await renderSource(code, { render, stubs: libraries })
    const server = await renderServer(code, { render, stubs: libraries })
    expect(server.html).toBe(source.html)
    expect(server.html).toBe(html)
  })
})
