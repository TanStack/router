import fs from 'node:fs'
import path from 'node:path'
import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { awaitHydrated } from './utils'

// Compiler stripping is a requirement. The client bundle must not carry
// `dehydrate` bodies (nor the server-only module they alone referenced); the
// server bundle must not carry `hydrate` or `context.revalidate` bodies. The
// markers live only inside those bodies in src/routes/stripping-marker.tsx.

const distDir = path.resolve(
  import.meta.dirname,
  '..',
  process.env.E2E_DIST_DIR ?? 'dist',
)

function readJsSources(dir: string): Array<{ file: string; code: string }> {
  const out: Array<{ file: string; code: string }> = []
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (/\.(m|c)?js$/.test(entry.name)) {
        out.push({
          file: path.relative(dir, full),
          code: fs.readFileSync(full, 'utf8'),
        })
      }
    }
  }
  walk(dir)
  return out
}

function filesContaining(
  sources: Array<{ file: string; code: string }>,
  needle: string,
) {
  return sources.filter((s) => s.code.includes(needle)).map((s) => s.file)
}

test.describe('bundle content - compiler stripping', () => {
  test('client bundle: no dehydrate bodies, no server-only module; hydrate and revalidate present', () => {
    const client = readJsSources(path.join(distDir, 'client'))
    expect(client.length).toBeGreaterThan(0)

    expect(filesContaining(client, 'TSR_E2E_DEHYDRATE_MARKER')).toEqual([])
    expect(filesContaining(client, 'TSR_E2E_DEHYDRATE_MARKER_CONTEXT')).toEqual(
      [],
    )
    expect(
      filesContaining(client, 'TSR_E2E_DEHYDRATE_MARKER_BEFORELOAD'),
    ).toEqual([])
    expect(filesContaining(client, 'TSR_E2E_DEHYDRATE_MARKER_LOADER')).toEqual(
      [],
    )

    // the module that is only used inside `dehydrate`
    expect(filesContaining(client, 'TSR_E2E_SERVER_ONLY_MODULE')).toEqual([])
    expect(filesContaining(client, 'node:crypto')).toEqual([])

    expect(
      filesContaining(client, 'TSR_E2E_HYDRATE_MARKER_CONTEXT'),
    ).not.toEqual([])
    expect(
      filesContaining(client, 'TSR_E2E_HYDRATE_MARKER_BEFORELOAD'),
    ).not.toEqual([])
    expect(
      filesContaining(client, 'TSR_E2E_HYDRATE_MARKER_LOADER'),
    ).not.toEqual([])
    expect(filesContaining(client, 'TSR_E2E_REVALIDATE_MARKER')).not.toEqual([])
  })

  test('server bundle: no hydrate or context.revalidate bodies; dehydrate and the server-only module present', () => {
    const server = readJsSources(path.join(distDir, 'server'))
    expect(server.length).toBeGreaterThan(0)

    expect(filesContaining(server, 'TSR_E2E_HYDRATE_MARKER')).toEqual([])
    expect(filesContaining(server, 'TSR_E2E_HYDRATE_MARKER_CONTEXT')).toEqual(
      [],
    )
    expect(
      filesContaining(server, 'TSR_E2E_HYDRATE_MARKER_BEFORELOAD'),
    ).toEqual([])
    expect(filesContaining(server, 'TSR_E2E_HYDRATE_MARKER_LOADER')).toEqual([])
    expect(filesContaining(server, 'TSR_E2E_REVALIDATE_MARKER')).toEqual([])

    expect(
      filesContaining(server, 'TSR_E2E_DEHYDRATE_MARKER_CONTEXT'),
    ).not.toEqual([])
    expect(
      filesContaining(server, 'TSR_E2E_DEHYDRATE_MARKER_BEFORELOAD'),
    ).not.toEqual([])
    expect(
      filesContaining(server, 'TSR_E2E_DEHYDRATE_MARKER_LOADER'),
    ).not.toEqual([])
    expect(filesContaining(server, 'TSR_E2E_SERVER_ONLY_MODULE')).not.toEqual(
      [],
    )
  })
})

test.describe('stripping marker route - runtime', () => {
  test('SSR: dehydrate ran on the server, hydrate on the client, revalidate on invalidate', async ({
    page,
  }) => {
    await page.goto('/stripping-marker')
    await awaitHydrated(page)
    await expect(page.getByTestId('sm-heading')).toHaveText('Stripping marker')
    // the wire carried the 16-char digest computed by the server-only module
    await expect(page.getByTestId('sm-token')).toHaveText(
      'token-from-handler:16',
    )
    await expect(page.getByTestId('sm-via')).toHaveText(
      'TSR_E2E_HYDRATE_MARKER_CONTEXT',
    )
    await expect(page.getByTestId('sm-bl-via')).toHaveText(
      `TSR_E2E_HYDRATE_MARKER_BEFORELOAD:${'TSR_E2E_DEHYDRATE_MARKER_BEFORELOAD'.length}`,
    )
    await expect(page.getByTestId('sm-ld-via')).toHaveText(
      `TSR_E2E_HYDRATE_MARKER_LOADER:${'TSR_E2E_DEHYDRATE_MARKER_LOADER'.length}`,
    )

    await page.getByTestId('sm-invalidate-btn').click()
    await expect(page.getByTestId('sm-via')).toHaveText(
      'TSR_E2E_REVALIDATE_MARKER',
    )
    // prev was the hydrated value
    await expect(page.getByTestId('sm-token')).toHaveText(
      'token-from-handler:16',
    )
  })

  test('client nav: handlers only', async ({ page }) => {
    await page.goto('/')
    await awaitHydrated(page)
    await page.getByTestId('link-stripping-marker').click()
    await expect(page.getByTestId('sm-heading')).toHaveText('Stripping marker')
    await expect(page.getByTestId('sm-token')).toHaveText('token-from-handler')
    await expect(page.getByTestId('sm-via')).toHaveText('handler')
    await expect(page.getByTestId('sm-bl-via')).toHaveText('handler')
    await expect(page.getByTestId('sm-ld-via')).toHaveText('handler')
  })
})
