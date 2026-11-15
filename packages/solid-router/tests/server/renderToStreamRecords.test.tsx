import { Loading, createMemo } from 'solid-js'
import { describe, expect, test } from 'vitest'
import { renderToStream } from '@solidjs/web'

describe('installed Solid stream renderer', () => {
  test('writes a resolved Loading patch as complete records', async () => {
    let resolveResource!: (value: string) => void
    const resource = new Promise<string>((resolve) => {
      resolveResource = resolve
    })

    function Deferred() {
      const value = createMemo(() => resource)
      return (
        <Loading fallback={<p>solid-fallback</p>}>
          <p>{value()}</p>
        </Loading>
      )
    }

    const records: Array<string> = []
    let resolveFirstRecord!: () => void
    const firstRecord = new Promise<void>((resolve) => {
      resolveFirstRecord = resolve
    })
    const stream = renderToStream(() => (
      <html>
        <body>
          <Deferred />
        </body>
      </html>
    ))
    const completed = stream.pipeTo(
      new WritableStream<Uint8Array>({
        write(chunk) {
          records.push(new TextDecoder('utf-8', { fatal: true }).decode(chunk))
          if (records.length === 1) {
            resolveFirstRecord()
          }
        },
      }),
    )

    await firstRecord
    expect(records[0]).toContain('solid-fallback')

    resolveResource('solid-resolved')
    await completed

    const templateIndex = records.findIndex((record) =>
      record.includes('solid-resolved'),
    )
    expect(templateIndex).toBeGreaterThan(0)
    // Solid 2 writes a patch's template and script as one complete record.
    expect(records[templateIndex]).toMatch(
      /^<template\b[^>]*>[\s\S]*<\/template><script\b[^>]*>[\s\S]*<\/script>$/,
    )
  })
})
