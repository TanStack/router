import { lazy } from 'react'
import { defineEntries } from 'waku/server'

const App = lazy(() => import('./components/App.js'))

export default defineEntries(
  // renderEntries
  async (input) => {
    return {
      App: <App name={input || 'Waku'} />,
    }
  },
  // getBuildConfig
  async () => {
    return {
      '/': {
        entries: [['']],
      },
    }
  },
  // getSsrConfig
  async (pathStr) => {
    const { pathname } = new URL(pathStr, 'http://localhost')
    switch (pathname) {
      case '/':
        return {
          input: '',
          unstable_render: ({ createElement, Slot }) =>
            createElement(Slot, { id: 'App' }),
        }
      default:
        return null
    }
  },
)
