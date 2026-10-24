import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { SourceMap } from 'node:module'
import type { SourceMapPayload } from 'node:module'

const markers = {
  Home: 'HOME_NATIVE_BUN',
  About: 'ABOUT_NATIVE_BUN',
  Details: 'DETAILS_DYNAMIC_BUN',
  'Second build': 'SECOND_BUILD_NATIVE_BUN',
}

type Build = {
  name: string
  routeTree: string
  routeSourceMaps: Array<{
    payload: SourceMapPayload
    generatedLine: number
    generatedColumn: number
    originalSource: string
  }>
  outputs: Array<{ path: string; kind: string; markers: Array<string> }>
}

test('generates routes before production bundling and refreshes reused plugins', async ({
  request,
}) => {
  const response = await request.get('/__builds')
  expect(response.ok()).toBe(true)
  const manifest = (await response.json()) as {
    builds: Array<Build>
    generationFailure?: string
  }
  expect(manifest.builds.map((build) => build.name)).toEqual([
    'initial',
    'reused',
    'concurrent-a',
    'concurrent-b',
    'independent',
    'recovered',
    'edited',
  ])
  for (const build of manifest.builds) {
    expect(build.routeTree).toContain('/about')
    if (build.name === 'edited') {
      expect(build.routeTree).not.toContain('/details')
    } else {
      expect(build.routeTree).toContain('/details')
    }
    const entrypoint = build.outputs.find(
      (output) => output.kind === 'entry-point',
    )
    expect(entrypoint).toBeDefined()
    expect(entrypoint!.markers).toEqual([])
    const expectedMarkers =
      build.name === 'initial'
        ? [markers.Home, markers.About, markers.Details]
        : build.name === 'edited'
          ? [markers.Home, markers['Second build'], 'EDITED_NATIVE_BUN']
          : Object.values(markers)
    expect(build.outputs.flatMap((output) => output.markers).sort()).toEqual(
      [...expectedMarkers].sort(),
    )
    for (const marker of expectedMarkers) {
      expect(
        build.outputs.filter((output) => output.markers.includes(marker)),
      ).toEqual([expect.objectContaining({ kind: 'chunk', markers: [marker] })])
    }
    if (build.name !== 'initial') {
      expect(build.routeTree).toContain('/second build')
    }
  }
  expect(manifest.generationFailure).toBeTruthy()
  expect(manifest.generationFailure).toMatch(/conflicting configuration paths/i)
})

test('maps split route chunks to their authored source', async ({
  request,
}) => {
  const manifest = (await (await request.get('/__builds')).json()) as {
    builds: Array<Build>
    supportsInputSourceMaps: boolean
  }
  const maps = manifest.builds
    .filter(({ name }) => name !== 'edited')
    .flatMap(({ routeSourceMaps }) => routeSourceMaps)
  expect(maps).toHaveLength(6)
  test.skip(
    !manifest.supportsInputSourceMaps,
    'Bun does not compose input source maps: https://github.com/oven-sh/bun/issues/6173',
  )
  for (const sourceMap of maps) {
    const entry = new SourceMap(sourceMap.payload).findEntry(
      sourceMap.generatedLine,
      sourceMap.generatedColumn,
    )
    expect(entry.originalSource).toMatch(/\/routes\/about\.tsx$/)
    const sourceIndex = sourceMap.payload.sources.indexOf(entry.originalSource!)
    expect(sourceMap.payload.sourcesContent?.[sourceIndex]).toBe(
      sourceMap.originalSource,
    )
    // Bun maps JSX text to its enclosing element, at line 21, column 4.
    expect(entry.originalLine).toBe(20)
    expect(entry.originalColumn).toBe(4)
  }
})

for (const buildName of [
  'concurrent-a',
  'concurrent-b',
  'independent',
  'recovered',
]) {
  test(`${buildName}: loads route chunks on navigation and preserves shared module identity`, async ({
    page,
    request,
  }) => {
    const manifest = (await (await request.get('/__builds')).json()) as {
      builds: Array<Build>
    }
    const build = manifest.builds.find((build) => build.name === buildName)!
    const requested = new Set<string>()
    const errors: Array<string> = []
    page.on('request', (request) => {
      requested.add(new URL(request.url()).pathname.slice(1))
    })
    page.on('pageerror', (error) => {
      errors.push(error.message)
    })
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text())
      }
    })
    const chunkFor = (marker: string) =>
      `${buildName}/${build.outputs.find((output) => output.markers.includes(marker))!.path}`

    await page.goto(`/?build=${buildName}`)
    await expect(page.getByRole('heading')).toHaveText(markers.Home)
    expect(requested.has(chunkFor(markers.Home))).toBe(true)
    expect(requested.has(chunkFor(markers.About))).toBe(false)
    expect(requested.has(chunkFor(markers.Details))).toBe(false)
    expect(requested.has(chunkFor(markers['Second build']))).toBe(false)

    for (const name of ['About', 'Details', 'Home', 'About'] as const) {
      await page.getByRole('link', { name, exact: true }).click()
      await expect(page.getByRole('heading')).toContainText(markers[name])
      expect(requested.has(chunkFor(markers[name]))).toBe(true)
      if (name === 'About') {
        await expect(page.getByRole('heading')).toHaveAttribute(
          'data-shared-identity',
          'true',
        )
        await expect(page.getByRole('heading')).toHaveText('ABOUT_NATIVE_BUN 1')
      }
    }
    await page.getByRole('link', { name: 'Second build', exact: true }).click()
    await expect(page.getByRole('heading')).toHaveText(markers['Second build'])
    await expect(page.getByRole('heading')).toHaveAttribute(
      'data-shared-identity',
      'true',
    )
    expect(requested.has(chunkFor(markers['Second build']))).toBe(true)
    expect(
      await page.evaluate(
        () =>
          (
            globalThis as typeof globalThis & {
              __bunSharedInitializations?: number
            }
          ).__bunSharedInitializations,
      ),
    ).toBe(1)
    expect(errors).toEqual([])
  })
}
