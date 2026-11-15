import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'

const decoder = vi.hoisted(() => ({ loaded: false }))

vi.mock('@tanstack/start-client-core', () => ({
  trackPostProcessPromise: vi.fn(),
}))

// The factory runs when the decoder module is first imported, so `loaded`
// records whether the Flight client runtime has been pulled in.
vi.mock('@vitejs/plugin-rsc/browser', () => {
  decoder.loaded = true
  return {
    createFromReadableStream: vi.fn(async () =>
      React.createElement('div', null, 'decoded'),
    ),
  }
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
})
