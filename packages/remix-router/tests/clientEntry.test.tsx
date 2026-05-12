/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { describe, expect, test } from 'vitest'
import { renderToString } from '@remix-run/ui/server'
import { ClientLink, clearActiveRouter } from '../src'

describe('<ClientLink>', () => {
  test('SSR emits a hydration marker for the entry', async () => {
    // ClientLink reads the active router for href construction. With no
    // router available, it falls back to the raw `to` string — that's
    // fine for asserting on the marker.
    clearActiveRouter()

    const html = await renderToString(
      <div>
        <ClientLink to="/about">About</ClientLink>
      </div>,
    )

    // The SSR pipeline brackets each clientEntry in `<!-- rmx:h:hN -->` /
    // `<!-- /rmx:h -->` markers; the matching JSON payload is emitted in
    // `<script id="rmx-data">` at the end of the document.
    expect(html).toContain('<!-- rmx:h:')
    expect(html).toContain('<!-- /rmx:h -->')
    expect(html).toContain('rmx-data')
    // The fallback href when there's no router is the raw `to`.
    expect(html).toContain('href="/about"')
  })

  test('JSON payload references the entry module + export', async () => {
    clearActiveRouter()
    const html = await renderToString(
      <ClientLink to="/profile">Profile</ClientLink>,
    )
    // SSR splits the entryId on '#' into moduleUrl + exportName.
    expect(html).toContain('"moduleUrl":"@tanstack/remix-router/ClientLink"')
    expect(html).toContain('"exportName":"ClientLink"')
  })
})
