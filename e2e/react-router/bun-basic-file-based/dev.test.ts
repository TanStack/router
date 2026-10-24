import { expect } from '@playwright/test'
import { test as base } from '@tanstack/router-e2e-utils'
import { SourceMap } from 'node:module'
import type { SourceMapPayload } from 'node:module'
import type { CDPSession, Page } from '@playwright/test'
import {
  aboutSource,
  nestedSource,
  startDevFixture,
  virtualConfigSource,
} from './dev-fixture'

const test = base.extend<{
  native: Awaited<ReturnType<typeof startDevFixture>>
  generatedExtension: string
  virtualMount: boolean
  virtualConfigFile: boolean
  virtualConfigHelperDepth: 0 | 1 | 2
  autoCodeSplitting: boolean
  projectAlias: boolean
}>({
  generatedExtension: ['ts', { option: true }],
  virtualMount: [false, { option: true }],
  virtualConfigFile: [false, { option: true }],
  virtualConfigHelperDepth: [0, { option: true }],
  autoCodeSplitting: [true, { option: true }],
  projectAlias: [false, { option: true }],
  native: async (
    {
      generatedExtension,
      virtualMount,
      virtualConfigFile,
      virtualConfigHelperDepth,
      autoCodeSplitting,
      projectAlias,
    },
    use,
    testInfo,
  ) => {
    const native = await startDevFixture({
      generatedExtension,
      virtualMount,
      virtualConfigFile,
      virtualConfigHelperDepth,
      autoCodeSplitting,
      projectAlias,
    })
    try {
      await testInfo.attach('versions.json', {
        body: JSON.stringify(native.versions, null, 2),
        contentType: 'application/json',
      })
      await use(native)
    } finally {
      await testInfo.attach('native.log', {
        body: native.logs(),
        contentType: 'text/plain',
      })
      await native.close()
    }
  },
})

test.describe('virtual physical directory outside routesDirectory', () => {
  test.use({ virtualMount: true })
  test('discovers a route added inside an existing empty mounted directory', async ({
    page,
    request,
    native,
  }, testInfo) => {
    await page.goto(native.url)
    await expect(page.getByRole('heading')).toHaveText('HOME_NATIVE_DEV')
    const token = await documentToken(page)
    await native.save(
      'mounted/empty/deep/created.tsx',
      nestedSource('/empty/deep/created', 'MOUNTED_ADDED'),
    )
    await expect.poll(() => native.tree()).toContain('/empty/deep/created')
    await page
      .getByRole('link', { name: 'Mounted created', exact: true })
      .click()
    await expect(page.getByRole('heading')).toHaveText('MOUNTED_ADDED')
    const sameDocumentAtCheckpoint = (await documentToken(page)) === token
    native.assertAlive()
    expect(
      await (
        await request.get(new URL('/__native-info', native.url).href)
      ).json(),
    ).toEqual({ pid: native.pid })
    await testInfo.attach('mounted.json', {
      body: JSON.stringify({ sameDocumentAtCheckpoint, sameProcess: true }),
      contentType: 'application/json',
    })
  })
})

for (const extension of ['mts', 'cts', 'tsx']) {
  test.describe(`generated route tree .${extension}`, () => {
    test.use({ generatedExtension: extension })
    test('bundles the actual generated TypeScript through the public plugin', async ({
      page,
      native,
    }) => {
      await page.goto(native.url)
      await expect(page.getByRole('heading')).toHaveText('HOME_NATIVE_DEV')
      expect(await native.tree()).toContain(
        'export interface FileRoutesByFullPath',
      )
      await page.getByRole('link', { name: 'About', exact: true }).click()
      await expect(page.getByRole('heading')).toHaveText('ABOUT_BEFORE')
      native.assertAlive()
    })
  })
}

const documentToken = (page: Page) =>
  page.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      __bunDevDocumentToken?: string
    }
    return (state.__bunDevDocumentToken ??= crypto.randomUUID())
  })

