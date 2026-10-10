import { afterEach, expect, test } from 'vitest'
import { cleanup, render } from '@testing-library/vue'
import { defineComponent } from 'vue'
import {
  Asset,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '../src'

afterEach(cleanup)

test.each([undefined, '', 'asset-nonce'])(
  'deduplicates repeated inline scripts with nonce=%s',
  (nonce) => {
    const content = 'void "nonce-deduplication"'
    const existing = document.createElement('script')
    existing.textContent = content
    if (nonce !== undefined) {
      existing.setAttribute('nonce', nonce)
    }
    document.head.appendChild(existing)
    const router = createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory(),
    })

    try {
      render(
        defineComponent({
          setup: () => () => (
            <RouterContextProvider router={router}>
              <div>
                <Asset tag="script" attrs={{ nonce }} children={content} />
                <Asset tag="script" attrs={{ nonce }} children={content} />
              </div>
            </RouterContextProvider>
          ),
        }),
      )
      expect(Array.from(document.head.querySelectorAll('script'))).toEqual([
        existing,
      ])
    } finally {
      document.head.querySelectorAll('script').forEach((script) => {
        if (script.textContent === content) {
          script.remove()
        }
      })
    }
  },
)
