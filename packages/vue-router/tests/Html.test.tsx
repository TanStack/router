import { afterEach, expect, test } from 'vitest'
import * as Vue from 'vue'

import { Body } from '../src/Body'
import { Html } from '../src/Html'

afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

test('keeps the server-rendered body when the head mounts after hydration', async () => {
  const container = document.createElement('div')
  container.innerHTML = '<div data-allow-mismatch=""><h1>Hello</h1></div>'
  document.body.append(container)
  const heading = container.querySelector('h1')

  const app = Vue.createSSRApp({
    render: () =>
      Vue.h(Html, null, {
        default: () => [
          Vue.h('head', null, [Vue.h('title', null, 'Hello')]),
          Vue.h(Body, null, { default: () => [Vue.h('h1', null, 'Hello')] }),
        ],
      }),
  })
  app.mount(container)
  await Vue.nextTick()

  expect(document.head.querySelector('title')?.textContent).toBe('Hello')
  expect(container.querySelector('h1')).toBe(heading)
  app.unmount()
})

test('keeps a directive on Body after hydration', async () => {
  const container = document.createElement('div')
  container.innerHTML = '<div data-allow-mismatch=""><h1>Hello</h1></div>'
  document.body.append(container)
  let updated = 0
  const directive: Vue.Directive = { updated: () => void updated++ }

  const app = Vue.createSSRApp({
    render: () =>
      Vue.h(Html, null, {
        default: () => [
          Vue.h('head', null, [Vue.h('title', null, 'Hello')]),
          Vue.withDirectives(
            Vue.h(Body, null, { default: () => [Vue.h('h1', null, 'Hello')] }),
            [[directive]],
          ),
        ],
      }),
  })
  app.mount(container)
  await Vue.nextTick()

  expect(updated).toBe(1)
  app.unmount()
})
