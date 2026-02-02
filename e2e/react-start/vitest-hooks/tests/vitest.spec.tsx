import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { getIsomorphicEnv } from '../src/isomorphic'
import { Counter } from '../src/components/Counter'

/**
 * This test verifies that the tanstackStart() vite plugin works correctly
 * with Vitest without forcing us to disable the plugin entirely.
 *
 * Without the fix in PR #6074, optimizeDeps caused React to be pre-bundled
 * incorrectly, leading to "Invalid hook call" errors. Disabling the plugin
 * avoids that error, but then createIsomorphicFn() is never transformed and
 * becomes a no-op that returns undefined.
 *
 * The fix adds `process.env.VITEST !== 'true'` to disable optimizeDeps
 * in Vitest while keeping the plugin enabled, so hooks and createIsomorphicFn
 * both work as expected.
 */
describe('Vitest with tanstackStart() plugin', () => {
  it('renders a component using React hooks without errors', () => {
    // This test will fail with "Invalid hook call" or similar React errors
    // if optimizeDeps is incorrectly enabled in Vitest environment
    render(<Counter />)
    expect(screen.getByRole('button')).toHaveTextContent('Count: 0')
  })

  it('selects the client implementation for createIsomorphicFn()', () => {
    expect(getIsomorphicEnv()).toBe('client')
  })
})
