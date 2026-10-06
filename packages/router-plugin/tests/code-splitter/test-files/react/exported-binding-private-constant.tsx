import { createContext, useContext } from 'react'
import { createFileRoute } from '@tanstack/react-router'

const initialCount = 0

export const store = { count: initialCount }

const defaultTheme = 'light'

export const ThemeContext = createContext(defaultTheme)

function Page() {
  const theme = useContext(ThemeContext)
  store.count++
  return (
    <p>
      {store.count - initialCount} {theme === defaultTheme ? 'default' : theme}
    </p>
  )
}

export const Route = createFileRoute('/')({ component: Page })
