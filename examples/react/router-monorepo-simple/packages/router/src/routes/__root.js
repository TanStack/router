import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import { Link, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({
  notFoundComponent: () => {
    return _jsxs('div', {
      children: [
        _jsx('p', {
          children: 'This is the notFoundComponent configured on root route',
        }),
        _jsx(Link, { to: '/', children: 'Start Over' }),
      ],
    })
  },
})
