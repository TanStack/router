import { bench, describe } from 'vitest'
import { composeHandlers } from '../src/link'
import type { EventHandler, SyntheticEvent } from 'react'

type Handler = EventHandler<SyntheticEvent>

const composeHandlersArray =
  (handlers: Array<undefined | Handler>) => (event: SyntheticEvent) => {
    for (const handler of handlers) {
      if (!handler) {
        continue
      }
      if (event.defaultPrevented) {
        return
      }
      handler(event)
    }
  }

const first: Handler = () => {}
const second: Handler = () => {}
const iterations = 1_000
let retainedHandlers: Array<Handler> = []

describe('composeHandlers', () => {
  bench('two-argument composer without a user handler (retained)', () => {
    const handlers: Array<Handler> = []

    for (let i = 0; i < iterations; i++) {
      handlers.push(composeHandlers(undefined, second))
    }

    retainedHandlers = handlers
    if (retainedHandlers.some((handler) => handler !== second)) {
      throw new Error('Expected the internal handler to be returned directly')
    }
  })

  bench('array composer without a user handler (retained)', () => {
    const handlers: Array<Handler> = []

    for (let i = 0; i < iterations; i++) {
      handlers.push(composeHandlersArray([undefined, second]))
    }

    retainedHandlers = handlers
    if (retainedHandlers.some((handler) => handler === second)) {
      throw new Error('Expected the array composer to return wrappers')
    }
  })

  bench('two-argument composer with a user handler (retained)', () => {
    const handlers: Array<Handler> = []

    for (let i = 0; i < iterations; i++) {
      handlers.push(composeHandlers(first, second))
    }

    retainedHandlers = handlers
    if (retainedHandlers.some((handler) => handler === second)) {
      throw new Error('Expected a wrapper when a user handler is present')
    }
  })

  bench('array composer with a user handler (retained)', () => {
    const handlers: Array<Handler> = []

    for (let i = 0; i < iterations; i++) {
      handlers.push(composeHandlersArray([first, second]))
    }

    retainedHandlers = handlers
    if (retainedHandlers.some((handler) => handler === second)) {
      throw new Error('Expected a wrapper when a user handler is present')
    }
  })
})
