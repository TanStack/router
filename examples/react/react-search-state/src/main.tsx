import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  createBrowserHistory,
  configureSearchState,
  useSearchState,
  localPersister,
  useLocalDefaultValue,
  Updater,
  functionalUpdate,
} from '@tanstack/react-search-state'

// Set up your types
declare module '@tanstack/react-search-state' {
  interface SearchParams {
    project?: string
    mode?: string
    search?: string
  }
}

const history = createBrowserHistory()

configureSearchState({
  history,
})

function useDebouncedCallback<T>(value: T, cb: (value: T) => void) {
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout>>(null!)

  React.useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      cb(value)
    }, 500)

    return () => {
      clearTimeout(timeoutRef.current)
    }
  }, [value])
}

function App() {
  const projectState = useSearchState({
    key: 'project',
    useDefaultValue: () => 'Nozzle',
    writeDefault: true,
    // defaultReplace: true,
  })

  const modeState = useSearchState({
    key: 'mode',
    useDeps: () => [projectState.state],
    useDefaultValue: useLocalDefaultValue(() => 'users'),
    writeDefault: true,
    usePersister: localPersister,
    defaultReplace: true,
  })

  const searchState = useSearchState({
    key: 'search',
    useDeps: () => [projectState.state, modeState.state],
    useDefaultValue: useLocalDefaultValue(() => ''),
    usePersister: localPersister,
    // defaultReplace: true,
  })

  const [search, setSearch] = React.useState(searchState.state)

  React.useEffect(() => {
    setSearch(searchState.state)
  }, [searchState.state])

  useDebouncedCallback(search, (value) => {
    searchState.setState(value)
  })

  return (
    <div className="p-4 space-y-2">
      <div className="flex items-center gap-2">
        <select
          name="project"
          value={projectState.state}
          className="border border-gray-500 rounded p-1"
          onChange={(e) => {
            projectState.setState(e.currentTarget.value)
          }}
        >
          {[
            { value: 'Nozzle', label: 'Nozzle' },
            { value: 'TanStack', label: 'TanStack' },
            { value: 'Stately AI', label: 'Stately AI' },
          ].map((item) => {
            return (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            )
          })}
        </select>
      </div>

      <div className="flex items-center gap-2">
        {[
          { value: 'users', label: 'Users' },
          { value: 'teams', label: 'Teams' },
          { value: 'goals', label: 'Goals' },
        ].map((item) => {
          const isActive = item.value === modeState.state

          return (
            <button
              key={item.value}
              className={`px-2 py-1 rounded ${
                isActive
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-500/20 text-black'
              }}`}
              type="button"
              value={item.value}
              onClick={() => {
                modeState.setState(item.value)
              }}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      <div>
        <input
          value={search || ''}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-500 rounded p-1"
          placeholder="Type Something..."
        />
      </div>
    </div>
  )
}

const root = ReactDOM.createRoot(document.getElementById('app')!)
root.render(<App />)
