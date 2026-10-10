const $$splitComponentImporter = () =>
  import('exported-binding-private-constant.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent')
import { lazyRouteComponent } from '@tanstack/react-router'
import { createContext } from 'react'
import { createFileRoute } from '@tanstack/react-router'
const initialCount = 0
export const store = { count: initialCount }
const defaultTheme = 'light'
export const ThemeContext = createContext(defaultTheme)
export const Route = createFileRoute('/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
