/**
 * Route HMR of a route whose component lives in a file of its own the route
 * tree attaches to the route the route file exports: a Vue single-file
 * component (`index.component.vue`) or a lazy route file (`index.lazy.tsx`).
 * An edit of the route file alone keeps showing that component (SPEC J3.1),
 * and an option the edit removes from the route file is gone (J3.3), both
 * one the first evaluation had and one only a later edit added. On main a
 * route file edit dropped the Vue piece: the page went blank until a reload
 * (Astra round 2, B2). A real dev server with the framework's plugins, a
 * real page and the real HMR client (`openRouteHmrPage`).
 */
import { describe } from 'vitest'
import { it } from '../test'
import type { TargetFramework } from '../route-app'

const inPlace = { reloaded: false, errors: [] }

/** The route's component in a file of its own, showing its loader data (`none` without a loader). */
const pieces: Record<TargetFramework, [file: string, text: string]> = {
  vue: [
    'routes/index.component.vue',
    `<script setup lang="ts">
import { useLoaderData } from '@tanstack/vue-router'
const data = useLoaderData({ from: '/' })
</script>
<template><p>Piece {{ data ?? 'none' }}</p></template>
`,
  ],
  react: [
    'routes/index.lazy.tsx',
    `import { createLazyFileRoute, useLoaderData } from '@tanstack/react-router'
export const Route = createLazyFileRoute('/')({ component: Piece })
function Piece() {
  const data = useLoaderData({ from: '/' })
  return <p>Piece {data ?? 'none'}</p>
}
`,
  ],
  solid: [
    'routes/index.lazy.tsx',
    `import { createLazyFileRoute, useLoaderData } from '@tanstack/solid-router'
export const Route = createLazyFileRoute('/')({ component: Piece })
function Piece() {
  const data = useLoaderData({ from: '/' })
  return <p>Piece {data() ?? 'none'}</p>
}
`,
  ],
}

/**
 * The route file: no component of its own, a loader returning `data` when
 * given, and `staticData` when `staticData`.
 */
const route = (target: TargetFramework, data?: string, staticData = false) =>
  `import { createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/')({
${data ? `  loader: () => '${data}',\n` : ''}${staticData ? `  staticData: { first: true },\n` : ''}})
`

const liveOptionKeys = `Object.keys(window.__APP_ROUTER__.routesById['/'].options).filter((key) => key === 'loader' || key === 'staticData')`

describe.each([
  { bundler: 'vite', target: 'vue' },
  { bundler: 'rsbuild', target: 'vue' },
  { bundler: 'vite', target: 'react' },
  { bundler: 'rsbuild', target: 'solid' },
] as const)('$bundler: a $target app', ({ bundler, target }) => {
  it('keeps the component of its own file across route file edits, and an option the edit removes is gone', async ({
    expect,
    openRouteHmrPage,
  }) => {
    const [pieceFile, piece] = pieces[target]
    const app = await openRouteHmrPage({
      bundler,
      target,
      files: {
        'routes/index.ts': route(target, undefined, true),
        [pieceFile]: piece,
      },
      ready: 'Piece none',
    })
    expect(await app.evaluate(liveOptionKeys)).toEqual(['staticData'])
    // A loader added and `staticData` (an option of the first evaluation)
    // removed: the piece stays and shows the loader's data
    expect(
      await app.edit({ 'routes/index.ts': route(target, 'two') }, 'Piece two'),
    ).toEqual(inPlace)
    expect(await app.evaluate(liveOptionKeys)).toEqual(['loader'])
    expect(
      await app.edit(
        { 'routes/index.ts': route(target, 'three') },
        'Piece three',
      ),
    ).toEqual(inPlace)
    // The loader removed (an option only later evaluations had)
    expect(
      await app.edit({ 'routes/index.ts': route(target) }, 'Piece none'),
    ).toEqual(inPlace)
    expect(await app.evaluate(liveOptionKeys)).toEqual([])
    expect(await app.page.text('#app')).toBe('Piece none')
    expect(app.loads()).toBe(1)
  })
})
