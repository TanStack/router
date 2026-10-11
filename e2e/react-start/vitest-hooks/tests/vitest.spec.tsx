import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { getIsomorphicEnv } from '../src/isomorphic'
import { Counter } from '../src/components/Counter'

/**
 * Keep the Start plugin enabled so this fixture covers both React hooks
 * and the client-side createIsomorphicFn() transform in Vitest.
 */
describe('Vitest with tanstackStart() plugin', () => {
  it('renders a component using React hooks without errors', () => {
    render(<Counter />)
    expect(screen.getByRole('button')).toHaveTextContent('Count: 0')
  })

  it('selects the client implementation for createIsomorphicFn()', () => {
    expect(getIsomorphicEnv()).toBe('client')
  })
})
