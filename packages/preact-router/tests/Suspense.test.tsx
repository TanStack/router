import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/preact'
import { Component } from 'preact'
import { Suspense as PreactSuspense } from 'preact-suspense'
import { Suspense } from '../src'

afterEach(() => {
  cleanup()
})

describe('Suspense', () => {
  test('re-exports Suspense from preact-suspense', () => {
    expect(Suspense).toBe(PreactSuspense)
  })

  test('renders children when no promise is thrown', () => {
    render(
      <Suspense fallback={<div>Loading...</div>}>
        <div>Content</div>
      </Suspense>,
    )

    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  test('renders fallback when a promise is thrown', async () => {
    let resolve!: () => void
    const promise = new Promise<void>((r) => {
      resolve = r
    })

    function ThrowsPromise() {
      throw promise
    }

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <ThrowsPromise />
      </Suspense>,
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()

    await act(async () => {
      resolve()
      await promise
    })

    // After resolve, fallback should go away (children re-render)
    // Note: The component will re-render and throw again if it still throws,
    // but for this test the promise is resolved so componentDidCatch won't be triggered again
  })

  test('renders fallback as null when no fallback prop is provided', () => {
    let resolve!: () => void
    const promise = new Promise<void>((r) => {
      resolve = r
    })

    function ThrowsPromise() {
      throw promise
    }

    const { container } = render(
      <Suspense>
        <ThrowsPromise />
      </Suspense>,
    )

    // No fallback, so nothing is rendered
    expect(container.innerHTML).toBe('')

    resolve()
  })

  test('re-renders children after promise resolves', async () => {
    let shouldThrow = true
    let resolve!: () => void
    const promise = new Promise<void>((r) => {
      resolve = r
    })

    function MaybeThrows() {
      if (shouldThrow) {
        throw promise
      }
      return <div>Resolved Content</div>
    }

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <MaybeThrows />
      </Suspense>,
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()

    shouldThrow = false
    await act(async () => {
      resolve()
      await promise
    })

    expect(screen.getByText('Resolved Content')).toBeInTheDocument()
  })

  test('rethrows non-promise errors', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    class ErrorCatcher extends Component<
      { children: any },
      { error: string | null }
    > {
      state = { error: null as string | null }
      componentDidCatch(err: any) {
        this.setState({ error: err.message })
      }
      render() {
        if (this.state.error) {
          return <div>Error: {this.state.error}</div>
        }
        return this.props.children
      }
    }

    function ThrowsError(): any {
      throw new Error('Not a promise')
    }

    render(
      <ErrorCatcher>
        <Suspense fallback={<div>Loading...</div>}>
          <ThrowsError />
        </Suspense>
      </ErrorCatcher>,
    )

    expect(screen.getByText('Error: Not a promise')).toBeInTheDocument()

    spy.mockRestore()
  })
})
