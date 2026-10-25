/**
 * `<ClientOnly>` in a real page: the server renders the fallback, the page
 * hydrates that HTML without a mismatch and then renders the children, which
 * the client output keeps (the server half, with the children's libraries
 * throwing on the server, is clientOnlyJSX/clientOnlyJSX.test.ts).
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { reportedViolations } from '../importProtection/start-apps'
import { buildHydrationApp } from './hydrate-pages'
import type { HydrationApp } from './hydrate-pages'

/** An installed library exporting components that render `<tag>`. */
const library = (name: string, components: Record<string, string>) => ({
  [`node_modules/${name}/package.json`]: JSON.stringify({
    name,
    type: 'module',
    exports: './index.js',
  }),
  [`node_modules/${name}/index.js`]: `import { createElement } from 'react'
${Object.entries(components)
  .map(
    ([component, tag]) =>
      `export const ${component} = () => createElement(${JSON.stringify(tag)})`,
  )
  .join('\n')}
`,
})

const fixtures = {
  basic: `import { ClientOnly } from '@tanstack/react-router'
import { Chart } from 'heavy-chart-library'
import { formatData } from '../utils'
export function Page() {
  return (
    <div>
      <ClientOnly fallback={<div>Loading...</div>}>
        <Chart data={formatData()} />
      </ClientOnly>
    </div>
  )
}`,
  multiple: `import { ClientOnly } from '@tanstack/react-router'
import { VideoPlayer } from 'video-player-lib'
import { AudioVisualizer } from 'audio-viz-lib'
export function Page() {
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
  nested: `import { ClientOnly } from '@tanstack/react-router'
import { OuterWidget } from 'outer-lib'
import { InnerWidget } from 'inner-lib'
export function Page() {
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
  noFallback: `import { ClientOnly } from '@tanstack/react-router'
import { HeavyAnimation } from 'animation-library'
export function Page() {
  return (
    <div>
      <ClientOnly>
        <HeavyAnimation type="fade" />
      </ClientOnly>
    </div>
  )
}`,
  clientFile: `import { ClientOnly } from '@tanstack/react-router'
import { Chart } from '../chart.client'
export function Page() {
  return (
    <div>
      <ClientOnly fallback={<div>Loading...</div>}>
        <Chart />
      </ClientOnly>
    </div>
  )
}`,
  renamed: `import { ClientOnly as CO } from '@tanstack/react-router'
import { WindowSize } from '../WindowSize'
export function Page() {
  return (
    <div>
      <CO fallback={<div>Loading...</div>}>
        <WindowSize />
      </CO>
    </div>
  )
}`,
}

let app: HydrationApp
const cleanups: Array<() => Promise<void>> = []

beforeAll(async () => {
  app = await buildHydrationApp({
    fixtures,
    files: {
      ...library('heavy-chart-library', { Chart: 'chart-el' }),
      ...library('video-player-lib', { VideoPlayer: 'video-el' }),
      ...library('audio-viz-lib', { AudioVisualizer: 'audio-el' }),
      ...library('animation-library', { HeavyAnimation: 'animation-el' }),
      ...library('outer-lib', { OuterWidget: 'outer-el' }),
      ...library('inner-lib', { InnerWidget: 'inner-el' }),
      'src/utils.ts': `export const formatData = () => 'data'\n`,
      // (a top-level effect, which a bundler keeps in any module it bundles)
      'src/WindowSize.tsx': `;(globalThis as Record<string, unknown>).MARK_WINDOW_SIZE_LOADED = true
export const WindowSize = () => <size-el />
`,
      'src/chart.client.tsx': `export const Chart = () => <client-chart-el data-mark="MARK_CLIENT_CHART" />\n`,
    },
    registerCleanup: (cleanup) => cleanups.push(cleanup),
  })
}, 60_000)

afterAll(async () => {
  await Promise.all(cleanups.map((cleanup) => cleanup()))
})

describe('<ClientOnly> in a hydrated page', () => {
  // Source: snapshot fixtures clientOnlyBasic/Multiple/Nested/NoFallback/Renamed.tsx
  test.each([
    {
      name: 'basic',
      server: '<div><div>Loading...</div></div>',
      client: '<div><chart-el></chart-el></div>',
    },
    {
      name: 'multiple',
      server:
        '<div><span>Loading video...</span><p>Some server content</p><span>Loading audio...</span></div>',
      client:
        '<div><video-el></video-el><p>Some server content</p><audio-el></audio-el></div>',
    },
    {
      name: 'nested',
      server: '<div><div>Outer loading</div></div>',
      client:
        '<div><div>Outer content<outer-el></outer-el><inner-el></inner-el></div></div>',
    },
    {
      name: 'noFallback',
      server: '<div></div>',
      client: '<div><animation-el></animation-el></div>',
    },
    {
      name: 'renamed',
      server: '<div><div>Loading...</div></div>',
      client: '<div><size-el></size-el></div>',
    },
    {
      name: 'clientFile',
      server: '<div><div>Loading...</div></div>',
      client:
        '<div><client-chart-el data-mark="MARK_CLIENT_CHART"></client-chart-el></div>',
    },
  ])(
    '$name: the server renders the fallback and the hydrated page the children',
    async ({ name, server, client }) => {
      const page = await app.hydrate(name)
      expect(page.serverHtml).toBe(server)
      expect({
        html: page.html,
        recoverableErrors: page.recoverableErrors,
        consoleErrors: page.consoleErrors,
      }).toEqual({ html: client, recoverableErrors: [], consoleErrors: [] })
    },
  )
})

// A module import protection denies on the server (`*.client.*`) that only
// the children of a `<ClientOnly>` use is eliminated from the server build
// (the build above reports no import-protection violation: by default a
// violation fails a build) and its code is not in the server bundle.
// Source: SPEC J4.11.
test('a *.client.* module only ClientOnly children use is not in the server build', () => {
  expect(
    // (everything the build reported, on every channel)
    reportedViolations(app.build),
  ).toEqual([])
  expect(app.build.ssr.where('MARK_CLIENT_CHART')).toBe('nowhere')
  expect(app.build.client.where('MARK_CLIENT_CHART')).not.toBe('nowhere')
})

// So is a neutral module (`src/WindowSize.tsx`, the `renamed` fixture):
// the server build neither bundles nor runs it (SPEC J4.11, G16).
test('a neutral module only ClientOnly children use is not in the server build', () => {
  expect(app.build.ssr.where('MARK_WINDOW_SIZE_LOADED')).toBe('nowhere')
  expect(app.build.client.where('MARK_WINDOW_SIZE_LOADED')).not.toBe('nowhere')
})
