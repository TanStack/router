import { store, ThemeContext } from 'exported-binding-private-constant.tsx'
import { useContext } from 'react'
const initialCount = 0
const defaultTheme = 'light'
function Page() {
  const theme = useContext(ThemeContext)
  store.count++
  return (
    <p>
      {store.count - initialCount} {theme === defaultTheme ? 'default' : theme}
    </p>
  )
}
export { Page as component }
