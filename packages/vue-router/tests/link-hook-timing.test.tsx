import * as Vue from 'vue'
import { cleanup, render } from '@testing-library/vue'
import { afterEach, expect, test, vi } from 'vitest'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
  useLinkProps,
} from '../src'

const histories: Array<ReturnType<typeof createMemoryHistory>> = []

afterEach(() => {
  cleanup()
  for (const history of histories.splice(0)) {
    history.destroy()
  }
  vi.restoreAllMocks()
})

function renderCustomLink(onClick?: () => void) {
  const options = Vue.reactive({ to: '/target', onClick })
  const history = createMemoryHistory({ initialEntries: ['/'] })
  histories.push(history)
  const router = createRouter({
    routeTree: createRootRoute(),
    history,
    isServer: false,
  })
  let readProps!: () => Vue.AnchorHTMLAttributes
  const CustomLink = Vue.defineComponent({
    setup() {
      const props = useLinkProps(options)
      readProps = () => Vue.unref(props)
      return () => Vue.h('a', readProps(), 'Custom destination')
    },
  })
  const { container } = render(
    Vue.h(RouterContextProvider, { router }, () => Vue.h(CustomLink)),
  )
  return {
    options,
    router,
    readProps,
    anchor: container.querySelector('a')!,
  }
}

test('useLinkProps exposes an external destination before queued effects flush', async () => {
  const { options, readProps, anchor } = renderCustomLink()
  expect(readProps().href).toBe('/target')

  options.to = 'https://other.example/destination'
  expect(readProps().href).toBe('https://other.example/destination')

  await Vue.nextTick()
  expect(anchor.getAttribute('href')).toBe('https://other.example/destination')
})

test('a custom Link user handler can make its destination external before interception', async () => {
  const fixture = renderCustomLink(() => {
    fixture.options.to = 'https://other.example/destination'
  })
  const navigate = vi.spyOn(fixture.router, 'navigate').mockResolvedValue()
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    button: 0,
  })

  fixture.anchor.dispatchEvent(event)

  expect(event.defaultPrevented).toBe(false)
  expect(navigate).not.toHaveBeenCalled()
  await Vue.nextTick()
  expect(fixture.anchor.getAttribute('href')).toBe(
    'https://other.example/destination',
  )
})
