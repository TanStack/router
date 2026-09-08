import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(cleanup)

test.each([false, true])(
  'active links preserve styling while disabled changes (masked=%s)',
  async (masked) => {
    const root = createRootRoute()
    const router = createRouter({
      routeTree: root.addChildren([
        createRoute({ getParentRoute: () => root, path: '/active' }),
      ]),
      history: createMemoryHistory({ initialEntries: ['/active'] }),
    })
    await router.load()
    const activeProps = {
      className: 'active-state',
      href: 'javascript:active()',
    }
    const content = (disabled: boolean) => (
      <RouterContextProvider router={router}>
        <Link
          to="/active"
          mask={masked ? { to: '/masked' } : undefined}
          disabled={disabled}
          activeProps={activeProps}
        >
          Target
        </Link>
      </RouterContextProvider>
    )
    const view = render(content(false))
    for (const disabled of [false, true, false]) {
      view.rerender(content(disabled))
      const anchor = view.getByText('Target')
      expect(anchor).toHaveClass('active-state')
      expect(anchor).toHaveAttribute('aria-current', 'page')
      if (disabled) {
        expect(anchor).not.toHaveAttribute('href')
        expect(anchor).toHaveAttribute('aria-disabled', 'true')
      } else {
        expect(anchor).toHaveAttribute('href', masked ? '/masked' : '/active')
        expect(anchor).not.toHaveAttribute('aria-disabled')
      }
    }
  },
)
