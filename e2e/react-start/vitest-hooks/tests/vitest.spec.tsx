import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Counter } from '../src/components/Counter'

/**
 * This test verifies that the tanstackStart() vite plugin works correctly
 * with Vitest. Without the fix in PR #6074, the optimizeDeps configuration
 * would cause React to be pre-bundled incorrectly, leading to "Invalid hook
 * call" errors when rendering components that use React hooks.
 *
 * The fix adds `process.env.VITEST !== 'true'` to disable optimizeDeps
 * in Vitest environments.
 */
describe('Vitest with tanstackStart() plugin', () => {
  it('renders a component using React hooks without errors', () => {
    // This test will fail with "Invalid hook call" or similar React errors
    // if optimizeDeps is incorrectly enabled in Vitest environment
    render(<Counter />)
    expect(screen.getByRole('button')).toHaveTextContent('Count: 0')
  })
})
