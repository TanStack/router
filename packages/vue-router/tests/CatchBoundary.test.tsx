import { afterEach, expect, test, vi } from 'vitest'
import * as Vue from 'vue'
import { cleanup, fireEvent, render, screen } from '@testing-library/vue'
import { CatchBoundary } from '../src'
import type { ErrorComponentProps } from '../src'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const unmountHooks = [
  ['before unmount', Vue.onBeforeUnmount],
  ['after unmount', Vue.onUnmounted],
] as const

test.each(unmountHooks)(
  'keeps ownership of errors thrown by the failed child tree %s hook',
  async (_, onUnmount) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const shouldThrow = Vue.ref(false)
    const cleanupChild = vi.fn(() => {
      throw new Error('child cleanup failed')
    })
    const innerCatch = vi.fn()
    const Child = Vue.defineComponent({
      setup() {
        onUnmount(cleanupChild)
        return () => {
          if (shouldThrow.value) {
            throw new Error('child render failed')
          }
          return Vue.h('p', null, 'child content')
        }
      },
    })
    const InnerError = (props: ErrorComponentProps) => (
      <p>inner: {props.error.message}</p>
    )
    const OuterError = (props: ErrorComponentProps) => (
      <p role="alert">outer: {props.error.message}</p>
    )
    const App = Vue.defineComponent({
      setup() {
        return () =>
          CatchBoundary({
            getResetKey: () => 0,
            errorComponent: OuterError,
            children: CatchBoundary({
              getResetKey: () => 0,
              errorComponent: InnerError,
              onCatch: innerCatch,
              children: Vue.h(Child),
            }),
          })
      },
    })

    render(<App />)
    expect(await screen.findByText('child content')).toBeInTheDocument()

    shouldThrow.value = true

    expect(
      await screen.findByText('inner: child render failed'),
    ).toBeInTheDocument()
    expect(cleanupChild).toHaveBeenCalledOnce()
    expect(innerCatch).toHaveBeenCalledOnce()
    expect(innerCatch.mock.calls[0]![0]).toMatchObject({
      message: 'child render failed',
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  },
)

test.each(unmountHooks)(
  'propagates errors thrown by the fallback %s hook during reset',
  async (_, onUnmount) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const shouldThrow = Vue.ref(true)
    const cleanupFallback = vi.fn(() => {
      throw new Error('fallback cleanup failed')
    })
    const Child = Vue.defineComponent({
      setup() {
        return () => {
          if (shouldThrow.value) {
            throw new Error('child render failed')
          }
          return Vue.h('p', null, 'child content')
        }
      },
    })
    const InnerError = Vue.defineComponent({
      props: {
        error: { type: Error, required: true },
        reset: { type: Function, required: true },
      },
      setup(props) {
        onUnmount(cleanupFallback)
        return () =>
          Vue.h(
            'button',
            {
              onClick: () => {
                shouldThrow.value = false
                props.reset()
              },
            },
            `inner: ${props.error.message}`,
          )
      },
    })
    const OuterError = (props: ErrorComponentProps) => (
      <p role="alert">outer: {props.error.message}</p>
    )
    const App = Vue.defineComponent({
      setup() {
        return () =>
          CatchBoundary({
            getResetKey: () => 0,
            errorComponent: OuterError,
            children: CatchBoundary({
              getResetKey: () => 0,
              errorComponent: InnerError,
              children: Vue.h(Child),
            }),
          })
      },
    })

    render(<App />)
    await fireEvent.click(
      await screen.findByRole('button', { name: 'inner: child render failed' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'outer: fallback cleanup failed',
    )
    expect(cleanupFallback).toHaveBeenCalledOnce()
  },
)