test.describe('project directory alias', () => {
  test.use({ projectAlias: true })
  test('splits canonical route modules and watches the aliased generated tree', async ({
    page,
    request,
    native,
  }, testInfo) => {
    await page.goto(native.url)
    await expect(page.getByRole('heading')).toHaveText('HOME_NATIVE_DEV')
    const initialToken = await documentToken(page)
    await page.getByRole('link', { name: 'About', exact: true }).click()
    await expect(page.getByRole('heading')).toHaveText('ABOUT_BEFORE')
    expect(await documentToken(page)).toBe(initialToken)
    const compiledRoute = () =>
      native.inlineMaps.find(
        ({ contents }) =>
          contents.includes('AUTHORED_BEFORE') &&
          contents.includes('sourceMappingURL=data:'),
      )
    await expect
      .poll(compiledRoute, {
        message: 'the canonical route receives the Router split transform',
      })
      .toBeDefined()
    const compiled = compiledRoute()
    expectAuthoredPosition(
      inlinePosition(compiled!.contents, 'AUTHORED_BEFORE'),
      aboutSource(),
      'AUTHORED_BEFORE',
    )
    await native.save(
      'routes/nested/empty/deep/added.tsx',
      nestedSource('/nested/empty/deep/added', 'ALIASED_NESTED_ADDED'),
    )
    await expect.poll(() => native.tree()).toContain('/nested/empty/deep/added')
    await page.getByRole('link', { name: 'Nested added', exact: true }).click()
    await expect(page.getByRole('heading')).toHaveText('ALIASED_NESTED_ADDED')
    const checkpointToken = await documentToken(page)
    await page.getByRole('link', { name: 'Home', exact: true }).click()
    await expect(page.getByRole('heading')).toHaveText('HOME_NATIVE_DEV')
    expect(await documentToken(page)).toBe(checkpointToken)
    native.assertAlive()
    expect(
      await (
        await request.get(new URL('/__native-info', native.url).href)
      ).json(),
    ).toEqual({ pid: native.pid })
    await testInfo.attach('project-alias.json', {
      body: JSON.stringify({
        sameProcess: true,
        automaticDocumentReload: initialToken !== checkpointToken,
      }),
      contentType: 'application/json',
    })
  })
})

function inlinePosition(contents: string, marker: string) {
  const match = contents.match(
    /\/\/# sourceMappingURL=data:application\/json[^,]*;base64,([^\s]+)/,
  )
  expect(
    match,
    'Router must forward an inline compiler source map',
  ).toBeTruthy()
  const payload = JSON.parse(
    Buffer.from(match![1]!, 'base64').toString(),
  ) as SourceMapPayload
  return mappedPosition(contents, marker, payload)
}

function mappedPosition(
  source: string,
  marker: string,
  payload: SourceMapPayload,
) {
  const markerIndex = source.indexOf(marker)
  expect(markerIndex).toBeGreaterThanOrEqual(0)
  const errorIndex = source.lastIndexOf('new Error', markerIndex)
  expect(errorIndex).toBeGreaterThanOrEqual(0)
  const generated = source.slice(0, errorIndex).split('\n')
  const entry = new SourceMap(payload).findEntry(
    generated.length - 1,
    generated.at(-1)!.length,
  )
  if (!('originalSource' in entry)) {
    throw new Error(
      `No authored mapping for ${marker} at generated ${generated.length}:${generated.at(-1)!.length}`,
    )
  }
  return { entry, payload }
}

function expectAuthoredPosition(
  result: ReturnType<typeof mappedPosition>,
  authored: string,
  marker: string,
) {
  const { entry, payload } = result
  expect(entry.originalSource?.replaceAll('\\', '/')).toMatch(
    /\/routes\/about\.tsx$/,
  )
  const authoredLines = authored.split('\n')
  const line = authoredLines.findIndex((value) => value.includes(marker))
  expect(entry.originalLine).toBe(line)
  expect(entry.originalColumn).toBe(authoredLines[line]!.indexOf('new Error'))
  const index = payload.sources.indexOf(entry.originalSource!)
  expect(payload.sourcesContent?.[index]).toBe(authored)
}

