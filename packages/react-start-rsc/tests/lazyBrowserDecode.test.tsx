import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'

const decoder = vi.hoisted(() => ({
  loaded: false,
  decode: vi.fn(),
}))

vi.mock('@tanstack/start-client-core', () => ({
  trackPostProcessPromise: vi.fn(),
}))

// The factory runs when the decoder module is first imported, so `loaded`
// records whether the Flight client runtime has been pulled in.
vi.mock('@vitejs/plugin-rsc/browser', () => {
  decoder.loaded = true
  decoder.decode.mockImplementation(async () =>
    React.createElement('div', null, 'decoded'),
  )
  return { createFromReadableStream: decoder.decode }
})

import { createCompositeFromStream } from '../src/createServerComponentFromStream'
import { CompositeComponent } from '../src/CompositeComponent'

describe('browser Flight decoder loading', () => {
  it('loads the decoder only when a stream is decoded', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close()
      },
    })

    // Deferred decode: SSR asset deps keep decoding until first render.
    const src = createCompositeFromStream(stream, {
      cssHrefs: ['/assets/component.css'],
    })

    expect(decoder.loaded).toBe(false)

    await act(async () => {
      render(
        <React.Suspense fallback={<div>loading</div>}>
          <CompositeComponent src={src} />
        </React.Suspense>,
      )
    })

    expect(await screen.findByText('decoded')).toBeTruthy()
    expect(decoder.loaded).toBe(true)
  })

  it('decodes synchronously once the decoder is loaded', () => {
    // Relies on the previous test having loaded the decoder.
    expect(decoder.loaded).toBe(true)
    decoder.decode.mockClear()

    const stream = new ReadableStream<Uint8Array>()
    createCompositeFromStream(stream)

    // Starting decode in the same task avoids Suspense fallbacks for streamed
    // server components that previously decoded without an extra task hop.
    expect(decoder.decode).toHaveBeenCalledWith(stream)
  })
})