for (const autoCodeSplitting of [true, false]) {
  test.describe(`autoCodeSplitting: ${autoCodeSplitting}`, () => {
    test.use({ autoCodeSplitting })
    test('native lazy navigation and component/loader edits preserve the document and state', async ({
      page,
      request,
      native,
    }, testInfo) => {
      const errors: Array<string> = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(native.url)
      await expect(page.getByRole('heading')).toHaveText('HOME_NATIVE_DEV')
      await expect(page.getByText('ABOUT_BEFORE', { exact: true })).toHaveCount(
        0,
      )
      await page.getByRole('link', { name: 'About', exact: true }).click()
      await expect(page.getByRole('heading')).toHaveText('ABOUT_BEFORE')
      await expect(page.getByRole('heading')).toHaveAttribute(
        'data-shared-identity',
        'true',
      )
      expect(
        await page.evaluate(
          () =>
            (
              globalThis as typeof globalThis & {
                __bunDevSharedInitializations?: number
              }
            ).__bunDevSharedInitializations,
        ),
      ).toBe(1)
      expect(
        native.inlineMaps.some((event) =>
          event.id.includes('?tsr-split=component'),
        ),
      ).toBe(autoCodeSplitting)
      await page.getByRole('button', { name: 'Count 0', exact: true }).click()
      await expect(
        page.getByRole('button', { name: 'Count 1', exact: true }),
      ).toBeVisible()
      const token = await documentToken(page)

      await native.save('routes/about.tsx', aboutSource('ABOUT_AFTER'))
      await expect(page.getByRole('heading')).toHaveText('ABOUT_AFTER')
      await expect(
        page.getByRole('button', { name: 'Count 1', exact: true }),
      ).toBeVisible()
      expect(await documentToken(page)).toBe(token)
      await expect(page.getByRole('heading')).toHaveAttribute(
        'data-shared-identity',
        'true',
      )

      await native.save(
        'routes/about.tsx',
        aboutSource('ABOUT_AFTER', 'LOADER_AFTER'),
      )
      await expect(page.getByTestId('loader')).toHaveText('LOADER_AFTER')
      await expect(
        page.getByRole('button', { name: 'Count 1', exact: true }),
      ).toBeVisible()
      await expect(page.getByRole('heading')).toHaveAttribute(
        'data-shared-identity',
        'true',
      )
      expect(await documentToken(page)).toBe(token)
      native.assertAlive()
      expect(
        await (
          await request.get(new URL('/__native-info', native.url).href)
        ).json(),
      ).toEqual({ pid: native.pid })
      await testInfo.attach('lifecycle.json', {
        body: JSON.stringify({ sameDocument: true, sameProcess: true, errors }),
        contentType: 'application/json',
      })
      expect(errors).toEqual([])
    })
  })
}

test('inline compiler maps and browser mappings retain authored positions before and after HMR', async ({
  page,
  request,
  native,
}, testInfo) => {
  const session: CDPSession = await page.context().newCDPSession(page)
  const scripts: Array<{
    scriptId: string
    url: string
    sourceMapURL: string
  }> = []
  session.on('Debugger.scriptParsed', (event) => {
    scripts.push({
      scriptId: event.scriptId,
      url: event.url,
      sourceMapURL: event.sourceMapURL ?? '',
    })
  })
  await session.send('Debugger.enable')
  try {
    await page.goto(new URL('/about', native.url).href)
    await expect(page.getByRole('heading')).toHaveText('ABOUT_BEFORE')
    const token = await documentToken(page)
    for (const [heading, marker, authored] of [
      ['ABOUT_BEFORE', 'AUTHORED_BEFORE', aboutSource()],
      [
        'ABOUT_MAPPED_AFTER',
        'AUTHORED_AFTER',
        aboutSource('ABOUT_MAPPED_AFTER', 'LOADER_BEFORE', 'AUTHORED_AFTER'),
      ],
    ]) {
      const start = heading === 'ABOUT_BEFORE' ? 0 : native.inlineMaps.length
      if (heading !== 'ABOUT_BEFORE') {
        await native.save('routes/about.tsx', authored!)
      }
      await expect(page.getByRole('heading')).toHaveText(heading!)
      await expect
        .poll(() =>
          native.inlineMaps
            .slice(start)
            .some(
              (event) =>
                event.id.includes('?tsr-split=component') &&
                event.contents.includes(marker!),
            ),
        )
        .toBe(true)
      const event = native.inlineMaps
        .slice(start)
        .findLast(
          (value) =>
            value.id.includes('?tsr-split=component') &&
            value.contents.includes(marker!),
        )!
      expectAuthoredPosition(
        inlinePosition(event.contents, marker!),
        authored!,
        marker!,
      )

      let browserResult: ReturnType<typeof mappedPosition> | undefined
      let browserMapKind = ''
      await expect
        .poll(async () => {
          for (const script of [...scripts].reverse()) {
            if (!script.sourceMapURL) {
              continue
            }
            const { scriptSource } = await session.send(
              'Debugger.getScriptSource',
              { scriptId: script.scriptId },
            )
            if (!scriptSource.includes(marker!)) {
              continue
            }
            let payload: SourceMapPayload
            if (script.sourceMapURL.startsWith('data:')) {
              const [header, data] = script.sourceMapURL.split(',', 2)
              payload = JSON.parse(
                header!.includes(';base64')
                  ? Buffer.from(data!, 'base64').toString()
                  : decodeURIComponent(data!),
              )
              browserMapKind = 'inline'
            } else {
              const scriptUrl = new URL(script.url || native.url, native.url)
              // Chromium resolves a blob script's map against its inner URL.
              const mapBase =
                scriptUrl.protocol === 'blob:'
                  ? scriptUrl.pathname
                  : scriptUrl.href
              const response = await request.get(
                new URL(script.sourceMapURL, mapBase).href,
              )
              if (!response.ok()) {
                continue
              }
              payload = await response.json()
              browserMapKind = 'external'
            }
            browserResult = mappedPosition(scriptSource, marker!, payload)
            return true
          }
          return false
        })
        .toBe(true)
      expectAuthoredPosition(browserResult!, authored!, marker!)
      expect(await documentToken(page)).toBe(token)
      await testInfo.attach(`${marker}-mapping.json`, {
        body: JSON.stringify({
          input: inlinePosition(event.contents, marker!).entry,
          browser: browserResult!.entry,
          browserMapKind,
        }),
        contentType: 'application/json',
      })
    }
    native.assertAlive()
  } finally {
    await session.detach()
  }
})

test('discovers nested empty directories and handles add, rename and delete without a process restart', async ({
  page,
  request,
  native,
}, testInfo) => {
  await page.goto(native.url)
  await expect(page.getByRole('heading')).toHaveText('HOME_NATIVE_DEV')
  const topology: Array<{ stage: string; automaticDocumentReload: boolean }> =
    []
  let token = await documentToken(page)
  await native.save(
    'routes/nested/empty/deep/added.tsx',
    nestedSource('/nested/empty/deep/added', 'NESTED_ADDED'),
  )
  await expect.poll(() => native.tree()).toContain('/nested/empty/deep/added')
  await page.getByRole('link', { name: 'Nested added', exact: true }).click()
  await expect(page.getByRole('heading')).toHaveText('NESTED_ADDED')
  topology.push({
    stage: 'add-in-existing-empty-nested-directory',
    automaticDocumentReload: (await documentToken(page)) !== token,
  })
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('heading')).toHaveText('HOME_NATIVE_DEV')
  token = await documentToken(page)

  await native.rename(
    'routes/nested/empty/deep/added.tsx',
    'routes/nested/empty/deep/renamed.tsx',
  )
  await expect
    .poll(async () => {
      const tree = await native.tree()
      return (
        tree.includes('/nested/empty/deep/renamed') &&
        !tree.includes('/nested/empty/deep/added')
      )
    })
    .toBe(true)
  await page.getByRole('link', { name: 'Nested renamed', exact: true }).click()
  await expect(page.getByRole('heading')).toHaveText('NESTED_ADDED')
  await page.getByRole('link', { name: 'Nested added', exact: true }).click()
  await expect(page.getByRole('heading')).toHaveText('NOT_FOUND')
  topology.push({
    stage: 'rename',
    automaticDocumentReload: (await documentToken(page)) !== token,
  })
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  token = await documentToken(page)

  await native.remove('routes/nested/empty/deep/renamed.tsx')
  await expect
    .poll(
      async () => !(await native.tree()).includes('/nested/empty/deep/renamed'),
    )
    .toBe(true)
  await page.getByRole('link', { name: 'Nested renamed', exact: true }).click()
  await expect(page.getByRole('heading')).toHaveText('NOT_FOUND')
  topology.push({
    stage: 'delete',
    automaticDocumentReload: (await documentToken(page)) !== token,
  })
  native.assertAlive()
  expect(
    await (
      await request.get(new URL('/__native-info', native.url).href)
    ).json(),
  ).toEqual({ pid: native.pid })
  await testInfo.attach('topology.json', {
    body: JSON.stringify({ pid: native.pid, topology }, null, 2),
    contentType: 'application/json',
  })
})

test('repairs a route generation conflict without restarting the server', async ({
  page,
  request,
  native,
  whitelistErrors,
}, testInfo) => {
  whitelistErrors.push(/conflicting configuration paths/i)
  await page.goto(native.url)
  await expect(page.getByRole('heading')).toHaveText('HOME_NATIVE_DEV')
  const token = await documentToken(page)
  const errorStart = native.logs().length
  await native.save(
    'routes/(conflict)/about.tsx',
    nestedSource('/(conflict)/about', 'CONFLICTING_ABOUT'),
  )
  await expect
    .poll(() => native.logs().slice(errorStart))
    .toMatch(/conflicting configuration paths/i)
  native.assertAlive()

  await native.remove('routes/(conflict)/about.tsx')
  await native.save(
    'routes/repaired.tsx',
    nestedSource('/repaired', 'GENERATION_REPAIRED'),
  )
  await expect.poll(() => native.tree()).toContain('/repaired')
  await page.getByRole('link', { name: 'Repaired', exact: true }).click()
  await expect(page.getByRole('heading')).toHaveText('GENERATION_REPAIRED')
  native.assertAlive()
  expect(
    await (
      await request.get(new URL('/__native-info', native.url).href)
    ).json(),
  ).toEqual({ pid: native.pid })
  await testInfo.attach('generation-recovery.json', {
    body: JSON.stringify({
      sameProcess: true,
      automaticDocumentReload: (await documentToken(page)) !== token,
    }),
    contentType: 'application/json',
  })
})

test('repairs a syntax error in an active route without restarting the server', async ({
  page,
  request,
  native,
  whitelistErrors,
}, testInfo) => {
  whitelistErrors.push(
    /Unexpected.*;|Expected (?:expression|identifier)|SyntaxError|SYNTAX_BROKEN/,
  )
  await page.goto(native.url)
  await page.getByRole('link', { name: 'About', exact: true }).click()
  await expect(page.getByRole('heading')).toHaveText('ABOUT_BEFORE')
  const token = await documentToken(page)
  const errorStart = native.logs().length
  await native.save(
    'routes/about.tsx',
    'export const Route = ; // SYNTAX_BROKEN\n',
  )
  await expect
    .poll(() => {
      const output = native.logs().slice(errorStart)
      return (
        output.includes('about.tsx') &&
        /Unexpected|Expected (?:expression|identifier)|SyntaxError/.test(output)
      )
    })
    .toBe(true)
  native.assertAlive()

  await native.save(
    'routes/about.tsx',
    aboutSource('SYNTAX_REPAIRED', 'LOADER_REPAIRED'),
  )
  await expect(page.getByRole('heading')).toHaveText('SYNTAX_REPAIRED')
  await expect(page.getByTestId('loader')).toHaveText('LOADER_REPAIRED')
  native.assertAlive()
  expect(
    await (
      await request.get(new URL('/__native-info', native.url).href)
    ).json(),
  ).toEqual({ pid: native.pid })
  await testInfo.attach('syntax-recovery.json', {
    body: JSON.stringify({
      sameProcess: true,
      automaticDocumentReload: (await documentToken(page)) !== token,
    }),
    contentType: 'application/json',
  })
})

for (const virtualConfigHelperDepth of [0, 1, 2] as const) {
  test.describe(`string virtual configuration with ${virtualConfigHelperDepth} helper imports`, () => {
    test.use({ virtualConfigFile: true, virtualConfigHelperDepth })
    test('updates existing browser navigation after config edits and atomic replacement', async ({
      page,
      request,
      native,
    }, testInfo) => {
      await page.goto(native.url)
      await page
        .getByRole('link', { name: 'Virtual before', exact: true })
        .click()
      await expect(page.getByRole('heading')).toHaveText('VIRTUAL_BEFORE')
      await page.getByRole('link', { name: 'Home', exact: true }).click()
      await expect(page.getByRole('heading')).toHaveText('HOME_NATIVE_DEV')
      const token = await documentToken(page)

      for (const [included, atomic] of [
        ['after', false],
        ['before', false],
        ['after', true],
      ] as const) {
        if (atomic) {
          await native.save(
            `${native.virtualConfigPath}.next`,
            virtualConfigSource(included),
          )
          await native.rename(
            `${native.virtualConfigPath}.next`,
            native.virtualConfigPath,
          )
        } else {
          await native.save(
            native.virtualConfigPath,
            virtualConfigSource(included),
          )
        }
        const excluded = included === 'after' ? 'before' : 'after'
        await expect
          .poll(async () => {
            const tree = await native.tree()
            return (
              tree.includes(`/virtual-${included}`) &&
              !tree.includes(`/virtual-${excluded}`)
            )
          })
          .toBe(true)
        await page
          .getByRole('link', { name: `Virtual ${included}`, exact: true })
          .click()
        await expect(page.getByRole('heading')).toHaveText(
          `VIRTUAL_${included.toUpperCase()}`,
        )
        await page
          .getByRole('link', { name: `Virtual ${excluded}`, exact: true })
          .click()
        await expect(page.getByRole('heading')).toHaveText('NOT_FOUND')
        await page.getByRole('link', { name: 'Home', exact: true }).click()
        await expect(page.getByRole('heading')).toHaveText('HOME_NATIVE_DEV')
      }
      native.assertAlive()
      expect(
        await (
          await request.get(new URL('/__native-info', native.url).href)
        ).json(),
      ).toEqual({ pid: native.pid })
      await testInfo.attach('virtual-config.json', {
        body: JSON.stringify({
          sameProcess: true,
          automaticDocumentReload: (await documentToken(page)) !== token,
        }),
        contentType: 'application/json',
      })
    })
  })
}
